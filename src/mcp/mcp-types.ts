/**
 * MCP Module - Type Definitions
 *
 * Types for MCP client integration with doc-doctor-mcp binary.
 */

// =============================================================================
// MCP CLIENT CONFIGURATION
// =============================================================================

/**
 * MCP client configuration
 */
export interface MCPClientConfig {
    /** Path to dd-mcp binary (empty = auto-detect) */
    binaryPath: string;

    /** Request timeout in milliseconds */
    timeout: number;

    /** Auto-reconnect on disconnect */
    autoReconnect: boolean;

    /** Connection retry delay in milliseconds */
    retryDelay: number;

    /** Maximum connection retries */
    maxRetries: number;
}

/**
 * Default MCP client configuration
 */
export const DEFAULT_MCP_CONFIG = (): MCPClientConfig => ({
    binaryPath: '',
    timeout: 30000,
    autoReconnect: true,
    retryDelay: 1000,
    maxRetries: 3,
});

// =============================================================================
// JSON-RPC TYPES
// =============================================================================

/**
 * JSON-RPC request
 */
export interface JsonRpcRequest {
    jsonrpc: '2.0';
    id: number | string;
    method: string;
    params?: Record<string, unknown>;
}

/**
 * JSON-RPC response
 */
export interface JsonRpcResponse<T = unknown> {
    jsonrpc: '2.0';
    id: number | string;
    result?: T;
    error?: JsonRpcError;
}

/**
 * JSON-RPC error
 */
export interface JsonRpcError {
    code: number;
    message: string;
    data?: unknown;
}

// =============================================================================
// MCP PROTOCOL TYPES
// =============================================================================

/**
 * MCP tool definition
 */
export interface MCPTool {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, MCPPropertySchema>;
        required?: string[];
    };
}

/**
 * MCP property schema
 */
export interface MCPPropertySchema {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    description?: string;
    enum?: string[];
    items?: MCPPropertySchema;
    default?: unknown;
}

/**
 * MCP tool call result
 */
export interface MCPToolResult {
    content: Array<{
        type: 'text';
        text: string;
    }>;
    isError?: boolean;
}

// =============================================================================
// MCP CLIENT EVENTS
// =============================================================================

/**
 * MCP connection state
 */
export type MCPConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * MCP client event types
 */
export type MCPClientEvent =
    | { type: 'connected' }
    | { type: 'disconnected'; reason?: string }
    | { type: 'error'; error: Error }
    | { type: 'reconnecting'; attempt: number };

/**
 * MCP client event handler
 */
export type MCPClientEventHandler = (event: MCPClientEvent) => void;

// =============================================================================
// TOOL RESULT TYPES (Typed responses from MCP tools)
// =============================================================================

/**
 * Parse document result
 */
export interface ParseDocumentResult {
    title: string | null;
    description: string | null;
    refinement: number;
    audience: string;
    form: string;
    stubs: StubInfo[];
    references: string[];
    tags: string[];
    modified: string | null;
}

/**
 * Stub information
 */
export interface StubInfo {
    stub_type: string;
    description: string;
    stub_form: string;
    priority: string;
    inline_anchors: string[];
    gap_id: string | null;
    due: string | null;
}

/**
 * Analyze document result
 */
export interface AnalyzeDocumentResult {
    properties: ParseDocumentResult;
    dimensions: {
        health: number;
        usefulness: {
            margin: number;
            audience_gate: number;
            meets_gate: boolean;
        };
        stub_count: number;
        blocking_count: number;
        form_stage: string;
    };
}

/**
 * Validate document result
 */
export interface ValidateDocumentResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
}

/**
 * Validation error
 */
export interface ValidationError {
    field: string;
    message: string;
    line?: number;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
    field: string;
    message: string;
    suggestion?: string;
}

/**
 * Add stub result
 */
export interface AddStubResult {
    updated_content: string;
    stub_id: string;
    stub_index: number;
}

/**
 * Resolve stub result
 */
export interface ResolveStubResult {
    updated_content: string;
    resolved_stub: StubInfo;
}

/**
 * Update stub result
 */
export interface UpdateStubResult {
    updated_content: string;
    updated_stub: StubInfo;
}

/**
 * Anchor link result
 */
export interface AnchorLinkResult {
    updated_content: string;
    stub_index: number;
    anchor_id: string;
}

/**
 * Find anchors result
 */
export interface FindAnchorsResult {
    anchors: AnchorInfo[];
}

/**
 * Anchor information
 */
export interface AnchorInfo {
    id: string;
    line: number;
    linked_stubs: number[];
}

/**
 * Health calculation result
 */
export interface HealthResult {
    health: number;
    components: {
        refinement_weight: number;
        stub_penalty: number;
        blocking_penalty: number;
    };
}

/**
 * Usefulness calculation result
 */
