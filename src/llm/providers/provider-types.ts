/**
 * Provider Types
 *
 * Unified type definitions for all external service providers.
 */

// =============================================================================
// BASE PROVIDER TYPES
// =============================================================================

/**
 * Base configuration shared by all providers
 */
export interface BaseProviderConfig {
    /** Whether this provider is enabled */
    enabled: boolean;
    /** API key (if required) */
    apiKey: string;
}

// =============================================================================
// LLM PROVIDERS
// =============================================================================

/**
 * Supported LLM providers
 */
export type LLMProviderType = 'anthropic' | 'openai' | 'gemini';

/**
 * LLM provider configuration
 */
export interface LLMProviderConfig extends BaseProviderConfig {
    /** Provider type */
    type: LLMProviderType;
    /** Model identifier */
    model: string;
    /** Maximum tokens for response */
    maxTokens: number;
    /** Temperature (0-1) */
    temperature: number;
    /** Request timeout in ms */
    timeout: number;
}

/**
 * Available models by LLM provider
 */
export const LLM_MODELS: Record<LLMProviderType, Array<{ id: string; name: string; recommended?: boolean }>> = {
    anthropic: [
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', recommended: true },
        { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
    ],
    openai: [
        { id: 'gpt-4o', name: 'GPT-4o', recommended: true },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
    ],
    gemini: [
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', recommended: true },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
    ],
};

// =============================================================================
// WEB SEARCH PROVIDERS
// =============================================================================

/**
 * Supported web search providers
 */
export type WebSearchProviderType = 'claude' | 'openai' | 'gemini';

/**
 * Claude Web Search configuration
 */
export interface ClaudeWebSearchConfig extends BaseProviderConfig {
    type: 'claude';
    /** Maximum number of searches per request */
    maxUses: number;
    /** Allowed domains (empty = all allowed) */
    allowedDomains: string[];
    /** Blocked domains */
    blockedDomains: string[];
    /** User location for localized results */
    userLocation?: {
        city?: string;
        region?: string;
        country?: string;
        timezone?: string;
    };
}

/**
 * OpenAI Web Search configuration
 */
export interface OpenAIWebSearchConfig extends BaseProviderConfig {
    type: 'openai';
    /** Search context size: high (better but slower), medium, low (faster but less accurate) */
    searchContextSize: 'high' | 'medium' | 'low';
    /** Use search-specific models (gpt-4o-search-preview) */
    useSearchModels: boolean;
}

/**
 * Gemini Grounding (Web Search) configuration
 */
export interface GeminiGroundingConfig extends BaseProviderConfig {
    type: 'gemini';
    /** Enable Google Search grounding */
    googleSearchEnabled: boolean;
    /** Enable Google Maps grounding */
    googleMapsEnabled: boolean;
}

/**
 * Union type for all web search provider configs
 */
export type WebSearchProviderConfig =
    | ClaudeWebSearchConfig
    | OpenAIWebSearchConfig
    | GeminiGroundingConfig;

// =============================================================================
// ACADEMIC SEARCH PROVIDERS
// =============================================================================

/**
 * OpenAlex configuration for academic paper search
 */
export interface OpenAlexConfig extends BaseProviderConfig {
    type: 'openalex';
    /** Email for polite pool access (recommended for better rate limits) */
    email: string;
    /** Maximum search results */
    maxResults: number;
    /** Include full abstracts in results */
    includeAbstracts: boolean;
    /** Filter by publication year (optional) */
    minYear?: number;
    /** Filter by minimum citation count (optional) */
    minCitations?: number;
}

/**
 * Academic search result
 */
export interface AcademicSearchResult {
    /** OpenAlex work ID */
    id: string;
    /** Paper title */
    title: string;
    /** Authors list */
    authors: string[];
    /** Publication year */
    year: number;
    /** DOI if available */
    doi?: string;
    /** Abstract text */
    abstract?: string;
    /** Citation count */
    citationCount: number;
    /** Journal/venue name */
    venue?: string;
    /** Open access URL if available */
    openAccessUrl?: string;
    /** OpenAlex URL */
    openAlexUrl: string;
}

// =============================================================================
// URL SCRAPING
// =============================================================================

/**
 * URL scraping configuration (no external API required)
 */
export interface UrlScrapingConfig {
    /** Enable URL scraping */
    enabled: boolean;
    /** Maximum URLs to scrape per document */
    maxUrls: number;
    /** Request timeout in ms */
    timeout: number;
    /** Extract only main content */
    onlyMainContent: boolean;
}

// =============================================================================
// SMART CONNECTIONS INTEGRATION
// =============================================================================

/**
 * Smart Connections plugin integration config
 */
export interface SmartConnectionsConfig {
    /** Enable Smart Connections integration */
    enabled: boolean;
    /** Maximum related notes to include */
    maxRelatedNotes: number;
    /** Minimum similarity threshold (0-1) */
    minSimilarity: number;
}

// =============================================================================
// COMBINED EXTERNAL CONTEXT CONFIGURATION
// =============================================================================

/**
 * External context providers configuration
 * Replaces the old FirecrawlConfig
 */
export interface ExternalContextConfig {
    /** Academic search via OpenAlex */
    openAlex: OpenAlexConfig;

    /** Smart Connections vault integration */
    smartConnections: SmartConnectionsConfig;

    /** URL scraping */
    urlScraping: UrlScrapingConfig;

    /**
     * Refinement threshold for web search
     * Web search is triggered when document refinement < this value
     */
    webSearchRefinementThreshold: number;
}

/**
 * Web search configuration per LLM provider
 * Each LLM provider can have its own web search settings
 */
export interface LLMWebSearchConfig {
    /** Enable web search for this provider */
    enabled: boolean;
    /** Provider-specific config */
    claude?: ClaudeWebSearchConfig;
    openai?: OpenAIWebSearchConfig;
    gemini?: GeminiGroundingConfig;
}

// =============================================================================
// DEFAULT CONFIGURATIONS
// =============================================================================

export const DEFAULT_CLAUDE_WEB_SEARCH: ClaudeWebSearchConfig = {
    type: 'claude',
    enabled: false,
    apiKey: '', // Uses LLM API key
    maxUses: 5,
    allowedDomains: [],
    blockedDomains: [],
};

export const DEFAULT_OPENAI_WEB_SEARCH: OpenAIWebSearchConfig = {
    type: 'openai',
    enabled: false,
    apiKey: '', // Uses LLM API key
    searchContextSize: 'medium',
    useSearchModels: false,
};

export const DEFAULT_GEMINI_GROUNDING: GeminiGroundingConfig = {
    type: 'gemini',
    enabled: false,
    apiKey: '', // Uses LLM API key
    googleSearchEnabled: true,
    googleMapsEnabled: false,
};

export const DEFAULT_OPENALEX_CONFIG: OpenAlexConfig = {
    type: 'openalex',
    enabled: false,
    apiKey: '', // Optional, not required
    email: '',
    maxResults: 5,
    includeAbstracts: true,
};

export const DEFAULT_URL_SCRAPING: UrlScrapingConfig = {
    enabled: true,
    maxUrls: 3,
    timeout: 15000,
    onlyMainContent: true,
};

export const DEFAULT_SMART_CONNECTIONS: SmartConnectionsConfig = {
    enabled: true,
    maxRelatedNotes: 5,
    minSimilarity: 0.3,
};

export const DEFAULT_EXTERNAL_CONTEXT: ExternalContextConfig = {
    openAlex: DEFAULT_OPENALEX_CONFIG,
    smartConnections: DEFAULT_SMART_CONNECTIONS,
    urlScraping: DEFAULT_URL_SCRAPING,
    webSearchRefinementThreshold: 0.5,
};

// =============================================================================
// PROVIDER METADATA
// =============================================================================

/**
 * Provider display information
 */
export interface ProviderInfo {
    id: string;
    name: string;
    description: string;
    docsUrl: string;
    pricingInfo?: string;
    requiresApiKey: boolean;
}

export const LLM_PROVIDER_INFO: Record<LLMProviderType, ProviderInfo> = {
    anthropic: {
        id: 'anthropic',
        name: 'Anthropic (Claude)',
        description: 'Claude models with optional web search',
        docsUrl: 'https://docs.anthropic.com/',
        pricingInfo: 'Web search: $10/1,000 searches',
        requiresApiKey: true,
    },
    openai: {
        id: 'openai',
        name: 'OpenAI (GPT)',
        description: 'GPT models with optional web search via Responses API',
        docsUrl: 'https://platform.openai.com/docs/',
        pricingInfo: 'Web search: $30/1,000 queries (GPT-4o)',
        requiresApiKey: true,
    },
    gemini: {
        id: 'gemini',
        name: 'Google (Gemini)',
        description: 'Gemini models with Google Search grounding',
        docsUrl: 'https://ai.google.dev/gemini-api/',
        pricingInfo: 'Grounding: $14/1,000 queries',
        requiresApiKey: true,
    },
};

export const ACADEMIC_PROVIDER_INFO: ProviderInfo = {
    id: 'openalex',
    name: 'OpenAlex',
    description: 'Free academic paper search (100k calls/day)',
    docsUrl: 'https://docs.openalex.org/',
    pricingInfo: 'Free (provide email for better limits)',
    requiresApiKey: false,
};
