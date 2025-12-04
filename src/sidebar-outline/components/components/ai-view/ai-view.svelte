<script lang="ts">
    import { Notice } from 'obsidian';
    import { onMount, onDestroy } from 'svelte';
    import { writable } from 'svelte/store';
    import { Check, X, AlertCircle, ChevronDown, ChevronUp, ChevronRight, Sparkles, Link, ExternalLink, BookOpen, Brain, Loader2, Wand2 } from 'lucide-svelte';
    import { llmAnalysisState, clearSuggestions, removeSuggestion, removeReference, setActiveTab, toggleStreamingExpanded, triggerLLMAnalysis, clearRemediateMode } from '../../../../stubs/llm-analysis-store';
    import { stubsConfig } from '../../../../stubs/stubs-store';
    import { generateAnchorId, insertAnchorAtLine, getValidAnchors } from '../../../../stubs/helpers/anchor-utils';
    import type LabeledAnnotations from '../../../../main';
    import type { SuggestedStub, FoundReference, LLMConfiguration } from '../../../../llm/llm-types';
    import { getActionLogService, createAcceptSuggestionEntry, createRejectSuggestionEntry } from '../../../../services/action-log-service';

    export let plugin: LabeledAnnotations;

    // Local state
    let expandedSuggestions: Set<number> = new Set();
    let expandedReferences: Set<number> = new Set();
    let streamingScrollRef: HTMLDivElement | null = null;

    // Settings subscription
    const llmSettingsStore = writable<LLMConfiguration | null>(null);
    let unsubscribe: (() => void) | null = null;

    onMount(() => {
        unsubscribe = plugin.settings.subscribe((settings) => {
            llmSettingsStore.set(settings.llm);
        });
    });

    onDestroy(() => {
        if (unsubscribe) unsubscribe();
    });

    $: llmSettings = $llmSettingsStore;
    $: isLLMConfigured = llmSettings?.enabled && llmSettings?.apiKey;
    $: insertionOrder = llmSettings?.insertionOrder || 'bottom';
    $: separateReferenceProperties = llmSettings?.separateReferenceProperties || false;
    $: vaultReferenceProperty = llmSettings?.vaultReferenceProperty || 'references';
    $: webReferenceProperty = llmSettings?.webReferenceProperty || 'references';
    $: config = $stubsConfig;
    $: state = $llmAnalysisState;
    $: isAnalyzing = state.isAnalyzing;
    $: streamingText = state.streamingText;
    $: streamingExpanded = state.streamingExpanded;
    $: suggestions = state.suggestions;
    $: references = state.references;
    $: activeTab = state.activeTab;
    $: hasSuggestions = suggestions.length > 0;
    $: hasReferences = references.length > 0;
    $: hasContent = hasSuggestions || hasReferences;
    $: hasError = state.error !== null;
    $: remediateMode = state.remediateMode;
    $: remediateStub = state.remediateStub;

    // Track previous remediate mode to detect transitions
    let previousRemediateMode = false;

    // Auto-trigger analysis when entering remediate mode
    $: if (remediateMode && !previousRemediateMode && !isAnalyzing && isLLMConfigured) {
        console.log('[Doc Doctor] Remediate mode activated, auto-triggering analysis for stub:', remediateStub);
        previousRemediateMode = true;
        // Trigger analysis - the triggerLLMAnalysis function will check for remediateStub
        triggerLLMAnalysis(plugin);
    } else if (!remediateMode && previousRemediateMode) {
        previousRemediateMode = false;
    }

    // Debug log state transitions
    $: console.log('[Doc Doctor] AIView state:', {
        hasSuggestions,
        hasReferences,
        hasContent,
        hasError,
        isAnalyzing,
        suggestionsCount: suggestions.length,
        referencesCount: references.length
    });

    // Auto-scroll streaming text only during active analysis
    $: if (isAnalyzing && streamingText && streamingScrollRef) {
        requestAnimationFrame(() => {
            if (streamingScrollRef) {
                streamingScrollRef.scrollTop = streamingScrollRef.scrollHeight;
            }
        });
    }

    // Clear expanded states when suggestions/references change
    // Using simple reactive - just clear when accepting
    function clearExpandedStates() {
        expandedSuggestions = new Set();
        expandedReferences = new Set();
    }

    function getStubTypeInfo(typeKey: string) {
        if (!config) return { displayName: typeKey, color: '#888' };
        const type = Object.values(config.stubTypes).find(t => t.key === typeKey);
        return type || { displayName: typeKey, color: '#888' };
    }

    function getReferenceIcon(type: FoundReference['type']) {
        switch (type) {
            case 'vault': return Link;
            case 'web': return ExternalLink;
            case 'citation': return BookOpen;
            default: return Link;
        }
    }

    function getReferenceProperty(refType: FoundReference['type']): string {
        if (!separateReferenceProperties) {
            return vaultReferenceProperty;
        }
        return refType === 'web' ? webReferenceProperty : vaultReferenceProperty;
    }

    function toggleSuggestionExpanded(index: number) {
        if (expandedSuggestions.has(index)) {
            expandedSuggestions.delete(index);
        } else {
            expandedSuggestions.add(index);
        }
        expandedSuggestions = expandedSuggestions;
    }

    function toggleReferenceExpanded(index: number) {
        if (expandedReferences.has(index)) {
            expandedReferences.delete(index);
        } else {
            expandedReferences.add(index);
        }
        expandedReferences = expandedReferences;
    }

    let isProcessing = false;

    async function acceptSuggestion(suggestion: SuggestedStub, index: number) {
        console.log('[Doc Doctor] acceptSuggestion START', { index, isProcessing });
        if (isProcessing) {
            console.log('[Doc Doctor] acceptSuggestion BLOCKED - already processing');
            return;
        }
        isProcessing = true;

        const activeFile = plugin.app.workspace.getActiveFile();
        if (!activeFile || !config) {
            console.log('[Doc Doctor] acceptSuggestion ABORT - no file or config');
            isProcessing = false;
            return;
        }

        try {
            console.log('[Doc Doctor] Reading file...');
            let content = await plugin.app.vault.read(activeFile);
            console.log('[Doc Doctor] File read, generating anchor...');

            const existingAnchors = getValidAnchors(content, config.anchors);
            const existingAnchorIds = new Set(existingAnchors.map(a => a.id));
            const anchorId = generateAnchorId(config.anchors, suggestion.type, existingAnchorIds);
            console.log('[Doc Doctor] Anchor generated:', anchorId);

            // Calculate frontmatter offset
            const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n/);
            const frontmatterLineCount = frontmatterMatch
                ? frontmatterMatch[0].split('\n').length - 1
                : 0;

            // Insert anchor at the specified line (adjusted for frontmatter)
            if (suggestion.location.lineNumber > 0) {
                const adjustedLine = suggestion.location.lineNumber - 1 + frontmatterLineCount;
                console.log('[Doc Doctor] Inserting anchor at line:', adjustedLine);
                content = insertAnchorAtLine(content, adjustedLine, anchorId);
            }

            // Always use manual YAML insertion to preserve existing formatting
            // (MCP addStub reformats the entire stubs array which is undesirable)
            console.log('[Doc Doctor] Building stub entry...');
            const stubEntry = buildStubYamlEntry(suggestion, anchorId);
            const newContent = insertYamlArrayItem(content, 'stubs', stubEntry);

            console.log('[Doc Doctor] Writing file...');
            await plugin.app.vault.modify(activeFile, newContent);
            console.log('[Doc Doctor] File written, removing suggestion...');

            // Remove from suggestions list immediately
            removeSuggestion(index);
            clearExpandedStates();
            console.log('[Doc Doctor] Suggestion removed, showing notice...');
            new Notice(`Stub added: ${suggestion.description.slice(0, 50)}...`);

            // Log the accepted suggestion
            const logService = getActionLogService(plugin.app);
            await logService.log(createAcceptSuggestionEntry(
                activeFile.path,
                suggestion.type,
                suggestion.description,
                undefined, // before state
                stubEntry  // after state
            ));

            // Sync stubs after a short delay
            console.log('[Doc Doctor] Scheduling sync...');
            setTimeout(() => {
                console.log('[Doc Doctor] Running debounced sync...');
                plugin.debouncedSyncStubsForActiveFile();
            }, 100);
            console.log('[Doc Doctor] acceptSuggestion SUCCESS');
        } catch (error) {
            console.error('[Doc Doctor] Failed to accept suggestion:', error);
            new Notice('Failed to add stub');
        } finally {
            console.log('[Doc Doctor] acceptSuggestion FINALLY - resetting isProcessing');
            isProcessing = false;
        }
    }

    async function acceptReference(reference: FoundReference, index: number) {
        if (isProcessing) return;
        isProcessing = true;

        const activeFile = plugin.app.workspace.getActiveFile();
        if (!activeFile) {
            isProcessing = false;
            return;
        }

        const propertyName = getReferenceProperty(reference.type);

        try {
            const content = await plugin.app.vault.read(activeFile);
            let newContent: string;

            // Try MCP first if connected
            const mcpTools = plugin.getMCPTools();
            if (mcpTools && plugin.isMCPConnected()) {
                console.log('[Doc Doctor] Using MCP to add reference...');
                try {
                    const result = await mcpTools.addReference(content, reference.target);
                    newContent = result.updated_content;
                    console.log('[Doc Doctor] MCP addReference success');
                } catch (mcpError) {
                    console.warn('[Doc Doctor] MCP addReference failed, falling back to manual:', mcpError);
                    const refEntry = buildReferenceYamlEntry(reference);
                    newContent = insertYamlArrayItem(content, propertyName, refEntry);
                }
            } else {
                const refEntry = buildReferenceYamlEntry(reference);
                newContent = insertYamlArrayItem(content, propertyName, refEntry);
            }

            await plugin.app.vault.modify(activeFile, newContent);

            // Remove from references list immediately
            removeReference(index);
            clearExpandedStates();
            new Notice(`Reference added to ${propertyName}`);
        } catch (error) {
            console.error('[Doc Doctor] Failed to accept reference:', error);
            new Notice('Failed to add reference');
        } finally {
            isProcessing = false;
        }
    }

    function insertYamlArrayItem(content: string, propertyName: string, entry: string): string {
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

        if (frontmatterMatch) {
            const frontmatterContent = frontmatterMatch[1];
            const propRegex = new RegExp(`^${propertyName}:`, 'm');

            if (propRegex.test(frontmatterContent)) {
                const emptyPropertyRegex = new RegExp(`^(${propertyName}:)[ \\t]*$`, 'm');
                const inlineEmptyArrayRegex = new RegExp(`^(${propertyName}:)[ \\t]*\\[\\][ \\t]*$`, 'm');
                // Match array with items (no leading indent for items)
                const hasArrayRegex = new RegExp(`^${propertyName}:\\n(- )`, 'm');

                if (inlineEmptyArrayRegex.test(frontmatterContent)) {
                    return content.replace(
                        new RegExp(`^${propertyName}:[ \\t]*\\[\\][ \\t]*$`, 'm'),
                        `${propertyName}:\n${entry}`
                    );
                } else if (emptyPropertyRegex.test(frontmatterContent)) {
                    return content.replace(emptyPropertyRegex, `$1\n${entry}`);
                } else if (hasArrayRegex.test(frontmatterContent)) {
                    // Match the entire array block (items start with - at beginning of line or with indent)
                    const arrayRegex = new RegExp(
                        `(^${propertyName}:\\n(?:- [^\\n]*\\n?|  [^\\n]*\\n?)*)`,
                        'm'
                    );
                    const match = frontmatterContent.match(arrayRegex);
                    if (match) {
                        const existingBlock = match[1].trimEnd();
                        let updatedBlock: string;
                        if (insertionOrder === 'top') {
                            // Insert at top: property + new entry + existing items
                            const existingItems = existingBlock.replace(new RegExp(`^${propertyName}:\\n`), '');
                            updatedBlock = `${propertyName}:\n${entry}\n${existingItems}`;
                        } else {
                            // Insert at bottom: existing block + new entry
                            updatedBlock = `${existingBlock}\n${entry}`;
                        }
                        return content.replace(match[1], updatedBlock);
                    }
                }
                // Property exists but no array items yet
                return content.replace(
                    new RegExp(`^(${propertyName}:[^\\n]*)`, 'm'),
                    `$1\n${entry}`
                );
            } else {
                // Property doesn't exist, add before closing ---
                return content.replace(
                    /\n---/,
                    `\n${propertyName}:\n${entry}\n---`
                );
            }
        } else {
            // No frontmatter, create it
            return `---\n${propertyName}:\n${entry}\n---\n\n${content}`;
        }
    }

    function buildStubYamlEntry(suggestion: SuggestedStub, anchorId?: string): string {
        const hasExtraProperties = suggestion.stub_form !== 'transient' || suggestion.priority;
        const useStructuredFormat = anchorId || hasExtraProperties;

        if (useStructuredFormat) {
            const lines: string[] = [];
            lines.push(`- ${suggestion.type}:`);
            lines.push(`    description: "${escapeYamlString(suggestion.description)}"`);
            if (anchorId) {
                lines.push(`    anchor: ${anchorId}`);
            }
            if (suggestion.stub_form && suggestion.stub_form !== 'transient') {
                lines.push(`    stub_form: ${suggestion.stub_form}`);
            }
            if (suggestion.priority) {
                lines.push(`    priority: ${suggestion.priority}`);
            }
            return lines.join('\n');
        } else {
            return `- ${suggestion.type}: "${escapeYamlString(suggestion.description)}"`;
        }
    }

    function buildReferenceYamlEntry(reference: FoundReference): string {
        return `- "${escapeYamlString(reference.target)}"`;
    }

    function escapeYamlString(str: string): string {
        return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
    }

    async function rejectSuggestion(index: number) {
        const suggestion = suggestions[index];
        const activeFile = plugin.app.workspace.getActiveFile();

        removeSuggestion(index);

        // Log the rejected suggestion
        if (activeFile && suggestion) {
            const logService = getActionLogService(plugin.app);
            await logService.log(createRejectSuggestionEntry(
                activeFile.path,
                suggestion.type,
                suggestion.description
            ));
        }
    }

    function rejectReference(index: number) {
        removeReference(index);
    }

    function handleClearAll() {
        clearSuggestions();
    }

    async function handleAcceptAllSuggestions() {
        const allSuggestions = [...suggestions];
        if (insertionOrder === 'top') {
            for (let i = allSuggestions.length - 1; i >= 0; i--) {
                await acceptSuggestion(allSuggestions[i], i);
            }
        } else {
            for (let i = 0; i < allSuggestions.length; i++) {
                await acceptSuggestion(allSuggestions[i], 0);
            }
        }
    }

    async function handleAcceptAllReferences() {
        const allRefs = [...references];
        for (let i = 0; i < allRefs.length; i++) {
            await acceptReference(allRefs[i], 0);
        }
    }

    function switchToSuggestions() {
        setActiveTab('suggestions');
    }

    function switchToReferences() {
        setActiveTab('references');
    }

    const handleMagicWand = () => {
        if (!isLLMConfigured) {
            plugin.app.setting.open();
            plugin.app.setting.openTabById('doc-doctor');
            return;
        }
        triggerLLMAnalysis(plugin);
    };
