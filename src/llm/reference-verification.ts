/**
 * Reference Verification Pipeline
 *
 * Verifies that references suggested by the LLM were actually found through
 * tool calls, preventing hallucinated URLs, DOIs, and vault links.
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * A reference found or suggested
 */
export interface FoundReference {
    /** The reference text or URL */
    reference: string;

    /** Type of reference */
    type: ReferenceType;

    /** Where this reference was mentioned */
    context: string;

    /** Source stub type if associated with a stub */
    stubType?: string;
}

export type ReferenceType =
    | 'external_url' // Web URL
    | 'academic_doi' // DOI reference
    | 'vault_link' // [[Vault Note]] link
    | 'citation' // Generic citation text
    | 'unknown'; // Could not determine type

/**
 * A verified reference with verification status
 */
export interface VerifiedReference extends FoundReference {
    /** Whether the reference was verified */
    verified: boolean;

    /** How the reference was verified */
    verificationMethod: VerificationMethod;

    /** Verification details */
    verificationDetails?: string;

    /** Confidence score 0-1 */
    confidence: number;
}

export type VerificationMethod =
    | 'tool_call' // Verified through tool call result
    | 'pattern_match' // Matched pattern from tool results
    | 'post_check' // Verified after the fact
    | 'unverified' // Could not verify
    | 'self_reference'; // Reference to document content (invalid)

/**
 * Tool call record for verification
 */
export interface ToolCallRecord {
    /** Tool name (web_search, semantic_search, openalex_search) */
    tool: string;

    /** Arguments passed to the tool */
    args: Record<string, unknown>;

    /** Results returned by the tool */
    results: ToolResult[];

    /** Timestamp */
    timestamp: number;
}

export interface ToolResult {
    /** Result title or identifier */
    title?: string;

    /** URL if applicable */
    url?: string;

    /** DOI if applicable */
    doi?: string;

    /** Vault path if applicable */
    vaultPath?: string;

    /** Snippet or content */
    snippet?: string;

    /** Relevance score */
    score?: number;
}

// =============================================================================
// REFERENCE VERIFIER CLASS
// =============================================================================

/**
 * Document context for self-reference detection
 */
export interface DocumentContext {
    /** Document file path */
    path: string;
    /** Document title */
    title: string;
    /** Key phrases from the document (e.g., first heading, first paragraph) */
    keyPhrases: string[];
}

export class ReferenceVerifier {
    private toolCalls: ToolCallRecord[] = [];
    private verifiedUrls: Set<string> = new Set();
    private verifiedDois: Set<string> = new Set();
    private verifiedVaultPaths: Set<string> = new Set();
    private documentContext?: DocumentContext;

    /**
     * Record a tool call for later verification
     */
    recordToolCall(tool: string, args: Record<string, unknown>, results: ToolResult[]): void {
        this.toolCalls.push({
            tool,
            args,
            results,
            timestamp: Date.now(),
        });

        // Index results for quick lookup
        for (const result of results) {
            if (result.url) {
                this.verifiedUrls.add(this.normalizeUrl(result.url));
            }
            if (result.doi) {
                this.verifiedDois.add(this.normalizeDoi(result.doi));
            }
            if (result.vaultPath) {
                this.verifiedVaultPaths.add(this.normalizeVaultPath(result.vaultPath));
            }
        }
    }

    /**
     * Set document context for self-reference detection
     */
    setDocumentContext(context: DocumentContext): void {
        this.documentContext = context;
    }

    /**
     * Clear recorded tool calls and document context
     */
    clear(): void {
        this.toolCalls = [];
        this.verifiedUrls.clear();
        this.verifiedDois.clear();
        this.verifiedVaultPaths.clear();
        this.documentContext = undefined;
    }

