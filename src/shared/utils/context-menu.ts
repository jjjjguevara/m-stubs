import { Menu, type App } from 'obsidian';

/**
 * A single item in the context menu
 */
export interface ContextMenuItem {
	/** Display title for the menu item */
	title: string;
	/** Optional Lucide icon name (e.g., 'file-text', 'link', 'copy') */
	icon?: string;
	/** Callback when item is clicked */
	callback: () => void;
	/** If true, adds a separator before this item */
	separator?: boolean;
	/** Optional section label (adds a header before this item) */
	section?: string;
	/** If true, the item is disabled and grayed out */
	disabled?: boolean;
	/** Optional CSS class for styling (e.g., 'mod-warning' for destructive actions) */
	className?: string;
}

/**
 * Options for showing a context menu
 */
export interface ContextMenuOptions {
	/** The mouse event that triggered the menu */
	event: MouseEvent;
	/** Menu items to display */
	items: ContextMenuItem[];
	/** The Obsidian app instance */
	app: App;
	/** Optional callback when menu is closed */
	onClose?: () => void;
}

/**
 * Show a context menu at the mouse position using Obsidian's native Menu API.
 * This provides a consistent look and feel with other Obsidian menus.
 *
 * @example
 * ```ts
 * showContextMenu({
 *   event: mouseEvent,
 *   app: plugin.app,
 *   items: [
 *     { title: 'Insert as reference', icon: 'link', callback: () => insertRef() },
 *     { title: 'Insert as related', icon: 'plus', callback: () => insertRelated() },
 *     { separator: true, title: '', callback: () => {} },
 *     { title: 'Copy link', icon: 'copy', callback: () => copyLink() },
 *     { separator: true, title: '', callback: () => {} },
 *     { title: 'Open in new pane', icon: 'external-link', callback: () => openPane() },
 *   ]
 * });
 * ```
 */
export function showContextMenu(options: ContextMenuOptions): void {
	const { event, items, onClose } = options;

	// Prevent default browser context menu
	event.preventDefault();
	event.stopPropagation();

	const menu = new Menu();

	let currentSection: string | undefined;

	for (const item of items) {
		// Handle section headers
		if (item.section && item.section !== currentSection) {
			currentSection = item.section;
			menu.addSeparator();
			// Note: Obsidian's Menu doesn't have a native section header,
			// but we can add a disabled item with the section name
			menu.addItem((menuItem) => {
				menuItem
					.setTitle(item.section!)
					.setDisabled(true)
					.setSection('header');
			});
		}

		// Handle separators
		if (item.separator) {
			menu.addSeparator();
		}

		// Skip items with no title (used for separator-only entries)
		if (!item.title) continue;

		menu.addItem((menuItem) => {
			menuItem.setTitle(item.title);

			if (item.icon) {
				menuItem.setIcon(item.icon);
			}

			if (item.disabled) {
				menuItem.setDisabled(true);
			}

			menuItem.onClick(() => {
				item.callback();
			});
		});
	}

	// Register close callback if provided
	if (onClose) {
		menu.onHide(() => {
			onClose();
		});
	}

	// Show menu at mouse position
	menu.showAtMouseEvent(event);
}

/**
 * Create context menu items for a related note in the Explore view.
 * Provides a standard set of actions for interacting with related notes.
 *
 * @param handlers - Object containing handler functions for each action
 * @returns Array of ContextMenuItem objects
 */
export function createRelatedNoteMenuItems(handlers: {
	onAddReference?: () => void;
	onAddRelated?: () => void;
	onCopyLink?: () => void;
	onCopyBlockLink?: () => void;
	onCopyBlockEmbed?: () => void;
	onInvestigate?: () => void;
	onOpenNewPane?: () => void;
	onDismiss?: () => void;
}): ContextMenuItem[] {
	const items: ContextMenuItem[] = [];

	if (handlers.onAddReference) {
		items.push({
			title: 'Insert as reference',
			icon: 'link',
			callback: handlers.onAddReference,
		});
	}

	if (handlers.onAddRelated) {
		items.push({
			title: 'Insert as related',
			icon: 'plus',
			callback: handlers.onAddRelated,
		});
	}

	if (handlers.onCopyLink || handlers.onCopyBlockLink || handlers.onCopyBlockEmbed) {
		items.push({ title: '', separator: true, callback: () => {} });
	}

	if (handlers.onCopyLink) {
		items.push({
			title: 'Copy link to note',
			icon: 'copy',
			callback: handlers.onCopyLink,
		});
	}

	if (handlers.onCopyBlockLink) {
		items.push({
			title: 'Copy link to block',
			icon: 'hash',
			callback: handlers.onCopyBlockLink,
		});
	}

	if (handlers.onCopyBlockEmbed) {
		items.push({
			title: 'Copy block embed',
			icon: 'file-text',
			callback: handlers.onCopyBlockEmbed,
		});
	}

	if (handlers.onInvestigate) {
		items.push({ title: '', separator: true, callback: () => {} });
		items.push({
			title: 'Investigate relationship',
			icon: 'search',
			callback: handlers.onInvestigate,
			className: 'mod-ai',
		});
	}

	if (handlers.onOpenNewPane) {
		items.push({ title: '', separator: true, callback: () => {} });
		items.push({
			title: 'Open in new pane',
			icon: 'external-link',
			callback: handlers.onOpenNewPane,
		});
	}

	if (handlers.onDismiss) {
		items.push({ title: '', separator: true, callback: () => {} });
		items.push({
			title: 'Dismiss suggestion',
			icon: 'x',
			callback: handlers.onDismiss,
			className: 'mod-warning',
		});
	}

	return items;
}

/**
 * Create context menu items for an AI suggestion card.
 * Provides a standard set of actions for interacting with suggestions.
 *
 * @param handlers - Object containing handler functions for each action
 * @returns Array of ContextMenuItem objects
 */
export function createSuggestionMenuItems(handlers: {
	onAccept?: () => void;
	onReject?: () => void;
	onInvestigate?: () => void;
	onViewInEditor?: () => void;
	onCopyReasoning?: () => void;
}): ContextMenuItem[] {
	const items: ContextMenuItem[] = [];

	if (handlers.onAccept) {
		items.push({
			title: 'Accept suggestion',
			icon: 'check',
			callback: handlers.onAccept,
		});
	}

	if (handlers.onReject) {
		items.push({
			title: 'Reject suggestion',
			icon: 'x',
			callback: handlers.onReject,
		});
	}

	if (handlers.onInvestigate || handlers.onViewInEditor) {
		items.push({ title: '', separator: true, callback: () => {} });
	}

	if (handlers.onInvestigate) {
		items.push({
			title: 'Investigate with AI',
			icon: 'brain',
			callback: handlers.onInvestigate,
			className: 'mod-ai',
		});
	}

	if (handlers.onViewInEditor) {
		items.push({
			title: 'View location in editor',
			icon: 'file-text',
			callback: handlers.onViewInEditor,
		});
	}

	if (handlers.onCopyReasoning) {
		items.push({ title: '', separator: true, callback: () => {} });
		items.push({
			title: 'Copy reasoning',
			icon: 'copy',
			callback: handlers.onCopyReasoning,
		});
	}

	return items;
}
