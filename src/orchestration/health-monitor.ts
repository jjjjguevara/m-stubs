/**
 * Health Monitor for Doc Doctor
 *
 * Tracks document health over time and forecasts days-to-target refinement.
 * Implements the J-Editorial Framework's health calculation:
 *   health = 0.7 × refinement + 0.3 × (1 - stub_penalty)
 */

import { logger } from '../observability/logger';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Health snapshot at a point in time
 */
export interface HealthSnapshot {
    /** Snapshot ID */
    id: string;

    /** Document path */
    documentPath: string;

    /** Timestamp */
    timestamp: string;

    /** Current refinement score (0-1) */
    refinement: number;

    /** Stub penalty (0-1) */
    stubPenalty: number;

    /** Calculated health score (0-1) */
    health: number;

    /** Stub count at this snapshot */
    stubCount: number;

    /** Blocking stub count */
    blockingStubCount: number;

    /** Target audience (affects threshold) */
    audience?: 'personal' | 'internal' | 'trusted' | 'public';

    /** Usefulness margin (refinement - audience_gate) */
    usefulnessMargin: number;
}

/**
 * Health trend analysis
 */
export interface HealthTrend {
    /** Document path */
    documentPath: string;

    /** Number of snapshots analyzed */
    snapshotCount: number;

    /** First snapshot timestamp */
    firstSnapshot: string;

    /** Latest snapshot timestamp */
    latestSnapshot: string;

    /** Current health */
    currentHealth: number;

    /** Health change over analysis period */
    healthDelta: number;

    /** Slope (health change per day) */
    slope: number;

    /** Velocity (refinement points per day) */
    velocity: number;

    /** Direction of trend */
    direction: 'improving' | 'stable' | 'declining';

    /** Confidence in trend (0-1) */
    confidence: number;
}

/**
 * Forecast for reaching target refinement
 */
export interface RefinementForecast {
    /** Document path */
    documentPath: string;

    /** Current refinement */
    currentRefinement: number;

    /** Target refinement (based on audience) */
    targetRefinement: number;

    /** Gap to target */
    gap: number;

    /** Current velocity (refinement points per day) */
    currentVelocity: number;

    /** Estimated days to target (null if declining or no progress) */
    estimatedDays: number | null;

    /** Whether target is achievable at current rate */
    achievable: boolean;

    /** Risk factors */
    risks: string[];

    /** Recommendations */
    recommendations: string[];
}

/**
 * Health monitor configuration
 */
export interface HealthMonitorConfig {
    /** Maximum snapshots to retain per document */
    maxSnapshots: number;

    /** Minimum snapshots needed for trend analysis */
    minSnapshotsForTrend: number;

    /** Threshold for "stable" trend (health change per day) */
    stableThreshold: number;

    /** Days to look back for trend analysis */
    trendWindowDays: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Default health monitor configuration
 */
export const DEFAULT_HEALTH_MONITOR_CONFIG: HealthMonitorConfig = {
    maxSnapshots: 100,
    minSnapshotsForTrend: 3,
    stableThreshold: 0.01, // Less than 1% change per day is "stable"
    trendWindowDays: 30,
};

/**
 * Audience gates (minimum refinement for audience level)
 */
export const AUDIENCE_GATES: Record<string, number> = {
    personal: 0.50,
    internal: 0.70,
    trusted: 0.80,
    public: 0.90,
};

/**
 * Health calculation weights
 */
const REFINEMENT_WEIGHT = 0.7;
const STUB_WEIGHT = 0.3;

// =============================================================================
// HEALTH MONITOR CLASS
// =============================================================================

/**
 * Monitors document health over time
 */
export class HealthMonitor {
    private config: HealthMonitorConfig;
    private snapshots: Map<string, HealthSnapshot[]> = new Map();

    constructor(config: Partial<HealthMonitorConfig> = {}) {
        this.config = { ...DEFAULT_HEALTH_MONITOR_CONFIG, ...config };
    }