    /**
     * Check if a reference was verified by a tool call
     */
    wasVerifiedByTool(ref: FoundReference): boolean {
        switch (ref.type) {
            case 'external_url':
                return this.verifiedUrls.has(this.normalizeUrl(ref.reference));

            case 'academic_doi':
                return this.verifiedDois.has(this.normalizeDoi(ref.reference));

            case 'vault_link':
                return this.verifiedVaultPaths.has(this.normalizeVaultPath(ref.reference));

            case 'citation':
                // Check if any tool result contains similar text
                return this.findMatchingResult(ref.reference) !== null;

            default:
                return false;
        }
    }

    /**
     * Verify a single reference
     */
    verifyReference(ref: FoundReference): VerifiedReference {
        // Check for self-reference (document citing itself)
        if (this.isSelfReference(ref)) {
            return {
                ...ref,
                verified: false,
                verificationMethod: 'self_reference',
                verificationDetails: 'Reference appears to cite document content',
                confidence: 0,
            };
        }

        // Check if verified by tool call
        if (this.wasVerifiedByTool(ref)) {
            const match = this.findMatchingResult(ref.reference);
            return {
                ...ref,
                verified: true,
                verificationMethod: 'tool_call',
                verificationDetails: match
                    ? `Found in ${match.tool} results`
                    : 'Matched tool result',
                confidence: 1.0,
            };
        }

        // Pattern match against tool results
        const patternMatch = this.findPatternMatch(ref);
        if (patternMatch) {
            return {
                ...ref,
                verified: true,
                verificationMethod: 'pattern_match',
                verificationDetails: `Partial match: ${patternMatch.details}`,
                confidence: patternMatch.confidence,
            };
        }

        // Not verified
        return {
            ...ref,
            verified: false,
            verificationMethod: 'unverified',
            verificationDetails: 'No matching tool call result found',
            confidence: 0,
        };
    }

    /**
     * Verify all references
     */
    verifyAll(refs: FoundReference[]): VerifiedReference[] {
        return refs.map((ref) => this.verifyReference(ref));
    }

    /**
     * Get verification summary
     */
    getVerificationSummary(refs: VerifiedReference[]): VerificationSummary {
        const total = refs.length;
        const verified = refs.filter((r) => r.verified).length;
        const unverified = refs.filter((r) => !r.verified && r.verificationMethod !== 'self_reference').length;
        const selfReferences = refs.filter((r) => r.verificationMethod === 'self_reference').length;

        return {
            total,
            verified,
            unverified,
            selfReferences,
            verificationRate: total > 0 ? verified / total : 1,
            toolCallsUsed: this.toolCalls.length,
            byMethod: {
                tool_call: refs.filter((r) => r.verificationMethod === 'tool_call').length,
                pattern_match: refs.filter((r) => r.verificationMethod === 'pattern_match').length,
                post_check: refs.filter((r) => r.verificationMethod === 'post_check').length,
                unverified: unverified,
                self_reference: selfReferences,
            },
        };
    }

    // =========================================================================
    // PRIVATE HELPERS
    // =========================================================================

