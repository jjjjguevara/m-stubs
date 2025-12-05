/**
 * Milestone Tracker for Doc Doctor
 *
 * Tracks timing between key milestones in agent workflows.
 * Used for performance analysis and bottleneck identification.
 */

import { logger, type TraceContext } from './logger';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Workflow milestones
 */
export type Milestone =
    // Discovery phase
    | 'discovery-start'
    | 'discovery-complete'
    // Assignment phase
    | 'assignment-start'
    | 'assignment-complete'
    // Routing phase
    | 'routing-start'
    | 'routing-complete'
    // Tool execution phase
    | 'tool-execution-start'
    | 'tool-execution-complete'
    // LLM interaction phase
    | 'llm-request-sent'
    | 'llm-response-received'
    | 'llm-parsing-complete'
    // Verification phase
    | 'verification-start'
    | 'verification-complete'
    // User review phase
    | 'user-review-pending'
    | 'user-review-complete'
    // Overall workflow
    | 'workflow-start'
    | 'workflow-complete'
    | 'workflow-error';

/**
 * A recorded milestone event
 */
export interface MilestoneEvent {
    /** The milestone that was reached */
    milestone: Milestone;

    /** Timestamp in milliseconds */
    timestamp: number;

    /** Trace ID for correlation */
    traceId: string;

    /** Additional metadata */
    metadata: Record<string, unknown>;
}

/**
 * Timing data between milestones
 */
export interface MilestoneTimings {
    /** Total workflow duration */
    totalDurationMs?: number;

    /** Discovery phase duration */
    discoveryMs?: number;

    /** Assignment phase duration */
    assignmentMs?: number;

    /** Routing phase duration */
    routingMs?: number;

    /** Tool execution duration */
    toolExecutionMs?: number;

    /** LLM request-response duration */
    llmRoundtripMs?: number;

    /** LLM parsing duration */
    llmParsingMs?: number;

    /** Verification duration */
    verificationMs?: number;

    /** Time waiting for user review */
    userReviewMs?: number;
}

/**
 * Aggregated timing statistics
 */
export interface TimingStatistics {
    /** Number of samples */
    count: number;

    /** Average duration in ms */
    avgMs: number;

    /** Minimum duration */
    minMs: number;

    /** Maximum duration */
    maxMs: number;

    /** 50th percentile */
    p50Ms: number;

    /** 95th percentile */
    p95Ms: number;
}

// =============================================================================
// MILESTONE TRACKER CLASS
// =============================================================================

/**
 * Tracks milestones across workflow executions
 */
export class MilestoneTracker {
    private events: Map<string, MilestoneEvent[]> = new Map();
    private maxTraces = 100;

    /**
     * Record a milestone event
     */
    record(
        traceId: string,
        milestone: Milestone,
        metadata: Record<string, unknown> = {},
    ): void {
        const event: MilestoneEvent = {
            milestone,
            timestamp: Date.now(),
            traceId,
            metadata,
        };

        if (!this.events.has(traceId)) {
            this.events.set(traceId, []);
            this.pruneOldTraces();
        }

        this.events.get(traceId)!.push(event);

        // Log the milestone
        logger.debug('orchestration', `Milestone: ${milestone}`, {
            traceId,
            ...metadata,
        });
    }

    /**
     * Get all events for a trace
     */
    getEvents(traceId: string): MilestoneEvent[] {
        return this.events.get(traceId) || [];
    }

    /**
     * Calculate timings between milestones for a trace
     */
    getTimings(traceId: string): MilestoneTimings {
        const events = this.events.get(traceId);
        if (!events || events.length === 0) {
            return {};
        }

        const timings: MilestoneTimings = {};
        const eventMap = new Map<Milestone, number>();

        for (const event of events) {
            eventMap.set(event.milestone, event.timestamp);
        }

        // Calculate phase durations
        timings.discoveryMs = this.calculateDuration(eventMap, 'discovery-start', 'discovery-complete');
        timings.assignmentMs = this.calculateDuration(eventMap, 'assignment-start', 'assignment-complete');
        timings.routingMs = this.calculateDuration(eventMap, 'routing-start', 'routing-complete');
        timings.toolExecutionMs = this.calculateDuration(eventMap, 'tool-execution-start', 'tool-execution-complete');
        timings.llmRoundtripMs = this.calculateDuration(eventMap, 'llm-request-sent', 'llm-response-received');
        timings.llmParsingMs = this.calculateDuration(eventMap, 'llm-response-received', 'llm-parsing-complete');
        timings.verificationMs = this.calculateDuration(eventMap, 'verification-start', 'verification-complete');
        timings.userReviewMs = this.calculateDuration(eventMap, 'user-review-pending', 'user-review-complete');
        timings.totalDurationMs = this.calculateDuration(eventMap, 'workflow-start', 'workflow-complete');

        return timings;
    }

