/**
 * Function Calling Module
 *
 * Provides LLM function calling (tool use) capabilities across providers.
 */

// Types
export type {
    JSONSchemaType,
    ToolParameterSchema,
    ToolDefinition,
    ToolCall,
    ToolResult,
    ToolCallState,
    TrackedToolCall,
    AnthropicTool,
    AnthropicToolUse,
    AnthropicToolResult,
    OpenAIFunction,
    OpenAITool,
    OpenAIFunctionCall,
    GeminiFunctionDeclaration,
    GeminiTool,
    GeminiFunctionCall,
    MessageRole,
    ContentBlock,
    ToolMessage,
    ToolRequestOptions,
} from './types';

// Helper functions from types
export { generateToolCallId, hasToolCalls, extractToolCalls } from './types';

// Anthropic adapter
export {
    toAnthropicTools,
    toAnthropicTool,
    parseAnthropicToolCalls,
    isAnthropicToolUse,
    hasAnthropicToolUse,
    formatAnthropicToolResults,
    formatAnthropicToolResult,
    buildAnthropicToolResultMessage,
    extractAnthropicTextContent,
    buildAnthropicToolChoice,
    anthropicNeedsMoreToolUse,
} from './anthropic-adapter';

// OpenAI adapter
export {
    toOpenAITools,
    toOpenAITool,
    toOpenAIFunction,
    parseOpenAIToolCalls,
    parseOpenAIArguments,
    isOpenAIFunctionCall,
    hasOpenAIToolCalls,
    formatOpenAIToolResults,
    formatOpenAIToolResult,
    buildOpenAIAssistantToolMessage,
    toOpenAIFunctionCalls,
    buildOpenAIToolChoice,
    openaiNeedsMoreToolUse,
    extractOpenAITextContent,
} from './openai-adapter';

// Gemini adapter
export {
    toGeminiTools,
    toGeminiFunctionDeclaration,
    parseGeminiToolCalls,
    extractGeminiFunctionCalls,
    hasGeminiFunctionCalls,
    formatGeminiToolResults,
    formatGeminiToolResult,
    buildGeminiFunctionResponseContent,
    extractGeminiTextContent,
    buildGeminiToolConfig,
    geminiNeedsMoreToolUse,
} from './gemini-adapter';

// Tool orchestrator
export {
    ToolOrchestrator,
    getToolOrchestrator,
    resetToolOrchestrator,
    type ToolOrchestratorConfig,
} from './tool-orchestrator';