    // =========================================================================
    // SNAPSHOT MANAGEMENT
    // =========================================================================

    /**
     * Record a health snapshot
     */
    recordSnapshot(data: {
        documentPath: string;
        refinement: number;
        stubCount: number;
        blockingStubCount?: number;
        audience?: 'personal' | 'internal' | 'trusted' | 'public';
    }): HealthSnapshot {
        const { documentPath, refinement, stubCount, blockingStubCount = 0, audience } = data;

        // Calculate stub penalty (simple model: each stub reduces health)
        const stubPenalty = Math.min(stubCount * 0.05, 0.3);

        // Calculate health: 0.7 × refinement + 0.3 × (1 - stub_penalty)
        const health = REFINEMENT_WEIGHT * refinement + STUB_WEIGHT * (1 - stubPenalty);

        // Calculate usefulness margin
        const audienceGate = audience ? AUDIENCE_GATES[audience] : 0;
        const usefulnessMargin = refinement - audienceGate;

        const snapshot: HealthSnapshot = {
            id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            documentPath,
            timestamp: new Date().toISOString(),
            refinement,
            stubPenalty,
            health,
            stubCount,
            blockingStubCount,
            audience,
            usefulnessMargin,
        };

        // Store snapshot
        if (!this.snapshots.has(documentPath)) {
            this.snapshots.set(documentPath, []);
        }

        const docSnapshots = this.snapshots.get(documentPath)!;
        docSnapshots.push(snapshot);

        // Trim to max snapshots
        if (docSnapshots.length > this.config.maxSnapshots) {
            docSnapshots.shift();
        }

        logger.debug('health-calculation', 'Health snapshot recorded', {
            documentPath,
            health: health.toFixed(3),
            refinement: refinement.toFixed(3),
            stubCount,
        });

        return snapshot;
    }

    /**
     * Get all snapshots for a document
     */
    getSnapshots(documentPath: string): HealthSnapshot[] {
        return this.snapshots.get(documentPath) || [];
    }

    /**
     * Get latest snapshot for a document
     */
    getLatestSnapshot(documentPath: string): HealthSnapshot | undefined {
        const docSnapshots = this.snapshots.get(documentPath);
        return docSnapshots ? docSnapshots[docSnapshots.length - 1] : undefined;
    }

    /**
     * Get snapshots within a time window
     */
    getSnapshotsInWindow(documentPath: string, days: number): HealthSnapshot[] {
        const docSnapshots = this.snapshots.get(documentPath) || [];
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

        return docSnapshots.filter(s =>
            new Date(s.timestamp).getTime() >= cutoff,
        );
    }

    // =========================================================================
    // TREND ANALYSIS
    // =========================================================================

    /**
     * Analyze health trend for a document
     */
    analyzeTrend(documentPath: string): HealthTrend | null {
        const snapshots = this.getSnapshotsInWindow(documentPath, this.config.trendWindowDays);

        if (snapshots.length < this.config.minSnapshotsForTrend) {
            logger.debug('health-calculation', 'Insufficient snapshots for trend analysis', {
                documentPath,
                snapshotCount: snapshots.length,
                required: this.config.minSnapshotsForTrend,
            });
            return null;
        }

        const firstSnapshot = snapshots[0];
        const latestSnapshot = snapshots[snapshots.length - 1];

        // Calculate time span in days
        const timeSpanMs = new Date(latestSnapshot.timestamp).getTime() -
            new Date(firstSnapshot.timestamp).getTime();
        const timeSpanDays = Math.max(timeSpanMs / (24 * 60 * 60 * 1000), 1);

        // Calculate deltas
        const healthDelta = latestSnapshot.health - firstSnapshot.health;
        const refinementDelta = latestSnapshot.refinement - firstSnapshot.refinement;

        // Calculate slope and velocity
        const slope = healthDelta / timeSpanDays;
        const velocity = refinementDelta / timeSpanDays;

        // Determine direction
        let direction: HealthTrend['direction'];
        if (Math.abs(slope) < this.config.stableThreshold) {
            direction = 'stable';
        } else if (slope > 0) {
            direction = 'improving';
        } else {
            direction = 'declining';
        }

        // Calculate confidence based on snapshot density and consistency
        const snapshotDensity = snapshots.length / timeSpanDays;
        const consistency = this.calculateConsistency(snapshots);
        const confidence = Math.min(0.5 + snapshotDensity * 0.25 + consistency * 0.25, 1);

        return {
            documentPath,
            snapshotCount: snapshots.length,
            firstSnapshot: firstSnapshot.timestamp,
            latestSnapshot: latestSnapshot.timestamp,
            currentHealth: latestSnapshot.health,
            healthDelta,
            slope,
            velocity,
            direction,
            confidence,
        };
    }

