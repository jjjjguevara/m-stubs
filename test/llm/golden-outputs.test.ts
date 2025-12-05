/**
 * Golden Output Tests
 *
 * Uses recorded "known good" LLM responses to detect regressions.
 * These tests compare current outputs against baseline expectations
 * to ensure quality doesn't degrade over time.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import type {
    LLMSuggestionResponse,
    SuggestedStub,
} from '../../src/llm/llm-types';

// =============================================================================
// GOLDEN OUTPUT COMPARISON UTILITIES
// =============================================================================

interface GoldenComparison {
    /** Whether outputs match within tolerance */
    matches: boolean;
    /** Detailed comparison results */
    details: ComparisonDetail[];
    /** Overall similarity score (0-1) */
    similarityScore: number;
}

interface ComparisonDetail {
    metric: string;
    expected: unknown;
    actual: unknown;
    passed: boolean;
    message?: string;
}

interface GoldenOutput {
    /** Document path that was analyzed */
    documentPath: string;
    /** Creativity mode used */
    creativityMode: string;
    /** Provider that generated this output */
    provider: string;
    /** The recorded response */
    response: LLMSuggestionResponse;
    /** Expectations for comparison */
    expectations: {
        /** Minimum number of suggestions */
        minSuggestions: number;
        /** Maximum number of suggestions */
        maxSuggestions: number;
        /** Required stub types that must appear */
        requiredTypes: string[];
        /** Stub types that should NOT appear */
        forbiddenTypes: string[];
        /** Minimum confidence */
        minConfidence: number;
        /** Expected priority distribution */
        priorityDistribution?: {
            minCriticalOrHigh?: number;
            maxLow?: number;
        };
    };
}

function calculateJaccard(set1: Set<string>, set2: Set<string>): number {
    if (set1.size === 0 && set2.size === 0) return 1;
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return intersection.size / union.size;
}

function compareResponses(
    actual: LLMSuggestionResponse,
    golden: GoldenOutput,
): GoldenComparison {
    const details: ComparisonDetail[] = [];
    let passedChecks = 0;
    let totalChecks = 0;

    // Check suggestion count bounds
    totalChecks++;
    const countInRange =
        actual.suggested_stubs.length >= golden.expectations.minSuggestions &&
        actual.suggested_stubs.length <= golden.expectations.maxSuggestions;
    details.push({
        metric: 'suggestionCount',
        expected: `${golden.expectations.minSuggestions}-${golden.expectations.maxSuggestions}`,
        actual: actual.suggested_stubs.length,
        passed: countInRange,
        message: countInRange
            ? undefined
            : `Expected ${golden.expectations.minSuggestions}-${golden.expectations.maxSuggestions} suggestions, got ${actual.suggested_stubs.length}`,
    });
    if (countInRange) passedChecks++;

    // Check required types present
    const actualTypes = new Set(actual.suggested_stubs.map(s => s.type));
    for (const requiredType of golden.expectations.requiredTypes) {
        totalChecks++;
        const hasType = actualTypes.has(requiredType);
        details.push({
            metric: `requiredType:${requiredType}`,
            expected: true,
            actual: hasType,
            passed: hasType,
            message: hasType ? undefined : `Missing required type: ${requiredType}`,
        });
        if (hasType) passedChecks++;
    }

    // Check forbidden types absent
    for (const forbiddenType of golden.expectations.forbiddenTypes) {
        totalChecks++;
        const hasType = actualTypes.has(forbiddenType);
        details.push({
            metric: `forbiddenType:${forbiddenType}`,
            expected: false,
            actual: hasType,
            passed: !hasType,
            message: hasType ? `Unexpected forbidden type: ${forbiddenType}` : undefined,
        });
        if (!hasType) passedChecks++;
    }

    // Check confidence
    totalChecks++;
    const confidenceOk = actual.confidence >= golden.expectations.minConfidence;
    details.push({
        metric: 'confidence',
        expected: `>= ${golden.expectations.minConfidence}`,
        actual: actual.confidence,
        passed: confidenceOk,
        message: confidenceOk
            ? undefined
            : `Confidence ${actual.confidence} below minimum ${golden.expectations.minConfidence}`,
    });
    if (confidenceOk) passedChecks++;

    // Check priority distribution if specified
    if (golden.expectations.priorityDistribution) {
        const priorities = actual.suggested_stubs.map(s => s.priority);
        const criticalOrHigh = priorities.filter(p => p === 'critical' || p === 'high').length;
        const low = priorities.filter(p => p === 'low').length;

        if (golden.expectations.priorityDistribution.minCriticalOrHigh !== undefined) {
            totalChecks++;
            const ok = criticalOrHigh >= golden.expectations.priorityDistribution.minCriticalOrHigh;
            details.push({
                metric: 'minCriticalOrHigh',
                expected: golden.expectations.priorityDistribution.minCriticalOrHigh,
                actual: criticalOrHigh,
                passed: ok,
            });
            if (ok) passedChecks++;
        }

        if (golden.expectations.priorityDistribution.maxLow !== undefined) {
            totalChecks++;
            const ok = low <= golden.expectations.priorityDistribution.maxLow;
            details.push({
                metric: 'maxLow',
                expected: `<= ${golden.expectations.priorityDistribution.maxLow}`,
                actual: low,
                passed: ok,
            });
            if (ok) passedChecks++;
        }
    }

    // Calculate type similarity with golden
    const goldenTypes = new Set(golden.response.suggested_stubs.map(s => s.type));
    const typeSimilarity = calculateJaccard(actualTypes, goldenTypes);

    return {
        matches: passedChecks === totalChecks,
        details,
        similarityScore: totalChecks > 0 ? passedChecks / totalChecks : 0,
    };
}

