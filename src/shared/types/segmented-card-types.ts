/**
 * Types for the segmented card component with mappable command regions.
 * Each region can be mapped to an Obsidian command from the command palette.
 */

/** A single region within a segmented card */
export interface CardRegion {
	/** Unique identifier for this region */
	id: string;
	/** Width percentage (0-100), all regions should sum to 100 */
	widthPercent: number;
	/** Obsidian command ID to execute when this region is clicked */
	commandId: string;
	/** Human-readable label shown on hover */
	label: string;
	/** Optional Lucide icon name for visual indicator */
	icon?: string;
}

/** Preset configurations for common card layouts */
export type CardPreset = 'equal-4' | 'equal-5' | 'asymmetric-4' | 'custom';

/** Configuration for the segmented card behavior */
export interface CardSegmentationConfig {
	/** Whether segmented card mode is enabled */
	enabled: boolean;
	/** The preset being used, or 'custom' for user-defined regions */
	preset: CardPreset;
	/** The actual region definitions */
	regions: CardRegion[];
}

/** Settings stored in plugin configuration */
export interface CardSegmentationSettings {
	/** Whether card segmentation is enabled globally */
	enabled: boolean;
	/** Default preset to use */
	defaultPreset: CardPreset;
	/** Custom regions when preset is 'custom' */
	customRegions: CardRegion[];
	/** Whether to show region labels on hover */
	showLabelsOnHover: boolean;
	/** Whether to show visual separators between regions */
	showSeparators: boolean;
}

/** Preset definitions with their region configurations */
export const CARD_PRESETS: Record<CardPreset, CardRegion[]> = {
	'equal-4': [
		{ id: 'region-1', widthPercent: 25, commandId: '', label: 'Action 1', icon: undefined },
		{ id: 'region-2', widthPercent: 25, commandId: '', label: 'Action 2', icon: undefined },
		{ id: 'region-3', widthPercent: 25, commandId: '', label: 'Action 3', icon: undefined },
		{ id: 'region-4', widthPercent: 25, commandId: '', label: 'Action 4', icon: undefined },
	],
	'equal-5': [
		{ id: 'region-1', widthPercent: 20, commandId: '', label: 'Action 1', icon: undefined },
		{ id: 'region-2', widthPercent: 20, commandId: '', label: 'Action 2', icon: undefined },
		{ id: 'region-3', widthPercent: 20, commandId: '', label: 'Action 3', icon: undefined },
		{ id: 'region-4', widthPercent: 20, commandId: '', label: 'Action 4', icon: undefined },
		{ id: 'region-5', widthPercent: 20, commandId: '', label: 'Action 5', icon: undefined },
	],
	'asymmetric-4': [
		{ id: 'region-1', widthPercent: 15, commandId: '', label: 'Quick Action', icon: undefined },
		{ id: 'region-2', widthPercent: 35, commandId: '', label: 'Primary', icon: undefined },
		{ id: 'region-3', widthPercent: 35, commandId: '', label: 'Secondary', icon: undefined },
		{ id: 'region-4', widthPercent: 15, commandId: '', label: 'Dismiss', icon: undefined },
	],
	custom: [],
};

/** Default settings for card segmentation */
export const DEFAULT_CARD_SEGMENTATION_SETTINGS: CardSegmentationSettings = {
	enabled: false,
	defaultPreset: 'asymmetric-4',
	customRegions: [],
	showLabelsOnHover: true,
	showSeparators: false,
};

/** Default command mappings for Explore view cards */
export const EXPLORE_CARD_DEFAULT_COMMANDS: Record<string, string> = {
	'region-1': 'doc-doctor:open-note-in-new-pane',
	'region-2': 'doc-doctor:add-as-related',
	'region-3': 'doc-doctor:add-as-reference',
	'region-4': 'doc-doctor:dismiss-suggestion',
};

/** Default command mappings for AI suggestion cards */
export const AI_CARD_DEFAULT_COMMANDS: Record<string, string> = {
	'region-1': 'doc-doctor:accept-suggestion',
	'region-2': 'doc-doctor:investigate-suggestion',
	'region-3': 'doc-doctor:view-in-editor',
	'region-4': 'doc-doctor:reject-suggestion',
};

/** Context passed to command execution */
export interface CardCommandContext {
	/** Path to the related note/file */
	notePath?: string;
	/** Title of the note */
	noteTitle?: string;
	/** Similarity score if applicable */
	similarity?: number;
	/** Index of the suggestion if applicable */
	suggestionIndex?: number;
	/** Any additional metadata */
	metadata?: Record<string, unknown>;
}

/** Event dispatched when a card region is clicked */
export interface CardRegionClickEvent {
	/** The region that was clicked */
	region: CardRegion;
	/** The command to execute */
	commandId: string;
	/** Context for the command */
	context: CardCommandContext;
	/** Original mouse event */
	originalEvent: MouseEvent;
}

/**
 * Calculate which region was clicked based on X coordinate
 * @param clickX - The X coordinate of the click relative to the card
 * @param cardWidth - The total width of the card
 * @param regions - The region definitions
 * @returns The region that was clicked, or null if none
 */
export function getRegionFromClick(
	clickX: number,
	cardWidth: number,
	regions: CardRegion[],
): CardRegion | null {
	if (cardWidth <= 0 || regions.length === 0) return null;

	const clickPercent = (clickX / cardWidth) * 100;
	let accumulated = 0;

	for (const region of regions) {
		accumulated += region.widthPercent;
		if (clickPercent <= accumulated) {
			return region;
		}
	}

	// Fallback to last region
	return regions[regions.length - 1];
}

/**
 * Validate that regions sum to 100%
 * @param regions - The regions to validate
 * @returns true if valid, false otherwise
 */
export function validateRegions(regions: CardRegion[]): boolean {
	if (regions.length === 0) return false;
	const sum = regions.reduce((acc, r) => acc + r.widthPercent, 0);
	return Math.abs(sum - 100) < 0.01; // Allow small floating point errors
}

/**
 * Normalize regions to sum to exactly 100%
 * @param regions - The regions to normalize
 * @returns Normalized regions
 */
export function normalizeRegions(regions: CardRegion[]): CardRegion[] {
	if (regions.length === 0) return [];
	const sum = regions.reduce((acc, r) => acc + r.widthPercent, 0);
	if (sum === 0) return regions;

	return regions.map((r) => ({
		...r,
		widthPercent: (r.widthPercent / sum) * 100,
	}));
}
