/**
 * External Context Service
 *
 * Unified service for gathering external context from multiple sources:
 * - OpenAlex (academic papers)
 * - Web Search (Claude, OpenAI, Gemini)
 * - URL Scraping (native, no external API)
 * - Smart Connections (vault integration)
 */

import { requestUrl } from 'obsidian';
import type {
    ExternalContextConfig,
    LLMProviderType,
    ClaudeWebSearchConfig,
    OpenAIWebSearchConfig,
    GeminiGroundingConfig,
    UrlScrapingConfig,
    SmartConnectionsConfig,
    AcademicSearchResult,
} from './provider-types';
import { OpenAlexService, formatAcademicResults, extractDoisFromContent } from './openalex-service';
import { WebSearchService, formatWebSearchResults } from './web-search-service';

// =============================================================================
// CONTEXT RESULT TYPES
// =============================================================================

export interface ExternalContextResult {
    /** Academic papers from OpenAlex */
    academicPapers: AcademicSearchResult[];

    /** Web search results and response text */
    webSearchContext: string;

    /** Scraped URL contents */
    scrapedUrls: ScrapedUrlContent[];

    /** Related notes from vault */
    relatedNotes: RelatedNote[];

    /** Combined formatted context for LLM prompt */
    formattedContext: string;

    /** Errors encountered during gathering */
    errors: string[];
}

export interface ScrapedUrlContent {
    url: string;
    title: string;
    content: string;
    success: boolean;
}

export interface RelatedNote {
    path: string;
    title: string;
    similarity: number;
    excerpt?: string;
}

// =============================================================================
// SMART CONNECTIONS API
// =============================================================================

interface SmartConnectionsAPI {
    find_connections: (options: {
        key: string;
        limit?: number;
    }) => Promise<Array<{
        key: string;
        score: number;
    }>>;
}

type AppWithPlugins = {
    plugins?: {
        plugins?: Record<string, { api?: SmartConnectionsAPI }>;
    };
};

// =============================================================================
// EXTERNAL CONTEXT SERVICE
// =============================================================================

export class ExternalContextService {
    private config: ExternalContextConfig;
    private llmProvider: LLMProviderType;
    private llmApiKey: string;
    private webSearchConfig?: ClaudeWebSearchConfig | OpenAIWebSearchConfig | GeminiGroundingConfig;

    constructor(
        config: ExternalContextConfig,
        llmProvider: LLMProviderType,
        llmApiKey: string,
        webSearchConfig?: ClaudeWebSearchConfig | OpenAIWebSearchConfig | GeminiGroundingConfig,
    ) {
        this.config = config;
        this.llmProvider = llmProvider;
        this.llmApiKey = llmApiKey;
        this.webSearchConfig = webSearchConfig;
    }

    /**
     * Update configuration
     */
    updateConfig(
        config: ExternalContextConfig,
        llmProvider: LLMProviderType,
        llmApiKey: string,
        webSearchConfig?: ClaudeWebSearchConfig | OpenAIWebSearchConfig | GeminiGroundingConfig,
    ): void {
        this.config = config;
        this.llmProvider = llmProvider;
        this.llmApiKey = llmApiKey;
        this.webSearchConfig = webSearchConfig;
    }

