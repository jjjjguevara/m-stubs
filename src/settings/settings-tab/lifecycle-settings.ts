/**
 * Lifecycle Settings Tab
 *
 * Central hub for document lifecycle automation:
 * - Milestones: User-defined triggers and consequences
 * - Snapshots: Git integration for versioning
 * - QA Sampling: Internal metrics and benchmarking
 * - (Future) L3 Rules: Advanced orchestration patterns
 */

import { Setting, setIcon } from 'obsidian';
import type LabeledAnnotations from '../../main';
import { MILESTONE_PRESETS, type UserMilestoneConfig } from '../../observability/milestone-settings';
import { DEFAULT_TIME_TRAVEL_SETTINGS, DEFAULT_TAB_TITLE_COMPONENTS, type TimeTravelSettings } from '../../time-travel/time-travel-types';

interface LifecycleSettingsProps {
    plugin: LabeledAnnotations;
    containerEl: HTMLElement;
}

export const LifecycleSettings = ({ plugin, containerEl }: LifecycleSettingsProps): void => {
    const allSettings = plugin.settings.getValue();
    const settings = allSettings.milestones;

    // ==========================================================================
    // TAB HEADER
    // ==========================================================================

    const headerEl = containerEl.createEl('div', { cls: 'dd-lifecycle-header' });
    headerEl.createEl('h2', { text: 'Document Lifecycle' });

    const descEl = headerEl.createEl('p', { cls: 'dd-lifecycle-description' });
    descEl.innerHTML = `
        Automate your editorial workflow with lifecycle rules. Define <strong>milestones</strong> that trigger
        when documents reach quality thresholds, create <strong>snapshots</strong> for version control,
        and track <strong>metrics</strong> for continuous improvement.
    `;

    // Feature cards showing what's available
    const cardsEl = containerEl.createEl('div', { cls: 'dd-lifecycle-cards' });
    addFeatureCard(cardsEl, 'milestone', 'Milestones', 'Trigger actions when documents reach quality gates');
    addFeatureCard(cardsEl, 'git-branch', 'Snapshots', 'Version control integration with Obsidian Git');
    addFeatureCard(cardsEl, 'clock', 'Time Travel', 'View historical document snapshots');
    addFeatureCard(cardsEl, 'bar-chart-2', 'QA Sampling', 'Track metrics at power-law intervals');
    addFeatureCard(cardsEl, 'sparkles', 'L3 Rules', 'Advanced orchestration patterns (coming soon)', true);

    // Add styles
    addLifecycleStyles(containerEl);

    // ==========================================================================
    // MASTER TOGGLE
    // ==========================================================================

    containerEl.createEl('h3', { text: 'Enable Lifecycle Automation' });

    new Setting(containerEl)
        .setName('Lifecycle tracking')
        .setDesc('Enable document lifecycle automation. When enabled, milestones can trigger git snapshots and property changes.')
        .addToggle((toggle) =>
            toggle.setValue(settings.enabled).onChange((value) => {
                plugin.settings.dispatch({
                    type: 'MILESTONE_SET_ENABLED',
                    payload: { enabled: value },
                });
                // Re-render to show/hide dependent settings
                containerEl.empty();
                LifecycleSettings({ plugin, containerEl });
            }),
        );

    // Only show remaining settings if enabled
    if (!settings.enabled) {
        const disabledNote = containerEl.createEl('div', { cls: 'dd-lifecycle-disabled-note' });
        disabledNote.createEl('p', {
            text: 'Enable lifecycle tracking to configure milestones, git snapshots, and QA sampling.',
            cls: 'setting-item-description',
        });
        return;
    }

    // ==========================================================================
    // SECTION 1: MILESTONES
    // ==========================================================================

    const milestonesSection = containerEl.createEl('div', { cls: 'dd-lifecycle-section' });

    const milestoneHeader = milestonesSection.createEl('div', { cls: 'dd-section-header' });
    const milestoneIconEl = milestoneHeader.createEl('span', { cls: 'dd-section-icon' });
    setIcon(milestoneIconEl, 'milestone');
    milestoneHeader.createEl('h3', { text: 'Milestones' });

    milestonesSection.createEl('p', {
        text: 'Define triggers that fire when documents meet specific conditions. Each milestone can create git snapshots and modify document properties.',
        cls: 'dd-section-description',
    });

    // Milestone list
    const milestonesListEl = milestonesSection.createEl('div', { cls: 'dd-milestones-list' });

    if (settings.userMilestones.length === 0) {
        const emptyState = milestonesListEl.createEl('div', { cls: 'dd-empty-state' });
        emptyState.createEl('p', { text: 'No milestones configured yet.' });
        emptyState.createEl('p', {
            text: 'Add a preset below to get started, or create a custom milestone.',
            cls: 'setting-item-description',
        });
    } else {
        for (const milestone of settings.userMilestones) {
            renderMilestoneItem(milestonesListEl, milestone, plugin);
        }
    }

    // Add preset dropdown
    new Setting(milestonesSection)
        .setName('Add preset milestone')
        .setDesc('Start with a pre-configured milestone template.')
        .addDropdown((dropdown) => {
            dropdown.addOption('', 'Select a preset...');
            for (const preset of MILESTONE_PRESETS) {
                dropdown.addOption(preset.name, preset.name);
            }
            dropdown.onChange((value) => {
                if (!value) return;

                const preset = MILESTONE_PRESETS.find((p) => p.name === value);
                if (!preset) return;

                const newMilestone: UserMilestoneConfig = {
                    ...preset,
                    id: `milestone-${Date.now()}`,
                    enabled: true,
                };

                plugin.settings.dispatch({
                    type: 'MILESTONE_ADD_USER_MILESTONE',
                    payload: { milestone: newMilestone },
                });

                // Re-render
                containerEl.empty();
                LifecycleSettings({ plugin, containerEl });
            });
        });

    // Custom milestone button (future)
    new Setting(milestonesSection)
        .setName('Create custom milestone')
        .setDesc('Define a milestone with custom triggers, actions, and consequences.')
        .addButton((button) =>
            button
                .setButtonText('Create...')
                .setDisabled(true)
                .setTooltip('Coming soon: Visual milestone builder'),
        );

    // ==========================================================================
    // SECTION 2: GIT SNAPSHOTS
    // ==========================================================================

    const snapshotsSection = containerEl.createEl('div', { cls: 'dd-lifecycle-section' });

    const snapshotHeader = snapshotsSection.createEl('div', { cls: 'dd-section-header' });
    const snapshotIconEl = snapshotHeader.createEl('span', { cls: 'dd-section-icon' });
    setIcon(snapshotIconEl, 'git-branch');
    snapshotHeader.createEl('h3', { text: 'Git Snapshots' });

    snapshotsSection.createEl('p', {
        text: 'Create automatic git commits when milestones are reached. Requires the Obsidian Git plugin.',
        cls: 'dd-section-description',
    });

    new Setting(snapshotsSection)
        .setName('Enable git operations')
        .setDesc('Allow milestones to create commits, branches, and tags automatically.')
        .addToggle((toggle) =>
            toggle.setValue(settings.git.enabled).onChange((value) => {
                plugin.settings.dispatch({
                    type: 'MILESTONE_SET_GIT_ENABLED',
                    payload: { enabled: value },
                });
                // Re-render to show/hide git settings
                containerEl.empty();
                LifecycleSettings({ plugin, containerEl });
            }),
        );

    if (settings.git.enabled) {
        new Setting(snapshotsSection)
            .setName('Default branch')
            .setDesc('Branch to use for milestone commits when not specified in the milestone.')
            .addText((text) =>
                text
                    .setValue(settings.git.defaultBranch)
                    .setPlaceholder('main')
                    .onChange((value) => {
                        plugin.settings.dispatch({
                            type: 'MILESTONE_SET_GIT_BRANCH',
                            payload: { branch: value || 'main' },
                        });
                    }),
            );

        new Setting(snapshotsSection)
            .setName('Auto-pull before commit')
            .setDesc('Pull latest changes before creating a milestone commit to avoid conflicts.')
            .addToggle((toggle) =>
                toggle.setValue(settings.git.autoPull).onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'MILESTONE_SET_GIT_AUTO_PULL',
                        payload: { autoPull: value },
                    });
                }),
            );

        new Setting(snapshotsSection)
            .setName('Sign commits')
            .setDesc('Sign milestone commits with GPG (requires GPG setup in Obsidian Git).')
            .addToggle((toggle) =>
                toggle.setValue(settings.git.signCommits).onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'MILESTONE_SET_GIT_SIGN_COMMITS',
                        payload: { signCommits: value },
                    });
                }),
            );
    }

    // ==========================================================================
    // SECTION 2.5: TIME TRAVEL
    // ==========================================================================

    // Normalize time travel settings with defaults to handle missing properties
    const rawTimeTravelSettings = allSettings.timeTravel || {};
    const timeTravelSettings: TimeTravelSettings = {
        ...DEFAULT_TIME_TRAVEL_SETTINGS,
        ...rawTimeTravelSettings,
        // Ensure tabTitleComponents has all required entries with proper enabled states
        tabTitleComponents: normalizeTabTitleComponents(rawTimeTravelSettings.tabTitleComponents),
    };

    const timeTravelSection = containerEl.createEl('div', { cls: 'dd-lifecycle-section' });

    const timeTravelHeader = timeTravelSection.createEl('div', { cls: 'dd-section-header' });
    const timeTravelIconEl = timeTravelHeader.createEl('span', { cls: 'dd-section-icon' });
    setIcon(timeTravelIconEl, 'clock');
    timeTravelHeader.createEl('h3', { text: 'Time Travel' });

    timeTravelSection.createEl('p', {
        text: 'View historical snapshots of your documents. Navigate through git history to see how documents evolved over time.',
        cls: 'dd-section-description',
    });

    new Setting(timeTravelSection)
        .setName('Enable Time Travel')
        .setDesc('Allow viewing historical document snapshots via git history.')
        .addToggle((toggle) =>
            toggle.setValue(timeTravelSettings.enabled).onChange((value) => {
                plugin.settings.dispatch({
                    type: 'TIME_TRAVEL_SET_ENABLED',
                    payload: { enabled: value },
                });
                // Re-render to show/hide time travel settings
                containerEl.empty();
                LifecycleSettings({ plugin, containerEl });
            }),
        );

    if (timeTravelSettings.enabled) {
        // --- Snapshot Behavior ---
        timeTravelSection.createEl('h4', { text: 'Snapshot Behavior', cls: 'dd-subsection-header' });

        new Setting(timeTravelSection)
            .setName('Snapshot granularity')
            .setDesc('Which commits to show in Time Travel.')
            .addDropdown((dropdown) =>
                dropdown
                    .addOption('milestones', 'Milestones only — Show commits matching milestone patterns')
                    .addOption('all-commits', 'All commits — Show every commit for the document')
                    .setValue(timeTravelSettings.granularity)
                    .onChange((value) => {
                        plugin.settings.dispatch({
                            type: 'TIME_TRAVEL_SET_GRANULARITY',
                            payload: { granularity: value as 'milestones' | 'all-commits' },
                        });
                    }),
            );

        new Setting(timeTravelSection)
            .setName('Max snapshots')
            .setDesc('Maximum number of snapshots to load (1-50).')
            .addSlider((slider) =>
                slider
                    .setLimits(1, 50, 1)
                    .setValue(timeTravelSettings.maxSnapshots)
                    .setDynamicTooltip()
                    .onChange((value) => {
                        plugin.settings.dispatch({
                            type: 'TIME_TRAVEL_SET_MAX_SNAPSHOTS',
                            payload: { maxSnapshots: value },
                        });
                    }),
            );

        new Setting(timeTravelSection)
            .setName('Auto-open snapshots')
            .setDesc('Skip the selection modal and open snapshots immediately (up to max limit).')
            .addToggle((toggle) =>
                toggle.setValue(timeTravelSettings.autoOpen).onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'TIME_TRAVEL_SET_AUTO_OPEN',
                        payload: { autoOpen: value },
                    });
                }),
            );

        // --- Tab Behavior ---
        timeTravelSection.createEl('h4', { text: 'Tab Behavior', cls: 'dd-subsection-header' });

        new Setting(timeTravelSection)
            .setName('Use stacked tabs')
            .setDesc('Enable stacked tabs mode when opening multiple snapshots.')
            .addToggle((toggle) =>
                toggle.setValue(timeTravelSettings.useStackedTabs).onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'TIME_TRAVEL_SET_USE_STACKED_TABS',
                        payload: { useStackedTabs: value },
                    });
                }),
            );

        new Setting(timeTravelSection)
            .setName('Focus mode')
            .setDesc('Hide other tabs when Time Travel opens. Only show source file and snapshots. Tabs are restored when Time Travel closes.')
            .addToggle((toggle) =>
                toggle.setValue(timeTravelSettings.focusMode ?? false).onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'TIME_TRAVEL_SET_FOCUS_MODE',
                        payload: { focusMode: value },
                    });
                }),
            );

        new Setting(timeTravelSection)
            .setName('Close behavior')
            .setDesc('What happens when closing a Time Travel tab.')
            .addDropdown((dropdown) =>
                dropdown
                    .addOption('close-one', 'Close one — Only close the current tab')
                    .addOption('close-all', 'Close all — Close all Time Travel tabs together')
                    .setValue(timeTravelSettings.closeBehavior)
                    .onChange((value) => {
                        plugin.settings.dispatch({
                            type: 'TIME_TRAVEL_SET_CLOSE_BEHAVIOR',
                            payload: { closeBehavior: value as 'close-one' | 'close-all' },
                        });
                    }),
            );

        // --- Tab Title Customization ---
        timeTravelSection.createEl('h4', { text: 'Tab Title', cls: 'dd-subsection-header' });

        new Setting(timeTravelSection)
            .setName('Custom tab title')
            .setDesc('Use custom format instead of default (document name + date + time).')
            .addToggle((toggle) =>
                toggle.setValue(timeTravelSettings.useCustomTabTitle).onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'TIME_TRAVEL_SET_USE_CUSTOM_TAB_TITLE',
                        payload: { useCustomTabTitle: value },
                    });
                    // Re-render to show/hide component settings
                    containerEl.empty();
                    LifecycleSettings({ plugin, containerEl });
                }),
            );

        if (timeTravelSettings.useCustomTabTitle) {
            // Tab title components configuration
            const componentsContainer = timeTravelSection.createEl('div', { cls: 'dd-tab-components' });
            componentsContainer.createEl('p', {
                text: 'Drag to reorder. Enabled components appear in the tab title.',
                cls: 'setting-item-description',
            });

            const componentsList = componentsContainer.createEl('div', { cls: 'dd-component-list' });

            const componentLabels: Record<string, string> = {
                documentName: 'Document Name',
                date: 'Date',
                time: 'Time',
                sha: 'Commit SHA',
                commitMessage: 'Commit Message',
            };

            // Track drag state
            let draggedItem: HTMLElement | null = null;
            let draggedIndex = -1;

            for (let i = 0; i < timeTravelSettings.tabTitleComponents.length; i++) {
                const comp = timeTravelSettings.tabTitleComponents[i];
                const item = componentsList.createEl('div', {
                    cls: `dd-component-item ${comp.enabled ? 'is-enabled' : ''}`,
                    attr: { draggable: 'true', 'data-index': String(i) },
                });

                // Drag handle
                const handle = item.createEl('span', { cls: 'dd-drag-handle' });
                setIcon(handle, 'grip-vertical');

                // Checkbox
                const checkbox = item.createEl('input', { type: 'checkbox' });
                checkbox.checked = comp.enabled;
                checkbox.addEventListener('change', () => {
                    plugin.settings.dispatch({
                        type: 'TIME_TRAVEL_SET_TAB_COMPONENT_ENABLED',
                        payload: { componentType: comp.type, enabled: checkbox.checked },
                    });
                    item.toggleClass('is-enabled', checkbox.checked);
                });

                // Label
                item.createEl('span', {
                    text: componentLabels[comp.type] || comp.type,
                    cls: 'dd-component-label',
                });

                // Drag events
                item.addEventListener('dragstart', (e) => {
                    draggedItem = item;
                    draggedIndex = i;
                    item.addClass('is-dragging');
                    e.dataTransfer?.setData('text/plain', String(i));
                });

                item.addEventListener('dragend', () => {
                    if (draggedItem) {
                        draggedItem.removeClass('is-dragging');
                    }
                    draggedItem = null;
                    draggedIndex = -1;
                    // Remove all drag-over classes
                    componentsList.querySelectorAll('.drag-over').forEach(el => el.removeClass('drag-over'));
                });

                item.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    if (draggedItem && draggedItem !== item) {
                        item.addClass('drag-over');
                    }
                });

                item.addEventListener('dragleave', () => {
                    item.removeClass('drag-over');
                });

                item.addEventListener('drop', (e) => {
                    e.preventDefault();
                    item.removeClass('drag-over');

                    const targetIndex = parseInt(item.getAttribute('data-index') || '-1');

                    // Get fresh settings from store
                    const currentSettings = plugin.settings.getValue().timeTravel;
                    const currentComponents = normalizeTabTitleComponents(currentSettings?.tabTitleComponents);

                    console.debug('[Time Travel Settings] Drop:', {
                        draggedIndex,
                        targetIndex,
                        componentsBefore: currentComponents.map(c => ({ type: c.type, enabled: c.enabled })),
                    });

                    if (draggedIndex >= 0 && targetIndex >= 0 && draggedIndex !== targetIndex) {
                        // Deep copy the components to preserve all properties
                        const components = currentComponents.map(c => ({ ...c }));
                        const [movedItem] = components.splice(draggedIndex, 1);
                        components.splice(targetIndex, 0, movedItem);

                        console.debug('[Time Travel Settings] Reordered:', {
                            componentsAfter: components.map(c => ({ type: c.type, enabled: c.enabled })),
                        });

                        plugin.settings.dispatch({
                            type: 'TIME_TRAVEL_REORDER_TAB_COMPONENTS',
                            payload: { components },
                        });

                        // Re-render
                        containerEl.empty();
                        LifecycleSettings({ plugin, containerEl });
                    }
                });
            }

            // Custom property keys input
            new Setting(componentsContainer)
                .setName('Custom property keys')
                .setDesc('Comma-separated frontmatter properties to show in tab title (e.g., "title, version, status")')
                .addText((text) =>
                    text
                        .setPlaceholder('title, version, status')
                        .setValue(timeTravelSettings.customPropertyKeys || '')
                        .onChange((value) => {
                            plugin.settings.dispatch({
                                type: 'TIME_TRAVEL_SET_CUSTOM_PROPERTY_KEYS',
                                payload: { customPropertyKeys: value },
                            });
                        }),
                );
        }

        // Usage hint
        const usageHint = timeTravelSection.createEl('div', { cls: 'dd-qa-explainer' });
        usageHint.createEl('h5', { text: 'How to use Time Travel' });
        usageHint.createEl('p', {
            text: 'Use the command palette (Cmd/Ctrl + P) and search for "Time Travel: View document history" while viewing a document. You can also close all open snapshot tabs with "Time Travel: Close all snapshot tabs".',
            cls: 'setting-item-description',
        });
    }

    // ==========================================================================
    // SECTION 3: QA SAMPLING
    // ==========================================================================

    const qaSection = containerEl.createEl('div', { cls: 'dd-lifecycle-section' });

    const qaHeader = qaSection.createEl('div', { cls: 'dd-section-header' });
    const qaIconEl = qaHeader.createEl('span', { cls: 'dd-section-icon' });
    setIcon(qaIconEl, 'bar-chart-2');
    qaHeader.createEl('h3', { text: 'QA Sampling' });

    qaSection.createEl('p', {
        text: 'Capture snapshots at strategic intervals (power-law distribution) for quality analysis and benchmarking. This helps identify patterns in document improvement without overwhelming storage.',
        cls: 'dd-section-description',
    });

    new Setting(qaSection)
        .setName('Enable QA sampling')
        .setDesc('Automatically capture metrics at power-law checkpoints (1, 2, 4, 8, 16... occurrences).')
        .addToggle((toggle) =>
            toggle.setValue(settings.qaEnabled).onChange((value) => {
                plugin.settings.dispatch({
                    type: 'MILESTONE_SET_QA_ENABLED',
                    payload: { enabled: value },
                });
            }),
        );

    if (settings.qaEnabled) {
        new Setting(qaSection)
            .setName('Sampling verbosity')
            .setDesc('How much data to capture in each QA snapshot.')
            .addDropdown((dropdown) =>
                dropdown
                    .addOption('minimal', 'Minimal — Event counts only')
                    .addOption('standard', 'Standard — Metrics + stub distribution')
                    .addOption('verbose', 'Verbose — Full provider stats and traces')
                    .setValue(settings.qaVerbosity)
                    .onChange((value) => {
                        plugin.settings.dispatch({
                            type: 'MILESTONE_SET_QA_VERBOSITY',
                            payload: { verbosity: value as 'minimal' | 'standard' | 'verbose' },
                        });
                    }),
            );

        // Show sampling explanation
        const samplingExplainer = qaSection.createEl('div', { cls: 'dd-qa-explainer' });
        samplingExplainer.createEl('h5', { text: 'How power-law sampling works' });
        samplingExplainer.createEl('p', {
            text: 'Instead of capturing every event (which would explode storage), we capture at exponentially increasing intervals: the 1st, 2nd, 4th, 8th, 16th... occurrence. This follows the 80/20 rule—most insights come from early data points.',
            cls: 'setting-item-description',
        });
    }

    // ==========================================================================
    // SECTION 4: L3 RULES (FUTURE)
    // ==========================================================================

    const l3Section = containerEl.createEl('div', { cls: 'dd-lifecycle-section dd-section-coming-soon' });

    const l3Header = l3Section.createEl('div', { cls: 'dd-section-header' });
    const l3IconEl = l3Header.createEl('span', { cls: 'dd-section-icon' });
    setIcon(l3IconEl, 'sparkles');
    l3Header.createEl('h3', { text: 'L3 Rules' });
    l3Header.createEl('span', { text: 'Coming Soon', cls: 'dd-badge dd-badge-soon' });

    l3Section.createEl('p', {
        text: 'Advanced orchestration patterns: document sequences, batch operations, cross-document rules, and automated editorial workflows.',
        cls: 'dd-section-description',
    });

    const l3Features = l3Section.createEl('ul', { cls: 'dd-future-features' });
    l3Features.createEl('li', { text: 'Sequence rules: "When A reaches 0.8 refinement, start B"' });
    l3Features.createEl('li', { text: 'Batch operations: Apply milestones to document collections' });
    l3Features.createEl('li', { text: 'Cross-document triggers: Link dependencies between notes' });
    l3Features.createEl('li', { text: 'Scheduled automation: Time-based milestone evaluation' });
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Normalize tab title components to ensure all required types exist with proper enabled states
 */
