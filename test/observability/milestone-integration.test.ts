/**
 * Milestone Integration Tests
 *
 * Tests data cascade through the dual-layer milestone system:
 * 1. User milestone triggers fire correctly
 * 2. QA snapshots follow power law distribution
 * 3. Data flows from triggers → consequences → callbacks
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    QASamplingStrategy,
    QAMilestoneCollector,
    type QAMilestoneSnapshot,
} from '../../src/observability/qa-sampler';
import {
    MilestoneEvaluator,
    evaluateTrigger,
    matchesScope,
    renderTemplate,
    applyConsequence,
    type DocumentState,
    type EventCounters,
    type MilestoneCallbacks,
} from '../../src/observability/milestone-evaluator';
import type {
    UserMilestoneConfig,
    MilestoneTrigger,
    ThresholdTrigger,
    EventCountTrigger,
    CompositeTrigger,
} from '../../src/observability/milestone-settings';

// =============================================================================
// QA SAMPLING TESTS
// =============================================================================

describe('QA Sampling Strategy', () => {
    let sampler: QASamplingStrategy;

    beforeEach(() => {
        sampler = new QASamplingStrategy();
    });

    describe('Power Law Checkpoints', () => {
        it('captures at power law checkpoints (1, 2, 4, 8, 16...)', () => {
            const captured: number[] = [];
            const powerCheckpoints = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1000];

            // Simulate 1000 events
            for (let i = 1; i <= 1000; i++) {
                if (sampler.shouldCapture('test_event', i)) {
                    captured.push(i);
                }
            }

            expect(captured).toEqual(powerCheckpoints);
        });

        it('captures every 1000 after first 1000', () => {
            const captured: number[] = [];

            // Skip to post-1000 range
            for (let i = 1001; i <= 5000; i++) {
                if (sampler.shouldCapture('post_1k_event', i)) {
                    captured.push(i);
                }
            }

            expect(captured).toEqual([2000, 3000, 4000, 5000]);
        });

        it('does not duplicate captures for same checkpoint', () => {
            // First capture at 1
            expect(sampler.shouldCapture('event', 1)).toBe(true);
            // Second check at 1 should not capture again
            expect(sampler.shouldCapture('event', 1)).toBe(false);
        });

        it('tracks different events independently', () => {
            expect(sampler.shouldCapture('event_a', 1)).toBe(true);
            expect(sampler.shouldCapture('event_b', 1)).toBe(true);
            expect(sampler.shouldCapture('event_a', 2)).toBe(true);
            expect(sampler.shouldCapture('event_b', 2)).toBe(true);
        });
    });

    describe('Snapshot Recording', () => {
        it('records and retrieves snapshots by event type', () => {
            const snapshot: QAMilestoneSnapshot = {
                event: 'workflow_completed',
                timestamp: Date.now(),
                occurrenceNumber: 1,
                sessionId: 'test-session',
                metrics: { averageRefinement: 0.5 },
            };

            sampler.recordSnapshot(snapshot);

            const retrieved = sampler.getSnapshots('workflow_completed');
            expect(retrieved).toHaveLength(1);
            expect(retrieved[0]).toEqual(snapshot);
        });

        it('enforces max snapshots per type', () => {
            const smallSampler = new QASamplingStrategy(3); // max 3 snapshots

            for (let i = 1; i <= 5; i++) {
                smallSampler.recordSnapshot({
                    event: 'document_analyzed',
                    timestamp: Date.now() + i,
                    occurrenceNumber: i,
                    sessionId: 'test',
                    metrics: {},
                });
            }

            const snapshots = smallSampler.getSnapshots('document_analyzed');
            expect(snapshots).toHaveLength(3);
            // Should keep most recent (3, 4, 5)
            expect(snapshots.map((s) => s.occurrenceNumber)).toEqual([3, 4, 5]);
        });

        it('aggregates all snapshots sorted by timestamp', () => {
            sampler.recordSnapshot({
                event: 'workflow_completed',
                timestamp: 3000,
                occurrenceNumber: 1,
                sessionId: 'test',
                metrics: {},
            });
            sampler.recordSnapshot({
                event: 'document_analyzed',
                timestamp: 1000,
                occurrenceNumber: 1,
                sessionId: 'test',
                metrics: {},
            });
            sampler.recordSnapshot({
                event: 'session_started',
                timestamp: 2000,
                occurrenceNumber: 1,
                sessionId: 'test',
                metrics: {},
            });

            const all = sampler.getAllSnapshots();
            expect(all).toHaveLength(3);
            expect(all.map((s) => s.timestamp)).toEqual([1000, 2000, 3000]);
        });
    });

    describe('State Export/Import', () => {
        it('exports and imports state correctly', () => {
            // Set up some state
            sampler.shouldCapture('event_a', 1);
            sampler.shouldCapture('event_a', 2);
            sampler.recordSnapshot({
                event: 'workflow_completed',
                timestamp: Date.now(),
                occurrenceNumber: 1,
                sessionId: 'test',
                metrics: { averageRefinement: 0.75 },
            });

            const exported = sampler.export();

            // Create new sampler and import
            const newSampler = new QASamplingStrategy();
            newSampler.import(exported);

            // Verify state was restored
            expect(newSampler.getSnapshots('workflow_completed')).toHaveLength(1);
            // Checkpoints should not re-capture
            expect(newSampler.shouldCapture('event_a', 1)).toBe(false);
            expect(newSampler.shouldCapture('event_a', 2)).toBe(false);
            // But new checkpoints should
            expect(newSampler.shouldCapture('event_a', 4)).toBe(true);
        });
    });

    describe('Statistics', () => {
        it('provides accurate statistics', () => {
            sampler.shouldCapture('event_a', 1);
            sampler.shouldCapture('event_b', 1);
            sampler.recordSnapshot({
                event: 'workflow_completed',
                timestamp: Date.now(),
                occurrenceNumber: 1,
                sessionId: 'test',
                metrics: {},
            });
            sampler.recordSnapshot({
                event: 'workflow_completed',
                timestamp: Date.now(),
                occurrenceNumber: 2,
                sessionId: 'test',
                metrics: {},
            });

            const stats = sampler.getStats();

            expect(stats.totalCheckpointsCaptured).toBe(2);
            expect(stats.totalSnapshots).toBe(2);
            expect(stats.snapshotsByEvent['workflow_completed']).toBe(2);
        });
    });
});

describe('QA Milestone Collector', () => {
    it('integrates sampling with metrics provider', () => {
        const sampler = new QASamplingStrategy();
        let metricsCallCount = 0;

        const collector = new QAMilestoneCollector({
            sampler,
            sessionId: 'test-session',
            metricsProvider: () => {
                metricsCallCount++;
                return {
                    averageRefinement: 0.5 + metricsCallCount * 0.1,
                    documentsAnalyzed: metricsCallCount,
                };
            },
        });

        // Record events - should capture at checkpoint 1
        collector.recordEvent('document_analyzed', '/test/doc.md');

        const snapshots = sampler.getSnapshots('document_analyzed');
        expect(snapshots).toHaveLength(1);
        expect(snapshots[0].documentPath).toBe('/test/doc.md');
        expect(snapshots[0].sessionId).toBe('test-session');
        expect(snapshots[0].metrics.documentsAnalyzed).toBe(1);
    });

    it('respects power law for event capture', () => {
        const sampler = new QASamplingStrategy();
        const collector = new QAMilestoneCollector({
            sampler,
            metricsProvider: () => ({}),
        });

        // Record 10 events
        for (let i = 0; i < 10; i++) {
            collector.recordEvent('suggestion_batch_processed');
        }

        // Should have captured at 1, 2, 4, 8
        const snapshots = sampler.getSnapshots('suggestion_batch_processed');
        expect(snapshots).toHaveLength(4);
        expect(snapshots.map((s) => s.occurrenceNumber)).toEqual([1, 2, 4, 8]);
    });

    it('force capture bypasses power law', () => {
        const sampler = new QASamplingStrategy();
        const collector = new QAMilestoneCollector({
            sampler,
            metricsProvider: () => ({ averageRefinement: 0.9 }),
        });

        collector.forceCapture('session_ended', '/test/doc.md');

        const snapshots = sampler.getSnapshots('session_ended');
        expect(snapshots).toHaveLength(1);
        expect(snapshots[0].documentPath).toBe('/test/doc.md');
    });
});

// =============================================================================
// TRIGGER EVALUATION TESTS
// =============================================================================

describe('Trigger Evaluation', () => {
    const defaultState: DocumentState = {
        path: '/test/doc.md',
        refinement: 0.7,
        health: 0.8,
        stubCount: 5,
        usefulnessMargin: 0.2,
        potentialEnergy: 0.5,
    };

    const emptyCounters: EventCounters = {
        suggestion_accepted: 0,
        suggestion_rejected: 0,
        stub_resolved: 0,
        document_analyzed: 0,
        workflow_completed: 0,
    };

    describe('Threshold Triggers', () => {
        it('evaluates >= correctly', () => {
            const trigger: ThresholdTrigger = {
                type: 'threshold',
                property: 'refinement',
                operator: '>=',
                value: 0.7,
            };

            const result = evaluateTrigger(trigger, defaultState, emptyCounters, []);
            expect(result.matched).toBe(true);
            expect(result.details.actual).toBe(0.7);
        });

        it('evaluates > correctly', () => {
            const trigger: ThresholdTrigger = {
                type: 'threshold',
                property: 'refinement',
                operator: '>',
                value: 0.7,
            };

            const result = evaluateTrigger(trigger, defaultState, emptyCounters, []);
            expect(result.matched).toBe(false);
        });

        it('evaluates == for stub_count', () => {
            const trigger: ThresholdTrigger = {
                type: 'threshold',
                property: 'stub_count',
                operator: '==',
                value: 0,
            };

            const result = evaluateTrigger(trigger, defaultState, emptyCounters, []);
            expect(result.matched).toBe(false);

            const zeroStubState = { ...defaultState, stubCount: 0 };
            const result2 = evaluateTrigger(trigger, zeroStubState, emptyCounters, []);
            expect(result2.matched).toBe(true);
        });

        it('evaluates all properties', () => {
            const properties = ['refinement', 'health', 'stub_count', 'usefulness_margin', 'potential_energy'];
            for (const prop of properties) {
                const trigger: ThresholdTrigger = {
                    type: 'threshold',
                    property: prop as ThresholdTrigger['property'],
                    operator: '>=',
                    value: 0,
                };

                const result = evaluateTrigger(trigger, defaultState, emptyCounters, []);
                expect(result.matched).toBe(true);
            }
        });
    });

    describe('Event Count Triggers', () => {
        it('matches when count threshold reached', () => {
            const trigger: EventCountTrigger = {
                type: 'event_count',
                event: 'suggestion_accepted',
                count: 5,
            };

            const counters = { ...emptyCounters, suggestion_accepted: 5 };
            const result = evaluateTrigger(trigger, defaultState, counters, []);
            expect(result.matched).toBe(true);
        });

        it('does not match when count below threshold', () => {
            const trigger: EventCountTrigger = {
                type: 'event_count',
                event: 'suggestion_accepted',
                count: 10,
            };

            const counters = { ...emptyCounters, suggestion_accepted: 5 };
            const result = evaluateTrigger(trigger, defaultState, counters, []);
            expect(result.matched).toBe(false);
        });

        it('respects time window', () => {
            const trigger: EventCountTrigger = {
                type: 'event_count',
                event: 'document_analyzed',
                count: 2,
                windowHours: 1,
            };

            const now = Date.now();
            const eventHistory = [
                { event: 'document_analyzed', timestamp: now - 30 * 60 * 1000 }, // 30 min ago
                { event: 'document_analyzed', timestamp: now - 45 * 60 * 1000 }, // 45 min ago
                { event: 'document_analyzed', timestamp: now - 2 * 60 * 60 * 1000 }, // 2 hours ago (outside window)
            ];

            const result = evaluateTrigger(trigger, defaultState, emptyCounters, eventHistory);
            expect(result.matched).toBe(true);
            expect(result.details.actual).toBe(2);
        });
    });

    describe('Composite Triggers', () => {
        it('AND requires all triggers to match', () => {
            const trigger: CompositeTrigger = {
                type: 'composite',
                operator: 'and',
                triggers: [
                    { type: 'threshold', property: 'refinement', operator: '>=', value: 0.7 },
                    { type: 'threshold', property: 'stub_count', operator: '==', value: 0 },
                ],
            };

            // stub_count is 5, not 0
            const result = evaluateTrigger(trigger, defaultState, emptyCounters, []);
            expect(result.matched).toBe(false);

            const zeroStubState = { ...defaultState, stubCount: 0 };
            const result2 = evaluateTrigger(trigger, zeroStubState, emptyCounters, []);
            expect(result2.matched).toBe(true);
        });

        it('OR requires at least one trigger to match', () => {
            const trigger: CompositeTrigger = {
                type: 'composite',
                operator: 'or',
                triggers: [
                    { type: 'threshold', property: 'refinement', operator: '>=', value: 0.9 }, // false
                    { type: 'threshold', property: 'health', operator: '>=', value: 0.8 }, // true
                ],
            };

            const result = evaluateTrigger(trigger, defaultState, emptyCounters, []);
            expect(result.matched).toBe(true);
        });
    });
});

// =============================================================================
// SCOPE MATCHING TESTS
// =============================================================================

describe('Scope Matching', () => {
    const baseMilestone: UserMilestoneConfig = {
        id: 'test',
        name: 'Test',
        enabled: true,
        trigger: { type: 'threshold', property: 'refinement', operator: '>=', value: 0.5 },
        snapshotForm: { operation: 'none', commitScope: 'document' },
        consequences: [],
        scope: { mode: 'all' },
        repeatable: false,
        priority: 1,
    };

    it('all scope matches everything', () => {
        const milestone = { ...baseMilestone, scope: { mode: 'all' as const } };
        expect(matchesScope(milestone, '/any/path.md')).toBe(true);
    });

    it('folder scope uses glob matching', () => {
        const milestone = {
            ...baseMilestone,
            scope: { mode: 'folder' as const, folderPattern: 'projects/**' },
        };

        expect(matchesScope(milestone, 'projects/doc.md')).toBe(true);
        expect(matchesScope(milestone, 'projects/deep/nested/doc.md')).toBe(true);
        expect(matchesScope(milestone, 'other/doc.md')).toBe(false);
    });

    it('tag scope matches documents with tag', () => {
        const milestone = {
            ...baseMilestone,
            scope: { mode: 'tag' as const, tag: 'publish' },
        };

        expect(matchesScope(milestone, '/doc.md', ['draft', 'publish'])).toBe(true);
        expect(matchesScope(milestone, '/doc.md', ['draft'])).toBe(false);
        expect(matchesScope(milestone, '/doc.md', undefined)).toBe(false);
    });

    it('property scope with operators', () => {
        const milestone = {
            ...baseMilestone,
            scope: {
                mode: 'property' as const,
                property: { name: 'audience', operator: '==' as const, value: 'public' },
            },
        };

        expect(matchesScope(milestone, '/doc.md', [], { audience: 'public' })).toBe(true);
        expect(matchesScope(milestone, '/doc.md', [], { audience: 'internal' })).toBe(false);
    });
});

// =============================================================================
// TEMPLATE RENDERING TESTS
// =============================================================================

describe('Template Rendering', () => {
    it('replaces variables in template', () => {
        const template = 'milestone: {{document}} at r={{refinement}} on {{date}}';
        const result = renderTemplate(template, {
            document: 'my-doc',
            refinement: '0.75',
            date: '2025-12-05',
        });

        expect(result).toBe('milestone: my-doc at r=0.75 on 2025-12-05');
    });

    it('leaves unknown variables unchanged', () => {
        const template = '{{known}} and {{unknown}}';
        const result = renderTemplate(template, { known: 'value' });
        expect(result).toBe('value and {{unknown}}');
    });
});

// =============================================================================
// CONSEQUENCE APPLICATION TESTS
// =============================================================================

describe('Consequence Application', () => {
    const baseState: DocumentState = {
        path: '/test/doc.md',
        refinement: 0.5,
        health: 0.6,
        stubCount: 3,
        usefulnessMargin: 0.1,
        potentialEnergy: 0.4,
        tags: ['draft'],
    };

    it('refinement bump adds delta', () => {
        const consequence = { type: 'refinement_bump' as const, delta: 0.1 };
        const result = applyConsequence(consequence, baseState);
        expect(result).toEqual({ property: 'refinement', value: 0.6 });
    });

    it('refinement bump respects max', () => {
        const consequence = { type: 'refinement_bump' as const, delta: 0.8, max: 1.0 };
        const result = applyConsequence(consequence, baseState);
        expect(result).toEqual({ property: 'refinement', value: 1.0 });
    });

    it('refinement bump respects min', () => {
        const consequence = { type: 'refinement_bump' as const, delta: -1.0, min: 0 };
        const result = applyConsequence(consequence, baseState);
        expect(result).toEqual({ property: 'refinement', value: 0 });
    });

    it('property enum change sets value', () => {
        const consequence = { type: 'property_enum_change' as const, property: 'audience' as const, value: 'public' };
        const result = applyConsequence(consequence, baseState);
        expect(result).toEqual({ property: 'audience', value: 'public' });
    });

    it('array mutation adds value', () => {
        const consequence = {
            type: 'array_mutation' as const,
            property: 'tags' as const,
            operation: 'add' as const,
            value: 'published',
        };
        const result = applyConsequence(consequence, baseState);
        expect(result).toEqual({ property: 'tags', value: ['draft', 'published'] });
    });

    it('array mutation removes value', () => {
        const consequence = {
            type: 'array_mutation' as const,
            property: 'tags' as const,
            operation: 'remove' as const,
            value: 'draft',
        };
        const result = applyConsequence(consequence, baseState);
        expect(result).toEqual({ property: 'tags', value: [] });
    });

    it('array mutation does not duplicate adds', () => {
        const consequence = {
            type: 'array_mutation' as const,
            property: 'tags' as const,
            operation: 'add' as const,
            value: 'draft', // already exists
        };
        const result = applyConsequence(consequence, baseState);
        expect(result).toBeNull();
    });
});

// =============================================================================
// MILESTONE EVALUATOR INTEGRATION TESTS
// =============================================================================

describe('Milestone Evaluator', () => {
    const publicationMilestone: UserMilestoneConfig = {
        id: 'publication-ready',
        name: 'Publication Ready',
        enabled: true,
        trigger: {
            type: 'composite',
            operator: 'and',
            triggers: [
                { type: 'threshold', property: 'refinement', operator: '>=', value: 0.9 },
                { type: 'threshold', property: 'stub_count', operator: '==', value: 0 },
            ],
        },
        snapshotForm: {
            operation: 'commit',
            messageTemplate: 'publish: {{document}}',
            commitScope: 'document',
        },
        consequences: [
            { type: 'property_enum_change', property: 'audience', value: 'public' },
            { type: 'array_mutation', property: 'tags', operation: 'add', value: 'published' },
        ],
        scope: { mode: 'all' },
        repeatable: false,
        priority: 1,
    };

    it('evaluates milestones and calls callbacks', async () => {
        const gitCallback = vi.fn().mockResolvedValue({ success: true });
        const propertyCallback = vi.fn().mockResolvedValue({ success: true });

        const evaluator = new MilestoneEvaluator([publicationMilestone], {
            executeGitSnapshot: gitCallback,
            applyPropertyChange: propertyCallback,
        });

        const state: DocumentState = {
            path: '/test/doc.md',
            refinement: 0.95,
            health: 0.9,
            stubCount: 0,
            usefulnessMargin: 0.3,
            potentialEnergy: 0.2,
            tags: [],
        };

        const events = await evaluator.evaluate('/test/doc.md', state);

        expect(events).toHaveLength(1);
        expect(events[0].milestone.id).toBe('publication-ready');

        // Git callback should be called
        expect(gitCallback).toHaveBeenCalledWith(
            publicationMilestone.snapshotForm,
            '/test/doc.md',
            expect.objectContaining({ document: 'doc', refinement: '0.95' }),
        );

        // Property callbacks should be called for consequences
        expect(propertyCallback).toHaveBeenCalledTimes(2);
    });

    it('respects non-repeatable milestones', async () => {
        // Use milestone with no git operation and no consequences so it's marked successful
        const nonRepeatableMilestone: UserMilestoneConfig = {
            id: 'non-repeatable-test',
            name: 'Non-Repeatable Test',
            enabled: true,
            trigger: {
                type: 'threshold',
                property: 'refinement',
                operator: '>=',
                value: 0.9,
            },
            snapshotForm: { operation: 'none', commitScope: 'document' },
            consequences: [], // No consequences = success
            scope: { mode: 'all' },
            repeatable: false,
            priority: 1,
        };

        const evaluator = new MilestoneEvaluator([nonRepeatableMilestone], {});

        const state: DocumentState = {
            path: '/test/doc.md',
            refinement: 0.95,
            health: 0.9,
            stubCount: 0,
            usefulnessMargin: 0.3,
            potentialEnergy: 0.2,
        };

        // First evaluation triggers
        const events1 = await evaluator.evaluate('/test/doc.md', state);
        expect(events1).toHaveLength(1);

        // Second evaluation should not trigger (already fired for this doc)
        const events2 = await evaluator.evaluate('/test/doc.md', state);
        expect(events2).toHaveLength(0);
    });

    it('respects cooldown for repeatable milestones', async () => {
        const repeatableMilestone: UserMilestoneConfig = {
            ...publicationMilestone,
            id: 'repeatable',
            repeatable: true,
            cooldownHours: 24,
        };

        const evaluator = new MilestoneEvaluator([repeatableMilestone], {});

        const state: DocumentState = {
            path: '/test/doc.md',
            refinement: 0.95,
            health: 0.9,
            stubCount: 0,
            usefulnessMargin: 0.3,
            potentialEnergy: 0.2,
        };

        // First evaluation triggers
        const events1 = await evaluator.evaluate('/test/doc.md', state);
        expect(events1).toHaveLength(1);

        // Second evaluation should not trigger (in cooldown)
        const events2 = await evaluator.evaluate('/test/doc.md', state);
        expect(events2).toHaveLength(0);
    });

    it('tracks event counters', async () => {
        const eventMilestone: UserMilestoneConfig = {
            id: 'five-accepts',
            name: '5 Accepts',
            enabled: true,
            trigger: {
                type: 'event_count',
                event: 'suggestion_accepted',
                count: 5,
            },
            snapshotForm: { operation: 'none', commitScope: 'document' },
            consequences: [],
            scope: { mode: 'all' },
            repeatable: false,
            priority: 1,
        };

        const evaluator = new MilestoneEvaluator([eventMilestone], {});

        // Record events
        for (let i = 0; i < 4; i++) {
            evaluator.recordEvent('suggestion_accepted');
        }

        const state: DocumentState = {
            path: '/test/doc.md',
            refinement: 0.5,
            health: 0.5,
            stubCount: 5,
            usefulnessMargin: 0.1,
            potentialEnergy: 0.3,
        };

        // Should not trigger yet (only 4 events)
        let events = await evaluator.evaluate('/test/doc.md', state);
        expect(events).toHaveLength(0);

        // Record 5th event
        evaluator.recordEvent('suggestion_accepted');

        // Should trigger now
        events = await evaluator.evaluate('/test/doc.md', state);
        expect(events).toHaveLength(1);
    });

    it('exports and imports state', async () => {
        // Use milestone with no git operation and no consequences so it's marked successful
        const exportTestMilestone: UserMilestoneConfig = {
            id: 'export-test',
            name: 'Export Test',
            enabled: true,
            trigger: {
                type: 'threshold',
                property: 'refinement',
                operator: '>=',
                value: 0.9,
            },
            snapshotForm: { operation: 'none', commitScope: 'document' },
            consequences: [], // No consequences = success
            scope: { mode: 'all' },
            repeatable: false,
            priority: 1,
        };

        const evaluator1 = new MilestoneEvaluator([exportTestMilestone], {});

        // Record some events
        evaluator1.recordEvent('suggestion_accepted');
        evaluator1.recordEvent('suggestion_accepted');

        const state: DocumentState = {
            path: '/test/doc.md',
            refinement: 0.95,
            health: 0.9,
            stubCount: 0,
            usefulnessMargin: 0.3,
            potentialEnergy: 0.2,
        };

        // Trigger a milestone
        await evaluator1.evaluate('/test/doc.md', state);

        // Export state
        const exported = evaluator1.export();

        // Create new evaluator and import
        const evaluator2 = new MilestoneEvaluator([exportTestMilestone], {});
        evaluator2.import(exported);

        // Counters should be restored
        expect(evaluator2.getCounters().suggestion_accepted).toBe(2);

        // History should be restored (milestone won't re-trigger)
        const events = await evaluator2.evaluate('/test/doc.md', state);
        expect(events).toHaveLength(0);
    });
});

// =============================================================================
// END-TO-END DATA CASCADE TEST
// =============================================================================

describe('Data Cascade Integration', () => {
    it('data flows from trigger → consequence → callback', async () => {
        const capturedMutations: Array<{ property: string; value: unknown }> = [];

        const callbacks: MilestoneCallbacks = {
            executeGitSnapshot: async (form, path, variables) => {
                return { success: true };
            },
            applyPropertyChange: async (path, property, value) => {
                capturedMutations.push({ property, value });
                return { success: true };
            },
        };

        const milestone: UserMilestoneConfig = {
            id: 'cascade-test',
            name: 'Cascade Test',
            enabled: true,
            trigger: {
                type: 'threshold',
                property: 'refinement',
                operator: '>=',
                value: 0.8,
            },
            snapshotForm: {
                operation: 'commit',
                messageTemplate: 'test: {{document}}',
                commitScope: 'document',
            },
            consequences: [
                { type: 'refinement_bump', delta: 0.05, max: 1.0 },
                { type: 'property_enum_change', property: 'audience', value: 'trusted' },
                { type: 'array_mutation', property: 'tags', operation: 'add', value: 'reviewed' },
            ],
            scope: { mode: 'all' },
            repeatable: false,
            priority: 1,
        };

        const evaluator = new MilestoneEvaluator([milestone], callbacks);

        const state: DocumentState = {
            path: '/cascade/test.md',
            refinement: 0.85,
            health: 0.8,
            stubCount: 2,
            usefulnessMargin: 0.15,
            potentialEnergy: 0.3,
            tags: ['draft'],
        };

        const events = await evaluator.evaluate('/cascade/test.md', state);

        // Verify trigger fired
        expect(events).toHaveLength(1);
        expect(events[0].triggerResult.matched).toBe(true);

        // Verify consequences applied
        expect(capturedMutations).toHaveLength(3);
        expect(capturedMutations).toContainEqual({ property: 'refinement', value: 0.9 });
        expect(capturedMutations).toContainEqual({ property: 'audience', value: 'trusted' });
        expect(capturedMutations).toContainEqual({ property: 'tags', value: ['draft', 'reviewed'] });

        // Verify history recorded
        const history = evaluator.getHistory();
        expect(history).toHaveLength(1);
        expect(history[0].success).toBe(true);
    });
});
