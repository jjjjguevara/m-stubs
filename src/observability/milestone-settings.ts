/**
 * User-Defined Milestone Settings
 *
 * Allows users to configure custom milestones with:
 * - Triggers: What conditions activate a milestone
 * - Snapshot forms: How to capture state (git operations)
 * - Consequences: What document property changes occur
 */

// =============================================================================
// TRIGGER TYPES
// =============================================================================

/**
 * Numeric threshold trigger (e.g., refinement >= 0.8)
 */
export interface ThresholdTrigger {
    type: 'threshold';
    /** Property to monitor */
    property: 'refinement' | 'health' | 'stub_count' | 'usefulness_margin' | 'potential_energy';
    /** Comparison operator */
    operator: '>=' | '>' | '<=' | '<' | '==';
    /** Target value */
    value: number;
}

/**
 * Event count trigger (e.g., 10 suggestions accepted)
 */
export interface EventCountTrigger {
    type: 'event_count';
    /** Event type to count */
    event:
        | 'suggestion_accepted'
        | 'suggestion_rejected'
        | 'stub_resolved'
        | 'document_analyzed'
        | 'workflow_completed';
    /** Number of events required */
    count: number;
    /** Time window in hours (optional, null = all time) */
    windowHours?: number;
}

/**
 * Event sequence trigger (e.g., draft -> review -> research)
 */
export interface EventSequenceTrigger {
    type: 'event_sequence';
    /** Ordered sequence of events that must occur */
    sequence: Array<{
        event: string;
        /** Max time in minutes between events (null = no limit) */
        maxGapMinutes?: number;
    }>;
}

/**
 * Composite trigger combining multiple conditions
 */
export interface CompositeTrigger {
    type: 'composite';
    /** How to combine triggers */
    operator: 'and' | 'or';
    /** Child triggers */
    triggers: MilestoneTrigger[];
}

export type MilestoneTrigger = ThresholdTrigger | EventCountTrigger | EventSequenceTrigger | CompositeTrigger;

// =============================================================================
// SNAPSHOT FORMS
// =============================================================================

/**
 * Git operation to perform when milestone is reached
 */
export type GitOperation = 'commit' | 'commit_and_push' | 'branch' | 'tag' | 'none';

/**
 * Scope of what gets committed
 */
export type CommitScope = 'document' | 'session' | 'vault';

/**
 * Snapshot configuration - how to capture state
 */
export interface SnapshotForm {
    /** Git operation to perform */
    operation: GitOperation;
    /** Commit message template (supports variables: {{document}}, {{refinement}}, {{milestone}}, {{date}}) */
    messageTemplate?: string;
    /** What scope of changes to include */
    commitScope: CommitScope;
    /** Branch name pattern for 'branch' operation */
    branchPattern?: string;
    /** Tag pattern for 'tag' operation */
    tagPattern?: string;
    /** Whether to auto-push after commit (for 'commit' operation) */
    autoPush?: boolean;
}

// =============================================================================
// CONSEQUENCES
// =============================================================================

/**
 * Refinement value change
 */
export interface RefinementBump {
    type: 'refinement_bump';
    /** Amount to add (positive) or subtract (negative) */
    delta: number;
    /** Maximum value (clamp) */
    max?: number;
    /** Minimum value (clamp) */
    min?: number;
}

/**
 * Property enum change (e.g., audience: internal -> trusted)
 */
export interface PropertyEnumChange {
    type: 'property_enum_change';
    /** Property to change */
    property: 'audience' | 'origin' | 'form';
    /** New value */
    value: string;
}

/**
 * Array mutation (add/remove from array properties)
 */
export interface ArrayMutation {
    type: 'array_mutation';
    /** Property to mutate */
    property: 'tags' | 'links' | 'aliases';
    /** Operation */
    operation: 'add' | 'remove';
    /** Value to add/remove (supports template variables) */
    value: string;
}

/**
 * Stub mutation (mark as resolved, change priority, etc.)
 */
export interface StubMutation {
    type: 'stub_mutation';
    /** Filter for which stubs to affect */
    filter: {
        type?: string;
        priority?: string;
        minAge?: number; // days
    };
    /** Mutation to apply */
    mutation:
        | { action: 'resolve' }
        | { action: 'set_priority'; priority: 'critical' | 'high' | 'medium' | 'low' }
        | { action: 'defer'; days: number };
}

export type MilestoneConsequence = RefinementBump | PropertyEnumChange | ArrayMutation | StubMutation;

// =============================================================================
// MILESTONE SCOPE
// =============================================================================

/**
 * What documents this milestone applies to
 */
export interface MilestoneScope {
    /** Apply to all documents or specific folders/tags */
    mode: 'all' | 'folder' | 'tag' | 'property';
    /** Folder path pattern (for 'folder' mode) */
    folderPattern?: string;
    /** Tag to match (for 'tag' mode) */
    tag?: string;
    /** Property condition (for 'property' mode) */
    property?: {
        name: string;
        operator: '==' | '!=' | 'contains' | 'exists';
        value?: string;
    };
}

// =============================================================================
// USER MILESTONE CONFIG
// =============================================================================

/**
 * Complete user-defined milestone configuration
 */
