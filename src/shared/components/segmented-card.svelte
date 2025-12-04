<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { App } from 'obsidian';
	import type {
		CardRegion,
		CardSegmentationConfig,
		CardCommandContext,
		CardRegionClickEvent,
	} from '../types/segmented-card-types';
	import { getRegionFromClick } from '../types/segmented-card-types';

	export let config: CardSegmentationConfig;
	export let context: CardCommandContext = {};
	export let app: App;
	export let disabled = false;

	const dispatch = createEventDispatcher<{
		regionClick: CardRegionClickEvent;
		contextmenu: MouseEvent;
	}>();

	let cardElement: HTMLDivElement;
	let hoveredRegionId: string | null = null;

	function handleClick(event: MouseEvent) {
		if (disabled || !config.enabled) {
			// If segmentation is disabled, just dispatch the click to parent
			return;
		}

		// Prevent default card click behavior
		event.stopPropagation();

		const rect = cardElement.getBoundingClientRect();
		const clickX = event.clientX - rect.left;
		const region = getRegionFromClick(clickX, rect.width, config.regions);

		if (region && region.commandId) {
			dispatch('regionClick', {
				region,
				commandId: region.commandId,
				context,
				originalEvent: event,
			});

			// Execute the Obsidian command
			try {
				app.commands.executeCommandById(region.commandId);
			} catch (e) {
				console.warn(`Failed to execute command: ${region.commandId}`, e);
			}
		}
	}

	function handleMouseMove(event: MouseEvent) {
		if (!config.enabled) return;

		const rect = cardElement.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const region = getRegionFromClick(x, rect.width, config.regions);
		hoveredRegionId = region?.id ?? null;
	}

	function handleMouseLeave() {
		hoveredRegionId = null;
	}

	function handleContextMenu(event: MouseEvent) {
		dispatch('contextmenu', event);
	}

	function getRegionStyle(region: CardRegion): string {
		return `width: ${region.widthPercent}%`;
	}

	$: hoveredRegion = config.regions.find((r) => r.id === hoveredRegionId);
</script>

<div
	class="segmented-card"
	class:segmented={config.enabled}
	class:disabled
	bind:this={cardElement}
	on:click={handleClick}
	on:mousemove={handleMouseMove}
	on:mouseleave={handleMouseLeave}
	on:contextmenu={handleContextMenu}
	on:keydown={(e) => e.key === 'Enter' && handleClick(e)}
	role="button"
	tabindex="0"
>
	{#if config.enabled}
		<!-- Region overlay for visual feedback -->
		<div class="regions-overlay">
			{#each config.regions as region (region.id)}
				<div
					class="region"
					class:hovered={region.id === hoveredRegionId}
					class:has-command={!!region.commandId}
					style={getRegionStyle(region)}
					title={region.label}
				>
					{#if region.id === hoveredRegionId && region.label}
						<span class="region-label">{region.label}</span>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Card content via slot -->
	<div class="card-content">
		<slot />
	</div>

	<!-- Hover tooltip for current region -->
	{#if config.enabled && hoveredRegion && hoveredRegion.label}
		<div class="region-tooltip">
			{hoveredRegion.label}
		</div>
	{/if}
</div>

<style>
	.segmented-card {
		position: relative;
		display: flex;
		flex-direction: column;
		width: 100%;
		cursor: pointer;
	}

	.segmented-card.disabled {
		pointer-events: none;
		opacity: 0.6;
	}

	.segmented-card.segmented {
		cursor: default;
	}

	.regions-overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		pointer-events: none;
		z-index: 1;
	}

	.region {
		height: 100%;
		transition: background-color 0.15s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: auto;
		cursor: pointer;
		border-right: 1px solid transparent;
	}

	.region:last-child {
		border-right: none;
	}

	.region.hovered {
		background-color: var(--background-modifier-hover);
	}

	.region.hovered.has-command {
		background-color: rgba(var(--interactive-accent-rgb), 0.1);
	}

	.region:not(.has-command) {
		cursor: default;
	}

	.region-label {
		font-size: var(--font-ui-smaller);
		color: var(--text-muted);
		opacity: 0;
		transition: opacity 0.15s ease;
		white-space: nowrap;
		padding: 2px 6px;
		background: var(--background-primary);
		border-radius: 4px;
		box-shadow: var(--shadow-s);
	}

	.region.hovered .region-label {
		opacity: 1;
	}

	.card-content {
		position: relative;
		z-index: 0;
		width: 100%;
	}

	.region-tooltip {
		position: absolute;
		bottom: -24px;
		left: 50%;
		transform: translateX(-50%);
		font-size: var(--font-ui-smaller);
		color: var(--text-on-accent);
		background: var(--interactive-accent);
		padding: 2px 8px;
		border-radius: 4px;
		white-space: nowrap;
		z-index: 10;
		pointer-events: none;
		box-shadow: var(--shadow-s);
	}

	/* When card is focused via keyboard */
	.segmented-card:focus {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
	}

	.segmented-card:focus:not(:focus-visible) {
		outline: none;
	}
</style>
