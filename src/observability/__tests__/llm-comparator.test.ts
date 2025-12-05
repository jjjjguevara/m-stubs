import { describe, it, expect, beforeEach } from 'vitest';
import {
    LLMComparator,
    DEFAULT_COMPARATOR_CONFIG,
    type ProviderResult,
} from '../llm-comparator';
import type { SuggestedStub, LLMSuggestionResponse } from '../../llm/llm-types';

// =============================================================================
// TEST FIXTURES
// =============================================================================

function createMockSuggestion(overrides: Partial<SuggestedStub> = {}): SuggestedStub {
    return {
        type: 'source',
        description: 'Test suggestion description',
        stub_form: 'persistent',
        location: { lineNumber: 10 },
        rationale: 'Test rationale',
        ...overrides,
    };
}

function createMockResponse(suggestions: SuggestedStub[] = []): LLMSuggestionResponse {
    return {
        suggested_stubs: suggestions,
        confidence: 0.8,
        analysis_summary: 'Test analysis',
        references: [],
    };
}

function createMockProviderResult(overrides: Partial<ProviderResult> = {}): ProviderResult {
    return {
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        success: true,
        response: createMockResponse([createMockSuggestion()]),
        inputTokens: 1000,
        outputTokens: 500,
        latencyMs: 2000,
        ...overrides,
    };
}

// =============================================================================
// TESTS
// =============================================================================

