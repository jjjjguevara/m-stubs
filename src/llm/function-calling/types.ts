/**
 * Function Calling Types
 *
 * Shared types for LLM function calling across providers.
 * Supports Anthropic, OpenAI, and Gemini function calling formats.
 */

// =============================================================================
// TOOL DEFINITION
// =============================================================================

/**
 * JSON Schema type for tool parameters
 */
export interface JSONSchemaType {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
    description?: string;
    enum?: string[];
    items?: JSONSchemaType;
    properties?: Record<string, JSONSchemaType>;
    required?: string[];
    default?: unknown;
}

/**
 * Tool parameter definition using JSON Schema
 */
export interface ToolParameterSchema {
    type: 'object';
    properties: Record<string, JSONSchemaType>;
    required?: string[];
}

/**
 * A tool that can be called by the LLM
 */
export interface ToolDefinition {
    /** Unique tool name (snake_case) */
    name: string;

    /** Human-readable description of what the tool does */
    description: string;

    /** Parameter schema in JSON Schema format */
    parameters: ToolParameterSchema;

    /** Tool source/category for filtering */
    source: 'mcp' | 'search' | 'vault' | 'custom';

    /** Whether this tool requires user confirmation before execution */
    requiresConfirmation?: boolean;

    /** Whether this tool modifies document state */
    mutates?: boolean;
}

// =============================================================================
// TOOL CALL
// =============================================================================

/**
 * A request from the LLM to call a tool
 */
export interface ToolCall {
    /** Unique ID for this tool call (for tracking) */
    id: string;

    /** Name of the tool to call */
    name: string;

    /** Arguments to pass to the tool (as JSON object) */
    arguments: Record<string, unknown>;
}

/**
 * Result of executing a tool call
 */
export interface ToolResult {
    /** ID matching the original ToolCall */
    toolCallId: string;

    /** Whether the tool execution succeeded */
    success: boolean;

    /** Result content (string or structured data) */
    content: string | Record<string, unknown>;

    /** Error message if execution failed */
    error?: string;

    /** Additional metadata about the execution */
    metadata?: {
        /** Execution time in milliseconds */
        duration?: number;
        /** Whether the result was cached */
        cached?: boolean;
        /** Tool source that provided the result */
        source?: string;
    };
}

// =============================================================================
// TOOL EXECUTION STATE
// =============================================================================

/**
 * State of a tool call in the execution pipeline
 */
export type ToolCallState = 'pending' | 'executing' | 'completed' | 'failed';

/**
 * Tracked tool call with execution state
 */
export interface TrackedToolCall extends ToolCall {
    /** Current execution state */
    state: ToolCallState;

    /** Start timestamp */
    startedAt?: number;

    /** End timestamp */
    completedAt?: number;

    /** Result if completed */
    result?: ToolResult;
}

// =============================================================================
// PROVIDER-SPECIFIC FORMATS
// =============================================================================

/**
 * Anthropic tool format (for conversion)
 */
export interface AnthropicTool {
    name: string;
    description: string;
    input_schema: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
    };
}

/**
 * Anthropic tool use block
 */
export interface AnthropicToolUse {
    type: 'tool_use';
    id: string;
    name: string;
    input: Record<string, unknown>;
}

/**
 * Anthropic tool result block
 */
export interface AnthropicToolResult {
    type: 'tool_result';
    tool_use_id: string;
    content: string;
    is_error?: boolean;
}

/**
 * OpenAI function definition format
 */
export interface OpenAIFunction {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
    };
}

/**
 * OpenAI tool format
 */
export interface OpenAITool {
    type: 'function';
    function: OpenAIFunction;
}

/**
 * OpenAI function call response
 */
export interface OpenAIFunctionCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string; // JSON string
    };
}

/**
 * Gemini function declaration format
 */
export interface GeminiFunctionDeclaration {
    name: string;
    description: string;
    parameters: {
        type: 'OBJECT';
        properties: Record<string, unknown>;
        required?: string[];
    };
}

/**
 * Gemini tool format
 */
export interface GeminiTool {
    function_declarations: GeminiFunctionDeclaration[];
}

/**
 * Gemini function call response
 */
export interface GeminiFunctionCall {
    name: string;
    args: Record<string, unknown>;
}

// =============================================================================
// CONVERSATION WITH TOOLS
// =============================================================================

/**
 * Message role in tool conversation
 */
export type MessageRole = 'user' | 'assistant' | 'tool';

/**
 * Content block in a message
 */
export type ContentBlock =
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
    | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

/**
 * Message in a tool-enabled conversation
 */
export interface ToolMessage {
    role: MessageRole;
    content: string | ContentBlock[];
}

/**
 * Options for tool-enabled requests
 */
export interface ToolRequestOptions {
    /** Available tools for this request */
    tools: ToolDefinition[];

    /** Max iterations for tool use loop */
    maxIterations?: number;

    /** Timeout per tool call in milliseconds */
    toolTimeout?: number;

    /** Whether to require tool use (force the model to use a tool) */
    requireToolUse?: boolean;

    /** Specific tools to prefer/require */
    toolChoice?: 'auto' | 'required' | { name: string };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Generate a unique tool call ID
 */
export function generateToolCallId(): string {
    return `toolu_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Check if a response contains tool calls
 */
export function hasToolCalls(content: ContentBlock[]): boolean {
    return content.some((block) => block.type === 'tool_use');
}

/**
 * Extract tool calls from content blocks
 */
export function extractToolCalls(content: ContentBlock[]): ToolCall[] {
    return content
        .filter((block): block is ContentBlock & { type: 'tool_use' } => block.type === 'tool_use')
        .map((block) => ({
            id: block.id,
            name: block.name,
            arguments: block.input,
        }));
}