// =============================================================================
// GOLDEN OUTPUTS FROM BENCHMARK RESULTS
// =============================================================================

/**
 * Golden outputs derived from benchmark baseline
 * These represent "known good" responses that future runs should approximate
 */
const GOLDEN_OUTPUTS: GoldenOutput[] = [
    {
        documentPath: 'tests/by-vector-family/retrieval-heavy.md',
        creativityMode: 'research',
        provider: 'anthropic',
        response: {
            analysis_summary: 'Document requires source verification for claims',
            suggested_stubs: [
                {
                    type: 'source',
                    description: 'Find academic source for efficiency claim',
                    stub_form: 'blocking',
                    location: { lineNumber: 42 },
                    rationale: 'Quantitative claims require verifiable sources',
                    priority: 'critical',
                },
                {
                    type: 'check',
                    description: 'Verify statistics are current',
                    stub_form: 'persistent',
                    location: { lineNumber: 44 },
                    rationale: 'Time-sensitive data needs validation',
                    priority: 'high',
                },
            ],
            references: [],
            confidence: 0.85,
        },
        expectations: {
            minSuggestions: 3,
            maxSuggestions: 10,
            requiredTypes: ['source', 'check'],
            forbiddenTypes: [], // Retrieval doc shouldn't forbid any types
            minConfidence: 0.7,
            priorityDistribution: {
                minCriticalOrHigh: 1,
            },
        },
    },
    {
        documentPath: 'tests/by-task-family/generative-task.md',
        creativityMode: 'draft',
        provider: 'anthropic',
        response: {
            analysis_summary: 'Early-stage document needs content generation',
            suggested_stubs: [
                {
                    type: 'draft',
                    description: 'Write executive summary',
                    stub_form: 'blocking',
                    location: { lineNumber: 36 },
                    rationale: 'Missing critical section',
                    priority: 'critical',
                },
                {
                    type: 'expand',
                    description: 'Develop use cases with examples',
                    stub_form: 'persistent',
                    location: { lineNumber: 47 },
                    rationale: 'Section needs elaboration',
                    priority: 'high',
                },
                {
                    type: 'idea',
                    description: 'Brainstorm alternative approaches',
                    stub_form: 'transient',
                    location: { lineNumber: 57 },
                    rationale: 'Document asks for alternatives',
                    priority: 'medium',
                },
            ],
            references: [],
            confidence: 0.80,
        },
        expectations: {
            minSuggestions: 4,
            maxSuggestions: 12,
            requiredTypes: ['draft', 'expand'],
            forbiddenTypes: [],
            minConfidence: 0.6,
            priorityDistribution: {
                minCriticalOrHigh: 2,
            },
        },
    },
    {
        documentPath: 'tests/by-creativity-mode/research-mode.md',
        creativityMode: 'research',
        provider: 'gemini',
        response: {
            analysis_summary: 'Research document needs verification',
            suggested_stubs: [
                {
                    type: 'source',
                    description: 'Find peer-reviewed studies',
                    stub_form: 'blocking',
                    location: { lineNumber: 42 },
                    rationale: 'Claims need academic backing',
                    priority: 'critical',
                },
                {
                    type: 'check',
                    description: 'Verify statistics',
                    stub_form: 'persistent',
                    location: { lineNumber: 52 },
                    rationale: 'Data verification required',
                    priority: 'high',
                },
                {
                    type: 'link',
                    description: 'Connect to authoritative references',
                    stub_form: 'persistent',
                    location: { lineNumber: 56 },
                    rationale: 'Needs authoritative sources',
                    priority: 'medium',
                },
                {
                    type: 'data',
                    description: 'Gather current market data',
                    stub_form: 'transient',
                    location: { lineNumber: 60 },
                    rationale: 'Market data may be stale',
                    priority: 'medium',
                },
            ],
            references: [],
            confidence: 0.90,
        },
        expectations: {
            minSuggestions: 3,
            maxSuggestions: 8,
            requiredTypes: ['source', 'check'],
            forbiddenTypes: ['draft', 'expand'], // Research mode should focus on verification
            minConfidence: 0.75,
        },
    },
    {
        documentPath: 'tests/edge-cases/empty-stubs.md',
        creativityMode: 'review',
        provider: 'anthropic',
        response: {
            analysis_summary: 'Document has no stubs, analysis identifies gaps',
            suggested_stubs: [
                {
                    type: 'expand',
                    description: 'Add more detail to thin sections',
                    stub_form: 'persistent',
                    location: { lineNumber: 10 },
                    rationale: 'Content is sparse',
                    priority: 'medium',
                },
            ],
            references: [],
            confidence: 0.75,
        },
        expectations: {
            minSuggestions: 1,
            maxSuggestions: 8,
            requiredTypes: [],
            forbiddenTypes: [],
            minConfidence: 0.5,
        },
    },
];

