/**
 * Web Search Service
 *
 * Unified web search service that uses the native web search capabilities
 * of each LLM provider (Claude Web Search, OpenAI Web Search, Gemini Grounding).
 */

import { requestUrl } from 'obsidian';
import type {
    LLMProviderType,
    ClaudeWebSearchConfig,
    OpenAIWebSearchConfig,
    GeminiGroundingConfig,
} from './provider-types';

// =============================================================================
// WEB SEARCH RESULT TYPES
// =============================================================================

export interface WebSearchResult {
    /** Result title */
    title: string;
    /** URL of the source */
    url: string;
    /** Snippet or description */
    snippet: string;
    /** Full content if available */
    content?: string;
    /** Source provider */
    source: LLMProviderType;
}

export interface WebSearchResponse {
    /** Search query */
    query: string;
    /** Search results */
    results: WebSearchResult[];
    /** Whether web search was used */
    searchUsed: boolean;
    /** Citations from the search (URLs referenced) */
    citations: string[];
    /** Raw LLM response text */
    responseText: string;
    /** Any errors encountered */
    error?: string;
}

// =============================================================================
// WEB SEARCH SERVICE CLASS
// =============================================================================

export class WebSearchService {
    private apiKey: string;
    private provider: LLMProviderType;
    private claudeConfig?: ClaudeWebSearchConfig;
    private openaiConfig?: OpenAIWebSearchConfig;
    private geminiConfig?: GeminiGroundingConfig;

    constructor(
        apiKey: string,
        provider: LLMProviderType,
        config?: ClaudeWebSearchConfig | OpenAIWebSearchConfig | GeminiGroundingConfig,
    ) {
        this.apiKey = apiKey;
        this.provider = provider;

        // Assign config to appropriate type
        if (config) {
            if (config.type === 'claude') {
                this.claudeConfig = config;
            } else if (config.type === 'openai') {
                this.openaiConfig = config;
            } else if (config.type === 'gemini') {
                this.geminiConfig = config;
            }
        }
    }

    /**
     * Check if web search is enabled for current provider
     */
    isEnabled(): boolean {
        switch (this.provider) {
            case 'anthropic':
                return this.claudeConfig?.enabled ?? false;
            case 'openai':
                return this.openaiConfig?.enabled ?? false;
            case 'gemini':
                return this.geminiConfig?.enabled ?? false;
            default:
                return false;
        }
    }

    /**
     * Perform a web search using the current provider
     */
    async search(query: string, context?: string): Promise<WebSearchResponse> {
        if (!this.isEnabled()) {
            return {
                query,
                results: [],
                searchUsed: false,
                citations: [],
                responseText: '',
                error: 'Web search not enabled for this provider',
            };
        }

        if (!this.apiKey) {
            return {
                query,
                results: [],
                searchUsed: false,
                citations: [],
                responseText: '',
                error: 'No API key configured',
            };
        }

        try {
            switch (this.provider) {
                case 'anthropic':
                    return await this.searchWithClaude(query, context);
                case 'openai':
                    return await this.searchWithOpenAI(query, context);
                case 'gemini':
                    return await this.searchWithGemini(query, context);
                default:
                    throw new Error(`Unsupported provider: ${this.provider}`);
            }
        } catch (error) {
            console.error('[Doc Doctor] Web search error:', error);
            return {
                query,
                results: [],
                searchUsed: false,
                citations: [],
                responseText: '',
                error: (error as Error).message,
            };
        }
    }

