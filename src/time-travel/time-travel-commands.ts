/**
 * Time Travel Commands
 *
 * Obsidian commands for viewing historical document snapshots.
 */

import { App, Modal, Notice, Setting, setIcon, MarkdownView, WorkspaceLeaf } from 'obsidian';
import type LabeledAnnotations from '../main';
import type { IGitService, GitCommitEntry } from '../git/git-service';
import type { DocumentSnapshot, TimeTravelSettings } from './time-travel-types';
import { toDocumentSnapshot, DEFAULT_TIME_TRAVEL_SETTINGS } from './time-travel-types';
import { TIME_TRAVEL_VIEW_TYPE } from './time-travel-view';

// =============================================================================
// SESSION TRACKING
// =============================================================================

/**
 * Track Time Travel tabs opened in the current session.
 * Used for group-close behavior.
 */
let currentSessionLeaves: WeakSet<WorkspaceLeaf> = new WeakSet();
let isClosingAll = false;

// =============================================================================
// COMMAND REGISTRATION
// =============================================================================

/**
 * Register all Time Travel commands
 */
export function registerTimeTravelCommands(
    plugin: LabeledAnnotations,
    gitService: IGitService,
): void {
    // Main Time Travel command
    plugin.addCommand({
        id: 'doc-doctor:time-travel',
        name: 'Time Travel: View document history',
        icon: 'clock',
        callback: () => openTimeTravelCommand(plugin, gitService),
    });

    // Close all Time Travel tabs
    plugin.addCommand({
        id: 'doc-doctor:time-travel-close-all',
        name: 'Time Travel: Close all snapshot tabs',
        icon: 'x',
        callback: () => closeAllTimeTravelTabs(plugin),
    });
}

// =============================================================================
// MAIN COMMAND
// =============================================================================

/**
 * Open Time Travel view for the active document (or close if already open)
 */
async function openTimeTravelCommand(
    plugin: LabeledAnnotations,
    gitService: IGitService,
): Promise<void> {
    // Check if Time Travel is already active - if so, toggle it off
    const existingLeaves = plugin.app.workspace.getLeavesOfType(TIME_TRAVEL_VIEW_TYPE);
    if (existingLeaves.length > 0) {
        console.debug('[Time Travel] Toggle OFF - closing existing Time Travel tabs');
        await closeAllTimeTravelTabs(plugin);
        return;
    }

    // Get active file
    const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
        new Notice('No active markdown file');
        return;
    }

    const documentPath = view.file.path;
    console.debug('[Time Travel] Toggle ON - opening Time Travel for:', documentPath);

    // Check git availability
    const availability = await gitService.isAvailable();
    if (!availability.available) {
        new Notice(availability.error || 'Git not available');
        return;
    }

    // Get Time Travel settings
    const settings = getTimeTravelSettings(plugin);
    if (!settings.enabled) {
        new Notice('Time Travel is disabled in settings');
        return;
    }

    // Fetch file history
    const historyResult = await gitService.getFileHistory(documentPath, {
        limit: settings.maxSnapshots,
        milestoneOnly: settings.granularity === 'milestones',
    });

    if (!historyResult.success) {
        new Notice(historyResult.error || 'Failed to get history');
        return;
    }

    if (historyResult.commits.length === 0) {
        const msg =
            settings.granularity === 'milestones'
                ? 'No milestone commits found. Try changing to "all-commits" mode.'
                : 'No git history found for this file.';
        new Notice(msg);
        return;
    }

    // Convert to snapshots
    const snapshots = historyResult.commits.map(commit =>
        toDocumentSnapshot(commit, documentPath),
    );

    // Auto-open mode: skip modal and open all snapshots directly
    if (settings.autoOpen) {
        await openSnapshotTabs(plugin, gitService, snapshots, documentPath);
        return;
    }

    // Open selection modal
    new TimeTravelSelectionModal(plugin.app, plugin, gitService, snapshots, documentPath).open();
}

// =============================================================================
// SELECTION MODAL
// =============================================================================

/**
 * Modal for selecting historical snapshots to view
 */
class TimeTravelSelectionModal extends Modal {
    private plugin: LabeledAnnotations;
    private gitService: IGitService;
    private snapshots: DocumentSnapshot[];
    private documentPath: string;
    private selectedSnapshots: Set<string> = new Set();
    private listEl: HTMLElement | null = null;

