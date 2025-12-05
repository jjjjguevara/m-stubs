/**
 * Doc Doctor Orchestrator
 *
 * Core orchestration layer implementing the 5-function protocol:
 * 1. Discovery - Scan document for stubs, calculate priority scores
 * 2. Assignment - Map stubs to vector families, select reliability tier
 * 3. Routing - Choose tools based on family and policy
 * 4. Forecasting - Estimate completion using E_p / v_eff
 * 5. Monitoring - Track progress, detect friction/stalls
 */

import type { VectorFamily, ParsedStub, StubTypeDefinition } from '../stubs/stubs-types';
import type { ToolUsePolicy, StubInstance } from '../schema/schema-types';
import type { TaskFamily } from '../../test/harness/metrics-collector';
import { logger, type TraceContext } from '../observability/logger';
import { milestoneTracker } from '../observability/milestone-tracker';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Reliability tier based on vector family characteristics
 */
export type ReliabilityTier = 'high' | 'medium' | 'low';

/**
 * Review pattern for output validation
 */
export type ReviewPattern =
    | 'auto-with-spot-check'
    | 'validate-computation'
    | 'human-review-required'
    | 'generate-options-human-select'
    | 'validate-topology';

/**
 * Document state for orchestration
 */
export interface OrchestrationDocumentState {
    /** Document path */
    path: string;

    /** Document title */
    title: string;

    /** Document content */
    content: string;

    /** Current refinement score (0-1) */
    refinement: number;

    /** Document origin */
    origin?: string;

    /** Document form */
    form?: 'transient' | 'developing' | 'stable' | 'evergreen' | 'canonical';

    /** Target audience */
    audience?: 'personal' | 'internal' | 'trusted' | 'public';

    /** Existing stubs from frontmatter */
    existingStubs: ParsedStub[];

    /** Available stub type definitions */
    stubTypes: Record<string, StubTypeDefinition>;
}

/**
 * Discovered task from document analysis
 */
export interface DiscoveredTask {
    /** Unique task ID */
    id: string;

    /** Source stub (if from existing stub) */
    stub?: ParsedStub;

    /** Stub type key */
    stubType: string;

    /** Task description */
    description: string;

    /** Vector family */
    vectorFamily: VectorFamily;

    /** Task family classification */
    taskFamily: TaskFamily;

    /** Priority score (0-1) */
    priorityScore: number;

    /** Potential energy (urgency * impact * complexity) */
    potentialEnergy: number;

    /** Whether this is a blocking task */
    blocking: boolean;

    /** Location in document */
    location?: {
        lineNumber: number;
        section?: string;
    };
}

/**
 * Task assignment with reliability context
 */
export interface TaskAssignment {
    /** Task reference */
    task: DiscoveredTask;

    /** Assigned reliability tier */
    reliabilityTier: ReliabilityTier;

    /** Required review pattern */
    reviewPattern: ReviewPattern;

    /** Recommended tools for this task */
    recommendedTools: string[];

    /** Tool use policy for this assignment */
    toolPolicy: ToolUsePolicy;

    /** Confidence in assignment (0-1) */
    confidence: number;
}

/**
 * Orchestration plan for document improvement
 */
export interface OrchestrationPlan {
    /** Plan ID */
    id: string;

    /** Trace context for observability */
    traceContext: TraceContext;

    /** Document state snapshot */
    documentState: OrchestrationDocumentState;

    /** Discovered tasks */
    tasks: DiscoveredTask[];

    /** Task assignments */
    assignments: TaskAssignment[];

    /** Execution order (task IDs sorted by priority) */
    executionOrder: string[];

    /** Forecast */
    forecast: Forecast;

    /** Plan creation timestamp */
    createdAt: string;
}

/**
 * Completion forecast
 */
export interface Forecast {
    /** Estimated total potential energy to resolve */
    totalPotentialEnergy: number;

    /** Estimated effective velocity (stubs resolved per session) */
    estimatedVelocity: number;

    /** Estimated sessions to completion */
    estimatedSessions: number;

    /** Estimated refinement improvement per session */
    refinementDeltaPerSession: number;

    /** Estimated target refinement after all tasks */
    projectedRefinement: number;

    /** Confidence in forecast (0-1) */
    confidence: number;

    /** Risk factors that may affect forecast */
    risks: string[];
}

