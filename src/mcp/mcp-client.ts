/**
 * MCP Client Implementation
 *
 * Spawns and communicates with the dd-mcp binary via JSON-RPC over stdio.
 */

import { Platform } from 'obsidian';
import {
    MCPClientConfig,
    MCPClientEvent,
    MCPClientEventHandler,
    MCPConnectionState,
    MCPTool,
    MCPToolResult,
    JsonRpcRequest,
    JsonRpcResponse,
    DEFAULT_MCP_CONFIG,
    BINARY_SEARCH_PATHS,
} from './mcp-types';

// Node.js types for Obsidian's electron environment
declare const require: (module: string) => unknown;

interface ChildProcess {
    stdin: NodeJS.WritableStream;
    stdout: NodeJS.ReadableStream;
    stderr: NodeJS.ReadableStream;
    on(event: string, listener: (...args: unknown[]) => void): this;
    kill(signal?: string): boolean;
}

interface SpawnOptions {
    stdio: string[];
    shell?: boolean;
}

interface ChildProcessModule {
    spawn(command: string, args: string[], options: SpawnOptions): ChildProcess;
}

interface FsModule {
    existsSync(path: string): boolean;
}

interface PathModule {
    join(...paths: string[]): string;
}

interface OsModule {
    homedir(): string;
    platform(): string;
}

/**
 * MCP Client for communicating with dd-mcp binary
 */
export class MCPClient {
    private config: MCPClientConfig;
    private process: ChildProcess | null = null;
    private state: MCPConnectionState = 'disconnected';
    private requestId = 0;
    private pendingRequests = new Map<number | string, {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
        timeout: ReturnType<typeof setTimeout>;
    }>();
    private eventHandlers = new Set<MCPClientEventHandler>();
    private buffer = '';
    private reconnectAttempts = 0;
    private tools: MCPTool[] = [];
    private serverInfo: { name: string; version: string } | null = null;

    constructor(config: Partial<MCPClientConfig> = {}) {
        this.config = { ...DEFAULT_MCP_CONFIG(), ...config };
    }

    // =========================================================================
    // LIFECYCLE
    // =========================================================================

    /**
     * Connect to the MCP server
     */
    async connect(): Promise<void> {
        if (this.state === 'connected' || this.state === 'connecting') {
            return;
        }

        this.setState('connecting');

        try {
            const binaryPath = await this.findBinary();
            if (!binaryPath) {
                throw new Error('Could not find dd-mcp binary. Install via: cargo install doc-doctor');
            }

            await this.spawnProcess(binaryPath);
            await this.initialize();

            this.setState('connected');
            this.reconnectAttempts = 0;
            this.emit({ type: 'connected' });
        } catch (error) {
            this.setState('error');
            this.emit({ type: 'error', error: error as Error });
            throw error;
        }
    }

    /**
     * Disconnect from the MCP server
     */
    async disconnect(): Promise<void> {
        if (this.process) {
            // Clear all pending requests
            for (const [id, pending] of this.pendingRequests) {
                clearTimeout(pending.timeout);
                pending.reject(new Error('Client disconnected'));
            }
            this.pendingRequests.clear();

            // Kill the process
            this.process.kill();
            this.process = null;
        }

        this.setState('disconnected');
        this.emit({ type: 'disconnected' });
    }

    /**
     * Check if connected
     */
    isConnected(): boolean {
        return this.state === 'connected';
    }

    /**
     * Get the server version (available after connection)
     */
    getServerVersion(): string | null {
        return this.serverInfo?.version ?? null;
    }

    /**
     * Get current connection state
     */
    getState(): MCPConnectionState {
        return this.state;
    }

    // =========================================================================
    // TOOL EXECUTION
    // =========================================================================

    /**
     * Call an MCP tool
     */
    async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
        if (!this.isConnected()) {
            throw new Error('MCP client not connected');
        }

        const result = await this.request<MCPToolResult>('tools/call', {
            name,
            arguments: args,
        });

        if (result.isError) {
            const errorText = result.content[0]?.text || 'Unknown error';
            throw new Error(`Tool error: ${errorText}`);
        }

        // Parse the JSON result from the text content
        const text = result.content[0]?.text;
        if (!text) {
            throw new Error('Empty tool response');
        }

