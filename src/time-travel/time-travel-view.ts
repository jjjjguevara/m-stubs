/**
 * Time Travel View
 *
 * Custom ItemView for displaying historical document snapshots.
 * Renders markdown content in read-only mode with metadata header.
 */

import { ItemView, WorkspaceLeaf, MarkdownRenderer, setIcon, parseYaml } from 'obsidian';
import type LabeledAnnotations from '../main';
import type { DocumentSnapshot, TimeTravelViewState, TabTitleComponent, TabTitleComponentConfig } from './time-travel-types';
import { handleTimeTravelTabClose } from './time-travel-commands';

// =============================================================================
// VIEW TYPE CONSTANT
// =============================================================================

export const TIME_TRAVEL_VIEW_TYPE = 'doc-doctor-time-travel';

// =============================================================================
// TIME TRAVEL VIEW
// =============================================================================

export class TimeTravelView extends ItemView {
    private plugin: LabeledAnnotations;
    private snapshot: DocumentSnapshot;
    private headerEl: HTMLElement | null = null;
    private contentAreaEl: HTMLElement | null = null;

    icon = 'clock';

    constructor(
        leaf: WorkspaceLeaf,
        plugin: LabeledAnnotations,
        snapshot: DocumentSnapshot,
    ) {
        super(leaf);
        this.plugin = plugin;
        this.snapshot = snapshot;
    }

    getViewType(): string {
        return TIME_TRAVEL_VIEW_TYPE;
    }

    getDisplayText(): string {
        // Guard against missing or uninitialized snapshot
        // The view is created with an empty snapshot (timestamp=0) before setState is called
        if (!this.snapshot || !this.snapshot.timestamp || this.snapshot.timestamp === 0) {
            console.debug('[Time Travel] getDisplayText: Snapshot not initialized yet', {
                hasSnapshot: !!this.snapshot,
                timestamp: this.snapshot?.timestamp,
            });
            return 'Loading snapshot...';
        }

        const settings = this.plugin.settings.getValue().timeTravel;

        // Debug logging for date issues
        console.debug('[Time Travel] getDisplayText called', {
            snapshotId: this.snapshot.id,
            timestamp: this.snapshot.timestamp,
            timestampDate: new Date(this.snapshot.timestamp * 1000).toISOString(),
            commitSha: this.snapshot.commitSha?.substring(0, 7),
        });

        // Use custom tab title format if enabled
        if (settings?.useCustomTabTitle && settings.tabTitleComponents) {
            return this.buildCustomTabTitle(settings.tabTitleComponents);
        }

        // Default format: document name + date + time
        const baseName = this.getBaseName();
        const formattedDate = this.formatDateWithTime();
        console.debug('[Time Travel] Default title:', `${baseName} @ ${formattedDate}`);
        return `${baseName} @ ${formattedDate}`;
    }

    /**
     * Build custom tab title from enabled components
     */
    private buildCustomTabTitle(
        components: TabTitleComponentConfig[],
    ): string {
        const parts: string[] = [];
        const settings = this.plugin.settings.getValue().timeTravel;

        for (const comp of components) {
            if (!comp.enabled) continue;

            switch (comp.type) {
                case 'documentName':
                    parts.push(this.getBaseName());
                    break;
                case 'date':
                    parts.push(this.formatShortDate());
                    break;
                case 'time':
                    parts.push(this.formatTime());
                    break;
                case 'sha':
                    parts.push(this.snapshot.commitSha.substring(0, 7));
                    break;
                case 'commitMessage': {
                    const msg = this.snapshot.commitMessage.substring(0, 25);
                    const truncated = this.snapshot.commitMessage.length > 25 ? '…' : '';
                    parts.push(`${msg}${truncated}`);
                    break;
                }
                case 'property': {
                    // Get property value from frontmatter
                    const propValue = this.getPropertyValue(comp.propertyKey);
                    if (propValue) {
                        parts.push(propValue);
                    }
                    break;
                }
            }
        }

        // Also include custom property keys if configured
        if (settings?.customPropertyKeys) {
            const propKeys = settings.customPropertyKeys
                .split(',')
                .map(k => k.trim())
                .filter(k => k.length > 0);

            for (const key of propKeys) {
                const value = this.getPropertyValue(key);
                if (value) {
                    parts.push(value);
                }
            }
        }

        return parts.length > 0 ? parts.join(' · ') : this.getBaseName();
    }

