/**
 * Creativity Modes
 *
 * Modes that adjust LLM behavior based on document properties.
 * Each mode has associated temperature, tool policies, and auto-suggestion rules.
 */

import {
    CreativityModeConfig,
    CreativityModeId,
    ToolUsePolicy,
    DocumentState,
    AutoSuggestCondition,
} from '../schema/schema-types';
import { CREATIVITY_MODES } from '../schema/schema-loader';

// =============================================================================
// MODE SUGGESTION
// =============================================================================

/**
 * Suggest the most appropriate creativity mode based on document L1 properties
 */
export function suggestCreativityMode(doc: DocumentState): CreativityModeId {
    // Score each mode based on how well it matches the document
    const scores: Record<CreativityModeId, number> = {
        research: 0,
        review: 0,
        draft: 0,
        creative: 0,
    };

    for (const mode of CREATIVITY_MODES) {
        scores[mode.id] = calculateModeScore(doc, mode);
    }

    // Return the highest scoring mode
    const sortedModes = Object.entries(scores).sort(([, a], [, b]) => b - a);
    return sortedModes[0][0] as CreativityModeId;
}

/**
 * Calculate how well a document matches a mode's auto-suggest conditions
 */
function calculateModeScore(doc: DocumentState, mode: CreativityModeConfig): number {
    if (!mode.autoSuggestConditions || mode.autoSuggestConditions.length === 0) {
        return 0;
    }

    let matchCount = 0;

    for (const condition of mode.autoSuggestConditions) {
        if (evaluateCondition(doc, condition)) {
            matchCount++;
        }
    }

    // Return percentage of conditions matched
    return matchCount / mode.autoSuggestConditions.length;
}

/**
 * Evaluate a single auto-suggest condition against document state
 */
function evaluateCondition(doc: DocumentState, condition: AutoSuggestCondition): boolean {
    const docValue = getPropertyValue(doc, condition.property);

    switch (condition.operator) {
        case 'equals':
            return docValue === condition.value;

        case 'in':
            if (Array.isArray(condition.value)) {
                return condition.value.includes(docValue as string);
            }
            return false;

        case 'less_than':
            if (typeof docValue === 'number' && typeof condition.value === 'number') {
                return docValue < condition.value;
            }
            return false;

        case 'greater_than':
            if (typeof docValue === 'number' && typeof condition.value === 'number') {
                return docValue > condition.value;
            }
            return false;

        default:
            return false;
    }
}

/**
 * Get property value from document state
 */
function getPropertyValue(
    doc: DocumentState,
    property: 'origin' | 'form' | 'audience' | 'refinement'
): string | number | undefined {
    switch (property) {
        case 'origin':
            return doc.origin;
        case 'form':
            return doc.form;
        case 'audience':
            return doc.audience;
        case 'refinement':
            return doc.refinement;
        default:
            return undefined;
    }
}

// =============================================================================
// MODE ACCESS
// =============================================================================

/**
 * Get creativity mode by ID
 */
export function getCreativityMode(id: CreativityModeId): CreativityModeConfig | undefined {
    return CREATIVITY_MODES.find((m) => m.id === id);
}

/**
 * Get all creativity modes
 */
export function getAllCreativityModes(): CreativityModeConfig[] {
    return [...CREATIVITY_MODES];
}

/**
 * Get mode display info for UI
 */
export function getModeDisplayInfo(id: CreativityModeId): ModeDisplayInfo | undefined {
    const mode = getCreativityMode(id);
    if (!mode) return undefined;

    return {
        id: mode.id,
        name: mode.name,
        description: mode.description,
        icon: getModeIcon(mode.id),
        color: getModeColor(mode.id),
        temperature: mode.temperature,
        toolPolicy: mode.toolUsePolicy,
        toolPolicyLabel: getToolPolicyLabel(mode.toolUsePolicy),
    };
}

/**
 * Get all modes with display info
 */
export function getAllModesDisplayInfo(): ModeDisplayInfo[] {
    return CREATIVITY_MODES.map((m) => getModeDisplayInfo(m.id)!);
}

// =============================================================================
// DISPLAY HELPERS
// =============================================================================

export interface ModeDisplayInfo {
    id: CreativityModeId;
    name: string;
    description: string;
    icon: string;
    color: string;
    temperature: number;
    toolPolicy: ToolUsePolicy;
    toolPolicyLabel: string;
}

