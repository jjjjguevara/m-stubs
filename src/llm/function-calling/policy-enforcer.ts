/**
 * Tool Policy Enforcer
 *
 * Validates that LLM tool usage matches the configured policy.
 * Enforces grounding requirements for different creativity modes.
 */

import type { ToolCall, ToolResult } from './types';
import type { ToolUsePolicy } from '../../schema/schema-types';
import type { SuggestedStub } from '../llm-types';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Stub types that require grounding through tool calls
 */
export const GROUNDING_REQUIRED_STUB_TYPES = new Set([
    'source',  // Find citations
    'check',   // Verify claims
    'link',    // Find related documents
    'data',    // Find data/statistics
]);

/**
 * Search tools that provide grounding
 */
export const GROUNDING_TOOLS = new Set([
    'web_search',
    'semantic_search',
    'openalex_search',
]);

/**
 * A violation of the tool use policy
 */
export interface PolicyViolation {
    /** Type of violation */
    type: 'missing_grounding' | 'unexpected_tool_use' | 'unverified_reference';

    /** Severity of the violation */
    severity: 'error' | 'warning' | 'info';

    /** Human-readable message */
    message: string;

    /** Related stub if applicable */
    stubType?: string;

    /** Related tool if applicable */
    toolName?: string;
}

/**
 * Result of policy validation
 */
export interface PolicyValidationResult {
    /** Whether the response passes policy requirements */
    passes: boolean;

    /** List of violations found */
    violations: PolicyViolation[];

    /** Confidence score (0-1) based on grounding */
    confidenceScore: number;

    /** Summary message */
    summary: string;

    /** Whether a retry with stronger instructions is recommended */
    shouldRetry: boolean;
}

/**
 * Context for policy validation
 */
export interface PolicyValidationContext {
    /** The configured tool use policy */
    policy: ToolUsePolicy;

    /** Tool calls made by the LLM */
    toolCalls: ToolCall[];

    /** Results from tool calls */
    toolResults: ToolResult[];

    /** Suggested stubs from the LLM response */
    suggestedStubs: SuggestedStub[];
}

// =============================================================================
// POLICY ENFORCER CLASS
// =============================================================================

/**
 * Enforces tool use policies on LLM responses
 */
export class ToolPolicyEnforcer {
    /**
     * Validate LLM response against the configured policy
     */
    validate(context: PolicyValidationContext): PolicyValidationResult {
        const violations: PolicyViolation[] = [];

        switch (context.policy) {
            case 'mandatory':
                this.validateMandatoryPolicy(context, violations);
                break;
            case 'encouraged':
                this.validateEncouragedPolicy(context, violations);
                break;
            case 'optional':
                // No enforcement for optional
                break;
            case 'disabled':
                this.validateDisabledPolicy(context, violations);
                break;
        }

        // Calculate confidence score based on grounding
        const confidenceScore = this.calculateConfidenceScore(context);

        // Determine if response passes
        const hasErrors = violations.some(v => v.severity === 'error');
        const passes = !hasErrors;

        // Should retry if mandatory policy has errors
        const shouldRetry = context.policy === 'mandatory' && hasErrors;

        return {
            passes,
            violations,
            confidenceScore,
            summary: this.generateSummary(context, violations, confidenceScore),
            shouldRetry,
        };
    }

    /**
     * Validate mandatory policy - tool calls MUST be present for grounding stubs
     */
    private validateMandatoryPolicy(
        context: PolicyValidationContext,
        violations: PolicyViolation[],
    ): void {
        const hasGroundingToolCalls = context.toolCalls.some(call =>
            GROUNDING_TOOLS.has(call.name),
        );

        const groundingStubs = context.suggestedStubs.filter(stub =>
            GROUNDING_REQUIRED_STUB_TYPES.has(stub.type),
        );

        // If there are grounding-required stubs but no grounding tool calls
        if (groundingStubs.length > 0 && !hasGroundingToolCalls) {
            violations.push({
                type: 'missing_grounding',
                severity: 'error',
                message: `Mandatory policy requires tool calls for grounding. Found ${groundingStubs.length} stub(s) requiring verification but no search tools were used.`,
            });

            // Add specific violations for each ungrounded stub type
            const ungroundedTypes = new Set(groundingStubs.map(s => s.type));
            for (const stubType of ungroundedTypes) {
                violations.push({
                    type: 'missing_grounding',
                    severity: 'error',
                    message: `Stub type '${stubType}' requires external verification. Use web_search, semantic_search, or openalex_search.`,
                    stubType,
                });
            }
        }

        // Check if any tool calls failed
        const failedCalls = context.toolResults.filter(r => !r.success);
        for (const failedCall of failedCalls) {
            violations.push({
                type: 'missing_grounding',
                severity: 'warning',
                message: `Tool call '${failedCall.toolCallId}' failed: ${failedCall.error}. Grounding may be incomplete.`,
            });
        }
    }