/**
 * Execution progress for monitoring
 */
export interface ExecutionProgress {
    /** Plan ID */
    planId: string;

    /** Current task being executed */
    currentTaskId: string | null;

    /** Completed task IDs */
    completedTasks: string[];

    /** Failed task IDs with reasons */
    failedTasks: Array<{ taskId: string; reason: string }>;

    /** Skipped task IDs with reasons */
    skippedTasks: Array<{ taskId: string; reason: string }>;

    /** Progress percentage (0-100) */
    progressPercent: number;

    /** Friction indicators */
    friction: FrictionIndicator[];

    /** Whether execution is stalled */
    stalled: boolean;

    /** Start timestamp */
    startedAt: string;

    /** Last update timestamp */
    lastUpdatedAt: string;
}

/**
 * Friction indicator during execution
 */
export interface FrictionIndicator {
    /** Type of friction */
    type: 'tool_failure' | 'slow_progress' | 'repeated_failure' | 'low_quality' | 'user_rejection';

    /** Severity (1-5) */
    severity: number;

    /** Description */
    message: string;

    /** Related task ID */
    taskId?: string;

    /** Timestamp */
    timestamp: string;
}

/**
 * Execution result
 */
export interface ExecutionResult {
    /** Plan ID */
    planId: string;

    /** Whether execution completed successfully */
    success: boolean;

    /** Final progress state */
    progress: ExecutionProgress;

    /** Results per task */
    taskResults: Array<{
        taskId: string;
        success: boolean;
        output?: unknown;
        error?: string;
        durationMs: number;
    }>;

    /** Total duration */
    totalDurationMs: number;

    /** Actual refinement improvement */
    actualRefinementDelta: number;

    /** Summary */
    summary: string;
}

/**
 * Progress callback during execution
 */
export type ProgressCallback = (progress: ExecutionProgress) => void;

/**
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
    /** Default tool policy when not specified */
    defaultToolPolicy: ToolUsePolicy;

    /** Maximum tasks to execute in a single session */
    maxTasksPerSession: number;

    /** Timeout per task in milliseconds */
    taskTimeoutMs: number;

    /** Whether to auto-skip failed tasks */
    autoSkipOnFailure: boolean;

    /** Friction threshold to trigger stall */
    stallFrictionThreshold: number;

    /** Historical velocity for forecasting (stubs/session) */
    historicalVelocity: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Default orchestrator configuration
 */
export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
    defaultToolPolicy: 'encouraged',
    maxTasksPerSession: 10,
    taskTimeoutMs: 30000,
    autoSkipOnFailure: true,
    stallFrictionThreshold: 3,
    historicalVelocity: 5,
};

/**
 * Vector family to reliability tier mapping
 */
export const VECTOR_FAMILY_RELIABILITY: Record<VectorFamily, ReliabilityTier> = {
    Retrieval: 'high',
    Computation: 'high',
    Synthesis: 'medium',
    Creation: 'low',
    Structural: 'medium',
};

/**
 * Vector family to review pattern mapping
 */
export const VECTOR_FAMILY_REVIEW_PATTERN: Record<VectorFamily, ReviewPattern> = {
    Retrieval: 'auto-with-spot-check',
    Computation: 'validate-computation',
    Synthesis: 'human-review-required',
    Creation: 'generate-options-human-select',
    Structural: 'validate-topology',
};

/**
 * Vector family to task family mapping
 */
export const VECTOR_FAMILY_TASK_FAMILY: Record<VectorFamily, TaskFamily> = {
    Retrieval: 'combinatorial',
    Computation: 'combinatorial',
    Synthesis: 'synoptic',
    Creation: 'generative',
    Structural: 'operational',
};

/**
 * Vector family to recommended tools mapping
 */
export const VECTOR_FAMILY_TOOLS: Record<VectorFamily, string[]> = {
    Retrieval: ['web_search', 'openalex_search', 'semantic_search'],
    Computation: ['semantic_search'],
    Synthesis: ['semantic_search'],
    Creation: [],
    Structural: ['semantic_search'],
};

/**
 * Stub type to vector family mapping (for types without explicit vectorFamily)
 */
