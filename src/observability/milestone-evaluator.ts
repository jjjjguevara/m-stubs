/**
 * Milestone Evaluator
 *
 * Evaluates milestone triggers and executes consequences.
 * Bridges user-defined milestones with the document and git systems.
 */

import { logger } from './logger';
import type {
    UserMilestoneConfig,
    MilestoneTrigger,
    ThresholdTrigger,
    EventCountTrigger,
    EventSequenceTrigger,
    CompositeTrigger,
    MilestoneConsequence,
    MilestoneTriggeredEvent,
    MilestoneHistoryEntry,
    SnapshotForm,
    GitOperation,
    GitSnapshotResult,
} from './milestone-settings';

// =============================================================================
// DOCUMENT STATE TYPE (for evaluation)
// =============================================================================

/**
 * Document state for trigger evaluation
 */
export interface DocumentState {
    path: string;
    refinement: number;
    health: number;
    stubCount: number;
    usefulnessMargin: number;
    potentialEnergy: number;
    audience?: string;
    origin?: string;
    form?: string;
    tags?: string[];
}

/**
 * Event counters for event-based triggers
 */
export interface EventCounters {
    suggestion_accepted: number;
    suggestion_rejected: number;
    stub_resolved: number;
    document_analyzed: number;
    workflow_completed: number;
    [key: string]: number;
}

/**
 * Event sequence tracker
 */
export interface EventSequenceTracker {
    events: Array<{ event: string; timestamp: number }>;
    maxSize: number;
}

// =============================================================================
// TRIGGER EVALUATION
// =============================================================================

/**
 * Result of trigger evaluation
 */
export interface TriggerEvalResult {
    matched: boolean;
    details: Record<string, unknown>;
}

/**
 * Evaluate a threshold trigger
 */
function evaluateThreshold(trigger: ThresholdTrigger, state: DocumentState): TriggerEvalResult {
    let value: number;
    switch (trigger.property) {
        case 'refinement':
            value = state.refinement;
            break;
        case 'health':
            value = state.health;
            break;
        case 'stub_count':
            value = state.stubCount;
            break;
        case 'usefulness_margin':
            value = state.usefulnessMargin;
            break;
        case 'potential_energy':
            value = state.potentialEnergy;
            break;
        default:
            return { matched: false, details: { error: 'Unknown property' } };
    }

    let matched: boolean;
    switch (trigger.operator) {
        case '>=':
            matched = value >= trigger.value;
            break;
        case '>':
            matched = value > trigger.value;
            break;
        case '<=':
            matched = value <= trigger.value;
            break;
        case '<':
            matched = value < trigger.value;
            break;
        case '==':
            matched = value === trigger.value;
            break;
        default:
            matched = false;
    }

    return {
        matched,
        details: {
            property: trigger.property,
            operator: trigger.operator,
            threshold: trigger.value,
            actual: value,
        },
    };
}

/**
 * Evaluate an event count trigger
 */
function evaluateEventCount(
    trigger: EventCountTrigger,
    counters: EventCounters,
    eventHistory: Array<{ event: string; timestamp: number }>,
): TriggerEvalResult {
    let count: number;

    if (trigger.windowHours) {
        // Count only events within time window
        const cutoff = Date.now() - trigger.windowHours * 60 * 60 * 1000;
        count = eventHistory.filter((e) => e.event === trigger.event && e.timestamp >= cutoff).length;
    } else {
        // Use all-time counter
        count = counters[trigger.event] || 0;
    }

    return {
        matched: count >= trigger.count,
        details: {
            event: trigger.event,
            required: trigger.count,
            actual: count,
            windowHours: trigger.windowHours,
        },
    };
}

/**
 * Evaluate an event sequence trigger
 */
function evaluateEventSequence(
    trigger: EventSequenceTrigger,
    eventHistory: Array<{ event: string; timestamp: number }>,
): TriggerEvalResult {
    // Find the sequence in history
    let seqIndex = 0;
    let lastMatchTime: number | null = null;

    for (const historyEvent of eventHistory) {
        const expected = trigger.sequence[seqIndex];
        if (historyEvent.event === expected.event) {
            // Check time gap if specified
            if (expected.maxGapMinutes && lastMatchTime !== null) {
                const gapMs = historyEvent.timestamp - lastMatchTime;
                const maxGapMs = expected.maxGapMinutes * 60 * 1000;
                if (gapMs > maxGapMs) {
                    // Gap too large, reset sequence
                    seqIndex = 0;
                    lastMatchTime = null;
                    continue;
                }
            }

            lastMatchTime = historyEvent.timestamp;
            seqIndex++;

            if (seqIndex >= trigger.sequence.length) {
                // Full sequence matched
                return {
                    matched: true,
                    details: {
                        sequence: trigger.sequence.map((s) => s.event),
                        matchedAt: historyEvent.timestamp,
                    },
                };
            }
        }
    }

    return {
        matched: false,
        details: {
            sequence: trigger.sequence.map((s) => s.event),
            progressIndex: seqIndex,
        },
    };
}

