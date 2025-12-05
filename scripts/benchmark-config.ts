/**
 * Benchmark Configuration
 *
 * Configuration for running LLM benchmarks across providers.
 */

import type { TaskFamily } from '../test/harness';

// =============================================================================
// TYPES
// =============================================================================

/**
 * LLM Provider configuration
 */
export interface ProviderConfig {
    name: 'anthropic' | 'openai' | 'gemini';
    apiKey: string;
    model: string;
    maxTokens: number;
    baseUrl?: string;
}

/**
 * Benchmark run configuration
 */
export interface BenchmarkConfig {
    /** Output directory for results */
    outputDir: string;

    /** Test corpus directory */
    corpusDir: string;

    /** Providers to benchmark */
    providers: ProviderConfig[];

    /** Document patterns to include */
    includePatterns: string[];

    /** Task families to test */
    taskFamilies: TaskFamily[];

    /** Creativity modes to test */
    creativityModes: string[];

    /** Number of runs per document (for variance measurement) */
    runsPerDocument: number;

    /** Whether to record interactions */
    recordInteractions: boolean;

    /** Whether to run in parallel */
    parallel: boolean;

    /** Max concurrent requests */
    maxConcurrency: number;

    /** Request timeout in ms */
    timeoutMs: number;

    /** Delay between requests in ms (rate limiting) */
    requestDelayMs: number;
}

// =============================================================================
// DEFAULTS
// =============================================================================

/**
 * Default provider configurations
 * API keys should be set via environment variables
 */
export const DEFAULT_PROVIDERS: ProviderConfig[] = [
    {
        name: 'anthropic',
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        model: 'claude-sonnet-4-20250514',
        maxTokens: 4096,
    },
    {
        name: 'openai',
        apiKey: process.env.OPENAI_API_KEY || '',
        model: 'gpt-4o',
        maxTokens: 4096,
    },
    {
        name: 'gemini',
        apiKey: process.env.GEMINI_API_KEY || '',
        model: 'gemini-2.0-flash',
        maxTokens: 8192,
    },
];

/**
 * Default benchmark configuration
 */
export const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = {
    outputDir: './benchmark-results',
    corpusDir: './tests',
    providers: DEFAULT_PROVIDERS.filter(p => p.apiKey),
    includePatterns: ['**/*.md'],
    taskFamilies: ['combinatorial', 'synoptic', 'generative', 'operational', 'learning'],
    creativityModes: ['research', 'review', 'draft', 'creative'],
    runsPerDocument: 1,
    recordInteractions: true,
    parallel: false,
    maxConcurrency: 3,
    timeoutMs: 60000,
    requestDelayMs: 1000,
};

// =============================================================================
// MODEL COSTS (per 1K tokens)
// =============================================================================

export const MODEL_COSTS: Record<string, { input: number; output: number }> = {
    // Anthropic
    'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
    'claude-opus-4-20250514': { input: 0.015, output: 0.075 },
    'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
    'claude-3-5-haiku-20241022': { input: 0.0008, output: 0.004 },

    // OpenAI
    'gpt-4o': { input: 0.005, output: 0.015 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 },

    // Gemini
    'gemini-2.0-flash': { input: 0.0001, output: 0.0004 },
    'gemini-2.0-flash-lite': { input: 0.000075, output: 0.0003 },
    'gemini-2.5-flash': { input: 0.00015, output: 0.0006 },
    'gemini-2.5-pro': { input: 0.00125, output: 0.005 },
    'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
    'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
};

/**
 * Calculate cost for a request
 */
export function calculateCost(
    model: string,
    inputTokens: number,
    outputTokens: number,
): number {
    const costs = MODEL_COSTS[model];
    if (!costs) return 0;

    return (inputTokens / 1000) * costs.input + (outputTokens / 1000) * costs.output;
}

// =============================================================================
// STUB TYPE TO TASK FAMILY MAPPING
// =============================================================================

export const STUB_TYPE_TASK_FAMILY: Record<string, TaskFamily> = {
    // Retrieval -> Combinatorial
    source: 'combinatorial',
    check: 'combinatorial',
    link: 'combinatorial',

    // Computation -> Combinatorial
    data: 'combinatorial',

    // Synthesis -> Synoptic
    fix: 'synoptic',
    cut: 'synoptic',

    // Creation -> Generative
    draft: 'generative',
    expand: 'generative',
    idea: 'generative',
    question: 'generative',

    // Structural -> Operational
    move: 'operational',
    restructure: 'operational',
};

/**
 * Infer task family from document stubs
 */
export function inferTaskFamily(stubTypes: string[]): TaskFamily {
    if (stubTypes.length === 0) return 'synoptic';

    // Count by family
    const counts: Record<TaskFamily, number> = {
        combinatorial: 0,
        synoptic: 0,
        generative: 0,
        operational: 0,
        learning: 0,
    };

    for (const type of stubTypes) {
        const family = STUB_TYPE_TASK_FAMILY[type];
        if (family) counts[family]++;
    }

    // Return dominant family
    let maxFamily: TaskFamily = 'synoptic';
    let maxCount = 0;

    for (const [family, count] of Object.entries(counts)) {
        if (count > maxCount) {
            maxCount = count;
            maxFamily = family as TaskFamily;
        }
    }

    return maxFamily;
}
