/**
 * LLM Settings Reducer
 *
 * Handles state updates for LLM configuration settings.
 */

import type { LLMConfiguration, LLMProvider, CachedModels } from './llm-types';

// =============================================================================
// ACTION TYPES
// =============================================================================

export type LLMSettingsActions =
    | { type: 'LLM_SET_ENABLED'; payload: { enabled: boolean } }
    | { type: 'LLM_SET_PROVIDER'; payload: { provider: LLMProvider } }
    | { type: 'LLM_SET_API_KEY'; payload: { apiKey: string } }
    | { type: 'LLM_SET_MODEL'; payload: { model: string } }
    | { type: 'LLM_SET_MAX_TOKENS'; payload: { maxTokens: number } }
    | { type: 'LLM_SET_TEMPERATURE'; payload: { temperature: number } }
    | { type: 'LLM_SET_TIMEOUT'; payload: { timeout: number } }
    | { type: 'LLM_SET_STREAMING'; payload: { enabled: boolean } }
    | { type: 'LLM_SET_VAULT_REFERENCE_PROPERTY'; payload: { property: string } }
    | { type: 'LLM_SET_WEB_REFERENCE_PROPERTY'; payload: { property: string } }
    | { type: 'LLM_SET_SEPARATE_REFERENCE_PROPERTIES'; payload: { enabled: boolean } }
    | { type: 'LLM_SET_INSERTION_ORDER'; payload: { order: 'top' | 'bottom' } }
    | { type: 'LLM_SET_DEBUG_ENABLED'; payload: { enabled: boolean } }
    | { type: 'LLM_SET_DRY_RUN_MODE'; payload: { enabled: boolean } }
    | { type: 'LLM_SET_DEBUG_HISTORY_SIZE'; payload: { size: number } }
    | { type: 'LLM_SET_DEBUG_LOG_LEVEL'; payload: { level: LLMConfiguration['debug']['logLevel'] } }
    // Firecrawl actions
    | { type: 'LLM_SET_FIRECRAWL_ENABLED'; payload: { enabled: boolean } }
    | { type: 'LLM_SET_FIRECRAWL_API_KEY'; payload: { apiKey: string } }
    | { type: 'LLM_SET_FIRECRAWL_WEB_SEARCH'; payload: { enabled: boolean } }
    | { type: 'LLM_SET_FIRECRAWL_URL_SCRAPING'; payload: { enabled: boolean } }
    | { type: 'LLM_SET_FIRECRAWL_SMART_CONNECTIONS'; payload: { enabled: boolean } }
    | { type: 'LLM_SET_FIRECRAWL_REFINEMENT_THRESHOLD'; payload: { threshold: number } }
    | { type: 'LLM_SET_FIRECRAWL_MAX_SEARCH_RESULTS'; payload: { max: number } }
    | { type: 'LLM_SET_FIRECRAWL_MAX_URLS'; payload: { max: number } }
    | { type: 'LLM_SET_FIRECRAWL_MAX_RELATED_NOTES'; payload: { max: number } }
    // Stub config schema actions
    | { type: 'LLM_SET_STUB_CONFIG_SCHEMA_ENABLED'; payload: { enabled: boolean } }
    | { type: 'LLM_SET_STUB_CONFIG_SCHEMA_PATH'; payload: { path: string } }
    | { type: 'LLM_SET_STUB_CONFIG_SCHEMA_MODE'; payload: { mode: 'replace' | 'merge' } }
    // Prompt template actions
    | { type: 'LLM_SET_SELECTED_TEMPLATE'; payload: { templateId: string } }
    | { type: 'LLM_SET_CUSTOM_TEMPLATES_PATH'; payload: { path: string } }
    // Cached models actions
    | { type: 'LLM_SET_CACHED_MODELS'; payload: { cachedModels: CachedModels } }
    | { type: 'LLM_CLEAR_CACHED_MODELS'; payload: { provider?: LLMProvider } };

// =============================================================================
// REDUCER
// =============================================================================