function normalizeTabTitleComponents(
    stored: typeof DEFAULT_TAB_TITLE_COMPONENTS | undefined,
): typeof DEFAULT_TAB_TITLE_COMPONENTS {
    if (!stored || !Array.isArray(stored) || stored.length === 0) {
        // Use defaults if nothing stored
        return DEFAULT_TAB_TITLE_COMPONENTS.map(c => ({ ...c }));
    }

    // Create a map of stored components by type
    const storedMap = new Map(stored.map(c => [c.type, c]));

    // Merge: use stored enabled state if available, otherwise use default
    const normalized = DEFAULT_TAB_TITLE_COMPONENTS.map(defaultComp => {
        const storedComp = storedMap.get(defaultComp.type);
        if (storedComp) {
            return {
                type: defaultComp.type,
                enabled: storedComp.enabled ?? defaultComp.enabled,
                propertyKey: storedComp.propertyKey,
            };
        }
        return { ...defaultComp };
    });

    // Preserve the stored order if components exist
    const storedOrder = stored.map(c => c.type);
    normalized.sort((a, b) => {
        const aIndex = storedOrder.indexOf(a.type);
        const bIndex = storedOrder.indexOf(b.type);
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
    });

    console.debug('[Time Travel Settings] Normalized components:', normalized);
    return normalized;
}

