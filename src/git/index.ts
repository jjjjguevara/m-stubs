/**
 * Git Module Exports
 */

export type {
    IGitService,
    GitAvailabilityResult,
    GitBackend,
    GitHistoryOptions,
    GitHistoryResult,
    GitCommitEntry,
    GitContentResult,
    GitSnapshotExecutionResult,
    GitFileStatus,
} from './git-service';

export { DEFAULT_MILESTONE_PATTERN } from './git-service';

export { GitService, createGitService } from './git-service-impl';