/**
 * Evaluate a composite trigger
 */
function evaluateComposite(
    trigger: CompositeTrigger,
    state: DocumentState,
    counters: EventCounters,
    eventHistory: Array<{ event: string; timestamp: number }>,
): TriggerEvalResult {
    const results = trigger.triggers.map((t) => evaluateTrigger(t, state, counters, eventHistory));

    const matched =
        trigger.operator === 'and' ? results.every((r) => r.matched) : results.some((r) => r.matched);

    return {
        matched,
        details: {
            operator: trigger.operator,
            childResults: results,
        },
    };
}

/**
 * Evaluate any trigger type
 */
export function evaluateTrigger(
    trigger: MilestoneTrigger,
    state: DocumentState,
    counters: EventCounters,
    eventHistory: Array<{ event: string; timestamp: number }>,
): TriggerEvalResult {
    switch (trigger.type) {
        case 'threshold':
            return evaluateThreshold(trigger, state);
        case 'event_count':
            return evaluateEventCount(trigger, counters, eventHistory);
        case 'event_sequence':
            return evaluateEventSequence(trigger, eventHistory);
        case 'composite':
            return evaluateComposite(trigger, state, counters, eventHistory);
        default:
            return { matched: false, details: { error: 'Unknown trigger type' } };
    }
}

// =============================================================================
// SCOPE MATCHING
// =============================================================================

/**
 * Check if a document matches milestone scope
 */
export function matchesScope(
    milestone: UserMilestoneConfig,
    documentPath: string,
    documentTags?: string[],
    documentProperties?: Record<string, unknown>,
): boolean {
    const scope = milestone.scope;

    switch (scope.mode) {
        case 'all':
            return true;

        case 'folder':
            if (!scope.folderPattern) return true;
            // Simple glob matching (supports * and **)
            const pattern = scope.folderPattern
                .replace(/\*\*/g, '.*')
                .replace(/\*/g, '[^/]*');
            return new RegExp(`^${pattern}`).test(documentPath);

        case 'tag':
            if (!scope.tag || !documentTags) return false;
            return documentTags.includes(scope.tag);

        case 'property':
            if (!scope.property || !documentProperties) return false;
            const propValue = documentProperties[scope.property.name];
            switch (scope.property.operator) {
                case '==':
                    return propValue === scope.property.value;
                case '!=':
                    return propValue !== scope.property.value;
                case 'contains':
                    return String(propValue).includes(scope.property.value || '');
                case 'exists':
                    return propValue !== undefined;
                default:
                    return false;
            }

        default:
            return false;
    }
}

// =============================================================================
// MESSAGE TEMPLATE RENDERING
// =============================================================================

/**
 * Render a message template with variables
 */
export function renderTemplate(
    template: string,
    variables: Record<string, string | number>,
): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return variables[key] !== undefined ? String(variables[key]) : match;
    });
}

// =============================================================================
// CONSEQUENCE APPLICATION
// =============================================================================

/**
 * Apply a consequence to document properties
 * Returns the mutations that should be applied
 */
export function applyConsequence(
    consequence: MilestoneConsequence,
    currentState: DocumentState & { tags?: string[]; links?: string[]; aliases?: string[] },
): { property: string; value: unknown } | null {
    switch (consequence.type) {
        case 'refinement_bump': {
            let newRefinement = currentState.refinement + consequence.delta;
            if (consequence.max !== undefined) {
                newRefinement = Math.min(newRefinement, consequence.max);
            }
            if (consequence.min !== undefined) {
                newRefinement = Math.max(newRefinement, consequence.min);
            }
            return { property: 'refinement', value: newRefinement };
        }

        case 'property_enum_change':
            return { property: consequence.property, value: consequence.value };

        case 'array_mutation': {
            const currentArray = currentState[consequence.property as keyof typeof currentState] as string[] || [];
            if (consequence.operation === 'add') {
                if (!currentArray.includes(consequence.value)) {
                    return { property: consequence.property, value: [...currentArray, consequence.value] };
                }
            } else if (consequence.operation === 'remove') {
                const filtered = currentArray.filter((v) => v !== consequence.value);
                if (filtered.length !== currentArray.length) {
                    return { property: consequence.property, value: filtered };
                }
            }
            return null;
        }

        case 'stub_mutation':
            // Stub mutations are handled separately
            return null;

        default:
            return null;
    }
}

// =============================================================================
// MILESTONE EVALUATOR CLASS
// =============================================================================