    /**
     * Gather external context for a document
     */
    async gatherContext(
        app: AppWithPlugins,
        documentPath: string,
        documentContent: string,
        documentTitle: string,
        refinementScore: number,
    ): Promise<ExternalContextResult> {
        const result: ExternalContextResult = {
            academicPapers: [],
            webSearchContext: '',
            scrapedUrls: [],
            relatedNotes: [],
            formattedContext: '',
            errors: [],
        };

        // Run all context gathering in parallel
        const promises: Promise<void>[] = [];

        // 1. OpenAlex academic search
        if (this.config.openAlex.enabled) {
            promises.push(
                this.gatherAcademicContext(documentContent, documentTitle)
                    .then(papers => {
                        result.academicPapers = papers;
                    })
                    .catch(error => {
                        result.errors.push(`Academic search: ${error.message}`);
                    }),
            );
        }

        // 2. Web search (if refinement below threshold)
        const shouldWebSearch = refinementScore < this.config.webSearchRefinementThreshold;
        if (shouldWebSearch && this.webSearchConfig?.enabled) {
            promises.push(
                this.gatherWebSearchContext(documentTitle)
                    .then(context => {
                        result.webSearchContext = context;
                    })
                    .catch(error => {
                        result.errors.push(`Web search: ${error.message}`);
                    }),
            );
        }

        // 3. URL scraping
        if (this.config.urlScraping.enabled) {
            promises.push(
                this.scrapeDocumentUrls(documentContent)
                    .then(urls => {
                        result.scrapedUrls = urls;
                    })
                    .catch(error => {
                        result.errors.push(`URL scraping: ${error.message}`);
                    }),
            );
        }

        // 4. Smart Connections
        if (this.config.smartConnections.enabled) {
            promises.push(
                this.getRelatedNotes(app, documentPath)
                    .then(notes => {
                        result.relatedNotes = notes;
                    })
                    .catch(error => {
                        result.errors.push(`Smart Connections: ${error.message}`);
                    }),
            );
        }

        // Wait for all to complete
        await Promise.all(promises);

        // Format combined context
        result.formattedContext = this.formatContext(result);

        return result;
    }

    /**
     * Gather academic context using OpenAlex
     */
    private async gatherAcademicContext(
        documentContent: string,
        documentTitle: string,
    ): Promise<AcademicSearchResult[]> {
        const openAlexService = new OpenAlexService(this.config.openAlex);

        // First, try to find papers by DOIs in the document
        const dois = extractDoisFromContent(documentContent);
        const doiResults: AcademicSearchResult[] = [];

        for (const doi of dois.slice(0, 3)) {
            const paper = await openAlexService.getByDoi(doi);
            if (paper) {
                doiResults.push(paper);
            }
        }

        // Then search by title/topic
        let searchResults: AcademicSearchResult[] = [];
        if (documentTitle) {
            searchResults = await openAlexService.search(documentTitle);
        }

        // Combine and deduplicate
        const allResults = [...doiResults, ...searchResults];
        const seen = new Set<string>();
        return allResults.filter(paper => {
            if (seen.has(paper.id)) return false;
            seen.add(paper.id);
            return true;
        }).slice(0, this.config.openAlex.maxResults);
    }

    /**
     * Gather web search context using LLM-native search
     */
    private async gatherWebSearchContext(searchQuery: string): Promise<string> {
        if (!this.webSearchConfig?.enabled || !searchQuery) {
            return '';
        }

        const webSearchService = new WebSearchService(
            this.llmApiKey,
            this.llmProvider,
            this.webSearchConfig,
        );

        const response = await webSearchService.search(searchQuery);
        return formatWebSearchResults(response);
    }

    /**
     * Scrape URLs found in document content
     */
    private async scrapeDocumentUrls(documentContent: string): Promise<ScrapedUrlContent[]> {
        const urls = this.extractUrls(documentContent);
        if (urls.length === 0) return [];

        const urlsToScrape = urls.slice(0, this.config.urlScraping.maxUrls);
        const results: ScrapedUrlContent[] = [];

        for (const url of urlsToScrape) {
            try {
                const scraped = await this.scrapeUrl(url);
                results.push(scraped);
            } catch (error) {
                results.push({
                    url,
                    title: url,
                    content: '',
                    success: false,
                });
            }
        }

        return results;
    }

    /**
     * Scrape a single URL (native, no external API)
     */
    private async scrapeUrl(url: string): Promise<ScrapedUrlContent> {
        const response = await requestUrl({
            url,
            method: 'GET',
            headers: {
                'User-Agent': 'DocDoctor/1.0 (Obsidian Plugin)',
                'Accept': 'text/html,application/xhtml+xml',
            },
            throw: false,
        });

        if (response.status !== 200) {
            return {
                url,
                title: url,
                content: '',
                success: false,
            };
        }

        // Extract title and main content from HTML
        const html = response.text;
        const title = this.extractTitle(html);
        let content = this.extractMainContent(html);

        // Truncate if too long
        if (content.length > 5000) {
            content = content.slice(0, 5000) + '...(truncated)';
        }

        return {
            url,
            title,
            content,
            success: true,
        };
    }

    /**
     * Extract title from HTML
     */
    private extractTitle(html: string): string {
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        return titleMatch ? titleMatch[1].trim() : 'Untitled';
    }