    constructor(
        app: App,
        plugin: LabeledAnnotations,
        gitService: IGitService,
        snapshots: DocumentSnapshot[],
        documentPath: string,
    ) {
        super(app);
        this.plugin = plugin;
        this.gitService = gitService;
        this.snapshots = snapshots;
        this.documentPath = documentPath;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass('time-travel-modal');

        // Header
        contentEl.createEl('h2', { text: 'Time Travel' });

        // Description
        const desc = contentEl.createDiv({ cls: 'time-travel-modal-description' });
        desc.setText(
            `Found ${this.snapshots.length} snapshot${this.snapshots.length === 1 ? '' : 's'}. Select which to view.`,
        );

        // Content area
        const content = contentEl.createDiv({ cls: 'time-travel-modal-content' });

        // Snapshot list
        this.listEl = content.createDiv({ cls: 'time-travel-snapshot-list' });
        this.renderSnapshotList();

        // Footer
        const footer = contentEl.createDiv({ cls: 'time-travel-modal-footer' });

        // Selection count
        const countEl = footer.createSpan({ cls: 'time-travel-selection-count' });
        countEl.setText('0 selected');

        // Actions
        const actions = footer.createDiv({ cls: 'time-travel-modal-actions' });

        // Select All button
        new Setting(actions)
            .addButton(btn => {
                btn.setButtonText('Select All')
                    .onClick(() => {
                        this.snapshots.forEach(s => this.selectedSnapshots.add(s.id));
                        this.renderSnapshotList();
                        this.updateSelectionCount(countEl);
                    });
            });

        // Open button
        new Setting(actions)
            .addButton(btn => {
                btn.setButtonText('Open Selected')
                    .setCta()
                    .onClick(() => this.openSelected());
            });
    }

