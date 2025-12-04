/**
 * Explore Settings Component
 *
 * Settings UI for the Explore view and Smart Connections integration.
 */

import { Notice, setIcon, Setting } from 'obsidian';
import type LabeledAnnotations from '../../main';
import {
    CARD_PRESETS,
    type CardPreset,
    type CardRegion,
} from '../../shared/types/segmented-card-types';

interface Props {
    plugin: LabeledAnnotations;
    containerEl: HTMLElement;
}

export const ExploreSettings = ({ plugin, containerEl }: Props) => {
    const settings = plugin.settings.getValue();
    const scSettings = settings.smartConnections;

    // Header
    containerEl.createEl('h2', { text: 'Explore & Smart Connections' });
    containerEl.createEl('p', {
        text: 'Configure semantic search and related notes discovery. Works best with the Smart Connections plugin installed.',
        cls: 'setting-item-description',
    });

    // ==========================================================================
    // STATUS SECTION
    // ==========================================================================

    containerEl.createEl('h3', { text: 'Status' });

    // Smart Connections Status
    const statusSetting = new Setting(containerEl)
        .setName('Smart Connections Status')
        .setDesc('Check the connection status and embedding availability');

    // Status display element
    const statusDisplay = statusSetting.descEl.createEl('div', {
        cls: 'sc-status-display',
    });

    const updateStatusDisplay = () => {
        statusDisplay.empty();

        if (plugin.smartConnectionsService) {
            const status = plugin.smartConnectionsService.getStatus();

            const statusIcon = statusDisplay.createEl('span', {
                cls: `sc-status-icon ${status.smartConnections ? 'available' : 'unavailable'}`,
            });
            statusIcon.textContent = status.smartConnections ? '●' : '○';

            const statusText = statusDisplay.createEl('span', { cls: 'sc-status-text' });

            if (status.smartConnections) {
                statusText.textContent = status.embeddingsCount > 0
                    ? `Connected (${status.embeddingsCount} embeddings)`
                    : 'Connected';
            } else if (status.fallbackMode) {
                statusText.textContent = 'Fallback mode (keyword search)';
                if (status.error) {
                    const errorEl = statusDisplay.createEl('div', { cls: 'sc-status-error' });
                    errorEl.textContent = status.error;
                }
            } else {
                statusText.textContent = 'Not available';
            }
        } else {
            statusDisplay.createEl('span', { text: 'Service not initialized' });
        }
    };

    updateStatusDisplay();

    statusSetting.addButton((button) => {
        button.setButtonText('Refresh').onClick(() => {
            if (plugin.smartConnectionsService) {
                plugin.smartConnectionsService.refreshApiReference();
            }
            updateStatusDisplay();
            new Notice('Status refreshed');
        });
    });

    statusSetting.addExtraButton((button) => {
        button
            .setIcon('external-link')
            .setTooltip('Install Smart Connections')
            .onClick(() => {
                window.open('obsidian://show-plugin?id=smart-connections', '_blank');
            });
    });

    // Add CSS for status display
    const style = document.createElement('style');
    style.textContent = `
        .sc-status-display {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 8px;
            margin-top: 8px;
            padding: 8px 12px;
            background: var(--background-secondary);
            border-radius: 6px;
            font-size: var(--font-ui-small);
        }
        .sc-status-icon {
            font-size: 12px;
        }
        .sc-status-icon.available {
            color: var(--color-green);
        }
        .sc-status-icon.unavailable {
            color: var(--text-muted);
        }
        .sc-status-error {
            width: 100%;
            color: var(--text-warning);
            font-size: var(--font-ui-smaller);
            margin-top: 4px;
        }
    `;
    containerEl.appendChild(style);

    // ==========================================================================
    // FEATURE TOGGLES
    // ==========================================================================

    containerEl.createEl('h3', { text: 'Features' });

    // Enable Smart Connections integration
    new Setting(containerEl)
        .setName('Enable Smart Connections')
        .setDesc('Use Smart Connections for semantic search when available')
        .addToggle((toggle) => {
            toggle.setValue(scSettings.enabled).onChange((value) => {
                plugin.settings.dispatch({
                    type: 'SET_SMART_CONNECTIONS_ENABLED',
                    payload: { enabled: value },
                });
                // Refresh the display
                containerEl.empty();
                ExploreSettings({ plugin, containerEl });
            });
        });

    if (!scSettings.enabled) {
        return;
    }

    // Auto-populate related property
    new Setting(containerEl)
        .setName('Auto-populate Related Property')
        .setDesc('Automatically suggest related notes to add to frontmatter')
        .addToggle((toggle) => {
            toggle.setValue(scSettings.autoPopulateRelated).onChange((value) => {
                plugin.settings.dispatch({
                    type: 'SET_SMART_CONNECTIONS_AUTO_POPULATE',
                    payload: { enabled: value },
                });
            });
        });

    // Related property name
    new Setting(containerEl)
        .setName('Related Property Name')
        .setDesc('Frontmatter property name for storing related notes (default: "related")')
        .addText((text) => {
            text.setPlaceholder('related')
                .setValue(scSettings.relatedPropertyName ?? 'related')
                .onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'SET_SMART_CONNECTIONS_RELATED_PROPERTY_NAME',
                        payload: { propertyName: value || 'related' },
                    });
                });
        });

    // Warn on duplicates
    new Setting(containerEl)
        .setName('Warn on Duplicates')
        .setDesc('Show warning when similar notes are detected')
        .addToggle((toggle) => {
            toggle.setValue(scSettings.warnOnDuplicates).onChange((value) => {
                plugin.settings.dispatch({
                    type: 'SET_SMART_CONNECTIONS_WARN_DUPLICATES',
                    payload: { enabled: value },
                });
            });
        });

    // Suggest links
    new Setting(containerEl)
        .setName('Suggest Links')
        .setDesc('Show wikilink suggestions based on semantic similarity')
        .addToggle((toggle) => {
            toggle.setValue(scSettings.suggestLinks).onChange((value) => {
                plugin.settings.dispatch({
                    type: 'SET_SMART_CONNECTIONS_SUGGEST_LINKS',
                    payload: { enabled: value },
                });
            });
        });

    // ==========================================================================
    // THRESHOLDS AND LIMITS
    // ==========================================================================

    containerEl.createEl('h3', { text: 'Thresholds & Limits' });

    // Related notes limit
    new Setting(containerEl)
        .setName('Related Notes Limit')
        .setDesc('Maximum number of related notes to display')
        .addSlider((slider) => {
            slider
                .setLimits(3, 20, 1)
                .setValue(scSettings.relatedNotesLimit)
                .setDynamicTooltip()
                .onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'SET_SMART_CONNECTIONS_RELATED_LIMIT',
                        payload: { limit: value },
                    });
                });
        });

    // Related threshold
    new Setting(containerEl)
        .setName('Related Notes Threshold')
        .setDesc('Minimum similarity score to show as related. Smart Connections scores often range 0.2-0.6.')
        .addSlider((slider) => {
            slider
                .setLimits(0.1, 0.9, 0.05)
                .setValue(scSettings.relatedThreshold)
                .setDynamicTooltip()
                .onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'SET_SMART_CONNECTIONS_RELATED_THRESHOLD',
                        payload: { threshold: value },
                    });
                });
        });

    // Duplicate threshold
    new Setting(containerEl)
        .setName('Duplicate Detection Threshold')
        .setDesc('Similarity threshold for duplicate warnings (0-1)')
        .addSlider((slider) => {
            slider
                .setLimits(0.7, 0.95, 0.05)
                .setValue(scSettings.duplicateThreshold)
                .setDynamicTooltip()
                .onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'SET_SMART_CONNECTIONS_DUPLICATE_THRESHOLD',
                        payload: { threshold: value },
                    });
                });
        });

    // Link suggestion confidence
    new Setting(containerEl)
        .setName('Link Suggestion Confidence')
        .setDesc('Minimum confidence for link suggestions (0-1)')
        .addSlider((slider) => {
            slider
                .setLimits(0.4, 0.9, 0.05)
                .setValue(scSettings.linkSuggestionMinConfidence)
                .setDynamicTooltip()
                .onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'SET_SMART_CONNECTIONS_LINK_CONFIDENCE',
                        payload: { confidence: value },
                    });
                });
        });

    // ==========================================================================
    // PERFORMANCE
    // ==========================================================================

    containerEl.createEl('h3', { text: 'Performance' });

    // Cache results
    new Setting(containerEl)
        .setName('Cache Results')
        .setDesc('Cache search results to improve performance')
        .addToggle((toggle) => {
            toggle.setValue(scSettings.cacheResults).onChange((value) => {
                plugin.settings.dispatch({
                    type: 'SET_SMART_CONNECTIONS_CACHE_ENABLED',
                    payload: { enabled: value },
                });
            });
        });

    // Cache duration
    new Setting(containerEl)
        .setName('Cache Duration')
        .setDesc('How long to cache results (minutes)')
        .addSlider((slider) => {
            slider
                .setLimits(1, 30, 1)
                .setValue(scSettings.cacheDurationMinutes)
                .setDynamicTooltip()
                .onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'SET_SMART_CONNECTIONS_CACHE_DURATION',
                        payload: { minutes: value },
                    });
                });
        });

    // Clear cache button
    new Setting(containerEl)
        .setName('Clear Cache')
        .setDesc('Clear the cached search results')
        .addButton((button) => {
            button.setButtonText('Clear Cache').onClick(() => {
                if (plugin.smartConnectionsService) {
                    plugin.smartConnectionsService.clearCache();
                    new Notice('Cache cleared');
                }
            });
        });

    // ==========================================================================
    // CARD CUSTOMIZATION
    // ==========================================================================

    containerEl.createEl('h3', { text: 'Result Card Customization' });
    containerEl.createEl('p', {
        text: 'Customize how result cards behave. Enable segmentation to divide cards into clickable regions, each mapped to a command.',
        cls: 'setting-item-description',
    });

    const cardSettings = settings.cardSegmentation;

    // Enable segmented cards
    new Setting(containerEl)
        .setName('Enable Card Segmentation')
        .setDesc('Divide result cards into clickable regions for quick actions')
        .addToggle((toggle) => {
            toggle.setValue(cardSettings.enabled).onChange((value) => {
                plugin.settings.dispatch({
                    type: 'SET_CARD_SEGMENTATION_ENABLED',
                    payload: { enabled: value },
                });
                // Refresh the display
                containerEl.empty();
                ExploreSettings({ plugin, containerEl });
            });
        });

    if (cardSettings.enabled) {
        // Show labels on hover
        new Setting(containerEl)
            .setName('Show Labels on Hover')
            .setDesc('Display action labels when hovering over card regions')
            .addToggle((toggle) => {
                toggle.setValue(cardSettings.showLabelsOnHover).onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'SET_CARD_SEGMENTATION_SHOW_LABELS',
                        payload: { showLabels: value },
                    });
                });
            });

        // Show separators
        new Setting(containerEl)
            .setName('Show Region Separators')
            .setDesc('Display visual dividers between card regions')
            .addToggle((toggle) => {
                toggle.setValue(cardSettings.showSeparators).onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'SET_CARD_SEGMENTATION_SHOW_SEPARATORS',
                        payload: { showSeparators: value },
                    });
                });
            });

        // Create a container for the card customization section
        const cardCustomizationContainer = containerEl.createDiv('card-customization-section');

        // Get all available commands from Obsidian
        const commandsRegistry = (plugin.app as any).commands?.commands as Record<string, { name: string }> ?? {};
        const allCommands = Object.entries(commandsRegistry)
            .map(([id, cmd]) => ({ id, name: cmd.name }))
            .sort((a, b) => a.name.localeCompare(b.name));

        // Helper to get current regions based on preset
        const getCurrentRegions = (): CardRegion[] => {
            const s = plugin.settings.getValue().cardSegmentation;
            return s.defaultPreset === 'custom' ? s.customRegions : CARD_PRESETS[s.defaultPreset];
        };

        // Helper to render with scroll position preservation
        const renderWithScrollPreservation = (renderFn: () => void) => {
            const modal = containerEl.closest('.modal') || containerEl.closest('.vertical-tab-content');
            const scrollTop = modal?.scrollTop ?? 0;
            renderFn();
            if (modal) {
                requestAnimationFrame(() => { modal.scrollTop = scrollTop; });
            }
        };

        // Main render function
        const renderCardCustomization = () => {
            cardCustomizationContainer.empty();
            const currentCardSettings = plugin.settings.getValue().cardSegmentation;
            const currentRegions = getCurrentRegions();

            // Preset selector
            new Setting(cardCustomizationContainer)
                .setName('Card Layout Preset')
                .setDesc('Choose a predefined layout or customize regions')
                .addDropdown((dropdown) => {
                    dropdown
                        .addOption('equal-4', 'Equal 4 Regions (25% each)')
                        .addOption('equal-5', 'Equal 5 Regions (20% each)')
                        .addOption('asymmetric-4', 'Asymmetric (15-35-35-15%)')
                        .addOption('custom', 'Custom')
                        .setValue(currentCardSettings.defaultPreset)
                        .onChange((value: CardPreset) => {
                            if (value === 'custom' && currentCardSettings.customRegions.length === 0) {
                                plugin.settings.dispatch({
                                    type: 'SET_CARD_CUSTOM_REGIONS',
                                    payload: {
                                        regions: [
                                            { id: 'region-1', widthPercent: 25, commandId: '', label: 'Action 1' },
                                            { id: 'region-2', widthPercent: 25, commandId: '', label: 'Action 2' },
                                            { id: 'region-3', widthPercent: 25, commandId: '', label: 'Action 3' },
                                            { id: 'region-4', widthPercent: 25, commandId: '', label: 'Action 4' },
                                        ],
                                    },
                                });
                            }
                            plugin.settings.dispatch({
                                type: 'SET_CARD_SEGMENTATION_PRESET',
                                payload: { preset: value },
                            });
                            renderWithScrollPreservation(renderCardCustomization);
                        });
                });

            // Layout Preview section
            const previewSection = cardCustomizationContainer.createDiv('card-preview-section');
            const previewHeader = previewSection.createDiv('card-preview-header');
            previewHeader.createEl('span', { text: 'Layout Preview', cls: 'card-preview-title' });

            // +/- buttons for Custom preset
            if (currentCardSettings.defaultPreset === 'custom') {
                const btnGroup = previewHeader.createDiv('card-preview-btn-group');

                const minusBtn = btnGroup.createEl('button', {
                    cls: `card-preview-btn ${currentRegions.length <= 1 ? 'disabled' : ''}`,
                    attr: { title: 'Remove region (min 1)' },
                });
                setIcon(minusBtn, 'minus');
                minusBtn.addEventListener('click', () => {
                    const regions = getCurrentRegions();
                    if (regions.length > 1) {
                        const newRegions = regions.slice(0, -1);
                        const equalWidth = 100 / newRegions.length;
                        plugin.settings.dispatch({
                            type: 'SET_CARD_CUSTOM_REGIONS',
                            payload: { regions: newRegions.map((r) => ({ ...r, widthPercent: equalWidth })) },
                        });
                        renderWithScrollPreservation(renderCardCustomization);
                    }
                });

                const plusBtn = btnGroup.createEl('button', {
                    cls: `card-preview-btn ${currentRegions.length >= 6 ? 'disabled' : ''}`,
                    attr: { title: 'Add region (max 6)' },
                });
                setIcon(plusBtn, 'plus');
                plusBtn.addEventListener('click', () => {
                    const regions = getCurrentRegions();
                    if (regions.length < 6) {
                        const newRegions = [
                            ...regions,
                            { id: `region-${regions.length + 1}`, widthPercent: 0, commandId: '', label: `Action ${regions.length + 1}` },
                        ];
                        const equalWidth = 100 / newRegions.length;
                        plugin.settings.dispatch({
                            type: 'SET_CARD_CUSTOM_REGIONS',
                            payload: { regions: newRegions.map((r) => ({ ...r, widthPercent: equalWidth })) },
                        });
                        renderWithScrollPreservation(renderCardCustomization);
                    }
                });
            }

            // Card preview
            const previewContainer = previewSection.createDiv('card-preview-container');
            const previewCard = previewContainer.createDiv('card-preview');

            currentRegions.forEach((region, index) => {
                const regionEl = previewCard.createDiv('card-preview-region');
                regionEl.style.width = `${region.widthPercent}%`;
                regionEl.textContent = `${Math.round(region.widthPercent)}%`;
                regionEl.title = region.label;

                // Add draggable handle for Custom preset
                if (index > 0 && currentCardSettings.defaultPreset === 'custom') {
                    const handle = previewCard.createDiv('card-preview-handle');
                    handle.style.left = `${currentRegions.slice(0, index).reduce((sum, r) => sum + r.widthPercent, 0)}%`;

                    let isDragging = false;
                    let startX = 0;
                    let startLeftWidth = 0;
                    let startRightWidth = 0;

                    const onMouseDown = (e: MouseEvent) => {
                        const regions = getCurrentRegions();
                        isDragging = true;
                        startX = e.clientX;
                        startLeftWidth = regions[index - 1].widthPercent;
                        startRightWidth = regions[index].widthPercent;
                        handle.classList.add('dragging');
                        document.body.style.cursor = 'col-resize';
                        e.preventDefault();
                    };

                    const onMouseMove = (e: MouseEvent) => {
                        if (!isDragging) return;
                        const cardRect = previewCard.getBoundingClientRect();
                        const deltaPercent = ((e.clientX - startX) / cardRect.width) * 100;

                        let newLeftWidth = Math.max(10, Math.min(startLeftWidth + startRightWidth - 10, startLeftWidth + deltaPercent));
                        let newRightWidth = startLeftWidth + startRightWidth - newLeftWidth;

                        // Update visually
                        const regionEls = previewCard.querySelectorAll('.card-preview-region');
                        (regionEls[index - 1] as HTMLElement).style.width = `${newLeftWidth}%`;
                        (regionEls[index - 1] as HTMLElement).textContent = `${Math.round(newLeftWidth)}%`;
                        (regionEls[index] as HTMLElement).style.width = `${newRightWidth}%`;
                        (regionEls[index] as HTMLElement).textContent = `${Math.round(newRightWidth)}%`;

                        const regions = getCurrentRegions();
                        const newPos = regions.slice(0, index - 1).reduce((sum, r) => sum + r.widthPercent, 0) + newLeftWidth;
                        handle.style.left = `${newPos}%`;
                    };

                    const onMouseUp = () => {
                        if (!isDragging) return;
                        isDragging = false;
                        handle.classList.remove('dragging');
                        document.body.style.cursor = '';

                        const regionEls = previewCard.querySelectorAll('.card-preview-region');
                        const regions = getCurrentRegions();
                        const updatedRegions = regions.map((r, i) => ({
                            ...r,
                            widthPercent: parseFloat((regionEls[i] as HTMLElement).style.width) || r.widthPercent,
                        }));
                        plugin.settings.dispatch({
                            type: 'SET_CARD_CUSTOM_REGIONS',
                            payload: { regions: updatedRegions },
                        });
                        // Update commands section only (no full re-render)
                        renderCommandsSection();
                    };

                    handle.addEventListener('mousedown', onMouseDown);
                    document.addEventListener('mousemove', onMouseMove);
                    document.addEventListener('mouseup', onMouseUp);
                }
            });

            // Region Commands section
            const commandsContainer = cardCustomizationContainer.createDiv('region-commands-section');

            const renderCommandsSection = () => {
                commandsContainer.empty();
                const regions = getCurrentRegions();
                const cardSettings = plugin.settings.getValue().cardSegmentation;

                commandsContainer.createEl('h4', { text: 'Region Commands' });

                regions.forEach((region, index) => {
                    const setting = new Setting(commandsContainer)
                        .setName(`Region ${index + 1}`)
                        .setDesc(`${Math.round(region.widthPercent)}% width`);

                    // Use Obsidian's native dropdown approach
                    const controlEl = setting.controlEl;
                    const wrapper = controlEl.createDiv('command-dropdown-wrapper');

                    const input = wrapper.createEl('input', {
                        cls: 'command-dropdown-input',
                        attr: {
                            type: 'text',
                            placeholder: 'Search commands...',
                        },
                    });

                    // Show current selection
                    if (region.commandId) {
                        input.value = commandsRegistry[region.commandId]?.name || region.commandId;
                    }

                    const dropdownContainer = wrapper.createDiv('command-dropdown-list');

                    const renderDropdown = (filter: string) => {
                        dropdownContainer.empty();
                        const filterLower = filter.toLowerCase().trim();

                        // Filter commands - verbatim word-start matching
                        const filtered = filterLower
                            ? allCommands.filter((cmd) => {
                                const words = cmd.name.toLowerCase().split(/[\s:>\-_]+/);
                                return words.some(word => word.startsWith(filterLower)) ||
                                       cmd.name.toLowerCase().startsWith(filterLower);
                            })
                            : allCommands;

                        // Default option
                        const defaultItem = dropdownContainer.createDiv({
                            cls: `command-dropdown-item ${!region.commandId ? 'is-selected' : ''}`,
                        });
                        defaultItem.createSpan({ text: '(Default action)', cls: 'command-dropdown-item-name' });
                        defaultItem.addEventListener('mousedown', (e) => {
                            e.preventDefault();
                            plugin.settings.dispatch({
                                type: 'SET_CARD_REGION_COMMAND',
                                payload: { regionIndex: index, commandId: '', preset: cardSettings.defaultPreset },
                            });
                            input.value = '';
                            input.blur();
                        });

                        // Command options
                        filtered.forEach((cmd) => {
                            const item = dropdownContainer.createDiv({
                                cls: `command-dropdown-item ${cmd.id === region.commandId ? 'is-selected' : ''}`,
                            });
                            item.createSpan({ text: cmd.name, cls: 'command-dropdown-item-name' });
                            item.addEventListener('mousedown', (e) => {
                                e.preventDefault();
                                plugin.settings.dispatch({
                                    type: 'SET_CARD_REGION_COMMAND',
                                    payload: { regionIndex: index, commandId: cmd.id, preset: cardSettings.defaultPreset },
                                });
                                input.value = cmd.name;
                                input.blur();
                            });
                        });
                    };

                    input.addEventListener('focus', () => {
                        renderDropdown(input.value);
                        dropdownContainer.style.display = 'block';
                        input.select();
                    });

                    input.addEventListener('input', () => {
                        renderDropdown(input.value);
                    });

                    input.addEventListener('blur', () => {
                        setTimeout(() => {
                            dropdownContainer.style.display = 'none';
                            // Reset display to current value
                            input.value = region.commandId
                                ? (commandsRegistry[region.commandId]?.name || region.commandId)
                                : '';
                        }, 150);
                    });

                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Escape') {
                            input.blur();
                        } else if (e.key === 'Enter') {
                            const firstItem = dropdownContainer.querySelector('.command-dropdown-item:not(.is-selected)') as HTMLElement;
                            if (firstItem) {
                                firstItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                            }
                        }
                    });
                });
            };

            renderCommandsSection();
        };

        // Initial render
        renderCardCustomization();
    }

    // Add CSS for card preview
    const cardPreviewStyle = document.createElement('style');
    cardPreviewStyle.textContent = `
        .card-preview-section {
            margin-top: 16px;
        }
        .card-preview-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        .card-preview-title {
            font-weight: 500;
            color: var(--text-normal);
        }
        .card-preview-btn-group {
            display: flex;
            gap: 4px;
        }
        .card-preview-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            padding: 0;
            border: 1px solid var(--background-modifier-border);
            background: var(--background-primary);
            border-radius: 4px;
            cursor: pointer;
            color: var(--text-muted);
            transition: all 0.1s ease;
        }
        .card-preview-btn:hover:not(.disabled) {
            background: var(--background-modifier-hover);
            color: var(--text-normal);
            border-color: var(--interactive-accent);
        }
        .card-preview-btn.disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }
        .card-preview-container {
            padding: 12px;
            background: var(--background-secondary);
            border-radius: 8px;
        }
        .card-preview {
            position: relative;
            display: flex;
            height: 48px;
            background: var(--background-primary);
            border-radius: 6px;
            overflow: visible;
            border: 1px solid var(--background-modifier-border);
        }
        .card-preview-region {
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: var(--font-ui-smaller);
            color: var(--text-muted);
            transition: background 0.1s ease;
            border-left: 1px dashed var(--background-modifier-border);
        }
        .card-preview-region:first-child {
            border-left: none;
        }
        .card-preview-region:hover {
            background: var(--background-modifier-hover);
            color: var(--text-normal);
        }
        .card-preview-handle {
            position: absolute;
            top: -4px;
            bottom: -4px;
            width: 12px;
            margin-left: -6px;
            cursor: col-resize;
            z-index: 10;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .card-preview-handle::before {
            content: '';
            width: 4px;
            height: 24px;
            background: var(--background-modifier-border);
            border-radius: 2px;
            transition: all 0.15s ease;
        }
        .card-preview-handle:hover::before,
        .card-preview-handle.dragging::before {
            background: var(--interactive-accent);
            height: 100%;
        }
        .no-regions-notice {
            color: var(--text-muted);
            font-style: italic;
        }
        .region-commands-section {
            margin-top: 16px;
        }
        .region-commands-section h4 {
            margin: 0 0 12px 0;
            font-size: var(--font-ui-medium);
            font-weight: 500;
        }
        .command-dropdown-wrapper {
            position: relative;
            width: 280px;
        }
        .command-dropdown-input {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid var(--background-modifier-border);
            border-radius: 6px;
            background: var(--background-primary);
            color: var(--text-normal);
            font-size: var(--font-ui-small);
            transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .command-dropdown-input::placeholder {
            color: var(--text-faint);
        }
        .command-dropdown-input:focus {
            outline: none;
            border-color: var(--interactive-accent);
            box-shadow: 0 0 0 2px var(--background-modifier-border-focus);
        }
        .command-dropdown-list {
            display: none;
            position: absolute;
            top: calc(100% + 4px);
            left: 0;
            right: 0;
            max-height: 300px;
            overflow-y: auto;
            background: var(--background-primary);
            border: 1px solid var(--background-modifier-border);
            border-radius: 6px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
            z-index: 1000;
        }
        .command-dropdown-item {
            display: flex;
            align-items: center;
            padding: 10px 12px;
            cursor: pointer;
            font-size: var(--font-ui-small);
            border-bottom: 1px solid var(--background-modifier-border-hover);
            transition: background 0.1s ease;
        }
        .command-dropdown-item:last-child {
            border-bottom: none;
        }
        .command-dropdown-item:hover {
            background: var(--background-modifier-hover);
        }
        .command-dropdown-item.is-selected {
            background: var(--interactive-accent);
            color: var(--text-on-accent);
        }
        .command-dropdown-item-name {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    `;
    containerEl.appendChild(cardPreviewStyle);

    // ==========================================================================
    // DIAGNOSTICS
    // ==========================================================================

    containerEl.createEl('h3', { text: 'Diagnostics' });

    // Test search
    new Setting(containerEl)
        .setName('Test Semantic Search')
        .setDesc('Run a test search to verify the integration')
        .addButton((button) => {
            button.setButtonText('Run Test').onClick(async () => {
                button.setButtonText('Testing...');
                button.setDisabled(true);

                try {
                    if (!plugin.smartConnectionsService) {
                        new Notice('SmartConnectionsService not initialized');
                        return;
                    }

                    const activeFile = plugin.app.workspace.getActiveFile();
                    if (!activeFile) {
                        new Notice('No active file - open a note first');
                        return;
                    }

                    const startTime = Date.now();
                    const results = await plugin.smartConnectionsService.findRelated(activeFile.path, 5);
                    const duration = Date.now() - startTime;

                    if (results.length > 0) {
                        const status = plugin.smartConnectionsService.getStatus();
                        const method = status.smartConnections ? 'embeddings' : 'keywords';
                        new Notice(`Found ${results.length} related notes via ${method} in ${duration}ms`);

                        console.group('[Doc Doctor] Test Results');
                        results.forEach((r, i) => {
                            console.log(`${i + 1}. ${r.title} (${Math.round(r.similarity * 100)}%) [${r.method}]`);
                        });
                        console.groupEnd();
                    } else {
                        new Notice('No related notes found');
                    }

                    button.setButtonText('Test Complete');
                    setTimeout(() => button.setButtonText('Run Test'), 2000);
                } catch (error) {
                    console.error('[Doc Doctor] Test error:', error);
                    new Notice('Test failed - check console for details');
                    button.setButtonText('Failed');
                    setTimeout(() => button.setButtonText('Run Test'), 2000);
                } finally {
                    button.setDisabled(false);
                }
            });
        });
};
