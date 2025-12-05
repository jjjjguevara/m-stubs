/**
 * Structured Logger for Doc Doctor
 *
 * Provides structured logging with categories, tracing, and metrics.
 * Logs can be filtered, exported, and used for debugging and analysis.
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Log levels in order of severity
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Categories for organizing log entries
 */
export type LogCategory =
    | 'orchestration'           // Task discovery, assignment, routing
    | 'llm-request'             // LLM API requests
    | 'llm-response'            // LLM API responses
    | 'tool-call'               // Tool execution
    | 'reference-verification'  // Reference verification
    | 'policy-enforcement'      // Tool policy enforcement
    | 'user-action'             // User accepts/rejects suggestions
    | 'mcp-operation'           // MCP tool operations
    | 'health-calculation'      // L2 dimension calculations
    | 'system';                 // System-level events

/**
 * A structured log entry
 */
export interface LogEntry {
    /** Unique ID for this entry */
    id: string;

    /** Timestamp */
    timestamp: string;

    /** Log level */
    level: LogLevel;

    /** Category for filtering */
    category: LogCategory;

    /** Human-readable message */
    message: string;

    /** Structured context data */
    context: Record<string, unknown>;

    /** Trace ID for correlating related entries */
    traceId?: string;

    /** Span ID within a trace */
    spanId?: string;

    /** Parent span ID */
    parentSpanId?: string;

    /** Duration in milliseconds (for timed operations) */
    durationMs?: number;

    /** Numeric metrics */
    metrics?: Record<string, number>;

    /** Error details if applicable */
    error?: {
        name: string;
        message: string;
        stack?: string;
    };
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
    /** Minimum level to log */
    minLevel: LogLevel;

    /** Whether to output to console */
    consoleOutput: boolean;

    /** Whether to store in memory buffer */
    bufferEnabled: boolean;

    /** Maximum buffer size */
    bufferSize: number;

    /** Categories to include (empty = all) */
    includeCategories: LogCategory[];

    /** Categories to exclude */
    excludeCategories: LogCategory[];
}

/**
 * Trace context for correlating log entries
 */
export interface TraceContext {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

const DEFAULT_CONFIG: LoggerConfig = {
    minLevel: 'info',
    consoleOutput: true,
    bufferEnabled: true,
    bufferSize: 1000,
    includeCategories: [],
    excludeCategories: [],
};

// =============================================================================
// LOGGER CLASS
// =============================================================================

/**
 * Structured logger for Doc Doctor observability
 */
export class DocDoctorLogger {
    private config: LoggerConfig;
    private buffer: LogEntry[] = [];
    private idCounter = 0;

