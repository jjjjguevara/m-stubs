import { describe, it, expect, beforeEach } from 'vitest';
import {
    DocDoctorOrchestrator,
    VECTOR_FAMILY_RELIABILITY,
    VECTOR_FAMILY_TASK_FAMILY,
    type OrchestrationDocumentState,
} from '../orchestrator';
import type { ParsedStub } from '../../stubs/stubs-types';

// =============================================================================
// TEST FIXTURES
// =============================================================================

function createMockStub(overrides: Partial<ParsedStub> = {}): ParsedStub {
    return {
        id: `stub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'source',
        description: 'Test stub description',
        anchor: null,
        anchorResolved: false,
        properties: {},
        syntax: 'structured',
        frontmatterLine: 10,
        warnings: [],
        ...overrides,
    };
}

function createMockDocument(overrides: Partial<OrchestrationDocumentState> = {}): OrchestrationDocumentState {
    return {
        path: '/test/document.md',
        title: 'Test Document',
        content: '# Test\n\nContent here.',
        refinement: 0.5,
        origin: 'question',
        form: 'developing',
        audience: 'internal',
        existingStubs: [],
        stubTypes: {
            source: {
                id: 'source',
                key: 'source',
                displayName: 'Source',
                color: '#ff0000',
                sortOrder: 1,
                vectorFamily: 'Retrieval',
            },
            fix: {
                id: 'fix',
                key: 'fix',
                displayName: 'Fix',
                color: '#00ff00',
                sortOrder: 2,
                vectorFamily: 'Synthesis',
            },
            draft: {
                id: 'draft',
                key: 'draft',
                displayName: 'Draft',
                color: '#0000ff',
                sortOrder: 3,
                vectorFamily: 'Creation',
            },
            data: {
                id: 'data',
                key: 'data',
                displayName: 'Data',
                color: '#ffff00',
                sortOrder: 4,
                vectorFamily: 'Computation',
            },
            move: {
                id: 'move',
                key: 'move',
                displayName: 'Move',
                color: '#ff00ff',
                sortOrder: 5,
                vectorFamily: 'Structural',
            },
        },
        ...overrides,
    };
}

// =============================================================================
// TESTS
// =============================================================================

describe('DocDoctorOrchestrator', () => {
    let orchestrator: DocDoctorOrchestrator;

    beforeEach(() => {
        orchestrator = new DocDoctorOrchestrator();
    });

    describe('discoverTasks', () => {
        it('should return empty array for document with no stubs', () => {
            const doc = createMockDocument({ existingStubs: [] });
            const tasks = orchestrator.discoverTasks(doc);

            expect(tasks).toEqual([]);
        });

        it('should discover tasks from existing stubs', () => {
            const stub = createMockStub({ type: 'source', description: 'Find citation' });
            const doc = createMockDocument({ existingStubs: [stub] });

            const tasks = orchestrator.discoverTasks(doc);

            expect(tasks).toHaveLength(1);
            expect(tasks[0].stubType).toBe('source');
            expect(tasks[0].description).toBe('Find citation');
            expect(tasks[0].vectorFamily).toBe('Retrieval');
        });

        it('should sort blocking tasks first', () => {
            const blockingStub = createMockStub({
                type: 'source',
                description: 'Blocking',
                properties: { stub_form: 'blocking' },
            });
            const normalStub = createMockStub({
                type: 'fix',
                description: 'Normal',
                properties: { stub_form: 'persistent' },
            });
            const doc = createMockDocument({ existingStubs: [normalStub, blockingStub] });

            const tasks = orchestrator.discoverTasks(doc);

            expect(tasks).toHaveLength(2);
            expect(tasks[0].blocking).toBe(true);
            expect(tasks[0].description).toBe('Blocking');
        });

        it('should calculate priority score based on stub properties', () => {
            const criticalStub = createMockStub({
                type: 'source',
                properties: { priority: 'critical' },
            });
            const lowStub = createMockStub({
                type: 'fix',
                properties: { priority: 'low' },
            });
            const doc = createMockDocument({ existingStubs: [lowStub, criticalStub] });

            const tasks = orchestrator.discoverTasks(doc);

            // Critical should have higher priority score
            const criticalTask = tasks.find(t => t.stub?.id === criticalStub.id);
            const lowTask = tasks.find(t => t.stub?.id === lowStub.id);

            expect(criticalTask!.priorityScore).toBeGreaterThan(lowTask!.priorityScore);
        });

        it('should calculate potential energy from stub properties', () => {
            const stub = createMockStub({
                type: 'source',
                properties: {
                    urgency: 0.9,
                    impact: 0.8,
                    complexity: 0.5,
                },
            });
            const doc = createMockDocument({ existingStubs: [stub] });

            const tasks = orchestrator.discoverTasks(doc);

            expect(tasks[0].potentialEnergy).toBeCloseTo(0.9 * 0.8 * 0.5);
        });
    });

    describe('assignToFamilies', () => {
        it('should assign correct reliability tier based on vector family', () => {
            const sourceStub = createMockStub({ type: 'source' }); // Retrieval -> High
            const fixStub = createMockStub({ type: 'fix' }); // Synthesis -> Medium
            const draftStub = createMockStub({ type: 'draft' }); // Creation -> Low
            const doc = createMockDocument({
                existingStubs: [sourceStub, fixStub, draftStub],
            });

            const tasks = orchestrator.discoverTasks(doc);
            const assignments = orchestrator.assignToFamilies(tasks);

            const sourceAssignment = assignments.find(a => a.task.stubType === 'source');
            const fixAssignment = assignments.find(a => a.task.stubType === 'fix');
            const draftAssignment = assignments.find(a => a.task.stubType === 'draft');

            expect(sourceAssignment!.reliabilityTier).toBe('high');
            expect(fixAssignment!.reliabilityTier).toBe('medium');
            expect(draftAssignment!.reliabilityTier).toBe('low');
        });

        it('should assign mandatory tool policy for high reliability tier', () => {
            const stub = createMockStub({ type: 'source' }); // Retrieval -> High
            const doc = createMockDocument({ existingStubs: [stub] });

            const tasks = orchestrator.discoverTasks(doc);
            const assignments = orchestrator.assignToFamilies(tasks);

            expect(assignments[0].toolPolicy).toBe('mandatory');
        });

        it('should recommend appropriate tools for each vector family', () => {
            const sourceStub = createMockStub({ type: 'source' });
            const doc = createMockDocument({ existingStubs: [sourceStub] });

            const tasks = orchestrator.discoverTasks(doc);
            const assignments = orchestrator.assignToFamilies(tasks);

            expect(assignments[0].recommendedTools).toContain('web_search');
            expect(assignments[0].recommendedTools).toContain('openalex_search');
        });
    });

    describe('forecastCompletion', () => {
        it('should calculate total potential energy', () => {
            const stubs = [
                createMockStub({
                    type: 'source',
                    properties: { urgency: 0.5, impact: 0.5, complexity: 0.5 },
                }),
                createMockStub({
                    type: 'fix',
                    properties: { urgency: 0.8, impact: 0.8, complexity: 0.8 },
                }),
            ];
            const doc = createMockDocument({ existingStubs: stubs });

            const tasks = orchestrator.discoverTasks(doc);
            const forecast = orchestrator.forecastCompletion({ tasks, documentState: doc });

            const expectedPE = (0.5 * 0.5 * 0.5) + (0.8 * 0.8 * 0.8);
            expect(forecast.totalPotentialEnergy).toBeCloseTo(expectedPE);
        });

        it('should estimate sessions to completion', () => {
            const stubs = Array.from({ length: 5 }, () =>
                createMockStub({
                    type: 'source',
                    properties: { urgency: 0.5, impact: 0.5, complexity: 0.5 },
                }),
            );
            const doc = createMockDocument({ existingStubs: stubs });

            const tasks = orchestrator.discoverTasks(doc);
            const forecast = orchestrator.forecastCompletion({ tasks, documentState: doc });

            expect(forecast.estimatedSessions).toBeGreaterThan(0);
        });

        it('should identify risks for documents with many blocking stubs', () => {
            const stubs = Array.from({ length: 5 }, () =>
                createMockStub({
                    type: 'source',
                    properties: { stub_form: 'blocking' },
                }),
            );
            const doc = createMockDocument({ existingStubs: stubs });

            const tasks = orchestrator.discoverTasks(doc);
            const forecast = orchestrator.forecastCompletion({ tasks, documentState: doc });

            expect(forecast.risks.some(r => r.includes('blocking'))).toBe(true);
        });
    });

    describe('createPlan', () => {
        it('should create a complete orchestration plan', () => {
            const stubs = [
                createMockStub({ type: 'source', properties: { stub_form: 'blocking' } }),
                createMockStub({ type: 'fix' }),
                createMockStub({ type: 'draft' }),
            ];
            const doc = createMockDocument({ existingStubs: stubs });

            const plan = orchestrator.createPlan(doc);

            expect(plan.id).toMatch(/^plan-/);
            expect(plan.traceContext).toBeDefined();
            expect(plan.tasks).toHaveLength(3);
            expect(plan.assignments).toHaveLength(3);
            expect(plan.executionOrder).toHaveLength(3);
            expect(plan.forecast).toBeDefined();
        });

        it('should order execution by blocking, tier, then priority', () => {
            const blockingStub = createMockStub({
                type: 'draft', // Low tier
                properties: { stub_form: 'blocking' },
            });
            const highTierStub = createMockStub({
                type: 'source', // High tier
            });
            const doc = createMockDocument({
                existingStubs: [highTierStub, blockingStub],
            });

            const plan = orchestrator.createPlan(doc);

            // Blocking should be first even though it's low tier
            const firstTask = plan.tasks.find(t => t.id === plan.executionOrder[0]);
            expect(firstTask!.blocking).toBe(true);
        });

        it('should store plan for later retrieval', () => {
            const doc = createMockDocument({
                existingStubs: [createMockStub({ type: 'source' })],
            });

            const plan = orchestrator.createPlan(doc);
            const retrieved = orchestrator.getPlan(plan.id);

            expect(retrieved).toEqual(plan);
        });
    });

    describe('vector family mappings', () => {
        it('should have correct reliability tiers', () => {
            expect(VECTOR_FAMILY_RELIABILITY.Retrieval).toBe('high');
            expect(VECTOR_FAMILY_RELIABILITY.Computation).toBe('high');
            expect(VECTOR_FAMILY_RELIABILITY.Synthesis).toBe('medium');
            expect(VECTOR_FAMILY_RELIABILITY.Creation).toBe('low');
            expect(VECTOR_FAMILY_RELIABILITY.Structural).toBe('medium');
        });

        it('should have correct task family mappings', () => {
            expect(VECTOR_FAMILY_TASK_FAMILY.Retrieval).toBe('combinatorial');
            expect(VECTOR_FAMILY_TASK_FAMILY.Computation).toBe('combinatorial');
            expect(VECTOR_FAMILY_TASK_FAMILY.Synthesis).toBe('synoptic');
            expect(VECTOR_FAMILY_TASK_FAMILY.Creation).toBe('generative');
            expect(VECTOR_FAMILY_TASK_FAMILY.Structural).toBe('operational');
        });
    });
});
