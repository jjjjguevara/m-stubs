/**
 * Git Service Interface
 *
 * Provides an abstraction layer for git operations with dual-backend support:
 * 1. Obsidian Git plugin API (preferred when installed)
 * 2. Direct CLI via child_process (fallback)
 *
 * Used by:
 * - Milestone system for snapshot commits
 * - Time Travel for history retrieval
 */

import type { SnapshotForm, GitOperation } from '../observability/milestone-settings';

// =============================================================================
// AVAILABILITY
// =============================================================================

/**
 * Git backend type
 */
export type GitBackend = 'obsidian-git' | 'cli' | 'none';

/**
 * Result from checking git availability
 */
export interface GitAvailabilityResult {
    /** Whether git is available */
    available: boolean;
    /** Which backend is being used */
    backend: GitBackend;
    /** Git version if available */
    version?: string;
    /** Error message if unavailable */
    error?: string;
}

// =============================================================================
// HISTORY RETRIEVAL
// =============================================================================

/**
 * Options for retrieving file history
 */
export interface GitHistoryOptions {
    /** Maximum number of commits to retrieve */
    limit: number;
    /** Filter by milestone commits only (matches commit message pattern) */
    milestoneOnly?: boolean;
    /** Custom pattern for milestone commit messages */
    milestonePattern?: RegExp;
    /** Start from this commit (for pagination) */
    startFrom?: string;
}

/**
 * A single commit entry from git history
 */
export interface GitCommitEntry {
    /** Full commit SHA */
    sha: string;
    /** Commit message (first line) */
    message: string;
    /** Author name */
    author: string;
    /** Unix timestamp of commit */
    timestamp: number;
}

/**
 * Result from querying file history
 */
export interface GitHistoryResult {
    /** Whether the query succeeded */
    success: boolean;
    /** List of commits */
    commits: GitCommitEntry[];
    /** Error message if failed */
    error?: string;
    /** Whether there are more commits available */
    hasMore?: boolean;
}

/**
 * Result from retrieving file content at a specific commit
 */
export interface GitContentResult {
    /** Whether retrieval succeeded */
    success: boolean;
    /** File content at that commit */
    content?: string;
    /** Error message if failed */
    error?: string;
}

// =============================================================================
// SNAPSHOT EXECUTION
// =============================================================================

/**
 * Result from executing a git snapshot operation
 */
export interface GitSnapshotExecutionResult {
    /** Whether the operation succeeded */
    success: boolean;
    /** Commit SHA if a commit was created */
    commitSha?: string;
    /** Branch name if a branch was created */
    branchName?: string;
    /** Tag name if a tag was created */
    tagName?: string;
    /** The rendered commit message used */
    commitMessage?: string;
    /** Error message if failed */
    error?: string;
}

// =============================================================================
// WORKING TREE STATUS
// =============================================================================

/**
 * Status of a file in the working tree
 */
export interface GitFileStatus {
    /** Whether the file has uncommitted changes */
    modified: boolean;
    /** Whether the file is staged */
    staged: boolean;
    /** Whether the file is untracked */
    untracked: boolean;
}

// =============================================================================
// GIT SERVICE INTERFACE
// =============================================================================

/**
 * Git Service Interface
 *
 * Abstracts git operations for use by milestone system and Time Travel feature.
 */
export interface IGitService {
    /**
     * Check if git is available (either via plugin or CLI)
     */
    isAvailable(): Promise<GitAvailabilityResult>;

    /**
     * Execute a git snapshot operation (commit, branch, or tag)
     *
     * @param form - Snapshot form configuration
     * @param documentPath - Vault-relative path to the document
     * @param variables - Template variables for message rendering
     */
    executeSnapshot(
        form: SnapshotForm,
        documentPath: string,
        variables: Record<string, string | number>,
    ): Promise<GitSnapshotExecutionResult>;

    /**
     * Get commit history for a specific file
     *
     * @param documentPath - Vault-relative path to the document
     * @param options - History retrieval options
     */
    getFileHistory(
        documentPath: string,
        options: GitHistoryOptions,
    ): Promise<GitHistoryResult>;

    /**
     * Get file content at a specific commit
     *
     * @param documentPath - Vault-relative path to the document
     * @param commitSha - The commit SHA to retrieve
     */
    getContentAtCommit(
        documentPath: string,
        commitSha: string,
    ): Promise<GitContentResult>;

    /**
     * Get current HEAD commit SHA
     */
    getCurrentHead(): Promise<string | null>;

    /**
     * Check if a file has uncommitted changes
     *
     * @param documentPath - Vault-relative path to the document
     */
    getFileStatus(documentPath: string): Promise<GitFileStatus>;

    /**
     * Get the vault's git root path (may differ from vault root)
     */
    getGitRoot(): Promise<string | null>;
}

// =============================================================================
// DEFAULT MILESTONE PATTERN
// =============================================================================

/**
 * Default pattern to match milestone commit messages
 *
 * Matches messages starting with:
 * - milestone:
 * - draft:
 * - research:
 * - publication:
 * - doc-doctor:
 */
export const DEFAULT_MILESTONE_PATTERN = /^(milestone|draft|research|publication|doc-doctor):/i;

// =============================================================================
// EXPORTS
// =============================================================================

export type { GitOperation };