// =============================================================================
// TESTS: GOLDEN OUTPUT COMPARISON
// =============================================================================

describe('Golden Outputs - Baseline Comparison', () => {
    it('should have golden outputs for key document types', () => {
        const documentPaths = GOLDEN_OUTPUTS.map(g => g.documentPath);
        expect(documentPaths).toContain('tests/by-vector-family/retrieval-heavy.md');
        expect(documentPaths).toContain('tests/by-task-family/generative-task.md');
        expect(documentPaths).toContain('tests/by-creativity-mode/research-mode.md');
    });

    it('should have valid expectations for each golden output', () => {
        for (const golden of GOLDEN_OUTPUTS) {
            expect(golden.expectations.minSuggestions).toBeGreaterThanOrEqual(0);
            expect(golden.expectations.maxSuggestions).toBeGreaterThan(golden.expectations.minSuggestions);
            expect(golden.expectations.minConfidence).toBeGreaterThanOrEqual(0);
            expect(golden.expectations.minConfidence).toBeLessThanOrEqual(1);
        }
    });
});

describe('Golden Outputs - Comparison Logic', () => {
    const retrievalGolden = GOLDEN_OUTPUTS.find(
        g => g.documentPath.includes('retrieval-heavy')
    )!;

    it('should pass when response meets all expectations', () => {
        const goodResponse: LLMSuggestionResponse = {
            analysis_summary: 'Analysis complete',
            suggested_stubs: [
                {
                    type: 'source',
                    description: 'Test',
                    stub_form: 'blocking',
                    location: { lineNumber: 1 },
                    rationale: 'Test',
                    priority: 'critical',
                },
                {
                    type: 'check',
                    description: 'Test',
                    stub_form: 'persistent',
                    location: { lineNumber: 2 },
                    rationale: 'Test',
                    priority: 'high',
                },
                {
                    type: 'link',
                    description: 'Test',
                    stub_form: 'transient',
                    location: { lineNumber: 3 },
                    rationale: 'Test',
                    priority: 'medium',
                },
                {
                    type: 'data',
                    description: 'Test',
                    stub_form: 'transient',
                    location: { lineNumber: 4 },
                    rationale: 'Test',
                },
            ],
            references: [],
            confidence: 0.85,
        };

        const comparison = compareResponses(goodResponse, retrievalGolden);
        expect(comparison.matches).toBe(true);
        expect(comparison.similarityScore).toBe(1);
    });

    it('should fail when missing required type', () => {
        const missingSourceResponse: LLMSuggestionResponse = {
            analysis_summary: 'Analysis complete',
            suggested_stubs: [
                {
                    type: 'check', // Has check but no source
                    description: 'Test',
                    stub_form: 'persistent',
                    location: { lineNumber: 1 },
                    rationale: 'Test',
                    priority: 'high',
                },
                {
                    type: 'link',
                    description: 'Test',
                    stub_form: 'transient',
                    location: { lineNumber: 2 },
                    rationale: 'Test',
                },
                {
                    type: 'expand',
                    description: 'Test',
                    stub_form: 'persistent',
                    location: { lineNumber: 3 },
                    rationale: 'Test',
                },
            ],
            references: [],
            confidence: 0.80,
        };

        const comparison = compareResponses(missingSourceResponse, retrievalGolden);
        expect(comparison.matches).toBe(false);
        const sourceCheck = comparison.details.find(d => d.metric === 'requiredType:source');
        expect(sourceCheck?.passed).toBe(false);
    });

    it('should fail when below minimum suggestions', () => {
        const tooFewSuggestions: LLMSuggestionResponse = {
            analysis_summary: 'Brief analysis',
            suggested_stubs: [
                {
                    type: 'source',
                    description: 'Test',
                    stub_form: 'blocking',
                    location: { lineNumber: 1 },
                    rationale: 'Test',
                },
                {
                    type: 'check',
                    description: 'Test',
                    stub_form: 'persistent',
                    location: { lineNumber: 2 },
                    rationale: 'Test',
                },
            ],
            references: [],
            confidence: 0.85,
        };

        const comparison = compareResponses(tooFewSuggestions, retrievalGolden);
        expect(comparison.matches).toBe(false);
        const countCheck = comparison.details.find(d => d.metric === 'suggestionCount');
        expect(countCheck?.passed).toBe(false);
    });

    it('should fail when confidence too low', () => {
        const lowConfidenceResponse: LLMSuggestionResponse = {
            analysis_summary: 'Uncertain analysis',
            suggested_stubs: [
                {
                    type: 'source',
                    description: 'Test',
                    stub_form: 'blocking',
                    location: { lineNumber: 1 },
                    rationale: 'Test',
                    priority: 'critical',
                },
                {
                    type: 'check',
                    description: 'Test',
                    stub_form: 'persistent',
                    location: { lineNumber: 2 },
                    rationale: 'Test',
                    priority: 'high',
                },
                {
                    type: 'link',
                    description: 'Test',
                    stub_form: 'transient',
                    location: { lineNumber: 3 },
                    rationale: 'Test',
                },
            ],
            references: [],
            confidence: 0.4, // Below minimum 0.7
        };

        const comparison = compareResponses(lowConfidenceResponse, retrievalGolden);
        expect(comparison.matches).toBe(false);
        const confidenceCheck = comparison.details.find(d => d.metric === 'confidence');
        expect(confidenceCheck?.passed).toBe(false);
    });
});

