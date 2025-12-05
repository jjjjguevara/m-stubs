/**
 * Time Travel Types
 *
 * Type definitions for the Time Travel feature which allows
 * viewing historical document snapshots via git history.
 */

import type { GitCommitEntry } from '../git/git-service';

// =============================================================================
// DOCUMENT SNAPSHOT
// =============================================================================

/**
 * Represents a historical snapshot of a document
 */
export interface DocumentSnapshot {
    /** Unique identifier for this snapshot */
    id: string;
    /** Git commit SHA */
    commitSha: string;
    /** Commit message (first line) */
    commitMessage: string;
    /** Commit author */
    author: string;
    /** Unix timestamp of commit */
    timestamp: number;
    /** Document path at time of commit */
    documentPath: string;
    /** The file content at this snapshot (populated on demand) */
    content?: string;
    /** Associated milestone (if from milestone system) */
    milestone?: {
        id: string;
        name: string;
    };
    /** Whether this is a milestone snapshot or general commit */
    isMilestoneSnapshot: boolean;
}

/**
 * Convert a GitCommitEntry to a DocumentSnapshot
 */
export function toDocumentSnapshot(
    commit: GitCommitEntry,
    documentPath: string,
    milestone?: { id: string; name: string },
): DocumentSnapshot {
    return {
        id: `snapshot-${commit.sha.substring(0, 8)}`,
        commitSha: commit.sha,
        commitMessage: commit.message,
        author: commit.author,
        timestamp: commit.timestamp,
        documentPath,
        milestone,
        isMilestoneSnapshot: milestone !== undefined,
    };
}

// =============================================================================
// TIME TRAVEL SETTINGS
// =============================================================================

/**
 * Snapshot granularity mode
 */
export type SnapshotGranularity = 'milestones' | 'all-commits';

/**
 * Tab title component types
 */
export type TabTitleComponent = 'documentName' | 'date' | 'time' | 'sha' | 'commitMessage' | 'property';

/**
 * Tab title component configuration
 */
export interface TabTitleComponentConfig {
    /** Component type */
    type: TabTitleComponent;
    /** Whether this component is enabled */
    enabled: boolean;
    /** For 'property' type: the property key to display */
    propertyKey?: string;
}

/**
 * Close behavior when closing a Time Travel tab
 */
export type CloseBehavior = 'close-one' | 'close-all';

/**
 * Configuration for Time Travel feature
 */
export interface TimeTravelSettings {
    /** Enable Time Travel feature */
    enabled: boolean;
    /** Snapshot granularity mode */
    granularity: SnapshotGranularity;
    /** Maximum snapshots to display in Time Travel view */
    maxSnapshots: number;
    /** Auto-open snapshots without showing selection modal */
    autoOpen: boolean;
    /** Use stacked tabs mode when opening snapshots */
    useStackedTabs: boolean;
    /** Focus mode: hide other tabs and show only source + snapshots */
    focusMode: boolean;
    /** Close behavior: close one tab or all Time Travel tabs */
    closeBehavior: CloseBehavior;
    /** Use custom tab title format instead of default */
    useCustomTabTitle: boolean;
    /** Tab title components (ordered) */
    tabTitleComponents: TabTitleComponentConfig[];
    /** Custom property keys to include in tab title (comma-separated) */
    customPropertyKeys: string;
}

/**
 * Default tab title components (in order)
 */
export const DEFAULT_TAB_TITLE_COMPONENTS: TabTitleComponentConfig[] = [
    { type: 'documentName', enabled: true },
    { type: 'date', enabled: true },
    { type: 'time', enabled: true },
    { type: 'sha', enabled: false },
    { type: 'commitMessage', enabled: false },
];

/**
 * Default Time Travel settings
 */
export const DEFAULT_TIME_TRAVEL_SETTINGS: TimeTravelSettings = {
    enabled: true,
    granularity: 'milestones',
    maxSnapshots: 10,
    autoOpen: false,
    useStackedTabs: true,
    focusMode: false,
    closeBehavior: 'close-one',
    useCustomTabTitle: false,
    tabTitleComponents: DEFAULT_TAB_TITLE_COMPONENTS,
    customPropertyKeys: '',
};

// =============================================================================
// VIEW STATE
// =============================================================================

/**
 * View state for TimeTravelView serialization
 */
export interface TimeTravelViewState {
    /** Snapshot data */
    snapshot: DocumentSnapshot;
}

// =============================================================================
// SELECTION MODAL
// =============================================================================

/**
 * Result from snapshot selection modal
 */
export interface SnapshotSelectionResult {
    /** Selected snapshots */
    snapshots: DocumentSnapshot[];
    /** Whether user cancelled */
    cancelled: boolean;
}

// =============================================================================
// COMMAND CONTEXT
// =============================================================================

/**
 * Context passed to Time Travel command
 */
export interface TimeTravelContext {
    /** Document path to analyze */
    documentPath: string;
    /** Prefetched snapshots (optional) */
    snapshots?: DocumentSnapshot[];
}