    /**
     * Normalize URL for comparison
     */
    private normalizeUrl(url: string): string {
        try {
            const parsed = new URL(url);
            // Remove trailing slash, lowercase hostname
            return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/$/, '')}${parsed.search}`;
        } catch {
            return url.toLowerCase().trim();
        }
    }

    /**
     * Normalize DOI for comparison
     */
    private normalizeDoi(doi: string): string {
        // Extract DOI from various formats
        const match = doi.match(/10\.\d{4,}\/[^\s]+/);
        return match ? match[0].toLowerCase() : doi.toLowerCase().trim();
    }

    /**
     * Normalize vault path for comparison
     */
    private normalizeVaultPath(path: string): string {
        // Remove [[ ]] brackets and normalize
        return path.replace(/^\[\[|\]\]$/g, '').trim().toLowerCase();
    }

    /**
     * Check if reference is a self-reference (citing document content)
     */
    private isSelfReference(ref: FoundReference): boolean {
        // Cannot check self-reference without document context
        if (!this.documentContext) {
            return false;
        }

        const refLower = ref.reference.toLowerCase();
        const contextLower = ref.context?.toLowerCase() || '';

        // Check 1: Vault link pointing to the document itself
        if (ref.type === 'vault_link') {
            const normalizedRef = this.normalizeVaultPath(ref.reference);
            const normalizedPath = this.documentContext.path.toLowerCase().replace(/\.md$/, '');
            if (normalizedRef === normalizedPath || normalizedRef.endsWith(normalizedPath)) {
                return true;
            }
        }

        // Check 2: Citation text matches document title
        if (ref.type === 'citation') {
            const titleLower = this.documentContext.title.toLowerCase();
            // Exact match or high substring overlap
            if (refLower === titleLower || refLower.includes(titleLower) || titleLower.includes(refLower)) {
                return true;
            }
        }

        // Check 3: Reference text contains key phrases from the document
        for (const phrase of this.documentContext.keyPhrases) {
            const phraseLower = phrase.toLowerCase();
            // Only match if phrase is substantial (>15 chars) and appears in reference
            if (phraseLower.length > 15 && (refLower.includes(phraseLower) || contextLower.includes(phraseLower))) {
                return true;
            }
        }

        // Check 4: Citation without URL/DOI that looks like internal quote
        // (this is the soft check - just flag it as suspicious for now)
        if (ref.type === 'citation' && !ref.reference.includes('http') && !ref.reference.includes('10.')) {
            // Check for substantial word overlap with key phrases
            const refWords = new Set(refLower.split(/\s+/).filter(w => w.length > 4));
            for (const phrase of this.documentContext.keyPhrases) {
                const phraseWords = new Set(phrase.toLowerCase().split(/\s+/).filter(w => w.length > 4));
                const overlap = [...refWords].filter(w => phraseWords.has(w)).length;
                const overlapRatio = overlap / Math.min(refWords.size, phraseWords.size);
                if (overlapRatio > 0.5 && overlap >= 3) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Find a matching result from tool calls
     */
    private findMatchingResult(
        reference: string
    ): { tool: string; result: ToolResult } | null {
        const normalizedRef = reference.toLowerCase();

        for (const call of this.toolCalls) {
            for (const result of call.results) {
                // Check URL match
                if (result.url && this.normalizeUrl(result.url) === this.normalizeUrl(reference)) {
                    return { tool: call.tool, result };
                }

                // Check DOI match
                if (result.doi && this.normalizeDoi(result.doi) === this.normalizeDoi(reference)) {
                    return { tool: call.tool, result };
                }

                // Check vault path match
                if (
                    result.vaultPath &&
                    this.normalizeVaultPath(result.vaultPath) === this.normalizeVaultPath(reference)
                ) {
                    return { tool: call.tool, result };
                }

                // Check title/snippet match
                if (result.title && result.title.toLowerCase().includes(normalizedRef)) {
                    return { tool: call.tool, result };
                }
                if (result.snippet && result.snippet.toLowerCase().includes(normalizedRef)) {
                    return { tool: call.tool, result };
                }
            }
        }

        return null;
    }

    /**
     * Find partial pattern match
     */
    private findPatternMatch(ref: FoundReference): { confidence: number; details: string } | null {
        const normalizedRef = ref.reference.toLowerCase();

        for (const call of this.toolCalls) {
            for (const result of call.results) {
                // Check for partial URL match (same domain)
                if (ref.type === 'external_url' && result.url) {
                    try {
                        const refDomain = new URL(ref.reference).hostname;
                        const resultDomain = new URL(result.url).hostname;
                        if (refDomain === resultDomain) {
                            return {
                                confidence: 0.7,
                                details: `Same domain (${refDomain}) found in ${call.tool}`,
                            };
                        }
                    } catch {
                        // Invalid URL
                    }
                }

                // Check for keyword overlap in title
                if (result.title) {
                    const overlap = this.calculateWordOverlap(normalizedRef, result.title.toLowerCase());
                    if (overlap > 0.5) {
                        return {
                            confidence: overlap,
                            details: `Title similarity (${Math.round(overlap * 100)}%) in ${call.tool}`,
                        };
                    }
                }
            }
        }

        return null;
    }

    /**
     * Calculate word overlap between two strings
     */
    private calculateWordOverlap(a: string, b: string): number {
        const wordsA = new Set(a.split(/\s+/).filter((w) => w.length > 3));
        const wordsB = new Set(b.split(/\s+/).filter((w) => w.length > 3));

        if (wordsA.size === 0 || wordsB.size === 0) return 0;

        let overlap = 0;
        for (const word of wordsA) {
            if (wordsB.has(word)) overlap++;
        }

        return overlap / Math.max(wordsA.size, wordsB.size);
    }
}

// =============================================================================
// TYPES
// =============================================================================

export interface VerificationSummary {
    total: number;
    verified: number;
    unverified: number;
    selfReferences: number;
    verificationRate: number;
    toolCallsUsed: number;
    byMethod: Record<VerificationMethod, number>;
}

// =============================================================================
// REFERENCE EXTRACTION
// =============================================================================

/**
 * Extract references from LLM response text
 */
export function extractReferences(text: string): FoundReference[] {
    const references: FoundReference[] = [];

    // Extract URLs
    const urlPattern = /https?:\/\/[^\s<>)"']+/gi;
    const urls = text.match(urlPattern) || [];
    for (const url of urls) {
        references.push({
            reference: url,
            type: 'external_url',
            context: getContextAround(text, url),
        });
    }

    // Extract DOIs
    const doiPattern = /10\.\d{4,}\/[^\s<>)"']+/gi;
    const dois = text.match(doiPattern) || [];
    for (const doi of dois) {
        references.push({
            reference: doi,
            type: 'academic_doi',
            context: getContextAround(text, doi),
        });
    }

    // Extract vault links
    const vaultLinkPattern = /\[\[([^\]]+)\]\]/g;
    let match;
    while ((match = vaultLinkPattern.exec(text)) !== null) {
        references.push({
            reference: match[1],
            type: 'vault_link',
            context: getContextAround(text, match[0]),
        });
    }

    // Deduplicate
    return deduplicateReferences(references);
}

/**
 * Get context around a reference
 */
function getContextAround(text: string, reference: string, windowSize = 50): string {
    const index = text.indexOf(reference);
    if (index === -1) return '';

    const start = Math.max(0, index - windowSize);
    const end = Math.min(text.length, index + reference.length + windowSize);

    return text.slice(start, end).trim();
}

/**
 * Deduplicate references
 */
function deduplicateReferences(refs: FoundReference[]): FoundReference[] {
    const seen = new Set<string>();
    return refs.filter((ref) => {
        const key = `${ref.type}:${ref.reference}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// =============================================================================
// DISPLAY HELPERS
// =============================================================================

/**
 * Get verification badge for display
 */
export function getVerificationBadge(ref: VerifiedReference): VerificationBadge {
    if (ref.verificationMethod === 'self_reference') {
        return {
            icon: 'alert-circle',
            color: '#e74c3c',
            label: 'Self-reference',
            tooltip: 'This appears to cite the document itself, which is not a valid source.',
        };
    }

    if (ref.verified) {
        if (ref.confidence >= 0.9) {
            return {
                icon: 'check-circle',
                color: '#2ecc71',
                label: 'Verified',
                tooltip: `Verified through ${ref.verificationMethod}: ${ref.verificationDetails}`,
            };
        } else {
            return {
                icon: 'check',
                color: '#f39c12',
                label: 'Partial match',
                tooltip: `Partially verified (${Math.round(ref.confidence * 100)}%): ${ref.verificationDetails}`,
            };
        }
    }

    return {
        icon: 'alert-triangle',
        color: '#e67e22',
        label: 'Unverified',
        tooltip: 'This reference could not be verified through search tools. Please verify manually.',
    };
}

export interface VerificationBadge {
    icon: string;
    color: string;
    label: string;
    tooltip: string;
}
