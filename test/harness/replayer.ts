/**
 * Interaction Replayer for Test Harness
 *
 * Replays recorded LLM interactions for deterministic testing.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { RecordedInteraction, RecordingSession } from './recorder';
import type { TaskFamily } from './metrics-collector';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Replay configuration
 */
export interface ReplayConfig {
    /** Whether to simulate latency from recordings */
    simulateLatency: boolean;

    /** Latency multiplier (1.0 = original, 0 = instant) */
    latencyMultiplier: number;

    /** Whether to verify outputs match recordings */
    verifyOutputs: boolean;

    /** Tolerance for floating-point comparisons */
    floatTolerance: number;
}

/**
 * Result of a replay comparison
 */
export interface ReplayComparison {
    /** Whether outputs match */
    matches: boolean;

    /** Differences found */
    differences: Array<{
        path: string;
        expected: unknown;
        actual: unknown;
    }>;

    /** Similarity score (0-1) */
    similarityScore: number;
}

/**
 * Replay result for a single interaction
 */
export interface ReplayResult {
    /** Interaction ID */
    interactionId: string;

    /** Whether replay succeeded */
    success: boolean;

    /** Comparison with original */
    comparison?: ReplayComparison;

    /** Actual output from replay */
    actualOutput?: unknown;

    /** Error if failed */
    error?: string;

    /** Replay duration */
    durationMs: number;
}

// =============================================================================
// REPLAYER CLASS
// =============================================================================

/**
 * Replays recorded interactions for testing
 */
export class InteractionReplayer {
    private recordings: Map<string, RecordedInteraction> = new Map();
    private config: ReplayConfig;

    constructor(config: Partial<ReplayConfig> = {}) {
        this.config = {
            simulateLatency: false,
            latencyMultiplier: 0,
            verifyOutputs: true,
            floatTolerance: 0.001,
            ...config,
        };
    }

    /**
     * Load recordings from a directory
     */
    async loadFromDirectory(dir: string): Promise<number> {
        if (!fs.existsSync(dir)) {
            return 0;
        }

        const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
        let count = 0;

        for (const file of files) {
            const filepath = path.join(dir, file);
            const content = fs.readFileSync(filepath, 'utf-8');
            const data = JSON.parse(content);

            // Check if it's a session file or individual interaction
            if ('session' in data && 'interactions' in data) {
                for (const interaction of data.interactions as RecordedInteraction[]) {
                    this.recordings.set(interaction.id, interaction);
                    count++;
                }
            } else if ('id' in data) {
                this.recordings.set(data.id, data as RecordedInteraction);
                count++;
            }
        }

        return count;
    }

    /**
     * Load a single recording
     */
    loadRecording(interaction: RecordedInteraction): void {
        this.recordings.set(interaction.id, interaction);
    }

    /**
     * Get a recording by ID
     */
    getRecording(id: string): RecordedInteraction | undefined {
        return this.recordings.get(id);
    }

    /**
     * Get all recordings
     */
    getAllRecordings(): RecordedInteraction[] {
        return Array.from(this.recordings.values());
    }

    /**
     * Get recordings by task family
     */
    getByFamily(family: TaskFamily): RecordedInteraction[] {
        return Array.from(this.recordings.values())
            .filter(r => r.taskFamily === family);
    }

    /**
     * Find a matching recording for given inputs
     */
    findMatch(criteria: {
        documentPath?: string;
        taskFamily?: TaskFamily;
        creativityMode?: string;
        promptHash?: string;
    }): RecordedInteraction | undefined {
        for (const recording of this.recordings.values()) {
            let matches = true;

            if (criteria.documentPath && recording.documentState.path !== criteria.documentPath) {
                matches = false;
            }
            if (criteria.taskFamily && recording.taskFamily !== criteria.taskFamily) {
                matches = false;
            }
            if (criteria.creativityMode && recording.creativityMode !== criteria.creativityMode) {
                matches = false;
            }
            if (criteria.promptHash) {
                const recordingHash = this.hashPrompts(recording.systemPrompt, recording.userPrompt);
                if (recordingHash !== criteria.promptHash) {
                    matches = false;
                }
            }

            if (matches) {
                return recording;
            }
        }

        return undefined;
    }

    /**
     * Replay a recorded interaction (returns the recorded response)
     */
    async replay(id: string): Promise<ReplayResult> {
        const startTime = Date.now();
        const recording = this.recordings.get(id);

        if (!recording) {
            return {
                interactionId: id,
                success: false,
                error: `Recording not found: ${id}`,
                durationMs: Date.now() - startTime,
            };
        }

        // Simulate latency if configured
        if (this.config.simulateLatency && recording.metrics.totalLatencyMs > 0) {
            const delay = recording.metrics.totalLatencyMs * this.config.latencyMultiplier;
            await this.sleep(delay);
        }

        return {
            interactionId: id,
            success: true,
            actualOutput: recording.parsedResponse,
            durationMs: Date.now() - startTime,
        };
    }