    /**
     * Extract main content from HTML (simple implementation)
     */
    private extractMainContent(html: string): string {
        // Remove scripts, styles, and nav elements
        let content = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
            .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
            .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
            .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '');

        // Try to extract main content
        const mainMatch = content.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
        const articleMatch = content.match(/<article[^>]*>([\s\S]*?)<\/article>/i);

        if (mainMatch) {
            content = mainMatch[1];
        } else if (articleMatch) {
            content = articleMatch[1];
        }

        // Remove remaining HTML tags and clean up whitespace
        content = content
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();

        return content;
    }

    /**
     * Extract URLs from document content
     */
    private extractUrls(content: string): string[] {
        const urlRegex = /https?:\/\/[^\s\)\]\}>"']+/g;
        const matches = content.match(urlRegex) || [];

        // Filter out common non-content URLs
        const excludePatterns = [
            /github\.com\/.*\/blob\//,
            /localhost/,
            /127\.0\.0\.1/,
            /\.(jpg|jpeg|png|gif|svg|ico|webp|mp4|mp3|wav|pdf)$/i,
        ];

        const seen = new Set<string>();
        return matches.filter(url => {
            if (seen.has(url)) return false;
            seen.add(url);

            for (const pattern of excludePatterns) {
                if (pattern.test(url)) return false;
            }

            return true;
        });
    }

    /**
     * Get related notes from Smart Connections
     */
    private async getRelatedNotes(
        app: AppWithPlugins,
        documentPath: string,
    ): Promise<RelatedNote[]> {
        const scPlugin = app.plugins?.plugins?.['smart-connections'];
        if (!scPlugin?.api?.find_connections) {
            console.log('[Doc Doctor] Smart Connections API not available');
            return [];
        }

        const results = await scPlugin.api.find_connections({
            key: documentPath,
            limit: this.config.smartConnections.maxRelatedNotes,
        });

        return results
            .filter(r => r.score >= this.config.smartConnections.minSimilarity)
            .map(result => ({
                path: result.key,
                title: result.key.split('/').pop()?.replace('.md', '') || result.key,
                similarity: result.score,
            }));
    }

    /**
     * Format all context for LLM prompt
     */
    private formatContext(result: ExternalContextResult): string {
        const sections: string[] = [];

        // Academic papers
        if (result.academicPapers.length > 0) {
            sections.push(formatAcademicResults(result.academicPapers));
        }

        // Web search
        if (result.webSearchContext) {
            sections.push(result.webSearchContext);
        }

        // Scraped URLs
        const successfulScrapes = result.scrapedUrls.filter(s => s.success);
        if (successfulScrapes.length > 0) {
            sections.push('## Referenced URL Contents\n');
            for (const scraped of successfulScrapes) {
                sections.push(`### ${scraped.title}`);
                sections.push(`URL: ${scraped.url}`);
                const truncated = scraped.content.slice(0, 1500);
                sections.push(`Content:\n${truncated}${scraped.content.length > 1500 ? '\n...(truncated)' : ''}`);
                sections.push('');
            }
        }

        // Related notes
        if (result.relatedNotes.length > 0) {
            sections.push('## Related Notes in Vault\n');
            for (const note of result.relatedNotes) {
                sections.push(`- [[${note.path}]] (similarity: ${(note.similarity * 100).toFixed(0)}%)`);
            }
            sections.push('');
        }

        return sections.join('\n');
    }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let contextServiceInstance: ExternalContextService | null = null;

/**
 * Get or create external context service instance
 */
export function getExternalContextService(
    config: ExternalContextConfig,
    llmProvider: LLMProviderType,
    llmApiKey: string,
    webSearchConfig?: ClaudeWebSearchConfig | OpenAIWebSearchConfig | GeminiGroundingConfig,
): ExternalContextService {
    if (!contextServiceInstance) {
        contextServiceInstance = new ExternalContextService(
            config,
            llmProvider,
            llmApiKey,
            webSearchConfig,
        );
    } else {
        contextServiceInstance.updateConfig(config, llmProvider, llmApiKey, webSearchConfig);
    }
    return contextServiceInstance;
}

/**
 * Reset context service instance (for testing)
 */
export function resetExternalContextService(): void {
    contextServiceInstance = null;
}