    constructor(config: Partial<LoggerConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Update logger configuration
     */
    configure(config: Partial<LoggerConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Generate a unique trace ID
     */
    createTraceId(): string {
        return `trace-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }

    /**
     * Generate a unique span ID
     */
    createSpanId(): string {
        return `span-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    }

    /**
     * Create a trace context for correlating related operations
     */
    createTraceContext(parentSpanId?: string): TraceContext {
        return {
            traceId: this.createTraceId(),
            spanId: this.createSpanId(),
            parentSpanId,
        };
    }

    /**
     * Log a debug message
     */
    debug(category: LogCategory, message: string, context: Record<string, unknown> = {}, trace?: TraceContext): void {
        this.log('debug', category, message, context, trace);
    }

    /**
     * Log an info message
     */
    info(category: LogCategory, message: string, context: Record<string, unknown> = {}, trace?: TraceContext): void {
        this.log('info', category, message, context, trace);
    }

    /**
     * Log a warning message
     */
    warn(category: LogCategory, message: string, context: Record<string, unknown> = {}, trace?: TraceContext): void {
        this.log('warn', category, message, context, trace);
    }

    /**
     * Log an error message
     */
    error(category: LogCategory, message: string, error?: Error, context: Record<string, unknown> = {}, trace?: TraceContext): void {
        const entry = this.createEntry('error', category, message, context, trace);
        if (error) {
            entry.error = {
                name: error.name,
                message: error.message,
                stack: error.stack,
            };
        }
        this.processEntry(entry);
    }

    /**
     * Log with timing information
     */
    timed(
        level: LogLevel,
        category: LogCategory,
        message: string,
        durationMs: number,
        context: Record<string, unknown> = {},
        trace?: TraceContext,
    ): void {
        const entry = this.createEntry(level, category, message, context, trace);
        entry.durationMs = durationMs;
        this.processEntry(entry);
    }

    /**
     * Log with metrics
     */
    withMetrics(
        level: LogLevel,
        category: LogCategory,
        message: string,
        metrics: Record<string, number>,
        context: Record<string, unknown> = {},
        trace?: TraceContext,
    ): void {
        const entry = this.createEntry(level, category, message, context, trace);
        entry.metrics = metrics;
        this.processEntry(entry);
    }

    /**
     * Start a timed operation (returns a function to complete it)
     */
    startTimer(
        category: LogCategory,
        operation: string,
        context: Record<string, unknown> = {},
        trace?: TraceContext,
    ): () => void {
        const startTime = Date.now();
        this.debug(category, `Starting: ${operation}`, context, trace);

        return () => {
            const durationMs = Date.now() - startTime;
            this.timed('info', category, `Completed: ${operation}`, durationMs, context, trace);
        };
    }

    /**
     * Get buffered log entries
     */
    getBuffer(): LogEntry[] {
        return [...this.buffer];
    }

    /**
     * Get entries filtered by criteria
     */
    getEntries(filter: {
        level?: LogLevel;
        category?: LogCategory;
        traceId?: string;
        since?: Date;
        limit?: number;
    }): LogEntry[] {
        let entries = [...this.buffer];

        if (filter.level) {
            const minOrder = LOG_LEVEL_ORDER[filter.level];
            entries = entries.filter(e => LOG_LEVEL_ORDER[e.level] >= minOrder);
        }

        if (filter.category) {
            entries = entries.filter(e => e.category === filter.category);
        }

        if (filter.traceId) {
            entries = entries.filter(e => e.traceId === filter.traceId);
        }

        if (filter.since) {
            const sinceTime = filter.since.getTime();
            entries = entries.filter(e => new Date(e.timestamp).getTime() >= sinceTime);
        }

        if (filter.limit) {
            entries = entries.slice(-filter.limit);
        }

        return entries;
    }

    /**
     * Clear the buffer
     */
    clearBuffer(): void {
        this.buffer = [];
    }

    /**
     * Export buffer as JSON
     */
    exportAsJson(): string {
        return JSON.stringify(this.buffer, null, 2);
    }

    /**
     * Export buffer as NDJSON (newline-delimited JSON)
     */
    exportAsNdjson(): string {
        return this.buffer.map(e => JSON.stringify(e)).join('\n');
    }

    // =========================================================================
    // PRIVATE METHODS
    // =========================================================================

    private log(
        level: LogLevel,
        category: LogCategory,
        message: string,
        context: Record<string, unknown>,
        trace?: TraceContext,
    ): void {
        const entry = this.createEntry(level, category, message, context, trace);
        this.processEntry(entry);
    }

    private createEntry(
        level: LogLevel,
        category: LogCategory,
        message: string,
        context: Record<string, unknown>,
        trace?: TraceContext,
    ): LogEntry {
        return {
            id: `log-${++this.idCounter}`,
            timestamp: new Date().toISOString(),
            level,
            category,
            message,
            context,
            traceId: trace?.traceId,
            spanId: trace?.spanId,
            parentSpanId: trace?.parentSpanId,
        };
    }

    private processEntry(entry: LogEntry): void {
        // Check level
        if (LOG_LEVEL_ORDER[entry.level] < LOG_LEVEL_ORDER[this.config.minLevel]) {
            return;
        }

        // Check category filters
        if (this.config.includeCategories.length > 0 && !this.config.includeCategories.includes(entry.category)) {
            return;
        }
        if (this.config.excludeCategories.includes(entry.category)) {
            return;
        }

        // Buffer
        if (this.config.bufferEnabled) {
            this.buffer.push(entry);
            if (this.buffer.length > this.config.bufferSize) {
                this.buffer.shift();
            }
        }

        // Console output
        if (this.config.consoleOutput) {
            this.outputToConsole(entry);
        }
    }

    private outputToConsole(entry: LogEntry): void {
        const prefix = `[Doc Doctor] [${entry.category}]`;
        const traceInfo = entry.traceId ? ` [${entry.traceId.slice(0, 12)}]` : '';
        const durationInfo = entry.durationMs !== undefined ? ` (${entry.durationMs}ms)` : '';
        const fullMessage = `${prefix}${traceInfo} ${entry.message}${durationInfo}`;

        const contextStr = Object.keys(entry.context).length > 0
            ? entry.context
            : undefined;

        switch (entry.level) {
            case 'debug':
                if (contextStr) {
                    console.debug(fullMessage, contextStr);
                } else {
                    console.debug(fullMessage);
                }
                break;
            case 'info':
                if (contextStr) {
                    console.log(fullMessage, contextStr);
                } else {
                    console.log(fullMessage);
                }
                break;
            case 'warn':
                if (contextStr) {
                    console.warn(fullMessage, contextStr);
                } else {
                    console.warn(fullMessage);
                }
                break;
            case 'error':
                if (entry.error) {
                    console.error(fullMessage, entry.error, contextStr);
                } else if (contextStr) {
                    console.error(fullMessage, contextStr);
                } else {
                    console.error(fullMessage);
                }
                break;
        }
    }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

/**
 * Default logger instance
 */
export const logger = new DocDoctorLogger();

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Create a child logger with a fixed trace context
 */
export function createTracedLogger(trace: TraceContext): {
    debug: (category: LogCategory, message: string, context?: Record<string, unknown>) => void;
    info: (category: LogCategory, message: string, context?: Record<string, unknown>) => void;
    warn: (category: LogCategory, message: string, context?: Record<string, unknown>) => void;
    error: (category: LogCategory, message: string, error?: Error, context?: Record<string, unknown>) => void;
} {
    return {
        debug: (category, message, context = {}) => logger.debug(category, message, context, trace),
        info: (category, message, context = {}) => logger.info(category, message, context, trace),
        warn: (category, message, context = {}) => logger.warn(category, message, context, trace),
        error: (category, message, error?, context = {}) => logger.error(category, message, error, context, trace),
    };
}