/**
 * Result from executeGitSnapshot callback
 */
export interface GitSnapshotCallbackResult {
    success: boolean;
    error?: string;
    /** Commit SHA if a commit was created */
    commitSha?: string;
    /** Branch name if a branch was created */
    branchName?: string;
    /** Tag name if a tag was created */
    tagName?: string;
    /** The rendered commit message used */
    commitMessage?: string;
}

/**
 * Callback interfaces for integrating with external systems
 */
export interface MilestoneCallbacks {
    /** Execute git snapshot */
    executeGitSnapshot?: (
        form: SnapshotForm,
        documentPath: string,
        variables: Record<string, string | number>,
    ) => Promise<GitSnapshotCallbackResult>;

    /** Apply document property change */
    applyPropertyChange?: (
        documentPath: string,
        property: string,
        value: unknown,
    ) => Promise<{ success: boolean; error?: string }>;

    /** Apply stub mutation */
    applyStubMutation?: (
        documentPath: string,
        filter: { type?: string; priority?: string; minAge?: number },
        mutation: { action: string; priority?: string; days?: number },
    ) => Promise<{ success: boolean; error?: string }>;
}

/**
 * Milestone Evaluator - main class for evaluating and executing milestones
 */
export class MilestoneEvaluator {
    private milestones: UserMilestoneConfig[] = [];
    private eventCounters: EventCounters = {} as EventCounters;
    private eventHistory: Array<{ event: string; timestamp: number }> = [];
    private history: MilestoneHistoryEntry[] = [];
    private lastTriggered: Map<string, number> = new Map(); // milestoneId -> timestamp
    private callbacks: MilestoneCallbacks;
    private maxHistorySize = 1000;

    constructor(milestones: UserMilestoneConfig[], callbacks: MilestoneCallbacks = {}) {
        this.milestones = milestones.filter((m) => m.enabled).sort((a, b) => a.priority - b.priority);
        this.callbacks = callbacks;
    }

    /**
     * Update milestone configurations
     */
    updateMilestones(milestones: UserMilestoneConfig[]): void {
        this.milestones = milestones.filter((m) => m.enabled).sort((a, b) => a.priority - b.priority);
    }

    /**
     * Record an event for event-based triggers
     */
    recordEvent(event: string): void {
        // Update counters
        this.eventCounters[event] = (this.eventCounters[event] || 0) + 1;

        // Update history
        this.eventHistory.push({ event, timestamp: Date.now() });

        // Prune old history
        if (this.eventHistory.length > this.maxHistorySize) {
            this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
        }
    }

    /**
     * Check if a milestone is in cooldown
     */
    private isInCooldown(milestone: UserMilestoneConfig): boolean {
        if (!milestone.repeatable || !milestone.cooldownHours) {
            return false;
        }

        const lastTriggeredTime = this.lastTriggered.get(milestone.id);
        if (!lastTriggeredTime) {
            return false;
        }

        const cooldownMs = milestone.cooldownHours * 60 * 60 * 1000;
        return Date.now() - lastTriggeredTime < cooldownMs;
    }

    /**
     * Evaluate all milestones for a document
     */
    async evaluate(
        documentPath: string,
        state: DocumentState,
        documentTags?: string[],
        documentProperties?: Record<string, unknown>,
    ): Promise<MilestoneTriggeredEvent[]> {
        const triggeredEvents: MilestoneTriggeredEvent[] = [];

        for (const milestone of this.milestones) {
            // Check scope
            if (!matchesScope(milestone, documentPath, documentTags, documentProperties)) {
                continue;
            }

            // Check cooldown
            if (this.isInCooldown(milestone)) {
                continue;
            }

            // Check if already triggered (for non-repeatable)
            if (!milestone.repeatable && this.history.some(
                (h) => h.milestoneId === milestone.id && h.documentPath === documentPath && h.success,
            )) {
                continue;
            }

            // Evaluate trigger
            const triggerResult = evaluateTrigger(
                milestone.trigger,
                state,
                this.eventCounters,
                this.eventHistory,
            );

            if (!triggerResult.matched) {
                continue;
            }

            // Milestone triggered!
            logger.info('orchestration', `Milestone triggered: ${milestone.name}`, {
                milestoneId: milestone.id,
                documentPath,
                triggerDetails: triggerResult.details,
            });

            // Execute snapshot
            const snapshotResult = await this.executeSnapshot(milestone, documentPath, state);

            // Execute consequences
            const consequenceResults = await this.executeConsequences(milestone, documentPath, state);

            // Record trigger
            this.lastTriggered.set(milestone.id, Date.now());

            const event: MilestoneTriggeredEvent = {
                milestone,
                documentPath,
                triggerResult: { matched: true, details: triggerResult.details },
                timestamp: Date.now(),
                actions: {
                    snapshot: snapshotResult,
                    consequences: consequenceResults,
                },
            };

            triggeredEvents.push(event);

            // Record in history (including git snapshot if available)
            this.history.push({
                milestoneId: milestone.id,
                milestoneName: milestone.name,
                documentPath,
                timestamp: Date.now(),
                success: !snapshotResult?.error && consequenceResults.every((c) => c.applied),
                error: snapshotResult?.error || consequenceResults.find((c) => c.error)?.error,
                gitSnapshot: snapshotResult?.gitSnapshot,
            });
        }

        return triggeredEvents;
    }