/**
 * Add a feature card to the header
 */
function addFeatureCard(
    container: HTMLElement,
    icon: string,
    title: string,
    description: string,
    comingSoon = false,
): void {
    const card = container.createEl('div', {
        cls: `dd-feature-card ${comingSoon ? 'dd-coming-soon' : ''}`,
    });

    const iconEl = card.createEl('span', { cls: 'dd-feature-icon' });
    setIcon(iconEl, icon);

    const textEl = card.createEl('div', { cls: 'dd-feature-text' });
    textEl.createEl('strong', { text: title });
    if (comingSoon) {
        textEl.createEl('span', { text: ' (soon)', cls: 'dd-soon-label' });
    }
    textEl.createEl('p', { text: description });
}

/**
 * Render a milestone item in the list
 */
function renderMilestoneItem(
    containerEl: HTMLElement,
    milestone: UserMilestoneConfig,
    plugin: LabeledAnnotations,
): void {
    const itemEl = containerEl.createEl('div', { cls: 'dd-milestone-item' });

    // Status indicator
    const statusEl = itemEl.createEl('div', { cls: 'dd-milestone-status' });
    const statusDot = statusEl.createEl('span', {
        cls: `dd-status-dot ${milestone.enabled ? 'dd-status-active' : 'dd-status-inactive'}`,
    });
    statusDot.title = milestone.enabled ? 'Active' : 'Inactive';

    // Content
    const contentEl = itemEl.createEl('div', { cls: 'dd-milestone-content' });
    contentEl.createEl('strong', { text: milestone.name });

    if (milestone.description) {
        contentEl.createEl('p', { text: milestone.description, cls: 'dd-milestone-desc' });
    }

    // Trigger summary
    const triggerText = summarizeTrigger(milestone.trigger);
    const triggerEl = contentEl.createEl('div', { cls: 'dd-milestone-trigger' });
    triggerEl.createEl('span', { text: 'Trigger: ', cls: 'dd-trigger-label' });
    triggerEl.createEl('code', { text: triggerText });

    // Consequences summary
    if (milestone.consequences.length > 0) {
        const consText = milestone.consequences.map(c => summarizeConsequence(c)).join(', ');
        const consEl = contentEl.createEl('div', { cls: 'dd-milestone-consequences' });
        consEl.createEl('span', { text: 'Then: ', cls: 'dd-trigger-label' });
        consEl.createEl('span', { text: consText });
    }

    // Controls
    const controlsEl = itemEl.createEl('div', { cls: 'dd-milestone-controls' });

    // Enable/disable toggle
    const toggleEl = controlsEl.createEl('input', { type: 'checkbox' });
    toggleEl.checked = milestone.enabled;
    toggleEl.title = milestone.enabled ? 'Click to disable' : 'Click to enable';
    toggleEl.addEventListener('change', () => {
        plugin.settings.dispatch({
            type: 'MILESTONE_TOGGLE_USER_MILESTONE',
            payload: { id: milestone.id, enabled: toggleEl.checked },
        });
        statusDot.classList.toggle('dd-status-active', toggleEl.checked);
        statusDot.classList.toggle('dd-status-inactive', !toggleEl.checked);
    });

    // Delete button
    const deleteBtn = controlsEl.createEl('button', { cls: 'dd-milestone-delete' });
    setIcon(deleteBtn, 'trash-2');
    deleteBtn.title = 'Delete milestone';
    deleteBtn.addEventListener('click', () => {
        plugin.settings.dispatch({
            type: 'MILESTONE_DELETE_USER_MILESTONE',
            payload: { id: milestone.id },
        });
        itemEl.remove();
    });
}

