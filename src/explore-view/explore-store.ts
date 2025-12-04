/**
 * Explore View Store
 *
 * Reactive state management for the Explore view using Svelte stores.
 * Manages semantic search, related notes, and stub context state.
 */

import { writable, derived, get } from 'svelte/store';
import type {
    RelatedNote,
    DuplicateCandidate,
    LinkSuggestion,
    StubContext,
} from '../smart-connections/types';
import type { ParsedStub } from '../stubs/stubs-types';

// =============================================================================
// VIEW STATE STORES
// =============================================================================

/**
 * Active tab in the Explore view
 */
export type ExploreTab = 'related' | 'duplicates';
export const activeExploreTab = writable<ExploreTab>('related');

/**
 * Whether to use semantic search (embeddings) vs keyword matching
 */
export const useSemanticSearch = writable<boolean>(true);

/**
 * Whether the search field is expanded (visible)
 */
export const isSearchExpanded = writable<boolean>(false);

// =============================================================================
// CORE STORES
// =============================================================================

/**
 * Selected result paths for multi-selection
 */
export const selectedResults = writable<Set<string>>(new Set());

/**
 * Temporarily dismissed result paths (hidden until refresh)
 */
export const dismissedResults = writable<Set<string>>(new Set());

/**
 * Whether multi-select mode is enabled
 */
export const isMultiSelectMode = writable<boolean>(false);

/**
 * Current active note path being explored
 */
export const activeNotePath = writable<string | null>(null);

/**
 * Current note title (for display)
 */
export const activeNoteTitle = writable<string | null>(null);

/**
 * Current search query (empty = show related notes for active note)
 */
export const searchQuery = writable<string>('');

/**
 * Search/related note results
 */
export const results = writable<RelatedNote[]>([]);

/**
 * Loading state
 */
export const isLoading = writable<boolean>(false);

/**
 * Error message if any
 */
export const errorMessage = writable<string | null>(null);

/**
 * Selected stub for context analysis (set from Stubs view)
 */
export const selectedStubForContext = writable<ParsedStub | null>(null);

/**
 * Stub context results
 */
export const stubContext = writable<StubContext | null>(null);

/**
 * Duplicate candidates
 */
export const duplicates = writable<DuplicateCandidate[]>([]);

/**
 * Link suggestions
 */
export const linkSuggestions = writable<LinkSuggestion[]>([]);

/**
 * Last refresh timestamp
 */
export const lastRefresh = writable<number>(0);

// =============================================================================
// SECTION EXPANSION STATE
// =============================================================================

/**
 * Which sections are expanded
 */
export const expandedSections = writable<{
    relatedNotes: boolean;
    stubContext: boolean;
    duplicates: boolean;
    linkSuggestions: boolean;
}>({
    relatedNotes: true,
    stubContext: true,
    duplicates: true,
    linkSuggestions: false,
});

// =============================================================================
// DERIVED STORES
// =============================================================================

/**
 * Whether we're in search mode (query is not empty)
 */
export const isSearchMode = derived(searchQuery, ($query) => $query.trim().length > 0);

/**
 * Results count for display
 */
export const resultsCount = derived(results, ($results) => $results.length);

/**
 * Whether there are any results to show
 */
export const hasResults = derived(results, ($results) => $results.length > 0);

/**
 * Whether there's an active stub context
 */
export const hasStubContext = derived(stubContext, ($ctx) => $ctx !== null);

/**
 * Whether there are duplicate warnings
 */
export const hasDuplicates = derived(duplicates, ($dups) => $dups.length > 0);

/**
 * Whether there are link suggestions
 */
export const hasLinkSuggestions = derived(linkSuggestions, ($suggestions) => $suggestions.length > 0);

/**
 * Visible results (excluding dismissed)
 */
export const visibleResults = derived(
    [results, dismissedResults],
    ([$results, $dismissed]) => $results.filter(r => !$dismissed.has(r.path))
);

