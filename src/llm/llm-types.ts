/**
 * LLM Module - Type Definitions
 *
 * Types for LLM-powered stub suggestions feature.
 */

// =============================================================================
// PROMPT TEMPLATES
// =============================================================================

/**
 * Template for LLM analysis prompts
 */
export interface PromptTemplate {
    /** Unique template identifier */
    id: string;

    /** Display name for the template */
    name: string;

    /** Description of what this template does */
    description: string;

    /**
     * Custom system prompt override
     * If null, uses the default system prompt
     */
    systemPromptOverride: string | null;

    /**
     * Filter stub types by vector family
     * If null, includes all stub types
     */
    vectorFamilyFilter: string[] | null;

    /**
     * Auto-suggest this template based on refinement score
     * Template is suggested when doc refinement is within range
     */
    refinementCondition?: {
        min?: number;
        max?: number;
    };

    /** Whether this is a built-in template */
    isBuiltIn?: boolean;
}

/**
 * Built-in prompt templates shipped with the plugin
 */
export const BUILT_IN_TEMPLATES: PromptTemplate[] = [
    {
        id: 'standard',
        name: 'Standard Analysis',
        description: 'Identify gaps and suggest stubs across all categories',
        systemPromptOverride: null,
        vectorFamilyFilter: null,
        isBuiltIn: true,
    },
    {
        id: 'development',
        name: 'Development Focus',
        description: 'For low-refinement docs, focus on expansion and creation',
        systemPromptOverride: 'Focus on identifying areas that need expansion and elaboration. Prioritize foundational gaps over polish.',
        vectorFamilyFilter: ['Creation', 'Computation'],
        refinementCondition: { max: 0.4 },
        isBuiltIn: true,
    },
    {
        id: 'quality-gate',
        name: 'Quality Gate Audit',
        description: 'Verify readiness for publication or promotion',
        systemPromptOverride: 'Audit this document for promotion readiness. Focus on blockers, missing citations, and clarity issues that would prevent publication.',
        vectorFamilyFilter: ['Retrieval', 'Synthesis'],
        isBuiltIn: true,
    },
    {
        id: 'citation-review',
        name: 'Citation Review',
        description: 'Focus exclusively on missing citations and references',
        systemPromptOverride: 'Focus exclusively on epistemic gaps requiring citations. Identify claims that need sources, references that should be added, and verify existing citations are appropriate.',
        vectorFamilyFilter: ['Retrieval'],
        isBuiltIn: true,
    },
];

// =============================================================================
// PROVIDER CONFIGURATION
// =============================================================================

/**
 * Supported LLM providers
 */
export type LLMProvider = 'anthropic' | 'openai' | 'gemini';

/**
 * LLM configuration stored in plugin settings
 */
export interface LLMConfiguration {
    /** Whether LLM features are enabled */
    enabled: boolean;

    /** Selected LLM provider */
    provider: LLMProvider;

    /** API key for currently selected provider (computed from apiKeys) */
    apiKey: string;

    /** API keys stored per provider */
    apiKeys: Record<LLMProvider, string>;

    /**
     * Model identifier
     * @example "claude-sonnet-4-20250514", "gpt-4o"
     */
    model: string;

    /**
     * Maximum tokens for response
     * @default 4096
     */
    maxTokens: number;

    /**
     * Temperature for response generation (0-1)
     * Lower = more deterministic, higher = more creative
     * @default 0.3
     */
    temperature: number;

    /**
     * Request timeout in milliseconds
     * @default 30000
     */
    timeout: number;

    /**
     * Enable streaming mode for real-time feedback
     * @default true
     */
    streaming: boolean;

    /**
     * Frontmatter property for vault/internal references
     * @default "references"
     */
    vaultReferenceProperty: string;

    /**
     * Frontmatter property for web/external references
     * @default "references"
     */
    webReferenceProperty: string;

    /**
     * Whether to use separate properties for vault vs web references
     * @default false
     */
    separateReferenceProperties: boolean;

    /**
     * Insertion order for new items
     * @default "bottom"
     */
    insertionOrder: 'top' | 'bottom';

    /** Debug configuration */
    debug: LLMDebugConfig;

