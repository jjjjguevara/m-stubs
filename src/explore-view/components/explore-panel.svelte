<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { slide } from 'svelte/transition';
    import { ChevronDown, ChevronRight, RefreshCw, Search, AlertTriangle, Link2, FileText, Compass, CheckSquare, Square, X, BrainCircuit, Type } from 'lucide-svelte';
    import LabeledAnnotations from '../../main';
    import {
        activeNotePath,
        activeNoteTitle,
        searchQuery,
        results,
        isLoading,
        errorMessage,
        duplicates,
        linkSuggestions,
        stubContext,
        selectedStubForContext,
        expandedSections,
        isSearchMode,
        hasResults,
        hasDuplicates,
        hasLinkSuggestions,
        hasStubContext,
        setActiveNote,
        setSearchQuery,
        setResults,
        setLoading,
        setError,
        clearError,
        setDuplicates,
        setStubContext,
        toggleSection,
        resetExploreState,
        visibleResults,
        selectedResults,
        selectedCount,
        hasSelection,
        isMultiSelectMode,
        toggleMultiSelectMode,
        clearSelection,
        selectAllVisible,
        clearDismissed,
        dismissedResults,
        activeExploreTab,
        useSemanticSearch,
        isSearchExpanded,
        setActiveTab,
        toggleSemanticSearch,
        toggleSearchExpanded,
        collapseSearch,
        type ExploreTab,
    } from '../explore-store';
    import RelatedNoteItem from './related-note-item.svelte';
    import SemanticSearch from './semantic-search.svelte';

    export let plugin: LabeledAnnotations;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    // Subscribe to active file changes
    $: if (plugin.app.workspace) {
        const activeFile = plugin.app.workspace.getActiveFile();
        if (activeFile && activeFile.path !== $activeNotePath) {
            setActiveNote(activeFile.path, activeFile.basename);
            refreshRelatedNotes();
        }
    }

    onMount(() => {
        // Initial load
        const activeFile = plugin.app.workspace.getActiveFile();
        if (activeFile) {
            setActiveNote(activeFile.path, activeFile.basename);
            refreshRelatedNotes();
        }

        // Listen for active file changes
        const unregister = plugin.app.workspace.on('active-leaf-change', () => {
            const file = plugin.app.workspace.getActiveFile();
            if (file && file.path !== $activeNotePath) {
                setActiveNote(file.path, file.basename);
                if (!$isSearchMode) {
                    refreshRelatedNotes();
                }
            }
        });

        return () => {
            plugin.app.workspace.offref(unregister);
        };
    });

    onDestroy(() => {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
    });

    async function refreshRelatedNotes() {
        if (!$activeNotePath || !plugin.smartConnectionsService) {
            setResults([]);
            return;
        }

        setLoading(true);
        clearError();
        clearDismissed(); // Clear dismissed results on refresh
        clearSelection(); // Clear selections on refresh

        try {
            const related = await plugin.smartConnectionsService.findRelated($activeNotePath);
            setResults(related);

            // Also check for duplicates
            const dups = await plugin.smartConnectionsService.detectDuplicates($activeNotePath);
            setDuplicates(dups);
        } catch (error) {
            console.error('[Explore] Error fetching related notes:', error);
            setError('Failed to fetch related notes');
        } finally {
            setLoading(false);
        }
    }

    $: dismissedCount = $dismissedResults.size;
    $: hasVisibleResults = $visibleResults.length > 0;

    async function handleSearch(query: string) {
        if (!query.trim()) {
            // Clear search, show related notes
            setSearchQuery('');
            refreshRelatedNotes();
            return;
        }

        setSearchQuery(query);
        setLoading(true);
        clearError();

        try {
            const searchResults = await plugin.smartConnectionsService?.search(query) ?? [];
            setResults(searchResults);
        } catch (error) {
            console.error('[Explore] Search error:', error);
            setError('Search failed');
        } finally {
            setLoading(false);
        }
    }

    function handleNoteClick(path: string) {
        plugin.app.workspace.openLinkText(path, '', false);
    }

    function handleNoteNewPane(path: string) {
        plugin.app.workspace.openLinkText(path, '', 'split');
    }

    async function handleAddToRelated(path: string) {
        if (!$activeNotePath || !plugin.smartConnectionsService) return;

        try {
            const title = path.split('/').pop()?.replace('.md', '') ?? path;
            const wikilink = `[[${title}]]`;
            await plugin.smartConnectionsService.addToRelatedProperty($activeNotePath, [wikilink]);
            // Could show a notice here
        } catch (error) {
            console.error('[Explore] Error adding to related:', error);
        }
    }

    function formatSimilarity(score: number): string {
        return `${Math.round(score * 100)}%`;
    }

    // New action handlers for dropdown menu
    async function handleAddReference(path: string) {
        if (!$activeNotePath) return;
        try {
            const title = path.split('/').pop()?.replace('.md', '') ?? path;
            const wikilink = `[[${title}]]`;
            // Insert at cursor position in the active note
            const activeView = plugin.app.workspace.getActiveViewOfType(plugin.app.workspace.activeLeaf?.view?.constructor as any);
            if (activeView?.editor) {
                const cursor = activeView.editor.getCursor();
                activeView.editor.replaceRange(wikilink, cursor);
            }
        } catch (error) {
            console.error('[Explore] Error inserting reference:', error);
        }
    }

    function handleCopyLink(path: string) {
        const title = path.split('/').pop()?.replace('.md', '') ?? path;
        navigator.clipboard.writeText(`[[${title}]]`);
    }

    function handleCopyBlockLink(path: string) {
        const title = path.split('/').pop()?.replace('.md', '') ?? path;
        navigator.clipboard.writeText(`[[${title}#]]`);
    }

    function handleCopyBlockEmbed(path: string) {
        const title = path.split('/').pop()?.replace('.md', '') ?? path;
        navigator.clipboard.writeText(`![[${title}]]`);
    }

    async function handleInvestigateRelationship(path: string) {
        // Dispatch event for AI investigation
        window.dispatchEvent(new CustomEvent('investigate-relationship', {
            detail: {
                activePath: $activeNotePath,
                targetPath: path,
            }
        }));
    }