    /**
     * Search using Claude Web Search tool
     * Docs: https://docs.anthropic.com/en/docs/build-with-claude/tool-use/web-search
     */
    private async searchWithClaude(query: string, context?: string): Promise<WebSearchResponse> {
        const prompt = context
            ? `Based on this context: "${context}"\n\nSearch the web for: ${query}`
            : `Search the web for information about: ${query}`;

        // Build request with web_search tool
        const requestBody: Record<string, unknown> = {
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            tools: [
                {
                    type: 'web_search_20250305',
                    name: 'web_search',
                    max_uses: this.claudeConfig?.maxUses ?? 5,
                },
            ],
            messages: [{ role: 'user', content: prompt }],
        };

        // Add optional location for localized results
        if (this.claudeConfig?.userLocation) {
            const tool = requestBody.tools as Record<string, unknown>[];
            tool[0].user_location = this.claudeConfig.userLocation;
        }

        // Add domain filtering
        if (this.claudeConfig?.allowedDomains?.length) {
            const tool = requestBody.tools as Record<string, unknown>[];
            tool[0].allowed_domains = this.claudeConfig.allowedDomains;
        }
        if (this.claudeConfig?.blockedDomains?.length) {
            const tool = requestBody.tools as Record<string, unknown>[];
            tool[0].blocked_domains = this.claudeConfig.blockedDomains;
        }

        const response = await requestUrl({
            url: 'https://api.anthropic.com/v1/messages',
            method: 'POST',
            headers: {
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            throw: false,
        });

        if (response.status !== 200) {
            throw new Error(`Claude API error: ${response.status}`);
        }

        const data = response.json;
        return this.parseClaudeResponse(query, data);
    }

    /**
     * Parse Claude response with web search results
     */
    private parseClaudeResponse(query: string, data: Record<string, unknown>): WebSearchResponse {
        const results: WebSearchResult[] = [];
        const citations: string[] = [];
        let responseText = '';
        let searchUsed = false;

        const content = data.content as Array<Record<string, unknown>> | undefined;
        if (!content) {
            return { query, results, searchUsed, citations, responseText };
        }

        for (const block of content) {
            if (block.type === 'text') {
                responseText += block.text as string;

                // Extract citations from text block
                const textCitations = block.citations as Array<Record<string, unknown>> | undefined;
                if (textCitations) {
                    for (const cite of textCitations) {
                        if (cite.type === 'web_search_result_location') {
                            const url = cite.url as string;
                            if (url && !citations.includes(url)) {
                                citations.push(url);
                            }
                        }
                    }
                }
            } else if (block.type === 'web_search_tool_result') {
                searchUsed = true;
                const searchResults = block.content as Array<Record<string, unknown>> | undefined;
                if (searchResults) {
                    for (const result of searchResults) {
                        if (result.type === 'web_search_result') {
                            results.push({
                                title: result.title as string,
                                url: result.url as string,
                                snippet: result.encrypted_content ? '[Encrypted content]' : '',
                                source: 'anthropic',
                            });
                        }
                    }
                }
            }
        }

        return { query, results, searchUsed, citations, responseText };
    }

    /**
     * Search using OpenAI Web Search (Responses API)
     * Docs: https://platform.openai.com/docs/guides/tools-web-search
     */
    private async searchWithOpenAI(query: string, context?: string): Promise<WebSearchResponse> {
        const prompt = context
            ? `Based on this context: "${context}"\n\nSearch the web for: ${query}`
            : `Search the web for information about: ${query}`;

        // Use Responses API with web_search_preview tool
        const model = this.openaiConfig?.useSearchModels
            ? 'gpt-4o-search-preview'
            : 'gpt-4o';

        const requestBody: Record<string, unknown> = {
            model,
            input: prompt,
            tools: [
                {
                    type: 'web_search_preview',
                    search_context_size: this.openaiConfig?.searchContextSize ?? 'medium',
                },
            ],
        };

        const response = await requestUrl({
            url: 'https://api.openai.com/v1/responses',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            throw: false,
        });

        if (response.status !== 200) {
            throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = response.json;
        return this.parseOpenAIResponse(query, data);
    }

    /**
     * Parse OpenAI Responses API response
     */
    private parseOpenAIResponse(query: string, data: Record<string, unknown>): WebSearchResponse {
        const results: WebSearchResult[] = [];
        const citations: string[] = [];
        let responseText = '';
        let searchUsed = false;

        const output = data.output as Array<Record<string, unknown>> | undefined;
        if (!output) {
            return { query, results, searchUsed, citations, responseText };
        }

        for (const item of output) {
            if (item.type === 'message') {
                const content = item.content as Array<Record<string, unknown>> | undefined;
                if (content) {
                    for (const block of content) {
                        if (block.type === 'output_text') {
                            responseText += block.text as string;

                            // Extract annotations/citations
                            const annotations = block.annotations as Array<Record<string, unknown>> | undefined;
                            if (annotations) {
                                for (const anno of annotations) {
                                    if (anno.type === 'url_citation') {
                                        const url = anno.url as string;
                                        const title = anno.title as string;
                                        if (url && !citations.includes(url)) {
                                            citations.push(url);
                                            results.push({
                                                title: title || url,
                                                url,
                                                snippet: '',
                                                source: 'openai',
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } else if (item.type === 'web_search_call') {
                searchUsed = true;
            }
        }

        return { query, results, searchUsed, citations, responseText };
    }

    /**
     * Search using Gemini with Google Search Grounding
     * Docs: https://ai.google.dev/gemini-api/docs/grounding
     */
    private async searchWithGemini(query: string, context?: string): Promise<WebSearchResponse> {
        const prompt = context
            ? `Based on this context: "${context}"\n\nSearch for information about: ${query}`
            : `Search for information about: ${query}`;

        // Build tools array
        const tools: Array<Record<string, unknown>> = [];

        if (this.geminiConfig?.googleSearchEnabled) {
            tools.push({
                googleSearchRetrieval: {
                    dynamicRetrievalConfig: {
                        mode: 'MODE_DYNAMIC',
                        dynamicThreshold: 0.3,
                    },
                },
            });
        }

        if (this.geminiConfig?.googleMapsEnabled) {
            tools.push({
                googleMaps: {},
            });
        }

        const requestBody = {
            contents: [
                {
                    role: 'user',
                    parts: [{ text: prompt }],
                },
            ],
            tools,
        };

        const model = 'gemini-2.0-flash';
        const response = await requestUrl({
            url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            throw: false,
        });

        if (response.status !== 200) {
            throw new Error(`Gemini API error: ${response.status}`);
        }

        const data = response.json;
        return this.parseGeminiResponse(query, data);
    }

    /**
     * Parse Gemini response with grounding metadata
     */
    private parseGeminiResponse(query: string, data: Record<string, unknown>): WebSearchResponse {
        const results: WebSearchResult[] = [];
        const citations: string[] = [];
        let responseText = '';
        let searchUsed = false;

        const candidates = data.candidates as Array<Record<string, unknown>> | undefined;
        if (!candidates || candidates.length === 0) {
            return { query, results, searchUsed, citations, responseText };
        }

        const candidate = candidates[0];
        const content = candidate.content as Record<string, unknown> | undefined;

        if (content?.parts) {
            const parts = content.parts as Array<Record<string, unknown>>;
            for (const part of parts) {
                if (part.text) {
                    responseText += part.text as string;
                }
            }
        }

        // Check grounding metadata
        const groundingMetadata = candidate.groundingMetadata as Record<string, unknown> | undefined;
        if (groundingMetadata) {
            searchUsed = true;

            // Extract grounding chunks (search results)
            const chunks = groundingMetadata.groundingChunks as Array<Record<string, unknown>> | undefined;
            if (chunks) {
                for (const chunk of chunks) {
                    const web = chunk.web as Record<string, unknown> | undefined;
                    if (web) {
                        const url = web.uri as string;
                        const title = web.title as string;
                        if (url && !citations.includes(url)) {
                            citations.push(url);
                            results.push({
                                title: title || url,
                                url,
                                snippet: '',
                                source: 'gemini',
                            });
                        }
                    }
                }
            }

            // Extract web search queries used
            const searchQueries = groundingMetadata.webSearchQueries as string[] | undefined;
            if (searchQueries) {
                console.log('[Doc Doctor] Gemini search queries:', searchQueries);
            }
        }

        return { query, results, searchUsed, citations, responseText };
    }

    /**
     * Test the web search connection
     */
    async testConnection(): Promise<{ success: boolean; message: string }> {
        if (!this.isEnabled()) {
            return { success: false, message: 'Web search not enabled' };
        }

        if (!this.apiKey) {
            return { success: false, message: 'No API key configured' };
        }

        try {
            const result = await this.search('test query', undefined);
            if (result.error) {
                return { success: false, message: result.error };
            }
            return {
                success: true,
                message: `Web search working (${this.provider})`,
            };
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    }
}

// =============================================================================
// FORMATTING HELPERS
// =============================================================================

/**
 * Format web search results for LLM context
 */
export function formatWebSearchResults(response: WebSearchResponse): string {
    if (!response.searchUsed || response.results.length === 0) {
        return '';
    }

    const sections: string[] = [`## Web Search Results\n`];
    sections.push(`Query: "${response.query}"\n`);

    for (const result of response.results) {
        sections.push(`### ${result.title}`);
        sections.push(`URL: ${result.url}`);
        if (result.snippet) {
            sections.push(`${result.snippet}`);
        }
        sections.push('');
    }

    if (response.responseText) {
        sections.push('### Summary');
        // Truncate if too long
        const truncated = response.responseText.length > 2000
            ? response.responseText.slice(0, 2000) + '...'
            : response.responseText;
        sections.push(truncated);
    }

    return sections.join('\n');
}

/**
 * Extract search queries from document content
 */
export function extractSearchQueries(content: string, title?: string): string[] {
    const queries: string[] = [];

    // Add title as primary query
    if (title) {
        queries.push(title);
    }

    // Extract headings as potential queries
    const headingRegex = /^#{1,3}\s+(.+)$/gm;
    let match;
    while ((match = headingRegex.exec(content)) !== null) {
        const heading = match[1].trim();
        if (heading.length > 5 && heading.length < 100) {
            queries.push(heading);
        }
    }

    // Limit to first 3 queries
    return queries.slice(0, 3);
}
