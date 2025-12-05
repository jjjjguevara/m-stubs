/**
 * QA Sampling Strategy
 *
 * Implements power law (80/20) sampling for internal QA milestones.
 * Captures snapshots at exponentially increasing intervals to avoid
 * metadata explosion while maintaining statistical significance.
 */

import { logger } from './logger';

// =============================================================================
// QA MILESTONE EVENT TYPES
// =============================================================================

/**
 * QA milestone event types that trigger sampling
 */
export type QAMilestoneEvent =
    // Workflow events
    | 'workflow_completed'
    | 'workflow_failed'
    // Refinement events
    | 'refinement_quartile_change'
    | 'refinement_regression'
    // Acceptance events
    | 'acceptance_rate_inflection'
    | 'suggestion_batch_processed'
    // Document events
    | 'document_touch_power'
    | 'document_analyzed'
    | 'document_stubs_cleared'
    // Session events
    | 'session_started'
    | 'session_ended'
    | 'daily_summary'
    // Provider events
    | 'provider_switched'
    | 'provider_error_threshold'
    // Performance events
    | 'latency_spike'
    | 'cost_threshold';

/**
 * QA snapshot captured at a sampling point
 */
export interface QAMilestoneSnapshot {
    /** Event that triggered the snapshot */
    event: QAMilestoneEvent;
    /** Timestamp of capture */
    timestamp: number;
    /** Occurrence count for this event type */
    occurrenceNumber: number;
    /** Document path (if applicable) */
    documentPath?: string;
    /** Session ID */
    sessionId: string;
    /** Metrics at capture time */
    metrics: {
        // Quality metrics
        averageRefinement?: number;
        averageHealth?: number;
        groundingScore?: number;
        // Acceptance metrics
        acceptanceRate?: number;
        rejectionsByReason?: Record<string, number>;
        // Performance metrics
        averageLatencyMs?: number;
        totalTokensUsed?: number;
        estimatedCost?: number;
        // Volume metrics
        documentsAnalyzed?: number;
        suggestionsGenerated?: number;
        stubsResolved?: number;
    };
    /** Provider distribution at capture time */
    providerStats?: Record<
        string,
        {
            callCount: number;
            successRate: number;
            avgLatencyMs: number;
        }
    >;
    /** Stub type distribution */
    stubDistribution?: Record<string, number>;
}

// =============================================================================
// POWER LAW SAMPLING STRATEGY
// =============================================================================

/**
 * Power law checkpoints: 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1000
 * Then continues at 1000, 2000, 3000... (linear after 1000)
 */
const POWER_CHECKPOINTS = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1000];

/**
 * QA Sampling Strategy implementing 80/20 power law distribution
 */
export class QASamplingStrategy {
    /** Occurrence counters by metric key */
    private counters: Map<string, number> = new Map();

    /** Set of captured checkpoint keys to avoid duplicates */
    private capturedCheckpoints: Set<string> = new Set();

    /** Maximum snapshots to store per event type */
    private maxSnapshotsPerType: number;

    /** Stored snapshots */
    private snapshots: Map<QAMilestoneEvent, QAMilestoneSnapshot[]> = new Map();

    constructor(maxSnapshotsPerType = 50) {
        this.maxSnapshotsPerType = maxSnapshotsPerType;
    }

    /**
     * Check if we should capture a snapshot for this occurrence
     */
    shouldCapture(metricKey: string, currentValue: number): boolean {
        // Check power checkpoints
        if (POWER_CHECKPOINTS.includes(currentValue)) {
            const checkpointKey = `${metricKey}:${currentValue}`;
            if (!this.capturedCheckpoints.has(checkpointKey)) {
                this.capturedCheckpoints.add(checkpointKey);
                return true;
            }
        }

        // After 1000, capture every 1000
        if (currentValue > 1000 && currentValue % 1000 === 0) {
            const checkpointKey = `${metricKey}:${currentValue}`;
            if (!this.capturedCheckpoints.has(checkpointKey)) {
                this.capturedCheckpoints.add(checkpointKey);
                return true;
            }
        }

        return false;
    }

    /**
     * Increment counter for a metric and check if capture is needed
     */
    incrementAndCheck(event: QAMilestoneEvent, subKey?: string): { shouldCapture: boolean; count: number } {
        const key = subKey ? `${event}:${subKey}` : event;
        const current = this.counters.get(key) || 0;
        const next = current + 1;
        this.counters.set(key, next);

        return {
            shouldCapture: this.shouldCapture(key, next),
            count: next,
        };
    }

    /**
     * Record a snapshot
     */
    recordSnapshot(snapshot: QAMilestoneSnapshot): void {
        if (!this.snapshots.has(snapshot.event)) {
            this.snapshots.set(snapshot.event, []);
        }

        const eventSnapshots = this.snapshots.get(snapshot.event)!;
        eventSnapshots.push(snapshot);

        // Prune if over limit (keep most recent)
        if (eventSnapshots.length > this.maxSnapshotsPerType) {
            eventSnapshots.shift();
        }

        logger.debug('orchestration', `QA snapshot captured: ${snapshot.event} #${snapshot.occurrenceNumber}`, {
            event: snapshot.event,
            occurrence: snapshot.occurrenceNumber,
            documentPath: snapshot.documentPath,
        });
    }

    /**
     * Get all snapshots for an event type
     */
    getSnapshots(event: QAMilestoneEvent): QAMilestoneSnapshot[] {
        return this.snapshots.get(event) || [];
    }