</script>

<div class="explore-panel">
    <!-- Compact Header with controls -->
    <div class="explore-header">
        <div class="header-controls">
            {#if $activeNoteTitle && !$isSearchMode}
                <div class="context-info">
                    <FileText size={12} />
                    <span class="context-title">{$activeNoteTitle}</span>
                </div>
            {:else if $isSearchMode}
                <div class="context-info">
                    <Search size={12} />
                    <span class="context-title">Search results</span>
                </div>
            {/if}

            <div class="header-actions">
                <!-- Search toggle button -->
                <button
                    class="header-btn"
                    class:active={$isSearchExpanded}
                    on:click={toggleSearchExpanded}
                    title="Search vault"
                >
                    <Search size={14} />
                </button>

                <!-- Semantic/Keyword toggle -->
                <button
                    class="header-btn"
                    class:active={$useSemanticSearch}
                    on:click={toggleSemanticSearch}
                    title={$useSemanticSearch ? 'Semantic search (embeddings)' : 'Keyword search'}
                >
                    {#if $useSemanticSearch}
                        <BrainCircuit size={14} />
                    {:else}
                        <Type size={14} />
                    {/if}
                </button>

                <!-- Refresh button -->
                <button
                    class="header-btn"
                    on:click={refreshRelatedNotes}
                    title="Refresh"
                    disabled={$isLoading}
                >
                    <span class:spinning={$isLoading}><RefreshCw size={14} /></span>
                </button>

                <!-- Multi-select toggle -->
                <button
                    class="header-btn"
                    class:active={$isMultiSelectMode}
                    on:click={toggleMultiSelectMode}
                    title={$isMultiSelectMode ? 'Exit multi-select' : 'Multi-select'}
                >
                    {#if $isMultiSelectMode}
                        <CheckSquare size={14} />
                    {:else}
                        <Square size={14} />
                    {/if}
                </button>
            </div>
        </div>

        <!-- Expandable Search Drawer -->
        {#if $isSearchExpanded}
            <div class="search-drawer" transition:slide={{ duration: 200 }}>
                <SemanticSearch
                    query={$searchQuery}
                    isLoading={$isLoading}
                    autoFocus={true}
                    on:search={(e) => handleSearch(e.detail)}
                    on:clear={() => {
                        handleSearch('');
                        collapseSearch();
                    }}
                />
            </div>
        {/if}
    </div>

    <!-- Error Message -->
    {#if $errorMessage}
        <div class="error-message">
            <AlertTriangle size={14} />
            <span>{$errorMessage}</span>
        </div>
    {/if}

    <!-- Tab Navigation - Full Width -->
    <div class="tab-bar">
        <button
            class="tab"
            class:active={$activeExploreTab === 'related'}
            on:click={() => setActiveTab('related')}
        >
            <span class="tab-label">{$isSearchMode ? 'Results' : 'Related'}</span>
            <span class="tab-count">{$visibleResults.length}</span>
        </button>
        <button
            class="tab"
            class:active={$activeExploreTab === 'duplicates'}
            class:has-warning={$hasDuplicates}
            on:click={() => setActiveTab('duplicates')}
        >
            {#if $hasDuplicates}
                <AlertTriangle size={11} class="warning-icon" />
            {/if}
            <span class="tab-label">Duplicates</span>
            <span class="tab-count">{$duplicates.length}</span>
        </button>
    </div>

    <!-- Multi-select actions bar -->
    {#if $isMultiSelectMode && $hasSelection}
        <div class="selection-bar">
            <span class="selection-count">{$selectedCount} selected</span>
            <button class="selection-action" on:click={selectAllVisible} title="Select all">
                Select all
            </button>
            <button class="selection-action" on:click={clearSelection} title="Clear selection">
                Clear
            </button>
        </div>
    {/if}

    <!-- Dismissed notice -->
    {#if dismissedCount > 0 && $activeExploreTab === 'related'}
        <div class="dismissed-notice">
            <span>{dismissedCount} hidden</span>
            <button class="restore-btn" on:click={clearDismissed}>
                <X size={10} />
                Restore
            </button>
        </div>
    {/if}

    <!-- Scrollable Content -->
    <div class="explore-content">
        <!-- Related Notes / Search Results Tab -->
        {#if $activeExploreTab === 'related'}
            <div class="tab-content">
                {#if $isLoading}
                    <div class="loading-state">
                        <span class="spinning"><RefreshCw size={16} /></span>
                        <span>Searching...</span>
                    </div>
                {:else if !hasVisibleResults}
                    <div class="empty-state">
                        <Compass size={24} />
                        <span>
                            {$isSearchMode
                                ? 'No results found'
                                : 'No related notes found'}
                        </span>
                    </div>
                {:else}
                    <div class="results-list">
                        {#each $visibleResults as note (note.path)}
                            <RelatedNoteItem
                                {note}
                                {plugin}
                                on:click={() => handleNoteClick(note.path)}
                                on:newpane={() => handleNoteNewPane(note.path)}
                                on:addrelated={() => handleAddToRelated(note.path)}
                                on:addreference={() => handleAddReference(note.path)}
                                on:copylink={() => handleCopyLink(note.path)}
                                on:copyblocklink={() => handleCopyBlockLink(note.path)}
                                on:copyblockembed={() => handleCopyBlockEmbed(note.path)}
                                on:investigate={() => handleInvestigateRelationship(note.path)}
                            />
                        {/each}
                    </div>
                {/if}

                <!-- Stub Context (shown at bottom if available) -->
                {#if $hasStubContext && $stubContext}
                    <div class="stub-context-section">
                        <div class="stub-context-header">
                            <span class="stub-context-title">Stub Context</span>
                        </div>
                        <div class="stub-context-content">
                            <div class="stub-info">
                                <span class="stub-type">{$stubContext.stub.type}</span>
                                <span class="stub-desc">{$stubContext.stub.description}</span>
                            </div>
                            {#if $stubContext.suggestedLinks.length > 0}
                                <div class="suggested-links">
                                    <span class="suggested-label">Could resolve with:</span>
                                    {#each $stubContext.suggestedLinks as link}
                                        <button class="suggested-link" on:click={() => handleNoteClick(link)}>
                                            {link}
                                        </button>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    </div>
                {/if}

                <!-- Link Suggestions (shown at bottom if available) -->
                {#if $hasLinkSuggestions}
                    <div class="link-suggestions-section">
                        <div class="link-suggestions-header">
                            <Link2 size={12} />
                            <span>Link Suggestions</span>
                            <span class="section-count">{$linkSuggestions.length}</span>
                        </div>
                        <div class="link-suggestions-content">
                            {#each $linkSuggestions as suggestion (suggestion.line + suggestion.text)}
                                <div class="link-suggestion">
                                    <span class="suggestion-line">Line {suggestion.line}:</span>
                                    <span class="suggestion-text">"{suggestion.text}"</span>
                                    <span class="suggestion-arrow">→</span>
                                    <button
                                        class="suggestion-target"
                                        on:click={() => handleNoteClick(suggestion.targetPath)}
                                    >
                                        [[{suggestion.targetTitle}]]
                                    </button>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}
            </div>
        {/if}

        <!-- Duplicates Tab -->
        {#if $activeExploreTab === 'duplicates'}
            <div class="tab-content">
                {#if $duplicates.length === 0}
                    <div class="empty-state">
                        <CheckSquare size={24} />
                        <span>No potential duplicates found</span>
                    </div>
                {:else}
                    <div class="duplicates-list">
                        {#each $duplicates as dup (dup.path)}
                            <button
                                class="duplicate-item"
                                on:click={() => handleNoteClick(dup.path)}
                            >
                                <FileText size={14} />
                                <span class="dup-title">{dup.title}</span>
                                <span class="dup-score">{formatSimilarity(dup.similarity)}</span>
                            </button>
                        {/each}
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</div>

<style>
    .explore-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        gap: 0;
    }

    /* Compact Header */
    .explore-header {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        background: var(--background-secondary);
        border-bottom: 1px solid var(--background-modifier-border);
    }

    .header-controls {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 8px;
        min-height: 32px;
    }

    .context-info {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--text-muted);
        font-size: var(--font-ui-smaller);
        min-width: 0;
        flex: 1;
    }

    .context-title {
        font-weight: 500;
        color: var(--text-normal);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .header-actions {
        display: flex;
        align-items: center;
        gap: 2px;
        flex-shrink: 0;
    }

    .header-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        padding: 0;
        border: none;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        border-radius: 4px;
        transition: all 0.15s ease;
    }

    .header-btn:hover {
        background: var(--background-modifier-hover);
        color: var(--text-normal);
    }

    .header-btn.active {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
    }

    .header-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    /* Search Drawer with slide animation */
    .search-drawer {
        padding: 0 8px 8px;
    }

    /* Error Message */
    .error-message {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px;
        margin: 8px;
        background: var(--background-modifier-error);
        color: var(--text-error);
        border-radius: 6px;
        font-size: var(--font-ui-smaller);
    }

    /* Tab Bar - Full Width Tabs */
    .tab-bar {
        display: flex;
        align-items: stretch;
        background: var(--background-secondary);
        border-bottom: 1px solid var(--background-modifier-border);
    }

    .tab {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 8px 12px;
        border: none;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        font-size: var(--font-ui-small);
        transition: all 0.15s ease;
        position: relative;
    }

    .tab::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 2px;
        background: transparent;
        transition: background 0.15s ease;
    }

    .tab:hover {
        background: var(--background-modifier-hover);
        color: var(--text-normal);
    }

    .tab.active {
        color: var(--interactive-accent);
        background: var(--background-primary-alt);
    }

    .tab.active::after {
        background: var(--interactive-accent);
    }

    .tab.has-warning .tab-label {
        color: var(--text-warning);
    }

    .tab.active.has-warning {
        color: var(--text-warning);
    }

    .tab.active.has-warning::after {
        background: var(--text-warning);
    }

    .tab :global(.warning-icon) {
        color: var(--text-warning);
        flex-shrink: 0;
    }

    .tab-label {
        font-weight: 500;
    }

    .tab-count {
        font-size: 10px;
        background: var(--background-modifier-border);
        color: var(--text-muted);
        padding: 2px 6px;
        border-radius: 10px;
        min-width: 20px;
        text-align: center;
    }

    .tab.active .tab-count {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
    }

    .tab.active.has-warning .tab-count {
        background: var(--text-warning);
        color: var(--background-primary);
    }

    /* Selection Bar */
    .selection-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        background: var(--background-modifier-active-hover);
        border-bottom: 1px solid var(--background-modifier-border);
        font-size: var(--font-ui-smaller);
    }

    .selection-count {
        color: var(--text-normal);
        font-weight: 500;
    }

    .selection-action {
        padding: 2px 8px;
        border: none;
        background: var(--background-primary);
        color: var(--text-muted);
        cursor: pointer;
        border-radius: 4px;
        font-size: var(--font-ui-smaller);
        transition: all 0.1s ease;
    }

    .selection-action:hover {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
    }

    /* Dismissed Notice */
    .dismissed-notice {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 4px 10px;
        background: var(--background-secondary-alt);
        font-size: var(--font-ui-smaller);
        color: var(--text-muted);
        border-bottom: 1px solid var(--background-modifier-border);
    }

    .restore-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 2px 6px;
        border: none;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        border-radius: 4px;
        font-size: 10px;
        transition: all 0.1s ease;
    }

    .restore-btn:hover {
        background: var(--background-modifier-hover);
        color: var(--text-normal);
    }

    /* Scrollable Content */
    .explore-content {
        flex: 1;
        overflow-y: auto;
    }

    .tab-content {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 8px;
    }

    /* Loading & Empty States */
    .loading-state,
    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 32px 16px;
        color: var(--text-muted);
        font-size: var(--font-ui-smaller);
    }

    /* Results List */
    .results-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    /* Duplicates List */
    .duplicates-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .duplicate-item {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 8px 10px;
        border: none;
        background: var(--background-primary);
        cursor: pointer;
        border-radius: 6px;
        text-align: left;
        transition: background 0.1s ease;
    }

    .duplicate-item:hover {
        background: var(--background-modifier-hover);
    }

    .dup-title {
        flex: 1;
        font-size: var(--font-ui-small);
        color: var(--text-normal);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .dup-score {
        font-size: var(--font-ui-smaller);
        color: var(--text-warning);
        font-weight: 600;
        background: rgba(255, 165, 0, 0.15);
        padding: 2px 6px;
        border-radius: 4px;
    }

    /* Stub Context Section */
    .stub-context-section {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid var(--background-modifier-border);
    }

    .stub-context-header {
        font-size: var(--font-ui-smaller);
        color: var(--text-muted);
        font-weight: 500;
        margin-bottom: 6px;
    }

    .stub-context-content {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .stub-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .stub-type {
        font-size: var(--font-ui-smaller);
        color: var(--text-accent);
        font-weight: 500;
    }

    .stub-desc {
        font-size: var(--font-ui-small);
        color: var(--text-normal);
    }

    .suggested-links {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .suggested-label {
        font-size: var(--font-ui-smaller);
        color: var(--text-muted);
    }

    .suggested-link {
        padding: 4px 8px;
        border: none;
        background: var(--background-modifier-hover);
        color: var(--text-accent);
        cursor: pointer;
        border-radius: 4px;
        text-align: left;
        font-size: var(--font-ui-smaller);
    }

    .suggested-link:hover {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
    }

    /* Link Suggestions Section */
    .link-suggestions-section {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid var(--background-modifier-border);
    }

    .link-suggestions-header {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: var(--font-ui-smaller);
        color: var(--text-muted);
        font-weight: 500;
        margin-bottom: 6px;
    }

    .link-suggestions-content {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .section-count {
        font-size: 10px;
        background: var(--background-modifier-border);
        padding: 1px 5px;
        border-radius: 8px;
    }

    .link-suggestion {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 0;
        font-size: var(--font-ui-smaller);
        flex-wrap: wrap;
    }

    .suggestion-line {
        color: var(--text-faint);
    }

    .suggestion-text {
        color: var(--text-muted);
    }

    .suggestion-arrow {
        color: var(--text-faint);
    }

    .suggestion-target {
        padding: 2px 6px;
        border: none;
        background: var(--background-modifier-hover);
        color: var(--text-accent);
        cursor: pointer;
        border-radius: 4px;
        font-size: var(--font-ui-smaller);
    }

    .suggestion-target:hover {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
    }

    :global(.spinning) {
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
</style>