    /**
     * Get average timings across all traces
     */
    getAverageTimings(): MilestoneTimings {
        const allTimings: MilestoneTimings[] = [];

        for (const traceId of this.events.keys()) {
            allTimings.push(this.getTimings(traceId));
        }

        if (allTimings.length === 0) {
            return {};
        }

        return {
            discoveryMs: this.averageField(allTimings, 'discoveryMs'),
            assignmentMs: this.averageField(allTimings, 'assignmentMs'),
            routingMs: this.averageField(allTimings, 'routingMs'),
            toolExecutionMs: this.averageField(allTimings, 'toolExecutionMs'),
            llmRoundtripMs: this.averageField(allTimings, 'llmRoundtripMs'),
            llmParsingMs: this.averageField(allTimings, 'llmParsingMs'),
            verificationMs: this.averageField(allTimings, 'verificationMs'),
            userReviewMs: this.averageField(allTimings, 'userReviewMs'),
            totalDurationMs: this.averageField(allTimings, 'totalDurationMs'),
        };
    }

    /**
     * Get statistics for a specific timing metric
     */
    getStatistics(metric: keyof MilestoneTimings): TimingStatistics | null {
        const values: number[] = [];

        for (const traceId of this.events.keys()) {
            const timings = this.getTimings(traceId);
            const value = timings[metric];
            if (value !== undefined) {
                values.push(value);
            }
        }

        if (values.length === 0) {
            return null;
        }

        values.sort((a, b) => a - b);

        return {
            count: values.length,
            avgMs: values.reduce((a, b) => a + b, 0) / values.length,
            minMs: values[0],
            maxMs: values[values.length - 1],
            p50Ms: this.percentile(values, 50),
            p95Ms: this.percentile(values, 95),
        };
    }

    /**
     * Get a summary of all timing statistics
     */
    getSummary(): Record<string, TimingStatistics | null> {
        const metrics: (keyof MilestoneTimings)[] = [
            'discoveryMs',
            'assignmentMs',
            'routingMs',
            'toolExecutionMs',
            'llmRoundtripMs',
            'llmParsingMs',
            'verificationMs',
            'userReviewMs',
            'totalDurationMs',
        ];

        const summary: Record<string, TimingStatistics | null> = {};

        for (const metric of metrics) {
            summary[metric] = this.getStatistics(metric);
        }

        return summary;
    }

    /**
     * Create a workflow tracker for a specific trace
     */
    createWorkflowTracker(traceId: string): WorkflowTracker {
        return new WorkflowTracker(this, traceId);
    }

    /**
     * Clear all recorded events
     */
    clear(): void {
        this.events.clear();
    }

    /**
     * Get number of tracked traces
     */
    getTraceCount(): number {
        return this.events.size;
    }

    // =========================================================================
    // PRIVATE METHODS
    // =========================================================================

    private calculateDuration(
        eventMap: Map<Milestone, number>,
        start: Milestone,
        end: Milestone,
    ): number | undefined {
        const startTime = eventMap.get(start);
        const endTime = eventMap.get(end);

        if (startTime !== undefined && endTime !== undefined) {
            return endTime - startTime;
        }

        return undefined;
    }

    private averageField(timings: MilestoneTimings[], field: keyof MilestoneTimings): number | undefined {
        const values = timings
            .map(t => t[field])
            .filter((v): v is number => v !== undefined);

        if (values.length === 0) {
            return undefined;
        }

        return values.reduce((a, b) => a + b, 0) / values.length;
    }

    private percentile(sortedValues: number[], p: number): number {
        const index = Math.ceil((p / 100) * sortedValues.length) - 1;
        return sortedValues[Math.max(0, index)];
    }