    /**
     * Get all snapshots across all event types
     */
    getAllSnapshots(): QAMilestoneSnapshot[] {
        const all: QAMilestoneSnapshot[] = [];
        this.snapshots.forEach((snapshots) => {
            all.push(...snapshots);
        });
        return all.sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * Get counter value for a metric
     */
    getCount(event: QAMilestoneEvent, subKey?: string): number {
        const key = subKey ? `${event}:${subKey}` : event;
        return this.counters.get(key) || 0;
    }

    /**
     * Get all counters
     */
    getAllCounters(): Record<string, number> {
        const result: Record<string, number> = {};
        this.counters.forEach((value, key) => {
            result[key] = value;
        });
        return result;
    }

    /**
     * Export state for persistence
     */
    export(): QASamplerState {
        return {
            counters: Object.fromEntries(this.counters),
            capturedCheckpoints: Array.from(this.capturedCheckpoints),
            snapshots: Object.fromEntries(
                Array.from(this.snapshots.entries()).map(([k, v]) => [k, v]),
            ),
        };
    }

    /**
     * Import state from persistence
     */
    import(state: QASamplerState): void {
        this.counters = new Map(Object.entries(state.counters));
        this.capturedCheckpoints = new Set(state.capturedCheckpoints);
        this.snapshots = new Map(
            Object.entries(state.snapshots) as [QAMilestoneEvent, QAMilestoneSnapshot[]][],
        );
    }

    /**
     * Clear all state
     */
    clear(): void {
        this.counters.clear();
        this.capturedCheckpoints.clear();
        this.snapshots.clear();
    }

    /**
     * Get sampling statistics
     */
    getStats(): QASamplerStats {
        let totalSnapshots = 0;
        const snapshotsByEvent: Record<string, number> = {};

        this.snapshots.forEach((snapshots, event) => {
            totalSnapshots += snapshots.length;
            snapshotsByEvent[event] = snapshots.length;
        });

        return {
            totalCounters: this.counters.size,
            totalCheckpointsCaptured: this.capturedCheckpoints.size,
            totalSnapshots,
            snapshotsByEvent,
            counters: this.getAllCounters(),
        };
    }
}

// =============================================================================
// TYPES FOR PERSISTENCE
// =============================================================================

export interface QASamplerState {
    counters: Record<string, number>;
    capturedCheckpoints: string[];
    snapshots: Record<string, QAMilestoneSnapshot[]>;
}

export interface QASamplerStats {
    totalCounters: number;
    totalCheckpointsCaptured: number;
    totalSnapshots: number;
    snapshotsByEvent: Record<string, number>;
    counters: Record<string, number>;
}

// =============================================================================
// QA MILESTONE COLLECTOR
// =============================================================================

/**
 * Collector that integrates with other observability components
 * to create QA snapshots at appropriate intervals
 */
export class QAMilestoneCollector {
    private sampler: QASamplingStrategy;
    private sessionId: string;
    private metricsProvider: () => QAMilestoneSnapshot['metrics'];
    private providerStatsProvider?: () => QAMilestoneSnapshot['providerStats'];
    private stubDistributionProvider?: () => QAMilestoneSnapshot['stubDistribution'];

    constructor(options: {
        sampler?: QASamplingStrategy;
        sessionId?: string;
        metricsProvider: () => QAMilestoneSnapshot['metrics'];
        providerStatsProvider?: () => QAMilestoneSnapshot['providerStats'];
        stubDistributionProvider?: () => QAMilestoneSnapshot['stubDistribution'];
    }) {
        this.sampler = options.sampler || new QASamplingStrategy();
        this.sessionId = options.sessionId || `session-${Date.now()}`;
        this.metricsProvider = options.metricsProvider;
        this.providerStatsProvider = options.providerStatsProvider;
        this.stubDistributionProvider = options.stubDistributionProvider;
    }

    /**
     * Record an event and capture snapshot if at power checkpoint
     */
    recordEvent(event: QAMilestoneEvent, documentPath?: string, subKey?: string): void {
        const { shouldCapture, count } = this.sampler.incrementAndCheck(event, subKey);

        if (shouldCapture) {
            const snapshot: QAMilestoneSnapshot = {
                event,
                timestamp: Date.now(),
                occurrenceNumber: count,
                documentPath,
                sessionId: this.sessionId,
                metrics: this.metricsProvider(),
                providerStats: this.providerStatsProvider?.(),
                stubDistribution: this.stubDistributionProvider?.(),
            };

            this.sampler.recordSnapshot(snapshot);
        }
    }

    /**
     * Force capture a snapshot regardless of power law
     */
    forceCapture(event: QAMilestoneEvent, documentPath?: string): void {
        const count = this.sampler.getCount(event);

        const snapshot: QAMilestoneSnapshot = {
            event,
            timestamp: Date.now(),
            occurrenceNumber: count,
            documentPath,
            sessionId: this.sessionId,
            metrics: this.metricsProvider(),
            providerStats: this.providerStatsProvider?.(),
            stubDistribution: this.stubDistributionProvider?.(),
        };

        this.sampler.recordSnapshot(snapshot);
    }

    /**
     * Get the sampler for direct access
     */
    getSampler(): QASamplingStrategy {
        return this.sampler;
    }

    /**
     * Get session ID
     */
    getSessionId(): string {
        return this.sessionId;
    }

    /**
     * Start a new session
     */
    newSession(): void {
        this.sessionId = `session-${Date.now()}`;
        this.recordEvent('session_started');
    }

    /**
     * End current session
     */
    endSession(): void {
        this.forceCapture('session_ended');
    }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

/**
 * Default QA sampler instance
 */
export const qaSampler = new QASamplingStrategy();