    /** Firecrawl configuration for web search and scraping */
    firecrawl: FirecrawlConfig;

    /**
     * Whether to use an external stub config schema file
     * @default false
     */
    stubConfigSchemaEnabled: boolean;

    /**
     * Vault-relative path to the stub config schema file (YAML or JSON)
     * @default ""
     */
    stubConfigSchemaPath: string;

    /**
     * How to handle the external schema:
     * - 'replace': Custom schema completely replaces built-in types
     * - 'merge': Custom schema extends/overrides specific built-in types (matched by key)
     * @default "merge"
     */
    stubConfigSchemaMode: 'replace' | 'merge';

    /**
     * Currently selected prompt template ID
     * @default "standard"
     */
    selectedTemplateId: string;

    /**
     * Vault-relative path to custom templates file (JSON)
     * @default ""
     */
    customTemplatesPath: string;

    /**
     * Cached models fetched from provider APIs
     * Updated on first session request or manual refresh
     */
    cachedModels?: CachedModels;
}

/**
 * Debug and dry run configuration
 */
export interface LLMDebugConfig {
    /** Enable verbose logging to developer console */
    enabled: boolean;

    /** Dry run mode - preview prompts without API calls */
    dryRunMode: boolean;

    /** Store last N request/response pairs for inspection */
    historySize: number;

    /** Log level for console output */
    logLevel: 'error' | 'warn' | 'info' | 'debug';
}

// =============================================================================
// FIRECRAWL CONFIGURATION
// =============================================================================

/**
 * Firecrawl API configuration for web search and scraping
 */
export interface FirecrawlConfig {
    /** Whether Firecrawl features are enabled */
    enabled: boolean;

    /** Firecrawl API key */
    apiKey: string;

    /** Enable web search during analysis */
    webSearchEnabled: boolean;

    /** Enable URL scraping for URLs found in documents */
    urlScrapingEnabled: boolean;

    /** Enable Smart Connections integration for vault context */
    smartConnectionsEnabled: boolean;

    /**
     * Refinement threshold for web search
     * Web search is performed when document refinement < this value
     * @default 0.5
     */
    webSearchRefinementThreshold: number;

    /**
     * Maximum number of search results to include
     * @default 5
     */
    maxSearchResults: number;

    /**
     * Maximum number of URLs to scrape from document
     * @default 3
     */
    maxUrlsToScrape: number;

    /**
     * Maximum number of related vault notes to include
     * @default 5
     */
    maxRelatedNotes: number;

    /**
     * Request timeout in milliseconds
     * @default 15000
     */
    timeout: number;
}

/**
 * Web search result from Firecrawl
 */
export interface WebSearchResult {
    title: string;
    url: string;
    description: string;
    content?: string;
}

/**
 * Scraped URL content
 */
export interface ScrapedContent {
    url: string;
    title: string;
    markdown: string;
    metadata?: Record<string, unknown>;
}

/**
 * Related vault note
 */
export interface RelatedNote {
    path: string;
    title: string;
    similarity: number;
    excerpt?: string;
}

/**
 * External context gathered before LLM analysis
 */
export interface ExternalContext {
    /** Web search results */
    webSearchResults: WebSearchResult[];

    /** Scraped URL contents */
    scrapedUrls: ScrapedContent[];

    /** Related notes from vault */
    relatedNotes: RelatedNote[];

    /** Errors encountered during context gathering */
    errors: string[];
}

// =============================================================================
// REQUEST/RESPONSE TYPES
// =============================================================================

/**
 * Suggested stub from LLM analysis
 */
export interface SuggestedStub {
    /** Stub type key (must match configured types) */
    type: string;

    /** Clear, actionable description */
    description: string;

    /** Suggested severity/lifecycle */
    stub_form: 'transient' | 'persistent' | 'blocking';

    /** Suggested priority */
    priority?: 'low' | 'medium' | 'high' | 'critical';

    /** Location in document */
    location: {
        /** Section heading where gap appears */
        section?: string;
        /** Brief quote or description of where in section */
        context?: string;
        /**
         * Exact line number where anchor should be placed (1-indexed)
         * This is the line in the document content (after frontmatter)
         * where the stub marker should be inserted
         */
        lineNumber: number;
    };

