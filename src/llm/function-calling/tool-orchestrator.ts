/**
 * Tool Orchestrator
 *
 * Manages available tools and executes tool calls from LLM responses.
 * Supports MCP tools, search tools, and vault tools.
 */

import type { App } from 'obsidian';
import type { MCPTools } from '../../mcp/mcp-tools';
import type {
    ToolDefinition,
    ToolCall,
    ToolResult,
    TrackedToolCall,
    ToolRequestOptions,
} from './types';
import { generateToolCallId } from './types';
import type { FirecrawlConfig } from '../llm-types';
import type { OpenAlexConfig } from '../providers/provider-types';
import { FirecrawlService, getRelatedNotesFromSmartConnections } from '../firecrawl-service';
import { OpenAlexService } from '../providers/openalex-service';

// =============================================================================
// BUILT-IN TOOL DEFINITIONS
// =============================================================================

/**
 * Web search tool definition
 */
const WEB_SEARCH_TOOL: ToolDefinition = {
    name: 'web_search',
    description: 'Search the web for information relevant to the document. Use for finding sources, citations, or verifying claims.',
    parameters: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'The search query to execute',
            },
            max_results: {
                type: 'number',
                description: 'Maximum number of results to return (default: 5)',
            },
        },
        required: ['query'],
    },
    source: 'search',
    requiresConfirmation: false,
    mutates: false,
};

/**
 * Semantic search tool definition (vault-based)
 */
const SEMANTIC_SEARCH_TOOL: ToolDefinition = {
    name: 'semantic_search',
    description: 'Search for semantically related notes in the vault using embeddings. Returns notes similar in meaning to the query.',
    parameters: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'The search query or concept to find related notes for',
            },
            limit: {
                type: 'number',
                description: 'Maximum number of results to return (default: 5)',
            },
            exclude_current: {
                type: 'boolean',
                description: 'Whether to exclude the current document from results',
            },
        },
        required: ['query'],
    },
    source: 'vault',
    requiresConfirmation: false,
    mutates: false,
};

/**
 * OpenAlex academic search tool definition
 */
const OPENALEX_SEARCH_TOOL: ToolDefinition = {
    name: 'openalex_search',
    description: 'Search OpenAlex academic database for scholarly works, papers, and citations.',
    parameters: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'The academic search query',
            },
            filter: {
                type: 'string',
                description: 'Optional OpenAlex filter (e.g., "publication_year:2023")',
            },
            max_results: {
                type: 'number',
                description: 'Maximum number of results to return (default: 5)',
            },
        },
        required: ['query'],
    },
    source: 'search',
    requiresConfirmation: false,
    mutates: false,
};

// =============================================================================
// TOOL ORCHESTRATOR CLASS
// =============================================================================

/**
 * Configuration for the tool orchestrator
 */
export interface ToolOrchestratorConfig {
    /** Obsidian app instance */
    app: App;

    /** MCP tools instance (optional, for MCP integration) */
    mcpTools?: MCPTools;

    /** Whether web search is enabled */
    webSearchEnabled?: boolean;

    /** Whether semantic search is enabled */
    semanticSearchEnabled?: boolean;

    /** Whether OpenAlex search is enabled */
    openAlexEnabled?: boolean;

    /** Default timeout for tool execution (ms) */
    defaultTimeout?: number;

    /** Max iterations for tool use loop */
    maxIterations?: number;

    /** Firecrawl configuration for web search */
    firecrawlConfig?: FirecrawlConfig;

    /** OpenAlex configuration for academic search */
    openAlexConfig?: OpenAlexConfig;

    /** Current file path for semantic search context */
    currentFilePath?: string;
}

/**
 * Tool executor function type
 */
type ToolExecutor = (args: Record<string, unknown>) => Promise<string | Record<string, unknown>>;

/**
 * Orchestrates tool definitions and executes tool calls
 */
export class ToolOrchestrator {
    private app: App;
    private mcpTools?: MCPTools;
    private config: Required<Omit<ToolOrchestratorConfig, 'app' | 'mcpTools' | 'firecrawlConfig' | 'openAlexConfig' | 'currentFilePath'>>;
    private customExecutors: Map<string, ToolExecutor> = new Map();
    private trackedCalls: Map<string, TrackedToolCall> = new Map();

