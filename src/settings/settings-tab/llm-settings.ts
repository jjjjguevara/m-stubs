/**
 * LLM Settings Component
 *
 * Settings UI for LLM-powered stub suggestions configuration.
 * API configuration (provider, key, model) is in General tab.
 */

import { Setting } from 'obsidian';
import type LabeledAnnotations from '../../main';

interface Props {
    plugin: LabeledAnnotations;
    containerEl: HTMLElement;
}

export const LLMSettings = ({ plugin, containerEl }: Props) => {
    const settings = plugin.settings.getValue();
    const llmConfig = settings.llm;

    // Header
    containerEl.createEl('h2', { text: 'AI Analysis Settings' });
    containerEl.createEl('p', {
        text: 'Configure AI-powered document analysis behavior. Provider and API settings are in the General tab.',
        cls: 'setting-item-description',
    });

    // Enable LLM
    new Setting(containerEl)
        .setName('Enable LLM Features')
        .setDesc('Enable AI-powered document analysis and stub suggestions')
        .addToggle((toggle) => {
            toggle.setValue(llmConfig.enabled).onChange((value) => {
                plugin.settings.dispatch({
                    type: 'LLM_SET_ENABLED',
                    payload: { enabled: value },
                });
                // Refresh settings display
                containerEl.empty();
                LLMSettings({ plugin, containerEl });
            });
        });

    // Only show remaining settings if enabled
    if (!llmConfig.enabled) {
        return;
    }

    // ==========================================================================
    // ANALYSIS SETTINGS
    // ==========================================================================

    containerEl.createEl('h3', { text: 'Analysis Settings' });

    // Insertion order
    new Setting(containerEl)
        .setName('Insertion Order')
        .setDesc('Where to insert new stubs and references in the array')
        .addDropdown((dropdown) => {
            dropdown
                .addOption('bottom', 'Bottom (append)')
                .addOption('top', 'Top (prepend)')
                .setValue(llmConfig.insertionOrder || 'bottom')
                .onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'LLM_SET_INSERTION_ORDER',
                        payload: { order: value as 'top' | 'bottom' },
                    });
                });
        });

    // Max tokens
    new Setting(containerEl)
        .setName('Max Tokens')
        .setDesc('Maximum tokens for LLM response (256-8192)')
        .addSlider((slider) => {
            slider
                .setLimits(256, 8192, 256)
                .setValue(llmConfig.maxTokens)
                .setDynamicTooltip()
                .onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'LLM_SET_MAX_TOKENS',
                        payload: { maxTokens: value },
                    });
                });
        });

    // Temperature
    new Setting(containerEl)
        .setName('Temperature')
        .setDesc('Lower = more consistent, higher = more creative (0-1)')
        .addSlider((slider) => {
            slider
                .setLimits(0, 1, 0.1)
                .setValue(llmConfig.temperature)
                .setDynamicTooltip()
                .onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'LLM_SET_TEMPERATURE',
                        payload: { temperature: value },
                    });
                });
        });

    // Timeout
    new Setting(containerEl)
        .setName('Request Timeout')
        .setDesc('Maximum time to wait for response (seconds)')
        .addSlider((slider) => {
            slider
                .setLimits(10, 120, 5)
                .setValue(llmConfig.timeout / 1000)
                .setDynamicTooltip()
                .onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'LLM_SET_TIMEOUT',
                        payload: { timeout: value * 1000 },
                    });
                });
        });

    // ==========================================================================
    // REFERENCE PROPERTIES
    // ==========================================================================

    containerEl.createEl('h3', { text: 'Reference Properties' });

    // Separate reference properties toggle
    new Setting(containerEl)
        .setName('Separate Vault and Web References')
        .setDesc('Use different frontmatter properties for vault links vs web URLs')
        .addToggle((toggle) => {
            toggle
                .setValue(llmConfig.separateReferenceProperties || false)
                .onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'LLM_SET_SEPARATE_REFERENCE_PROPERTIES',
                        payload: { enabled: value },
                    });
                    // Refresh settings display
                    containerEl.empty();
                    LLMSettings({ plugin, containerEl });
                });
        });

    // Vault reference property
    new Setting(containerEl)
        .setName(llmConfig.separateReferenceProperties ? 'Vault Reference Property' : 'Reference Property')
        .setDesc(llmConfig.separateReferenceProperties
            ? 'Frontmatter property for internal vault links'
            : 'Frontmatter property for all references')
        .addText((text) => {
            text.setPlaceholder('references')
                .setValue(llmConfig.vaultReferenceProperty || 'references')
                .onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'LLM_SET_VAULT_REFERENCE_PROPERTY',
                        payload: { property: value.trim() || 'references' },
                    });
                });
        });

    // Web reference property (only show if separate properties enabled)
    if (llmConfig.separateReferenceProperties) {
        new Setting(containerEl)
            .setName('Web Reference Property')
            .setDesc('Frontmatter property for external web URLs')
            .addText((text) => {
                text.setPlaceholder('sources')
                    .setValue(llmConfig.webReferenceProperty || 'references')
                    .onChange((value) => {
                        plugin.settings.dispatch({
                            type: 'LLM_SET_WEB_REFERENCE_PROPERTY',
                            payload: { property: value.trim() || 'references' },
                        });
                    });
            });
    }

    // ==========================================================================
    // EXTERNAL CONTEXT PROVIDERS SECTION
    // ==========================================================================

    // Import and render providers settings
    import('./providers-settings').then(({ ProvidersSettings }) => {
        ProvidersSettings({ plugin, containerEl });
    });

    // ==========================================================================
    // STUB CONFIG SCHEMA SECTION
    // ==========================================================================

    containerEl.createEl('h3', { text: 'Custom Stub Schema' });
    containerEl.createEl('p', {
        text: 'Use an external YAML or JSON file to define custom stub types for LLM analysis.',
        cls: 'setting-item-description',
    });

    // Enable custom schema
    new Setting(containerEl)
        .setName('Enable Custom Schema')
        .setDesc('Load stub type definitions from an external file')
        .addToggle((toggle) => {
            toggle.setValue(llmConfig.stubConfigSchemaEnabled || false).onChange((value) => {
                plugin.settings.dispatch({
                    type: 'LLM_SET_STUB_CONFIG_SCHEMA_ENABLED',
                    payload: { enabled: value },
                });
                containerEl.empty();
                LLMSettings({ plugin, containerEl });
            });
        });

    if (llmConfig.stubConfigSchemaEnabled) {
        // Schema file path
        new Setting(containerEl)
            .setName('Schema File Path')
            .setDesc('Vault-relative path to your stub schema file (YAML or JSON)')
            .addText((text) => {
                text.inputEl.style.width = '300px';
                text.setPlaceholder('config/stubs-schema.yaml')
                    .setValue(llmConfig.stubConfigSchemaPath || '')
                    .onChange((value) => {
                        plugin.settings.dispatch({
                            type: 'LLM_SET_STUB_CONFIG_SCHEMA_PATH',
                            payload: { path: value.trim() },
                        });
                    });
            });

        // Schema mode
        new Setting(containerEl)
            .setName('Schema Mode')
            .setDesc('How to handle custom schema relative to built-in types')
            .addDropdown((dropdown) => {
                dropdown
                    .addOption('merge', 'Merge - Extend/override built-in types')
                    .addOption('replace', 'Replace - Completely replace built-in types')
                    .setValue(llmConfig.stubConfigSchemaMode || 'merge')
                    .onChange((value) => {
                        plugin.settings.dispatch({
                            type: 'LLM_SET_STUB_CONFIG_SCHEMA_MODE',
                            payload: { mode: value as 'replace' | 'merge' },
                        });
                    });
            });

        // Help text
        containerEl.createEl('p', {
            text: 'Schema file should contain stub type definitions with key, displayName, color, and description fields. See documentation for format.',
            cls: 'setting-item-description',
        });
    }
};
