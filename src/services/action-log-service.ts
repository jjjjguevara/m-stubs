import type { App, TFile } from 'obsidian';

/**
 * Types of actions that can be logged
 */
export type ActionType =
	| 'accept_suggestion'
	| 'reject_suggestion'
	| 'accept_reference'
	| 'reject_reference'
	| 'modify_frontmatter'
	| 'remove_stub'
	| 'add_stub'
	| 'add_text'
	| 'add_tag'
	| 'add_related'
	| 'dismiss_suggestion'
	| 'tool_call'
	| 'analysis_complete';

/**
 * User decision on an action
 */
export type UserDecision = 'accept' | 'reject' | 'modify' | 'dismiss' | 'auto';

/**
 * A single entry in the action log
 */
export interface ActionLogEntry {
	/** ISO timestamp of when the action occurred */
	timestamp: string;
	/** Type of action performed */
	actionType: ActionType;
	/** Path to the file that was modified */
	filePath: string;
	/** State before the action (if applicable) */
	before: string | null;
	/** State after the action (if applicable) */
	after: string | null;
	/** User's decision */
	userDecision: UserDecision;
	/** Additional metadata about the action */
	metadata?: Record<string, unknown>;
}

/**
 * Configuration for the action log service
 */
export interface ActionLogConfig {
	/** Maximum number of entries to keep in the log */
	maxEntries: number;
	/** Whether to include before/after content (can be large) */
	includeContent: boolean;
	/** Minimum interval between flushes (ms) */
	flushInterval: number;
}

const DEFAULT_CONFIG: ActionLogConfig = {
	maxEntries: 1000,
	includeContent: true,
	flushInterval: 5000, // 5 seconds
};

const LOG_DIR = '.doc-doctor';
const LOG_FILE = 'action-log.json';

/**
 * Service for logging user actions on suggestions and document modifications.
 * Provides observability into LLM suggestion acceptance/rejection patterns.
 *
 * Logs are stored in `.doc-doctor/action-log.json` in the vault.
 *
 * @example
 * ```ts
 * const logService = new ActionLogService(app);
 * await logService.initialize();
 *
 * await logService.log({
 *   actionType: 'accept_suggestion',
 *   filePath: 'notes/my-note.md',
 *   before: 'old frontmatter',
 *   after: 'new frontmatter',
 *   userDecision: 'accept',
 *   metadata: { stubType: 'source', suggestionIndex: 0 }
 * });
 *
 * const history = await logService.getHistory('notes/my-note.md', 10);
 * ```
 */
export class ActionLogService {
	private app: App;
	private config: ActionLogConfig;
	private entries: ActionLogEntry[] = [];
	private pendingWrites: ActionLogEntry[] = [];
	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	private initialized = false;

