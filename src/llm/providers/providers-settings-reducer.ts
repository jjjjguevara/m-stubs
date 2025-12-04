/**
 * Providers Settings Reducer
 *
 * Handles state updates for external provider configurations:
 * - OpenAlex (academic search)
 * - Claude Web Search
 * - OpenAI Web Search
 * - Gemini Grounding
 * - URL Scraping
 * - Smart Connections
 */

import type {
    ExternalContextConfig,
    OpenAlexConfig,
    ClaudeWebSearchConfig,
    OpenAIWebSearchConfig,
    GeminiGroundingConfig,
    UrlScrapingConfig,
    SmartConnectionsConfig,
    LLMProviderType,
} from './provider-types';

// =============================================================================
// PROVIDER SETTINGS TYPE
// =============================================================================

/**
 * Combined provider settings for the plugin
 */
export interface ProvidersSettings {
    /** External context configuration (OpenAlex, URL scraping, Smart Connections) */
    externalContext: ExternalContextConfig;

    /** Claude Web Search configuration */
    claudeWebSearch: ClaudeWebSearchConfig;

    /** OpenAI Web Search configuration */
    openaiWebSearch: OpenAIWebSearchConfig;

    /** Gemini Grounding configuration */
    geminiGrounding: GeminiGroundingConfig;

    /** Currently active LLM provider */
    activeLLMProvider: LLMProviderType;
}

// =============================================================================
// ACTION TYPES
// =============================================================================

export type ProvidersSettingsActions =
    // OpenAlex actions
    | { type: 'PROVIDERS_SET_OPENALEX_ENABLED'; payload: { enabled: boolean } }
    | { type: 'PROVIDERS_SET_OPENALEX_EMAIL'; payload: { email: string } }
    | { type: 'PROVIDERS_SET_OPENALEX_MAX_RESULTS'; payload: { max: number } }
    | { type: 'PROVIDERS_SET_OPENALEX_INCLUDE_ABSTRACTS'; payload: { enabled: boolean } }
    | { type: 'PROVIDERS_SET_OPENALEX_MIN_YEAR'; payload: { year?: number } }
    | { type: 'PROVIDERS_SET_OPENALEX_MIN_CITATIONS'; payload: { count?: number } }
    // Claude Web Search actions
    | { type: 'PROVIDERS_SET_CLAUDE_WEB_SEARCH_ENABLED'; payload: { enabled: boolean } }
    | { type: 'PROVIDERS_SET_CLAUDE_WEB_SEARCH_MAX_USES'; payload: { max: number } }
    | { type: 'PROVIDERS_SET_CLAUDE_WEB_SEARCH_ALLOWED_DOMAINS'; payload: { domains: string[] } }
    | { type: 'PROVIDERS_SET_CLAUDE_WEB_SEARCH_BLOCKED_DOMAINS'; payload: { domains: string[] } }
    | {
          type: 'PROVIDERS_SET_CLAUDE_WEB_SEARCH_LOCATION';
          payload: { location?: { city?: string; region?: string; country?: string; timezone?: string } };
      }
    // OpenAI Web Search actions
    | { type: 'PROVIDERS_SET_OPENAI_WEB_SEARCH_ENABLED'; payload: { enabled: boolean } }
    | { type: 'PROVIDERS_SET_OPENAI_WEB_SEARCH_CONTEXT_SIZE'; payload: { size: 'high' | 'medium' | 'low' } }
    | { type: 'PROVIDERS_SET_OPENAI_WEB_SEARCH_USE_SEARCH_MODELS'; payload: { enabled: boolean } }
    // Gemini Grounding actions
    | { type: 'PROVIDERS_SET_GEMINI_GROUNDING_ENABLED'; payload: { enabled: boolean } }
    | { type: 'PROVIDERS_SET_GEMINI_GOOGLE_SEARCH_ENABLED'; payload: { enabled: boolean } }
    | { type: 'PROVIDERS_SET_GEMINI_GOOGLE_MAPS_ENABLED'; payload: { enabled: boolean } }
    // URL Scraping actions
    | { type: 'PROVIDERS_SET_URL_SCRAPING_ENABLED'; payload: { enabled: boolean } }
    | { type: 'PROVIDERS_SET_URL_SCRAPING_MAX_URLS'; payload: { max: number } }
    | { type: 'PROVIDERS_SET_URL_SCRAPING_TIMEOUT'; payload: { timeout: number } }
    | { type: 'PROVIDERS_SET_URL_SCRAPING_ONLY_MAIN_CONTENT'; payload: { enabled: boolean } }
    // Smart Connections actions
    | { type: 'PROVIDERS_SET_SMART_CONNECTIONS_ENABLED'; payload: { enabled: boolean } }
    | { type: 'PROVIDERS_SET_SMART_CONNECTIONS_MAX_NOTES'; payload: { max: number } }
    | { type: 'PROVIDERS_SET_SMART_CONNECTIONS_MIN_SIMILARITY'; payload: { min: number } }
    // General external context actions
    | { type: 'PROVIDERS_SET_WEB_SEARCH_REFINEMENT_THRESHOLD'; payload: { threshold: number } }
    // Active provider
    | { type: 'PROVIDERS_SET_ACTIVE_LLM_PROVIDER'; payload: { provider: LLMProviderType } };