export function llmSettingsReducer(
    config: LLMConfiguration,
    action: LLMSettingsActions,
): void {
    switch (action.type) {
        case 'LLM_SET_ENABLED':
            config.enabled = action.payload.enabled;
            break;

        case 'LLM_SET_PROVIDER':
            config.provider = action.payload.provider;
            // Reset model when changing provider
            if (action.payload.provider === 'anthropic') {
                config.model = 'claude-sonnet-4-20250514';
            } else if (action.payload.provider === 'openai') {
                config.model = 'gpt-4o';
            } else if (action.payload.provider === 'gemini') {
                config.model = 'gemini-2.0-flash';
            }
            // Sync apiKey from the new provider's stored key
            if (config.apiKeys) {
                config.apiKey = config.apiKeys[action.payload.provider] || '';
            }
            break;

        case 'LLM_SET_API_KEY':
            config.apiKey = action.payload.apiKey;
            // Also store in provider-specific apiKeys
            if (!config.apiKeys) {
                config.apiKeys = { anthropic: '', openai: '', gemini: '' };
            }
            config.apiKeys[config.provider] = action.payload.apiKey;
            break;

        case 'LLM_SET_MODEL':
            config.model = action.payload.model;
            break;

        case 'LLM_SET_MAX_TOKENS':
            config.maxTokens = Math.max(256, Math.min(16384, action.payload.maxTokens));
            break;

        case 'LLM_SET_TEMPERATURE':
            config.temperature = Math.max(0, Math.min(1, action.payload.temperature));
            break;

        case 'LLM_SET_TIMEOUT':
            config.timeout = Math.max(5000, Math.min(120000, action.payload.timeout));
            break;

        case 'LLM_SET_STREAMING':
            config.streaming = action.payload.enabled;
            break;

        case 'LLM_SET_VAULT_REFERENCE_PROPERTY':
            config.vaultReferenceProperty = action.payload.property || 'references';
            break;

        case 'LLM_SET_WEB_REFERENCE_PROPERTY':
            config.webReferenceProperty = action.payload.property || 'references';
            break;

        case 'LLM_SET_SEPARATE_REFERENCE_PROPERTIES':
            config.separateReferenceProperties = action.payload.enabled;
            break;

        case 'LLM_SET_INSERTION_ORDER':
            config.insertionOrder = action.payload.order;
            break;

        case 'LLM_SET_DEBUG_ENABLED':
            config.debug.enabled = action.payload.enabled;
            break;

        case 'LLM_SET_DRY_RUN_MODE':
            config.debug.dryRunMode = action.payload.enabled;
            break;

        case 'LLM_SET_DEBUG_HISTORY_SIZE':
            config.debug.historySize = Math.max(1, Math.min(50, action.payload.size));
            break;

        case 'LLM_SET_DEBUG_LOG_LEVEL':
            config.debug.logLevel = action.payload.level;
            break;

        // Firecrawl cases
        case 'LLM_SET_FIRECRAWL_ENABLED':
            config.firecrawl.enabled = action.payload.enabled;
            break;

        case 'LLM_SET_FIRECRAWL_API_KEY':
            config.firecrawl.apiKey = action.payload.apiKey;
            break;

        case 'LLM_SET_FIRECRAWL_WEB_SEARCH':
            config.firecrawl.webSearchEnabled = action.payload.enabled;
            break;

        case 'LLM_SET_FIRECRAWL_URL_SCRAPING':
            config.firecrawl.urlScrapingEnabled = action.payload.enabled;
            break;

        case 'LLM_SET_FIRECRAWL_SMART_CONNECTIONS':
            config.firecrawl.smartConnectionsEnabled = action.payload.enabled;
            break;

        case 'LLM_SET_FIRECRAWL_REFINEMENT_THRESHOLD':
            config.firecrawl.webSearchRefinementThreshold = Math.max(0, Math.min(1, action.payload.threshold));
            break;

        case 'LLM_SET_FIRECRAWL_MAX_SEARCH_RESULTS':
            config.firecrawl.maxSearchResults = Math.max(1, Math.min(20, action.payload.max));
            break;

        case 'LLM_SET_FIRECRAWL_MAX_URLS':
            config.firecrawl.maxUrlsToScrape = Math.max(0, Math.min(10, action.payload.max));
            break;

        case 'LLM_SET_FIRECRAWL_MAX_RELATED_NOTES':
            config.firecrawl.maxRelatedNotes = Math.max(0, Math.min(20, action.payload.max));
            break;

        // Stub config schema cases
        case 'LLM_SET_STUB_CONFIG_SCHEMA_ENABLED':
            config.stubConfigSchemaEnabled = action.payload.enabled;
            break;

        case 'LLM_SET_STUB_CONFIG_SCHEMA_PATH':
            config.stubConfigSchemaPath = action.payload.path;
            break;

        case 'LLM_SET_STUB_CONFIG_SCHEMA_MODE':
            config.stubConfigSchemaMode = action.payload.mode;
            break;

        // Prompt template cases
        case 'LLM_SET_SELECTED_TEMPLATE':
            config.selectedTemplateId = action.payload.templateId;
            break;

        case 'LLM_SET_CUSTOM_TEMPLATES_PATH':
            config.customTemplatesPath = action.payload.path;
            break;

        // Cached models cases
        case 'LLM_SET_CACHED_MODELS':
            config.cachedModels = action.payload.cachedModels;
            break;

        case 'LLM_CLEAR_CACHED_MODELS':
            if (action.payload.provider && config.cachedModels) {
                // Clear specific provider
                delete config.cachedModels[action.payload.provider];
            } else {
                // Clear all cached models
                config.cachedModels = undefined;
            }
            break;
    }
}