/**
 * Create a human-readable summary of a trigger
 */
function summarizeTrigger(trigger: UserMilestoneConfig['trigger']): string {
    switch (trigger.type) {
        case 'threshold':
            return `${trigger.property} ${trigger.operator} ${trigger.value}`;
        case 'event_count':
            return `${trigger.count}× ${trigger.event.replace(/_/g, ' ')}`;
        case 'event_sequence':
            return trigger.sequence.map((s) => s.event).join(' → ');
        case 'composite':
            return `${trigger.triggers.length} conditions (${trigger.operator.toUpperCase()})`;
        default:
            return 'Custom trigger';
    }
}

/**
 * Create a human-readable summary of a consequence
 */
function summarizeConsequence(consequence: UserMilestoneConfig['consequences'][0]): string {
    switch (consequence.type) {
        case 'refinement_bump':
            return `refinement ${consequence.delta > 0 ? '+' : ''}${consequence.delta}`;
        case 'property_enum_change':
            return `${consequence.property} → ${consequence.value}`;
        case 'array_mutation':
            return `${consequence.operation} "${consequence.value}" to ${consequence.property}`;
        case 'stub_mutation':
            return `${consequence.mutation.action} stubs`;
        default:
            return 'Custom action';
    }
}

/**
 * Add styles for the Lifecycle tab
 */