export interface UserMilestoneConfig {
    /** Unique identifier */
    id: string;
    /** Display name */
    name: string;
    /** Description */
    description?: string;
    /** Whether this milestone is active */
    enabled: boolean;
    /** Trigger condition */
    trigger: MilestoneTrigger;
    /** How to snapshot state */
    snapshotForm: SnapshotForm;
    /** Document property changes */
    consequences: MilestoneConsequence[];
    /** Which documents this applies to */
    scope: MilestoneScope;
    /** Whether milestone can trigger multiple times */
    repeatable: boolean;
    /** Cooldown period in hours (for repeatable milestones) */
    cooldownHours?: number;
    /** Order for evaluation (lower = earlier) */
    priority: number;
}

// =============================================================================
// MILESTONE SETTINGS (for Settings type)
// =============================================================================

/**
 * Milestone settings section for plugin settings
 */
export interface MilestoneSettings {
    /** Enable milestone system */
    enabled: boolean;
    /** User-defined milestones */
    userMilestones: UserMilestoneConfig[];
    /** Enable QA sampling (internal) */
    qaEnabled: boolean;
    /** QA sampling verbosity */
    qaVerbosity: 'minimal' | 'standard' | 'verbose';
    /** Git integration settings */
    git: {
        /** Whether git integration is enabled */
        enabled: boolean;
        /** Default branch for milestone commits */
        defaultBranch: string;
        /** Auto-pull before commit */
        autoPull: boolean;
        /** Sign commits with GPG */
        signCommits: boolean;
    };
}

// =============================================================================
// DEFAULTS
// =============================================================================

/**
 * Default milestone settings
 */
export const DEFAULT_MILESTONE_SETTINGS: MilestoneSettings = {
    enabled: true,
    userMilestones: [],
    qaEnabled: true,
    qaVerbosity: 'standard',
    git: {
        enabled: false,
        defaultBranch: 'main',
        autoPull: true,
        signCommits: false,
    },
};

/**
 * Preset milestone templates
 */
export const MILESTONE_PRESETS: Omit<UserMilestoneConfig, 'id'>[] = [
    {
        name: 'Publication Ready',
        description: 'Triggers when a document reaches publication-ready quality',
        enabled: false,
        trigger: {
            type: 'composite',
            operator: 'and',
            triggers: [
                { type: 'threshold', property: 'refinement', operator: '>=', value: 0.9 },
                { type: 'threshold', property: 'stub_count', operator: '==', value: 0 },
            ],
        },
        snapshotForm: {
            operation: 'commit_and_push',
            messageTemplate: 'milestone: {{document}} ready for publication (r={{refinement}})',
            commitScope: 'document',
        },
        consequences: [
            { type: 'property_enum_change', property: 'audience', value: 'public' },
            { type: 'array_mutation', property: 'tags', operation: 'add', value: 'publication-ready' },
        ],
        scope: { mode: 'all' },
        repeatable: false,
        priority: 10,
    },
    {
        name: 'Research Complete',
        description: 'Triggers when all source stubs are resolved',
        enabled: false,
        trigger: {
            type: 'event_count',
            event: 'stub_resolved',
            count: 5,
        },
        snapshotForm: {
            operation: 'commit',
            messageTemplate: 'research: {{document}} sources verified',
            commitScope: 'document',
        },
        consequences: [{ type: 'refinement_bump', delta: 0.1, max: 1.0 }],
        scope: { mode: 'all' },
        repeatable: true,
        cooldownHours: 24,
        priority: 20,
    },
    {
        name: 'First Draft Complete',
        description: 'Triggers when refinement crosses 0.5',
        enabled: false,
        trigger: {
            type: 'threshold',
            property: 'refinement',
            operator: '>=',
            value: 0.5,
        },
        snapshotForm: {
            operation: 'commit',
            messageTemplate: 'draft: {{document}} first draft complete',
            commitScope: 'document',
        },
        consequences: [{ type: 'property_enum_change', property: 'audience', value: 'internal' }],
        scope: { mode: 'all' },
        repeatable: false,
        priority: 30,
    },
];

// =============================================================================
// MILESTONE EVENT TYPES
// =============================================================================

/**
 * Event emitted when a milestone is triggered
 */
export interface MilestoneTriggeredEvent {
    /** Milestone that was triggered */
    milestone: UserMilestoneConfig;
    /** Document path */
    documentPath: string;
    /** Trigger evaluation result */
    triggerResult: {
        matched: true;
        details: Record<string, unknown>;
    };
    /** Timestamp */
    timestamp: number;
    /** What actions were taken */
    actions: {
        snapshot?: { operation: GitOperation; success: boolean; error?: string };
        consequences: Array<{ consequence: MilestoneConsequence; applied: boolean; error?: string }>;
    };
}

/**
 * Git snapshot result captured after milestone trigger
 * Used by Time Travel feature to retrieve historical document snapshots
 */
export interface GitSnapshotResult {
    /** The commit SHA after the operation */
    commitSha?: string;
    /** Branch name if a branch was created */
    branchName?: string;
    /** Tag name if a tag was created */
    tagName?: string;
    /** The rendered commit message used */
    commitMessage?: string;
    /** Timestamp of the git operation */
    gitTimestamp?: number;
}

/**
 * Milestone history entry
 */
export interface MilestoneHistoryEntry {
    milestoneId: string;
    milestoneName: string;
    documentPath: string;
    timestamp: number;
    success: boolean;
    error?: string;
    /** Git snapshot metadata (populated when git operation succeeds) */
    gitSnapshot?: GitSnapshotResult;
}