    private renderSnapshotList(): void {
        if (!this.listEl) return;
        this.listEl.empty();

        for (const snapshot of this.snapshots) {
            const isSelected = this.selectedSnapshots.has(snapshot.id);

            const item = this.listEl.createDiv({
                cls: `time-travel-snapshot-item ${isSelected ? 'is-selected' : ''}`,
            });

            // Checkbox
            const checkbox = item.createEl('input', {
                type: 'checkbox',
                cls: 'time-travel-snapshot-checkbox',
            });
            checkbox.checked = isSelected;
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    this.selectedSnapshots.add(snapshot.id);
                } else {
                    this.selectedSnapshots.delete(snapshot.id);
                }
                item.toggleClass('is-selected', checkbox.checked);
                this.updateSelectionCount(
                    this.contentEl.querySelector('.time-travel-selection-count') as HTMLElement,
                );
            });

            // Info section
            const info = item.createDiv({ cls: 'time-travel-snapshot-info' });

            // Date
            const date = new Date(snapshot.timestamp * 1000);
            info.createDiv({
                cls: 'time-travel-snapshot-date',
                text: date.toLocaleString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                }),
            });

            // Commit message
            info.createDiv({
                cls: 'time-travel-snapshot-message',
                text: snapshot.commitMessage,
            });

            // Meta row (SHA + milestone badge)
            const meta = info.createDiv({ cls: 'time-travel-snapshot-meta' });

            meta.createSpan({
                cls: 'time-travel-snapshot-sha',
                text: snapshot.commitSha.substring(0, 7),
            });

            if (snapshot.isMilestoneSnapshot) {
                const badge = meta.createSpan({ cls: 'time-travel-snapshot-milestone-tag' });
                setIcon(badge.createSpan(), 'milestone');
                badge.createSpan({ text: 'milestone' });
            }

            // Click on item toggles selection
            item.addEventListener('click', (e) => {
                if ((e.target as HTMLElement).tagName !== 'INPUT') {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change'));
                }
            });
        }
    }

    private updateSelectionCount(el: HTMLElement): void {
        if (el) {
            const count = this.selectedSnapshots.size;
            el.setText(`${count} selected`);
        }
    }

    private async openSelected(): Promise<void> {
        if (this.selectedSnapshots.size === 0) {
            new Notice('Select at least one snapshot');
            return;
        }

        // Get selected snapshots in order
        const selected = this.snapshots.filter(s => this.selectedSnapshots.has(s.id));

        // Close modal
        this.close();

        // Open tabs
        await openSnapshotTabs(this.plugin, this.gitService, selected, this.documentPath);
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

// =============================================================================
// TAB MANAGEMENT
// =============================================================================

/**
 * Open multiple snapshot tabs
 */
async function openSnapshotTabs(
    plugin: LabeledAnnotations,
    gitService: IGitService,
    snapshots: DocumentSnapshot[],
    documentPath?: string,
): Promise<void> {
    const settings = getTimeTravelSettings(plugin);

    // Reset session tracking for new batch
    currentSessionLeaves = new WeakSet();
    const openedLeaves: WorkspaceLeaf[] = [];

    // Enable focus mode if configured
    if (settings.focusMode && documentPath) {
        enableFocusMode(plugin, documentPath);
    }

    // Fetch content for each snapshot and open tab
    let openedCount = 0;
    for (const snapshot of snapshots) {
        // Fetch content from git
        const contentResult = await gitService.getContentAtCommit(
            snapshot.documentPath,
            snapshot.commitSha,
        );

        if (!contentResult.success) {
            new Notice(`Failed to load snapshot ${snapshot.commitSha.substring(0, 7)}`);
            continue;
        }

        // Update snapshot with content
        const snapshotWithContent: DocumentSnapshot = {
            ...snapshot,
            content: contentResult.content,
        };

        // Open in new tab
        const leaf = plugin.app.workspace.getLeaf('tab');
        await leaf.setViewState({
            type: TIME_TRAVEL_VIEW_TYPE,
            state: { snapshot: snapshotWithContent },
            active: openedCount === 0, // Activate first tab
        });

        // Track this leaf for group-close
        currentSessionLeaves.add(leaf);
        openedLeaves.push(leaf);

        openedCount++;
    }

    // Enable stacked tabs mode if configured and we have multiple tabs
    if (settings.useStackedTabs && openedCount > 1) {
        enableStackedTabs(plugin, openedLeaves);
    }

    if (openedCount > 0) {
        new Notice(`Opened ${openedCount} snapshot${openedCount === 1 ? '' : 's'}`);
    }
}

/** Track if we enabled stacked tabs so we can revert */
let wasStackedBeforeTimeTravel = false;
let timeTravelTabGroup: any = null;
let usedCommandFallback = false;
let pluginForRevert: LabeledAnnotations | null = null;

/** Track hidden leaves for focus mode */
let hiddenLeavesBefore: WorkspaceLeaf[] = [];
let focusModeActive = false;
let sourceDocumentPath: string | null = null;

/**
 * Enable stacked tabs mode for the opened leaves
 *
 * This uses Obsidian's internal API to enable stacked tabs on the tab group.
 */
function enableStackedTabs(plugin: LabeledAnnotations, leaves: WorkspaceLeaf[]): void {
    if (leaves.length === 0) return;

    try {
        // Get the parent tab group of the first leaf
        const firstLeaf = leaves[0];
        // Access the parent which is a WorkspaceTabs instance
        const parent = (firstLeaf as any).parent;

        console.debug('[Time Travel] enableStackedTabs:', {
            hasParent: !!parent,
            parentType: parent?.constructor?.name,
            hasStackedProp: parent ? 'stacked' in parent : false,
            currentlyStacked: parent?.stacked,
        });

        if (parent && 'stacked' in parent) {
            // Remember the previous state
            wasStackedBeforeTimeTravel = !!parent.stacked;
            timeTravelTabGroup = parent;

            console.debug('[Time Travel] Previous stacked state:', wasStackedBeforeTimeTravel);

            // Check if not already stacked
            if (!parent.stacked) {
                // Set stacked mode on the tab group
                parent.stacked = true;
                console.debug('[Time Travel] Set stacked = true');

                // Trigger layout update if available
                if (typeof parent.recomputeChildrenDimensions === 'function') {
                    parent.recomputeChildrenDimensions();
                    console.debug('[Time Travel] Called recomputeChildrenDimensions');
                }
                if (typeof parent.onResize === 'function') {
                    parent.onResize();
                    console.debug('[Time Travel] Called onResize');
                }
            }
        } else {
            console.debug('[Time Travel] Parent does not have stacked property, trying command');
            // Fallback: try the command approach
            const commands = (plugin.app as any).commands;
            console.debug('[Time Travel] Commands object:', {
                hasCommands: !!commands,
                hasExecute: typeof commands?.executeCommandById,
            });
            if (commands && typeof commands.executeCommandById === 'function') {
                // Track that we're using the command fallback so we can revert later
                usedCommandFallback = true;
                pluginForRevert = plugin;
                wasStackedBeforeTimeTravel = false; // We're enabling it, so it wasn't stacked before

                // IMPORTANT: Store the parent reference NOW, before executing the command
                // We'll use this to revert stacked mode later
                timeTravelTabGroup = parent;
                console.debug('[Time Travel] Stored tab group reference for later revert');

                commands.executeCommandById('workspace:toggle-stacked-tabs');
                console.debug('[Time Travel] Executed toggle-stacked-tabs command (fallback mode)');
            }
        }
    } catch (e) {
        console.error('[Time Travel] Error enabling stacked tabs:', e);
    }
}

/**
 * Revert stacked tabs mode if we enabled it
 */
function revertStackedTabs(): void {
    console.debug('[Time Travel] revertStackedTabs called:', {
        hasTimeTravelTabGroup: !!timeTravelTabGroup,
        wasStackedBefore: wasStackedBeforeTimeTravel,
        usedCommandFallback,
        hasPluginForRevert: !!pluginForRevert,
    });

    // We need to toggle stacked tabs off, but only if we enabled it
    if (!wasStackedBeforeTimeTravel && pluginForRevert) {
        // Capture plugin reference before it gets reset
        const plugin = pluginForRevert;

        try {
            console.debug('[Time Travel] Need to revert stacked tabs');

            // Find any leaf in the main workspace to ensure we have the right context
            let targetLeaf: WorkspaceLeaf | null = null;
            plugin.app.workspace.iterateAllLeaves((leaf) => {
                if (!targetLeaf) {
                    const root = leaf.getRoot();
                    if (root === plugin.app.workspace.rootSplit) {
                        targetLeaf = leaf;
                    }
                }
            });

            if (targetLeaf) {
                console.debug('[Time Travel] Found target leaf, activating it');
                plugin.app.workspace.setActiveLeaf(targetLeaf, { focus: false });

                // Small delay to ensure the leaf is active before toggling
                setTimeout(() => {
                    try {
                        const commands = (plugin.app as any).commands;
                        if (commands && typeof commands.executeCommandById === 'function') {
                            commands.executeCommandById('workspace:toggle-stacked-tabs');
                            console.debug('[Time Travel] Executed toggle-stacked-tabs command to disable');
                        }
                    } catch (e) {
                        console.debug('[Time Travel] Error in setTimeout callback:', e);
                    }
                }, 50);
            } else {
                console.debug('[Time Travel] No target leaf found in main workspace');
            }
        } catch (e) {
            console.debug('[Time Travel] Error reverting stacked tabs:', e);
        }
    } else {
        console.debug('[Time Travel] No revert needed (wasStackedBefore:', wasStackedBeforeTimeTravel, ')');
    }

    // Reset tracking variables
    timeTravelTabGroup = null;
    usedCommandFallback = false;
    pluginForRevert = null;
}

/** Stored leaf states for focus mode restoration */
interface StoredLeafState {
    type: string;
    state: any;
}
let storedLeafStates: StoredLeafState[] = [];

/**
 * Enable focus mode - close all tabs except source document
 * Stores their states for restoration when Time Travel ends
 */
function enableFocusMode(plugin: LabeledAnnotations, documentPath: string): void {
    if (focusModeActive) return;

    console.debug('[Time Travel] Enabling focus mode for:', documentPath);
    sourceDocumentPath = documentPath;
    storedLeafStates = [];

    // Get all leaves in the main workspace area
    const rootLeaves: WorkspaceLeaf[] = [];
    plugin.app.workspace.iterateAllLeaves((leaf) => {
        // Only consider leaves in the main editor area (not sidebars)
        const root = leaf.getRoot();
        if (root === plugin.app.workspace.rootSplit) {
            rootLeaves.push(leaf);
        }
    });

    console.debug('[Time Travel] Found', rootLeaves.length, 'leaves in main area');

    for (const leaf of rootLeaves) {
        // Keep the source document visible
        const viewType = leaf.view?.getViewType();
        const file = (leaf.view as any)?.file;

        if (file?.path === documentPath) {
            console.debug('[Time Travel] Keeping source document:', documentPath);
            continue;
        }

        // Store the leaf state for restoration
        try {
            const state = leaf.getViewState();
            if (state.type && state.type !== 'empty') {
                storedLeafStates.push({
                    type: state.type,
                    state: state.state,
                });
                console.debug('[Time Travel] Stored state for:', state.type, file?.path || '');

                // Detach the leaf
                leaf.detach();
            }
        } catch (e) {
            console.debug('[Time Travel] Error storing leaf state:', e);
        }
    }

    focusModeActive = true;
    console.debug('[Time Travel] Focus mode enabled, stored', storedLeafStates.length, 'leaf states');
}

/**
 * Revert focus mode - restore previously closed tabs
 */
async function revertFocusMode(plugin: LabeledAnnotations): Promise<void> {
    if (!focusModeActive) return;

    console.debug('[Time Travel] Reverting focus mode, restoring', storedLeafStates.length, 'leaves');

    // Restore each stored leaf state
    for (const stored of storedLeafStates) {
        try {
            const leaf = plugin.app.workspace.getLeaf('tab');
            await leaf.setViewState({
                type: stored.type,
                state: stored.state,
                active: false,
            });
        } catch (e) {
            console.debug('[Time Travel] Error restoring leaf:', e);
        }
    }

    storedLeafStates = [];
    focusModeActive = false;
    sourceDocumentPath = null;
}

/**
 * Close all Time Travel view tabs
 */
export async function closeAllTimeTravelTabs(plugin: LabeledAnnotations, silent = false): Promise<void> {
    if (isClosingAll) return; // Prevent recursive calls

    isClosingAll = true;
    const leaves = plugin.app.workspace.getLeavesOfType(TIME_TRAVEL_VIEW_TYPE);
    let closedCount = 0;

    console.debug('[Time Travel] closeAllTimeTravelTabs:', { leafCount: leaves.length });

    for (const leaf of leaves) {
        leaf.detach();
        closedCount++;
    }

    // Revert stacked tabs if we enabled it
    const settings = getTimeTravelSettings(plugin);
    if (settings.useStackedTabs) {
        revertStackedTabs();
    }

    // Revert focus mode if it was enabled
    if (settings.focusMode) {
        await revertFocusMode(plugin);
    }

    isClosingAll = false;

    if (closedCount > 0 && !silent) {
        new Notice(`Closed ${closedCount} snapshot tab${closedCount === 1 ? '' : 's'}`);
    }
}

/**
 * Handle closing behavior when a Time Travel tab is closed.
 * Called from TimeTravelView.onClose()
 */
export function handleTimeTravelTabClose(plugin: LabeledAnnotations, closingLeaf: WorkspaceLeaf): void {
    // Skip if we're already in the process of closing all
    if (isClosingAll) return;

    const settings = getTimeTravelSettings(plugin);

    // If close-all behavior is enabled, close all other Time Travel tabs
    if (settings.closeBehavior === 'close-all') {
        // Small delay to let the current close complete
        setTimeout(() => {
            closeAllTimeTravelTabs(plugin, true);
        }, 50);
    } else {
        // Even if not close-all, check if this was the last Time Travel tab
        // and revert stacked tabs if needed
        setTimeout(() => {
            checkAndRevertStackedTabsIfEmpty(plugin);
        }, 50);
    }
}

/**
 * Check if all Time Travel tabs are closed and revert stacked mode if so
 */
function checkAndRevertStackedTabsIfEmpty(plugin: LabeledAnnotations): void {
    const remainingLeaves = plugin.app.workspace.getLeavesOfType(TIME_TRAVEL_VIEW_TYPE);

    console.debug('[Time Travel] checkAndRevertStackedTabsIfEmpty:', {
        remainingCount: remainingLeaves.length,
        hasTimeTravelTabGroup: !!timeTravelTabGroup,
        wasStackedBefore: wasStackedBeforeTimeTravel,
    });

    // If no Time Travel tabs remain, revert stacked tabs and focus mode
    if (remainingLeaves.length === 0) {
        const settings = getTimeTravelSettings(plugin);

        if (settings.useStackedTabs) {
            revertStackedTabs();
        }

        if (settings.focusMode && focusModeActive) {
            revertFocusMode(plugin);
        }
    }
}

/**
 * Check if closing all tabs is in progress
 */
export function isClosingAllTabs(): boolean {
    return isClosingAll;
}

// =============================================================================
// SETTINGS HELPERS
// =============================================================================

/**
 * Get Time Travel settings from plugin
 */
function getTimeTravelSettings(plugin: LabeledAnnotations): TimeTravelSettings {
    const settings = plugin.settings.getValue();
    return settings.timeTravel || DEFAULT_TIME_TRAVEL_SETTINGS;
}

// =============================================================================
// EXPORTS
// =============================================================================

export { TIME_TRAVEL_VIEW_TYPE };