    // Service instances
    private firecrawlService?: FirecrawlService;
    private openAlexService?: OpenAlexService;
    private firecrawlConfig?: FirecrawlConfig;
    private openAlexConfig?: OpenAlexConfig;
    private currentFilePath?: string;

    constructor(config: ToolOrchestratorConfig) {
        this.app = config.app;
        this.mcpTools = config.mcpTools;
        this.config = {
            webSearchEnabled: config.webSearchEnabled ?? true,
            semanticSearchEnabled: config.semanticSearchEnabled ?? true,
            openAlexEnabled: config.openAlexEnabled ?? false,
            defaultTimeout: config.defaultTimeout ?? 30000,
            maxIterations: config.maxIterations ?? 10,
        };

        // Initialize service configs
        this.firecrawlConfig = config.firecrawlConfig;
        this.openAlexConfig = config.openAlexConfig;
        this.currentFilePath = config.currentFilePath;

        // Initialize services if configs provided
        if (config.firecrawlConfig) {
            this.firecrawlService = new FirecrawlService(config.firecrawlConfig);
        }
        if (config.openAlexConfig) {
            this.openAlexService = new OpenAlexService(config.openAlexConfig);
        }
    }

    /**
     * Update MCP tools reference (when connection changes)
     */
    setMCPTools(mcpTools: MCPTools | undefined): void {
        this.mcpTools = mcpTools;
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<ToolOrchestratorConfig>): void {
        if (config.webSearchEnabled !== undefined) {
            this.config.webSearchEnabled = config.webSearchEnabled;
        }
        if (config.semanticSearchEnabled !== undefined) {
            this.config.semanticSearchEnabled = config.semanticSearchEnabled;
        }
        if (config.openAlexEnabled !== undefined) {
            this.config.openAlexEnabled = config.openAlexEnabled;
        }
        if (config.defaultTimeout !== undefined) {
            this.config.defaultTimeout = config.defaultTimeout;
        }
        if (config.maxIterations !== undefined) {
            this.config.maxIterations = config.maxIterations;
        }
        // Update service configs and reinitialize services
        if (config.firecrawlConfig !== undefined) {
            this.firecrawlConfig = config.firecrawlConfig;
            this.firecrawlService = config.firecrawlConfig
                ? new FirecrawlService(config.firecrawlConfig)
                : undefined;
        }
        if (config.openAlexConfig !== undefined) {
            this.openAlexConfig = config.openAlexConfig;
            this.openAlexService = config.openAlexConfig
                ? new OpenAlexService(config.openAlexConfig)
                : undefined;
        }
        if (config.currentFilePath !== undefined) {
            this.currentFilePath = config.currentFilePath;
        }
    }

    /**
     * Update current file path for semantic search context
     */
    setCurrentFilePath(path: string | undefined): void {
        this.currentFilePath = path;
    }

    /**
     * Register a custom tool executor
     */
    registerExecutor(toolName: string, executor: ToolExecutor): void {
        this.customExecutors.set(toolName, executor);
    }

    /**
     * Unregister a custom tool executor
     */
    unregisterExecutor(toolName: string): void {
        this.customExecutors.delete(toolName);
    }

    /**
     * Get all available tool definitions
     */
    getAvailableTools(): ToolDefinition[] {
        const tools: ToolDefinition[] = [];

        // Add search tools based on configuration
        if (this.config.webSearchEnabled) {
            tools.push(WEB_SEARCH_TOOL);
        }

        if (this.config.semanticSearchEnabled) {
            tools.push(SEMANTIC_SEARCH_TOOL);
        }

        if (this.config.openAlexEnabled) {
            tools.push(OPENALEX_SEARCH_TOOL);
        }

        // Add MCP tools if available
        if (this.mcpTools) {
            tools.push(...this.getMCPToolDefinitions());
        }

        return tools;
    }

