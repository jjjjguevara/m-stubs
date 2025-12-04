/**
 * Command Manifest - Developer Tool
 *
 * Central registry of all plugin commands for easy management and hotkey integration.
 * This file serves as the source of truth for:
 * - All available commands and their IDs
 * - Default hotkeys
 * - Command categories and descriptions
 * - Feature flag associations (which settings enable which commands)
 *
 * Usage:
 * - Import `COMMAND_MANIFEST` to programmatically access all commands
 * - Use `getEnabledCommands()` to get currently enabled commands based on settings
 * - Use `generateHotkeyConfig()` to export default hotkey mappings
 */

/**
 * Command category for grouping related commands
 */
export type CommandCategory =
    | 'annotations'   // Comment/highlight annotation commands
    | 'stubs'         // Stub management commands
    | 'navigation'    // Navigate between stubs/annotations
    | 'ai'            // AI analysis and generation
    | 'mcp'           // MCP tool integration
    | 'explore'       // Related notes and search
    | 'general';      // General plugin commands

/**
 * Feature flag keys that control command availability
 */
export type FeatureFlag =
    | 'annotations'   // settings.features.annotations
    | 'stubs'         // settings.features.stubs
    | 'ai'            // settings.features.ai
    | 'explore'       // settings.features.explore
    | 'mcp'           // settings.mcp.enabled
    | 'always';       // Always available

/**
 * Command definition for the manifest
 */
export interface CommandManifestEntry {
    /** Unique command ID (used in Obsidian command palette) */
    id: string;
    /** Display name shown in command palette */
    name: string;
    /** Short description of what the command does */
    description: string;
    /** Category for grouping */
    category: CommandCategory;
    /** Feature flag that must be enabled for this command */
    requiredFeature: FeatureFlag;
    /** Default hotkey if any */
    defaultHotkey?: {
        key: string;
        modifiers: ('Mod' | 'Shift' | 'Alt' | 'Ctrl')[];
    };
    /** Whether this is an editor command (requires active file) */
    isEditorCommand: boolean;
    /** Optional Lucide icon name */
    icon?: string;
    /** Whether command is currently implemented */
    implemented: boolean;
}

/**
 * Complete command manifest
 */
