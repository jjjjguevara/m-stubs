/**
 * Doc Doctor Observability Module
 *
 * Provides logging, tracing, and metrics infrastructure for debugging,
 * performance analysis, and agent workflow monitoring.
 */

export {
    // Logger
    DocDoctorLogger,
    logger,
    createTracedLogger,
    type LogLevel,
    type LogCategory,
    type LogEntry,
    type LoggerConfig,
    type TraceContext,
} from './logger';

export {
    // Milestone Tracker
    MilestoneTracker,
    WorkflowTracker,
    PhaseTracker,
    LLMPhaseTracker,
    milestoneTracker,
    type Milestone,
    type MilestoneEvent,
    type MilestoneTimings,
    type TimingStatistics,
} from './milestone-tracker';

export {
    // LLM Comparator
    LLMComparator,
    llmComparator,
    DEFAULT_COMPARATOR_CONFIG,
    type ProviderResult,
    type SuggestionComparison,
    type QualityMetrics,
    type EfficiencyMetrics,
    type ComparisonResult,
    type ComparatorConfig,
} from './llm-comparator';

export {
    // Acceptance Tracker
    AcceptanceTracker,
    acceptanceTracker,
    DEFAULT_TRACKER_CONFIG,
    type SuggestionAction,
    type RejectionReason,
    type AcceptanceEvent,
    type AcceptanceStats,
    type TypeStats,
    type AcceptanceTrackerConfig,
} from './acceptance-tracker';