    /**
     * Get tool definitions from MCP
     */
    private getMCPToolDefinitions(): ToolDefinition[] {
        // MCP tools - these will be prefixed with mcp_
        const mcpTools: ToolDefinition[] = [
            {
                name: 'mcp_parse_document',
                description: 'Parse a document and extract frontmatter properties, stubs, and structure.',
                parameters: {
                    type: 'object',
                    properties: {
                        content: {
                            type: 'string',
                            description: 'The document content to parse',
                        },
                    },
                    required: ['content'],
                },
                source: 'mcp',
                mutates: false,
            },
            {
                name: 'mcp_analyze_document',
                description: 'Analyze document health and calculate L2 dimensions.',
                parameters: {
                    type: 'object',
                    properties: {
                        content: {
                            type: 'string',
                            description: 'The document content to analyze',
                        },
                    },
                    required: ['content'],
                },
                source: 'mcp',
                mutates: false,
            },
            {
                name: 'mcp_calculate_health',
                description: 'Calculate document health score based on refinement and stubs.',
                parameters: {
                    type: 'object',
                    properties: {
                        refinement: {
                            type: 'number',
                            description: 'Document refinement score (0-1)',
                        },
                        stub_count: {
                            type: 'number',
                            description: 'Number of unresolved stubs',
                        },
                    },
                    required: ['refinement'],
                },
                source: 'mcp',
                mutates: false,
            },
            {
                name: 'mcp_add_stub',
                description: 'Add a new stub to the document frontmatter.',
                parameters: {
                    type: 'object',
                    properties: {
                        content: {
                            type: 'string',
                            description: 'The document content',
                        },
                        stub_type: {
                            type: 'string',
                            description: 'Type of stub to add (e.g., source, expand, link)',
                        },
                        description: {
                            type: 'string',
                            description: 'Description of the stub',
                        },
                    },
                    required: ['content', 'stub_type', 'description'],
                },
                source: 'mcp',
                mutates: true,
            },
        ];

        return mcpTools;
    }

    /**
     * Execute a single tool call
     */
    async executeToolCall(call: ToolCall): Promise<ToolResult> {
        const startTime = Date.now();
        const tracked: TrackedToolCall = {
            ...call,
            state: 'executing',
            startedAt: startTime,
        };
        this.trackedCalls.set(call.id, tracked);

        try {
            let content: string | Record<string, unknown>;

            // Check for custom executor first
            const customExecutor = this.customExecutors.get(call.name);
            if (customExecutor) {
                content = await this.executeWithTimeout(
                    () => customExecutor(call.arguments),
                    this.config.defaultTimeout,
                );
            } else if (call.name.startsWith('mcp_')) {
                content = await this.executeMCPTool(call);
            } else {
                content = await this.executeBuiltInTool(call);
            }

            const result: ToolResult = {
                toolCallId: call.id,
                success: true,
                content,
                metadata: {
                    duration: Date.now() - startTime,
                    source: call.name.startsWith('mcp_') ? 'mcp' : 'builtin',
                },
            };

            tracked.state = 'completed';
            tracked.completedAt = Date.now();
            tracked.result = result;

            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            const result: ToolResult = {
                toolCallId: call.id,
                success: false,
                content: '',
                error: errorMessage,
                metadata: {
                    duration: Date.now() - startTime,
                },
            };

            tracked.state = 'failed';
            tracked.completedAt = Date.now();
            tracked.result = result;

            return result;
        }
    }

    /**
     * Execute multiple tool calls
     */
    async executeToolCalls(calls: ToolCall[]): Promise<ToolResult[]> {
        // Execute in parallel for better performance
        return Promise.all(calls.map((call) => this.executeToolCall(call)));
    }

    /**
     * Execute built-in tool
     */
    private async executeBuiltInTool(call: ToolCall): Promise<string | Record<string, unknown>> {
        switch (call.name) {
            case 'web_search':
                return this.executeWebSearch(call.arguments);
            case 'semantic_search':
                return this.executeSemanticSearch(call.arguments);
            case 'openalex_search':
                return this.executeOpenAlexSearch(call.arguments);
            default:
                throw new Error(`Unknown tool: ${call.name}`);
        }
    }