    /**
     * Validate encouraged policy - warn if no tool calls present for grounding stubs
     */
    private validateEncouragedPolicy(
        context: PolicyValidationContext,
        violations: PolicyViolation[],
    ): void {
        const hasGroundingToolCalls = context.toolCalls.some(call =>
            GROUNDING_TOOLS.has(call.name),
        );

        const groundingStubs = context.suggestedStubs.filter(stub =>
            GROUNDING_REQUIRED_STUB_TYPES.has(stub.type),
        );

        // Warn if there are grounding-required stubs but no grounding tool calls
        if (groundingStubs.length > 0 && !hasGroundingToolCalls) {
            violations.push({
                type: 'missing_grounding',
                severity: 'warning',
                message: `Encouraged policy suggests using search tools for verification. Found ${groundingStubs.length} stub(s) that could benefit from external sources.`,
            });
        }
    }

    /**
     * Validate disabled policy - flag any unexpected tool usage
     */
    private validateDisabledPolicy(
        context: PolicyValidationContext,
        violations: PolicyViolation[],
    ): void {
        if (context.toolCalls.length > 0) {
            violations.push({
                type: 'unexpected_tool_use',
                severity: 'warning',
                message: `Disabled policy expects no tool calls, but ${context.toolCalls.length} call(s) were made. Tools used: ${context.toolCalls.map(c => c.name).join(', ')}`,
            });
        }
    }

    /**
     * Calculate confidence score based on grounding
     */
    private calculateConfidenceScore(context: PolicyValidationContext): number {
        if (context.suggestedStubs.length === 0) {
            return 1.0; // No stubs = high confidence in the analysis
        }

        const groundingStubs = context.suggestedStubs.filter(stub =>
            GROUNDING_REQUIRED_STUB_TYPES.has(stub.type),
        );

        if (groundingStubs.length === 0) {
            return 0.9; // No grounding-required stubs = good confidence
        }

        // Count successful grounding tool calls
        const successfulGroundingCalls = context.toolResults.filter(
            r => r.success && GROUNDING_TOOLS.has(this.getToolName(r.toolCallId, context.toolCalls)),
        );

        if (successfulGroundingCalls.length === 0) {
            return 0.3; // No grounding = low confidence
        }

        // Score based on ratio of grounding calls to grounding-required stubs
        const ratio = Math.min(1, successfulGroundingCalls.length / groundingStubs.length);
        return 0.5 + (0.5 * ratio); // Range: 0.5 to 1.0
    }

    /**
     * Get tool name from tool call ID
     */
    private getToolName(toolCallId: string, toolCalls: ToolCall[]): string {
        const call = toolCalls.find(c => c.id === toolCallId);
        return call?.name || '';
    }

    /**
     * Generate a human-readable summary
     */
    private generateSummary(
        context: PolicyValidationContext,
        violations: PolicyViolation[],
        confidenceScore: number,
    ): string {
        const errorCount = violations.filter(v => v.severity === 'error').length;
        const warningCount = violations.filter(v => v.severity === 'warning').length;

        if (errorCount > 0) {
            return `Policy validation failed: ${errorCount} error(s), ${warningCount} warning(s). Confidence: ${(confidenceScore * 100).toFixed(0)}%`;
        }

        if (warningCount > 0) {
            return `Policy validation passed with ${warningCount} warning(s). Confidence: ${(confidenceScore * 100).toFixed(0)}%`;
        }

        return `Policy validation passed. Confidence: ${(confidenceScore * 100).toFixed(0)}%`;
    }

    /**
     * Get stubs that are missing grounding
     */
    getMissingGroundingStubs(context: PolicyValidationContext): SuggestedStub[] {
        const hasGroundingToolCalls = context.toolCalls.some(call =>
            GROUNDING_TOOLS.has(call.name),
        );

        if (hasGroundingToolCalls) {
            return []; // Has grounding, so no stubs are "missing" it
        }

        return context.suggestedStubs.filter(stub =>
            GROUNDING_REQUIRED_STUB_TYPES.has(stub.type),
        );
    }

    /**
     * Generate retry instructions when mandatory policy fails
     */
    generateRetryInstructions(violations: PolicyViolation[]): string {
        const missingGrounding = violations.filter(v => v.type === 'missing_grounding');

        if (missingGrounding.length === 0) {
            return '';
        }

        const stubTypes = new Set(
            missingGrounding
                .filter(v => v.stubType)
                .map(v => v.stubType),
        );

        return `IMPORTANT: You MUST use search tools (web_search, semantic_search, or openalex_search) to verify and ground your suggestions. The following stub types require external verification: ${Array.from(stubTypes).join(', ')}. Do not suggest these stub types without first searching for supporting evidence.`;
    }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

/**
 * Default policy enforcer instance
 */
export const policyEnforcer = new ToolPolicyEnforcer();
