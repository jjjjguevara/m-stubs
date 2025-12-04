/**
 * MCP Tools - Typed Wrappers
 *
 * Provides typed access to all 28 MCP tools.
 */

import { MCPClient } from './mcp-client';
import {
    ParseDocumentResult,
    AnalyzeDocumentResult,
    ValidateDocumentResult,
    AddStubResult,
    ResolveStubResult,
    UpdateStubResult,
    AnchorLinkResult,
    FindAnchorsResult,
    HealthResult,
    UsefulnessResult,
    VaultScanResult,
    BlockingStubsResult,
    StubInfo,
    SearchProvider,
    SearchResult,
    SearchOptions,
    SearchResponse,
    VaultSearchResult,
    SmartConnectionsResult,
    OpenAlexResult,
    WebSearchResult,
} from './mcp-types';
import type LabeledAnnotations from '../main';

/**
 * MCP Tools wrapper for typed tool access
 */
export class MCPTools {
    private plugin?: LabeledAnnotations;

    constructor(private client: MCPClient, plugin?: LabeledAnnotations) {
        this.plugin = plugin;
    }

    /**
     * Set the plugin reference for search operations
     */
    setPlugin(plugin: LabeledAnnotations): void {
        this.plugin = plugin;
    }

    // =========================================================================
    // ANALYSIS OPERATIONS
    // =========================================================================

    /**
     * Parse document content and extract L1 properties
     */
    async parseDocument(content: string): Promise<ParseDocumentResult> {
        return this.client.callTool<ParseDocumentResult>('parse_document', { content });
    }

    /**
     * Full document analysis with L2 dimensions
     */
    async analyzeDocument(content: string): Promise<AnalyzeDocumentResult> {
        return this.client.callTool<AnalyzeDocumentResult>('analyze_document', { content });
    }

    /**
     * Validate frontmatter against schema
     */
    async validateDocument(content: string, strict = false): Promise<ValidateDocumentResult> {
        return this.client.callTool<ValidateDocumentResult>('validate_document', { content, strict });
    }

    /**
     * Read and optionally analyze a document from disk
     */
    async readDocument(path: string, analyze = true): Promise<{
        content: string;
        analysis?: AnalyzeDocumentResult;
    }> {
        return this.client.callTool('read_document', { path, analyze });
    }

    // =========================================================================
    // STUB MANAGEMENT
    // =========================================================================

    /**
     * Add a stub to document frontmatter
     */
    async addStub(
        content: string,
        stubType: string,
        description: string,
        options?: {
            stubForm?: 'transient' | 'persistent' | 'blocking';
            priority?: 'low' | 'medium' | 'high' | 'critical';
            anchor?: string;
        }
    ): Promise<AddStubResult> {
        return this.client.callTool<AddStubResult>('add_stub', {
            content,
            stub_type: stubType,
            description,
            stub_form: options?.stubForm,
            priority: options?.priority,
            anchor: options?.anchor,
        });
    }

    /**
     * Resolve (remove) a stub by index
     */
    async resolveStub(content: string, stubIndex: number): Promise<ResolveStubResult> {
        return this.client.callTool<ResolveStubResult>('resolve_stub', {
            content,
            stub_index: stubIndex,
        });
    }

    /**
     * Update stub properties
     */
    async updateStub(
        content: string,
        stubIndex: number,
        updates: {
            description?: string;
            stubForm?: 'transient' | 'persistent' | 'blocking';
            priority?: 'low' | 'medium' | 'high' | 'critical';
            stubType?: string;
        }
    ): Promise<UpdateStubResult> {
        return this.client.callTool<UpdateStubResult>('update_stub', {
            content,
            stub_index: stubIndex,
            description: updates.description,
            stub_form: updates.stubForm,
            priority: updates.priority,
            stub_type: updates.stubType,
        });
    }