    /**
     * Execute MCP tool
     */
    private async executeMCPTool(call: ToolCall): Promise<string | Record<string, unknown>> {
        if (!this.mcpTools) {
            throw new Error('MCP tools not available');
        }

        const toolName = call.name.replace('mcp_', '');

        // Route to appropriate MCP method and convert result to plain object
        switch (toolName) {
            case 'parse_document': {
                const result = await this.mcpTools.parseDocument(call.arguments.content as string);
                return JSON.parse(JSON.stringify(result)) as Record<string, unknown>;
            }
            case 'analyze_document': {
                const result = await this.mcpTools.analyzeDocument(call.arguments.content as string);
                return JSON.parse(JSON.stringify(result)) as Record<string, unknown>;
            }
            case 'calculate_health': {
                const result = await this.mcpTools.calculateHealth(
                    call.arguments.refinement as number,
                    (call.arguments.stub_count as number) ?? 0,
                    (call.arguments.blocking_count as number) ?? 0,
                );
                return JSON.parse(JSON.stringify(result)) as Record<string, unknown>;
            }
            case 'add_stub': {
                const result = await this.mcpTools.addStub(
                    call.arguments.content as string,
                    call.arguments.stub_type as string,
                    call.arguments.description as string,
                );
                return JSON.parse(JSON.stringify(result)) as Record<string, unknown>;
            }
            default:
                throw new Error(`Unknown MCP tool: ${toolName}`);
        }
    }

    /**
     * Execute web search via Firecrawl service
     */
    private async executeWebSearch(
        args: Record<string, unknown>,
    ): Promise<string | Record<string, unknown>> {
        const query = args.query as string;
        const maxResults = (args.max_results as number) || 5;

        console.log(`[Tool Orchestrator] Web search: "${query}" (max: ${maxResults})`);

        // Check if Firecrawl service is available and configured
        if (!this.firecrawlService || !this.firecrawlConfig?.enabled) {
            return {
                query,
                error: 'Web search not configured. Enable Firecrawl in settings.',
                results: [],
            };
        }

        try {
            const searchResults = await this.firecrawlService.search(query);

            // Limit results to maxResults
            const limitedResults = searchResults.slice(0, maxResults);

            // Map to tool result format
            const results = limitedResults.map(result => ({
                title: result.title,
                url: result.url,
                snippet: result.description,
                content: result.content,
            }));

            console.log(`[Tool Orchestrator] Web search returned ${results.length} results`);

            return {
                query,
                success: true,
                results,
                resultCount: results.length,
            };
        } catch (error) {
            console.error('[Tool Orchestrator] Web search error:', error);
            return {
                query,
                error: `Web search failed: ${(error as Error).message}`,
                results: [],
            };
        }
    }

    /**
     * Execute semantic search via Smart Connections plugin
     */
    private async executeSemanticSearch(
        args: Record<string, unknown>,
    ): Promise<string | Record<string, unknown>> {
        const query = args.query as string;
        const limit = (args.limit as number) || 5;
        const excludeCurrent = (args.exclude_current as boolean) ?? true;

        console.log(`[Tool Orchestrator] Semantic search: "${query}" (limit: ${limit})`);

        // Check if Smart Connections integration is enabled
        if (!this.firecrawlConfig?.smartConnectionsEnabled) {
            return {
                query,
                error: 'Semantic search not enabled. Enable Smart Connections in settings.',
                results: [],
            };
        }

        // Need a current file path for Smart Connections to find related notes
        const currentPath = this.currentFilePath;
        if (!currentPath) {
            return {
                query,
                error: 'No current file context for semantic search.',
                results: [],
            };
        }

        try {
            // Use Smart Connections to find related notes
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const relatedNotes = await getRelatedNotesFromSmartConnections(
                this.app as any,
                currentPath,
                limit + (excludeCurrent ? 1 : 0), // Request extra to account for exclusion
            );

            // Filter out current file if requested
            let filteredResults = relatedNotes;
            if (excludeCurrent) {
                filteredResults = relatedNotes.filter(note => note.path !== currentPath);
            }

            // Limit to requested count
            const limitedResults = filteredResults.slice(0, limit);

            // Map to tool result format
            const results = limitedResults.map(note => ({
                path: note.path,
                title: note.title,
                similarity: note.similarity,
            }));

            console.log(`[Tool Orchestrator] Semantic search returned ${results.length} results`);

            return {
                query,
                success: true,
                results,
                resultCount: results.length,
                note: relatedNotes.length === 0
                    ? 'Smart Connections found no related notes. Embeddings may not be indexed.'
                    : undefined,
            };
        } catch (error) {
            console.error('[Tool Orchestrator] Semantic search error:', error);
            return {
                query,
                error: `Semantic search failed: ${(error as Error).message}`,
                results: [],
            };
        }
    }