const DEFAULT_STUB_VECTOR_FAMILY: Record<string, VectorFamily> = {
    // Retrieval
    source: 'Retrieval',
    check: 'Retrieval',
    link: 'Retrieval',
    // Computation
    data: 'Computation',
    // Synthesis
    fix: 'Synthesis',
    cut: 'Synthesis',
    // Creation
    draft: 'Creation',
    expand: 'Creation',
    idea: 'Creation',
    question: 'Creation',
    // Structural
    move: 'Structural',
    restructure: 'Structural',
};

// =============================================================================
// ORCHESTRATOR CLASS
// =============================================================================

/**
 * Doc Doctor Orchestrator
 *
 * Manages the orchestration of document improvement tasks following
 * the J-Editorial Framework's vector-based approach.
 */
export class DocDoctorOrchestrator {
    private config: OrchestratorConfig;
    private activePlans: Map<string, OrchestrationPlan> = new Map();
    private executionProgress: Map<string, ExecutionProgress> = new Map();

    constructor(config: Partial<OrchestratorConfig> = {}) {
        this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };
    }

    // =========================================================================
    // 1. DISCOVERY
    // =========================================================================

    /**
     * Discover tasks from document state
     */
    discoverTasks(document: OrchestrationDocumentState, traceContext?: TraceContext): DiscoveredTask[] {
        const trace = traceContext || this.createTraceContext();
        milestoneTracker.record(trace.traceId, 'discovery-start', { documentPath: document.path });
        logger.info('orchestration', 'Starting task discovery', { documentPath: document.path }, trace);

        const tasks: DiscoveredTask[] = [];

        // Process existing stubs
        for (const stub of document.existingStubs) {
            const task = this.stubToTask(stub, document);
            if (task) {
                tasks.push(task);
            }
        }

        // Sort by priority (blocking first, then by priority score)
        tasks.sort((a, b) => {
            if (a.blocking !== b.blocking) {
                return a.blocking ? -1 : 1;
            }
            return b.priorityScore - a.priorityScore;
        });

        milestoneTracker.record(trace.traceId, 'discovery-complete', {
            taskCount: tasks.length,
            blockingCount: tasks.filter(t => t.blocking).length,
        });

        logger.info('orchestration', `Discovered ${tasks.length} tasks`, {
            blocking: tasks.filter(t => t.blocking).length,
            byFamily: this.countByFamily(tasks),
        }, trace);

        return tasks;
    }

    /**
     * Convert a stub to a discovered task
     */
    private stubToTask(stub: ParsedStub, document: OrchestrationDocumentState): DiscoveredTask | null {
        const stubTypeDef = document.stubTypes[stub.type];
        const vectorFamily = this.determineVectorFamily(stub, stubTypeDef);

        // Calculate priority score
        const priorityScore = this.calculatePriorityScore(stub, document);

        // Calculate potential energy
        const urgency = (stub.properties.urgency as number) || 0.5;
        const impact = (stub.properties.impact as number) || 0.5;
        const complexity = (stub.properties.complexity as number) || 0.5;
        const potentialEnergy = urgency * impact * complexity;

        // Determine if blocking
        const stubForm = stub.properties.stub_form as string;
        const blocking = stubForm === 'blocking';

        return {
            id: `task-${stub.id}`,
            stub,
            stubType: stub.type,
            description: stub.description,
            vectorFamily,
            taskFamily: VECTOR_FAMILY_TASK_FAMILY[vectorFamily],
            priorityScore,
            potentialEnergy,
            blocking,
            location: stub.frontmatterLine
                ? { lineNumber: stub.frontmatterLine }
                : undefined,
        };
    }

    /**
     * Determine vector family for a stub
     */
    private determineVectorFamily(stub: ParsedStub, typeDef?: StubTypeDefinition): VectorFamily {
        // Use explicit vector family from type definition
        if (typeDef?.vectorFamily) {
            return typeDef.vectorFamily;
        }

        // Fall back to default mapping
        return DEFAULT_STUB_VECTOR_FAMILY[stub.type] || 'Creation';
    }

    /**
     * Calculate priority score for a stub
     */
    private calculatePriorityScore(stub: ParsedStub, document: OrchestrationDocumentState): number {
        let score = 0.5; // Base score

        // Priority modifier
        const priority = stub.properties.priority as string;
        if (priority === 'critical') score += 0.4;
        else if (priority === 'high') score += 0.2;
        else if (priority === 'low') score -= 0.2;

        // Blocking modifier
        const stubForm = stub.properties.stub_form as string;
        if (stubForm === 'blocking') score += 0.3;

        // Refinement-based modifier (lower refinement = higher priority)
        score += (1 - document.refinement) * 0.2;

        // Clamp to 0-1
        return Math.max(0, Math.min(1, score));
    }

    // =========================================================================
    // 2. ASSIGNMENT
    // =========================================================================

    /**
     * Assign tasks to families and select reliability tiers
     */
    assignToFamilies(tasks: DiscoveredTask[], traceContext?: TraceContext): TaskAssignment[] {
        const trace = traceContext || this.createTraceContext();
        milestoneTracker.record(trace.traceId, 'assignment-start', { taskCount: tasks.length });

        const assignments: TaskAssignment[] = [];

        for (const task of tasks) {
            const assignment = this.assignTask(task);
            assignments.push(assignment);
        }

        milestoneTracker.record(trace.traceId, 'assignment-complete', {
            assignments: assignments.length,
            byTier: this.countByTier(assignments),
        });

        return assignments;
    }

    /**
     * Create assignment for a single task
     */
    private assignTask(task: DiscoveredTask): TaskAssignment {
        const reliabilityTier = VECTOR_FAMILY_RELIABILITY[task.vectorFamily];
        const reviewPattern = VECTOR_FAMILY_REVIEW_PATTERN[task.vectorFamily];
        const recommendedTools = VECTOR_FAMILY_TOOLS[task.vectorFamily];

        // Determine tool policy based on reliability tier
        let toolPolicy: ToolUsePolicy;
        if (reliabilityTier === 'high') {
            toolPolicy = 'mandatory';
        } else if (reliabilityTier === 'medium') {
            toolPolicy = 'encouraged';
        } else {
            toolPolicy = 'optional';
        }

        // Calculate confidence based on vector family clarity
        const confidence = reliabilityTier === 'high' ? 0.9
            : reliabilityTier === 'medium' ? 0.7
                : 0.5;

        return {
            task,
            reliabilityTier,
            reviewPattern,
            recommendedTools,
            toolPolicy,
            confidence,
        };
    }

    // =========================================================================
    // 3. ROUTING
    // =========================================================================

    /**
     * Select tools for a task assignment
     */
    selectTools(assignment: TaskAssignment): string[] {
        const tools: string[] = [...assignment.recommendedTools];

        // Add semantic search for all tasks that benefit from context
        if (!tools.includes('semantic_search') &&
            assignment.reliabilityTier !== 'low') {
            tools.push('semantic_search');
        }

        return tools;
    }

    // =========================================================================
    // 4. FORECASTING
    // =========================================================================

    /**
     * Forecast completion based on plan
     */
    forecastCompletion(plan: Pick<OrchestrationPlan, 'tasks' | 'documentState'>): Forecast {
        const { tasks, documentState } = plan;

        // Calculate total potential energy
        const totalPotentialEnergy = tasks.reduce((sum, t) => sum + t.potentialEnergy, 0);

        // Use historical velocity (stubs resolved per session)
        const estimatedVelocity = this.config.historicalVelocity;

        // Estimate sessions to completion: E_p / v_eff
        const estimatedSessions = totalPotentialEnergy > 0
            ? Math.ceil(totalPotentialEnergy / (estimatedVelocity * 0.5)) // 0.5 = avg potential energy per stub
            : 0;

        // Estimate refinement improvement
        const stubPenalty = Math.min(tasks.length * 0.05, 0.3);
        const potentialRefinementGain = stubPenalty; // Resolving stubs reduces penalty
        const refinementDeltaPerSession = estimatedSessions > 0
            ? potentialRefinementGain / estimatedSessions
            : 0;

        const projectedRefinement = Math.min(1, documentState.refinement + potentialRefinementGain);

        // Identify risks
        const risks: string[] = [];
        const blockingCount = tasks.filter(t => t.blocking).length;
        if (blockingCount > 3) {
            risks.push(`${blockingCount} blocking stubs may slow progress`);
        }
        const lowReliabilityCount = tasks.filter(t =>
            VECTOR_FAMILY_RELIABILITY[t.vectorFamily] === 'low',
        ).length;
        if (lowReliabilityCount > tasks.length * 0.5) {
            risks.push('Many tasks require creative/generative work with lower predictability');
        }

        // Calculate confidence based on task characteristics
        let confidence = 0.7;
        if (tasks.length > 20) confidence -= 0.2;
        if (blockingCount > 5) confidence -= 0.1;
        if (lowReliabilityCount > tasks.length * 0.3) confidence -= 0.1;

        return {
            totalPotentialEnergy,
            estimatedVelocity,
            estimatedSessions,
            refinementDeltaPerSession,
            projectedRefinement,
            confidence: Math.max(0.1, confidence),
            risks,
        };
    }

    // =========================================================================
    // 5. MONITORING
    // =========================================================================

    /**
     * Execute plan with monitoring
     */
    async executeWithMonitoring(
        plan: OrchestrationPlan,
        onProgress?: ProgressCallback,
    ): Promise<ExecutionResult> {
        const startTime = Date.now();
        milestoneTracker.record(plan.traceContext.traceId, 'tool-execution-start', { planId: plan.id });

        // Initialize progress
        const progress: ExecutionProgress = {
            planId: plan.id,
            currentTaskId: null,
            completedTasks: [],
            failedTasks: [],
            skippedTasks: [],
            progressPercent: 0,
            friction: [],
            stalled: false,
            startedAt: new Date().toISOString(),
            lastUpdatedAt: new Date().toISOString(),
        };

        this.executionProgress.set(plan.id, progress);

        const taskResults: ExecutionResult['taskResults'] = [];
        const totalTasks = plan.executionOrder.length;

        for (let i = 0; i < Math.min(totalTasks, this.config.maxTasksPerSession); i++) {
            const taskId = plan.executionOrder[i];
            const assignment = plan.assignments.find(a => a.task.id === taskId);

            if (!assignment) {
                continue;
            }

            progress.currentTaskId = taskId;
            progress.progressPercent = Math.round((i / totalTasks) * 100);
            progress.lastUpdatedAt = new Date().toISOString();

            if (onProgress) {
                onProgress({ ...progress });
            }

            // Check for stall condition
            if (this.isStalled(progress)) {
                progress.stalled = true;
                logger.warn('orchestration', 'Execution stalled due to friction', {
                    planId: plan.id,
                    frictionCount: progress.friction.length,
                }, plan.traceContext);
                break;
            }

            // Execute task (placeholder - actual execution would call LLM service)
            const taskStartTime = Date.now();
            try {
                // For now, just record the task as completed
                // Real implementation would call the LLM service with appropriate tools
                taskResults.push({
                    taskId,
                    success: true,
                    durationMs: Date.now() - taskStartTime,
                });
                progress.completedTasks.push(taskId);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                taskResults.push({
                    taskId,
                    success: false,
                    error: errorMessage,
                    durationMs: Date.now() - taskStartTime,
                });

                if (this.config.autoSkipOnFailure) {
                    progress.failedTasks.push({ taskId, reason: errorMessage });
                    progress.friction.push({
                        type: 'tool_failure',
                        severity: 2,
                        message: `Task ${taskId} failed: ${errorMessage}`,
                        taskId,
                        timestamp: new Date().toISOString(),
                    });
                } else {
                    throw error;
                }
            }
        }

        progress.currentTaskId = null;
        progress.progressPercent = 100;
        progress.lastUpdatedAt = new Date().toISOString();

        milestoneTracker.record(plan.traceContext.traceId, 'tool-execution-complete', {
            planId: plan.id,
            completed: progress.completedTasks.length,
            failed: progress.failedTasks.length,
        });

        const successCount = taskResults.filter(r => r.success).length;
        const actualRefinementDelta = (successCount / totalTasks) *
            plan.forecast.refinementDeltaPerSession * plan.forecast.estimatedSessions;

        return {
            planId: plan.id,
            success: progress.failedTasks.length === 0 && !progress.stalled,
            progress,
            taskResults,
            totalDurationMs: Date.now() - startTime,
            actualRefinementDelta,
            summary: this.generateSummary(progress, taskResults),
        };
    }

    /**
     * Check if execution is stalled
     */
    private isStalled(progress: ExecutionProgress): boolean {
        const recentFriction = progress.friction.filter(f => {
            const frictionTime = new Date(f.timestamp).getTime();
            const timeSinceStart = Date.now() - new Date(progress.startedAt).getTime();
            return timeSinceStart - frictionTime < 60000; // Within last minute
        });

        const totalSeverity = recentFriction.reduce((sum, f) => sum + f.severity, 0);
        return totalSeverity >= this.config.stallFrictionThreshold;
    }

    /**
     * Generate execution summary
     */
    private generateSummary(
        progress: ExecutionProgress,
        taskResults: ExecutionResult['taskResults'],
    ): string {
        const completed = progress.completedTasks.length;
        const failed = progress.failedTasks.length;
        const total = completed + failed + progress.skippedTasks.length;

        if (progress.stalled) {
            return `Execution stalled after ${completed}/${total} tasks due to friction`;
        }

        if (failed === 0) {
            return `Successfully completed ${completed}/${total} tasks`;
        }

        return `Completed ${completed}/${total} tasks with ${failed} failures`;
    }

    // =========================================================================
    // PLAN MANAGEMENT
    // =========================================================================

    /**
     * Create a complete orchestration plan
     */
    createPlan(document: OrchestrationDocumentState): OrchestrationPlan {
        const traceContext = this.createTraceContext();
        const planId = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        logger.info('orchestration', 'Creating orchestration plan', {
            documentPath: document.path,
            existingStubs: document.existingStubs.length,
        }, traceContext);

        // 1. Discovery
        const tasks = this.discoverTasks(document, traceContext);

        // 2. Assignment
        const assignments = this.assignToFamilies(tasks, traceContext);

        // 3. Determine execution order
        const executionOrder = this.determineExecutionOrder(assignments);

        // Create plan stub for forecasting
        const planStub = { tasks, documentState: document };

        // 4. Forecast
        const forecast = this.forecastCompletion(planStub);

        const plan: OrchestrationPlan = {
            id: planId,
            traceContext,
            documentState: document,
            tasks,
            assignments,
            executionOrder,
            forecast,
            createdAt: new Date().toISOString(),
        };

        this.activePlans.set(planId, plan);

        logger.info('orchestration', 'Orchestration plan created', {
            planId,
            taskCount: tasks.length,
            estimatedSessions: forecast.estimatedSessions,
        }, traceContext);

        return plan;
    }

    /**
     * Determine optimal execution order
     */
    private determineExecutionOrder(assignments: TaskAssignment[]): string[] {
        // Sort by:
        // 1. Blocking tasks first
        // 2. High reliability tier (can be automated)
        // 3. Priority score
        return assignments
            .sort((a, b) => {
                // Blocking first
                if (a.task.blocking !== b.task.blocking) {
                    return a.task.blocking ? -1 : 1;
                }

                // High reliability tier first (more automatable)
                const tierOrder = { high: 0, medium: 1, low: 2 };
                if (tierOrder[a.reliabilityTier] !== tierOrder[b.reliabilityTier]) {
                    return tierOrder[a.reliabilityTier] - tierOrder[b.reliabilityTier];
                }

                // Higher priority first
                return b.task.priorityScore - a.task.priorityScore;
            })
            .map(a => a.task.id);
    }

    /**
     * Get active plan by ID
     */
    getPlan(planId: string): OrchestrationPlan | undefined {
        return this.activePlans.get(planId);
    }

    /**
     * Get execution progress for a plan
     */
    getProgress(planId: string): ExecutionProgress | undefined {
        return this.executionProgress.get(planId);
    }

    // =========================================================================
    // HELPER METHODS
    // =========================================================================

    private createTraceContext(): TraceContext {
        return {
            traceId: `orch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            spanId: `span-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        };
    }

    private countByFamily(tasks: DiscoveredTask[]): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const task of tasks) {
            counts[task.taskFamily] = (counts[task.taskFamily] || 0) + 1;
        }
        return counts;
    }

    private countByTier(assignments: TaskAssignment[]): Record<ReliabilityTier, number> {
        const counts: Record<string, number> = { high: 0, medium: 0, low: 0 };
        for (const assignment of assignments) {
            counts[assignment.reliabilityTier]++;
        }
        return counts as Record<ReliabilityTier, number>;
    }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

/**
 * Default orchestrator instance
 */
export const orchestrator = new DocDoctorOrchestrator();
