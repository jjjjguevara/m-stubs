/**
 * Doc Doctor Orchestration Module
 *
 * Provides task orchestration, health monitoring, and completion forecasting
 * following the J-Editorial Framework's vector-based approach.
 */

export {
    // Orchestrator
    DocDoctorOrchestrator,
    orchestrator,
    DEFAULT_ORCHESTRATOR_CONFIG,
    VECTOR_FAMILY_RELIABILITY,
    VECTOR_FAMILY_REVIEW_PATTERN,
    VECTOR_FAMILY_TASK_FAMILY,
    VECTOR_FAMILY_TOOLS,
    type ReliabilityTier,
    type ReviewPattern,
    type OrchestrationDocumentState,
    type DiscoveredTask,
    type TaskAssignment,
    type OrchestrationPlan,
    type Forecast,
    type ExecutionProgress,
    type FrictionIndicator,
    type ExecutionResult,
    type ProgressCallback,
    type OrchestratorConfig,
} from './orchestrator';

export {
    // Health Monitor
    HealthMonitor,
    healthMonitor,
    DEFAULT_HEALTH_MONITOR_CONFIG,
    AUDIENCE_GATES,
    type HealthSnapshot,
    type HealthTrend,
    type RefinementForecast,
    type HealthMonitorConfig,
} from './health-monitor';