    /**
     * Get a property value from the snapshot's frontmatter
     */
    private getPropertyValue(key?: string): string | null {
        if (!key || !this.snapshot.content) return null;

        try {
            // Extract frontmatter
            const frontmatterMatch = this.snapshot.content.match(/^---\n([\s\S]*?)\n---/);
            if (!frontmatterMatch) return null;

            const frontmatter = parseYaml(frontmatterMatch[1]);
            if (!frontmatter || typeof frontmatter !== 'object') return null;

            const value = frontmatter[key];
            if (value === undefined || value === null) return null;

            // Convert to string, truncate if too long
            const strValue = String(value);
            if (strValue.length > 20) {
                return strValue.substring(0, 20) + '…';
            }
            return strValue;
        } catch (e) {
            // Failed to parse frontmatter
            return null;
        }
    }

    /**
     * Set view state (for deserialization)
     */
    async setState(state: TimeTravelViewState, result: { history: boolean }): Promise<void> {
        console.debug('[Time Travel] setState called', {
            hasSnapshot: !!state.snapshot,
            snapshotId: state.snapshot?.id,
            timestamp: state.snapshot?.timestamp,
            timestampDate: state.snapshot?.timestamp ? new Date(state.snapshot.timestamp * 1000).toISOString() : 'N/A',
        });
        if (state.snapshot) {
            this.snapshot = state.snapshot;
            await this.render();

            // Trigger all header updates - both tab and navigation headers
            this.updateAllHeaders();
        }
        return super.setState(state, result);
    }

    /**
     * Update all header elements (tab header + navigation header in stacked mode)
     */
    private updateAllHeaders(): void {
        const leafAny = this.leaf as any;
        const title = this.getDisplayText();

        // Update the standard tab header
        if (typeof leafAny.updateHeader === 'function') {
            leafAny.updateHeader();
        }

        // Update tab header inner title element directly
        if (leafAny.tabHeaderInnerTitleEl) {
            leafAny.tabHeaderInnerTitleEl.textContent = title;
        }

        // Update the view header title (navigation header in stacked tabs)
        const viewHeaderTitle = this.containerEl.closest('.workspace-leaf')?.querySelector('.view-header-title');
        if (viewHeaderTitle) {
            viewHeaderTitle.textContent = title;
        }

        // Also try updating via the parent's methods
        const parent = leafAny.parent;
        if (parent && typeof parent.updateLeafHeaders === 'function') {
            parent.updateLeafHeaders();
        }
        if (parent && typeof parent.recomputeChildrenDimensions === 'function') {
            parent.recomputeChildrenDimensions();
        }

        console.debug('[Time Travel] Updated all headers with title:', title);
    }

    /**
     * Get view state (for serialization)
     */
    getState(): TimeTravelViewState {
        return {
            snapshot: this.snapshot,
        };
    }

    async onOpen(): Promise<void> {
        this.containerEl.addClass('time-travel-view-container');
        await this.render();
    }

    async onClose(): Promise<void> {
        // Handle group-close behavior
        handleTimeTravelTabClose(this.plugin, this.leaf);
        this.containerEl.empty();
    }

    /**
     * Render the view
     */
    private async render(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('time-travel-view');

        // Render header
        this.renderHeader(container);

        // Render content
        await this.renderContent(container);
    }