/**
 * Selected results count
 */
export const selectedCount = derived(selectedResults, ($selected) => $selected.size);

/**
 * Whether any results are selected
 */
export const hasSelection = derived(selectedResults, ($selected) => $selected.size > 0);

/**
 * Combined state for quick access
 */
export const exploreState = derived(
    [
        activeNotePath,
        activeNoteTitle,
        searchQuery,
        results,
        isLoading,
        errorMessage,
        selectedStubForContext,
        stubContext,
        duplicates,
        linkSuggestions,
        lastRefresh,
    ],
    ([
        $path,
        $title,
        $query,
        $results,
        $loading,
        $error,
        $stub,
        $stubCtx,
        $dups,
        $links,
        $refresh,
    ]) => ({
        activeNotePath: $path,
        activeNoteTitle: $title,
        searchQuery: $query,
        results: $results,
        isLoading: $loading,
        error: $error,
        selectedStubForContext: $stub,
        stubContext: $stubCtx,
        duplicates: $dups,
        linkSuggestions: $links,
        lastRefresh: $refresh,
    }),
);

// =============================================================================
// ACTIONS
// =============================================================================

/**
 * Set the active note being explored
 */
export function setActiveNote(path: string | null, title?: string): void {
    activeNotePath.set(path);
    activeNoteTitle.set(title ?? path?.split('/').pop()?.replace('.md', '') ?? null);
}

/**
 * Set search query
 */
export function setSearchQuery(query: string): void {
    searchQuery.set(query);
}

/**
 * Clear search query (return to related notes mode)
 */
export function clearSearch(): void {
    searchQuery.set('');
}

/**
 * Set results
 */
export function setResults(newResults: RelatedNote[]): void {
    results.set(newResults);
    lastRefresh.set(Date.now());
}

/**
 * Set loading state
 */
export function setLoading(loading: boolean): void {
    isLoading.set(loading);
}

/**
 * Set error
 */
export function setError(error: string | null): void {
    errorMessage.set(error);
}

/**
 * Clear error
 */
export function clearError(): void {
    errorMessage.set(null);
}

/**
 * Set stub for context analysis
 */
export function setStubForContext(stub: ParsedStub | null): void {
    selectedStubForContext.set(stub);
}

/**
 * Set stub context results
 */
export function setStubContext(context: StubContext | null): void {
    stubContext.set(context);
}

/**
 * Set duplicates
 */
export function setDuplicates(dups: DuplicateCandidate[]): void {
    duplicates.set(dups);
}

/**
 * Set link suggestions
 */
export function setLinkSuggestions(suggestions: LinkSuggestion[]): void {
    linkSuggestions.set(suggestions);
}

/**
 * Toggle section expansion
 */
export function toggleSection(
    section: 'relatedNotes' | 'stubContext' | 'duplicates' | 'linkSuggestions',
): void {
    expandedSections.update((current) => ({
        ...current,
        [section]: !current[section],
    }));
}

/**
 * Expand a section
 */
export function expandSection(
    section: 'relatedNotes' | 'stubContext' | 'duplicates' | 'linkSuggestions',
): void {
    expandedSections.update((current) => ({
        ...current,
        [section]: true,
    }));
}

/**
 * Collapse a section
 */
export function collapseSection(
    section: 'relatedNotes' | 'stubContext' | 'duplicates' | 'linkSuggestions',
): void {
    expandedSections.update((current) => ({
        ...current,
        [section]: false,
    }));
}

/**
 * Reset all state (on view close or note change)
 */
export function resetExploreState(): void {
    searchQuery.set('');
    results.set([]);
    isLoading.set(false);
    errorMessage.set(null);
    selectedStubForContext.set(null);
    stubContext.set(null);
    duplicates.set([]);
    linkSuggestions.set([]);
    lastRefresh.set(0);
}

/**
 * Clear results only (keep other state)
 */
export function clearResults(): void {
    results.set([]);
    duplicates.set([]);
    linkSuggestions.set([]);
}