// =============================================================================
// REDUCER
// =============================================================================

export function providersSettingsReducer(
    settings: ProvidersSettings,
    action: ProvidersSettingsActions,
): void {
    switch (action.type) {
        // OpenAlex cases
        case 'PROVIDERS_SET_OPENALEX_ENABLED':
            settings.externalContext.openAlex.enabled = action.payload.enabled;
            break;

        case 'PROVIDERS_SET_OPENALEX_EMAIL':
            settings.externalContext.openAlex.email = action.payload.email;
            break;

        case 'PROVIDERS_SET_OPENALEX_MAX_RESULTS':
            settings.externalContext.openAlex.maxResults = Math.max(1, Math.min(20, action.payload.max));
            break;

        case 'PROVIDERS_SET_OPENALEX_INCLUDE_ABSTRACTS':
            settings.externalContext.openAlex.includeAbstracts = action.payload.enabled;
            break;

        case 'PROVIDERS_SET_OPENALEX_MIN_YEAR':
            settings.externalContext.openAlex.minYear = action.payload.year;
            break;

        case 'PROVIDERS_SET_OPENALEX_MIN_CITATIONS':
            settings.externalContext.openAlex.minCitations = action.payload.count;
            break;

        // Claude Web Search cases
        case 'PROVIDERS_SET_CLAUDE_WEB_SEARCH_ENABLED':
            settings.claudeWebSearch.enabled = action.payload.enabled;
            break;

        case 'PROVIDERS_SET_CLAUDE_WEB_SEARCH_MAX_USES':
            settings.claudeWebSearch.maxUses = Math.max(1, Math.min(20, action.payload.max));
            break;

        case 'PROVIDERS_SET_CLAUDE_WEB_SEARCH_ALLOWED_DOMAINS':
            settings.claudeWebSearch.allowedDomains = action.payload.domains;
            break;

        case 'PROVIDERS_SET_CLAUDE_WEB_SEARCH_BLOCKED_DOMAINS':
            settings.claudeWebSearch.blockedDomains = action.payload.domains;
            break;

        case 'PROVIDERS_SET_CLAUDE_WEB_SEARCH_LOCATION':
            settings.claudeWebSearch.userLocation = action.payload.location;
            break;

        // OpenAI Web Search cases
        case 'PROVIDERS_SET_OPENAI_WEB_SEARCH_ENABLED':
            settings.openaiWebSearch.enabled = action.payload.enabled;
            break;

        case 'PROVIDERS_SET_OPENAI_WEB_SEARCH_CONTEXT_SIZE':
            settings.openaiWebSearch.searchContextSize = action.payload.size;
            break;

        case 'PROVIDERS_SET_OPENAI_WEB_SEARCH_USE_SEARCH_MODELS':
            settings.openaiWebSearch.useSearchModels = action.payload.enabled;
            break;

        // Gemini Grounding cases
        case 'PROVIDERS_SET_GEMINI_GROUNDING_ENABLED':
            settings.geminiGrounding.enabled = action.payload.enabled;
            break;

        case 'PROVIDERS_SET_GEMINI_GOOGLE_SEARCH_ENABLED':
            settings.geminiGrounding.googleSearchEnabled = action.payload.enabled;
            break;

        case 'PROVIDERS_SET_GEMINI_GOOGLE_MAPS_ENABLED':
            settings.geminiGrounding.googleMapsEnabled = action.payload.enabled;
            break;

        // URL Scraping cases
        case 'PROVIDERS_SET_URL_SCRAPING_ENABLED':
            settings.externalContext.urlScraping.enabled = action.payload.enabled;
            break;

        case 'PROVIDERS_SET_URL_SCRAPING_MAX_URLS':
            settings.externalContext.urlScraping.maxUrls = Math.max(0, Math.min(10, action.payload.max));
            break;

        case 'PROVIDERS_SET_URL_SCRAPING_TIMEOUT':
            settings.externalContext.urlScraping.timeout = Math.max(5000, Math.min(60000, action.payload.timeout));
            break;

        case 'PROVIDERS_SET_URL_SCRAPING_ONLY_MAIN_CONTENT':
            settings.externalContext.urlScraping.onlyMainContent = action.payload.enabled;
            break;

        // Smart Connections cases
        case 'PROVIDERS_SET_SMART_CONNECTIONS_ENABLED':
            settings.externalContext.smartConnections.enabled = action.payload.enabled;
            break;

        case 'PROVIDERS_SET_SMART_CONNECTIONS_MAX_NOTES':
            settings.externalContext.smartConnections.maxRelatedNotes = Math.max(1, Math.min(20, action.payload.max));
            break;

        case 'PROVIDERS_SET_SMART_CONNECTIONS_MIN_SIMILARITY':
            settings.externalContext.smartConnections.minSimilarity = Math.max(0, Math.min(1, action.payload.min));
            break;

        // General external context cases
        case 'PROVIDERS_SET_WEB_SEARCH_REFINEMENT_THRESHOLD':
            settings.externalContext.webSearchRefinementThreshold = Math.max(0, Math.min(1, action.payload.threshold));
            break;

        // Active provider
        case 'PROVIDERS_SET_ACTIVE_LLM_PROVIDER':
            settings.activeLLMProvider = action.payload.provider;
            break;
    }
}