</script>

<div class="ai-view">
    {#if !hasContent && !isAnalyzing && !hasError}
        <!-- Empty state -->
        <div class="empty-state">
            <div class="empty-icon">
                <Sparkles size={32} />
            </div>
            <p class="empty-title">AI Analysis</p>
            <p class="empty-hint">
                {#if isLLMConfigured}
                    Click the magic wand to analyze this document for stub suggestions
                {:else}
                    Configure your LLM settings to enable AI-powered analysis
                {/if}
            </p>
            <button
                class="cta-btn"
                on:click={handleMagicWand}
                disabled={isAnalyzing}
            >
                {#if isLLMConfigured}
                    <Wand2 size={16} />
                    Analyze Document
                {:else}
                    Configure LLM
                {/if}
            </button>
        </div>
    {:else}
        <!-- Analysis content -->
        <div class="ai-content">
            <!-- Analysis drawer -->
            {#if isAnalyzing || streamingText}
                <button
                    class="drawer-toggle"
                    class:expanded={streamingExpanded}
                    class:live={isAnalyzing}
                    on:click={toggleStreamingExpanded}
                >
                    <span class="drawer-toggle-left">
                        {#if isAnalyzing}
                            <Loader2 size={14} class="spin" />
                        {:else}
                            <Brain size={14} />
                        {/if}
                        {#if !streamingExpanded}
                            <span class="streaming-preview">{streamingText?.slice(-50) || 'Processing...'}</span>
                        {/if}
                    </span>
                    <span class="drawer-toggle-icon">
                        {#if streamingExpanded}
                            <ChevronUp size={14} />
                        {:else}
                            <ChevronDown size={14} />
                        {/if}
                    </span>
                </button>
            {/if}

            {#if streamingExpanded && streamingText}
                <div class="drawer-content" bind:this={streamingScrollRef}>
                    <div class="drawer-header">
                        <Brain size={12} />
                        <span>Analysis Stream</span>
                        {#if isAnalyzing}
                            <span class="live-indicator">Live</span>
                        {/if}
                    </div>
                    <pre class="drawer-text">{streamingText}</pre>
                </div>
            {/if}

            {#if state.summary}
                <div class="analysis-summary">
                    {state.summary}
                </div>
            {/if}

            {#if hasError}
                <div class="error-message">
                    <AlertCircle size={14} />
                    <span>{state.error?.message}</span>
                    {#if state.error?.suggestedAction}
                        <div class="error-action">{state.error.suggestedAction}</div>
                    {/if}
                </div>
            {/if}

            {#if hasContent}
                <!-- Tabs -->
                <div class="tabs">
                    <button
                        class="tab"
                        class:active={activeTab === 'suggestions'}
                        on:click={switchToSuggestions}
                    >
                        Stubs
                        {#if hasSuggestions}
                            <span class="tab-badge">{suggestions.length}</span>
                        {/if}
                    </button>
                    <button
                        class="tab"
                        class:active={activeTab === 'references'}
                        on:click={switchToReferences}
                    >
                        References
                        {#if hasReferences}
                            <span class="tab-badge">{references.length}</span>
                        {/if}
                    </button>
                </div>

                <!-- Suggestions tab -->
                {#if activeTab === 'suggestions'}
                    {#if hasSuggestions}
                        <div class="tab-actions">
                            <button
                                class="action-btn accept-all"
                                on:click={handleAcceptAllSuggestions}
                                title="Accept all stubs"
                            >
                                <Check size={12} />
                                Accept All
                            </button>
                        </div>
                        <div class="items-list">
                            {#each suggestions as suggestion, index}
                                {@const typeInfo = getStubTypeInfo(suggestion.type)}
                                {@const isExpanded = expandedSuggestions.has(index)}
                                <div class="item">
                                    <div class="item-main">
                                        <button
                                            class="expand-btn"
                                            on:click={() => toggleSuggestionExpanded(index)}
                                        >
                                            {#if isExpanded}
                                                <ChevronDown size={12} />
                                            {:else}
                                                <ChevronRight size={12} />
                                            {/if}
                                        </button>
                                        <span
                                            class="type-indicator"
                                            style="background-color: {typeInfo.color}"
                                            title={typeInfo.displayName}
                                        ></span>
                                        <div class="item-content">
                                            <span class="item-description">
                                                {suggestion.description}
                                            </span>
                                            {#if suggestion.reasoning}
                                                <div class="item-reasoning">
                                                    {suggestion.reasoning}
                                                </div>
                                            {/if}
                                        </div>
                                        <div class="item-actions">
                                            <button
                                                class="action-btn accept"
                                                on:click={() => acceptSuggestion(suggestion, index)}
                                                title="Accept"
                                            >
                                                <Check size={12} />
                                            </button>
                                            <button
                                                class="action-btn reject"
                                                on:click={() => rejectSuggestion(index)}
                                                title="Reject"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    </div>

                                    {#if isExpanded}
                                        <div class="item-details">
                                            <div class="detail-row">
                                                <span class="detail-label">Type:</span>
                                                <span class="detail-value">{typeInfo.displayName}</span>
                                            </div>
                                            {#if suggestion.stub_form}
                                                <div class="detail-row">
                                                    <span class="detail-label">Form:</span>
                                                    <span class="detail-value">{suggestion.stub_form}</span>
                                                </div>
                                            {/if}
                                            {#if suggestion.priority}
                                                <div class="detail-row">
                                                    <span class="detail-label">Priority:</span>
                                                    <span class="detail-value">{suggestion.priority}</span>
                                                </div>
                                            {/if}
                                            {#if suggestion.location?.section}
                                                <div class="detail-row">
                                                    <span class="detail-label">Section:</span>
                                                    <span class="detail-value">{suggestion.location.section}</span>
                                                </div>
                                            {/if}
                                            {#if suggestion.location?.lineNumber}
                                                <div class="detail-row">
                                                    <span class="detail-label">Line:</span>
                                                    <span class="detail-value line-number">{suggestion.location.lineNumber}</span>
                                                </div>
                                            {/if}
                                            {#if suggestion.rationale}
                                                <div class="detail-row rationale">
                                                    <span class="detail-label">Rationale:</span>
                                                    <span class="detail-value">{suggestion.rationale}</span>
                                                </div>
                                            {/if}
                                        </div>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <div class="empty-tab">No stub suggestions</div>
                    {/if}
                {/if}

                <!-- References tab -->
                {#if activeTab === 'references'}
                    {#if hasReferences}
                        <div class="tab-actions">
                            {#if separateReferenceProperties}
                                <span class="property-hint">vault → {vaultReferenceProperty}: | web → {webReferenceProperty}:</span>
                            {:else}
                                <span class="property-hint">→ {vaultReferenceProperty}:</span>
                            {/if}
                            <button
                                class="action-btn accept-all"
                                on:click={handleAcceptAllReferences}
                                title="Accept all references"
                            >
                                <Check size={12} />
                                Accept All
                            </button>
                        </div>
                        <div class="items-list">
                            {#each references as reference, index}
                                {@const RefIcon = getReferenceIcon(reference.type)}
                                {@const isExpanded = expandedReferences.has(index)}
                                <div class="item">
                                    <div class="item-main">
                                        <button
                                            class="expand-btn"
                                            on:click={() => toggleReferenceExpanded(index)}
                                        >
                                            {#if isExpanded}
                                                <ChevronDown size={12} />
                                            {:else}
                                                <ChevronRight size={12} />
                                            {/if}
                                        </button>
                                        <span class="ref-icon" title={reference.type}>
                                            <svelte:component this={RefIcon} size={12} />
                                        </span>
                                        <span class="item-description">
                                            {reference.title}
                                        </span>
                                        <div class="item-actions">
                                            <button
                                                class="action-btn accept"
                                                on:click={() => acceptReference(reference, index)}
                                                title="Accept"
                                            >
                                                <Check size={12} />
                                            </button>
                                            <button
                                                class="action-btn reject"
                                                on:click={() => rejectReference(index)}
                                                title="Reject"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    </div>

                                    {#if isExpanded}
                                        <div class="item-details">
                                            <div class="detail-row">
                                                <span class="detail-label">Type:</span>
                                                <span class="detail-value">{reference.type}</span>
                                            </div>
                                            <div class="detail-row">
                                                <span class="detail-label">Target:</span>
                                                <span class="detail-value target">{reference.target}</span>
                                            </div>
                                            {#if reference.section}
                                                <div class="detail-row">
                                                    <span class="detail-label">Section:</span>
                                                    <span class="detail-value">{reference.section}</span>
                                                </div>
                                            {/if}
                                            {#if reference.context}
                                                <div class="detail-row rationale">
                                                    <span class="detail-label">Context:</span>
                                                    <span class="detail-value">{reference.context}</span>
                                                </div>
                                            {/if}
                                        </div>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <div class="empty-tab">No references found</div>
                    {/if}
                {/if}
            {/if}

            {#if state.confidence > 0}
                <div class="confidence-bar">
                    <span class="confidence-label">Confidence:</span>
                    <div class="confidence-track">
                        <div
                            class="confidence-fill"
                            style="width: {state.confidence * 100}%"
                        ></div>
                    </div>
                    <span class="confidence-value">{Math.round(state.confidence * 100)}%</span>
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
    .ai-view {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    /* Empty state */
    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 20px;
        text-align: center;
        color: var(--text-muted);
        flex: 1;
    }

    .empty-icon {
        opacity: 0.5;
        margin-bottom: 12px;
        color: var(--color-purple);
    }

    .empty-title {
        margin: 0;
        font-size: var(--font-ui-medium);
        font-weight: 500;
        color: var(--text-normal);
    }

    .empty-hint {
        margin: 8px 0 16px;
        font-size: var(--font-ui-small);
        opacity: 0.7;
        max-width: 200px;
    }

    .cta-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        border: none;
        background: var(--color-purple);
        color: white;
        font-size: var(--font-ui-small);
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.15s ease;
    }

    .cta-btn:hover {
        filter: brightness(1.1);
    }

    .cta-btn:disabled {
        opacity: 0.5;
        cursor: default;
    }

    /* Content area */
    .ai-content {
        display: flex;
        flex-direction: column;
        flex: 1;
        overflow: hidden;
    }

    /* Analysis drawer */
    .drawer-toggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        border: none;
        background: var(--background-secondary-alt);
        border-bottom: 1px solid var(--background-modifier-border);
        color: var(--text-muted);
        cursor: pointer;
        width: 100%;
        flex-shrink: 0;
        transition: background 0.15s ease;
    }

    .drawer-toggle:hover {
        background: var(--background-modifier-hover);
    }

    .drawer-toggle.live {
        border-left: 3px solid var(--color-purple);
        padding-left: 9px;
    }

    .drawer-toggle-left {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
        min-width: 0;
    }

    .drawer-toggle-icon {
        display: flex;
        align-items: center;
        color: var(--text-faint);
        transition: transform 0.2s ease;
    }

    .drawer-toggle.expanded .drawer-toggle-icon {
        transform: rotate(180deg);
    }

    .streaming-preview {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 11px;
        font-family: var(--font-monospace);
        color: var(--text-faint);
    }

    .drawer-content {
        max-height: 180px;
        overflow-y: auto;
        padding: 10px 12px;
        background: rgba(0, 0, 0, 0.15);
        border-bottom: 1px solid var(--background-modifier-border);
        flex-shrink: 0;
    }

    .drawer-header {
        display: flex;
        align-items: center;
        gap: 6px;
        padding-bottom: 8px;
        margin-bottom: 8px;
        border-bottom: 1px solid var(--background-modifier-border);
        color: var(--text-muted);
        font-size: var(--font-ui-smaller);
    }

    .drawer-text {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: var(--font-monospace);
        font-size: 11px;
        color: var(--text-muted);
        line-height: 1.5;
    }

    .live-indicator {
        margin-left: auto;
        padding: 2px 8px;
        background: var(--color-purple);
        color: white;
        border-radius: 10px;
        font-size: 10px;
        font-weight: 500;
        animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
    }

    :global(.spin) {
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }

    /* Summary and error */
    .analysis-summary {
        padding: 8px 10px;
        font-size: var(--font-ui-smaller);
        color: var(--text-muted);
        border-bottom: 1px solid var(--background-modifier-border);
        flex-shrink: 0;
    }

    .error-message {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 10px;
        background: rgba(200, 0, 0, 0.1);
        color: var(--text-error);
        font-size: var(--font-ui-smaller);
        flex-shrink: 0;
    }

    .error-action {
        color: var(--text-muted);
        font-style: italic;
    }

    /* Tabs */
    .tabs {
        display: flex;
        border-bottom: 1px solid var(--background-modifier-border);
        flex-shrink: 0;
    }

    .tab {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 8px;
        border: none;
        background: transparent;
        color: var(--text-muted);
        font-size: var(--font-ui-smaller);
        cursor: pointer;
        border-bottom: 2px solid transparent;
    }

    .tab:hover {
        background: var(--background-modifier-hover);
    }

    .tab.active {
        color: var(--text-normal);
        border-bottom-color: var(--interactive-accent);
    }

    .tab-badge {
        background: var(--color-purple);
        color: white;
        padding: 0 5px;
        border-radius: 8px;
        font-size: 10px;
    }

    .tab-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        padding: 6px 10px;
        border-bottom: 1px solid var(--background-modifier-border);
        flex-shrink: 0;
    }

    .property-hint {
        font-size: var(--font-ui-smaller);
        color: var(--text-faint);
        font-style: italic;
    }

    .empty-tab {
        padding: 16px;
        text-align: center;
        color: var(--text-faint);
        font-size: var(--font-ui-smaller);
    }

    /* Action buttons */
    .action-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 3px 6px;
        border: none;
        background: transparent;
        color: var(--text-muted);
        font-size: var(--font-ui-smaller);
        cursor: pointer;
        border-radius: 4px;
    }

    .action-btn:hover {
        background: var(--background-modifier-hover);
        color: var(--text-normal);
    }

    .action-btn.accept-all {
        background: var(--interactive-success);
        color: white;
    }

    .action-btn.accept-all:hover {
        filter: brightness(1.1);
    }

    .action-btn.accept {
        color: var(--color-green);
    }

    .action-btn.accept:hover {
        background: rgba(0, 200, 0, 0.15);
    }

    .action-btn.reject {
        color: var(--color-red);
    }

    .action-btn.reject:hover {
        background: rgba(200, 0, 0, 0.15);
    }

    /* Items list */
    .items-list {
        flex: 1;
        overflow-y: auto;
        min-height: 0;
    }

    .item {
        border-bottom: 1px solid var(--background-modifier-border);
    }

    .item:last-child {
        border-bottom: none;
    }

    .item-main {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        padding: 8px 10px;
    }

    .expand-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2px;
        border: none;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        flex-shrink: 0;
    }

    .expand-btn:hover {
        color: var(--text-normal);
    }

    .type-indicator {
        width: 8px;
        height: 8px;
        border-radius: 2px;
        flex-shrink: 0;
        margin-top: 4px;
    }

    .ref-icon {
        display: flex;
        align-items: center;
        color: var(--text-muted);
        margin-top: 2px;
    }

    .item-content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .item-description {
        font-size: var(--font-ui-smaller);
        color: var(--text-normal);
        word-break: break-word;
    }

    .item-reasoning {
        font-size: 11px;
        color: var(--text-muted);
        font-style: italic;
        line-height: 1.4;
        padding-left: 8px;
        border-left: 2px solid var(--color-purple);
        opacity: 0.85;
    }

    .item-actions {
        display: flex;
        gap: 2px;
        flex-shrink: 0;
    }

    .item-details {
        padding: 6px 10px 10px 28px;
        background: var(--background-primary);
    }

    .detail-row {
        display: flex;
        gap: 8px;
        font-size: var(--font-ui-smaller);
        margin-bottom: 4px;
    }

    .detail-row.rationale {
        flex-direction: column;
        gap: 2px;
    }

    .detail-label {
        color: var(--text-muted);
        flex-shrink: 0;
    }

    .detail-value {
        color: var(--text-normal);
    }

    .detail-value.target {
        font-family: var(--font-monospace);
        font-size: 11px;
        word-break: break-all;
    }

    .detail-value.line-number {
        font-family: var(--font-monospace);
        background: var(--background-modifier-hover);
        padding: 1px 6px;
        border-radius: 3px;
    }

    /* Confidence bar */
    .confidence-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        font-size: var(--font-ui-smaller);
        color: var(--text-muted);
        border-top: 1px solid var(--background-modifier-border);
        flex-shrink: 0;
    }

    .confidence-track {
        flex: 1;
        height: 4px;
        background: var(--background-modifier-border);
        border-radius: 2px;
        overflow: hidden;
    }

    .confidence-fill {
        height: 100%;
        background: var(--interactive-accent);
        border-radius: 2px;
    }

    .confidence-value {
        min-width: 36px;
        text-align: right;
    }
</style>