describe('Golden Outputs - Research Mode Constraints', () => {
    const researchGolden = GOLDEN_OUTPUTS.find(
        g => g.documentPath.includes('research-mode')
    )!;

    it('should fail when forbidden types appear in research mode', () => {
        const responseWithForbidden: LLMSuggestionResponse = {
            analysis_summary: 'Analysis with expansion',
            suggested_stubs: [
                {
                    type: 'source',
                    description: 'Test',
                    stub_form: 'blocking',
                    location: { lineNumber: 1 },
                    rationale: 'Test',
                },
                {
                    type: 'check',
                    description: 'Test',
                    stub_form: 'persistent',
                    location: { lineNumber: 2 },
                    rationale: 'Test',
                },
                {
                    type: 'draft', // Forbidden in research mode
                    description: 'Write new content',
                    stub_form: 'persistent',
                    location: { lineNumber: 3 },
                    rationale: 'Needs content',
                },
            ],
            references: [],
            confidence: 0.80,
        };

        const comparison = compareResponses(responseWithForbidden, researchGolden);
        expect(comparison.matches).toBe(false);
        const draftCheck = comparison.details.find(d => d.metric === 'forbiddenType:draft');
        expect(draftCheck?.passed).toBe(false);
    });

    it('should pass when only verification types used', () => {
        const verificationOnlyResponse: LLMSuggestionResponse = {
            analysis_summary: 'Verification-focused analysis',
            suggested_stubs: [
                {
                    type: 'source',
                    description: 'Find sources',
                    stub_form: 'blocking',
                    location: { lineNumber: 1 },
                    rationale: 'Claims need sources',
                },
                {
                    type: 'check',
                    description: 'Verify data',
                    stub_form: 'persistent',
                    location: { lineNumber: 2 },
                    rationale: 'Data needs verification',
                },
                {
                    type: 'link',
                    description: 'Link to authority',
                    stub_form: 'persistent',
                    location: { lineNumber: 3 },
                    rationale: 'Needs authoritative reference',
                },
                {
                    type: 'data',
                    description: 'Gather metrics',
                    stub_form: 'transient',
                    location: { lineNumber: 4 },
                    rationale: 'Missing data points',
                },
            ],
            references: [],
            confidence: 0.85,
        };

        const comparison = compareResponses(verificationOnlyResponse, researchGolden);
        expect(comparison.matches).toBe(true);
    });
});

