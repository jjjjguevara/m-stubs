/**
 * Anthropic Function Calling Adapter
 *
 * Converts between standard tool definitions and Anthropic's tool_use format.
 */

import type {
    ToolDefinition,
    ToolCall,
    ToolResult,
    AnthropicTool,
    AnthropicToolUse,
    AnthropicToolResult,
    ContentBlock,
} from './types';

// =============================================================================
// TOOL DEFINITION CONVERSION
// =============================================================================

/**
 * Convert standard tool definitions to Anthropic format
 */
export function toAnthropicTools(tools: ToolDefinition[]): AnthropicTool[] {
    return tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: {
            type: 'object' as const,
            properties: tool.parameters.properties,
            required: tool.parameters.required,
        },
    }));
}

/**
 * Convert single tool definition to Anthropic format
 */
export function toAnthropicTool(tool: ToolDefinition): AnthropicTool {
    return {
        name: tool.name,
        description: tool.description,
        input_schema: {
            type: 'object' as const,
            properties: tool.parameters.properties,
            required: tool.parameters.required,
        },
    };
}

// =============================================================================
// TOOL CALL PARSING
// =============================================================================

/**
 * Parse Anthropic tool_use blocks into standard ToolCall format
 */
export function parseAnthropicToolCalls(content: unknown[]): ToolCall[] {
    const toolCalls: ToolCall[] = [];

    for (const block of content) {
        if (isAnthropicToolUse(block)) {
            toolCalls.push({
                id: block.id,
                name: block.name,
                arguments: block.input,
            });
        }
    }

    return toolCalls;
}

/**
 * Type guard for Anthropic tool_use blocks
 */
export function isAnthropicToolUse(block: unknown): block is AnthropicToolUse {
    return (
        typeof block === 'object' &&
        block !== null &&
        'type' in block &&
        (block as { type: unknown }).type === 'tool_use' &&
        'id' in block &&
        'name' in block &&
        'input' in block
    );
}

/**
 * Check if Anthropic response contains tool_use blocks
 */
export function hasAnthropicToolUse(content: unknown[]): boolean {
    return content.some(isAnthropicToolUse);
}

// =============================================================================
// TOOL RESULT FORMATTING
// =============================================================================

/**
 * Format tool results for Anthropic API
 */
export function formatAnthropicToolResults(results: ToolResult[]): AnthropicToolResult[] {
    return results.map((result) => ({
        type: 'tool_result' as const,
        tool_use_id: result.toolCallId,
        content:
            typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
        is_error: !result.success,
    }));
}

/**
 * Format single tool result for Anthropic API
 */
export function formatAnthropicToolResult(result: ToolResult): AnthropicToolResult {
    return {
        type: 'tool_result' as const,
        tool_use_id: result.toolCallId,
        content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
        is_error: !result.success,
    };
}

// =============================================================================
// MESSAGE BUILDING
// =============================================================================

/**
 * Build Anthropic message content with tool results
 */
export function buildAnthropicToolResultMessage(results: ToolResult[]): ContentBlock[] {
    return results.map((result) => ({
        type: 'tool_result' as const,
        tool_use_id: result.toolCallId,
        content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
        is_error: !result.success,
    }));
}

/**
 * Extract text content from Anthropic response, excluding tool_use blocks
 */
export function extractAnthropicTextContent(content: unknown[]): string {
    const textParts: string[] = [];

    for (const block of content) {
        if (
            typeof block === 'object' &&
            block !== null &&
            'type' in block &&
            (block as { type: unknown }).type === 'text' &&
            'text' in block
        ) {
            textParts.push((block as { text: string }).text);
        }
    }

    return textParts.join('\n');
}

// =============================================================================
// REQUEST HELPERS
// =============================================================================

/**
 * Build tool choice parameter for Anthropic
 */
export function buildAnthropicToolChoice(
    choice?: 'auto' | 'required' | { name: string },
): { type: 'auto' } | { type: 'any' } | { type: 'tool'; name: string } | undefined {
    if (!choice) return undefined;

    if (choice === 'auto') {
        return { type: 'auto' };
    }

    if (choice === 'required') {
        return { type: 'any' };
    }

    return { type: 'tool', name: choice.name };
}

/**
 * Check if response indicates more tool use is needed
 */
export function anthropicNeedsMoreToolUse(stopReason: string): boolean {
    return stopReason === 'tool_use';
}