    /**
     * List all stubs in a document
     */
    async listStubs(
        content: string,
        filter?: {
            stubType?: string;
            stubForm?: string;
            priority?: string;
        }
    ): Promise<{ stubs: StubInfo[]; total: number }> {
        return this.client.callTool('list_stubs', {
            content,
            stub_type: filter?.stubType,
            stub_form: filter?.stubForm,
            priority: filter?.priority,
        });
    }

    // =========================================================================
    // ANCHOR MANAGEMENT
    // =========================================================================

    /**
     * Find all inline anchors in document content
     */
    async findStubAnchors(content: string): Promise<FindAnchorsResult> {
        return this.client.callTool<FindAnchorsResult>('find_stub_anchors', { content });
    }

    /**
     * Link a stub to an inline anchor
     */
    async linkStubAnchor(
        content: string,
        stubIndex: number,
        anchorId: string
    ): Promise<AnchorLinkResult> {
        return this.client.callTool<AnchorLinkResult>('link_stub_anchor', {
            content,
            stub_index: stubIndex,
            anchor_id: anchorId,
        });
    }

    /**
     * Unlink a stub from an inline anchor
     */
    async unlinkStubAnchor(
        content: string,
        stubIndex: number,
        anchorId: string
    ): Promise<AnchorLinkResult> {
        return this.client.callTool<AnchorLinkResult>('unlink_stub_anchor', {
            content,
            stub_index: stubIndex,
            anchor_id: anchorId,
        });
    }

    // =========================================================================
    // CALCULATIONS
    // =========================================================================

    /**
     * Calculate health score
     */
    async calculateHealth(refinement: number, stubCount: number, blockingCount: number): Promise<HealthResult> {
        return this.client.callTool<HealthResult>('calculate_health', {
            refinement,
            stub_count: stubCount,
            blocking_count: blockingCount,
        });
    }

    /**
     * Calculate usefulness margin
     */
    async calculateUsefulness(refinement: number, audience: string): Promise<UsefulnessResult> {
        return this.client.callTool<UsefulnessResult>('calculate_usefulness', {
            refinement,
            audience,
        });
    }

    /**
     * Get audience gate thresholds
     */
    async getAudienceGates(): Promise<{
        self: number;
        team: number;
        internal: number;
        external: number;
    }> {
        return this.client.callTool('get_audience_gates', {});
    }

    // =========================================================================
    // VAULT OPERATIONS
    // =========================================================================

    /**
     * Scan vault directory for documents
     */
    async scanVault(
        path: string,
        options?: {
            recursive?: boolean;
            includeAnalysis?: boolean;
            pattern?: string;
        }
    ): Promise<VaultScanResult> {
        return this.client.callTool<VaultScanResult>('scan_vault', {
            path,
            recursive: options?.recursive ?? true,
            include_analysis: options?.includeAnalysis ?? true,
            pattern: options?.pattern,
        });
    }

    /**
     * Find all blocking stubs across documents
     */
    async findBlockingStubs(paths: string[]): Promise<BlockingStubsResult> {
        return this.client.callTool<BlockingStubsResult>('find_blocking_stubs', { paths });
    }

    /**
     * Detect stale documents
     */
    async detectStaleDocuments(
        paths: string[],
        cadences?: Record<string, number>
    ): Promise<{
        stale_documents: Array<{
            path: string;
            form: string;
            days_since_modified: number;
            expected_cadence: number;
        }>;
        total: number;
    }> {
        return this.client.callTool('detect_stale_documents', {
            paths,
            cadences,
        });
    }

    // =========================================================================
    // SCHEMA
    // =========================================================================

    /**
     * Get JSON schema for frontmatter or stubs
     */
    async getSchema(schemaType: 'frontmatter' | 'stub' | 'full'): Promise<string> {
        return this.client.callTool<string>('get_schema', { schema_type: schemaType });
    }

