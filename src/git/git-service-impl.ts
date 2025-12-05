/**
 * Git Service Implementation
 *
 * Provides git operations with dual-backend support:
 * 1. Obsidian Git plugin (preferred when available)
 * 2. Direct CLI via child_process (fallback)
 */

import { App, Platform } from 'obsidian';
import type {
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
import type { SnapshotForm } from '../observability/milestone-settings';
import { DEFAULT_MILESTONE_PATTERN } from './git-service';

// =============================================================================
// NODE.JS TYPES (for Obsidian's electron environment)
// =============================================================================

declare const require: (module: string) => unknown;

interface ChildProcess {
    stdin: NodeJS.WritableStream;
    stdout: NodeJS.ReadableStream;
    stderr: NodeJS.ReadableStream;
    on(event: string, listener: (...args: unknown[]) => void): this;
    kill(signal?: string): boolean;
}

interface ExecOptions {
    cwd?: string;
    encoding?: string;
    maxBuffer?: number;
}

interface ChildProcessModule {
    exec(
        command: string,
        options: ExecOptions,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
    ): ChildProcess;
}

interface PathModule {
    join(...paths: string[]): string;
    relative(from: string, to: string): string;
}

// =============================================================================
// GIT SERVICE IMPLEMENTATION
// =============================================================================

export class GitService implements IGitService {
    private app: App;
    private vaultPath: string;
    private backend: GitBackend = 'none';
    private gitRoot: string | null = null;
    private initialized = false;

    constructor(app: App) {
        this.app = app;
        // Get vault base path (FileSystemAdapter)
        this.vaultPath = (app.vault.adapter as { basePath?: string }).basePath || '';
    }

    // =========================================================================
    // AVAILABILITY CHECK
    // =========================================================================

    async isAvailable(): Promise<GitAvailabilityResult> {
        // Only available on desktop
        if (!Platform.isDesktop) {
            return {
                available: false,
                backend: 'none',
                error: 'Git is only available on desktop',
            };
        }

        // Check for Obsidian Git plugin first
        const obsidianGitResult = this.checkObsidianGitPlugin();
        if (obsidianGitResult.available) {
            this.backend = 'obsidian-git';
            return obsidianGitResult;
        }

        // Fall back to CLI
        try {
            const version = await this.execGit(['--version']);
            if (version) {
                this.backend = 'cli';
                // Try to find git root
                this.gitRoot = await this.findGitRoot();
                return {
                    available: true,
                    backend: 'cli',
                    version: version.trim().replace('git version ', ''),
                };
            }
        } catch {
            // CLI not available
        }

        return {
            available: false,
            backend: 'none',
            error: 'Git not available. Install Obsidian Git plugin or git CLI.',
        };
    }

    private checkObsidianGitPlugin(): GitAvailabilityResult {
        try {
            const plugins = (this.app as unknown as { plugins?: { plugins?: Record<string, unknown> } }).plugins?.plugins;
            const gitPlugin = plugins?.['obsidian-git'] as { manifest?: { version?: string } } | undefined;

            if (gitPlugin) {
                return {
                    available: true,
                    backend: 'obsidian-git',
                    version: gitPlugin.manifest?.version,
                };
            }
        } catch {
            // Plugin check failed
        }

        return {
            available: false,
            backend: 'none',
            error: 'Obsidian Git not installed',
        };
    }

    // =========================================================================
    // HISTORY RETRIEVAL
    // =========================================================================

    async getFileHistory(
        documentPath: string,
        options: GitHistoryOptions,
    ): Promise<GitHistoryResult> {
        try {
            // Ensure initialized
            if (!this.initialized) {
                const availability = await this.isAvailable();
                if (!availability.available) {
                    return { success: false, commits: [], error: availability.error };
                }
                this.initialized = true;
            }

            // Build git log command
            // Format: SHA|message|author|timestamp
            const format = '%H|%s|%an|%at';
            const args = [
                'log',
                `--format=${format}`,
                '--follow', // Track file across renames
                '-n', String(options.limit + 10), // Get extra to filter
            ];

            if (options.startFrom) {
                args.push(`${options.startFrom}^..HEAD`);
            }

            args.push('--', documentPath);

            const output = await this.execGit(args);
            if (!output) {
                return { success: true, commits: [], error: undefined };
            }

            // Parse output into commits
            const lines = output.trim().split('\n').filter(l => l);
            let commits: GitCommitEntry[] = lines.map(line => {
                const [sha, message, author, timestamp] = line.split('|');
                return {
                    sha,
                    message,
                    author,
                    timestamp: parseInt(timestamp, 10),
                };
            });

            // Filter by milestone pattern if requested
            if (options.milestoneOnly) {
                const pattern = options.milestonePattern || DEFAULT_MILESTONE_PATTERN;
                commits = commits.filter(c => pattern.test(c.message));
            }

            // Apply limit after filtering
            const hasMore = commits.length > options.limit;
            commits = commits.slice(0, options.limit);

            return {
                success: true,
                commits,
                hasMore,
            };
        } catch (error) {
            return {
                success: false,
                commits: [],
                error: error instanceof Error ? error.message : 'Failed to get history',
            };
        }
    }

    async getContentAtCommit(
        documentPath: string,
        commitSha: string,
    ): Promise<GitContentResult> {
        try {
            // Ensure initialized
            if (!this.initialized) {
                const availability = await this.isAvailable();
                if (!availability.available) {
                    return { success: false, error: availability.error };
                }
                this.initialized = true;
            }

            // Get content at commit using git show
            const content = await this.execGit(['show', `${commitSha}:${documentPath}`]);

            return {
                success: true,
                content,
            };
        } catch (error) {
            // File might not exist at that commit (renamed, etc.)
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to get content',
            };
        }
    }

    // =========================================================================
    // SNAPSHOT EXECUTION
    // =========================================================================

    async executeSnapshot(
        form: SnapshotForm,
        documentPath: string,
        variables: Record<string, string | number>,
    ): Promise<GitSnapshotExecutionResult> {
        try {
            // Ensure initialized
            if (!this.initialized) {
                const availability = await this.isAvailable();
                if (!availability.available) {
                    return { success: false, error: availability.error };
                }
                this.initialized = true;
            }

            // Render message template
            const commitMessage = this.renderTemplate(
                form.messageTemplate || 'milestone: {{document}} ({{date}})',
                variables,
            );

            switch (form.operation) {
                case 'commit':
                    return this.performCommit(documentPath, commitMessage, form.commitScope);

                case 'commit_and_push':
                    const commitResult = await this.performCommit(documentPath, commitMessage, form.commitScope);
                    if (commitResult.success && form.autoPush !== false) {
                        await this.push();
                    }
                    return commitResult;

                case 'branch':
                    return this.createBranch(form.branchPattern || 'milestone/{{document}}-{{date}}', variables);

                case 'tag':
                    return this.createTag(
                        form.tagPattern || 'v{{refinement}}-{{document}}',
                        variables,
                        commitMessage,
                    );

                case 'none':
                    return { success: true };

                default:
                    return { success: false, error: `Unknown operation: ${form.operation}` };
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Snapshot operation failed',
            };
        }
    }

    private async performCommit(
        documentPath: string,
        message: string,
        scope: 'document' | 'session' | 'vault',
    ): Promise<GitSnapshotExecutionResult> {
        try {
            // Stage files based on scope
            if (scope === 'document') {
                await this.execGit(['add', documentPath]);
            } else if (scope === 'session' || scope === 'vault') {
                await this.execGit(['add', '-A']);
            }

            // Check if there are staged changes
            const status = await this.execGit(['diff', '--cached', '--name-only']);
            if (!status.trim()) {
                return { success: true, commitMessage: message }; // Nothing to commit
            }

            // Commit
            await this.execGit(['commit', '-m', message]);

            // Get the commit SHA
            const sha = await this.getCurrentHead();

            return {
                success: true,
                commitSha: sha || undefined,
                commitMessage: message,
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Commit failed',
            };
        }
    }

    private async createBranch(
        pattern: string,
        variables: Record<string, string | number>,
    ): Promise<GitSnapshotExecutionResult> {
        try {
            const branchName = this.renderTemplate(pattern, variables);
            // Sanitize branch name
            const safeBranchName = branchName.replace(/[^a-zA-Z0-9\-_\/]/g, '-');

            await this.execGit(['checkout', '-b', safeBranchName]);

            return {
                success: true,
                branchName: safeBranchName,
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Branch creation failed',
            };
        }
    }

    private async createTag(
        pattern: string,
        variables: Record<string, string | number>,
        message: string,
    ): Promise<GitSnapshotExecutionResult> {
        try {
            const tagName = this.renderTemplate(pattern, variables);
            // Sanitize tag name
            const safeTagName = tagName.replace(/[^a-zA-Z0-9\-_.]/g, '-');

            await this.execGit(['tag', '-a', safeTagName, '-m', message]);

            return {
                success: true,
                tagName: safeTagName,
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Tag creation failed',
            };
        }
    }

    private async push(): Promise<void> {
        await this.execGit(['push']);
    }

    // =========================================================================
    // UTILITY METHODS
    // =========================================================================

    async getCurrentHead(): Promise<string | null> {
        try {
            const sha = await this.execGit(['rev-parse', 'HEAD']);
            return sha?.trim() || null;
        } catch {
            return null;
        }
    }

    async getFileStatus(documentPath: string): Promise<GitFileStatus> {
        try {
            const status = await this.execGit(['status', '--porcelain', documentPath]);
            const line = status.trim();

            if (!line) {
                return { modified: false, staged: false, untracked: false };
            }

            const indexStatus = line[0];
            const workTreeStatus = line[1];

            return {
                modified: workTreeStatus === 'M' || indexStatus === 'M',
                staged: indexStatus !== ' ' && indexStatus !== '?',
                untracked: indexStatus === '?',
            };
        } catch {
            return { modified: false, staged: false, untracked: false };
        }
    }

    async getGitRoot(): Promise<string | null> {
        if (this.gitRoot) {
            return this.gitRoot;
        }
        return this.findGitRoot();
    }

    private async findGitRoot(): Promise<string | null> {
        try {
            const root = await this.execGit(['rev-parse', '--show-toplevel']);
            return root?.trim() || null;
        } catch {
            return null;
        }
    }

    // =========================================================================
    // TEMPLATE RENDERING
    // =========================================================================

    private renderTemplate(template: string, variables: Record<string, string | number>): string {
        let result = template;
        for (const [key, value] of Object.entries(variables)) {
            result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
        }
        return result;
    }

    // =========================================================================
    // GIT COMMAND EXECUTION
    // =========================================================================

    private async execGit(args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            const { exec } = require('child_process') as ChildProcessModule;
            const { join } = require('path') as PathModule;

            // Determine working directory
            const cwd = this.gitRoot || this.vaultPath;

            // Build command (escape args properly)
            const escapedArgs = args.map(arg => {
                // Quote arguments that contain spaces or shell special characters
                if (/[|<>&\s"'\\]/.test(arg)) {
                    return `"${arg.replace(/"/g, '\\"')}"`;
                }
                return arg;
            });

            const command = `git ${escapedArgs.join(' ')}`;

            exec(
                command,
                {
                    cwd,
                    encoding: 'utf8',
                    maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large files
                },
                (error, stdout, stderr) => {
                    if (error) {
                        reject(new Error(stderr || error.message));
                    } else {
                        resolve(stdout);
                    }
                },
            );
        });
    }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a GitService instance
 */
export function createGitService(app: App): IGitService {
    return new GitService(app);
}