    /** Explanation for why this stub was suggested */
    rationale: string;

    /**
     * Explicit reasoning explaining WHY this gap matters
     * Displayed prominently to help user understand importance
     */
    reasoning?: string;
}

// =============================================================================
// ACTIONABLE SUGGESTIONS
// =============================================================================

/**
 * Actions that can be performed on a suggestion
 */
export type SuggestionAction =
    | { type: 'remove_stub'; stubIndex: number }
    | { type: 'add_text'; position: 'before' | 'after' | 'replace'; lineNumber: number; text: string }
    | { type: 'modify_frontmatter'; property: string; value: unknown }
    | { type: 'add_reference'; reference: string; referenceType: 'vault' | 'web' }
    | { type: 'add_tag'; tag: string }
    | { type: 'add_related'; notePath: string };

/**
 * Suggestion with concrete actions that can be executed
 */
export interface ActionableSuggestion extends SuggestedStub {
    /** Unique ID for tracking in UI */
    id: string;

    /** Actions to perform when accepting this suggestion */
    actions: SuggestionAction[];

    /** Whether this suggestion has been accepted */
    accepted?: boolean;

    /** Whether this suggestion has been rejected */
    rejected?: boolean;
}

/**
 * Reference found during analysis
 */
export interface FoundReference {
    /** Reference type */
    type: 'vault' | 'web' | 'citation' | 'unknown';

    /** Display title or description */
    title: string;

    /** URL, file path, or citation text */
    target: string;

    /** Context for why this reference is relevant */
    context?: string;

    /** Section where reference was identified */
    section?: string;
}

/**
 * LLM analysis response
 */
export interface LLMSuggestionResponse {
    /** Brief overview of document quality assessment */
    analysis_summary: string;

    /** Suggested stubs to add */
    suggested_stubs: SuggestedStub[];

    /** References identified during analysis */
    references: FoundReference[];

    /** Overall confidence in suggestions (0-1) */
    confidence: number;
}

/**
 * Streaming event types
 */
export type StreamEventType = 'thinking' | 'file_reference' | 'progress' | 'partial_result' | 'complete' | 'error';

/**
 * Streaming event
 */
export interface StreamEvent {
    type: StreamEventType;
    timestamp: number;
    data: StreamEventData;
}

/**
 * Streaming event data variants
 */
export type StreamEventData =
    | { kind: 'thinking'; text: string }
    | { kind: 'file_reference'; path: string; reason: string }
    | { kind: 'progress'; stage: string; percent: number }
    | { kind: 'partial_result'; content: string }
    | { kind: 'complete'; response: LLMSuggestionResponse }
    | { kind: 'error'; error: LLMError };

/**
 * Callback for streaming events
 */
export type StreamCallback = (event: StreamEvent) => void;

/**
 * Document context for LLM analysis
 */
export interface DocumentContext {
    /** Document file path */
    path: string;

    /** Document content (markdown) */
    content: string;

    /** Frontmatter metadata */
    frontmatter: {
        title?: string;
        description?: string;
        refinement?: number;
        form?: 'transient' | 'developing' | 'stable' | 'evergreen' | 'canonical';
        audience?: 'personal' | 'internal' | 'trusted' | 'public';
        existingStubs?: Array<{ type: string; description: string }>;
    };

    /** External context from web search, URL scraping, related notes */
    externalContext?: string;
}

// =============================================================================
// ERROR TYPES
// =============================================================================

/**
 * LLM error types
 */
export type LLMErrorType =
    | 'no_api_key'
    | 'invalid_api_key'
    | 'rate_limited'
    | 'context_too_long'
    | 'network_error'
    | 'invalid_response'
    | 'provider_error'
    | 'timeout'
    | 'unknown';

/**
 * LLM error with metadata
 */
export interface LLMError {
    type: LLMErrorType;
    message: string;
    retryable: boolean;
    suggestedAction?: string;
    originalError?: Error;
}

/**
 * Request history entry for debugging
 */
export interface RequestHistoryEntry {
    id: string;
    timestamp: Date;
    documentPath: string;
    provider: LLMProvider;
    model: string;

    request: {
        systemPrompt: string;
        userPrompt: string;
        tokenEstimate: number;
    };