    /**
     * Get stub type definitions
     */
    async getStubTypes(): Promise<{
        types: Array<{
            key: string;
            label: string;
            description: string;
            vector_family: string;
            default_form: string;
        }>;
    }> {
        return this.client.callTool('get_stub_types', {});
    }

    // =========================================================================
    // FRONTMATTER OPERATIONS
    // =========================================================================

    /**
     * Update refinement value
     */
    async updateRefinement(content: string, refinement: number): Promise<{ updated_content: string }> {
        return this.client.callTool('update_refinement', { content, refinement });
    }

    /**
     * Update audience value
     */
    async updateAudience(content: string, audience: string): Promise<{ updated_content: string }> {
        return this.client.callTool('update_audience', { content, audience });
    }

    /**
     * Update form value
     */
    async updateForm(content: string, form: string): Promise<{ updated_content: string }> {
        return this.client.callTool('update_form', { content, form });
    }

    /**
     * Add a reference to frontmatter
     */
    async addReference(content: string, reference: string): Promise<{ updated_content: string }> {
        return this.client.callTool('add_reference', { content, reference });
    }

    /**
     * Remove a reference from frontmatter
     */
    async removeReference(content: string, reference: string): Promise<{ updated_content: string }> {
        return this.client.callTool('remove_reference', { content, reference });
    }

    /**
     * Add a tag to frontmatter
     */
    async addTag(content: string, tag: string): Promise<{ updated_content: string }> {
        return this.client.callTool('add_tag', { content, tag });
    }

    /**
     * Remove a tag from frontmatter
     */
    async removeTag(content: string, tag: string): Promise<{ updated_content: string }> {
        return this.client.callTool('remove_tag', { content, tag });
    }

    // =========================================================================
    // BATCH OPERATIONS
    // =========================================================================

    /**
     * Batch analyze multiple documents
     */
    async batchAnalyze(paths: string[]): Promise<{
        results: Array<{
            path: string;
            analysis?: AnalyzeDocumentResult;
            error?: string;
        }>;
        total: number;
        successful: number;
    }> {
        return this.client.callTool('batch_analyze', { paths });
    }

    /**
     * Suggest improvements for a document
     */
    async suggestImprovements(content: string): Promise<{
        suggestions: Array<{
            type: 'stub' | 'refinement' | 'audience' | 'form';
            description: string;
            priority: 'low' | 'medium' | 'high';
            impact: string;
        }>;
    }> {
        return this.client.callTool('suggest_improvements', { content });
    }

    // =========================================================================
    // SEARCH OPERATIONS
    // =========================================================================

    /**
     * Unified search across multiple providers
     *
     * Searches vault, Smart Connections, OpenAlex, and web search providers
     * based on enabled settings and provider options.
     */
    async search(query: string, options?: SearchOptions): Promise<SearchResponse> {
        const response: SearchResponse = {
            query,
            results: [],
            byProvider: {
                vault: [],
                'smart-connections': [],
                openalex: [],
                web: [],
            },
            providersUsed: [],
            errors: [],
        };

        if (!this.plugin) {
            response.errors.push({
                provider: 'vault',
                message: 'Plugin not initialized',
            });
            return response;
        }

        const settings = this.plugin.settings.getValue();
        const providers = options?.providers ?? this.getEnabledProviders();
        const maxResults = options?.maxResults ?? 5;

        // Run searches in parallel
        const searchPromises: Promise<void>[] = [];

        if (providers.includes('vault')) {
            searchPromises.push(
                this.searchVault(query, maxResults)
                    .then(results => {
                        response.byProvider.vault = results;
                        response.results.push(...results);
                        response.providersUsed.push('vault');
                    })
                    .catch(error => {
                        response.errors.push({
                            provider: 'vault',
                            message: error.message,
                        });
                    }),
            );
        }

        if (providers.includes('smart-connections')) {
            searchPromises.push(
                this.searchSmartConnections(query, maxResults)
                    .then(results => {
                        response.byProvider['smart-connections'] = results;
                        response.results.push(...results);
                        response.providersUsed.push('smart-connections');
                    })
                    .catch(error => {
                        response.errors.push({
                            provider: 'smart-connections',
                            message: error.message,
                        });
                    }),
            );
        }

        if (providers.includes('openalex') && settings.providers?.externalContext?.openAlex?.enabled) {
            searchPromises.push(
                this.searchOpenAlex(query, maxResults)
                    .then(results => {
                        response.byProvider.openalex = results;
                        response.results.push(...results);
                        response.providersUsed.push('openalex');
                    })
                    .catch(error => {
                        response.errors.push({
                            provider: 'openalex',
                            message: error.message,
                        });
                    }),
            );
        }

        if (providers.includes('web') && this.isWebSearchEnabled()) {
            searchPromises.push(
                this.searchWeb(query, maxResults)
                    .then(results => {
                        response.byProvider.web = results;
                        response.results.push(...results);
                        response.providersUsed.push('web');
                    })
                    .catch(error => {
                        response.errors.push({
                            provider: 'web',
                            message: error.message,
                        });
                    }),
            );
        }

        await Promise.all(searchPromises);

        // Sort by score
        response.results.sort((a, b) => b.score - a.score);

        // Apply minimum score filter
        if (options?.minScore) {
            response.results = response.results.filter(r => r.score >= options.minScore!);
        }

        return response;
    }