	constructor(app: App, config: Partial<ActionLogConfig> = {}) {
		this.app = app;
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Initialize the service by loading existing log entries.
	 */
	async initialize(): Promise<void> {
		if (this.initialized) return;

		try {
			// Ensure directory exists
			await this.ensureLogDirectory();

			// Load existing entries
			const logPath = this.getLogPath();
			const file = this.app.vault.getAbstractFileByPath(logPath);

			if (file instanceof this.app.vault.adapter.constructor) {
				// File doesn't exist yet, start fresh
				this.entries = [];
			} else if (file) {
				const content = await this.app.vault.read(file as TFile);
				try {
					this.entries = JSON.parse(content);
				} catch {
					console.warn('Failed to parse action log, starting fresh');
					this.entries = [];
				}
			} else {
				this.entries = [];
			}

			this.initialized = true;
		} catch (error) {
			console.error('Failed to initialize action log service:', error);
			this.entries = [];
			this.initialized = true;
		}
	}

	/**
	 * Log an action. Uses async queue for non-blocking writes.
	 */
	async log(entry: Omit<ActionLogEntry, 'timestamp'>): Promise<void> {
		const fullEntry: ActionLogEntry = {
			...entry,
			timestamp: new Date().toISOString(),
			// Optionally exclude content to save space
			before: this.config.includeContent ? entry.before : null,
			after: this.config.includeContent ? entry.after : null,
		};

		this.entries.push(fullEntry);
		this.pendingWrites.push(fullEntry);

		// Trim to max entries
		if (this.entries.length > this.config.maxEntries) {
			const excess = this.entries.length - this.config.maxEntries;
			this.entries.splice(0, excess);
		}

		// Schedule flush
		this.scheduleFlush();
	}

	/**
	 * Get action history, optionally filtered by file path.
	 */
	async getHistory(filePath?: string, limit?: number): Promise<ActionLogEntry[]> {
		await this.initialize();

		let results = this.entries;

		if (filePath) {
			results = results.filter((e) => e.filePath === filePath);
		}

		// Return most recent first
		results = [...results].reverse();

		if (limit) {
			results = results.slice(0, limit);
		}

		return results;
	}

	/**
	 * Get statistics about actions.
	 */
	async getStats(): Promise<{
		total: number;
		byType: Record<ActionType, number>;
		byDecision: Record<UserDecision, number>;
		acceptanceRate: number;
	}> {
		await this.initialize();

		const byType: Partial<Record<ActionType, number>> = {};
		const byDecision: Partial<Record<UserDecision, number>> = {};

		for (const entry of this.entries) {
			byType[entry.actionType] = (byType[entry.actionType] || 0) + 1;
			byDecision[entry.userDecision] = (byDecision[entry.userDecision] || 0) + 1;
		}

		const accepts = byDecision.accept || 0;
		const rejects = byDecision.reject || 0;
		const total = accepts + rejects;
		const acceptanceRate = total > 0 ? accepts / total : 0;

		return {
			total: this.entries.length,
			byType: byType as Record<ActionType, number>,
			byDecision: byDecision as Record<UserDecision, number>,
			acceptanceRate,
		};
	}

	/**
	 * Clear all log entries.
	 */
	async clear(): Promise<void> {
		this.entries = [];
		this.pendingWrites = [];
		await this.flushNow();
	}

	/**
	 * Force immediate flush of pending writes.
	 */
	async flushNow(): Promise<void> {
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}

		try {
			await this.ensureLogDirectory();
			const logPath = this.getLogPath();
			const content = JSON.stringify(this.entries, null, 2);

			const existing = this.app.vault.getAbstractFileByPath(logPath);
			if (existing) {
				await this.app.vault.modify(existing as TFile, content);
			} else {
				await this.app.vault.create(logPath, content);
			}

			this.pendingWrites = [];
		} catch (error) {
			console.error('Failed to flush action log:', error);
		}
	}

	/**
	 * Get the path to the log file.
	 */
	private getLogPath(): string {
		return `${LOG_DIR}/${LOG_FILE}`;
	}

	/**
	 * Ensure the log directory exists.
	 */
	private async ensureLogDirectory(): Promise<void> {
		const dir = this.app.vault.getAbstractFileByPath(LOG_DIR);
		if (!dir) {
			await this.app.vault.createFolder(LOG_DIR);
		}
	}

	/**
	 * Schedule a flush after the configured interval.
	 */
	private scheduleFlush(): void {
		if (this.flushTimer) return;

		this.flushTimer = setTimeout(async () => {
			this.flushTimer = null;
			await this.flushNow();
		}, this.config.flushInterval);
	}

	/**
	 * Clean up on plugin unload.
	 */
	async cleanup(): Promise<void> {
		if (this.pendingWrites.length > 0) {
			await this.flushNow();
		}
	}
}

// Singleton instance
let instance: ActionLogService | null = null;

/**
 * Get or create the action log service singleton.
 */
export function getActionLogService(app: App): ActionLogService {
	if (!instance) {
		instance = new ActionLogService(app);
	}
	return instance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetActionLogService(): void {
	instance = null;
}

/**
 * Helper to create a log entry for accepting a suggestion.
 */
export function createAcceptSuggestionEntry(
	filePath: string,
	suggestionType: string,
	description: string,
	before?: string,
	after?: string,
): Omit<ActionLogEntry, 'timestamp'> {
	return {
		actionType: 'accept_suggestion',
		filePath,
		before: before ?? null,
		after: after ?? null,
		userDecision: 'accept',
		metadata: {
			suggestionType,
			description,
		},
	};
}

/**
 * Helper to create a log entry for rejecting a suggestion.
 */
export function createRejectSuggestionEntry(
	filePath: string,
	suggestionType: string,
	description: string,
	reason?: string,
): Omit<ActionLogEntry, 'timestamp'> {
	return {
		actionType: 'reject_suggestion',
		filePath,
		before: null,
		after: null,
		userDecision: 'reject',
		metadata: {
			suggestionType,
			description,
			reason,
		},
	};
}

/**
 * Helper to create a log entry for tool calls.
 */
export function createToolCallEntry(
	filePath: string,
	toolName: string,
	args: Record<string, unknown>,
	result: string,
	isError: boolean,
): Omit<ActionLogEntry, 'timestamp'> {
	return {
		actionType: 'tool_call',
		filePath,
		before: JSON.stringify(args),
		after: result,
		userDecision: 'auto',
		metadata: {
			toolName,
			isError,
		},
	};
}