function addLifecycleStyles(containerEl: HTMLElement): void {
    if (containerEl.querySelector('.dd-lifecycle-styles')) return;

    const style = document.createElement('style');
    style.className = 'dd-lifecycle-styles';
    style.textContent = `
        /* Header */
        .dd-lifecycle-header {
            margin-bottom: 24px;
        }

        .dd-lifecycle-description {
            color: var(--text-muted);
            line-height: 1.6;
            margin-bottom: 16px;
        }

        .dd-lifecycle-description strong {
            color: var(--text-normal);
        }

        /* Feature Cards */
        .dd-lifecycle-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 12px;
            margin-bottom: 24px;
        }

        .dd-feature-card {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            padding: 12px 16px;
            background: var(--background-secondary);
            border-radius: 8px;
            border: 1px solid var(--background-modifier-border);
        }

        .dd-feature-card.dd-coming-soon {
            opacity: 0.6;
        }

        .dd-feature-icon {
            flex-shrink: 0;
            color: var(--interactive-accent);
        }

        .dd-feature-icon svg {
            width: 20px;
            height: 20px;
        }

        .dd-feature-text {
            flex: 1;
        }

        .dd-feature-text strong {
            display: block;
            margin-bottom: 4px;
        }

        .dd-feature-text p {
            margin: 0;
            font-size: 0.85em;
            color: var(--text-muted);
            line-height: 1.4;
        }

        .dd-soon-label {
            color: var(--text-muted);
            font-weight: normal;
            font-size: 0.85em;
        }

        /* Sections */
        .dd-lifecycle-section {
            margin: 32px 0;
            padding: 20px;
            background: var(--background-primary-alt);
            border-radius: 8px;
            border: 1px solid var(--background-modifier-border);
        }

        .dd-lifecycle-section.dd-section-coming-soon {
            opacity: 0.7;
        }

        .dd-section-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        }

        .dd-section-header h3 {
            margin: 0;
            font-size: 1.1em;
        }

        .dd-section-icon {
            color: var(--interactive-accent);
        }

        .dd-section-icon svg {
            width: 18px;
            height: 18px;
        }

        .dd-section-description {
            color: var(--text-muted);
            margin-bottom: 16px;
            line-height: 1.5;
        }

        /* Badges */
        .dd-badge {
            font-size: 0.75em;
            padding: 2px 8px;
            border-radius: 12px;
            font-weight: 500;
        }

        .dd-badge-soon {
            background: var(--background-modifier-border);
            color: var(--text-muted);
        }

        /* Disabled note */
        .dd-lifecycle-disabled-note {
            padding: 16px;
            background: var(--background-secondary);
            border-radius: 8px;
            text-align: center;
        }

        /* Empty state */
        .dd-empty-state {
            padding: 24px;
            text-align: center;
            background: var(--background-secondary);
            border-radius: 6px;
            margin-bottom: 16px;
        }

        .dd-empty-state p:first-child {
            margin-bottom: 4px;
            color: var(--text-normal);
        }

        /* Milestone Items */
        .dd-milestones-list {
            margin-bottom: 16px;
        }

        .dd-milestone-item {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            padding: 12px 16px;
            background: var(--background-secondary);
            border-radius: 6px;
            margin-bottom: 8px;
            border: 1px solid var(--background-modifier-border);
        }

        .dd-milestone-status {
            padding-top: 4px;
        }

        .dd-status-dot {
            display: block;
            width: 10px;
            height: 10px;
            border-radius: 50%;
        }

        .dd-status-dot.dd-status-active {
            background: var(--color-green);
            box-shadow: 0 0 6px var(--color-green);
        }

        .dd-status-dot.dd-status-inactive {
            background: var(--text-muted);
            opacity: 0.5;
        }

        .dd-milestone-content {
            flex: 1;
        }

        .dd-milestone-content strong {
            display: block;
            margin-bottom: 4px;
        }

        .dd-milestone-desc {
            margin: 0 0 8px 0;
            color: var(--text-muted);
            font-size: 0.9em;
        }

        .dd-milestone-trigger,
        .dd-milestone-consequences {
            font-size: 0.85em;
            margin-bottom: 4px;
        }

        .dd-trigger-label {
            color: var(--text-muted);
        }

        .dd-milestone-trigger code {
            background: var(--background-primary);
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 0.9em;
        }

        .dd-milestone-controls {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .dd-milestone-delete {
            padding: 4px;
            background: transparent;
            border: none;
            cursor: pointer;
            color: var(--text-muted);
            border-radius: 4px;
        }

        .dd-milestone-delete:hover {
            color: var(--text-error);
            background: var(--background-modifier-hover);
        }

        .dd-milestone-delete svg {
            width: 16px;
            height: 16px;
        }

        /* QA Explainer */
        .dd-qa-explainer {
            margin-top: 16px;
            padding: 12px 16px;
            background: var(--background-secondary);
            border-radius: 6px;
            border-left: 3px solid var(--interactive-accent);
        }

        .dd-qa-explainer h5 {
            margin: 0 0 8px 0;
            font-size: 0.9em;
        }

        .dd-qa-explainer p {
            margin: 0;
            line-height: 1.5;
        }

        /* Future features list */
        .dd-future-features {
            margin: 12px 0 0 0;
            padding-left: 20px;
        }

        .dd-future-features li {
            color: var(--text-muted);
            margin-bottom: 6px;
            font-size: 0.9em;
        }

        /* Subsection headers */
        .dd-subsection-header {
            margin: 20px 0 12px 0;
            font-size: 0.95em;
            color: var(--text-muted);
            border-bottom: 1px solid var(--background-modifier-border);
            padding-bottom: 6px;
        }

        /* Tab title components */
        .dd-tab-components {
            margin: 12px 0;
            padding: 12px;
            background: var(--background-secondary);
            border-radius: 6px;
        }

        .dd-component-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin-top: 12px;
        }

        .dd-component-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 12px;
            background: var(--background-primary);
            border-radius: 4px;
            border: 1px solid var(--background-modifier-border);
            cursor: grab;
            transition: all 0.15s ease;
        }

        .dd-component-item:hover {
            background: var(--background-modifier-hover);
        }

        .dd-component-item.is-enabled {
            border-color: var(--interactive-accent);
            background: var(--background-primary-alt);
        }

        .dd-component-item.is-dragging {
            opacity: 0.5;
            background: var(--background-modifier-active-hover);
        }

        .dd-component-item.drag-over {
            border-color: var(--interactive-accent);
            background: var(--background-modifier-hover);
            box-shadow: 0 0 0 2px var(--interactive-accent-hover);
        }

        .dd-drag-handle {
            color: var(--text-faint);
            cursor: grab;
            display: flex;
            align-items: center;
        }

        .dd-drag-handle svg {
            width: 14px;
            height: 14px;
        }

        .dd-component-item input[type="checkbox"] {
            margin: 0;
        }

        .dd-component-label {
            flex: 1;
            font-size: 0.9em;
        }
    `;
    containerEl.prepend(style);
}