    response?: {
        raw: string;
        parsed: LLMSuggestionResponse;
        tokensUsed?: { input: number; output: number };
        duration: number;
    };

    error?: LLMError;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

/**
 * Default LLM configuration
 */
export const DEFAULT_LLM_CONFIGURATION = (): LLMConfiguration => ({
    enabled: false,
    provider: 'anthropic',
    apiKey: '',
    apiKeys: {
        anthropic: '',
        openai: '',
        gemini: '',
    },
    model: 'claude-sonnet-4-20250514',
    maxTokens: 4096,
    temperature: 0.3,
    timeout: 30000,
    streaming: true,
    vaultReferenceProperty: 'references',
    webReferenceProperty: 'references',
    separateReferenceProperties: false,
    insertionOrder: 'bottom',
    debug: {
        enabled: false,
        dryRunMode: false,
        historySize: 5,
        logLevel: 'warn',
    },
    firecrawl: {
        enabled: false,
        apiKey: '',
        webSearchEnabled: true,
        urlScrapingEnabled: true,
        smartConnectionsEnabled: true,
        webSearchRefinementThreshold: 0.5,
        maxSearchResults: 5,
        maxUrlsToScrape: 3,
        maxRelatedNotes: 5,
        timeout: 15000,
    },
    stubConfigSchemaEnabled: false,
    stubConfigSchemaPath: '',
    stubConfigSchemaMode: 'merge',
    selectedTemplateId: 'standard',
    customTemplatesPath: '',
});

/**
 * Model info structure
 */
export interface ModelInfo {
    id: string;
    name: string;
    recommended?: boolean;
}

/**
 * Cached models for a provider
 */
export interface CachedProviderModels {
    models: ModelInfo[];
    fetchedAt: number; // Unix timestamp
}

/**
 * Cached models storage
 */
export interface CachedModels {
    anthropic?: CachedProviderModels;
    openai?: CachedProviderModels;
    gemini?: CachedProviderModels;
    sessionRefreshed?: boolean; // Flag to track if refreshed this session
}

/**
 * Default/fallback models by provider (used when API fetch fails)
 */
export const DEFAULT_MODELS: Record<LLMProvider, ModelInfo[]> = {
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

/**
 * Available models by provider
 * @deprecated Use getCachedModels() or DEFAULT_MODELS instead
 */
export const AVAILABLE_MODELS: Record<LLMProvider, ModelInfo[]> = DEFAULT_MODELS;

/**
 * Error messages with suggested actions
 */
export const ERROR_MESSAGES: Record<LLMErrorType, Omit<LLMError, 'originalError'>> = {
    no_api_key: {
        type: 'no_api_key',
        message: 'No API key configured',
        retryable: false,
        suggestedAction: 'Open Settings → Doc Doctor → LLM Configuration',
    },
    invalid_api_key: {
        type: 'invalid_api_key',
        message: 'API key is invalid or expired',
        retryable: false,
        suggestedAction: 'Check your API key in settings',
    },
    rate_limited: {
        type: 'rate_limited',
        message: 'Rate limit exceeded',
        retryable: true,
        suggestedAction: 'Wait a moment and try again',
    },
    context_too_long: {
        type: 'context_too_long',
        message: 'Document too long for analysis',
        retryable: false,
        suggestedAction: 'Try analyzing a smaller section',
    },
    network_error: {
        type: 'network_error',
        message: 'Network connection failed',
        retryable: true,
        suggestedAction: 'Check your internet connection',
    },
    invalid_response: {
        type: 'invalid_response',
        message: 'Invalid response from LLM',
        retryable: true,
        suggestedAction: 'Try again - the response format was unexpected',
    },
    provider_error: {
        type: 'provider_error',
        message: 'LLM provider returned an error',
        retryable: true,
        suggestedAction: 'Check provider status and try again',
    },
    timeout: {
        type: 'timeout',
        message: 'Request timed out',
        retryable: true,
        suggestedAction: 'Try again or increase timeout in settings',
    },
    unknown: {
        type: 'unknown',
        message: 'An unexpected error occurred',
        retryable: false,
        suggestedAction: 'Check the developer console for details',
    },
};
