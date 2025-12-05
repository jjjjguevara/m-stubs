import { describe, it, expect, beforeEach } from 'vitest';
import {
    ToolPolicyEnforcer,
    GROUNDING_REQUIRED_STUB_TYPES,
    GROUNDING_TOOLS,
    type PolicyValidationContext,
} from '../policy-enforcer';
import type { SuggestedStub } from '../../llm-types';
import type { ToolCall, ToolResult } from '../types';

// =============================================================================
// TEST FIXTURES
// =============================================================================

function createMockSuggestion(overrides: Partial<SuggestedStub> = {}): SuggestedStub {
    return {
        type: 'source',
        description: 'Test suggestion',
        stub_form: 'persistent',
        location: { lineNumber: 10 },
        rationale: 'Test rationale',
        ...overrides,
    };
}

function createMockToolCall(overrides: Partial<ToolCall> = {}): ToolCall {
    return {
        id: `call-${Date.now()}`,
        name: 'web_search',
        arguments: { query: 'test query' },
        ...overrides,
    };
}

function createMockToolResult(toolCallId: string, success = true): ToolResult {
    return {
        toolCallId,
        success,
        content: success ? { results: [] } : '',
        error: success ? undefined : 'Tool call failed',
    };
}

function createValidationContext(overrides: Partial<PolicyValidationContext> = {}): PolicyValidationContext {
    return {
        suggestedStubs: [],
        toolCalls: [],
        toolResults: [],
        policy: 'encouraged',
        ...overrides,
    };
}

// =============================================================================
// TESTS
// =============================================================================

