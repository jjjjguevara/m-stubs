import { describe, it, expect, beforeEach } from 'vitest';
import {
    AcceptanceTracker,
    DEFAULT_TRACKER_CONFIG,
    type AcceptanceEvent,
    type RejectionReason,
} from '../acceptance-tracker';
import type { SuggestedStub, LLMProvider } from '../../llm/llm-types';
import type { VectorFamily } from '../../stubs/stubs-types';

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

function createBaseEventData(overrides: Partial<{
    documentPath: string;
    suggestion: SuggestedStub;
    vectorFamily: VectorFamily;
    creativityMode: string;
    provider: LLMProvider;
    model: string;
    reviewTimeMs: number;
    sessionId: string;
}> = {}) {
    return {
        documentPath: '/test/doc.md',
        suggestion: createMockSuggestion(),
        provider: 'anthropic' as LLMProvider,
        model: 'claude-3-sonnet',
        ...overrides,
    };
}

// =============================================================================
// TESTS
// =============================================================================

describe('AcceptanceTracker', () => {
    let tracker: AcceptanceTracker;

    beforeEach(() => {
        tracker = new AcceptanceTracker();
    });

    describe('constants', () => {
        it('should have correct default config', () => {
            expect(DEFAULT_TRACKER_CONFIG.maxEvents).toBe(1000);
            expect(DEFAULT_TRACKER_CONFIG.persistEvents).toBe(true);
            expect(DEFAULT_TRACKER_CONFIG.logEvents).toBe(true);
        });
    });

    describe('recordAcceptance', () => {
        it('should record an acceptance event', () => {
            const event = tracker.recordAcceptance(createBaseEventData());

            expect(event.id).toMatch(/^acc-/);
            expect(event.action).toBe('accepted');
            expect(event.stubType).toBe('source');
            expect(event.provider).toBe('anthropic');
        });

        it('should include all provided data', () => {
            const event = tracker.recordAcceptance({
                ...createBaseEventData(),
                vectorFamily: 'Retrieval',
                creativityMode: 'review',
                reviewTimeMs: 5000,
                sessionId: 'session-123',
            });

            expect(event.vectorFamily).toBe('Retrieval');
            expect(event.creativityMode).toBe('review');
            expect(event.reviewTimeMs).toBe(5000);
            expect(event.sessionId).toBe('session-123');
        });

        it('should set correct stubType from suggestion', () => {
            const event = tracker.recordAcceptance({
                ...createBaseEventData(),
                suggestion: createMockSuggestion({ type: 'check' }),
            });

            expect(event.stubType).toBe('check');
        });
    });

    describe('recordRejection', () => {
        it('should record a rejection event', () => {
            const event = tracker.recordRejection({
                ...createBaseEventData(),
                rejectionReason: 'irrelevant',
            });

            expect(event.id).toMatch(/^rej-/);
            expect(event.action).toBe('rejected');
            expect(event.rejectionReason).toBe('irrelevant');
        });

        it('should include custom reason text', () => {
            const event = tracker.recordRejection({
                ...createBaseEventData(),
                rejectionReason: 'other',
                reasonText: 'Custom rejection reason',
            });

            expect(event.reasonText).toBe('Custom rejection reason');
        });
    });

    describe('recordModification', () => {
        it('should record a modification event', () => {
            const event = tracker.recordModification({
                ...createBaseEventData(),
                modifiedSuggestion: { description: 'Modified description' },
            });

            expect(event.id).toMatch(/^mod-/);
            expect(event.action).toBe('modified');
            expect(event.modifiedSuggestion).toEqual({ description: 'Modified description' });
        });
    });

    describe('recordDeferred', () => {
        it('should record a deferred event', () => {
            const event = tracker.recordDeferred(createBaseEventData());

            expect(event.id).toMatch(/^def-/);
            expect(event.action).toBe('deferred');
        });
    });

    describe('getStats', () => {
        it('should return empty stats for no events', () => {
            const stats = tracker.getStats();

            expect(stats.totalEvents).toBe(0);
            expect(stats.acceptanceRate).toBe(0);
            expect(stats.rejectionRate).toBe(0);
        });

        it('should calculate acceptance rate correctly', () => {
            tracker.recordAcceptance(createBaseEventData());
            tracker.recordAcceptance(createBaseEventData());
            tracker.recordRejection({ ...createBaseEventData(), rejectionReason: 'irrelevant' });
            tracker.recordModification({ ...createBaseEventData(), modifiedSuggestion: {} });

            const stats = tracker.getStats();

            expect(stats.totalEvents).toBe(4);
            expect(stats.acceptanceRate).toBeCloseTo(0.5); // 2 of 4
            expect(stats.rejectionRate).toBeCloseTo(0.25); // 1 of 4
            expect(stats.modificationRate).toBeCloseTo(0.25); // 1 of 4
        });

        it('should aggregate by stub type', () => {
            tracker.recordAcceptance({
                ...createBaseEventData(),
                suggestion: createMockSuggestion({ type: 'source' }),
            });
            tracker.recordAcceptance({
                ...createBaseEventData(),
                suggestion: createMockSuggestion({ type: 'source' }),
            });
            tracker.recordRejection({
                ...createBaseEventData(),
                suggestion: createMockSuggestion({ type: 'draft' }),
                rejectionReason: 'irrelevant',
            });

            const stats = tracker.getStats();

            expect(stats.byStubType.source.total).toBe(2);
            expect(stats.byStubType.source.accepted).toBe(2);
            expect(stats.byStubType.source.acceptanceRate).toBe(1);
            expect(stats.byStubType.draft.total).toBe(1);
            expect(stats.byStubType.draft.rejected).toBe(1);
        });

        it('should aggregate by provider', () => {
            tracker.recordAcceptance({ ...createBaseEventData(), provider: 'anthropic' });
            tracker.recordAcceptance({ ...createBaseEventData(), provider: 'openai' });
            tracker.recordRejection({
                ...createBaseEventData(),
                provider: 'anthropic',
                rejectionReason: 'irrelevant',
            });

            const stats = tracker.getStats();

            expect(stats.byProvider.anthropic.total).toBe(2);
            expect(stats.byProvider.anthropic.acceptanceRate).toBeCloseTo(0.5);
            expect(stats.byProvider.openai.total).toBe(1);
            expect(stats.byProvider.openai.acceptanceRate).toBe(1);
        });

        it('should count rejection reasons', () => {
            tracker.recordRejection({ ...createBaseEventData(), rejectionReason: 'irrelevant' });
            tracker.recordRejection({ ...createBaseEventData(), rejectionReason: 'irrelevant' });
            tracker.recordRejection({ ...createBaseEventData(), rejectionReason: 'too_vague' });

            const stats = tracker.getStats();

            expect(stats.rejectionReasons.irrelevant).toBe(2);
            expect(stats.rejectionReasons.too_vague).toBe(1);
            expect(stats.rejectionReasons.incorrect).toBe(0);
        });

        it('should calculate average review time', () => {
            tracker.recordAcceptance({ ...createBaseEventData(), reviewTimeMs: 3000 });
            tracker.recordAcceptance({ ...createBaseEventData(), reviewTimeMs: 5000 });
            tracker.recordAcceptance({ ...createBaseEventData() }); // No review time

            const stats = tracker.getStats();

            expect(stats.avgReviewTimeMs).toBe(4000); // Average of 3000 and 5000
        });

        it('should filter by date', () => {
            tracker.recordAcceptance(createBaseEventData());

            // Filter for events after tomorrow (should exclude the event we just created)
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const stats = tracker.getStats({ since: tomorrow });

            expect(stats.totalEvents).toBe(0);
        });

        it('should filter by document path', () => {
            tracker.recordAcceptance({ ...createBaseEventData(), documentPath: '/doc1.md' });
            tracker.recordAcceptance({ ...createBaseEventData(), documentPath: '/doc2.md' });

            const stats = tracker.getStats({ documentPath: '/doc1.md' });

            expect(stats.totalEvents).toBe(1);
        });

        it('should filter by provider', () => {
            tracker.recordAcceptance({ ...createBaseEventData(), provider: 'anthropic' });
            tracker.recordAcceptance({ ...createBaseEventData(), provider: 'openai' });

            const stats = tracker.getStats({ provider: 'anthropic' });

            expect(stats.totalEvents).toBe(1);
        });
    });

    describe('getInsights', () => {
        it('should identify best performing types', () => {
            // Create enough samples for meaningful insights
            for (let i = 0; i < 10; i++) {
                tracker.recordAcceptance({
                    ...createBaseEventData(),
                    suggestion: createMockSuggestion({ type: 'source' }),
                });
            }
            for (let i = 0; i < 5; i++) {
                tracker.recordRejection({
                    ...createBaseEventData(),
                    suggestion: createMockSuggestion({ type: 'draft' }),
                    rejectionReason: 'irrelevant',
                });
            }

            const insights = tracker.getInsights();

            expect(insights.bestPerformingTypes.length).toBeGreaterThan(0);
            expect(insights.bestPerformingTypes[0].type).toBe('source');
        });

        it('should identify most common rejection reasons', () => {
            tracker.recordRejection({ ...createBaseEventData(), rejectionReason: 'irrelevant' });
            tracker.recordRejection({ ...createBaseEventData(), rejectionReason: 'irrelevant' });
            tracker.recordRejection({ ...createBaseEventData(), rejectionReason: 'too_vague' });

            const insights = tracker.getInsights();

            expect(insights.mostCommonRejectionReasons[0].reason).toBe('irrelevant');
            expect(insights.mostCommonRejectionReasons[0].count).toBe(2);
        });

        it('should rank providers', () => {
            tracker.recordAcceptance({ ...createBaseEventData(), provider: 'anthropic' });
            tracker.recordAcceptance({ ...createBaseEventData(), provider: 'openai' });
            tracker.recordRejection({
                ...createBaseEventData(),
                provider: 'anthropic',
                rejectionReason: 'irrelevant',
            });

            const insights = tracker.getInsights();

            expect(insights.providerRanking.length).toBe(2);
            // OpenAI should rank higher (100% acceptance vs 50%)
            expect(insights.providerRanking[0].provider).toBe('openai');
        });

        it('should generate recommendations for low acceptance', () => {
            // Create many rejections
            for (let i = 0; i < 10; i++) {
                tracker.recordRejection({ ...createBaseEventData(), rejectionReason: 'irrelevant' });
            }
            tracker.recordAcceptance(createBaseEventData());

            const insights = tracker.getInsights();

            expect(insights.recommendations.some(r => r.includes('acceptance rate'))).toBe(true);
        });

        it('should recommend context improvement for irrelevant rejections', () => {
            for (let i = 0; i < 5; i++) {
                tracker.recordRejection({ ...createBaseEventData(), rejectionReason: 'irrelevant' });
            }

            const insights = tracker.getInsights();

            expect(insights.recommendations.some(r => r.includes('context'))).toBe(true);
        });
    });

    describe('getAllEvents', () => {
        it('should return all events', () => {
            tracker.recordAcceptance(createBaseEventData());
            tracker.recordRejection({ ...createBaseEventData(), rejectionReason: 'irrelevant' });

            const events = tracker.getAllEvents();

            expect(events).toHaveLength(2);
        });

        it('should return a copy of events', () => {
            tracker.recordAcceptance(createBaseEventData());

            const events = tracker.getAllEvents();
            events.push({} as AcceptanceEvent);

            expect(tracker.getAllEvents()).toHaveLength(1);
        });
    });

    describe('getSessionEvents', () => {
        it('should filter by session ID', () => {
            tracker.recordAcceptance({ ...createBaseEventData(), sessionId: 'session-1' });
            tracker.recordAcceptance({ ...createBaseEventData(), sessionId: 'session-1' });
            tracker.recordAcceptance({ ...createBaseEventData(), sessionId: 'session-2' });

            const events = tracker.getSessionEvents('session-1');

            expect(events).toHaveLength(2);
        });
    });

    describe('export/import', () => {
        it('should export events', () => {
            tracker.recordAcceptance(createBaseEventData());
            tracker.recordRejection({ ...createBaseEventData(), rejectionReason: 'irrelevant' });

            const exported = tracker.exportEvents();

            expect(exported).toHaveLength(2);
        });

        it('should import events', () => {
            const events: AcceptanceEvent[] = [
                {
                    id: 'test-1',
                    timestamp: new Date().toISOString(),
                    documentPath: '/test.md',
                    suggestion: createMockSuggestion(),
                    stubType: 'source',
                    provider: 'anthropic',
                    model: 'claude-3',
                    action: 'accepted',
                },
            ];

            tracker.importEvents(events);

            expect(tracker.getAllEvents()).toHaveLength(1);
        });

        it('should trim to max size on import', () => {
            const smallTracker = new AcceptanceTracker({ maxEvents: 5 });
            const events: AcceptanceEvent[] = Array.from({ length: 10 }, (_, i) => ({
                id: `test-${i}`,
                timestamp: new Date().toISOString(),
                documentPath: '/test.md',
                suggestion: createMockSuggestion(),
                stubType: 'source',
                provider: 'anthropic',
                model: 'claude-3',
                action: 'accepted',
            }));

            smallTracker.importEvents(events);

            expect(smallTracker.getAllEvents()).toHaveLength(5);
        });
    });

    describe('clear', () => {
        it('should remove all events', () => {
            tracker.recordAcceptance(createBaseEventData());
            tracker.recordAcceptance(createBaseEventData());
            tracker.clear();

            expect(tracker.getAllEvents()).toHaveLength(0);
        });
    });

    describe('getEventCount', () => {
        it('should return correct count', () => {
            tracker.recordAcceptance(createBaseEventData());
            tracker.recordAcceptance(createBaseEventData());
            tracker.recordRejection({ ...createBaseEventData(), rejectionReason: 'irrelevant' });

            expect(tracker.getEventCount()).toBe(3);
        });
    });

    describe('max events limit', () => {
        it('should enforce max events limit', () => {
            const smallTracker = new AcceptanceTracker({ maxEvents: 3, logEvents: false });

            smallTracker.recordAcceptance(createBaseEventData());
            smallTracker.recordAcceptance(createBaseEventData());
            smallTracker.recordAcceptance(createBaseEventData());
            smallTracker.recordAcceptance(createBaseEventData()); // Should trigger trim

            expect(smallTracker.getEventCount()).toBe(3);
        });

        it('should keep most recent events when trimming', () => {
            const smallTracker = new AcceptanceTracker({ maxEvents: 2, logEvents: false });

            smallTracker.recordAcceptance({
                ...createBaseEventData(),
                documentPath: '/first.md',
            });
            smallTracker.recordAcceptance({
                ...createBaseEventData(),
                documentPath: '/second.md',
            });
            smallTracker.recordAcceptance({
                ...createBaseEventData(),
                documentPath: '/third.md',
            });

            const events = smallTracker.getAllEvents();

            expect(events).toHaveLength(2);
            expect(events.some(e => e.documentPath === '/second.md')).toBe(true);
            expect(events.some(e => e.documentPath === '/third.md')).toBe(true);
        });
    });

    describe('vector family aggregation', () => {
        it('should aggregate by vector family when provided', () => {
            tracker.recordAcceptance({
                ...createBaseEventData(),
                vectorFamily: 'Retrieval',
            });
            tracker.recordAcceptance({
                ...createBaseEventData(),
                vectorFamily: 'Retrieval',
            });
            tracker.recordRejection({
                ...createBaseEventData(),
                vectorFamily: 'Creation',
                rejectionReason: 'irrelevant',
            });

            const stats = tracker.getStats();

            expect(stats.byVectorFamily.Retrieval.total).toBe(2);
            expect(stats.byVectorFamily.Retrieval.acceptanceRate).toBe(1);
            expect(stats.byVectorFamily.Creation.total).toBe(1);
            expect(stats.byVectorFamily.Creation.acceptanceRate).toBe(0);
        });
    });

    describe('creativity mode aggregation', () => {
        it('should aggregate by creativity mode when provided', () => {
            tracker.recordAcceptance({
                ...createBaseEventData(),
                creativityMode: 'review',
            });
            tracker.recordAcceptance({
                ...createBaseEventData(),
                creativityMode: 'research',
            });
            tracker.recordRejection({
                ...createBaseEventData(),
                creativityMode: 'creative',
                rejectionReason: 'irrelevant',
            });

            const stats = tracker.getStats();

            expect(stats.byCreativityMode.review.total).toBe(1);
            expect(stats.byCreativityMode.research.total).toBe(1);
            expect(stats.byCreativityMode.creative.total).toBe(1);
        });
    });
});
