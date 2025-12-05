/**
 * Metrics Collector for Test Harness
 *
 * Collects and aggregates metrics from test runs for analysis.
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Task family classification
 */
export type TaskFamily = 'combinatorial' | 'synoptic' | 'generative' | 'operational' | 'learning';

/**
 * Metrics for a single task execution
 */
export interface TaskMetrics {
    /** Unique task ID */
    taskId: string;

    /** Task family classification */
    taskFamily: TaskFamily;

    /** Document path */
    documentPath: string;

    /** Timestamp */
    timestamp: string;

    // Quality metrics
    /** Whether the task completed successfully */
    success: boolean;

    /** Accuracy score if applicable (0-1) */
    accuracy?: number;

    /** Grounding score - percentage of references verified (0-1) */
    groundingScore: number;

    /** Number of suggestions generated */
    suggestionCount: number;

    /** Number of verified suggestions */
    verifiedSuggestionCount: number;

    // Efficiency metrics
    /** Number of tool calls made */
    toolCallCount: number;

    /** Total latency in milliseconds */
    totalLatencyMs: number;

    /** Input tokens used */
    inputTokens: number;

    /** Output tokens used */
    outputTokens: number;

    /** Milestone timings */
    milestoneTimings?: Record<string, number>;

    // User acceptance metrics
    /** Whether suggestions were accepted (undefined if not yet reviewed) */
    accepted?: boolean;

    /** Reason for rejection if rejected */
    rejectionReason?: string;

    // Provider info
    /** LLM provider used */
    llmProvider: string;

    /** Model used */
    llmModel: string;

    /** Creativity mode used */
    creativityMode?: string;

    /** Tool policy */
    toolPolicy?: string;

    // Error info
    /** Error message if failed */
    errorMessage?: string;

    /** Error type if failed */
    errorType?: string;
}

/**
 * Aggregated metrics by dimension
 */
export interface AggregatedMetrics {
    /** Total number of tasks */
    totalTasks: number;

    /** Success rate (0-1) */
    successRate: number;

    /** Average grounding score */
    avgGroundingScore: number;

    /** Average latency in ms */
    avgLatencyMs: number;

    /** Average tool call count */
    avgToolCalls: number;

    /** Average suggestion count */
    avgSuggestions: number;

    /** Acceptance rate if available */
    acceptanceRate?: number;

    /** Average input tokens */
    avgInputTokens: number;

    /** Average output tokens */
    avgOutputTokens: number;
}

/**
 * Success criteria for a task family
 */
export interface SuccessCriteria {
    /** Minimum grounding accuracy */
    minGroundingScore: number;

    /** Minimum success rate */
    minSuccessRate: number;

    /** Maximum acceptable latency */
    maxLatencyMs: number;

    /** Minimum acceptance rate (if applicable) */
    minAcceptanceRate?: number;

    /** Maximum hallucination rate (1 - grounding) */
    maxHallucinationRate?: number;
}

/**
 * Default success criteria by task family
 */
export const DEFAULT_SUCCESS_CRITERIA: Record<TaskFamily, SuccessCriteria> = {
    combinatorial: {
        minGroundingScore: 0.95,
        minSuccessRate: 0.95,
        maxLatencyMs: 10000,
        maxHallucinationRate: 0.05,
    },
    synoptic: {
        minGroundingScore: 0.80,
        minSuccessRate: 0.90,
        maxLatencyMs: 15000,
        minAcceptanceRate: 0.70,
    },
    generative: {
        minGroundingScore: 0.50,
        minSuccessRate: 0.85,
        maxLatencyMs: 20000,
        minAcceptanceRate: 0.50,
        maxHallucinationRate: 0.10,
    },
    operational: {
        minGroundingScore: 0.90,
        minSuccessRate: 0.95,
        maxLatencyMs: 5000,
    },
    learning: {
        minGroundingScore: 0.70,
        minSuccessRate: 0.80,
        maxLatencyMs: 30000,
    },
};

// =============================================================================
// METRICS COLLECTOR CLASS
// =============================================================================

/**
 * Collects and analyzes task metrics
 */
export class MetricsCollector {
    private metrics: TaskMetrics[] = [];

    /**
     * Record a task execution
     */
    record(metrics: TaskMetrics): void {
        this.metrics.push(metrics);
    }

