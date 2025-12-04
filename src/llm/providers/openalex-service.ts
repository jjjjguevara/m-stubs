/**
 * OpenAlex Service
 *
 * Free academic paper search via OpenAlex API.
 * No API key required, but providing an email improves rate limits.
 *
 * Rate limits: 100,000 calls/day, 10 requests/second
 * Docs: https://docs.openalex.org/
 */

import { requestUrl } from 'obsidian';
import type { OpenAlexConfig, AcademicSearchResult } from './provider-types';

const OPENALEX_API_BASE = 'https://api.openalex.org';

// =============================================================================
// RESPONSE TYPES (OpenAlex API)
// =============================================================================

interface OpenAlexAuthor {
    author: {
        id: string;
        display_name: string;
    };
    author_position: string;
}

interface OpenAlexWork {
    id: string;
    doi?: string;
    title: string;
    display_name: string;
    publication_year: number;
    publication_date?: string;
    cited_by_count: number;
    authorships: OpenAlexAuthor[];
    primary_location?: {
        source?: {
            display_name: string;
        };
    };
    open_access?: {
        is_oa: boolean;
        oa_url?: string;
    };
    abstract_inverted_index?: Record<string, number[]>;
}

interface OpenAlexSearchResponse {
    meta: {
        count: number;
        db_response_time_ms: number;
        page: number;
        per_page: number;
    };
    results: OpenAlexWork[];
}

// =============================================================================
// SERVICE CLASS
// =============================================================================

export class OpenAlexService {
    private config: OpenAlexConfig;

    constructor(config: OpenAlexConfig) {
        this.config = config;
    }

    /**
     * Check if OpenAlex is enabled
     */
    isEnabled(): boolean {
        return this.config.enabled;
    }