    private pruneOldTraces(): void {
        if (this.events.size > this.maxTraces) {
            // Remove oldest traces
            const toRemove = this.events.size - this.maxTraces;
            const keys = Array.from(this.events.keys());
            for (let i = 0; i < toRemove; i++) {
                this.events.delete(keys[i]);
            }
        }
    }
}

// =============================================================================
// WORKFLOW TRACKER CLASS
// =============================================================================

/**
 * Convenience class for tracking a single workflow
 */
export class WorkflowTracker {
    private tracker: MilestoneTracker;
    private traceId: string;
    private traceContext: TraceContext;

    constructor(tracker: MilestoneTracker, traceId: string) {
        this.tracker = tracker;
        this.traceId = traceId;
        this.traceContext = {
            traceId,
            spanId: `span-${Date.now()}`,
        };
    }

    /**
     * Get the trace context for logging
     */
    getTraceContext(): TraceContext {
        return this.traceContext;
    }

    /**
     * Record a milestone
     */
    record(milestone: Milestone, metadata: Record<string, unknown> = {}): void {
        this.tracker.record(this.traceId, milestone, metadata);
    }

    /**
     * Start the workflow
     */
    start(metadata: Record<string, unknown> = {}): void {
        this.record('workflow-start', metadata);
    }

    /**
     * Complete the workflow successfully
     */
    complete(metadata: Record<string, unknown> = {}): void {
        this.record('workflow-complete', metadata);
    }

    /**
     * Mark workflow as errored
     */
    error(error: Error, metadata: Record<string, unknown> = {}): void {
        this.record('workflow-error', {
            ...metadata,
            errorName: error.name,
            errorMessage: error.message,
        });
    }

    /**
     * Get timings for this workflow
     */
    getTimings(): MilestoneTimings {
        return this.tracker.getTimings(this.traceId);
    }

    /**
     * Create a phase tracker for discovery
     */
    discovery(): PhaseTracker {
        return new PhaseTracker(this, 'discovery-start', 'discovery-complete');
    }

    /**
     * Create a phase tracker for assignment
     */
    assignment(): PhaseTracker {
        return new PhaseTracker(this, 'assignment-start', 'assignment-complete');
    }

    /**
     * Create a phase tracker for routing
     */
    routing(): PhaseTracker {
        return new PhaseTracker(this, 'routing-start', 'routing-complete');
    }

    /**
     * Create a phase tracker for tool execution
     */
    toolExecution(): PhaseTracker {
        return new PhaseTracker(this, 'tool-execution-start', 'tool-execution-complete');
    }

    /**
     * Create a phase tracker for LLM interaction
     */
    llmRequest(): LLMPhaseTracker {
        return new LLMPhaseTracker(this);
    }

    /**
     * Create a phase tracker for verification
     */
    verification(): PhaseTracker {
        return new PhaseTracker(this, 'verification-start', 'verification-complete');
    }

    /**
     * Create a phase tracker for user review
     */
    userReview(): PhaseTracker {
        return new PhaseTracker(this, 'user-review-pending', 'user-review-complete');
    }
}

/**
 * Tracks a single phase with start/end
 */
export class PhaseTracker {
    private workflow: WorkflowTracker;
    private startMilestone: Milestone;
    private endMilestone: Milestone;

    constructor(workflow: WorkflowTracker, start: Milestone, end: Milestone) {
        this.workflow = workflow;
        this.startMilestone = start;
        this.endMilestone = end;
    }

    start(metadata: Record<string, unknown> = {}): void {
        this.workflow.record(this.startMilestone, metadata);
    }

    complete(metadata: Record<string, unknown> = {}): void {
        this.workflow.record(this.endMilestone, metadata);
    }
}

/**
 * Special tracker for LLM request/response/parsing phases
 */
export class LLMPhaseTracker {
    private workflow: WorkflowTracker;

    constructor(workflow: WorkflowTracker) {
        this.workflow = workflow;
    }

    sent(metadata: Record<string, unknown> = {}): void {
        this.workflow.record('llm-request-sent', metadata);
    }

    received(metadata: Record<string, unknown> = {}): void {
        this.workflow.record('llm-response-received', metadata);
    }

    parsed(metadata: Record<string, unknown> = {}): void {
        this.workflow.record('llm-parsing-complete', metadata);
    }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

/**
 * Default milestone tracker instance
 */
export const milestoneTracker = new MilestoneTracker();