    /**
     * Get all recorded metrics
     */
    getAll(): TaskMetrics[] {
        return [...this.metrics];
    }

    /**
     * Get metrics filtered by criteria
     */
    filter(criteria: {
        taskFamily?: TaskFamily;
        llmProvider?: string;
        success?: boolean;
        since?: Date;
        documentPath?: string;
    }): TaskMetrics[] {
        return this.metrics.filter(m => {
            if (criteria.taskFamily && m.taskFamily !== criteria.taskFamily) return false;
            if (criteria.llmProvider && m.llmProvider !== criteria.llmProvider) return false;
            if (criteria.success !== undefined && m.success !== criteria.success) return false;
            if (criteria.since && new Date(m.timestamp) < criteria.since) return false;
            if (criteria.documentPath && m.documentPath !== criteria.documentPath) return false;
            return true;
        });
    }

    /**
     * Aggregate metrics
     */
    aggregate(metrics?: TaskMetrics[]): AggregatedMetrics {
        const data = metrics || this.metrics;

        if (data.length === 0) {
            return {
                totalTasks: 0,
                successRate: 0,
                avgGroundingScore: 0,
                avgLatencyMs: 0,
                avgToolCalls: 0,
                avgSuggestions: 0,
                avgInputTokens: 0,
                avgOutputTokens: 0,
            };
        }

        const successCount = data.filter(m => m.success).length;
        const acceptedCount = data.filter(m => m.accepted === true).length;
        const reviewedCount = data.filter(m => m.accepted !== undefined).length;

        return {
            totalTasks: data.length,
            successRate: successCount / data.length,
            avgGroundingScore: this.avg(data, m => m.groundingScore),
            avgLatencyMs: this.avg(data, m => m.totalLatencyMs),
            avgToolCalls: this.avg(data, m => m.toolCallCount),
            avgSuggestions: this.avg(data, m => m.suggestionCount),
            acceptanceRate: reviewedCount > 0 ? acceptedCount / reviewedCount : undefined,
            avgInputTokens: this.avg(data, m => m.inputTokens),
            avgOutputTokens: this.avg(data, m => m.outputTokens),
        };
    }

    /**
     * Get aggregated metrics by task family
     */
    aggregateByFamily(): Record<TaskFamily, AggregatedMetrics> {
        const families: TaskFamily[] = ['combinatorial', 'synoptic', 'generative', 'operational', 'learning'];
        const result: Record<string, AggregatedMetrics> = {};

        for (const family of families) {
            const familyMetrics = this.filter({ taskFamily: family });
            result[family] = this.aggregate(familyMetrics);
        }

        return result as Record<TaskFamily, AggregatedMetrics>;
    }

    /**
     * Get aggregated metrics by LLM provider
     */
    aggregateByProvider(): Record<string, AggregatedMetrics> {
        const providers = new Set(this.metrics.map(m => m.llmProvider));
        const result: Record<string, AggregatedMetrics> = {};

        for (const provider of providers) {
            const providerMetrics = this.filter({ llmProvider: provider });
            result[provider] = this.aggregate(providerMetrics);
        }

        return result;
    }

    /**
     * Check if metrics meet success criteria
     */
    checkCriteria(
        family: TaskFamily,
        criteria?: SuccessCriteria,
    ): { passes: boolean; violations: string[] } {
        const actualCriteria = criteria || DEFAULT_SUCCESS_CRITERIA[family];
        const familyMetrics = this.filter({ taskFamily: family });
        const aggregated = this.aggregate(familyMetrics);

        const violations: string[] = [];

        if (aggregated.successRate < actualCriteria.minSuccessRate) {
            violations.push(
                `Success rate ${(aggregated.successRate * 100).toFixed(1)}% < ${(actualCriteria.minSuccessRate * 100).toFixed(1)}%`,
            );
        }

        if (aggregated.avgGroundingScore < actualCriteria.minGroundingScore) {
            violations.push(
                `Grounding score ${(aggregated.avgGroundingScore * 100).toFixed(1)}% < ${(actualCriteria.minGroundingScore * 100).toFixed(1)}%`,
            );
        }

        if (aggregated.avgLatencyMs > actualCriteria.maxLatencyMs) {
            violations.push(
                `Latency ${aggregated.avgLatencyMs.toFixed(0)}ms > ${actualCriteria.maxLatencyMs}ms`,
            );
        }

        if (actualCriteria.minAcceptanceRate !== undefined && aggregated.acceptanceRate !== undefined) {
            if (aggregated.acceptanceRate < actualCriteria.minAcceptanceRate) {
                violations.push(
                    `Acceptance rate ${(aggregated.acceptanceRate * 100).toFixed(1)}% < ${(actualCriteria.minAcceptanceRate * 100).toFixed(1)}%`,
                );
            }
        }

        if (actualCriteria.maxHallucinationRate !== undefined) {
            const hallucinationRate = 1 - aggregated.avgGroundingScore;
            if (hallucinationRate > actualCriteria.maxHallucinationRate) {
                violations.push(
                    `Hallucination rate ${(hallucinationRate * 100).toFixed(1)}% > ${(actualCriteria.maxHallucinationRate * 100).toFixed(1)}%`,
                );
            }
        }

        return {
            passes: violations.length === 0,
            violations,
        };
    }