        try {
            return JSON.parse(text) as T;
        } catch {
            // If not JSON, return as-is (for string results)
            return text as unknown as T;
        }
    }

    /**
     * List available tools
     */
    async listTools(): Promise<MCPTool[]> {
        if (!this.isConnected()) {
            throw new Error('MCP client not connected');
        }

        if (this.tools.length > 0) {
            return this.tools;
        }

        const result = await this.request<{ tools: MCPTool[] }>('tools/list', {});
        this.tools = result.tools;
        return this.tools;
    }

    // =========================================================================
    // EVENTS
    // =========================================================================

    /**
     * Subscribe to client events
     */
    on(handler: MCPClientEventHandler): () => void {
        this.eventHandlers.add(handler);
        return () => this.eventHandlers.delete(handler);
    }

    // =========================================================================
    // PRIVATE METHODS
    // =========================================================================

    /**
     * Find the dd-mcp binary
     */
    private async findBinary(): Promise<string | null> {
        const fs = require('fs') as FsModule;
        const os = require('os') as OsModule;
        const path = require('path') as PathModule;

        // Check configured path first
        if (this.config.binaryPath) {
            const expanded = this.expandPath(this.config.binaryPath);
            if (fs.existsSync(expanded)) {
                return expanded;
            }
        }

        // Search default paths
        for (const searchPath of BINARY_SEARCH_PATHS) {
            const expanded = this.expandPath(searchPath);
            if (fs.existsSync(expanded)) {
                return expanded;
            }
        }

        return null;
    }

    /**
     * Expand path with home directory and environment variables
     */
    private expandPath(inputPath: string): string {
        const os = require('os') as OsModule;
        let result = inputPath;

        // Expand ~ to home directory
        if (result.startsWith('~')) {
            result = result.replace('~', os.homedir());
        }

        // Expand %USERPROFILE% for Windows
        if (Platform.isWin && result.includes('%USERPROFILE%')) {
            result = result.replace('%USERPROFILE%', os.homedir());
        }

        return result;
    }

    /**
     * Spawn the MCP process
     */
    private async spawnProcess(binaryPath: string): Promise<void> {
        const { spawn } = require('child_process') as ChildProcessModule;

        return new Promise((resolve, reject) => {
            try {
                this.process = spawn(binaryPath, [], {
                    stdio: ['pipe', 'pipe', 'pipe'],
                });

                // Handle stdout (JSON-RPC responses)
                this.process.stdout.on('data', (data: Buffer) => {
                    this.handleStdout(data.toString());
                });

                // Handle stderr (debug logs)
                this.process.stderr.on('data', (data: Buffer) => {
                    console.debug('[MCP stderr]', data.toString());
                });

                // Handle process exit
                this.process.on('exit', (code: number) => {
                    console.debug('[MCP] Process exited with code:', code);
                    this.handleProcessExit();
                });

                // Handle process errors
                this.process.on('error', (error: Error) => {
                    reject(error);
                });

                // Give it a moment to start
                setTimeout(resolve, 100);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Initialize the MCP connection
     */
    private async initialize(): Promise<void> {
        // Send initialize request
        const initResult = await this.request<{
            protocolVersion: string;
            serverInfo: { name: string; version: string };
            capabilities: Record<string, unknown>;
        }>('initialize', {
            protocolVersion: '2024-11-05',
            clientInfo: {
                name: 'doc-doctor-obsidian',
                version: '0.3.0',
            },
            capabilities: {},
        });

        console.debug('[MCP] Initialized:', initResult.serverInfo);
        this.serverInfo = initResult.serverInfo;

        // Send initialized notification
        this.notify('notifications/initialized', {});
    }

    /**
     * Send a JSON-RPC request
     */
    private request<T>(method: string, params: Record<string, unknown>): Promise<T> {
        return new Promise((resolve, reject) => {
            if (!this.process) {
                reject(new Error('No process'));
                return;
            }

            const id = ++this.requestId;
            const request: JsonRpcRequest = {
                jsonrpc: '2.0',
                id,
                method,
                params,
            };

            // Set up timeout
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error(`Request timeout: ${method}`));
            }, this.config.timeout);

            // Store pending request
            this.pendingRequests.set(id, {
                resolve: resolve as (value: unknown) => void,
                reject,
                timeout,
            });

            // Send request
            const data = JSON.stringify(request) + '\n';
            this.process.stdin.write(data);
        });
    }

    /**
     * Send a JSON-RPC notification (no response expected)
     */
    private notify(method: string, params: Record<string, unknown>): void {
        if (!this.process) return;

        const notification = {
            jsonrpc: '2.0',
            method,
            params,
        };

        const data = JSON.stringify(notification) + '\n';
        this.process.stdin.write(data);
    }

    /**
     * Handle stdout data from the process
     */
    private handleStdout(data: string): void {
        this.buffer += data;

        // Process complete lines
        let newlineIndex: number;
        while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
            const line = this.buffer.slice(0, newlineIndex);
            this.buffer = this.buffer.slice(newlineIndex + 1);

            if (line.trim()) {
                this.handleResponse(line);
            }
        }
    }

    /**
     * Handle a JSON-RPC response
     */
    private handleResponse(line: string): void {
        try {
            const response = JSON.parse(line) as JsonRpcResponse;

            // Check if this is a response to a pending request
            if (response.id !== undefined) {
                const pending = this.pendingRequests.get(response.id);
                if (pending) {
                    clearTimeout(pending.timeout);
                    this.pendingRequests.delete(response.id);

                    if (response.error) {
                        pending.reject(new Error(response.error.message));
                    } else {
                        pending.resolve(response.result);
                    }
                }
            }
        } catch (error) {
            console.error('[MCP] Failed to parse response:', error, line);
        }
    }

    /**
     * Handle process exit
     */
    private handleProcessExit(): void {
        this.process = null;

        // Clear pending requests
        for (const [id, pending] of this.pendingRequests) {
            clearTimeout(pending.timeout);
            pending.reject(new Error('Process exited'));
        }
        this.pendingRequests.clear();

        // Attempt reconnect if configured
        if (this.config.autoReconnect && this.state === 'connected') {
            this.attemptReconnect();
        } else {
            this.setState('disconnected');
            this.emit({ type: 'disconnected', reason: 'Process exited' });
        }
    }

    /**
     * Attempt to reconnect
     */
    private async attemptReconnect(): Promise<void> {
        if (this.reconnectAttempts >= this.config.maxRetries) {
            this.setState('error');
            this.emit({ type: 'error', error: new Error('Max reconnect attempts exceeded') });
            return;
        }

        this.reconnectAttempts++;
        this.emit({ type: 'reconnecting', attempt: this.reconnectAttempts });

        await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));

        try {
            await this.connect();
        } catch {
            // Will be handled by connect()
        }
    }

    /**
     * Set connection state
     */
    private setState(state: MCPConnectionState): void {
        this.state = state;
    }

    /**
     * Emit an event to all handlers
     */
    private emit(event: MCPClientEvent): void {
        for (const handler of this.eventHandlers) {
            try {
                handler(event);
            } catch (error) {
                console.error('[MCP] Event handler error:', error);
            }
        }
    }
}