describe('ToolPolicyEnforcer', () => {
    let enforcer: ToolPolicyEnforcer;

    beforeEach(() => {
        enforcer = new ToolPolicyEnforcer();
    });

    describe('constants', () => {
        it('should have correct grounding-required stub types', () => {
            expect(GROUNDING_REQUIRED_STUB_TYPES.has('source')).toBe(true);
            expect(GROUNDING_REQUIRED_STUB_TYPES.has('check')).toBe(true);
            expect(GROUNDING_REQUIRED_STUB_TYPES.has('link')).toBe(true);
            expect(GROUNDING_REQUIRED_STUB_TYPES.has('data')).toBe(true);
            expect(GROUNDING_REQUIRED_STUB_TYPES.has('draft')).toBe(false);
        });

        it('should have correct grounding tools', () => {
            expect(GROUNDING_TOOLS.has('web_search')).toBe(true);
            expect(GROUNDING_TOOLS.has('semantic_search')).toBe(true);
            expect(GROUNDING_TOOLS.has('openalex_search')).toBe(true);
        });
    });

    describe('validate with mandatory policy', () => {
        it('should pass when grounding tools are used for grounding-required stubs', () => {
            const toolCall = createMockToolCall({ id: 'call-1', name: 'web_search' });
            const context = createValidationContext({
                policy: 'mandatory',
                suggestedStubs: [
                    createMockSuggestion({ type: 'source' }),
                ],
                toolCalls: [toolCall],
                toolResults: [createMockToolResult('call-1')],
            });

            const result = enforcer.validate(context);
            expect(result.passes).toBe(true);
            expect(result.violations.filter(v => v.severity === 'error')).toHaveLength(0);
        });

        it('should fail when no grounding tools used for grounding-required stubs', () => {
            const context = createValidationContext({
                policy: 'mandatory',
                suggestedStubs: [
                    createMockSuggestion({ type: 'source' }),
                ],
                toolCalls: [], // No tool calls
                toolResults: [],
            });

            const result = enforcer.validate(context);
            expect(result.passes).toBe(false);
            expect(result.violations.some(v => v.type === 'missing_grounding')).toBe(true);
        });

        it('should pass when no grounding-required stubs exist', () => {
            const context = createValidationContext({
                policy: 'mandatory',
                suggestedStubs: [
                    createMockSuggestion({ type: 'draft' }), // Not grounding-required
                ],
                toolCalls: [],
                toolResults: [],
            });

            const result = enforcer.validate(context);
            expect(result.passes).toBe(true);
        });

        it('should add warning for failed tool calls', () => {
            const toolCall = createMockToolCall({ id: 'call-1', name: 'web_search' });
            const context = createValidationContext({
                policy: 'mandatory',
                suggestedStubs: [
                    createMockSuggestion({ type: 'source' }),
                ],
                toolCalls: [toolCall],
                toolResults: [createMockToolResult('call-1', false)],
            });

            const result = enforcer.validate(context);
            expect(result.violations.some(v => v.severity === 'warning')).toBe(true);
        });
    });

    describe('validate with encouraged policy', () => {
        it('should pass with warnings when grounding not used', () => {
            const context = createValidationContext({
                policy: 'encouraged',
                suggestedStubs: [
                    createMockSuggestion({ type: 'source' }),
                ],
                toolCalls: [],
                toolResults: [],
            });

            const result = enforcer.validate(context);
            expect(result.passes).toBe(true);
            expect(result.violations.some(v => v.severity === 'warning')).toBe(true);
        });

        it('should pass without warnings when grounding is used', () => {
            const toolCall = createMockToolCall({ id: 'call-1', name: 'web_search' });
            const context = createValidationContext({
                policy: 'encouraged',
                suggestedStubs: [
                    createMockSuggestion({ type: 'source' }),
                ],
                toolCalls: [toolCall],
                toolResults: [createMockToolResult('call-1')],
            });

            const result = enforcer.validate(context);
            expect(result.passes).toBe(true);
            expect(result.violations).toHaveLength(0);
        });
    });

    describe('validate with optional policy', () => {
        it('should always pass regardless of tool usage', () => {
            const context = createValidationContext({
                policy: 'optional',
                suggestedStubs: [
                    createMockSuggestion({ type: 'source' }),
                ],
                toolCalls: [],
                toolResults: [],
            });

            const result = enforcer.validate(context);
            expect(result.passes).toBe(true);
            expect(result.violations).toHaveLength(0);
        });
    });

    describe('validate with disabled policy', () => {
        it('should add warning if any tools were used', () => {
            const toolCall = createMockToolCall({ id: 'call-1', name: 'web_search' });
            const context = createValidationContext({
                policy: 'disabled',
                suggestedStubs: [
                    createMockSuggestion({ type: 'draft' }),
                ],
                toolCalls: [toolCall],
                toolResults: [createMockToolResult('call-1')],
            });

            const result = enforcer.validate(context);
            expect(result.passes).toBe(true); // It's a warning, not an error
            expect(result.violations.some(v => v.type === 'unexpected_tool_use')).toBe(true);
        });

        it('should pass when no tools used', () => {
            const context = createValidationContext({
                policy: 'disabled',
                suggestedStubs: [
                    createMockSuggestion({ type: 'draft' }),
                ],
                toolCalls: [],
                toolResults: [],
            });

            const result = enforcer.validate(context);
            expect(result.passes).toBe(true);
            expect(result.violations).toHaveLength(0);
        });
    });

    describe('getMissingGroundingStubs', () => {
        it('should return ungrounded suggestions', () => {
            const groundedSuggestion = createMockSuggestion({ type: 'source' });
            const anotherGroundingStub = createMockSuggestion({
                type: 'check',
                description: 'Verify this claim',
            });

            const context = createValidationContext({
                policy: 'mandatory',
                suggestedStubs: [groundedSuggestion, anotherGroundingStub],
                toolCalls: [], // No tool calls - so both are "missing" grounding
                toolResults: [],
            });

            const missing = enforcer.getMissingGroundingStubs(context);

            expect(missing).toHaveLength(2);
            expect(missing.some(s => s.type === 'source')).toBe(true);
            expect(missing.some(s => s.type === 'check')).toBe(true);
        });

        it('should return empty when grounding tools were used', () => {
            const toolCall = createMockToolCall({ id: 'call-1', name: 'web_search' });
            const context = createValidationContext({
                policy: 'mandatory',
                suggestedStubs: [
                    createMockSuggestion({ type: 'source' }),
                ],
                toolCalls: [toolCall],
                toolResults: [createMockToolResult('call-1')],
            });

            const missing = enforcer.getMissingGroundingStubs(context);
            expect(missing).toHaveLength(0);
        });

        it('should return empty for non-grounding suggestions', () => {
            const context = createValidationContext({
                policy: 'mandatory',
                suggestedStubs: [
                    createMockSuggestion({ type: 'draft' }),
                    createMockSuggestion({ type: 'expand' }),
                ],
                toolCalls: [],
                toolResults: [],
            });

            const missing = enforcer.getMissingGroundingStubs(context);
            expect(missing).toHaveLength(0);
        });
    });

    describe('generateRetryInstructions', () => {
        it('should generate instructions for missing grounding violations', () => {
            const violations = [
                {
                    type: 'missing_grounding' as const,
                    message: 'Source stub requires grounding',
                    stubType: 'source',
                    severity: 'error' as const,
                },
            ];

            const instructions = enforcer.generateRetryInstructions(violations);

            expect(instructions).toContain('web_search');
            expect(instructions).toContain('source');
        });

        it('should return empty string for no violations', () => {
            const instructions = enforcer.generateRetryInstructions([]);
            expect(instructions).toBe('');
        });
    });

    describe('confidence score', () => {
        it('should return 1.0 for no stubs', () => {
            const context = createValidationContext({
                policy: 'mandatory',
                suggestedStubs: [],
                toolCalls: [],
                toolResults: [],
            });

            const result = enforcer.validate(context);
            expect(result.confidenceScore).toBe(1.0);
        });

        it('should return high confidence for non-grounding stubs', () => {
            const context = createValidationContext({
                policy: 'mandatory',
                suggestedStubs: [
                    createMockSuggestion({ type: 'draft' }),
                ],
                toolCalls: [],
                toolResults: [],
            });

            const result = enforcer.validate(context);
            expect(result.confidenceScore).toBe(0.9);
        });

        it('should return low confidence for grounding stubs without tool calls', () => {
            const context = createValidationContext({
                policy: 'mandatory',
                suggestedStubs: [
                    createMockSuggestion({ type: 'source' }),
                ],
                toolCalls: [],
                toolResults: [],
            });

            const result = enforcer.validate(context);
            expect(result.confidenceScore).toBe(0.3);
        });

        it('should return higher confidence with successful tool calls', () => {
            const toolCall = createMockToolCall({ id: 'call-1', name: 'web_search' });
            const context = createValidationContext({
                policy: 'mandatory',
                suggestedStubs: [
                    createMockSuggestion({ type: 'source' }),
                ],
                toolCalls: [toolCall],
                toolResults: [createMockToolResult('call-1')],
            });

            const result = enforcer.validate(context);
            expect(result.confidenceScore).toBeGreaterThan(0.5);
        });
    });

    describe('edge cases', () => {
        it('should handle empty suggestions array', () => {
            const context = createValidationContext({
                policy: 'mandatory',
                suggestedStubs: [],
                toolCalls: [],
                toolResults: [],
            });

            const result = enforcer.validate(context);
            expect(result.passes).toBe(true);
        });

        it('should handle mixed grounding and non-grounding suggestions', () => {
            const toolCall1 = createMockToolCall({ id: 'call-1', name: 'web_search' });
            const toolCall2 = createMockToolCall({ id: 'call-2', name: 'semantic_search' });
            const context = createValidationContext({
                policy: 'mandatory',
                suggestedStubs: [
                    createMockSuggestion({ type: 'source' }), // Requires grounding
                    createMockSuggestion({ type: 'draft' }), // Doesn't require
                    createMockSuggestion({ type: 'check' }), // Requires grounding
                ],
                toolCalls: [toolCall1, toolCall2],
                toolResults: [
                    createMockToolResult('call-1'),
                    createMockToolResult('call-2'),
                ],
            });

            const result = enforcer.validate(context);
            expect(result.passes).toBe(true);
        });
    });

    describe('shouldRetry', () => {
        it('should recommend retry for mandatory policy with errors', () => {
            const context = createValidationContext({
                policy: 'mandatory',
                suggestedStubs: [
                    createMockSuggestion({ type: 'source' }),
                ],
                toolCalls: [],
                toolResults: [],
            });

            const result = enforcer.validate(context);
            expect(result.shouldRetry).toBe(true);
        });

        it('should not recommend retry for encouraged policy', () => {
            const context = createValidationContext({
                policy: 'encouraged',
                suggestedStubs: [
                    createMockSuggestion({ type: 'source' }),
                ],
                toolCalls: [],
                toolResults: [],
            });

            const result = enforcer.validate(context);
            expect(result.shouldRetry).toBe(false);
        });
    });

    describe('summary generation', () => {
        it('should include error count in summary when failing', () => {
            const context = createValidationContext({
                policy: 'mandatory',
                suggestedStubs: [
                    createMockSuggestion({ type: 'source' }),
                ],
                toolCalls: [],
                toolResults: [],
            });

            const result = enforcer.validate(context);
            expect(result.summary).toContain('failed');
            expect(result.summary).toContain('error');
        });

        it('should indicate passed in summary when successful', () => {
            const toolCall = createMockToolCall({ id: 'call-1', name: 'web_search' });
            const context = createValidationContext({
                policy: 'mandatory',
                suggestedStubs: [
                    createMockSuggestion({ type: 'source' }),
                ],
                toolCalls: [toolCall],
                toolResults: [createMockToolResult('call-1')],
            });

            const result = enforcer.validate(context);
            expect(result.summary).toContain('passed');
        });
    });
});
