/**
 * OpenAI Function Calling Adapter
 *
 * Converts between standard tool definitions and OpenAI's function calling format.
 */

import type {
    ToolDefinition,
    ToolCall,
    ToolResult,
    OpenAITool,
    OpenAIFunction,
    OpenAIFunctionCall,
} from './types';

// =============================================================================
// TOOL DEFINITION CONVERSION
// =============================================================================

/**
 * Convert standard tool definitions to OpenAI format
 */
export function toOpenAITools(tools: ToolDefinition[]): OpenAITool[] {
    return tools.map(toOpenAITool);
}

/**
 * Convert single tool definition to OpenAI format
 */
export function toOpenAITool(tool: ToolDefinition): OpenAITool {
    return {
        type: 'function',
        function: toOpenAIFunction(tool),
    };
}

/**
 * Convert tool definition to OpenAI function format
 */
export function toOpenAIFunction(tool: ToolDefinition): OpenAIFunction {
    return {
        name: tool.name,
        description: tool.description,
        parameters: {
            type: 'object',
            properties: tool.parameters.properties,
            required: tool.parameters.required,
        },
    };
}

// =============================================================================
// TOOL CALL PARSING
// =============================================================================

/**
 * Parse OpenAI function calls into standard ToolCall format
 */
export function parseOpenAIToolCalls(toolCalls: OpenAIFunctionCall[]): ToolCall[] {
    return toolCalls.map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: parseOpenAIArguments(call.function.arguments),
    }));
}

/**
 * Parse OpenAI function arguments (JSON string to object)
 */
export function parseOpenAIArguments(args: string): Record<string, unknown> {
    try {
        return JSON.parse(args);
    } catch {
        console.warn('[OpenAI Adapter] Failed to parse function arguments:', args);
        return {};
    }
}

/**
 * Type guard for OpenAI function call
 */
export function isOpenAIFunctionCall(call: unknown): call is OpenAIFunctionCall {
    return (
        typeof call === 'object' &&
        call !== null &&
        'id' in call &&
        'type' in call &&
        (call as { type: unknown }).type === 'function' &&
        'function' in call
    );
}

/**
 * Check if OpenAI response contains tool calls
 */
export function hasOpenAIToolCalls(message: { tool_calls?: unknown[] }): boolean {
    return Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
}

// =============================================================================
// TOOL RESULT FORMATTING
// =============================================================================

/**
 * Format tool results for OpenAI API (as messages)
 */
export function formatOpenAIToolResults(
    results: ToolResult[],
): Array<{ role: 'tool'; tool_call_id: string; content: string }> {
    return results.map((result) => ({
        role: 'tool' as const,
        tool_call_id: result.toolCallId,
        content:
            typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
    }));
}

/**
 * Format single tool result for OpenAI API
 */
export function formatOpenAIToolResult(result: ToolResult): {
    role: 'tool';
    tool_call_id: string;
    content: string;
} {
    return {
        role: 'tool' as const,
        tool_call_id: result.toolCallId,
        content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
    };
}

// =============================================================================
// MESSAGE BUILDING
// =============================================================================

/**
 * Build OpenAI assistant message with tool calls
 * (Used to send back to API along with tool results)
 */
export function buildOpenAIAssistantToolMessage(
    content: string | null,
    toolCalls: OpenAIFunctionCall[],
): { role: 'assistant'; content: string | null; tool_calls: OpenAIFunctionCall[] } {
    return {
        role: 'assistant',
        content,
        tool_calls: toolCalls,
    };
}

/**
 * Convert ToolCalls to OpenAI format for message reconstruction
 */
export function toOpenAIFunctionCalls(calls: ToolCall[]): OpenAIFunctionCall[] {
    return calls.map((call) => ({
        id: call.id,
        type: 'function' as const,
        function: {
            name: call.name,
            arguments: JSON.stringify(call.arguments),
        },
    }));
}

// =============================================================================
// REQUEST HELPERS
// =============================================================================

/**
 * Build tool choice parameter for OpenAI
 */
export function buildOpenAIToolChoice(
    choice?: 'auto' | 'required' | { name: string },
): 'auto' | 'required' | { type: 'function'; function: { name: string } } | undefined {
    if (!choice) return undefined;

    if (choice === 'auto') {
        return 'auto';
    }

    if (choice === 'required') {
        return 'required';
    }

    return { type: 'function', function: { name: choice.name } };
}

/**
 * Check if response indicates more tool use is needed
 */
export function openaiNeedsMoreToolUse(finishReason: string): boolean {
    return finishReason === 'tool_calls';
}

/**
 * Extract text content from OpenAI response
 */
export function extractOpenAITextContent(message: { content: string | null }): string {
    return message.content ?? '';
}