    /**
     * Compare actual output with recorded output
     */
    compare(recorded: RecordedInteraction, actual: unknown): ReplayComparison {
        const differences: Array<{
            path: string;
            expected: unknown;
            actual: unknown;
        }> = [];

        this.compareObjects(recorded.parsedResponse, actual, '', differences);

        const totalFields = this.countFields(recorded.parsedResponse);
        const matchingFields = totalFields - differences.length;
        const similarityScore = totalFields > 0 ? matchingFields / totalFields : 1;

        return {
            matches: differences.length === 0,
            differences,
            similarityScore,
        };
    }

    /**
     * Create a mock LLM service that returns recorded responses
     */
    createMockService(): MockLLMService {
        return new MockLLMService(this);
    }

    /**
     * Get recording statistics
     */
    getStatistics(): {
        totalRecordings: number;
        byFamily: Record<TaskFamily, number>;
        byProvider: Record<string, number>;
        avgLatency: number;
        successRate: number;
    } {
        const recordings = Array.from(this.recordings.values());

        const byFamily: Record<string, number> = {
            combinatorial: 0,
            synoptic: 0,
            generative: 0,
            operational: 0,
            learning: 0,
        };

        const byProvider: Record<string, number> = {};
        let totalLatency = 0;
        let successCount = 0;

        for (const recording of recordings) {
            byFamily[recording.taskFamily]++;
            byProvider[recording.provider] = (byProvider[recording.provider] || 0) + 1;
            totalLatency += recording.metrics.totalLatencyMs;
            if (recording.success) successCount++;
        }

        return {
            totalRecordings: recordings.length,
            byFamily: byFamily as Record<TaskFamily, number>,
            byProvider,
            avgLatency: recordings.length > 0 ? totalLatency / recordings.length : 0,
            successRate: recordings.length > 0 ? successCount / recordings.length : 0,
        };
    }

    /**
     * Clear all recordings
     */
    clear(): void {
        this.recordings.clear();
    }

    // =========================================================================
    // PRIVATE METHODS
    // =========================================================================

    private hashPrompts(system: string, user: string): string {
        // Simple hash for prompt matching
        const combined = system + '|||' + user;
        let hash = 0;
        for (let i = 0; i < combined.length; i++) {
            const char = combined.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    }

    private compareObjects(
        expected: unknown,
        actual: unknown,
        path: string,
        differences: Array<{ path: string; expected: unknown; actual: unknown }>,
    ): void {
        if (expected === actual) {
            return;
        }

        if (typeof expected === 'number' && typeof actual === 'number') {
            if (Math.abs(expected - actual) <= this.config.floatTolerance) {
                return;
            }
        }

        if (expected === null || actual === null) {
            differences.push({ path, expected, actual });
            return;
        }

        if (typeof expected !== typeof actual) {
            differences.push({ path, expected, actual });
            return;
        }

        if (Array.isArray(expected) && Array.isArray(actual)) {
            if (expected.length !== actual.length) {
                differences.push({ path: `${path}.length`, expected: expected.length, actual: actual.length });
            }
            const maxLen = Math.max(expected.length, actual.length);
            for (let i = 0; i < maxLen; i++) {
                this.compareObjects(expected[i], actual[i], `${path}[${i}]`, differences);
            }
            return;
        }

        if (typeof expected === 'object' && typeof actual === 'object') {
            const expectedObj = expected as Record<string, unknown>;
            const actualObj = actual as Record<string, unknown>;
            const allKeys = new Set([...Object.keys(expectedObj), ...Object.keys(actualObj)]);

            for (const key of allKeys) {
                this.compareObjects(expectedObj[key], actualObj[key], `${path}.${key}`, differences);
            }
            return;
        }

        differences.push({ path, expected, actual });
    }

    private countFields(obj: unknown): number {
        if (obj === null || obj === undefined) {
            return 0;
        }

        if (typeof obj !== 'object') {
            return 1;
        }

        if (Array.isArray(obj)) {
            let count = 0;
            for (const item of obj) {
                count += this.countFields(item);
            }
            return count;
        }

        let count = 0;
        for (const value of Object.values(obj as Record<string, unknown>)) {
            count += this.countFields(value);
        }
        return count;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// =============================================================================
// MOCK LLM SERVICE
// =============================================================================

/**
 * Mock LLM service that returns recorded responses
 */
export class MockLLMService {
    private replayer: InteractionReplayer;

    constructor(replayer: InteractionReplayer) {
        this.replayer = replayer;
    }

    /**
     * Analyze document using recorded response
     */
    async analyzeDocument(
        documentPath: string,
        taskFamily: TaskFamily,
        creativityMode: string,
    ): Promise<{
        response: unknown;
        fromRecording: boolean;
        recordingId?: string;
    }> {
        const recording = this.replayer.findMatch({
            documentPath,
            taskFamily,
            creativityMode,
        });

        if (recording) {
            return {
                response: recording.parsedResponse,
                fromRecording: true,
                recordingId: recording.id,
            };
        }

        // No matching recording found
        return {
            response: null,
            fromRecording: false,
        };
    }

    /**
     * Get tool call results from recording
     */
    getToolResults(recordingId: string, toolName: string): unknown[] {
        const recording = this.replayer.getRecording(recordingId);
        if (!recording) {
            return [];
        }

        return recording.toolCalls
            .filter(tc => tc.tool === toolName && tc.success)
            .map(tc => tc.result);
    }
}
