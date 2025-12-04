/**
 * General Settings Component
 *
 * Central settings tab with feature toggles, API configuration, and unified diagnostics.
 */

import { Notice, Setting } from 'obsidian';
import type LabeledAnnotations from '../../main';
import { LLMProvider } from '../../llm/llm-types';
import { getModelsForProvider, refreshCachedModels } from '../../llm/model-fetch-service';

interface Props {
    plugin: LabeledAnnotations;
    containerEl: HTMLElement;
}

export const GeneralSettings = ({ plugin, containerEl }: Props) => {
    const settings = plugin.settings.getValue();

    // ==========================================================================
    // FEATURE TOGGLES
    // ==========================================================================

    containerEl.createEl('h2', { text: 'Features' });
    containerEl.createEl('p', {
        text: 'Enable or disable major plugin features. Disabled features will not load on startup.',
        cls: 'setting-item-description',
    });

    // Annotations toggle
    new Setting(containerEl)
        .setName('Annotations')
        .setDesc('Highlight and annotate text with labels and comments')
        .addToggle((toggle) => {
            toggle.setValue(settings.features.annotations).onChange((value) => {
                plugin.settings.dispatch({
                    type: 'SET_FEATURE_ANNOTATIONS',
                    payload: { enabled: value },
                });
                new Notice(`Annotations ${value ? 'enabled' : 'disabled'}. Restart Obsidian to apply.`);
            });
        });

    // Stubs toggle
    new Setting(containerEl)
        .setName('Stubs')
        .setDesc('Track document gaps, TODOs, and incomplete sections')
        .addToggle((toggle) => {
            toggle.setValue(settings.features.stubs).onChange((value) => {
                plugin.settings.dispatch({
                    type: 'SET_FEATURE_STUBS',
                    payload: { enabled: value },
                });
                new Notice(`Stubs ${value ? 'enabled' : 'disabled'}. Restart Obsidian to apply.`);
            });
        });

    // AI toggle
    new Setting(containerEl)
        .setName('AI')
        .setDesc('LLM-powered document analysis and stub suggestions')
        .addToggle((toggle) => {
            toggle.setValue(settings.features.ai).onChange((value) => {
                plugin.settings.dispatch({
                    type: 'SET_FEATURE_AI',
                    payload: { enabled: value },
                });
                new Notice(`AI ${value ? 'enabled' : 'disabled'}. Restart Obsidian to apply.`);
            });
        });

    // Explore toggle
    new Setting(containerEl)
        .setName('Explore')
        .setDesc('Semantic search and related notes via Smart Connections')
        .addToggle((toggle) => {
            toggle.setValue(settings.features.explore).onChange((value) => {
                plugin.settings.dispatch({
                    type: 'SET_FEATURE_EXPLORE',
                    payload: { enabled: value },
                });
                new Notice(`Explore ${value ? 'enabled' : 'disabled'}. Restart Obsidian to apply.`);
            });
        });

    // ==========================================================================
    // API CONFIGURATION
    // ==========================================================================

    containerEl.createEl('h2', { text: 'API Configuration' });

    const llmConfig = settings.llm;

    // Provider display names
    const providerNames: Record<LLMProvider, string> = {
        anthropic: 'Anthropic',
        openai: 'OpenAI',
        gemini: 'Google Gemini',
    };

    // Provider selection
    new Setting(containerEl)
        .setName('LLM Provider')
        .setDesc('Select your AI provider for document analysis')
        .addDropdown((dropdown) => {
            dropdown
                .addOption('anthropic', 'Anthropic (Claude)')
                .addOption('openai', 'OpenAI (GPT)')
                .addOption('gemini', 'Google (Gemini)')
                .setValue(llmConfig.provider)
                .onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'LLM_SET_PROVIDER',
                        payload: { provider: value as LLMProvider },
                    });
                    // Also update the active provider for web search config
                    plugin.settings.dispatch({
                        type: 'PROVIDERS_SET_ACTIVE_LLM_PROVIDER',
                        payload: { provider: value as 'anthropic' | 'openai' | 'gemini' },
                    });
                    // Refresh settings display to update model options
                    containerEl.empty();
                    GeneralSettings({ plugin, containerEl });
                });
        });

    // Get the current API key for the selected provider
    const currentApiKey = llmConfig.apiKeys?.[llmConfig.provider] || llmConfig.apiKey || '';

    // API Key (provider-specific)
    const apiKeySetting = new Setting(containerEl)
        .setName(`${providerNames[llmConfig.provider]} API Key`)
        .setDesc(`Your API key for ${providerNames[llmConfig.provider]}`);

    apiKeySetting.addText((text) => {
        text.inputEl.type = 'password';
        text.inputEl.style.width = '250px';
        text.setPlaceholder(`Enter ${providerNames[llmConfig.provider]} API key...`)
            .setValue(currentApiKey)
            .onChange((value) => {
                plugin.settings.dispatch({
                    type: 'LLM_SET_API_KEY',
                    payload: { apiKey: value.trim() },
                });
            });
    });

    apiKeySetting.addButton((button) => {
        let isVisible = false;
        button.setButtonText('Show').onClick(() => {
            const input = apiKeySetting.controlEl.querySelector('input');
            if (input) {
                isVisible = !isVisible;
                input.type = isVisible ? 'text' : 'password';
                button.setButtonText(isVisible ? 'Hide' : 'Show');
            }
        });
    });

    // Model selection with cached models
    const cachedModels = llmConfig.cachedModels;
    const models = getModelsForProvider(llmConfig.provider, cachedModels);

    // Check if using cached or default models
    const providerCache = cachedModels?.[llmConfig.provider];
    const isCached = providerCache && providerCache.models.length > 0;
    const cacheDate = providerCache?.fetchedAt
        ? new Date(providerCache.fetchedAt).toLocaleDateString()
        : null;

    const modelSetting = new Setting(containerEl)
        .setName('Model')
        .setDesc(isCached
            ? `Models last fetched: ${cacheDate}`
            : 'Using default models (fetch with Refresh)');

    modelSetting.addDropdown((dropdown) => {
        models.forEach((model) => {
            const label = model.recommended ? `${model.name} (recommended)` : model.name;
            dropdown.addOption(model.id, label);
        });
        // Ensure current model is in list, add if not
        if (!models.some(m => m.id === llmConfig.model)) {
            dropdown.addOption(llmConfig.model, llmConfig.model);
        }
        dropdown.setValue(llmConfig.model).onChange((value) => {
            plugin.settings.dispatch({
                type: 'LLM_SET_MODEL',
                payload: { model: value },
            });
        });
    });

    // Refresh models button
    modelSetting.addButton((button) => {
        button.setButtonText('Refresh').onClick(async () => {
            if (!currentApiKey) {
                button.setButtonText('No API Key');
                setTimeout(() => button.setButtonText('Refresh'), 2000);
                return;
            }

            button.setButtonText('Fetching...');
            button.setDisabled(true);

            try {
                const updatedCache = await refreshCachedModels(
                    llmConfig.provider,
                    currentApiKey,
                    llmConfig.cachedModels,
                );

                plugin.settings.dispatch({
                    type: 'LLM_SET_CACHED_MODELS',
                    payload: { cachedModels: updatedCache },
                });

                button.setButtonText('Updated!');
                setTimeout(() => {
                    containerEl.empty();
                    GeneralSettings({ plugin, containerEl });
                }, 1000);
            } catch (error) {
                console.error('[Doc Doctor] Model fetch error:', error);
                button.setButtonText('Error');
                setTimeout(() => button.setButtonText('Refresh'), 2000);
            } finally {
                button.setDisabled(false);
            }
        });
    });

    // OpenAlex Email (for academic search)
    const providers = settings.providers;
    new Setting(containerEl)
        .setName('OpenAlex Email')
        .setDesc('Optional: Email for faster academic paper search (polite pool access)')
        .addText((text) => {
            text.inputEl.style.width = '250px';
            text.setPlaceholder('your@email.com')
                .setValue(providers?.externalContext?.openAlex?.email || '')
                .onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'PROVIDERS_SET_OPENALEX_EMAIL',
                        payload: { email: value.trim() },
                    });
                });
        });

    // ==========================================================================
    // UNIFIED DIAGNOSTICS
    // ==========================================================================

    containerEl.createEl('h2', { text: 'Diagnostics' });
    containerEl.createEl('p', {
        text: 'Test connections to external services and plugins.',
        cls: 'setting-item-description',
    });

    // Helper to format last tested time
    const formatLastTested = (timestamp: number | null): string => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return `Last tested: ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
    };

    // Get diagnostic states (with defaults for backwards compatibility)
    const diagnostics = settings.diagnostics || {
        llm: { status: 'untested', lastTested: null },
        mcp: { status: 'untested', lastTested: null },
        smartConnections: { status: 'untested', lastTested: null },
    };

    // -------------------------------------------------------------------------
    // LLM Connection Test
    // -------------------------------------------------------------------------
    const llmDiag = diagnostics.llm;
    const llmDiagSetting = new Setting(containerEl)
        .setName('LLM Connection');

    const llmStatusEl = llmDiagSetting.descEl.createEl('div', { cls: 'diagnostic-status-container' });

    const renderLLMStatus = () => {
        llmStatusEl.empty();
        const currentDiag = plugin.settings.getValue().diagnostics?.llm || llmDiag;

        const statusSpan = llmStatusEl.createEl('span', { cls: 'diagnostic-status' });
        if (!currentApiKey) {
            statusSpan.textContent = '○ No API key configured';
            statusSpan.style.color = 'var(--text-muted)';
        } else if (currentDiag.status === 'testing') {
            statusSpan.textContent = '○ Testing...';
            statusSpan.style.color = 'var(--text-muted)';
        } else if (currentDiag.status === 'success') {
            statusSpan.textContent = '● Connected';
            statusSpan.style.color = 'var(--color-green)';
        } else if (currentDiag.status === 'error') {
            statusSpan.textContent = `○ ${currentDiag.message || 'Error'}`;
            statusSpan.style.color = 'var(--text-error)';
        } else {
            statusSpan.textContent = '○ Not tested';
        }

        if (currentDiag.lastTested) {
            llmStatusEl.createEl('span', {
                text: formatLastTested(currentDiag.lastTested),
                cls: 'diagnostic-timestamp',
            });
        }
    };
    renderLLMStatus();

    llmDiagSetting.addButton((button) => {
        button.setButtonText('Test').onClick(async () => {
            button.setButtonText('Testing...');
            button.setDisabled(true);

            plugin.settings.dispatch({
                type: 'SET_DIAGNOSTIC_LLM',
                payload: { status: 'testing' },
            });
            renderLLMStatus();

            try {
                const { getLLMService } = await import('../../llm/llm-service');
                const testSettings = plugin.settings.getValue();
                const service = getLLMService(testSettings.llm, testSettings.stubs);
                const result = await service.testConnection();

                if (result.success) {
                    plugin.settings.dispatch({
                        type: 'SET_DIAGNOSTIC_LLM',
                        payload: { status: 'success', message: 'Connected' },
                    });

                    // Refresh models on successful connection
                    try {
                        const updatedCache = await refreshCachedModels(
                            testSettings.llm.provider,
                            currentApiKey,
                            testSettings.llm.cachedModels,
                        );

                        plugin.settings.dispatch({
                            type: 'LLM_SET_CACHED_MODELS',
                            payload: { cachedModels: updatedCache },
                        });
                    } catch (modelError) {
                        console.warn('[Doc Doctor] Model fetch failed:', modelError);
                    }
                } else {
                    plugin.settings.dispatch({
                        type: 'SET_DIAGNOSTIC_LLM',
                        payload: { status: 'error', message: result.message || 'Connection failed' },
                    });
                }
            } catch (error) {
                plugin.settings.dispatch({
                    type: 'SET_DIAGNOSTIC_LLM',
                    payload: { status: 'error', message: 'Connection error' },
                });
            } finally {
                button.setButtonText('Test');
                button.setDisabled(false);
                renderLLMStatus();
            }
        });
    });

    // -------------------------------------------------------------------------
    // MCP Server Test
    // -------------------------------------------------------------------------
    const mcpDiag = diagnostics.mcp;
    const mcpDiagSetting = new Setting(containerEl)
        .setName('MCP Server');

    const mcpStatusEl = mcpDiagSetting.descEl.createEl('div', { cls: 'diagnostic-status-container' });

    const renderMCPStatus = () => {
        mcpStatusEl.empty();
        const currentDiag = plugin.settings.getValue().diagnostics?.mcp || mcpDiag;

        const statusSpan = mcpStatusEl.createEl('span', { cls: 'diagnostic-status' });
        if (currentDiag.status === 'testing') {
            statusSpan.textContent = '○ Testing...';
            statusSpan.style.color = 'var(--text-muted)';
        } else if (currentDiag.status === 'success') {
            // Build status text with version and tools count
            let statusText = '● Connected';
            const details: string[] = [];
            if (currentDiag.version) details.push(`v${currentDiag.version}`);
            if (currentDiag.message) details.push(currentDiag.message);
            if (details.length > 0) statusText += ` (${details.join(', ')})`;
            statusSpan.textContent = statusText;
            statusSpan.style.color = 'var(--color-green)';
        } else if (currentDiag.status === 'error') {
            statusSpan.textContent = `○ ${currentDiag.message || 'Error'}`;
            statusSpan.style.color = 'var(--text-error)';
        } else {
            statusSpan.textContent = '○ Not tested';
        }

        if (currentDiag.lastTested) {
            mcpStatusEl.createEl('span', {
                text: formatLastTested(currentDiag.lastTested),
                cls: 'diagnostic-timestamp',
            });
        }
    };
    renderMCPStatus();

    mcpDiagSetting.addButton((button) => {
        button.setButtonText('Test').onClick(async () => {
            button.setButtonText('Testing...');
            button.setDisabled(true);

            plugin.settings.dispatch({
                type: 'SET_DIAGNOSTIC_MCP',
                payload: { status: 'testing' },
            });
            renderMCPStatus();

            try {
                if (!plugin.mcpClient) {
                    plugin.settings.dispatch({
                        type: 'SET_DIAGNOSTIC_MCP',
                        payload: { status: 'error', message: 'MCP client not initialized' },
                    });
                } else {
                    await plugin.mcpClient.connect();
                    const isConnected = plugin.mcpClient.isConnected?.() ?? false;

                    if (isConnected) {
                        // Get version and tools count
                        const version = plugin.mcpClient?.getServerVersion?.() ?? undefined;
                        let toolsCount = 0;
                        try {
                            const tools = await plugin.mcpClient?.listTools?.();
                            toolsCount = tools?.length || 0;
                        } catch { /* ignore */ }
                        const message = toolsCount > 0 ? `${toolsCount} tools` : undefined;
                        plugin.settings.dispatch({
                            type: 'SET_DIAGNOSTIC_MCP',
                            payload: { status: 'success', message, version },
                        });
                    } else {
                        plugin.settings.dispatch({
                            type: 'SET_DIAGNOSTIC_MCP',
                            payload: { status: 'error', message: 'Failed to connect' },
                        });
                    }
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Connection error';
                plugin.settings.dispatch({
                    type: 'SET_DIAGNOSTIC_MCP',
                    payload: { status: 'error', message: errorMsg },
                });
            } finally {
                button.setButtonText('Test');
                button.setDisabled(false);
                renderMCPStatus();
            }
        });
    });

    // -------------------------------------------------------------------------
    // Smart Connections Test
    // -------------------------------------------------------------------------
    const scDiag = diagnostics.smartConnections;
    const scDiagSetting = new Setting(containerEl)
        .setName('Smart Connections');

    const scStatusEl = scDiagSetting.descEl.createEl('div', { cls: 'diagnostic-status-container' });

    const renderSCStatus = () => {
        scStatusEl.empty();
        const currentDiag = plugin.settings.getValue().diagnostics?.smartConnections || scDiag;

        const statusSpan = scStatusEl.createEl('span', { cls: 'diagnostic-status' });
        if (currentDiag.status === 'testing') {
            statusSpan.textContent = '○ Testing...';
            statusSpan.style.color = 'var(--text-muted)';
        } else if (currentDiag.status === 'success') {
            statusSpan.textContent = currentDiag.message || '● Connected';
            statusSpan.style.color = 'var(--color-green)';
        } else if (currentDiag.status === 'error') {
            statusSpan.textContent = `○ ${currentDiag.message || 'Error'}`;
            statusSpan.style.color = 'var(--text-error)';
        } else {
            statusSpan.textContent = '○ Not tested';
        }

        if (currentDiag.lastTested) {
            scStatusEl.createEl('span', {
                text: formatLastTested(currentDiag.lastTested),
                cls: 'diagnostic-timestamp',
            });
        }
    };
    renderSCStatus();

    scDiagSetting.addButton((button) => {
        button.setButtonText('Test').onClick(async () => {
            button.setButtonText('Testing...');
            button.setDisabled(true);

            plugin.settings.dispatch({
                type: 'SET_DIAGNOSTIC_SMART_CONNECTIONS',
                payload: { status: 'testing' },
            });
            renderSCStatus();

            try {
                if (!plugin.smartConnectionsService) {
                    plugin.settings.dispatch({
                        type: 'SET_DIAGNOSTIC_SMART_CONNECTIONS',
                        payload: { status: 'error', message: 'Service not initialized' },
                    });
                } else {
                    plugin.smartConnectionsService.refreshApiReference();
                    const status = plugin.smartConnectionsService.getStatus();

                    if (status.smartConnections) {
                        const message = status.embeddingsCount > 0
                            ? `● Connected (${status.embeddingsCount} embeddings)`
                            : '● Connected';
                        plugin.settings.dispatch({
                            type: 'SET_DIAGNOSTIC_SMART_CONNECTIONS',
                            payload: { status: 'success', message },
                        });
                    } else if (status.fallbackMode) {
                        plugin.settings.dispatch({
                            type: 'SET_DIAGNOSTIC_SMART_CONNECTIONS',
                            payload: { status: 'error', message: 'Fallback mode (plugin not available)' },
                        });
                    } else {
                        plugin.settings.dispatch({
                            type: 'SET_DIAGNOSTIC_SMART_CONNECTIONS',
                            payload: { status: 'error', message: status.error || 'Not available' },
                        });
                    }
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Test error';
                plugin.settings.dispatch({
                    type: 'SET_DIAGNOSTIC_SMART_CONNECTIONS',
                    payload: { status: 'error', message: errorMsg },
                });
            } finally {
                button.setButtonText('Test');
                button.setDisabled(false);
                renderSCStatus();
            }
        });
    });

    // -------------------------------------------------------------------------
    // Obsidian Git Plugin Test
    // -------------------------------------------------------------------------
    const gitDiag = diagnostics.obsidianGit || { status: 'untested', lastTested: null };
    const gitDiagSetting = new Setting(containerEl)
        .setName('Obsidian Git');

    const gitStatusEl = gitDiagSetting.descEl.createEl('div', { cls: 'diagnostic-status-container' });

    const renderGitStatus = () => {
        gitStatusEl.empty();
        const currentDiag = plugin.settings.getValue().diagnostics?.obsidianGit || gitDiag;

        const statusSpan = gitStatusEl.createEl('span', { cls: 'diagnostic-status' });
        if (currentDiag.status === 'testing') {
            statusSpan.textContent = '○ Testing...';
            statusSpan.style.color = 'var(--text-muted)';
        } else if (currentDiag.status === 'success') {
            const versionText = currentDiag.version ? ` (v${currentDiag.version})` : '';
            statusSpan.textContent = `● Available${versionText}`;
            statusSpan.style.color = 'var(--color-green)';
        } else if (currentDiag.status === 'error') {
            statusSpan.textContent = `○ ${currentDiag.message || 'Not available'}`;
            statusSpan.style.color = 'var(--text-muted)';
        } else {
            statusSpan.textContent = '○ Not tested';
        }

        if (currentDiag.lastTested) {
            gitStatusEl.createEl('span', {
                text: formatLastTested(currentDiag.lastTested),
                cls: 'diagnostic-timestamp',
            });
        }
    };
    renderGitStatus();

    gitDiagSetting.addButton((button) => {
        button.setButtonText('Test').onClick(async () => {
            button.setButtonText('Testing...');
            button.setDisabled(true);

            plugin.settings.dispatch({
                type: 'SET_DIAGNOSTIC_OBSIDIAN_GIT',
                payload: { status: 'testing' },
            });
            renderGitStatus();

            try {
                const plugins = (plugin.app as any).plugins?.plugins;
                const gitPlugin = plugins?.['obsidian-git'];

                if (gitPlugin) {
                    const version = gitPlugin.manifest?.version;
                    plugin.settings.dispatch({
                        type: 'SET_DIAGNOSTIC_OBSIDIAN_GIT',
                        payload: { status: 'success', message: 'Available', version },
                    });
                } else {
                    plugin.settings.dispatch({
                        type: 'SET_DIAGNOSTIC_OBSIDIAN_GIT',
                        payload: { status: 'error', message: 'Not installed' },
                    });
                }
            } catch (error) {
                plugin.settings.dispatch({
                    type: 'SET_DIAGNOSTIC_OBSIDIAN_GIT',
                    payload: { status: 'error', message: 'Check failed' },
                });
            } finally {
                button.setButtonText('Test');
                button.setDisabled(false);
                renderGitStatus();
            }
        });
    });

    // -------------------------------------------------------------------------
    // Dataview Plugin Test
    // -------------------------------------------------------------------------
    const dvDiag = diagnostics.dataview || { status: 'untested', lastTested: null };
    const dvDiagSetting = new Setting(containerEl)
        .setName('Dataview');

    const dvStatusEl = dvDiagSetting.descEl.createEl('div', { cls: 'diagnostic-status-container' });

    const renderDataviewStatus = () => {
        dvStatusEl.empty();
        const currentDiag = plugin.settings.getValue().diagnostics?.dataview || dvDiag;

        const statusSpan = dvStatusEl.createEl('span', { cls: 'diagnostic-status' });
        if (currentDiag.status === 'testing') {
            statusSpan.textContent = '○ Testing...';
            statusSpan.style.color = 'var(--text-muted)';
        } else if (currentDiag.status === 'success') {
            const versionText = currentDiag.version ? ` (v${currentDiag.version})` : '';
            statusSpan.textContent = `● Available${versionText}`;
            statusSpan.style.color = 'var(--color-green)';
        } else if (currentDiag.status === 'error') {
            statusSpan.textContent = `○ ${currentDiag.message || 'Not available'}`;
            statusSpan.style.color = 'var(--text-muted)';
        } else {
            statusSpan.textContent = '○ Not tested';
        }

        if (currentDiag.lastTested) {
            dvStatusEl.createEl('span', {
                text: formatLastTested(currentDiag.lastTested),
                cls: 'diagnostic-timestamp',
            });
        }
    };
    renderDataviewStatus();

    dvDiagSetting.addButton((button) => {
        button.setButtonText('Test').onClick(async () => {
            button.setButtonText('Testing...');
            button.setDisabled(true);

            plugin.settings.dispatch({
                type: 'SET_DIAGNOSTIC_DATAVIEW',
                payload: { status: 'testing' },
            });
            renderDataviewStatus();

            try {
                const plugins = (plugin.app as any).plugins?.plugins;
                const dataviewPlugin = plugins?.['dataview'];

                if (dataviewPlugin) {
                    const version = dataviewPlugin.manifest?.version;
                    plugin.settings.dispatch({
                        type: 'SET_DIAGNOSTIC_DATAVIEW',
                        payload: { status: 'success', message: 'Available', version },
                    });
                } else {
                    plugin.settings.dispatch({
                        type: 'SET_DIAGNOSTIC_DATAVIEW',
                        payload: { status: 'error', message: 'Not installed' },
                    });
                }
            } catch (error) {
                plugin.settings.dispatch({
                    type: 'SET_DIAGNOSTIC_DATAVIEW',
                    payload: { status: 'error', message: 'Check failed' },
                });
            } finally {
                button.setButtonText('Test');
                button.setDisabled(false);
                renderDataviewStatus();
            }
        });
    });

    // -------------------------------------------------------------------------
    // Run All Diagnostics
    // -------------------------------------------------------------------------
    const runAllTestFns: Array<() => Promise<void>> = [];

    // Store test functions for Run All
    const runLLMTest = async () => {
        plugin.settings.dispatch({ type: 'SET_DIAGNOSTIC_LLM', payload: { status: 'testing' } });
        renderLLMStatus();
        try {
            const { getLLMService } = await import('../../llm/llm-service');
            const testSettings = plugin.settings.getValue();
            const service = getLLMService(testSettings.llm, testSettings.stubs);
            const result = await service.testConnection();
            if (result.success) {
                plugin.settings.dispatch({ type: 'SET_DIAGNOSTIC_LLM', payload: { status: 'success', message: 'Connected' } });
                // Refresh models
                try {
                    const updatedCache = await refreshCachedModels(testSettings.llm.provider, currentApiKey, testSettings.llm.cachedModels);
                    plugin.settings.dispatch({ type: 'LLM_SET_CACHED_MODELS', payload: { cachedModels: updatedCache } });
                } catch { /* ignore */ }
            } else {
                plugin.settings.dispatch({ type: 'SET_DIAGNOSTIC_LLM', payload: { status: 'error', message: result.message || 'Failed' } });
            }
        } catch {
            plugin.settings.dispatch({ type: 'SET_DIAGNOSTIC_LLM', payload: { status: 'error', message: 'Error' } });
        }
        renderLLMStatus();
    };

    const runMCPTest = async () => {
        plugin.settings.dispatch({ type: 'SET_DIAGNOSTIC_MCP', payload: { status: 'testing' } });
        renderMCPStatus();
        try {
            if (!plugin.mcpClient) {
                plugin.settings.dispatch({ type: 'SET_DIAGNOSTIC_MCP', payload: { status: 'error', message: 'Not initialized' } });
            } else {
                await plugin.mcpClient.connect();
                const isConnected = plugin.mcpClient.isConnected?.() ?? false;
                if (isConnected) {
                    // Get version and tools count
                    const version = plugin.mcpClient?.getServerVersion?.() ?? undefined;
                    let toolsCount = 0;
                    try {
                        const tools = await plugin.mcpClient?.listTools?.();
                        toolsCount = tools?.length || 0;
                    } catch { /* ignore */ }
                    const message = toolsCount > 0 ? `${toolsCount} tools` : undefined;
                    plugin.settings.dispatch({ type: 'SET_DIAGNOSTIC_MCP', payload: { status: 'success', message, version } });
                } else {
                    plugin.settings.dispatch({ type: 'SET_DIAGNOSTIC_MCP', payload: { status: 'error', message: 'Failed to connect' } });
                }
            }
        } catch (e) {
            plugin.settings.dispatch({ type: 'SET_DIAGNOSTIC_MCP', payload: { status: 'error', message: e instanceof Error ? e.message : 'Error' } });
        }
        renderMCPStatus();
    };

    const runSCTest = async () => {
        plugin.settings.dispatch({ type: 'SET_DIAGNOSTIC_SMART_CONNECTIONS', payload: { status: 'testing' } });
        renderSCStatus();
        try {
            if (!plugin.smartConnectionsService) {
                plugin.settings.dispatch({ type: 'SET_DIAGNOSTIC_SMART_CONNECTIONS', payload: { status: 'error', message: 'Not initialized' } });
            } else {
                plugin.smartConnectionsService.refreshApiReference();
                const status = plugin.smartConnectionsService.getStatus();
                if (status.smartConnections) {
                    const message = status.embeddingsCount > 0 ? `● Connected (${status.embeddingsCount} embeddings)` : '● Connected';
                    plugin.settings.dispatch({ type: 'SET_DIAGNOSTIC_SMART_CONNECTIONS', payload: { status: 'success', message } });
                } else if (status.fallbackMode) {
                    plugin.settings.dispatch({ type: 'SET_DIAGNOSTIC_SMART_CONNECTIONS', payload: { status: 'error', message: 'Fallback mode' } });
                } else {
                    plugin.settings.dispatch({ type: 'SET_DIAGNOSTIC_SMART_CONNECTIONS', payload: { status: 'error', message: status.error || 'Not available' } });
                }
            }
        } catch (e) {
            plugin.settings.dispatch({ type: 'SET_DIAGNOSTIC_SMART_CONNECTIONS', payload: { status: 'error', message: 'Error' } });
        }
        renderSCStatus();
    };

    const runGitTest = async () => {
        plugin.settings.dispatch({ type: 'SET_DIAGNOSTIC_OBSIDIAN_GIT', payload: { status: 'testing' } });
        renderGitStatus();
        const plugins = (plugin.app as any).plugins?.plugins;
        const gitPlugin = plugins?.['obsidian-git'];
        if (gitPlugin) {
            plugin.settings.dispatch({ type: 'SET_DIAGNOSTIC_OBSIDIAN_GIT', payload: { status: 'success', version: gitPlugin.manifest?.version } });
        } else {
            plugin.settings.dispatch({ type: 'SET_DIAGNOSTIC_OBSIDIAN_GIT', payload: { status: 'error', message: 'Not installed' } });
        }
        renderGitStatus();
    };

    const runDataviewTest = async () => {
        plugin.settings.dispatch({ type: 'SET_DIAGNOSTIC_DATAVIEW', payload: { status: 'testing' } });
        renderDataviewStatus();
        const plugins = (plugin.app as any).plugins?.plugins;
        const dataviewPlugin = plugins?.['dataview'];
        if (dataviewPlugin) {
            plugin.settings.dispatch({ type: 'SET_DIAGNOSTIC_DATAVIEW', payload: { status: 'success', version: dataviewPlugin.manifest?.version } });
        } else {
            plugin.settings.dispatch({ type: 'SET_DIAGNOSTIC_DATAVIEW', payload: { status: 'error', message: 'Not installed' } });
        }
        renderDataviewStatus();
    };

    new Setting(containerEl)
        .addButton((button) => {
            button
                .setButtonText('Run All Diagnostics')
                .setCta()
                .onClick(async () => {
                    button.setButtonText('Running...');
                    button.setDisabled(true);

                    // Run all tests in parallel
                    await Promise.all([
                        runLLMTest(),
                        runMCPTest(),
                        runSCTest(),
                        runGitTest(),
                        runDataviewTest(),
                    ]);

                    button.setButtonText('Run All Diagnostics');
                    button.setDisabled(false);
                    new Notice('All diagnostics completed');
                });
        });

    // ==========================================================================
    // DEBUG MODE
    // ==========================================================================

    containerEl.createEl('h2', { text: 'Debug Mode' });

    // Enable debug
    new Setting(containerEl)
        .setName('Enable Debug Logging')
        .setDesc('Show detailed logs in developer console')
        .addToggle((toggle) => {
            toggle.setValue(llmConfig.debug.enabled).onChange((value) => {
                plugin.settings.dispatch({
                    type: 'LLM_SET_DEBUG_ENABLED',
                    payload: { enabled: value },
                });
            });
        });

    // Dry run mode
    new Setting(containerEl)
        .setName('Dry Run Mode')
        .setDesc('Preview prompts without making API calls')
        .addToggle((toggle) => {
            toggle.setValue(llmConfig.debug.dryRunMode).onChange((value) => {
                plugin.settings.dispatch({
                    type: 'LLM_SET_DRY_RUN_MODE',
                    payload: { enabled: value },
                });
            });
        });

    // Log level
    new Setting(containerEl)
        .setName('Log Level')
        .setDesc('Verbosity of debug output')
        .addDropdown((dropdown) => {
            dropdown
                .addOption('error', 'Error')
                .addOption('warn', 'Warning')
                .addOption('info', 'Info')
                .addOption('debug', 'Debug')
                .setValue(llmConfig.debug.logLevel)
                .onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'LLM_SET_DEBUG_LOG_LEVEL',
                        payload: { level: value as 'error' | 'warn' | 'info' | 'debug' },
                    });
                });
        });

    // Add styles for diagnostic status
    const style = document.createElement('style');
    style.textContent = `
        .diagnostic-status-container {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        .diagnostic-status {
            font-size: var(--font-ui-small);
        }
        .diagnostic-timestamp {
            font-size: var(--font-ui-smaller);
            color: var(--text-muted);
            opacity: 0.8;
        }
    `;
    containerEl.appendChild(style);
};
