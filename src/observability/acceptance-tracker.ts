/**
 * Acceptance Tracker for Doc Doctor
 *
 * Tracks user acceptance/rejection of suggestions to enable
 * learning and quality improvement over time.
 */

import type { LLMProvider, SuggestedStub } from '../llm/llm-types';
import type { VectorFamily } from '../stubs/stubs-types';
import { logger } from './logger';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Action taken on a suggestion
 */
export type SuggestionAction = 'accepted' | 'rejected' | 'modified' | 'deferred';

/**
 * Rejection reason category
 */
export type RejectionReason =
    | 'irrelevant'        // Suggestion not applicable to document
    | 'incorrect'         // Factually or logically wrong
    | 'duplicate'         // Already covered elsewhere
    | 'too_vague'         // Not actionable
    | 'wrong_location'    // Right idea, wrong place
    | 'wrong_type'        // Should be different stub type
    | 'low_priority'      // Valid but not important
    | 'other';            // User-specified reason

/**
 * Recorded acceptance event
 */
export interface AcceptanceEvent {
    /** Event ID */
    id: string;

    /** Timestamp */
    timestamp: string;

    /** Document path */
    documentPath: string;

    /** The suggestion */
    suggestion: SuggestedStub;

    /** Stub type */
    stubType: string;

    /** Vector family (if known) */
    vectorFamily?: VectorFamily;

    /** Creativity mode used */
    creativityMode?: string;

    /** Provider that generated the suggestion */
    provider: LLMProvider;

    /** Model used */
    model: string;

    /** Action taken */
    action: SuggestionAction;

    /** Rejection reason (if rejected) */
    rejectionReason?: RejectionReason;

    /** User-provided reason text */
    reasonText?: string;

    /** Modified version (if modified) */
    modifiedSuggestion?: Partial<SuggestedStub>;

    /** Time spent reviewing (ms) */
    reviewTimeMs?: number;

    /** Session ID for grouping */
    sessionId?: string;
}

/**
 * Aggregated acceptance statistics
 */
export interface AcceptanceStats {
    /** Total events */
    totalEvents: number;

    /** Acceptance rate overall */
    acceptanceRate: number;

    /** Rejection rate */
    rejectionRate: number;

    /** Modification rate */
    modificationRate: number;

    /** By stub type */
    byStubType: Record<string, TypeStats>;

    /** By vector family */
    byVectorFamily: Record<VectorFamily, TypeStats>;

    /** By provider */
    byProvider: Record<LLMProvider, TypeStats>;

    /** By creativity mode */
    byCreativityMode: Record<string, TypeStats>;

    /** Rejection reasons distribution */
    rejectionReasons: Record<RejectionReason, number>;

    /** Average review time */
    avgReviewTimeMs: number;
}

/**
 * Statistics for a single dimension
 */
export interface TypeStats {
    total: number;
    accepted: number;
    rejected: number;
    modified: number;
    acceptanceRate: number;
}

/**
 * Tracker configuration
 */
export interface AcceptanceTrackerConfig {
    /** Maximum events to store */
    maxEvents: number;

    /** Whether to persist events */
    persistEvents: boolean;

    /** Log acceptance events */
    logEvents: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Default tracker configuration
 */
export const DEFAULT_TRACKER_CONFIG: AcceptanceTrackerConfig = {
    maxEvents: 1000,
    persistEvents: true,
    logEvents: true,
};

// =============================================================================
// ACCEPTANCE TRACKER CLASS
// =============================================================================

/**
 * Tracks suggestion acceptance/rejection
 */
export class AcceptanceTracker {
    private config: AcceptanceTrackerConfig;
    private events: AcceptanceEvent[] = [];

    constructor(config: Partial<AcceptanceTrackerConfig> = {}) {
        this.config = { ...DEFAULT_TRACKER_CONFIG, ...config };
    }

    // =========================================================================
    // EVENT RECORDING
    // =========================================================================

    /**
     * Record an acceptance event
     */
    recordAcceptance(data: {
        documentPath: string;
        suggestion: SuggestedStub;
        vectorFamily?: VectorFamily;
        creativityMode?: string;
        provider: LLMProvider;
        model: string;
        reviewTimeMs?: number;
        sessionId?: string;
    }): AcceptanceEvent {
        const event: AcceptanceEvent = {
            id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: new Date().toISOString(),
            action: 'accepted',
            stubType: data.suggestion.type,
            ...data,
        };

        this.addEvent(event);
        return event;
    }

