/**
 * Gemini Function Calling Adapter
 *
 * Converts between standard tool definitions and Gemini's function calling format.
 */

import type {
    ToolDefinition,
    ToolCall,
    ToolResult,
    GeminiTool,
    GeminiFunctionDeclaration,
    GeminiFunctionCall,
    JSONSchemaType,
} from './types';

// =============================================================================
// TOOL DEFINITION CONVERSION
// =============================================================================

/**
 * Convert standard tool definitions to Gemini format
 * Gemini uses a single tools object with function_declarations array
 */
export function toGeminiTools(tools: ToolDefinition[]): GeminiTool[] {
    return [
        {
            function_declarations: tools.map(toGeminiFunctionDeclaration),
        },
    ];
}

/**
 * Convert single tool definition to Gemini function declaration
 */
export function toGeminiFunctionDeclaration(tool: ToolDefinition): GeminiFunctionDeclaration {
    return {
        name: tool.name,
        description: tool.description,
        parameters: {
            type: 'OBJECT',
            properties: convertPropertiesToGeminiFormat(tool.parameters.properties),
            required: tool.parameters.required,
        },
    };
}

/**
 * Convert JSON Schema properties to Gemini format
 * Gemini uses uppercase type names
 */
function convertPropertiesToGeminiFormat(
    properties: Record<string, JSONSchemaType>,
): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(properties)) {
        result[key] = convertPropertyToGeminiFormat(value);
    }

    return result;
}

/**
 * Convert single property to Gemini format
 */
function convertPropertyToGeminiFormat(schema: JSONSchemaType): unknown {
    const result: Record<string, unknown> = {
        type: schema.type.toUpperCase(),
    };

    if (schema.description) {
        result.description = schema.description;
    }

    if (schema.enum) {
        result.enum = schema.enum;
    }

    if (schema.items) {
        result.items = convertPropertyToGeminiFormat(schema.items);
    }

    if (schema.properties) {
        result.properties = convertPropertiesToGeminiFormat(schema.properties);
    }

    if (schema.required) {
        result.required = schema.required;
    }

    return result;
}

// =============================================================================
// TOOL CALL PARSING
// =============================================================================

/**
 * Parse Gemini function calls into standard ToolCall format
 */
export function parseGeminiToolCalls(
    functionCalls: GeminiFunctionCall[],
    generateId: () => string,
): ToolCall[] {
    return functionCalls.map((call) => ({
        id: generateId(),
        name: call.name,
        arguments: call.args,
    }));
}

/**
 * Extract function calls from Gemini response parts
 */
export function extractGeminiFunctionCalls(
    parts: Array<{ functionCall?: GeminiFunctionCall }>,
): GeminiFunctionCall[] {
    return parts.filter((part) => part.functionCall).map((part) => part.functionCall!);
}

/**
 * Check if Gemini response contains function calls
 */
export function hasGeminiFunctionCalls(
    parts: Array<{ functionCall?: unknown; text?: string }>,
): boolean {
    return parts.some((part) => part.functionCall);
}

// =============================================================================
// TOOL RESULT FORMATTING
// =============================================================================

/**
 * Format tool results for Gemini API
 * Gemini uses functionResponse format
 */
export function formatGeminiToolResults(
    results: ToolResult[],
): Array<{ functionResponse: { name: string; response: unknown } }> {
    return results.map((result) => ({
        functionResponse: {
            name: result.toolCallId, // Gemini uses name, but we track by toolCallId
            response: {
                success: result.success,
                content: result.content,
                error: result.error,
            },
        },
    }));
}

/**
 * Format single tool result for Gemini API
 */
export function formatGeminiToolResult(
    result: ToolResult,
    toolName: string,
): { functionResponse: { name: string; response: unknown } } {
    return {
        functionResponse: {
            name: toolName,
            response: {
                success: result.success,
                content: result.content,
                error: result.error,
            },
        },
    };
}

// =============================================================================
// MESSAGE BUILDING
// =============================================================================

/**
 * Build Gemini content with function response
 */
export function buildGeminiFunctionResponseContent(
    results: ToolResult[],
    toolNames: Map<string, string>,
): { role: 'user'; parts: Array<{ functionResponse: { name: string; response: unknown } }> } {
    return {
        role: 'user',
        parts: results.map((result) => ({
            functionResponse: {
                name: toolNames.get(result.toolCallId) ?? result.toolCallId,
                response: {
                    success: result.success,
                    content: result.content,
                    error: result.error,
                },
            },
        })),
    };
}

/**
 * Extract text content from Gemini response parts
 */
export function extractGeminiTextContent(
    parts: Array<{ text?: string; functionCall?: unknown }>,
): string {
    return parts
        .filter((part) => part.text)
        .map((part) => part.text!)
        .join('\n');
}

// =============================================================================
// REQUEST HELPERS
// =============================================================================

/**
 * Build tool config for Gemini
 */
export function buildGeminiToolConfig(
    choice?: 'auto' | 'required' | { name: string },
): { functionCallingConfig: { mode: string; allowedFunctionNames?: string[] } } | undefined {
    if (!choice) return undefined;

    if (choice === 'auto') {
        return { functionCallingConfig: { mode: 'AUTO' } };
    }

    if (choice === 'required') {
        return { functionCallingConfig: { mode: 'ANY' } };
    }

    return {
        functionCallingConfig: {
            mode: 'ANY',
            allowedFunctionNames: [choice.name],
        },
    };
}

/**
 * Check if response indicates more function calling is needed
 * Gemini doesn't have a specific finish reason, check for function calls
 */
export function geminiNeedsMoreToolUse(
    parts: Array<{ functionCall?: unknown; text?: string }>,
): boolean {
    return parts.some((part) => part.functionCall);
}