    /**
     * Search only specific provider
     */
    async searchProvider(
        provider: SearchProvider,
        query: string,
        maxResults = 5,
    ): Promise<SearchResult[]> {
        switch (provider) {
            case 'vault':
                return this.searchVault(query, maxResults);
            case 'smart-connections':
                return this.searchSmartConnections(query, maxResults);
            case 'openalex':
                return this.searchOpenAlex(query, maxResults);
            case 'web':
                return this.searchWeb(query, maxResults);
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }
    }

    /**
     * Get currently enabled search providers
     */
    getEnabledProviders(): SearchProvider[] {
        const providers: SearchProvider[] = ['vault']; // Always available

        if (!this.plugin) return providers;

        const settings = this.plugin.settings.getValue();

        // Smart Connections
        if (settings.providers?.externalContext?.smartConnections?.enabled) {
            if (this.plugin.smartConnectionsService?.getStatus().smartConnections) {
                providers.push('smart-connections');
            }
        }

        // OpenAlex
        if (settings.providers?.externalContext?.openAlex?.enabled) {
            providers.push('openalex');
        }

        // Web search
        if (this.isWebSearchEnabled()) {
            providers.push('web');
        }

        return providers;
    }

    // =========================================================================
    // PRIVATE SEARCH IMPLEMENTATIONS
    // =========================================================================