export interface UsefulnessResult {
    margin: number;
    audience_gate: number;
    meets_gate: boolean;
    next_gate?: {
        audience: string;
        threshold: number;
        gap: number;
    };
}

/**
 * Vault scan result
 */
export interface VaultScanResult {
    documents: VaultDocument[];
    total: number;
    scanned: number;
    errors: string[];
}

/**
 * Vault document info
 */
export interface VaultDocument {
    path: string;
    title: string | null;
    refinement: number;
    health: number;
    stub_count: number;
    blocking_count: number;
    form: string;
    audience: string;
}

/**
 * Blocking stubs result
 */
export interface BlockingStubsResult {
    blocking_stubs: Array<{
        path: string;
        stub_index: number;
        stub: StubInfo;
    }>;
    total: number;
}

// =============================================================================
// SEARCH TYPES
// =============================================================================

/**
 * Search provider types
 */
export type SearchProvider = 'vault' | 'smart-connections' | 'openalex' | 'web';

/**
 * Unified search result
 */
export interface SearchResult {
    /** Unique identifier */
    id: string;
    /** Result title */
    title: string;
    /** Source provider */
    provider: SearchProvider;
    /** Relevance score (0-1) */
    score: number;
    /** Result snippet or excerpt */
    snippet?: string;
    /** Full content if available */
    content?: string;
    /** URL or path */
    url?: string;
    /** Additional metadata */
    metadata?: Record<string, unknown>;
}

/**
 * Search options
 */
export interface SearchOptions {
    /** Providers to use (default: all enabled) */
    providers?: SearchProvider[];
    /** Maximum results per provider */
    maxResults?: number;
    /** Minimum relevance score */
    minScore?: number;
    /** Include full content */
    includeContent?: boolean;
}

/**
 * Search response
 */
export interface SearchResponse {
    /** Search query */
    query: string;
    /** Combined results from all providers */
    results: SearchResult[];
    /** Results grouped by provider */
    byProvider: Record<SearchProvider, SearchResult[]>;
    /** Providers that were searched */
    providersUsed: SearchProvider[];
    /** Any errors encountered */
    errors: Array<{ provider: SearchProvider; message: string }>;
}

/**
 * Vault search result
 */
export interface VaultSearchResult extends SearchResult {
    provider: 'vault';
    /** File path */
    path: string;
    /** Line number if applicable */
    line?: number;
    /** Match type */
    matchType: 'title' | 'content' | 'tag' | 'frontmatter';
}

/**
 * Smart Connections search result
 */
export interface SmartConnectionsResult extends SearchResult {
    provider: 'smart-connections';
    /** File path */
    path: string;
    /** Semantic similarity score */
    similarity: number;
}

/**
 * OpenAlex academic search result
 */
export interface OpenAlexResult extends SearchResult {
    provider: 'openalex';
    /** Paper authors */
    authors: string[];
    /** Publication year */
    year: number;
    /** DOI */
    doi?: string;
    /** Citation count */
    citationCount: number;
    /** Journal/venue */
    venue?: string;
    /** Open access URL */
    openAccessUrl?: string;
}

/**
 * Web search result
 */
export interface WebSearchResult extends SearchResult {
    provider: 'web';
    /** Source LLM provider */
    llmProvider: 'anthropic' | 'openai' | 'gemini';
    /** Page URL */
    url: string;
}

// =============================================================================
// MCP SETTINGS FOR PLUGIN
// =============================================================================

/**
 * MCP settings stored in plugin configuration
 */
export interface MCPSettings {
    /** Whether MCP integration is enabled */
    enabled: boolean;

    /** Path to dd-mcp binary (empty = auto-detect) */
    binaryPath: string;

    /** Auto-connect on plugin load */
    autoConnect: boolean;

    /** Connection timeout in milliseconds */
    connectionTimeout: number;

    /** Show connection status in status bar */
    showStatusBar: boolean;
}

/**
 * Default MCP settings
 */
export const DEFAULT_MCP_SETTINGS = (): MCPSettings => ({
    enabled: false,
    binaryPath: '',
    autoConnect: true,
    connectionTimeout: 30000,
    showStatusBar: true,
});

// =============================================================================
// BINARY SEARCH PATHS
// =============================================================================

/**
 * Default paths to search for dd-mcp binary
 */
export const BINARY_SEARCH_PATHS = [
    // Cargo bin (installed via cargo install)
    '~/.cargo/bin/dd-mcp',
    // Homebrew (macOS)
    '/opt/homebrew/bin/dd-mcp',
    '/usr/local/bin/dd-mcp',
    // Linux
    '/usr/bin/dd-mcp',
    // Windows
    '%USERPROFILE%\\.cargo\\bin\\dd-mcp.exe',
    // Local development builds
    '/Users/josueguevara/Documents/Builds/doc-doctor/core/target/release/dd-mcp',
    '/Users/josueguevara/Documents/Builds/doc-doctor/core/target/debug/dd-mcp',
];