function getModeIcon(id: CreativityModeId): string {
    switch (id) {
        case 'research':
            return 'search';
        case 'review':
            return 'check-circle';
        case 'draft':
            return 'edit-3';
        case 'creative':
            return 'sparkles';
        default:
            return 'circle';
    }
}

function getModeColor(id: CreativityModeId): string {
    switch (id) {
        case 'research':
            return '#3498db'; // Blue - precise, factual
        case 'review':
            return '#2ecc71'; // Green - quality focus
        case 'draft':
            return '#f39c12'; // Orange - exploratory
        case 'creative':
            return '#9b59b6'; // Purple - imaginative
        default:
            return '#7f8c8d';
    }
}

function getToolPolicyLabel(policy: ToolUsePolicy): string {
    switch (policy) {
        case 'mandatory':
            return 'Tools Required';
        case 'encouraged':
            return 'Tools Encouraged';
        case 'optional':
            return 'Tools Optional';
        case 'disabled':
            return 'No Tools';
        default:
            return policy;
    }
}

// =============================================================================
// MODE ADJUSTMENT
// =============================================================================

/**
 * Get adjusted temperature based on mode and optional override
 */
export function getEffectiveTemperature(
    modeId: CreativityModeId,
    temperatureOverride?: number
): number {
    if (temperatureOverride !== undefined) {
        return Math.max(0, Math.min(1, temperatureOverride));
    }

    const mode = getCreativityMode(modeId);
    return mode?.temperature ?? 0.7;
}

/**
 * Get effective tool policy based on mode and optional override
 */
export function getEffectiveToolPolicy(
    modeId: CreativityModeId,
    policyOverride?: ToolUsePolicy
): ToolUsePolicy {
    if (policyOverride) {
        return policyOverride;
    }

    const mode = getCreativityMode(modeId);
    return mode?.toolUsePolicy ?? 'optional';
}

/**
 * Check if tool use is required for the given mode
 */
export function isToolUseRequired(modeId: CreativityModeId): boolean {
    const mode = getCreativityMode(modeId);
    return mode?.toolUsePolicy === 'mandatory';
}

/**
 * Check if tool use is recommended for the given mode
 */
export function isToolUseRecommended(modeId: CreativityModeId): boolean {
    const mode = getCreativityMode(modeId);
    return mode?.toolUsePolicy === 'mandatory' || mode?.toolUsePolicy === 'encouraged';
}

// =============================================================================
// MODE + DOCUMENT COMPATIBILITY
// =============================================================================

/**
 * Get compatibility warnings when using a mode with a document
 */
export function getModeCompatibilityWarnings(
    modeId: CreativityModeId,
    doc: DocumentState
): string[] {
    const warnings: string[] = [];
    const suggestedMode = suggestCreativityMode(doc);

    if (modeId !== suggestedMode) {
        // Check for significant mismatches
        if (modeId === 'creative' && doc.audience === 'public') {
            warnings.push(
                'Creative mode has relaxed verification, but this document targets a public audience. ' +
                    'Consider using Research mode for better reference integrity.'
            );
        }

        if (modeId === 'research' && doc.form === 'transient') {
            warnings.push(
                'Research mode enforces strict verification, but this is a transient document. ' +
                    'This may add unnecessary overhead.'
            );
        }

        if (modeId === 'draft' && doc.refinement > 0.8) {
            warnings.push(
                'Draft mode is exploratory, but this document is already highly refined. ' +
                    'Consider using Review mode to maintain quality.'
            );
        }

        if (
            modeId === 'creative' &&
            doc.origin === 'requirement' &&
            ['stable', 'evergreen', 'canonical'].includes(doc.form || '')
        ) {
            warnings.push(
                'Creative mode may not be appropriate for requirement-driven stable documents. ' +
                    'Consider using Review or Research mode.'
            );
        }
    }

    return warnings;
}

/**
 * Get the suggested mode with explanation
 */
export function getSuggestedModeWithReason(doc: DocumentState): {
    mode: CreativityModeId;
    reason: string;
} {
    const mode = suggestCreativityMode(doc);

    let reason: string;
    switch (mode) {
        case 'research':
            reason =
                'This document requires strict verification due to its audience/origin or canonical form.';
            break;
        case 'review':
            reason =
                'This document is stable/mature and would benefit from quality-focused analysis.';
            break;
        case 'creative':
            reason =
                'This document is exploratory (insight/curiosity origin) and benefits from creative freedom.';
            break;
        case 'draft':
        default:
            reason =
                'This document is in development and benefits from exploratory analysis without strict verification.';
            break;
    }

    return { mode, reason };
}