    /**
     * Search vault files
     */
    private async searchVault(query: string, maxResults: number): Promise<VaultSearchResult[]> {
        if (!this.plugin) return [];

        const results: VaultSearchResult[] = [];
        const queryLower = query.toLowerCase();

        // Search through vault files
        const files = this.plugin.app.vault.getMarkdownFiles();

        for (const file of files) {
            let score = 0;
            let matchType: VaultSearchResult['matchType'] = 'content';

            // Check title match
            const titleMatch = file.basename.toLowerCase().includes(queryLower);
            if (titleMatch) {
                score = 0.9;
                matchType = 'title';
            } else {
                // Check content match (simple keyword search)
                try {
                    const content = await this.plugin.app.vault.cachedRead(file);
                    if (content.toLowerCase().includes(queryLower)) {
                        score = 0.6;
                        matchType = 'content';
                    }
                } catch {
                    continue;
                }
            }

            if (score > 0) {
                results.push({
                    id: `vault:${file.path}`,
                    title: file.basename,
                    provider: 'vault',
                    score,
                    path: file.path,
                    matchType,
                    url: file.path,
                });
            }

            if (results.length >= maxResults * 2) break; // Get extra for sorting
        }

        // Sort by score and limit
        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, maxResults);
    }

    /**
     * Search via Smart Connections
     */
    private async searchSmartConnections(
        query: string,
        maxResults: number,
    ): Promise<SmartConnectionsResult[]> {
        if (!this.plugin?.smartConnectionsService) return [];

        try {
            const related = await this.plugin.smartConnectionsService.search(
                query,
                maxResults,
            );

            return related.map(note => ({
                id: `sc:${note.path}`,
                title: note.path.split('/').pop()?.replace('.md', '') || note.path,
                provider: 'smart-connections' as const,
                score: note.similarity,
                similarity: note.similarity,
                path: note.path,
                url: note.path,
                snippet: note.excerpt,
            }));
        } catch (error) {
            console.error('[MCP] Smart Connections search error:', error);
            return [];
        }
    }

    /**
     * Search academic papers via OpenAlex
     */
    private async searchOpenAlex(
        query: string,
        maxResults: number,
    ): Promise<OpenAlexResult[]> {
        if (!this.plugin) return [];

        const settings = this.plugin.settings.getValue();
        const openAlexConfig = settings.providers?.externalContext?.openAlex;

        if (!openAlexConfig?.enabled) return [];

        try {
            const { OpenAlexService } = await import('../llm/providers');
            const service = new OpenAlexService(openAlexConfig);
            const papers = await service.search(query);

            return papers.slice(0, maxResults).map(paper => ({
                id: paper.id,
                title: paper.title,
                provider: 'openalex' as const,
                score: 0.8, // OpenAlex returns by relevance
                authors: paper.authors,
                year: paper.year,
                doi: paper.doi,
                citationCount: paper.citationCount,
                venue: paper.venue,
                openAccessUrl: paper.openAccessUrl,
                url: paper.openAlexUrl,
                snippet: paper.abstract,
            }));
        } catch (error) {
            console.error('[MCP] OpenAlex search error:', error);
            return [];
        }
    }

    /**
     * Search web via LLM provider
     */
    private async searchWeb(
        query: string,
        maxResults: number,
    ): Promise<WebSearchResult[]> {
        if (!this.plugin) return [];

        const settings = this.plugin.settings.getValue();
        const llmConfig = settings.llm;
        const providers = settings.providers;

        if (!llmConfig.apiKey) return [];

        // Get the appropriate web search config
        let webSearchConfig;
        switch (llmConfig.provider) {
            case 'anthropic':
                webSearchConfig = providers?.claudeWebSearch;
                break;
            case 'openai':
                webSearchConfig = providers?.openaiWebSearch;
                break;
            case 'gemini':
                webSearchConfig = providers?.geminiGrounding;
                break;
        }

        if (!webSearchConfig?.enabled) return [];

        try {
            const { WebSearchService } = await import('../llm/providers');
            const service = new WebSearchService(
                llmConfig.apiKey,
                llmConfig.provider,
                webSearchConfig,
            );

            const response = await service.search(query);

            return response.results.slice(0, maxResults).map((result, i) => ({
                id: `web:${i}:${result.url}`,
                title: result.title,
                provider: 'web' as const,
                score: 0.7 - i * 0.05, // Decrease score by position
                llmProvider: llmConfig.provider,
                url: result.url,
                snippet: result.snippet,
            }));
        } catch (error) {
            console.error('[MCP] Web search error:', error);
            return [];
        }
    }

    /**
     * Check if web search is enabled for current provider
     */
    private isWebSearchEnabled(): boolean {
        if (!this.plugin) return false;

        const settings = this.plugin.settings.getValue();
        const providers = settings.providers;

        switch (settings.llm.provider) {
            case 'anthropic':
                return providers?.claudeWebSearch?.enabled ?? false;
            case 'openai':
                return providers?.openaiWebSearch?.enabled ?? false;
            case 'gemini':
                return providers?.geminiGrounding?.enabled ?? false;
            default:
                return false;
        }
    }
}
