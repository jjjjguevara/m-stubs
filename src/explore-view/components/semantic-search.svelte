<script lang="ts">
    import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
    import { Search, X, Loader2 } from 'lucide-svelte';

    export let query: string = '';
    export let isLoading: boolean = false;
    export let placeholder: string = 'Search vault semantically...';
    export let debounceMs: number = 300;
    export let autoFocus: boolean = false;

    const dispatch = createEventDispatcher<{
        search: string;
        clear: void;
    }>();

    let inputValue = query;
    let inputEl: HTMLInputElement;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastExternalQuery = query;

    // Sync external query changes (only when prop changes from outside)
    $: if (query !== lastExternalQuery) {
        lastExternalQuery = query;
        inputValue = query;
    }

    onMount(async () => {
        if (autoFocus) {
            // Wait for DOM to be ready
            await tick();
            inputEl?.focus();
        }
    });

    onDestroy(() => {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
    });

    function handleInput(e: Event) {
        const target = e.target as HTMLInputElement;
        inputValue = target.value;

        // Debounce search
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(() => {
            dispatch('search', inputValue);
        }, debounceMs);
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            handleClear();
        } else if (e.key === 'Enter') {
            // Immediate search on Enter
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }
            dispatch('search', inputValue);
        }
    }

    function handleClear() {
        inputValue = '';
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        dispatch('clear');
        inputEl?.focus();
    }

    function focus() {
        inputEl?.focus();
    }
</script>

<div class="semantic-search">
    <div class="search-icon">
        {#if isLoading}
            <span class="spinning"><Loader2 size={14} /></span>
        {:else}
            <Search size={14} />
        {/if}
    </div>

    <input
        bind:this={inputEl}
        type="text"
        class="search-input"
        {placeholder}
        value={inputValue}
        on:input={handleInput}
        on:keydown={handleKeydown}
    />

    {#if inputValue}
        <button
            class="clear-btn"
            on:click={handleClear}
            title="Clear search (Esc)"
        >
            <X size={14} />
        </button>
    {/if}
</div>

<style>
    .semantic-search {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        background: var(--background-secondary);
        border: 1px solid var(--background-modifier-border);
        border-radius: 8px;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }

    .semantic-search:focus-within {
        border-color: var(--interactive-accent);
        box-shadow: 0 0 0 2px var(--background-modifier-border-focus);
    }

    .search-icon {
        flex-shrink: 0;
        color: var(--text-muted);
        display: flex;
        align-items: center;
    }

    .search-input {
        flex: 1;
        min-width: 0;
        padding: 0;
        border: none;
        background: transparent;
        color: var(--text-normal);
        font-size: var(--font-ui-small);
        outline: none;
    }

    .search-input::placeholder {
        color: var(--text-faint);
    }

    .clear-btn {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2px;
        border: none;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        border-radius: 4px;
        transition: all 0.1s ease;
    }

    .clear-btn:hover {
        background: var(--background-modifier-hover);
        color: var(--text-normal);
    }

    :global(.spinning) {
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
</style>