describe('Golden Outputs - Similarity Scoring', () => {
    it('should calculate partial similarity for partial matches', () => {
        const retrievalGolden = GOLDEN_OUTPUTS.find(
            g => g.documentPath.includes('retrieval-heavy')
        )!;

        const partialMatchResponse: LLMSuggestionResponse = {
            analysis_summary: 'Partial analysis',
            suggested_stubs: [
                {
                    type: 'source', // Required - present
                    description: 'Test',
                    stub_form: 'blocking',
                    location: { lineNumber: 1 },
                    rationale: 'Test',
                    priority: 'high',
                },
                // Missing 'check' which is required
                {
                    type: 'expand',
                    description: 'Test',
                    stub_form: 'persistent',
                    location: { lineNumber: 2 },
                    rationale: 'Test',
                },
                {
                    type: 'link',
                    description: 'Test',
                    stub_form: 'transient',
                    location: { lineNumber: 3 },
                    rationale: 'Test',
                },
            ],
            references: [],
            confidence: 0.80,
        };

        const comparison = compareResponses(partialMatchResponse, retrievalGolden);
        expect(comparison.matches).toBe(false);
        expect(comparison.similarityScore).toBeGreaterThan(0);
        expect(comparison.similarityScore).toBeLessThan(1);
    });
});