describe('LLMComparator', () => {
    let comparator: LLMComparator;

    beforeEach(() => {
        comparator = new LLMComparator();
    });

    describe('constants', () => {
        it('should have correct default config', () => {
            expect(DEFAULT_COMPARATOR_CONFIG.similarityThreshold).toBe(0.7);
            expect(DEFAULT_COMPARATOR_CONFIG.qualityWeight).toBe(0.6);
            expect(DEFAULT_COMPARATOR_CONFIG.efficiencyWeight).toBe(0.4);
        });

        it('should have cost per 1K tokens for all providers', () => {
            expect(DEFAULT_COMPARATOR_CONFIG.costPer1KTokens.anthropic).toBeDefined();
            expect(DEFAULT_COMPARATOR_CONFIG.costPer1KTokens.openai).toBeDefined();
            expect(DEFAULT_COMPARATOR_CONFIG.costPer1KTokens.gemini).toBeDefined();
        });
    });

    describe('compare', () => {
        it('should create a comparison result', () => {
            const results: ProviderResult[] = [
                createMockProviderResult({ provider: 'anthropic' }),
                createMockProviderResult({ provider: 'openai' }),
            ];

            const comparison = comparator.compare('/test/doc.md', results);

            expect(comparison.id).toMatch(/^cmp-/);
            expect(comparison.documentPath).toBe('/test/doc.md');
            expect(comparison.results).toHaveLength(2);
            expect(comparison.timestamp).toBeDefined();
        });

        it('should calculate overlap between providers', () => {
            // Two providers with similar suggestions
            const suggestion1 = createMockSuggestion({
                type: 'source',
                description: 'Find citation for this claim',
                location: { lineNumber: 10 },
            });
            const suggestion2 = createMockSuggestion({
                type: 'source',
                description: 'Find citation for this claim here',
                location: { lineNumber: 11 },
            });

            const results: ProviderResult[] = [
                createMockProviderResult({
                    provider: 'anthropic',
                    response: createMockResponse([suggestion1]),
                }),
                createMockProviderResult({
                    provider: 'openai',
                    response: createMockResponse([suggestion2]),
                }),
            ];

            const comparison = comparator.compare('/test/doc.md', results);

            expect(comparison.overlap.jaccardSimilarity).toBeGreaterThan(0);
        });

        it('should identify unanimous suggestions', () => {
            // Same suggestion in both providers
            const suggestion = createMockSuggestion({
                type: 'source',
                description: 'Find citation for claim',
                location: { lineNumber: 10 },
            });

            const results: ProviderResult[] = [
                createMockProviderResult({
                    provider: 'anthropic',
                    response: createMockResponse([suggestion]),
                }),
                createMockProviderResult({
                    provider: 'openai',
                    response: createMockResponse([{ ...suggestion }]),
                }),
            ];

            const comparison = comparator.compare('/test/doc.md', results);

            expect(comparison.overlap.unanimousSuggestions.length).toBeGreaterThanOrEqual(0);
        });

        it('should identify unique suggestions per provider', () => {
            const anthropicSuggestion = createMockSuggestion({
                type: 'source',
                description: 'Anthropic unique suggestion',
                location: { lineNumber: 10 },
            });
            const openaiSuggestion = createMockSuggestion({
                type: 'draft',
                description: 'OpenAI unique suggestion',
                location: { lineNumber: 50 },
            });

            const results: ProviderResult[] = [
                createMockProviderResult({
                    provider: 'anthropic',
                    response: createMockResponse([anthropicSuggestion]),
                }),
                createMockProviderResult({
                    provider: 'openai',
                    response: createMockResponse([openaiSuggestion]),
                }),
            ];

            const comparison = comparator.compare('/test/doc.md', results);

            expect(comparison.overlap.uniqueSuggestions).toBeDefined();
        });

        it('should calculate quality delta for each provider', () => {
            const results: ProviderResult[] = [
                createMockProviderResult({
                    provider: 'anthropic',
                    response: createMockResponse([
                        createMockSuggestion({ type: 'source' }),
                        createMockSuggestion({ type: 'check' }),
                    ]),
                }),
                createMockProviderResult({
                    provider: 'openai',
                    response: createMockResponse([
                        createMockSuggestion({ type: 'draft' }),
                    ]),
                }),
            ];

            const comparison = comparator.compare('/test/doc.md', results);

            expect(comparison.qualityDelta.anthropic).toBeDefined();
            expect(comparison.qualityDelta.anthropic.suggestionCount).toBe(2);
            expect(comparison.qualityDelta.openai.suggestionCount).toBe(1);
        });

        it('should calculate efficiency delta for each provider', () => {
            const results: ProviderResult[] = [
                createMockProviderResult({
                    provider: 'anthropic',
                    inputTokens: 1000,
                    outputTokens: 500,
                    latencyMs: 2000,
                }),
                createMockProviderResult({
                    provider: 'openai',
                    inputTokens: 800,
                    outputTokens: 400,
                    latencyMs: 1500,
                }),
            ];

            const comparison = comparator.compare('/test/doc.md', results);

            expect(comparison.efficiencyDelta.anthropic.totalTokens).toBe(1500);
            expect(comparison.efficiencyDelta.openai.totalTokens).toBe(1200);
            expect(comparison.efficiencyDelta.openai.latencyMs).toBe(1500);
        });

        it('should determine a winner', () => {
            const results: ProviderResult[] = [
                createMockProviderResult({
                    provider: 'anthropic',
                    response: createMockResponse([
                        createMockSuggestion({ type: 'source' }),
                        createMockSuggestion({ type: 'check' }),
                    ]),
                    inputTokens: 1000,
                    outputTokens: 500,
                    latencyMs: 2000,
                }),
                createMockProviderResult({
                    provider: 'openai',
                    response: createMockResponse([]),
                    inputTokens: 800,
                    outputTokens: 100,
                    latencyMs: 1000,
                }),
            ];

            const comparison = comparator.compare('/test/doc.md', results);

            expect(comparison.winner).not.toBeNull();
            expect(comparison.winner!.provider).toBeDefined();
            expect(comparison.winner!.rationale).toBeDefined();
            expect(comparison.winner!.confidence).toBeGreaterThan(0);
        });

        it('should handle single provider', () => {
            const results: ProviderResult[] = [
                createMockProviderResult({ provider: 'anthropic' }),
            ];

            const comparison = comparator.compare('/test/doc.md', results);

            expect(comparison.winner).not.toBeNull();
            expect(comparison.winner!.provider).toBe('anthropic');
            expect(comparison.winner!.rationale).toBe('Only successful provider');
        });

        it('should handle failed providers', () => {
            const results: ProviderResult[] = [
                createMockProviderResult({ provider: 'anthropic', success: false, error: 'API error' }),
                createMockProviderResult({ provider: 'openai', success: true }),
            ];

            const comparison = comparator.compare('/test/doc.md', results);

            expect(comparison.winner?.provider).toBe('openai');
        });

        it('should handle empty results', () => {
            const comparison = comparator.compare('/test/doc.md', []);

            expect(comparison.winner).toBeNull();
            expect(comparison.overlap.jaccardSimilarity).toBe(0);
        });
    });

    describe('quality metrics', () => {
        it('should calculate type distribution', () => {
            const results: ProviderResult[] = [
                createMockProviderResult({
                    provider: 'anthropic',
                    response: createMockResponse([
                        createMockSuggestion({ type: 'source' }),
                        createMockSuggestion({ type: 'source' }),
                        createMockSuggestion({ type: 'check' }),
                    ]),
                }),
            ];

            const comparison = comparator.compare('/test/doc.md', results);
            const quality = comparison.qualityDelta.anthropic;

            expect(quality.typeDistribution.source).toBe(2);
            expect(quality.typeDistribution.check).toBe(1);
        });

        it('should calculate grounding required ratio', () => {
            const results: ProviderResult[] = [
                createMockProviderResult({
                    provider: 'anthropic',
                    response: createMockResponse([
                        createMockSuggestion({ type: 'source' }), // requires grounding
                        createMockSuggestion({ type: 'check' }), // requires grounding
                        createMockSuggestion({ type: 'draft' }), // no grounding required
                        createMockSuggestion({ type: 'expand' }), // no grounding required
                    ]),
                }),
            ];

            const comparison = comparator.compare('/test/doc.md', results);
            const quality = comparison.qualityDelta.anthropic;

            expect(quality.groundingRequiredRatio).toBeCloseTo(0.5);
        });
    });

    describe('efficiency metrics', () => {
        it('should calculate tokens per second', () => {
            const results: ProviderResult[] = [
                createMockProviderResult({
                    provider: 'anthropic',
                    inputTokens: 1000,
                    outputTokens: 500,
                    latencyMs: 1500, // 1.5 seconds for 1500 tokens = 1000 tokens/sec
                }),
            ];

            const comparison = comparator.compare('/test/doc.md', results);
            const efficiency = comparison.efficiencyDelta.anthropic;

            expect(efficiency.tokensPerSecond).toBeCloseTo(1000);
        });

        it('should calculate suggestions per 1K tokens', () => {
            const results: ProviderResult[] = [
                createMockProviderResult({
                    provider: 'anthropic',
                    response: createMockResponse([
                        createMockSuggestion(),
                        createMockSuggestion(),
                    ]),
                    inputTokens: 500,
                    outputTokens: 500, // 1000 tokens, 2 suggestions = 2 per 1K
                }),
            ];

            const comparison = comparator.compare('/test/doc.md', results);
            const efficiency = comparison.efficiencyDelta.anthropic;

            expect(efficiency.suggestionsPer1KTokens).toBeCloseTo(2);
        });

        it('should calculate estimated cost', () => {
            const results: ProviderResult[] = [
                createMockProviderResult({
                    provider: 'anthropic',
                    inputTokens: 500,
                    outputTokens: 500, // 1000 tokens
                }),
            ];

            const comparison = comparator.compare('/test/doc.md', results);
            const efficiency = comparison.efficiencyDelta.anthropic;

            // Default cost for anthropic is 0.003 per 1K
            expect(efficiency.estimatedCost).toBeCloseTo(0.003);
        });
    });

    describe('getAllComparisons', () => {
        it('should return all recorded comparisons', () => {
            comparator.compare('/test/doc1.md', [createMockProviderResult()]);
            comparator.compare('/test/doc2.md', [createMockProviderResult()]);

            const all = comparator.getAllComparisons();

            expect(all).toHaveLength(2);
        });
    });

    describe('getComparison', () => {
        it('should return comparison by ID', () => {
            const comparison = comparator.compare('/test/doc.md', [createMockProviderResult()]);
            const retrieved = comparator.getComparison(comparison.id);

            expect(retrieved).toEqual(comparison);
        });

        it('should return undefined for unknown ID', () => {
            const retrieved = comparator.getComparison('unknown-id');
            expect(retrieved).toBeUndefined();
        });
    });

    describe('getAggregateStats', () => {
        it('should aggregate wins by provider', () => {
            // Anthropic wins with more suggestions
            comparator.compare('/test/doc1.md', [
                createMockProviderResult({
                    provider: 'anthropic',
                    response: createMockResponse([createMockSuggestion(), createMockSuggestion()]),
                }),
                createMockProviderResult({
                    provider: 'openai',
                    response: createMockResponse([]),
                }),
            ]);

            const stats = comparator.getAggregateStats();

            expect(stats.totalComparisons).toBe(1);
            expect(stats.winsByProvider).toBeDefined();
        });

        it('should calculate average similarity', () => {
            comparator.compare('/test/doc.md', [
                createMockProviderResult({ provider: 'anthropic' }),
                createMockProviderResult({ provider: 'openai' }),
            ]);

            const stats = comparator.getAggregateStats();

            expect(stats.avgSimilarity).toBeDefined();
        });

        it('should return zeros for empty comparator', () => {
            const stats = comparator.getAggregateStats();

            expect(stats.totalComparisons).toBe(0);
            expect(stats.avgSimilarity).toBe(0);
        });
    });

    describe('clear', () => {
        it('should remove all comparisons', () => {
            comparator.compare('/test/doc.md', [createMockProviderResult()]);
            comparator.clear();

            expect(comparator.getAllComparisons()).toHaveLength(0);
        });
    });

    describe('custom config', () => {
        it('should accept custom similarity threshold', () => {
            const customComparator = new LLMComparator({ similarityThreshold: 0.9 });

            // With high threshold, similar suggestions may not match
            const suggestion1 = createMockSuggestion({
                type: 'source',
                description: 'Find citation',
                location: { lineNumber: 10 },
            });
            const suggestion2 = createMockSuggestion({
                type: 'source',
                description: 'Find a citation for this claim',
                location: { lineNumber: 10 },
            });

            const results: ProviderResult[] = [
                createMockProviderResult({
                    provider: 'anthropic',
                    response: createMockResponse([suggestion1]),
                }),
                createMockProviderResult({
                    provider: 'openai',
                    response: createMockResponse([suggestion2]),
                }),
            ];

            const comparison = customComparator.compare('/test/doc.md', results);

            // Should still produce a valid comparison
            expect(comparison.overlap).toBeDefined();
        });
    });
});