// =============================================================================
// DEFAULT SETTINGS
// =============================================================================

import {
    DEFAULT_OPENALEX_CONFIG,
    DEFAULT_CLAUDE_WEB_SEARCH,
    DEFAULT_OPENAI_WEB_SEARCH,
    DEFAULT_GEMINI_GROUNDING,
    DEFAULT_URL_SCRAPING,
    DEFAULT_SMART_CONNECTIONS,
} from './provider-types';

export const DEFAULT_PROVIDERS_SETTINGS: ProvidersSettings = {
    externalContext: {
        openAlex: DEFAULT_OPENALEX_CONFIG,
        smartConnections: DEFAULT_SMART_CONNECTIONS,
        urlScraping: DEFAULT_URL_SCRAPING,
        webSearchRefinementThreshold: 0.5,
    },
    claudeWebSearch: DEFAULT_CLAUDE_WEB_SEARCH,
    openaiWebSearch: DEFAULT_OPENAI_WEB_SEARCH,
    geminiGrounding: DEFAULT_GEMINI_GROUNDING,
    activeLLMProvider: 'anthropic',
};

/**
 * Get the active web search config based on current LLM provider
 */
export function getActiveWebSearchConfig(
    settings: ProvidersSettings,
): ClaudeWebSearchConfig | OpenAIWebSearchConfig | GeminiGroundingConfig | undefined {
    switch (settings.activeLLMProvider) {
        case 'anthropic':
            return settings.claudeWebSearch;
        case 'openai':
            return settings.openaiWebSearch;
        case 'gemini':
            return settings.geminiGrounding;
        default:
            return undefined;
    }
}