    /**
     * Build URL with polite pool email parameter
     */
    private buildUrl(endpoint: string, params: Record<string, string | number>): string {
        const url = new URL(`${OPENALEX_API_BASE}${endpoint}`);

        // Add polite pool email if configured
        if (this.config.email) {
            url.searchParams.set('mailto', this.config.email);
        }

        // Add other parameters
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, String(value));
        }

        return url.toString();
    }

    /**
     * Convert inverted index abstract to plain text
     */
    private invertedIndexToText(invertedIndex: Record<string, number[]>): string {
        const words: [string, number][] = [];

        for (const [word, positions] of Object.entries(invertedIndex)) {
            for (const pos of positions) {
                words.push([word, pos]);
            }
        }

        // Sort by position and join
        words.sort((a, b) => a[1] - b[1]);
        return words.map(w => w[0]).join(' ');
    }

    /**
     * Map OpenAlex work to our result type
     */
    private mapWork(work: OpenAlexWork): AcademicSearchResult {
        // Extract authors
        const authors = work.authorships
            .slice(0, 5) // Limit to first 5 authors
            .map(a => a.author.display_name);

        // Convert abstract if present
        let abstract: string | undefined;
        if (this.config.includeAbstracts && work.abstract_inverted_index) {
            abstract = this.invertedIndexToText(work.abstract_inverted_index);
        }

        return {
            id: work.id,
            title: work.display_name || work.title,
            authors,
            year: work.publication_year,
            doi: work.doi?.replace('https://doi.org/', ''),
            abstract,
            citationCount: work.cited_by_count,
            venue: work.primary_location?.source?.display_name,
            openAccessUrl: work.open_access?.oa_url,
            openAlexUrl: work.id,
        };
    }

    /**
     * Search for academic papers
     */
    async search(query: string): Promise<AcademicSearchResult[]> {
        if (!this.isEnabled() || !query.trim()) {
            return [];
        }

        try {
            // Build search URL
            const params: Record<string, string | number> = {
                search: query,
                per_page: this.config.maxResults,
                sort: 'relevance_score:desc',
            };

            // Add optional filters
            const filters: string[] = [];

            if (this.config.minYear) {
                filters.push(`publication_year:>${this.config.minYear - 1}`);
            }

            if (this.config.minCitations) {
                filters.push(`cited_by_count:>${this.config.minCitations - 1}`);
            }

            if (filters.length > 0) {
                params.filter = filters.join(',');
            }

            const url = this.buildUrl('/works', params);

            console.log('[Doc Doctor] OpenAlex search:', query);

            const response = await requestUrl({
                url,
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'DocDoctor/1.0 (Obsidian Plugin; mailto:' + (this.config.email || 'anonymous') + ')',
                },
                throw: false,
            });

            if (response.status === 429) {
                console.warn('[Doc Doctor] OpenAlex rate limited');
                return [];
            }

            if (response.status !== 200) {
                console.error('[Doc Doctor] OpenAlex error:', response.status, response.text);
                return [];
            }

            const data = response.json as OpenAlexSearchResponse;
            console.log(`[Doc Doctor] OpenAlex found ${data.meta.count} results (returning ${data.results.length})`);

            return data.results.map(work => this.mapWork(work));
        } catch (error) {
            console.error('[Doc Doctor] OpenAlex search error:', error);
            return [];
        }
    }

    /**
     * Search with title-specific query (more precise)
     */
    async searchByTitle(title: string): Promise<AcademicSearchResult[]> {
        if (!this.isEnabled() || !title.trim()) {
            return [];
        }

        try {
            const params: Record<string, string | number> = {
                per_page: this.config.maxResults,
                sort: 'relevance_score:desc',
                filter: `title.search:${encodeURIComponent(title)}`,
            };

            const url = this.buildUrl('/works', params);

            const response = await requestUrl({
                url,
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
                throw: false,
            });

            if (response.status !== 200) {
                return [];
            }

            const data = response.json as OpenAlexSearchResponse;
            return data.results.map(work => this.mapWork(work));
        } catch (error) {
            console.error('[Doc Doctor] OpenAlex title search error:', error);
            return [];
        }
    }

    /**
     * Get a specific work by DOI
     */
    async getByDoi(doi: string): Promise<AcademicSearchResult | null> {
        if (!this.isEnabled() || !doi.trim()) {
            return null;
        }

        try {
            // Normalize DOI format
            const normalizedDoi = doi
                .replace('https://doi.org/', '')
                .replace('http://doi.org/', '')
                .replace('doi:', '');

            const url = this.buildUrl(`/works/https://doi.org/${normalizedDoi}`, {});

            const response = await requestUrl({
                url,
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
                throw: false,
            });

            if (response.status !== 200) {
                return null;
            }

            const work = response.json as OpenAlexWork;
            return this.mapWork(work);
        } catch (error) {
            console.error('[Doc Doctor] OpenAlex DOI lookup error:', error);
            return null;
        }
    }

    /**
     * Test the connection (simple query)
     */
    async testConnection(): Promise<{ success: boolean; message: string }> {
        try {
            const url = this.buildUrl('/works', { per_page: 1 });

            const response = await requestUrl({
                url,
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
                throw: false,
            });

            if (response.status === 200) {
                const politePool = this.config.email ? ' (polite pool)' : ' (anonymous)';
                return { success: true, message: `Connected to OpenAlex${politePool}` };
            } else if (response.status === 429) {
                return { success: false, message: 'Rate limited - try again later' };
            } else {
                return { success: false, message: `API error: ${response.status}` };
            }
        } catch (error) {
            return { success: false, message: `Connection failed: ${(error as Error).message}` };
        }
    }
}

// =============================================================================
// FORMATTING HELPERS
// =============================================================================

/**
 * Format academic results for LLM context
 */
export function formatAcademicResults(results: AcademicSearchResult[]): string {
    if (results.length === 0) {
        return '';
    }

    const sections: string[] = ['## Academic References (OpenAlex)\n'];

    for (const paper of results) {
        sections.push(`### ${paper.title}`);
        sections.push(`Authors: ${paper.authors.join(', ')}`);
        sections.push(`Year: ${paper.year} | Citations: ${paper.citationCount}`);

        if (paper.venue) {
            sections.push(`Published in: ${paper.venue}`);
        }

        if (paper.doi) {
            sections.push(`DOI: ${paper.doi}`);
        }

        if (paper.openAccessUrl) {
            sections.push(`Open Access: ${paper.openAccessUrl}`);
        }

        if (paper.abstract) {
            // Truncate long abstracts
            const truncated = paper.abstract.length > 500
                ? paper.abstract.slice(0, 500) + '...'
                : paper.abstract;
            sections.push(`Abstract: ${truncated}`);
        }

        sections.push('');
    }

    return sections.join('\n');
}

/**
 * Extract DOIs from document content
 */
export function extractDoisFromContent(content: string): string[] {
    // Match DOI patterns
    const doiRegex = /\b10\.\d{4,}\/[^\s\)\]\}>"']+/g;
    const matches = content.match(doiRegex) || [];

    // Deduplicate
    return [...new Set(matches)];
}