    /**
     * Execute git snapshot
     */
    private async executeSnapshot(
        milestone: UserMilestoneConfig,
        documentPath: string,
        state: DocumentState,
    ): Promise<{
        operation: GitOperation;
        success: boolean;
        error?: string;
        gitSnapshot?: GitSnapshotResult;
    } | undefined> {
        const form = milestone.snapshotForm;
        if (form.operation === 'none') {
            return undefined;
        }

        const variables = {
            document: documentPath.split('/').pop()?.replace('.md', '') || documentPath,
            refinement: state.refinement.toFixed(2),
            milestone: milestone.name,
            date: new Date().toISOString().split('T')[0],
        };

        if (this.callbacks.executeGitSnapshot) {
            const result = await this.callbacks.executeGitSnapshot(form, documentPath, variables);

            // Build GitSnapshotResult from callback result
            const gitSnapshot: GitSnapshotResult | undefined = result.success
                ? {
                      commitSha: result.commitSha,
                      branchName: result.branchName,
                      tagName: result.tagName,
                      commitMessage: result.commitMessage,
                      gitTimestamp: Date.now(),
                  }
                : undefined;

            return {
                operation: form.operation,
                success: result.success,
                error: result.error,
                gitSnapshot,
            };
        }

        return { operation: form.operation, success: false, error: 'Git callback not configured' };
    }

    /**
     * Execute consequences
     */
    private async executeConsequences(
        milestone: UserMilestoneConfig,
        documentPath: string,
        state: DocumentState,
    ): Promise<Array<{ consequence: MilestoneConsequence; applied: boolean; error?: string }>> {
        const results: Array<{ consequence: MilestoneConsequence; applied: boolean; error?: string }> = [];

        for (const consequence of milestone.consequences) {
            if (consequence.type === 'stub_mutation') {
                // Handle stub mutation
                if (this.callbacks.applyStubMutation) {
                    const mutation = consequence.mutation as { action: string; priority?: string; days?: number };
                    const result = await this.callbacks.applyStubMutation(
                        documentPath,
                        consequence.filter,
                        mutation,
                    );
                    results.push({ consequence, applied: result.success, error: result.error });
                } else {
                    results.push({ consequence, applied: false, error: 'Stub mutation callback not configured' });
                }
            } else {
                // Handle property change
                const change = applyConsequence(consequence, state);
                if (change && this.callbacks.applyPropertyChange) {
                    const result = await this.callbacks.applyPropertyChange(
                        documentPath,
                        change.property,
                        change.value,
                    );
                    results.push({ consequence, applied: result.success, error: result.error });
                } else if (!change) {
                    results.push({ consequence, applied: true }); // No change needed
                } else {
                    results.push({ consequence, applied: false, error: 'Property change callback not configured' });
                }
            }
        }

        return results;
    }

    /**
     * Get milestone history
     */
    getHistory(): MilestoneHistoryEntry[] {
        return [...this.history];
    }

    /**
     * Get event counters
     */
    getCounters(): EventCounters {
        return { ...this.eventCounters };
    }

    /**
     * Export state for persistence
     */
    export(): MilestoneEvaluatorState {
        return {
            eventCounters: this.eventCounters,
            eventHistory: this.eventHistory,
            history: this.history,
            lastTriggered: Object.fromEntries(this.lastTriggered),
        };
    }

    /**
     * Import state from persistence
     */
    import(state: MilestoneEvaluatorState): void {
        this.eventCounters = state.eventCounters;
        this.eventHistory = state.eventHistory;
        this.history = state.history;
        this.lastTriggered = new Map(Object.entries(state.lastTriggered));
    }

    /**
     * Clear all state
     */
    clear(): void {
        this.eventCounters = {} as EventCounters;
        this.eventHistory = [];
        this.history = [];
        this.lastTriggered.clear();
    }
}

// =============================================================================
// TYPES FOR PERSISTENCE
// =============================================================================

export interface MilestoneEvaluatorState {
    eventCounters: EventCounters;
    eventHistory: Array<{ event: string; timestamp: number }>;
    history: MilestoneHistoryEntry[];
    lastTriggered: Record<string, number>;
}
