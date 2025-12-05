/**
 * Test Harness for Doc Doctor
 *
 * Provides recording, replay, and metrics infrastructure for testing
 * LLM integrations with deterministic behavior.
 */

export {
    // Metrics
    MetricsCollector,
    metricsCollector,
    DEFAULT_SUCCESS_CRITERIA,
    type TaskFamily,
    type TaskMetrics,
    type AggregatedMetrics,
    type SuccessCriteria,
} from './metrics-collector';

export {
    // Recording
    InteractionRecorder,
    createDocumentSnapshot,
    type RecordedInteraction,
    type RecordedDocumentState,
    type RecordedToolCall,
    type RecordedReference,
    type RecordingSession,
} from './recorder';

export {
    // Replay
    InteractionReplayer,
    MockLLMService,
    type ReplayConfig,
    type ReplayComparison,
    type ReplayResult,
} from './replayer';
