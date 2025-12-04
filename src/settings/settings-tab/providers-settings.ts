/**
 * Providers Settings Component
 *
 * Settings UI for external context providers:
 * - OpenAlex (academic papers)
 * - Web Search (Claude, OpenAI, Gemini)
 * - URL Scraping
 * - Smart Connections
 */

import { Setting } from 'obsidian';
import type LabeledAnnotations from '../../main';
import { LLM_PROVIDER_INFO, ACADEMIC_PROVIDER_INFO } from '../../llm/providers';

interface Props {
    plugin: LabeledAnnotations;
    containerEl: HTMLElement;
}

export const ProvidersSettings = ({ plugin, containerEl }: Props) => {
    // Create our own container to manage refreshes without affecting parent
    const providersContainer = containerEl.createEl('div', { cls: 'dd-providers-settings' });

    renderProvidersSettings(plugin, providersContainer);
};

function renderProvidersSettings(plugin: LabeledAnnotations, containerEl: HTMLElement) {
    // Clear only our container on refresh
    containerEl.empty();

    const settings = plugin.settings.getValue();
    const providers = settings.providers;
    const llmConfig = settings.llm;

    // ==========================================================================
    // HEADER
    // ==========================================================================

    containerEl.createEl('h3', { text: 'External Context Providers' });
    containerEl.createEl('p', {
        text: 'Configure external sources for enriching LLM analysis with academic papers, web search, and vault context.',
        cls: 'setting-item-description',
    });

    // ==========================================================================
    // OPENALEX (ACADEMIC SEARCH)
    // ==========================================================================

    containerEl.createEl('h4', { text: 'OpenAlex (Academic Search)' });
    containerEl.createEl('p', {
        text: `${ACADEMIC_PROVIDER_INFO.description}. ${ACADEMIC_PROVIDER_INFO.pricingInfo}.`,
        cls: 'setting-item-description',
    });

    new Setting(containerEl)
        .setName('Enable OpenAlex')
        .setDesc('Search academic papers to enrich document analysis')
        .addToggle((toggle) => {
            toggle.setValue(providers.externalContext.openAlex.enabled).onChange((value) => {
                plugin.settings.dispatch({
                    type: 'PROVIDERS_SET_OPENALEX_ENABLED',
                    payload: { enabled: value },
                });
                renderProvidersSettings(plugin, containerEl);
            });
        });

    if (providers.externalContext.openAlex.enabled) {
        // Email for polite pool
        new Setting(containerEl)
            .setName('Email (Optional)')
            .setDesc('Provide email for faster API access (polite pool)')
            .addText((text) => {
                text.inputEl.style.width = '250px';
                text.setPlaceholder('your@email.com')
                    .setValue(providers.externalContext.openAlex.email)
                    .onChange((value) => {
                        plugin.settings.dispatch({
                            type: 'PROVIDERS_SET_OPENALEX_EMAIL',
                            payload: { email: value.trim() },
                        });
                    });
            });

        // Test connection
        new Setting(containerEl)
            .setName('Test Connection')
            .setDesc('Verify OpenAlex API is accessible')
            .addButton((button) => {
                button
                    .setButtonText('Test')
                    .setCta()
                    .onClick(async () => {
                        button.setButtonText('Testing...');
                        button.setDisabled(true);

                        try {
                            const { OpenAlexService } = await import('../../llm/providers');
                            const currentSettings = plugin.settings.getValue();
                            const service = new OpenAlexService(currentSettings.providers.externalContext.openAlex);
                            const result = await service.testConnection();

                            if (result.success) {
                                button.setButtonText('Success!');
                            } else {
                                button.setButtonText('Failed');
                                console.error('[Doc Doctor] OpenAlex test failed:', result.message);
                            }
                            setTimeout(() => button.setButtonText('Test'), 2000);
                        } catch (error) {
                            button.setButtonText('Error');
                            console.error('[Doc Doctor] OpenAlex test error:', error);
                            setTimeout(() => button.setButtonText('Test'), 2000);
                        } finally {
                            button.setDisabled(false);
                        }
                    });
            });

        // Max results
        new Setting(containerEl)
            .setName('Max Results')
            .setDesc('Maximum academic papers to include')
            .addSlider((slider) => {
                slider
                    .setLimits(1, 10, 1)
                    .setValue(providers.externalContext.openAlex.maxResults)
                    .setDynamicTooltip()
                    .onChange((value) => {
                        plugin.settings.dispatch({
                            type: 'PROVIDERS_SET_OPENALEX_MAX_RESULTS',
                            payload: { max: value },
                        });
                    });
            });

        // Include abstracts
        new Setting(containerEl)
            .setName('Include Abstracts')
            .setDesc('Include paper abstracts in context (uses more tokens)')
            .addToggle((toggle) => {
                toggle.setValue(providers.externalContext.openAlex.includeAbstracts).onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'PROVIDERS_SET_OPENALEX_INCLUDE_ABSTRACTS',
                        payload: { enabled: value },
                    });
                });
            });

        // Min year filter
        new Setting(containerEl)
            .setName('Minimum Year')
            .setDesc('Only include papers published after this year (leave empty for all)')
            .addText((text) => {
                text.inputEl.style.width = '80px';
                text.inputEl.type = 'number';
                text.setPlaceholder('2020')
                    .setValue(providers.externalContext.openAlex.minYear?.toString() || '')
                    .onChange((value) => {
                        const year = value ? parseInt(value, 10) : undefined;
                        plugin.settings.dispatch({
                            type: 'PROVIDERS_SET_OPENALEX_MIN_YEAR',
                            payload: { year: year && !isNaN(year) ? year : undefined },
                        });
                    });
            });

        // Min citations filter
        new Setting(containerEl)
            .setName('Minimum Citations')
            .setDesc('Only include papers with at least this many citations (leave empty for all)')
            .addText((text) => {
                text.inputEl.style.width = '80px';
                text.inputEl.type = 'number';
                text.setPlaceholder('10')
                    .setValue(providers.externalContext.openAlex.minCitations?.toString() || '')
                    .onChange((value) => {
                        const count = value ? parseInt(value, 10) : undefined;
                        plugin.settings.dispatch({
                            type: 'PROVIDERS_SET_OPENALEX_MIN_CITATIONS',
                            payload: { count: count && !isNaN(count) ? count : undefined },
                        });
                    });
            });
    }

    // ==========================================================================
    // WEB SEARCH (LLM-NATIVE)
    // ==========================================================================

    containerEl.createEl('h4', { text: 'Web Search' });
    containerEl.createEl('p', {
        text: 'Use your LLM provider\'s native web search capability. Configure based on your selected LLM provider.',
        cls: 'setting-item-description',
    });

    // Show current LLM provider info
    const providerInfo = LLM_PROVIDER_INFO[llmConfig.provider as keyof typeof LLM_PROVIDER_INFO];
    if (providerInfo) {
        containerEl.createEl('p', {
            text: `Current provider: ${providerInfo.name}. ${providerInfo.pricingInfo}`,
            cls: 'setting-item-description',
        });
    }

    // Web search refinement threshold
    new Setting(containerEl)
        .setName('Web Search Refinement Threshold')
        .setDesc('Only search web when document refinement is below this value (0-1)')
        .addSlider((slider) => {
            slider
                .setLimits(0, 1, 0.1)
                .setValue(providers.externalContext.webSearchRefinementThreshold)
                .setDynamicTooltip()
                .onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'PROVIDERS_SET_WEB_SEARCH_REFINEMENT_THRESHOLD',
                        payload: { threshold: value },
                    });
                });
        });

    // Claude Web Search settings
    if (llmConfig.provider === 'anthropic') {
        containerEl.createEl('h5', { text: 'Claude Web Search' });

        new Setting(containerEl)
            .setName('Enable Claude Web Search')
            .setDesc('Use Claude\'s native web search during analysis')
            .addToggle((toggle) => {
                toggle.setValue(providers.claudeWebSearch.enabled).onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'PROVIDERS_SET_CLAUDE_WEB_SEARCH_ENABLED',
                        payload: { enabled: value },
                    });
                    renderProvidersSettings(plugin, containerEl);
                });
            });

        if (providers.claudeWebSearch.enabled) {
            new Setting(containerEl)
                .setName('Max Search Uses')
                .setDesc('Maximum web searches per request')
                .addSlider((slider) => {
                    slider
                        .setLimits(1, 10, 1)
                        .setValue(providers.claudeWebSearch.maxUses)
                        .setDynamicTooltip()
                        .onChange((value) => {
                            plugin.settings.dispatch({
                                type: 'PROVIDERS_SET_CLAUDE_WEB_SEARCH_MAX_USES',
                                payload: { max: value },
                            });
                        });
                });
        }
    }

    // OpenAI Web Search settings
    if (llmConfig.provider === 'openai') {
        containerEl.createEl('h5', { text: 'OpenAI Web Search' });

        new Setting(containerEl)
            .setName('Enable OpenAI Web Search')
            .setDesc('Use OpenAI\'s web search via Responses API')
            .addToggle((toggle) => {
                toggle.setValue(providers.openaiWebSearch.enabled).onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'PROVIDERS_SET_OPENAI_WEB_SEARCH_ENABLED',
                        payload: { enabled: value },
                    });
                    renderProvidersSettings(plugin, containerEl);
                });
            });

        if (providers.openaiWebSearch.enabled) {
            new Setting(containerEl)
                .setName('Search Context Size')
                .setDesc('Amount of context to include from search results')
                .addDropdown((dropdown) => {
                    dropdown
                        .addOption('low', 'Low (faster)')
                        .addOption('medium', 'Medium')
                        .addOption('high', 'High (more thorough)')
                        .setValue(providers.openaiWebSearch.searchContextSize)
                        .onChange((value) => {
                            plugin.settings.dispatch({
                                type: 'PROVIDERS_SET_OPENAI_WEB_SEARCH_CONTEXT_SIZE',
                                payload: { size: value as 'high' | 'medium' | 'low' },
                            });
                        });
                });

            new Setting(containerEl)
                .setName('Use Search-Optimized Models')
                .setDesc('Use gpt-4o-search-preview for better search results')
                .addToggle((toggle) => {
                    toggle.setValue(providers.openaiWebSearch.useSearchModels).onChange((value) => {
                        plugin.settings.dispatch({
                            type: 'PROVIDERS_SET_OPENAI_WEB_SEARCH_USE_SEARCH_MODELS',
                            payload: { enabled: value },
                        });
                    });
                });
        }
    }

    // Gemini Grounding settings
    if (llmConfig.provider === 'gemini') {
        containerEl.createEl('h5', { text: 'Gemini Grounding' });

        new Setting(containerEl)
            .setName('Enable Gemini Grounding')
            .setDesc('Use Google Search grounding for accurate, up-to-date information')
            .addToggle((toggle) => {
                toggle.setValue(providers.geminiGrounding.enabled).onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'PROVIDERS_SET_GEMINI_GROUNDING_ENABLED',
                        payload: { enabled: value },
                    });
                    renderProvidersSettings(plugin, containerEl);
                });
            });

        if (providers.geminiGrounding.enabled) {
            new Setting(containerEl)
                .setName('Google Search')
                .setDesc('Enable Google Search for web grounding')
                .addToggle((toggle) => {
                    toggle.setValue(providers.geminiGrounding.googleSearchEnabled).onChange((value) => {
                        plugin.settings.dispatch({
                            type: 'PROVIDERS_SET_GEMINI_GOOGLE_SEARCH_ENABLED',
                            payload: { enabled: value },
                        });
                    });
                });

            new Setting(containerEl)
                .setName('Google Maps')
                .setDesc('Enable Google Maps for location-based grounding')
                .addToggle((toggle) => {
                    toggle.setValue(providers.geminiGrounding.googleMapsEnabled).onChange((value) => {
                        plugin.settings.dispatch({
                            type: 'PROVIDERS_SET_GEMINI_GOOGLE_MAPS_ENABLED',
                            payload: { enabled: value },
                        });
                    });
                });
        }
    }

    // ==========================================================================
    // URL SCRAPING
    // ==========================================================================

    containerEl.createEl('h4', { text: 'URL Scraping' });
    containerEl.createEl('p', {
        text: 'Scrape URLs found in your documents to include their content. No external API required.',
        cls: 'setting-item-description',
    });

    new Setting(containerEl)
        .setName('Enable URL Scraping')
        .setDesc('Automatically scrape web pages linked in documents')
        .addToggle((toggle) => {
            toggle.setValue(providers.externalContext.urlScraping.enabled).onChange((value) => {
                plugin.settings.dispatch({
                    type: 'PROVIDERS_SET_URL_SCRAPING_ENABLED',
                    payload: { enabled: value },
                });
                renderProvidersSettings(plugin, containerEl);
            });
        });

    if (providers.externalContext.urlScraping.enabled) {
        new Setting(containerEl)
            .setName('Max URLs to Scrape')
            .setDesc('Maximum number of URLs to scrape per document')
            .addSlider((slider) => {
                slider
                    .setLimits(0, 10, 1)
                    .setValue(providers.externalContext.urlScraping.maxUrls)
                    .setDynamicTooltip()
                    .onChange((value) => {
                        plugin.settings.dispatch({
                            type: 'PROVIDERS_SET_URL_SCRAPING_MAX_URLS',
                            payload: { max: value },
                        });
                    });
            });

        new Setting(containerEl)
            .setName('Extract Main Content Only')
            .setDesc('Remove navigation, headers, footers from scraped pages')
            .addToggle((toggle) => {
                toggle.setValue(providers.externalContext.urlScraping.onlyMainContent).onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'PROVIDERS_SET_URL_SCRAPING_ONLY_MAIN_CONTENT',
                        payload: { enabled: value },
                    });
                });
            });

        new Setting(containerEl)
            .setName('Timeout (seconds)')
            .setDesc('Maximum time to wait for each URL')
            .addSlider((slider) => {
                slider
                    .setLimits(5, 30, 5)
                    .setValue(providers.externalContext.urlScraping.timeout / 1000)
                    .setDynamicTooltip()
                    .onChange((value) => {
                        plugin.settings.dispatch({
                            type: 'PROVIDERS_SET_URL_SCRAPING_TIMEOUT',
                            payload: { timeout: value * 1000 },
                        });
                    });
            });
    }

    // ==========================================================================
    // SMART CONNECTIONS
    // ==========================================================================

    containerEl.createEl('h4', { text: 'Smart Connections' });
    containerEl.createEl('p', {
        text: 'Include related notes from your vault using the Smart Connections plugin.',
        cls: 'setting-item-description',
    });

    new Setting(containerEl)
        .setName('Enable Smart Connections')
        .setDesc('Include semantically similar notes in context')
        .addToggle((toggle) => {
            toggle.setValue(providers.externalContext.smartConnections.enabled).onChange((value) => {
                plugin.settings.dispatch({
                    type: 'PROVIDERS_SET_SMART_CONNECTIONS_ENABLED',
                    payload: { enabled: value },
                });
                renderProvidersSettings(plugin, containerEl);
            });
        });

    if (providers.externalContext.smartConnections.enabled) {
        new Setting(containerEl)
            .setName('Max Related Notes')
            .setDesc('Maximum number of related notes to include')
            .addSlider((slider) => {
                slider
                    .setLimits(1, 10, 1)
                    .setValue(providers.externalContext.smartConnections.maxRelatedNotes)
                    .setDynamicTooltip()
                    .onChange((value) => {
                        plugin.settings.dispatch({
                            type: 'PROVIDERS_SET_SMART_CONNECTIONS_MAX_NOTES',
                            payload: { max: value },
                        });
                    });
            });

        new Setting(containerEl)
            .setName('Minimum Similarity')
            .setDesc('Only include notes with similarity above this threshold (0-1)')
            .addSlider((slider) => {
                slider
                    .setLimits(0.1, 0.9, 0.1)
                    .setValue(providers.externalContext.smartConnections.minSimilarity)
                    .setDynamicTooltip()
                    .onChange((value) => {
                        plugin.settings.dispatch({
                            type: 'PROVIDERS_SET_SMART_CONNECTIONS_MIN_SIMILARITY',
                            payload: { min: value },
                        });
                    });
            });
    }
};
