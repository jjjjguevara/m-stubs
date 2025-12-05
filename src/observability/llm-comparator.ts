/**
 * LLM Comparator for Doc Doctor
 *
 * Compares outputs from multiple LLM providers on the same task
 * to enable objective quality and efficiency comparisons.
 */

import type { LLMProvider, SuggestedStub, LLMSuggestionResponse } from '../llm/llm-types';
import { logger, type TraceContext } from './logger';

// =============================================================================
// TYPES
// =============================================================================

/**
 * A single provider's result for comparison
 */
export interface ProviderResult {
    /** Provider used */
    provider: LLMProvider;

    /** Model used */
    model: string;

    /** Whether the request succeeded */
    success: boolean;

    /** The response if successful */
    response?: LLMSuggestionResponse;

    /** Error message if failed */
    error?: string;

    /** Input token count */
    inputTokens: number;

    /** Output token count */
    outputTokens: number;

    /** Total latency in milliseconds */
    latencyMs: number;

    /** Estimated cost (if available) */
    estimatedCost?: number;
}

/**
 * Comparison between two suggestions
 */
export interface SuggestionComparison {
    /** Whether the suggestions are similar */
    similar: boolean;

    /** Jaccard similarity score (0-1) */
    jaccardSimilarity: number;

    /** Type match */
    typeMatch: boolean;

    /** Priority match */
    priorityMatch: boolean;

    /** Location proximity (how close the suggested locations are) */
    locationProximity: number;
}

/**
 * Quality metrics for a provider's response
 */
export interface QualityMetrics {
    /** Number of suggestions */
    suggestionCount: number;

    /** Average confidence in suggestions */
    avgConfidence: number;

    /** Distribution of stub types */
    typeDistribution: Record<string, number>;

    /** Distribution of priorities */
    priorityDistribution: Record<string, number>;

    /** Ratio of grounding-required stubs */
    groundingRequiredRatio: number;
}

/**
 * Efficiency metrics for a provider
 */
export interface EfficiencyMetrics {
    /** Input tokens */
    inputTokens: number;

    /** Output tokens */
    outputTokens: number;

    /** Total tokens */
    totalTokens: number;

    /** Latency in milliseconds */
    latencyMs: number;

    /** Tokens per second */
    tokensPerSecond: number;

    /** Estimated cost (if available) */
    estimatedCost?: number;

    /** Suggestions per 1K tokens */
    suggestionsPer1KTokens: number;
}

/**
 * Complete comparison result
 */
export interface ComparisonResult {
    /** Comparison ID */
    id: string;

    /** Timestamp */
    timestamp: string;

    /** Document path that was analyzed */
    documentPath: string;

    /** Provider results */
    results: ProviderResult[];

    /** Suggestion overlap analysis */
    overlap: {
        /** Jaccard similarity of suggestion sets */
        jaccardSimilarity: number;

        /** Suggestions that appear in all providers */
        unanimousSuggestions: SuggestedStub[];

        /** Suggestions unique to each provider */
        uniqueSuggestions: Record<LLMProvider, SuggestedStub[]>;

        /** Pairwise suggestion comparisons */
        pairwiseComparisons: Array<{
            provider1: LLMProvider;
            provider2: LLMProvider;
            similarity: number;
        }>;
    };

    /** Quality delta between providers */
    qualityDelta: Record<LLMProvider, QualityMetrics>;

    /** Efficiency delta between providers */
    efficiencyDelta: Record<LLMProvider, EfficiencyMetrics>;

    /** Overall winner determination */
    winner: {
        provider: LLMProvider;
        rationale: string;
        confidence: number;
    } | null;

    /** Trace context for observability */
    traceContext?: TraceContext;
}

/**
 * Comparator configuration
 */
export interface ComparatorConfig {
    /** Similarity threshold for considering suggestions as "matching" */
    similarityThreshold: number;

    /** Weight for quality in winner determination */
    qualityWeight: number;

    /** Weight for efficiency in winner determination */
    efficiencyWeight: number;

    /** Cost per 1K tokens by provider (for efficiency calculation) */
    costPer1KTokens: Record<LLMProvider, number>;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Default comparator configuration
 */
export const DEFAULT_COMPARATOR_CONFIG: ComparatorConfig = {
    similarityThreshold: 0.7,
    qualityWeight: 0.6,
    efficiencyWeight: 0.4,
    costPer1KTokens: {
        anthropic: 0.003,
        openai: 0.005,
        gemini: 0.00025,
    },
};

/**
 * Stub types that require grounding
 */
const GROUNDING_REQUIRED_TYPES = new Set(['source', 'check', 'link', 'data']);

// =============================================================================
// LLM COMPARATOR CLASS
// =============================================================================

/**
 * Compares LLM outputs across providers
 */
export class LLMComparator {
    private config: ComparatorConfig;
    private comparisons: ComparisonResult[] = [];