    /**
     * Calculate consistency of trend (how linear is the progression)
     */
    private calculateConsistency(snapshots: HealthSnapshot[]): number {
        if (snapshots.length < 3) return 0.5;

        // Calculate how many snapshots follow the overall trend direction
        const overallDirection = snapshots[snapshots.length - 1].health - snapshots[0].health;
        let consistentCount = 0;

        for (let i = 1; i < snapshots.length; i++) {
            const stepDirection = snapshots[i].health - snapshots[i - 1].health;
            if (Math.sign(stepDirection) === Math.sign(overallDirection) ||
                Math.abs(stepDirection) < 0.01) {
                consistentCount++;
            }
        }

        return consistentCount / (snapshots.length - 1);
    }

    // =========================================================================
    // FORECASTING
    // =========================================================================

    /**
     * Forecast days to target refinement
     */
    forecastDaysToTarget(documentPath: string): RefinementForecast | null {
        const trend = this.analyzeTrend(documentPath);
        const latestSnapshot = this.getLatestSnapshot(documentPath);

        if (!latestSnapshot) {
            return null;
        }

        const audience = latestSnapshot.audience || 'personal';
        const targetRefinement = AUDIENCE_GATES[audience];
        const currentRefinement = latestSnapshot.refinement;
        const gap = targetRefinement - currentRefinement;

        const risks: string[] = [];
        const recommendations: string[] = [];

        // Calculate velocity (use trend if available, otherwise estimate)
        let currentVelocity = 0;
        if (trend) {
            currentVelocity = trend.velocity;
        }

        // Determine if target is achievable
        let estimatedDays: number | null = null;
        let achievable = false;

        if (gap <= 0) {
            // Already at or above target
            achievable = true;
            estimatedDays = 0;
        } else if (currentVelocity > 0.001) {
            // Making progress
            estimatedDays = Math.ceil(gap / currentVelocity);
            achievable = estimatedDays < 365; // Consider achievable if less than a year

            if (estimatedDays > 90) {
                risks.push('Long timeline - consider increasing improvement frequency');
            }
        } else if (currentVelocity < -0.001) {
            // Declining
            risks.push('Document health is declining');
            recommendations.push('Review recent changes and identify quality regression causes');
        } else {
            // Stagnant
            risks.push('No improvement velocity detected');
            recommendations.push('Begin active document development to make progress');
        }

        // Add audience-specific recommendations
        if (gap > 0.3) {
            recommendations.push(`Significant work needed to reach ${audience} audience gate`);
        }

        if (latestSnapshot.blockingStubCount > 0) {
            risks.push(`${latestSnapshot.blockingStubCount} blocking stubs preventing publication`);
            recommendations.push('Prioritize resolving blocking stubs');
        }

        if (latestSnapshot.stubCount > 10) {
            risks.push('High stub count affecting health score');
            recommendations.push('Consider batch-resolving similar stub types');
        }

        return {
            documentPath,
            currentRefinement,
            targetRefinement,
            gap: Math.max(0, gap),
            currentVelocity,
            estimatedDays,
            achievable,
            risks,
            recommendations,
        };
    }