// =============================================================================
// TESTS: REGRESSION DETECTION SCENARIOS
// =============================================================================

describe('Golden Outputs - Regression Detection', () => {
    it('should detect quality regression (fewer suggestions)', () => {
        const baseline = GOLDEN_OUTPUTS[0]; // Retrieval-heavy
        const regressed: LLMSuggestionResponse = {
            analysis_summary: 'Minimal analysis',
            suggested_stubs: [
                {
                    type: 'source',
                    description: 'Basic source',
                    stub_form: 'transient',
                    location: { lineNumber: 1 },
                    rationale: 'Needs source',
                },
                {
                    type: 'check',
                    description: 'Basic check',
                    stub_form: 'transient',
                    location: { lineNumber: 2 },
                    rationale: 'Needs check',
                },
            ],
            references: [],
            confidence: 0.5, // Low confidence
        };

        const comparison = compareResponses(regressed, baseline);
        expect(comparison.matches).toBe(false);
        // Should fail on count and confidence
        const failedChecks = comparison.details.filter(d => !d.passed);
        expect(failedChecks.length).toBeGreaterThan(0);
    });

    it('should detect focus regression (wrong stub types)', () => {
        const researchBaseline = GOLDEN_OUTPUTS.find(g => g.creativityMode === 'research')!;
        const wrongFocus: LLMSuggestionResponse = {
            analysis_summary: 'Creative analysis for research doc',
            suggested_stubs: [
                {
                    type: 'draft', // Wrong for research mode
                    description: 'Write new content',
                    stub_form: 'persistent',
                    location: { lineNumber: 1 },
                    rationale: 'Needs content',
                },
                {
                    type: 'expand', // Wrong for research mode
                    description: 'Expand section',
                    stub_form: 'persistent',
                    location: { lineNumber: 2 },
                    rationale: 'Needs expansion',
                },
                {
                    type: 'idea',
                    description: 'Brainstorm ideas',
                    stub_form: 'transient',
                    location: { lineNumber: 3 },
                    rationale: 'Needs ideas',
                },
            ],
            references: [],
            confidence: 0.75,
        };

        const comparison = compareResponses(wrongFocus, researchBaseline);
        expect(comparison.matches).toBe(false);
        // Should fail on required types and forbidden types
        const requiredFails = comparison.details.filter(
            d => d.metric.startsWith('requiredType:') && !d.passed
        );
        const forbiddenFails = comparison.details.filter(
            d => d.metric.startsWith('forbiddenType:') && !d.passed
        );
        expect(requiredFails.length + forbiddenFails.length).toBeGreaterThan(0);
    });
});

// =============================================================================
// TESTS: GOLDEN OUTPUT FILE OPERATIONS
// =============================================================================

describe('Golden Outputs - File Operations', () => {
    const GOLDEN_DIR = path.join(__dirname, '../../benchmark-results/golden');

    it('should be able to serialize golden outputs to JSON', () => {
        const json = JSON.stringify(GOLDEN_OUTPUTS, null, 2);
        expect(json).toBeTruthy();

        const parsed = JSON.parse(json);
        expect(parsed).toHaveLength(GOLDEN_OUTPUTS.length);
    });

    it('should preserve all fields through serialization', () => {
        const original = GOLDEN_OUTPUTS[0];
        const serialized = JSON.stringify(original);
        const restored = JSON.parse(serialized) as GoldenOutput;

        expect(restored.documentPath).toBe(original.documentPath);
        expect(restored.expectations.requiredTypes).toEqual(original.expectations.requiredTypes);
        expect(restored.response.confidence).toBe(original.response.confidence);
    });
});

// =============================================================================
// EXPORT UTILITIES FOR PRODUCTION USE
// =============================================================================

export type {
    GoldenOutput,
    GoldenComparison,
    ComparisonDetail,
};
export {
    compareResponses,
    GOLDEN_OUTPUTS,
};