// =============================================================================
// SELECTION & DISMISSAL ACTIONS
// =============================================================================

/**
 * Toggle selection of a result
 */
export function toggleResultSelection(path: string): void {
    selectedResults.update(current => {
        const newSet = new Set(current);
        if (newSet.has(path)) {
            newSet.delete(path);
        } else {
            newSet.add(path);
        }
        return newSet;
    });
}

/**
 * Select a result
 */
export function selectResult(path: string): void {
    selectedResults.update(current => {
        const newSet = new Set(current);
        newSet.add(path);
        return newSet;
    });
}

/**
 * Deselect a result
 */
export function deselectResult(path: string): void {
    selectedResults.update(current => {
        const newSet = new Set(current);
        newSet.delete(path);
        return newSet;
    });
}

/**
 * Clear all selections
 */
export function clearSelection(): void {
    selectedResults.set(new Set());
}

/**
 * Select all visible results
 */
export function selectAllVisible(): void {
    const visible = get(visibleResults);
    selectedResults.set(new Set(visible.map(r => r.path)));
}

/**
 * Dismiss a result temporarily
 */
export function dismissResult(path: string): void {
    dismissedResults.update(current => {
        const newSet = new Set(current);
        newSet.add(path);
        return newSet;
    });
    // Also remove from selection
    deselectResult(path);
}

/**
 * Restore a dismissed result
 */
export function restoreDismissedResult(path: string): void {
    dismissedResults.update(current => {
        const newSet = new Set(current);
        newSet.delete(path);
        return newSet;
    });
}

/**
 * Clear all dismissed results
 */
export function clearDismissed(): void {
    dismissedResults.set(new Set());
}

/**
 * Toggle multi-select mode
 */
export function toggleMultiSelectMode(): void {
    isMultiSelectMode.update(current => !current);
    if (!get(isMultiSelectMode)) {
        clearSelection();
    }
}

/**
 * Enable multi-select mode
 */
export function enableMultiSelect(): void {
    isMultiSelectMode.set(true);
}

/**
 * Disable multi-select mode
 */
export function disableMultiSelect(): void {
    isMultiSelectMode.set(false);
    clearSelection();
}

/**
 * Get selected result objects
 */
export function getSelectedResults(): RelatedNote[] {
    const selected = get(selectedResults);
    const allResults = get(results);
    return allResults.filter(r => selected.has(r.path));
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get current active note path
 */
export function getActiveNotePath(): string | null {
    return get(activeNotePath);
}

/**
 * Get current search query
 */
export function getSearchQuery(): string {
    return get(searchQuery);
}

/**
 * Check if currently loading
 */
export function isCurrentlyLoading(): boolean {
    return get(isLoading);
}

// =============================================================================
// TAB & SEARCH MODE ACTIONS
// =============================================================================

/**
 * Set the active explore tab
 */
export function setActiveTab(tab: ExploreTab): void {
    activeExploreTab.set(tab);
}

/**
 * Toggle semantic search mode
 */
export function toggleSemanticSearch(): void {
    useSemanticSearch.update(current => !current);
}

/**
 * Enable semantic search
 */
export function enableSemanticSearch(): void {
    useSemanticSearch.set(true);
}

/**
 * Disable semantic search (use keyword matching)
 */
export function disableSemanticSearch(): void {
    useSemanticSearch.set(false);
}

/**
 * Get current semantic search mode
 */
export function isSemanticSearchEnabled(): boolean {
    return get(useSemanticSearch);
}

/**
 * Toggle search field expansion
 */
export function toggleSearchExpanded(): void {
    isSearchExpanded.update(current => !current);
}

/**
 * Expand the search field
 */
export function expandSearch(): void {
    isSearchExpanded.set(true);
}

/**
 * Collapse the search field
 */
export function collapseSearch(): void {
    isSearchExpanded.set(false);
    searchQuery.set('');
}