    /**
     * Execute OpenAlex academic search
     */
    private async executeOpenAlexSearch(
        args: Record<string, unknown>,
    ): Promise<string | Record<string, unknown>> {
        const query = args.query as string;
        const filter = args.filter as string | undefined;
        const maxResults = (args.max_results as number) || 5;

        console.log(`[Tool Orchestrator] OpenAlex search: "${query}" (filter: ${filter}, max: ${maxResults})`);

        // Check if OpenAlex service is available and enabled
        if (!this.openAlexService || !this.openAlexConfig?.enabled) {
            return {
                query,
                filter,
                error: 'OpenAlex search not enabled. Enable OpenAlex in settings.',
                results: [],
            };
        }

        try {
            // Build search query with optional filter
            let searchQuery = query;
            if (filter) {
                searchQuery = `${query} ${filter}`;
            }

            const academicResults = await this.openAlexService.search(searchQuery);

            // Limit results to maxResults
            const limitedResults = academicResults.slice(0, maxResults);

            // Map to tool result format
            const results = limitedResults.map(result => ({
                title: result.title,
                authors: result.authors,
                year: result.year,
                doi: result.doi,
                abstract: result.abstract,
                citationCount: result.citationCount,
                venue: result.venue,
                openAccessUrl: result.openAccessUrl,
                openAlexUrl: result.openAlexUrl,
            }));

            console.log(`[Tool Orchestrator] OpenAlex search returned ${results.length} results`);

            return {
                query,
                filter,
                success: true,
                results,
                resultCount: results.length,
            };
        } catch (error) {
            console.error('[Tool Orchestrator] OpenAlex search error:', error);
            return {
                query,
                filter,
                error: `OpenAlex search failed: ${(error as Error).message}`,
                results: [],
            };
        }
    }

    /**
     * Execute a function with timeout
     */
    private async executeWithTimeout<T>(fn: () => Promise<T>, timeout: number): Promise<T> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Tool execution timed out after ${timeout}ms`));
            }, timeout);

            fn()
                .then((result) => {
                    clearTimeout(timer);
                    resolve(result);
                })
                .catch((error) => {
                    clearTimeout(timer);
                    reject(error);
                });
        });
    }

    /**
     * Get tracked tool calls
     */
    getTrackedCalls(): TrackedToolCall[] {
        return Array.from(this.trackedCalls.values());
    }

    /**
     * Clear tracked calls
     */
    clearTrackedCalls(): void {
        this.trackedCalls.clear();
    }

    /**
     * Get default request options
     */
    getDefaultRequestOptions(): ToolRequestOptions {
        return {
            tools: this.getAvailableTools(),
            maxIterations: this.config.maxIterations,
            toolTimeout: this.config.defaultTimeout,
            toolChoice: 'auto',
        };
    }
}

// =============================================================================
// SINGLETON MANAGEMENT
// =============================================================================

let orchestratorInstance: ToolOrchestrator | null = null;

/**
 * Get or create the tool orchestrator singleton
 */
export function getToolOrchestrator(config?: ToolOrchestratorConfig): ToolOrchestrator | null {
    if (config) {
        orchestratorInstance = new ToolOrchestrator(config);
    }
    return orchestratorInstance;
}

/**
 * Reset the tool orchestrator singleton (for testing)
 */
export function resetToolOrchestrator(): void {
    orchestratorInstance = null;
}
