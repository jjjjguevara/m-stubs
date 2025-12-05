import { describe, it, expect, beforeEach } from 'vitest';
import {
    HealthMonitor,
    AUDIENCE_GATES,
    type HealthSnapshot,
} from '../health-monitor';

describe('HealthMonitor', () => {
    let monitor: HealthMonitor;

    beforeEach(() => {
        monitor = new HealthMonitor();
    });

    describe('recordSnapshot', () => {
        it('should record a health snapshot', () => {
            const snapshot = monitor.recordSnapshot({
                documentPath: '/test/doc.md',
                refinement: 0.7,
                stubCount: 3,
            });

            expect(snapshot.id).toMatch(/^snap-/);
            expect(snapshot.documentPath).toBe('/test/doc.md');
            expect(snapshot.refinement).toBe(0.7);
            expect(snapshot.stubCount).toBe(3);
        });

        it('should calculate health correctly', () => {
            const snapshot = monitor.recordSnapshot({
                documentPath: '/test/doc.md',
                refinement: 0.8,
                stubCount: 2, // penalty = min(2 * 0.05, 0.3) = 0.1
            });

            // health = 0.7 * 0.8 + 0.3 * (1 - 0.1) = 0.56 + 0.27 = 0.83
            expect(snapshot.health).toBeCloseTo(0.83);
        });

        it('should cap stub penalty at 0.3', () => {
            const snapshot = monitor.recordSnapshot({
                documentPath: '/test/doc.md',
                refinement: 0.5,
                stubCount: 10, // penalty would be 0.5 but capped at 0.3
            });

            expect(snapshot.stubPenalty).toBe(0.3);
            // health = 0.7 * 0.5 + 0.3 * (1 - 0.3) = 0.35 + 0.21 = 0.56
            expect(snapshot.health).toBeCloseTo(0.56);
        });

        it('should calculate usefulness margin correctly', () => {
            const snapshot = monitor.recordSnapshot({
                documentPath: '/test/doc.md',
                refinement: 0.75,
                stubCount: 0,
                audience: 'internal', // gate = 0.70
            });

            // margin = 0.75 - 0.70 = 0.05
            expect(snapshot.usefulnessMargin).toBeCloseTo(0.05);
        });

        it('should return negative margin when below gate', () => {
            const snapshot = monitor.recordSnapshot({
                documentPath: '/test/doc.md',
                refinement: 0.65,
                stubCount: 0,
                audience: 'trusted', // gate = 0.80
            });

            // margin = 0.65 - 0.80 = -0.15
            expect(snapshot.usefulnessMargin).toBeCloseTo(-0.15);
        });
    });

    describe('getSnapshots', () => {
        it('should return empty array for unknown document', () => {
            const snapshots = monitor.getSnapshots('/unknown/doc.md');
            expect(snapshots).toEqual([]);
        });

        it('should return all snapshots for a document', () => {
            monitor.recordSnapshot({ documentPath: '/test/doc.md', refinement: 0.5, stubCount: 0 });
            monitor.recordSnapshot({ documentPath: '/test/doc.md', refinement: 0.6, stubCount: 0 });
            monitor.recordSnapshot({ documentPath: '/other/doc.md', refinement: 0.7, stubCount: 0 });

            const snapshots = monitor.getSnapshots('/test/doc.md');
            expect(snapshots).toHaveLength(2);
        });
    });

    describe('analyzeTrend', () => {
        it('should return null with insufficient snapshots', () => {
            monitor.recordSnapshot({ documentPath: '/test/doc.md', refinement: 0.5, stubCount: 0 });
            monitor.recordSnapshot({ documentPath: '/test/doc.md', refinement: 0.6, stubCount: 0 });

            const trend = monitor.analyzeTrend('/test/doc.md');
            expect(trend).toBeNull(); // Need at least 3 snapshots by default
        });

        it('should detect improving trend', () => {
            // Create snapshots with improving health
            for (let i = 0; i < 5; i++) {
                monitor.recordSnapshot({
                    documentPath: '/test/doc.md',
                    refinement: 0.5 + i * 0.1,
                    stubCount: Math.max(0, 5 - i),
                });
            }

            const trend = monitor.analyzeTrend('/test/doc.md');
            expect(trend).not.toBeNull();
            expect(trend!.direction).toBe('improving');
            expect(trend!.healthDelta).toBeGreaterThan(0);
        });

        it('should detect declining trend', () => {
            // Create snapshots with declining health
            for (let i = 0; i < 5; i++) {
                monitor.recordSnapshot({
                    documentPath: '/test/doc.md',
                    refinement: 0.9 - i * 0.15,
                    stubCount: i * 2,
                });
            }

            const trend = monitor.analyzeTrend('/test/doc.md');
            expect(trend).not.toBeNull();
            expect(trend!.direction).toBe('declining');
            expect(trend!.healthDelta).toBeLessThan(0);
        });
    });

    describe('forecastDaysToTarget', () => {
        it('should return achievable forecast when at target', () => {
            monitor.recordSnapshot({
                documentPath: '/test/doc.md',
                refinement: 0.75,
                stubCount: 0,
                audience: 'internal', // gate = 0.70
            });

            const forecast = monitor.forecastDaysToTarget('/test/doc.md');
            expect(forecast).not.toBeNull();
            expect(forecast!.achievable).toBe(true);
            expect(forecast!.gap).toBe(0);
        });

        it('should calculate gap correctly', () => {
            monitor.recordSnapshot({
                documentPath: '/test/doc.md',
                refinement: 0.65,
                stubCount: 0,
                audience: 'public', // gate = 0.90
            });

            const forecast = monitor.forecastDaysToTarget('/test/doc.md');
            expect(forecast).not.toBeNull();
            expect(forecast!.gap).toBeCloseTo(0.25); // 0.90 - 0.65
            expect(forecast!.targetRefinement).toBe(0.90);
        });

        it('should identify blocking stubs as risk', () => {
            monitor.recordSnapshot({
                documentPath: '/test/doc.md',
                refinement: 0.5,
                stubCount: 5,
                blockingStubCount: 3,
                audience: 'internal',
            });

            const forecast = monitor.forecastDaysToTarget('/test/doc.md');
            expect(forecast).not.toBeNull();
            expect(forecast!.risks.some(r => r.includes('blocking'))).toBe(true);
        });
    });

    describe('calculateHealth', () => {
        it('should match the formula: 0.7 * refinement + 0.3 * (1 - stubPenalty)', () => {
            const health = monitor.calculateHealth(0.8, 4);
            // stubPenalty = min(4 * 0.05, 0.3) = 0.2
            // health = 0.7 * 0.8 + 0.3 * (1 - 0.2) = 0.56 + 0.24 = 0.80
            expect(health).toBeCloseTo(0.80);
        });

        it('should return perfect health for refinement=1, stubs=0', () => {
            const health = monitor.calculateHealth(1.0, 0);
            // health = 0.7 * 1.0 + 0.3 * 1.0 = 1.0
            expect(health).toBeCloseTo(1.0);
        });

        it('should return minimum health for refinement=0, max stubs', () => {
            const health = monitor.calculateHealth(0.0, 10);
            // stubPenalty = 0.3 (capped)
            // health = 0.7 * 0.0 + 0.3 * (1 - 0.3) = 0 + 0.21 = 0.21
            expect(health).toBeCloseTo(0.21);
        });
    });

    describe('meetsAudienceGate', () => {
        it('should return true when refinement meets gate', () => {
            expect(monitor.meetsAudienceGate(0.75, 'internal')).toBe(true);
            expect(monitor.meetsAudienceGate(0.90, 'public')).toBe(true);
        });

        it('should return false when refinement below gate', () => {
            expect(monitor.meetsAudienceGate(0.65, 'internal')).toBe(false);
            expect(monitor.meetsAudienceGate(0.85, 'public')).toBe(false);
        });
    });

    describe('audience gates', () => {
        it('should have correct gate values', () => {
            expect(AUDIENCE_GATES.personal).toBe(0.50);
            expect(AUDIENCE_GATES.internal).toBe(0.70);
            expect(AUDIENCE_GATES.trusted).toBe(0.80);
            expect(AUDIENCE_GATES.public).toBe(0.90);
        });
    });

    describe('getVaultSummary', () => {
        it('should return zeros for empty monitor', () => {
            const summary = monitor.getVaultSummary();
            expect(summary.totalDocuments).toBe(0);
            expect(summary.avgHealth).toBe(0);
        });

        it('should aggregate across multiple documents', () => {
            monitor.recordSnapshot({ documentPath: '/doc1.md', refinement: 0.8, stubCount: 0 });
            monitor.recordSnapshot({ documentPath: '/doc2.md', refinement: 0.6, stubCount: 2 });
            monitor.recordSnapshot({ documentPath: '/doc3.md', refinement: 0.4, stubCount: 4 });

            const summary = monitor.getVaultSummary();
            expect(summary.totalDocuments).toBe(3);
            expect(summary.avgHealth).toBeGreaterThan(0);
        });

        it('should identify at-risk documents', () => {
            // Create declining document
            for (let i = 0; i < 5; i++) {
                monitor.recordSnapshot({
                    documentPath: '/declining.md',
                    refinement: 0.8 - i * 0.15,
                    stubCount: i * 2,
                });
            }

            const summary = monitor.getVaultSummary();
            expect(summary.atRiskDocuments).toContain('/declining.md');
        });
    });

    describe('data persistence', () => {
        it('should export and import snapshots', () => {
            monitor.recordSnapshot({ documentPath: '/doc1.md', refinement: 0.8, stubCount: 0 });
            monitor.recordSnapshot({ documentPath: '/doc2.md', refinement: 0.6, stubCount: 2 });

            const exported = monitor.exportSnapshots();

            const newMonitor = new HealthMonitor();
            newMonitor.importSnapshots(exported);

            expect(newMonitor.getSnapshots('/doc1.md')).toHaveLength(1);
            expect(newMonitor.getSnapshots('/doc2.md')).toHaveLength(1);
        });

        it('should clear all snapshots', () => {
            monitor.recordSnapshot({ documentPath: '/doc1.md', refinement: 0.8, stubCount: 0 });
            monitor.clear();

            expect(monitor.getSnapshots('/doc1.md')).toHaveLength(0);
        });
    });
});