    /**
     * Render the metadata header
     */
    private renderHeader(container: HTMLElement): void {
        this.headerEl = container.createDiv({ cls: 'time-travel-header' });

        // Top row: date and commit info
        const topRow = this.headerEl.createDiv({ cls: 'time-travel-header-top' });

        // Clock icon
        const iconEl = topRow.createSpan({ cls: 'time-travel-icon' });
        setIcon(iconEl, 'clock');

        // Date
        topRow.createEl('span', {
            cls: 'time-travel-date',
            text: this.formatFullDate(),
        });

        // Commit SHA (short)
        const shaEl = topRow.createEl('span', {
            cls: 'time-travel-sha',
            text: this.snapshot.commitSha.substring(0, 7),
        });
        shaEl.setAttribute('title', `Full SHA: ${this.snapshot.commitSha}`);

        // Commit message row
        const messageRow = this.headerEl.createDiv({ cls: 'time-travel-message-row' });
        messageRow.createEl('span', {
            cls: 'time-travel-message',
            text: this.snapshot.commitMessage,
        });

        // Author
        messageRow.createEl('span', {
            cls: 'time-travel-author',
            text: `by ${this.snapshot.author}`,
        });

        // Milestone badge (if applicable)
        if (this.snapshot.milestone) {
            const badgeRow = this.headerEl.createDiv({ cls: 'time-travel-badge-row' });
            const badge = badgeRow.createEl('span', { cls: 'time-travel-milestone-badge' });
            setIcon(badge.createSpan({ cls: 'badge-icon' }), 'milestone');
            badge.createSpan({ text: this.snapshot.milestone.name });
        }

        // Read-only warning banner
        const banner = this.headerEl.createDiv({ cls: 'time-travel-readonly-banner' });
        setIcon(banner.createSpan({ cls: 'banner-icon' }), 'alert-circle');
        banner.createSpan({ text: 'Historical snapshot (read-only)' });
    }

    /**
     * Render the document content
     */
    private async renderContent(container: HTMLElement): Promise<void> {
        // Use Obsidian's standard markdown preview classes for proper styling
        this.contentAreaEl = container.createDiv({
            cls: 'time-travel-content markdown-preview-view markdown-rendered',
        });

        if (!this.snapshot.content) {
            // No content available
            const errorEl = this.contentAreaEl.createDiv({ cls: 'time-travel-error' });
            setIcon(errorEl.createSpan({ cls: 'error-icon' }), 'alert-triangle');
            errorEl.createSpan({ text: 'Failed to load content for this snapshot' });
            return;
        }

        // Strip frontmatter for display (optional - could show it)
        const displayContent = this.stripFrontmatter(this.snapshot.content);

        // Render markdown using Obsidian's renderer
        await MarkdownRenderer.render(
            this.app,
            displayContent,
            this.contentAreaEl,
            this.snapshot.documentPath,
            this,
        );
    }

    /**
     * Strip YAML frontmatter from content
     */
    private stripFrontmatter(content: string): string {
        const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n/);
        if (frontmatterMatch) {
            return content.substring(frontmatterMatch[0].length);
        }
        return content;
    }

    /**
     * Get base filename without extension
     */
    private getBaseName(): string {
        return this.snapshot.documentPath.split('/').pop()?.replace('.md', '') || 'Snapshot';
    }

    /**
     * Format date as short string (e.g., "Dec 5")
     */
    private formatShortDate(): string {
        const date = new Date(this.snapshot.timestamp * 1000);
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    /**
     * Format time only (e.g., "2:30 PM")
     */
    private formatTime(): string {
        const date = new Date(this.snapshot.timestamp * 1000);
        return date.toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    /**
     * Format date with time for default tab title (e.g., "Dec 5, 2:30 PM")
     */
    private formatDateWithTime(): string {
        const date = new Date(this.snapshot.timestamp * 1000);
        return date.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    /**
     * Format date as full string
     */
    private formatFullDate(): string {
        const date = new Date(this.snapshot.timestamp * 1000);
        return date.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }
}

// =============================================================================
// VIEW FACTORY
// =============================================================================

/**
 * Create a TimeTravelView instance
 */
export function createTimeTravelView(
    leaf: WorkspaceLeaf,
    plugin: LabeledAnnotations,
    snapshot: DocumentSnapshot,
): TimeTravelView {
    return new TimeTravelView(leaf, plugin, snapshot);
}