    /**
     * Generate a summary report
     */
    generateReport(): string {
        const byFamily = this.aggregateByFamily();
        const byProvider = this.aggregateByProvider();
        const overall = this.aggregate();

        const lines: string[] = [
            '# Test Metrics Report',
            '',
            `Generated: ${new Date().toISOString()}`,
            `Total Tasks: ${overall.totalTasks}`,
            '',
            '## Overall Metrics',
            `- Success Rate: ${(overall.successRate * 100).toFixed(1)}%`,
            `- Avg Grounding Score: ${(overall.avgGroundingScore * 100).toFixed(1)}%`,
            `- Avg Latency: ${overall.avgLatencyMs.toFixed(0)}ms`,
            `- Avg Tool Calls: ${overall.avgToolCalls.toFixed(1)}`,
            overall.acceptanceRate !== undefined
                ? `- Acceptance Rate: ${(overall.acceptanceRate * 100).toFixed(1)}%`
                : '',
            '',
            '## By Task Family',
        ];

        for (const [family, metrics] of Object.entries(byFamily)) {
            if (metrics.totalTasks === 0) continue;

            const criteriaCheck = this.checkCriteria(family as TaskFamily);
            const status = criteriaCheck.passes ? '✓' : '✗';

            lines.push(`### ${family} ${status}`);
            lines.push(`- Tasks: ${metrics.totalTasks}`);
            lines.push(`- Success: ${(metrics.successRate * 100).toFixed(1)}%`);
            lines.push(`- Grounding: ${(metrics.avgGroundingScore * 100).toFixed(1)}%`);
            lines.push(`- Latency: ${metrics.avgLatencyMs.toFixed(0)}ms`);

            if (!criteriaCheck.passes) {
                lines.push(`- Violations: ${criteriaCheck.violations.join(', ')}`);
            }
            lines.push('');
        }

        lines.push('## By Provider');
        for (const [provider, metrics] of Object.entries(byProvider)) {
            if (metrics.totalTasks === 0) continue;

            lines.push(`### ${provider}`);
            lines.push(`- Tasks: ${metrics.totalTasks}`);
            lines.push(`- Success: ${(metrics.successRate * 100).toFixed(1)}%`);
            lines.push(`- Grounding: ${(metrics.avgGroundingScore * 100).toFixed(1)}%`);
            lines.push(`- Latency: ${metrics.avgLatencyMs.toFixed(0)}ms`);
            lines.push('');
        }

        return lines.filter(l => l !== '').join('\n');
    }

    /**
     * Export metrics as JSON
     */
    exportJson(): string {
        return JSON.stringify({
            metrics: this.metrics,
            aggregated: {
                overall: this.aggregate(),
                byFamily: this.aggregateByFamily(),
                byProvider: this.aggregateByProvider(),
            },
            generated: new Date().toISOString(),
        }, null, 2);
    }

    /**
     * Clear all metrics
     */
    clear(): void {
        this.metrics = [];
    }

    // =========================================================================
    // PRIVATE METHODS
    // =========================================================================

    private avg(data: TaskMetrics[], fn: (m: TaskMetrics) => number): number {
        if (data.length === 0) return 0;
        return data.reduce((sum, m) => sum + fn(m), 0) / data.length;
    }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

/**
 * Default metrics collector instance
 */
export const metricsCollector = new MetricsCollector();