    /**
     * Record a rejection event
     */
    recordRejection(data: {
        documentPath: string;
        suggestion: SuggestedStub;
        vectorFamily?: VectorFamily;
        creativityMode?: string;
        provider: LLMProvider;
        model: string;
        rejectionReason: RejectionReason;
        reasonText?: string;
        reviewTimeMs?: number;
        sessionId?: string;
    }): AcceptanceEvent {
        const event: AcceptanceEvent = {
            id: `rej-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: new Date().toISOString(),
            action: 'rejected',
            stubType: data.suggestion.type,
            ...data,
        };

        this.addEvent(event);
        return event;
    }

    /**
     * Record a modification event
     */
    recordModification(data: {
        documentPath: string;
        suggestion: SuggestedStub;
        modifiedSuggestion: Partial<SuggestedStub>;
        vectorFamily?: VectorFamily;
        creativityMode?: string;
        provider: LLMProvider;
        model: string;
        reviewTimeMs?: number;
        sessionId?: string;
    }): AcceptanceEvent {
        const event: AcceptanceEvent = {
            id: `mod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: new Date().toISOString(),
            action: 'modified',
            stubType: data.suggestion.type,
            ...data,
        };

        this.addEvent(event);
        return event;
    }

    /**
     * Record a deferred event (user skipped for now)
     */
    recordDeferred(data: {
        documentPath: string;
        suggestion: SuggestedStub;
        vectorFamily?: VectorFamily;
        creativityMode?: string;
        provider: LLMProvider;
        model: string;
        reviewTimeMs?: number;
        sessionId?: string;
    }): AcceptanceEvent {
        const event: AcceptanceEvent = {
            id: `def-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: new Date().toISOString(),
            action: 'deferred',
            stubType: data.suggestion.type,
            ...data,
        };

        this.addEvent(event);
        return event;
    }

    /**
     * Add event to storage
     */
    private addEvent(event: AcceptanceEvent): void {
        this.events.push(event);

        // Trim to max size
        if (this.events.length > this.config.maxEvents) {
            this.events = this.events.slice(-this.config.maxEvents);
        }

        if (this.config.logEvents) {
            logger.info('user-action', `Suggestion ${event.action}`, {
                eventId: event.id,
                stubType: event.stubType,
                provider: event.provider,
                action: event.action,
                rejectionReason: event.rejectionReason,
            });
        }
    }

    // =========================================================================
    // STATISTICS
    // =========================================================================

    /**
     * Get acceptance statistics
     */
    getStats(filter?: {
        since?: Date;
        documentPath?: string;
        provider?: LLMProvider;
        creativityMode?: string;
    }): AcceptanceStats {
        let events = this.events;

        // Apply filters
        if (filter) {
            events = events.filter(e => {
                if (filter.since && new Date(e.timestamp) < filter.since) return false;
                if (filter.documentPath && e.documentPath !== filter.documentPath) return false;
                if (filter.provider && e.provider !== filter.provider) return false;
                if (filter.creativityMode && e.creativityMode !== filter.creativityMode) return false;
                return true;
            });
        }

        if (events.length === 0) {
            return this.emptyStats();
        }

        // Calculate overall rates
        const accepted = events.filter(e => e.action === 'accepted').length;
        const rejected = events.filter(e => e.action === 'rejected').length;
        const modified = events.filter(e => e.action === 'modified').length;

        // By stub type
        const byStubType = this.aggregateBy(events, e => e.stubType);

        // By vector family
        const byVectorFamily = this.aggregateBy(
            events.filter(e => e.vectorFamily),
            e => e.vectorFamily!,
        );

        // By provider
        const byProvider = this.aggregateBy(events, e => e.provider);

        // By creativity mode
        const byCreativityMode = this.aggregateBy(
            events.filter(e => e.creativityMode),
            e => e.creativityMode!,
        );

        // Rejection reasons
        const rejectionReasons: Record<string, number> = {
            irrelevant: 0,
            incorrect: 0,
            duplicate: 0,
            too_vague: 0,
            wrong_location: 0,
            wrong_type: 0,
            low_priority: 0,
            other: 0,
        };
        for (const event of events) {
            if (event.action === 'rejected' && event.rejectionReason) {
                rejectionReasons[event.rejectionReason]++;
            }
        }

        // Average review time
        const eventsWithTime = events.filter(e => e.reviewTimeMs !== undefined);
        const avgReviewTimeMs = eventsWithTime.length > 0
            ? eventsWithTime.reduce((sum, e) => sum + e.reviewTimeMs!, 0) / eventsWithTime.length
            : 0;

        return {
            totalEvents: events.length,
            acceptanceRate: events.length > 0 ? accepted / events.length : 0,
            rejectionRate: events.length > 0 ? rejected / events.length : 0,
            modificationRate: events.length > 0 ? modified / events.length : 0,
            byStubType,
            byVectorFamily: byVectorFamily as Record<VectorFamily, TypeStats>,
            byProvider: byProvider as Record<LLMProvider, TypeStats>,
            byCreativityMode,
            rejectionReasons: rejectionReasons as Record<RejectionReason, number>,
            avgReviewTimeMs,
        };
    }

    /**
     * Aggregate events by a key
     */
    private aggregateBy<K extends string>(
        events: AcceptanceEvent[],
        keyFn: (e: AcceptanceEvent) => K,
    ): Record<K, TypeStats> {
        const groups: Record<string, AcceptanceEvent[]> = {};

        for (const event of events) {
            const key = keyFn(event);
            if (!groups[key]) groups[key] = [];
            groups[key].push(event);
        }

        const result: Record<string, TypeStats> = {};
        for (const [key, groupEvents] of Object.entries(groups)) {
            const accepted = groupEvents.filter(e => e.action === 'accepted').length;
            const rejected = groupEvents.filter(e => e.action === 'rejected').length;
            const modified = groupEvents.filter(e => e.action === 'modified').length;

            result[key] = {
                total: groupEvents.length,
                accepted,
                rejected,
                modified,
                acceptanceRate: groupEvents.length > 0 ? accepted / groupEvents.length : 0,
            };
        }

        return result as Record<K, TypeStats>;
    }

    /**
     * Create empty stats object
     */
    private emptyStats(): AcceptanceStats {
        return {
            totalEvents: 0,
            acceptanceRate: 0,
            rejectionRate: 0,
            modificationRate: 0,
            byStubType: {},
            byVectorFamily: {} as Record<VectorFamily, TypeStats>,
            byProvider: {} as Record<LLMProvider, TypeStats>,
            byCreativityMode: {},
            rejectionReasons: {
                irrelevant: 0,
                incorrect: 0,
                duplicate: 0,
                too_vague: 0,
                wrong_location: 0,
                wrong_type: 0,
                low_priority: 0,
                other: 0,
            },
            avgReviewTimeMs: 0,
        };
    }

    // =========================================================================
    // INSIGHTS
    // =========================================================================

    /**
     * Get insights about what's working and what's not
     */
    getInsights(): {
        bestPerformingTypes: Array<{ type: string; acceptanceRate: number }>;
        worstPerformingTypes: Array<{ type: string; acceptanceRate: number }>;
        mostCommonRejectionReasons: Array<{ reason: RejectionReason; count: number }>;
        providerRanking: Array<{ provider: LLMProvider; acceptanceRate: number }>;
        recommendations: string[];
    } {
        const stats = this.getStats();

        // Best/worst performing types
        const typeEntries = Object.entries(stats.byStubType)
            .filter(([_, s]) => s.total >= 5) // Minimum sample size
            .sort(([, a], [, b]) => b.acceptanceRate - a.acceptanceRate);

        const bestPerformingTypes = typeEntries.slice(0, 3).map(([type, s]) => ({
            type,
            acceptanceRate: s.acceptanceRate,
        }));

        const worstPerformingTypes = typeEntries.slice(-3).reverse().map(([type, s]) => ({
            type,
            acceptanceRate: s.acceptanceRate,
        }));

        // Most common rejection reasons
        const mostCommonRejectionReasons = Object.entries(stats.rejectionReasons)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([reason, count]) => ({ reason: reason as RejectionReason, count }));

        // Provider ranking
        const providerRanking = Object.entries(stats.byProvider)
            .sort(([, a], [, b]) => b.acceptanceRate - a.acceptanceRate)
            .map(([provider, s]) => ({
                provider: provider as LLMProvider,
                acceptanceRate: s.acceptanceRate,
            }));

        // Generate recommendations
        const recommendations: string[] = [];

        if (stats.acceptanceRate < 0.5) {
            recommendations.push('Overall acceptance rate is low - consider adjusting prompts or templates');
        }

        if (mostCommonRejectionReasons[0]?.reason === 'irrelevant') {
            recommendations.push('Many suggestions marked irrelevant - improve context awareness');
        }

        if (mostCommonRejectionReasons[0]?.reason === 'too_vague') {
            recommendations.push('Suggestions often too vague - request more specific recommendations');
        }

        if (worstPerformingTypes.length > 0 && worstPerformingTypes[0].acceptanceRate < 0.3) {
            recommendations.push(
                `"${worstPerformingTypes[0].type}" stubs have low acceptance - review type definition`,
            );
        }

        return {
            bestPerformingTypes,
            worstPerformingTypes,
            mostCommonRejectionReasons,
            providerRanking,
            recommendations,
        };
    }

    // =========================================================================
    // DATA MANAGEMENT
    // =========================================================================

    /**
     * Get all events
     */
    getAllEvents(): AcceptanceEvent[] {
        return [...this.events];
    }

    /**
     * Get events for a session
     */
    getSessionEvents(sessionId: string): AcceptanceEvent[] {
        return this.events.filter(e => e.sessionId === sessionId);
    }

    /**
     * Export events for persistence
     */
    exportEvents(): AcceptanceEvent[] {
        return [...this.events];
    }

    /**
     * Import events from persistence
     */
    importEvents(events: AcceptanceEvent[]): void {
        this.events = [...events];
        // Trim to max size
        if (this.events.length > this.config.maxEvents) {
            this.events = this.events.slice(-this.config.maxEvents);
        }
    }

    /**
     * Clear all events
     */
    clear(): void {
        this.events = [];
    }

    /**
     * Get event count
     */
    getEventCount(): number {
        return this.events.length;
    }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

/**
 * Default acceptance tracker instance
 */
export const acceptanceTracker = new AcceptanceTracker();