    constructor(config: Partial<ComparatorConfig> = {}) {
        this.config = { ...DEFAULT_COMPARATOR_CONFIG, ...config };
    }

    // =========================================================================
    // COMPARISON
    // =========================================================================

    /**
     * Compare results from multiple providers
     */
    compare(
        documentPath: string,
        results: ProviderResult[],
        traceContext?: TraceContext,
    ): ComparisonResult {
        const id = `cmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

        logger.info('llm-response', 'Starting LLM provider comparison', {
            documentPath,
            providers: results.map(r => r.provider),
        }, traceContext);

        // Calculate overlap
        const overlap = this.calculateOverlap(results);

        // Calculate quality metrics
        const qualityDelta: Record<string, QualityMetrics> = {};
        for (const result of results) {
            if (result.success && result.response) {
                qualityDelta[result.provider] = this.calculateQualityMetrics(result.response);
            }
        }

        // Calculate efficiency metrics
        const efficiencyDelta: Record<string, EfficiencyMetrics> = {};
        for (const result of results) {
            efficiencyDelta[result.provider] = this.calculateEfficiencyMetrics(result);
        }

        // Determine winner
        const winner = this.determineWinner(
            results,
            qualityDelta as Record<LLMProvider, QualityMetrics>,
            efficiencyDelta as Record<LLMProvider, EfficiencyMetrics>,
        );

        const comparison: ComparisonResult = {
            id,
            timestamp: new Date().toISOString(),
            documentPath,
            results,
            overlap,
            qualityDelta: qualityDelta as Record<LLMProvider, QualityMetrics>,
            efficiencyDelta: efficiencyDelta as Record<LLMProvider, EfficiencyMetrics>,
            winner,
            traceContext,
        };

        this.comparisons.push(comparison);

        logger.info('llm-response', 'LLM provider comparison complete', {
            comparisonId: id,
            winner: winner?.provider,
            jaccardSimilarity: overlap.jaccardSimilarity.toFixed(3),
        }, traceContext);

        return comparison;
    }

    // =========================================================================
    // OVERLAP ANALYSIS
    // =========================================================================

    /**
     * Calculate suggestion overlap between providers
     */
    private calculateOverlap(results: ProviderResult[]): ComparisonResult['overlap'] {
        const successfulResults = results.filter(r => r.success && r.response);

        if (successfulResults.length < 2) {
            return {
                jaccardSimilarity: 0,
                unanimousSuggestions: [],
                uniqueSuggestions: {} as Record<LLMProvider, SuggestedStub[]>,
                pairwiseComparisons: [],
            };
        }

        // Get all suggestions by provider
        const suggestionsByProvider: Record<string, SuggestedStub[]> = {};
        for (const result of successfulResults) {
            suggestionsByProvider[result.provider] = result.response!.suggested_stubs;
        }

        // Find unanimous suggestions (similar suggestions in all providers)
        const unanimousSuggestions: SuggestedStub[] = [];
        const firstProvider = successfulResults[0];
        const otherProviders = successfulResults.slice(1);

        for (const suggestion of firstProvider.response!.suggested_stubs) {
            const isUnanimous = otherProviders.every(other =>
                other.response!.suggested_stubs.some(s =>
                    this.areSuggestionsSimilar(suggestion, s),
                ),
            );
            if (isUnanimous) {
                unanimousSuggestions.push(suggestion);
            }
        }

        // Find unique suggestions
        const uniqueSuggestions: Record<string, SuggestedStub[]> = {};
        for (const result of successfulResults) {
            const others = successfulResults.filter(r => r.provider !== result.provider);
            uniqueSuggestions[result.provider] = result.response!.suggested_stubs.filter(s =>
                !others.some(other =>
                    other.response!.suggested_stubs.some(os =>
                        this.areSuggestionsSimilar(s, os),
                    ),
                ),
            );
        }

        // Calculate pairwise Jaccard similarity
        const pairwiseComparisons: Array<{
            provider1: LLMProvider;
            provider2: LLMProvider;
            similarity: number;
        }> = [];

        for (let i = 0; i < successfulResults.length; i++) {
            for (let j = i + 1; j < successfulResults.length; j++) {
                const similarity = this.calculateJaccardSimilarity(
                    successfulResults[i].response!.suggested_stubs,
                    successfulResults[j].response!.suggested_stubs,
                );
                pairwiseComparisons.push({
                    provider1: successfulResults[i].provider,
                    provider2: successfulResults[j].provider,
                    similarity,
                });
            }
        }

        // Overall Jaccard similarity (average of pairwise)
        const jaccardSimilarity = pairwiseComparisons.length > 0
            ? pairwiseComparisons.reduce((sum, p) => sum + p.similarity, 0) / pairwiseComparisons.length
            : 0;

        return {
            jaccardSimilarity,
            unanimousSuggestions,
            uniqueSuggestions: uniqueSuggestions as Record<LLMProvider, SuggestedStub[]>,
            pairwiseComparisons,
        };
    }

    /**
     * Check if two suggestions are similar
     */
    private areSuggestionsSimilar(a: SuggestedStub, b: SuggestedStub): boolean {
        // Type must match
        if (a.type !== b.type) return false;

        // Location should be close (within 5 lines)
        const locationDiff = Math.abs(a.location.lineNumber - b.location.lineNumber);
        if (locationDiff > 5) return false;

        // Description similarity (simple word overlap)
        const aWords = new Set(a.description.toLowerCase().split(/\s+/));
        const bWords = new Set(b.description.toLowerCase().split(/\s+/));
        const intersection = new Set([...aWords].filter(w => bWords.has(w)));
        const union = new Set([...aWords, ...bWords]);
        const wordSimilarity = intersection.size / union.size;

        return wordSimilarity >= this.config.similarityThreshold;
    }

    /**
     * Calculate Jaccard similarity between suggestion sets
     */
    private calculateJaccardSimilarity(a: SuggestedStub[], b: SuggestedStub[]): number {
        if (a.length === 0 && b.length === 0) return 1;
        if (a.length === 0 || b.length === 0) return 0;

        // Count matching suggestions
        let matchCount = 0;
        const matched = new Set<number>();

        for (const suggestionA of a) {
            for (let i = 0; i < b.length; i++) {
                if (!matched.has(i) && this.areSuggestionsSimilar(suggestionA, b[i])) {
                    matchCount++;
                    matched.add(i);
                    break;
                }
            }
        }

        // Jaccard = intersection / union
        const union = a.length + b.length - matchCount;
        return matchCount / union;
    }

    // =========================================================================
    // QUALITY METRICS
    // =========================================================================

    /**
     * Calculate quality metrics for a response
     */
    private calculateQualityMetrics(response: LLMSuggestionResponse): QualityMetrics {
        const suggestions = response.suggested_stubs;

        // Type distribution
        const typeDistribution: Record<string, number> = {};
        for (const s of suggestions) {
            typeDistribution[s.type] = (typeDistribution[s.type] || 0) + 1;
        }

        // Priority distribution
        const priorityDistribution: Record<string, number> = {};
        for (const s of suggestions) {
            const priority = s.priority || 'medium';
            priorityDistribution[priority] = (priorityDistribution[priority] || 0) + 1;
        }

        // Grounding required ratio
        const groundingCount = suggestions.filter(s =>
            GROUNDING_REQUIRED_TYPES.has(s.type),
        ).length;
        const groundingRequiredRatio = suggestions.length > 0
            ? groundingCount / suggestions.length
            : 0;

        return {
            suggestionCount: suggestions.length,
            avgConfidence: response.confidence,
            typeDistribution,
            priorityDistribution,
            groundingRequiredRatio,
        };
    }

    // =========================================================================
    // EFFICIENCY METRICS
    // =========================================================================

    /**
     * Calculate efficiency metrics for a result
     */
    private calculateEfficiencyMetrics(result: ProviderResult): EfficiencyMetrics {
        const totalTokens = result.inputTokens + result.outputTokens;
        const tokensPerSecond = result.latencyMs > 0
            ? (totalTokens / result.latencyMs) * 1000
            : 0;

        const suggestionCount = result.response?.suggested_stubs.length || 0;
        const suggestionsPer1KTokens = totalTokens > 0
            ? (suggestionCount / totalTokens) * 1000
            : 0;

        const costPer1K = this.config.costPer1KTokens[result.provider] || 0;
        const estimatedCost = (totalTokens / 1000) * costPer1K;

        return {
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            totalTokens,
            latencyMs: result.latencyMs,
            tokensPerSecond,
            estimatedCost,
            suggestionsPer1KTokens,
        };
    }

    // =========================================================================
    // WINNER DETERMINATION
    // =========================================================================

    /**
     * Determine the winning provider
     */
    private determineWinner(
        results: ProviderResult[],
        qualityDelta: Record<LLMProvider, QualityMetrics>,
        efficiencyDelta: Record<LLMProvider, EfficiencyMetrics>,
    ): ComparisonResult['winner'] {
        const successfulResults = results.filter(r => r.success);
        if (successfulResults.length === 0) return null;
        if (successfulResults.length === 1) {
            return {
                provider: successfulResults[0].provider,
                rationale: 'Only successful provider',
                confidence: 1,
            };
        }

        // Score each provider
        const scores: Array<{ provider: LLMProvider; score: number; breakdown: string[] }> = [];

        for (const result of successfulResults) {
            const quality = qualityDelta[result.provider];
            const efficiency = efficiencyDelta[result.provider];
            const breakdown: string[] = [];

            let qualityScore = 0;
            let efficiencyScore = 0;

            if (quality) {
                // Quality: suggestion count, confidence, grounding ratio
                qualityScore += Math.min(quality.suggestionCount / 10, 1) * 0.4;
                qualityScore += quality.avgConfidence * 0.4;
                qualityScore += quality.groundingRequiredRatio * 0.2;
                breakdown.push(`Quality: ${(qualityScore * 100).toFixed(0)}%`);
            }

            if (efficiency) {
                // Efficiency: speed and cost-effectiveness
                const speedScore = Math.min(efficiency.tokensPerSecond / 100, 1);
                const costScore = efficiency.estimatedCost
                    ? Math.max(0, 1 - efficiency.estimatedCost * 10)
                    : 0.5;
                efficiencyScore = speedScore * 0.5 + costScore * 0.5;
                breakdown.push(`Efficiency: ${(efficiencyScore * 100).toFixed(0)}%`);
            }

            const totalScore = qualityScore * this.config.qualityWeight +
                efficiencyScore * this.config.efficiencyWeight;

            scores.push({ provider: result.provider, score: totalScore, breakdown });
        }

        // Sort by score descending
        scores.sort((a, b) => b.score - a.score);

        const winner = scores[0];
        const runnerUp = scores[1];

        // Calculate confidence based on margin
        const margin = winner.score - (runnerUp?.score || 0);
        const confidence = Math.min(0.5 + margin * 2, 1);

        return {
            provider: winner.provider,
            rationale: winner.breakdown.join(', '),
            confidence,
        };
    }

    // =========================================================================
    // ANALYTICS
    // =========================================================================

    /**
     * Get all comparisons
     */
    getAllComparisons(): ComparisonResult[] {
        return [...this.comparisons];
    }

    /**
     * Get comparison by ID
     */
    getComparison(id: string): ComparisonResult | undefined {
        return this.comparisons.find(c => c.id === id);
    }

    /**
     * Get aggregate statistics across all comparisons
     */
    getAggregateStats(): {
        totalComparisons: number;
        winsByProvider: Record<LLMProvider, number>;
        avgSimilarity: number;
        avgQualityByProvider: Record<LLMProvider, number>;
        avgLatencyByProvider: Record<LLMProvider, number>;
    } {
        const winsByProvider: Record<string, number> = {
            anthropic: 0,
            openai: 0,
            gemini: 0,
        };

        const qualityScores: Record<string, number[]> = {
            anthropic: [],
            openai: [],
            gemini: [],
        };

        const latencies: Record<string, number[]> = {
            anthropic: [],
            openai: [],
            gemini: [],
        };

        let totalSimilarity = 0;

        for (const comparison of this.comparisons) {
            totalSimilarity += comparison.overlap.jaccardSimilarity;

            if (comparison.winner) {
                winsByProvider[comparison.winner.provider]++;
            }

            for (const [provider, quality] of Object.entries(comparison.qualityDelta)) {
                qualityScores[provider].push(quality.avgConfidence);
            }

            for (const [provider, efficiency] of Object.entries(comparison.efficiencyDelta)) {
                latencies[provider].push(efficiency.latencyMs);
            }
        }

        const avgQualityByProvider: Record<string, number> = {};
        const avgLatencyByProvider: Record<string, number> = {};

        for (const provider of Object.keys(qualityScores)) {
            const scores = qualityScores[provider];
            avgQualityByProvider[provider] = scores.length > 0
                ? scores.reduce((a, b) => a + b, 0) / scores.length
                : 0;

            const lats = latencies[provider];
            avgLatencyByProvider[provider] = lats.length > 0
                ? lats.reduce((a, b) => a + b, 0) / lats.length
                : 0;
        }

        return {
            totalComparisons: this.comparisons.length,
            winsByProvider: winsByProvider as Record<LLMProvider, number>,
            avgSimilarity: this.comparisons.length > 0
                ? totalSimilarity / this.comparisons.length
                : 0,
            avgQualityByProvider: avgQualityByProvider as Record<LLMProvider, number>,
            avgLatencyByProvider: avgLatencyByProvider as Record<LLMProvider, number>,
        };
    }

    /**
     * Clear all comparisons
     */
    clear(): void {
        this.comparisons = [];
    }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

/**
 * Default LLM comparator instance
 */
export const llmComparator = new LLMComparator();
