<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { FileText, Cpu, Type, X, Check } from 'lucide-svelte';
    import type { RelatedNote } from '../../smart-connections/types';
    import type DocDoctorPlugin from '../../main';
    import {
        selectedResults,
        isMultiSelectMode,
        toggleResultSelection,
        dismissResult,
    } from '../explore-store';
    import { showContextMenu, createRelatedNoteMenuItems } from '../../shared/utils/context-menu';

    export let note: RelatedNote;
    export let compact = false;
    export let plugin: DocDoctorPlugin;

    const dispatch = createEventDispatcher<{
        click: void;
        newpane: void;
        addrelated: void;
        addreference: void;
        copylink: void;
        copyblocklink: void;
        copyblockembed: void;
        investigate: void;
        dismiss: void;
    }>();

    $: isSelected = $selectedResults.has(note.path);
    $: similarityPercent = Math.round(note.similarity * 100);
    $: similarityClass = similarityPercent >= 80 ? 'high' : similarityPercent >= 60 ? 'medium' : 'low';

    function handleClick(e: MouseEvent) {
        if ($isMultiSelectMode) {
            toggleResultSelection(note.path);
            return;
        }

        if (e.metaKey || e.ctrlKey) {
            dispatch('newpane');
        } else {
            dispatch('click');
        }
    }

    function handleDismiss(e: MouseEvent) {
        e.stopPropagation();
        dismissResult(note.path);
        dispatch('dismiss');
    }

    function handleSelect(e: MouseEvent) {
        e.stopPropagation();
        toggleResultSelection(note.path);
    }

    function handleContextMenu(e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();

        const menuItems = createRelatedNoteMenuItems({
            onAddReference: () => dispatch('addreference'),
            onAddRelated: () => dispatch('addrelated'),
            onCopyLink: () => dispatch('copylink'),
            onCopyBlockLink: () => dispatch('copyblocklink'),
            onCopyBlockEmbed: () => dispatch('copyblockembed'),
            onInvestigate: () => dispatch('investigate'),
            onOpenNewPane: () => dispatch('newpane'),
            onDismiss: () => {
                dismissResult(note.path);
                dispatch('dismiss');
            },
        });

        showContextMenu({
            event: e,
            items: menuItems,
            app: plugin.app,
        });
    }
</script>

<div
    class="related-note-item"
    class:compact
    class:selected={isSelected}
    class:multi-select-mode={$isMultiSelectMode}
    on:click={handleClick}
    on:contextmenu={handleContextMenu}
    on:keydown={(e) => e.key === 'Enter' && handleClick(e)}
    role="button"
    tabindex="0"
    title="{note.title} - Similarity: {similarityPercent}%"
>
    <!-- Hover dismiss button in top-right corner -->
    <button
        class="dismiss-tag"
        on:click={handleDismiss}
        title="Dismiss temporarily"
        aria-label="Dismiss"
    >
        <X size={10} />
    </button>

    {#if $isMultiSelectMode}
        <button
            class="select-checkbox"
            class:checked={isSelected}
            on:click={handleSelect}
            aria-label={isSelected ? 'Deselect' : 'Select'}
        >
            {#if isSelected}
                <Check size={12} />
            {/if}
        </button>
    {/if}

    <div class="note-icon">
        <FileText size={compact ? 12 : 14} />
    </div>

    <div class="note-content">
        <div class="note-title">{note.title}</div>
        {#if note.excerpt && !compact}
            <div class="note-excerpt">{note.excerpt}</div>
        {/if}
        {#if note.matchedKeywords && note.matchedKeywords.length > 0 && !compact}
            <div class="note-keywords">
                {#each note.matchedKeywords.slice(0, 3) as keyword}
                    <span class="keyword">{keyword}</span>
                {/each}
            </div>
        {/if}
    </div>

    <div class="note-meta">
        <div class="similarity {similarityClass}">
            {similarityPercent}%
        </div>
        {#if !compact}
            <div class="method-indicator" title={note.method === 'embedding' ? 'Semantic (embedding)' : 'Keyword-based'}>
                {#if note.method === 'embedding'}
                    <Cpu size={10} />
                {:else}
                    <Type size={10} />
                {/if}
            </div>
        {/if}
    </div>
</div>

<style>
    .related-note-item {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        width: 100%;
        padding: 10px 12px;
        border: none;
        background: var(--background-primary);
        cursor: pointer;
        border-radius: 8px;
        text-align: left;
        transition: background 0.1s ease, box-shadow 0.15s ease;
        position: relative;
    }

    .related-note-item.compact {
        padding: 6px 8px;
        gap: 6px;
    }

    .related-note-item:hover {
        background: var(--background-modifier-hover);
    }

    .related-note-item.selected {
        background: var(--background-modifier-active-hover);
        box-shadow: inset 0 0 0 1px var(--interactive-accent);
    }

    .related-note-item.multi-select-mode {
        padding-left: 8px;
    }

    /* Hover dismiss tag in top-right corner */
    .dismiss-tag {
        position: absolute;
        top: 4px;
        right: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        padding: 0;
        border: none;
        background: var(--background-modifier-border);
        color: var(--text-muted);
        border-radius: 50%;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.15s ease, background 0.1s ease, color 0.1s ease;
        z-index: 10;
    }

    .related-note-item:hover .dismiss-tag {
        opacity: 1;
    }

    .dismiss-tag:hover {
        background: var(--background-modifier-error);
        color: var(--text-error);
    }

    .select-checkbox {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        border: 1.5px solid var(--text-muted);
        border-radius: 4px;
        background: transparent;
        color: white;
        cursor: pointer;
        transition: all 0.15s ease;
        margin-top: 1px;
    }

    .select-checkbox:hover {
        border-color: var(--interactive-accent);
    }

    .select-checkbox.checked {
        background: var(--interactive-accent);
        border-color: var(--interactive-accent);
    }

    .note-icon {
        flex-shrink: 0;
        color: var(--text-muted);
        padding-top: 2px;
    }

    .note-content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
    }

    .note-title {
        font-size: var(--font-ui-small);
        font-weight: 500;
        color: var(--text-normal);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        line-height: 1.3;
    }

    .compact .note-title {
        font-size: var(--font-ui-smaller);
    }

    .note-excerpt {
        font-size: var(--font-ui-smaller);
        color: var(--text-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        line-height: 1.4;
    }

    .note-keywords {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
        margin-top: 2px;
    }

    .keyword {
        font-size: 10px;
        padding: 2px 5px;
        background: var(--background-modifier-border);
        color: var(--text-faint);
        border-radius: 4px;
    }

    .note-meta {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
    }

    .similarity {
        font-size: var(--font-ui-smaller);
        font-weight: 600;
        padding: 2px 6px;
        border-radius: 4px;
    }

    .similarity.high {
        background: rgba(46, 204, 113, 0.2);
        color: var(--color-green);
    }

    .similarity.medium {
        background: rgba(241, 196, 15, 0.2);
        color: var(--color-yellow);
    }

    .similarity.low {
        background: var(--background-modifier-border);
        color: var(--text-muted);
    }

    .method-indicator {
        color: var(--text-faint);
        opacity: 0.7;
    }
</style>
