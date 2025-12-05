/**
 * Interaction Recorder for Test Harness
 *
 * Records LLM interactions for deterministic replay in tests.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { TaskMetrics, TaskFamily } from './metrics-collector';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Document state at time of interaction
 */
export interface RecordedDocumentState {
    path: string;
    title: string;
    content: string;
    refinement: number;
    origin?: string;
    form?: string;
    audience?: string;
    existingStubs: Array<{
        type: string;
        description: string;
        stub_form: string;
        priority?: string;
    }>;
}

/**
 * Tool call with results
 */
export interface RecordedToolCall {
    tool: string;
    args: Record<string, unknown>;
    result: unknown;
    latencyMs: number;
    success: boolean;
    error?: string;
}

/**
 * Verified reference
 */
export interface RecordedReference {
    reference: string;
    type: string;
    verified: boolean;
    method: string;
    confidence: number;
}

/**
 * A complete recorded interaction
 */
export interface RecordedInteraction {
    /** Unique ID */
    id: string;

    /** Recording timestamp */
    timestamp: string;

    /** Version for compatibility */
    version: string;

    /** Task family classification */
    taskFamily: TaskFamily;

    // Input context
    /** Document state */
    documentState: RecordedDocumentState;

    /** Creativity mode used */
    creativityMode: string;

    /** Tool policy */
    toolPolicy: string;

    // LLM interaction
    /** System prompt sent */
    systemPrompt: string;

    /** User prompt sent */
    userPrompt: string;

    /** Provider used */
    provider: string;

    /** Model used */
    model: string;

    /** Temperature */
    temperature: number;

    /** Raw LLM response */
    rawResponse: string;

    /** Parsed response */
    parsedResponse: unknown;

    // Tool calls
    /** Tool calls made during interaction */
    toolCalls: RecordedToolCall[];

    // Verification
    /** References found and verification status */
    references: RecordedReference[];

    /** Verification summary */
    verificationSummary: {
        total: number;
        verified: number;
        unverified: number;
        verificationRate: number;
    };

    // Metrics
    /** Task metrics */
    metrics: Omit<TaskMetrics, 'taskId' | 'timestamp'>;

    // Outcome
    /** Whether interaction was successful */
    success: boolean;

    /** Error if failed */
    error?: {
        type: string;
        message: string;
    };
}

/**
 * Recording session metadata
 */
export interface RecordingSession {
    sessionId: string;
    startTime: string;
    endTime?: string;
    interactionCount: number;
    environment: {
        provider: string;
        model: string;
        nodeVersion: string;
    };
}

// =============================================================================
// RECORDER CLASS
// =============================================================================

/**
 * Records LLM interactions for replay
 */
export class InteractionRecorder {
    private outputDir: string;
    private session: RecordingSession;
    private interactions: RecordedInteraction[] = [];

    constructor(outputDir: string) {
        this.outputDir = outputDir;
        this.session = {
            sessionId: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            startTime: new Date().toISOString(),
            interactionCount: 0,
            environment: {
                provider: '',
                model: '',
                nodeVersion: process.version,
            },
        };
    }

    /**
     * Start a new recording
     */
    startRecording(provider: string, model: string): void {
        this.session = {
            sessionId: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            startTime: new Date().toISOString(),
            interactionCount: 0,
            environment: {
                provider,
                model,
                nodeVersion: process.version,
            },
        };
        this.interactions = [];
    }

    /**
     * Record an interaction
     */
    record(interaction: Omit<RecordedInteraction, 'id' | 'timestamp' | 'version'>): string {
        const id = `interaction-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        const fullInteraction: RecordedInteraction = {
            ...interaction,
            id,
            timestamp: new Date().toISOString(),
            version: '1.0.0',
        };

        this.interactions.push(fullInteraction);
        this.session.interactionCount++;

        return id;
    }

    /**
     * Get all recorded interactions
     */
    getInteractions(): RecordedInteraction[] {
        return [...this.interactions];
    }

    /**
     * Get interaction by ID
     */
    getInteraction(id: string): RecordedInteraction | undefined {
        return this.interactions.find(i => i.id === id);
    }

    /**
     * Get interactions by task family
     */
    getByFamily(family: TaskFamily): RecordedInteraction[] {
        return this.interactions.filter(i => i.taskFamily === family);
    }

    /**
     * Save recordings to disk
     */
    async save(): Promise<string> {
        this.session.endTime = new Date().toISOString();

        // Ensure output directory exists
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }

        const filename = `${this.session.sessionId}.json`;
        const filepath = path.join(this.outputDir, filename);

        const data = {
            session: this.session,
            interactions: this.interactions,
        };

        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));

        return filepath;
    }

    /**
     * Save individual interaction
     */
    async saveInteraction(interaction: RecordedInteraction): Promise<string> {
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }

        const filename = `${interaction.id}.json`;
        const filepath = path.join(this.outputDir, filename);

        fs.writeFileSync(filepath, JSON.stringify(interaction, null, 2));

        return filepath;
    }

    /**
     * Load recordings from disk
     */
    static async load(filepath: string): Promise<{
        session: RecordingSession;
        interactions: RecordedInteraction[];
    }> {
        const content = fs.readFileSync(filepath, 'utf-8');
        return JSON.parse(content);
    }

    /**
     * Load a single interaction
     */
    static async loadInteraction(filepath: string): Promise<RecordedInteraction> {
        const content = fs.readFileSync(filepath, 'utf-8');
        return JSON.parse(content);
    }

    /**
     * List all recording files in a directory
     */
    static listRecordings(dir: string): string[] {
        if (!fs.existsSync(dir)) {
            return [];
        }

        return fs.readdirSync(dir)
            .filter(f => f.endsWith('.json'))
            .map(f => path.join(dir, f));
    }

    /**
     * Get recording summary
     */
    getSummary(): {
        sessionId: string;
        interactionCount: number;
        byFamily: Record<TaskFamily, number>;
        successRate: number;
        avgGroundingScore: number;
    } {
        const byFamily: Record<string, number> = {
            combinatorial: 0,
            synoptic: 0,
            generative: 0,
            operational: 0,
            learning: 0,
        };

        let successCount = 0;
        let totalGrounding = 0;

        for (const interaction of this.interactions) {
            byFamily[interaction.taskFamily]++;
            if (interaction.success) successCount++;
            totalGrounding += interaction.metrics.groundingScore;
        }

        return {
            sessionId: this.session.sessionId,
            interactionCount: this.interactions.length,
            byFamily: byFamily as Record<TaskFamily, number>,
            successRate: this.interactions.length > 0
                ? successCount / this.interactions.length
                : 0,
            avgGroundingScore: this.interactions.length > 0
                ? totalGrounding / this.interactions.length
                : 0,
        };
    }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a document state snapshot for recording
 */
export function createDocumentSnapshot(
    path: string,
    title: string,
    content: string,
    refinement: number,
    options: {
        origin?: string;
        form?: string;
        audience?: string;
        existingStubs?: Array<{
            type: string;
            description: string;
            stub_form: string;
            priority?: string;
        }>;
    } = {},
): RecordedDocumentState {
    return {
        path,
        title,
        content,
        refinement,
        origin: options.origin,
        form: options.form,
        audience: options.audience,
        existingStubs: options.existingStubs || [],
    };
}