    // =========================================================================
    // HEALTH CALCULATIONS
    // =========================================================================

    /**
     * Calculate health score from components
     */
    calculateHealth(refinement: number, stubCount: number): number {
        const stubPenalty = Math.min(stubCount * 0.05, 0.3);
        return REFINEMENT_WEIGHT * refinement + STUB_WEIGHT * (1 - stubPenalty);
    }

    /**
     * Calculate usefulness margin for an audience
     */
    calculateUsefulnessMargin(
        refinement: number,
        audience: 'personal' | 'internal' | 'trusted' | 'public',
    ): number {
        return refinement - AUDIENCE_GATES[audience];
    }

    /**
     * Check if document meets audience gate
     */
    meetsAudienceGate(
        refinement: number,
        audience: 'personal' | 'internal' | 'trusted' | 'public',
    ): boolean {
        return refinement >= AUDIENCE_GATES[audience];
    }

    // =========================================================================
    // AGGREGATE ANALYTICS
    // =========================================================================

    /**
     * Get health summary across all tracked documents
     */
    getVaultSummary(): {
        totalDocuments: number;
        avgHealth: number;
        avgRefinement: number;
        improvingCount: number;
        decliningCount: number;
        stableCount: number;
        atRiskDocuments: string[];
    } {
        const documents = Array.from(this.snapshots.keys());
        const summaries: Array<{
            path: string;
            health: number;
            refinement: number;
            trend: HealthTrend | null;
        }> = [];

        for (const path of documents) {
            const latest = this.getLatestSnapshot(path);
            const trend = this.analyzeTrend(path);

            if (latest) {
                summaries.push({
                    path,
                    health: latest.health,
                    refinement: latest.refinement,
                    trend,
                });
            }
        }

        if (summaries.length === 0) {
            return {
                totalDocuments: 0,
                avgHealth: 0,
                avgRefinement: 0,
                improvingCount: 0,
                decliningCount: 0,
                stableCount: 0,
                atRiskDocuments: [],
            };
        }

        const avgHealth = summaries.reduce((sum, s) => sum + s.health, 0) / summaries.length;
        const avgRefinement = summaries.reduce((sum, s) => sum + s.refinement, 0) / summaries.length;

        const improvingCount = summaries.filter(s => s.trend?.direction === 'improving').length;
        const decliningCount = summaries.filter(s => s.trend?.direction === 'declining').length;
        const stableCount = summaries.filter(s =>
            !s.trend || s.trend.direction === 'stable',
        ).length;

        // Documents at risk: declining or low health
        const atRiskDocuments = summaries
            .filter(s => s.trend?.direction === 'declining' || s.health < 0.4)
            .map(s => s.path);

        return {
            totalDocuments: summaries.length,
            avgHealth,
            avgRefinement,
            improvingCount,
            decliningCount,
            stableCount,
            atRiskDocuments,
        };
    }

    // =========================================================================
    // PERSISTENCE
    // =========================================================================

    /**
     * Export all snapshots for persistence
     */
    exportSnapshots(): Record<string, HealthSnapshot[]> {
        const result: Record<string, HealthSnapshot[]> = {};
        for (const [path, snapshots] of this.snapshots) {
            result[path] = [...snapshots];
        }
        return result;
    }

    /**
     * Import snapshots from persistence
     */
    importSnapshots(data: Record<string, HealthSnapshot[]>): void {
        for (const [path, snapshots] of Object.entries(data)) {
            this.snapshots.set(path, snapshots);
        }
    }

    /**
     * Clear all snapshots
     */
    clear(): void {
        this.snapshots.clear();
    }

    /**
     * Clear snapshots for a specific document
     */
    clearDocument(documentPath: string): void {
        this.snapshots.delete(documentPath);
    }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

/**
 * Default health monitor instance
 */
export const healthMonitor = new HealthMonitor();