export const COMMAND_MANIFEST: CommandManifestEntry[] = [
    // =========================================================================
    // GENERAL COMMANDS
    // =========================================================================
    {
        id: 'labeled-annotations:enable-decoration',
        name: 'Enable decoration',
        description: 'Enable annotation styling in editor',
        category: 'general',
        requiredFeature: 'annotations',
        isEditorCommand: true,
        implemented: true,
    },
    {
        id: 'labeled-annotations:disable-decoration',
        name: 'Disable decoration',
        description: 'Disable annotation styling in editor',
        category: 'general',
        requiredFeature: 'annotations',
        isEditorCommand: true,
        implemented: true,
    },

    // =========================================================================
    // ANNOTATION COMMANDS
    // =========================================================================
    {
        id: 'labeled-annotations:jump-to-new-line',
        name: 'Jump to new line',
        description: 'Insert a new line and move cursor',
        category: 'annotations',
        requiredFeature: 'annotations',
        defaultHotkey: { key: 'F5', modifiers: [] },
        isEditorCommand: true,
        implemented: true,
    },
    {
        id: 'labeled-annotations:insert-comment',
        name: 'Insert comment',
        description: 'Insert a new comment annotation',
        category: 'annotations',
        requiredFeature: 'annotations',
        defaultHotkey: { key: 'F7', modifiers: [] },
        isEditorCommand: true,
        implemented: true,
    },
    {
        id: 'labeled-annotations:insert-comment-after-empty-line',
        name: 'Insert comment after empty line',
        description: 'Insert a comment with a preceding empty line',
        category: 'annotations',
        requiredFeature: 'annotations',
        defaultHotkey: { key: 'F7', modifiers: ['Shift'] },
        isEditorCommand: true,
        implemented: true,
    },
    {
        id: 'labeled-annotations:insert-comment-with-previous-label',
        name: 'Insert comment with previous label',
        description: 'Insert comment using most recent label',
        category: 'annotations',
        requiredFeature: 'annotations',
        defaultHotkey: { key: 'F6', modifiers: [] },
        isEditorCommand: true,
        implemented: true,
    },
    {
        id: 'labeled-annotations:insert-comment-with-previous-label-after-empty-line',
        name: 'Insert comment with previous label after empty line',
        description: 'Insert comment with previous label and preceding empty line',
        category: 'annotations',
        requiredFeature: 'annotations',
        defaultHotkey: { key: 'F6', modifiers: ['Shift'] },
        isEditorCommand: true,
        implemented: true,
    },
    {
        id: 'labeled-annotations:insert-comment-with-second-previous-label',
        name: 'Insert comment with second previous label',
        description: 'Insert comment using second most recent label',
        category: 'annotations',
        requiredFeature: 'annotations',
        defaultHotkey: { key: 'F6', modifiers: ['Alt'] },
        isEditorCommand: true,
        implemented: true,
    },
    {
        id: 'labeled-annotations:insert-comment-with-second-previous-label-after-empty-line',
        name: 'Insert comment with second previous label after empty line',
        description: 'Insert comment with second previous label and preceding empty line',
        category: 'annotations',
        requiredFeature: 'annotations',
        defaultHotkey: { key: 'F6', modifiers: ['Shift', 'Alt'] },
        isEditorCommand: true,
        implemented: true,
    },

    // =========================================================================
    // STUB COMMANDS
    // =========================================================================
    {
        id: 'doc-doctor:sync-stubs',
        name: 'Sync stubs with document',
        description: 'Synchronize frontmatter stubs with inline anchors',
        category: 'stubs',
        requiredFeature: 'stubs',
        isEditorCommand: false,
        icon: 'refresh-cw',
        implemented: true,
    },
    {
        id: 'doc-doctor:insert-stub',
        name: 'Insert new stub at cursor',
        description: 'Open modal to insert a new stub at cursor position',
        category: 'stubs',
        requiredFeature: 'stubs',
        isEditorCommand: true,
        icon: 'plus-square',
        implemented: true,
    },
    {
        id: 'doc-doctor:next-stub',
        name: 'Go to next stub',
        description: 'Navigate to the next stub in document',
        category: 'navigation',
        requiredFeature: 'stubs',
        isEditorCommand: false,
        icon: 'chevron-down',
        implemented: true,
    },
    {
        id: 'doc-doctor:prev-stub',
        name: 'Go to previous stub',
        description: 'Navigate to the previous stub in document',
        category: 'navigation',
        requiredFeature: 'stubs',
        isEditorCommand: false,
        icon: 'chevron-up',
        implemented: true,
    },
    {
        id: 'doc-doctor:resolve-orphaned-stub',
        name: 'Resolve orphaned stub (create anchor)',
        description: 'Link an orphaned stub to cursor position',
        category: 'stubs',
        requiredFeature: 'stubs',
        isEditorCommand: true,
        icon: 'link',
        implemented: true,
    },
    {
        id: 'doc-doctor:remove-orphaned-anchor',
        name: 'Remove orphaned anchor',
        description: 'Remove an anchor that has no linked stub',
        category: 'stubs',
        requiredFeature: 'stubs',
        isEditorCommand: true,
        icon: 'unlink',
        implemented: true,
    },
    {
        id: 'doc-doctor:add-stub-from-selection',
        name: 'Create stub from selection',
        description: 'Create a new stub using selected text as description',
        category: 'stubs',
        requiredFeature: 'stubs',
        isEditorCommand: true,
        icon: 'text-select',
        implemented: true,
    },

    // =========================================================================
    // MCP / AI CORE COMMANDS
    // =========================================================================
    {
        id: 'doc-doctor:parse-document',
        name: 'Parse Document',
        description: 'Parse document and extract J-Editorial metadata',
        category: 'mcp',
        requiredFeature: 'mcp',
        isEditorCommand: true,
        icon: 'file-text',
        implemented: true,
    },
    {
        id: 'doc-doctor:analyze-document',
        name: 'Analyze Document',
        description: 'Run full J-Editorial analysis on document',
        category: 'mcp',
        requiredFeature: 'mcp',
        isEditorCommand: true,
        icon: 'activity',
        implemented: true,
    },
    {
        id: 'doc-doctor:validate-document',
        name: 'Validate Document',
        description: 'Validate document against J-Editorial schema',
        category: 'mcp',
        requiredFeature: 'mcp',
        isEditorCommand: true,
        icon: 'check-circle',
        implemented: true,
    },
    {
        id: 'doc-doctor:calculate-health',
        name: 'Calculate Health',
        description: 'Calculate document health score',
        category: 'mcp',
        requiredFeature: 'mcp',
        isEditorCommand: true,
        icon: 'heart-pulse',
        implemented: true,
    },
    {
        id: 'doc-doctor:calculate-usefulness',
        name: 'Calculate Usefulness',
        description: 'Calculate usefulness margin vs quality gate',
        category: 'mcp',
        requiredFeature: 'mcp',
        isEditorCommand: true,
        icon: 'trending-up',
        implemented: true,
    },
    {
        id: 'doc-doctor:add-stub',
        name: 'Add Stub...',
        description: 'Add a new stub (opens type selector)',
        category: 'mcp',
        requiredFeature: 'mcp',
        isEditorCommand: true,
        icon: 'plus-square',
        implemented: false,
    },
    {
        id: 'doc-doctor:add-stub-expand',
        name: 'Add Expand Stub',
        description: 'Add an expand stub at cursor',
        category: 'mcp',
        requiredFeature: 'mcp',
        isEditorCommand: true,
        icon: 'expand',
        implemented: true,
    },
    {
        id: 'doc-doctor:add-stub-link',
        name: 'Add Link Stub',
        description: 'Add a citation needed stub at cursor',
        category: 'mcp',
        requiredFeature: 'mcp',
        isEditorCommand: true,
        icon: 'link',
        implemented: true,
    },
    {
        id: 'doc-doctor:add-stub-verify',
        name: 'Add Verify Stub',
        description: 'Add a fact-check stub at cursor',
        category: 'mcp',
        requiredFeature: 'mcp',
        isEditorCommand: true,
        icon: 'check',
        implemented: true,
    },
    {
        id: 'doc-doctor:add-stub-question',
        name: 'Add Question Stub',
        description: 'Add a question stub at cursor',
        category: 'mcp',
        requiredFeature: 'mcp',
        isEditorCommand: true,
        icon: 'help-circle',
        implemented: true,
    },
    {
        id: 'doc-doctor:list-stubs',
        name: 'List Stubs',
        description: 'List all stubs in current document',
        category: 'mcp',
        requiredFeature: 'mcp',
        isEditorCommand: true,
        icon: 'list',
        implemented: true,
    },
    {
        id: 'doc-doctor:find-anchors',
        name: 'Find Anchors',
        description: 'Find all inline anchors in document',
        category: 'mcp',
        requiredFeature: 'mcp',
        isEditorCommand: true,
        icon: 'anchor',
        implemented: true,
    },
    {
        id: 'doc-doctor:ai-custom',
        name: 'Custom Prompt...',
        description: 'Open prompt picker for custom AI action',
        category: 'ai',
        requiredFeature: 'ai',
        isEditorCommand: false,
        icon: 'message-square',
        implemented: false,
    },

    // =========================================================================
    // EXPLORE COMMANDS (FUTURE)
    // =========================================================================
    {
        id: 'doc-doctor:open-explore-view',
        name: 'Open Explore View',
        description: 'Show the Explore panel for related notes',
        category: 'explore',
        requiredFeature: 'explore',
        isEditorCommand: false,
        icon: 'compass',
        implemented: false,
    },
    {
        id: 'doc-doctor:find-related-notes',
        name: 'Find Related Notes',
        description: 'Search for semantically related notes',
        category: 'explore',
        requiredFeature: 'explore',
        isEditorCommand: false,
        icon: 'search',
        implemented: false,
    },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get commands filtered by category
 */
export function getCommandsByCategory(category: CommandCategory): CommandManifestEntry[] {
    return COMMAND_MANIFEST.filter((cmd) => cmd.category === category);
}

/**
 * Get commands for a specific feature
 */
export function getCommandsByFeature(feature: FeatureFlag): CommandManifestEntry[] {
    return COMMAND_MANIFEST.filter((cmd) => cmd.requiredFeature === feature);
}

/**
 * Get only implemented commands
 */
export function getImplementedCommands(): CommandManifestEntry[] {
    return COMMAND_MANIFEST.filter((cmd) => cmd.implemented);
}

/**
 * Get commands with default hotkeys
 */
export function getCommandsWithHotkeys(): CommandManifestEntry[] {
    return COMMAND_MANIFEST.filter((cmd) => cmd.defaultHotkey !== undefined);
}

/**
 * Generate hotkey configuration for export
 */
export function generateHotkeyConfig(): Record<string, { key: string; modifiers: string[] }> {
    const config: Record<string, { key: string; modifiers: string[] }> = {};

    for (const cmd of getCommandsWithHotkeys()) {
        if (cmd.defaultHotkey) {
            config[cmd.id] = {
                key: cmd.defaultHotkey.key,
                modifiers: cmd.defaultHotkey.modifiers,
            };
        }
    }

    return config;
}

/**
 * Get command by ID
 */
export function getCommandById(id: string): CommandManifestEntry | undefined {
    return COMMAND_MANIFEST.find((cmd) => cmd.id === id);
}

/**
 * Count commands by category
 */
export function getCommandCounts(): Record<CommandCategory, number> {
    const counts: Record<CommandCategory, number> = {
        annotations: 0,
        stubs: 0,
        navigation: 0,
        ai: 0,
        mcp: 0,
        explore: 0,
        general: 0,
    };

    for (const cmd of COMMAND_MANIFEST) {
        counts[cmd.category]++;
    }

    return counts;
}

/**
 * Get summary of command manifest for debugging
 */
export function getManifestSummary(): string {
    const counts = getCommandCounts();
    const implemented = getImplementedCommands().length;
    const total = COMMAND_MANIFEST.length;
    const withHotkeys = getCommandsWithHotkeys().length;

    return [
        `Command Manifest Summary:`,
        `  Total: ${total} (${implemented} implemented)`,
        `  With default hotkeys: ${withHotkeys}`,
        `  By category:`,
        ...Object.entries(counts).map(([cat, count]) => `    - ${cat}: ${count}`),
    ].join('\n');
}
