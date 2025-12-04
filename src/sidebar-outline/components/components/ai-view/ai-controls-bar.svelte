<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { writable } from 'svelte/store';
    import { Wand2, Loader2, Settings, Trash2, ChevronDown, Globe, Brain, BookOpen, Cpu } from 'lucide-svelte';
    import LabeledAnnotations from '../../../../main';
    import { llmAnalysisState, triggerLLMAnalysis, clearSuggestions } from '../../../../stubs/llm-analysis-store';
    import { BUILTIN_PROMPTS } from '../../../../llm/builtin-prompts';
    import type { PromptDefinition } from '../../../../llm/prompt-schema';
    import type { LLMConfiguration, LLMProvider, ModelInfo } from '../../../../llm/llm-types';
    import { DEFAULT_MODELS } from '../../../../llm/llm-types';

    export let plugin: LabeledAnnotations;

    // Create a local store for LLM settings that we can subscribe to
    const llmSettingsStore = writable<LLMConfiguration | null>(null);
    let unsubscribe: (() => void) | null = null;

    // Popup states
    let showTemplatePopup = false;
    let showModelPopup = false;
    let showContextPopup = false;

    // Search service toggles (local state synced from settings)
    let webSearchEnabled = true;
    let semanticSearchEnabled = true;
    let openAlexEnabled = false;

    // Refs for click-outside handling
    let templatePopupRef: HTMLDivElement;
    let modelPopupRef: HTMLDivElement;
    let contextPopupRef: HTMLDivElement;

    // Normalize builtin prompts to full PromptDefinition format
    const allPrompts: PromptDefinition[] = BUILTIN_PROMPTS.map(p => ({
        ...p,
        source: 'builtin' as const,
        context: { requires_selection: false, requires_file: true, file_types: ['md'], ...p.context },
        behavior: { confirm_before_apply: true, auto_insert_anchors: true, show_preview: true, ...p.behavior },
    }));

    onMount(() => {
        // Subscribe to plugin settings and update our local store
        unsubscribe = plugin.settings.subscribe((settings) => {
            llmSettingsStore.set(settings.llm);
            // Sync toggles from settings
            if (settings.llm?.firecrawl) {
                webSearchEnabled = settings.llm.firecrawl.webSearchEnabled;
                semanticSearchEnabled = settings.llm.firecrawl.smartConnectionsEnabled;
            }
        });
    });

    onDestroy(() => {
        if (unsubscribe) unsubscribe();
    });

    // LLM analysis state - reactive
    $: llmSettings = $llmSettingsStore;
    $: isLLMConfigured = llmSettings?.enabled && llmSettings?.apiKey;
    $: isAnalyzing = $llmAnalysisState.isAnalyzing;
    $: suggestionCount = $llmAnalysisState.suggestions.length;

    // Template state
    $: selectedTemplateId = llmSettings?.selectedTemplateId || 'analyze-annotate';
    $: selectedPrompt = allPrompts.find(p => p.id === selectedTemplateId) || allPrompts[0];
    $: enabledPrompts = allPrompts.filter(p => p.enabled !== false);

    // Model state
    $: currentProvider = llmSettings?.provider || 'anthropic';
    $: currentModel = llmSettings?.model || '';
    $: availableModels = getModelsForProvider(currentProvider);
    $: currentModelInfo = availableModels.find(m => m.id === currentModel);

    function getModelsForProvider(provider: LLMProvider): ModelInfo[] {
        // Use cached models if available, otherwise fallback to defaults
        const cached = llmSettings?.cachedModels?.[provider];
        if (cached && cached.models.length > 0) {
            return cached.models;
        }
        return DEFAULT_MODELS[provider] || [];
    }

    function getProviderLabel(provider: LLMProvider): string {
        switch (provider) {
            case 'anthropic': return 'Claude';
            case 'openai': return 'GPT';
            case 'gemini': return 'Gemini';
            default: return provider;
        }
    }

    // Toggle popup handlers
    const toggleTemplatePopup = (e: MouseEvent) => {
        e.stopPropagation();
        showTemplatePopup = !showTemplatePopup;
        showModelPopup = false;
        showContextPopup = false;
    };

    const toggleModelPopup = (e: MouseEvent) => {
        e.stopPropagation();
        showModelPopup = !showModelPopup;
        showTemplatePopup = false;
        showContextPopup = false;
    };

    const toggleContextPopup = (e: MouseEvent) => {
        e.stopPropagation();
        showContextPopup = !showContextPopup;
        showTemplatePopup = false;
        showModelPopup = false;
    };

    const closeAllPopups = () => {
        showTemplatePopup = false;
        showModelPopup = false;
        showContextPopup = false;
    };

    const handleAnalyze = () => {
        if (!isLLMConfigured) {
            plugin.app.setting.open();
            plugin.app.setting.openTabById('doc-doctor');
            return;
        }
        closeAllPopups();
        triggerLLMAnalysis(plugin);
    };

    const handleOpenSettings = () => {
        plugin.app.setting.open();
        plugin.app.setting.openTabById('doc-doctor');
    };

    const handleClearSuggestions = () => {
        clearSuggestions();
    };

    const selectTemplate = (prompt: PromptDefinition) => {
        plugin.settings.dispatch({
            type: 'LLM_SET_SELECTED_TEMPLATE',
            payload: { templateId: prompt.id },
        });
        plugin.saveSettings();
        showTemplatePopup = false;
    };

    const selectModel = (modelId: string) => {
        plugin.settings.dispatch({
            type: 'LLM_SET_MODEL',
            payload: { model: modelId },
        });
        plugin.saveSettings();
        showModelPopup = false;
    };

    const toggleWebSearch = () => {
        webSearchEnabled = !webSearchEnabled;
        plugin.settings.dispatch({
            type: 'LLM_SET_FIRECRAWL_WEB_SEARCH',
            payload: { enabled: webSearchEnabled },
        });
        plugin.saveSettings();
    };

    const toggleSemanticSearch = () => {
        semanticSearchEnabled = !semanticSearchEnabled;
        plugin.settings.dispatch({
            type: 'LLM_SET_FIRECRAWL_SMART_CONNECTIONS',
            payload: { enabled: semanticSearchEnabled },
        });
        plugin.saveSettings();
    };

    const toggleOpenAlex = () => {
        openAlexEnabled = !openAlexEnabled;
        // OpenAlex toggle - will be wired to providers settings
    };

    // Close popups when clicking outside
    function handleClickOutside(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (showTemplatePopup && templatePopupRef && !templatePopupRef.contains(target)) {
            showTemplatePopup = false;
        }
        if (showModelPopup && modelPopupRef && !modelPopupRef.contains(target)) {
            showModelPopup = false;
        }
        if (showContextPopup && contextPopupRef && !contextPopupRef.contains(target)) {
            showContextPopup = false;
        }
    }

    // Context sources count
    $: enabledContextCount = [webSearchEnabled, semanticSearchEnabled, openAlexEnabled].filter(Boolean).length;
</script>

<svelte:window on:click={handleClickOutside} />

<div class="ai-controls">
    <!-- Magic Wand (Analyze) Button -->
    <button
        class="control-btn magic-wand"
        class:active={isAnalyzing}
        class:disabled={!isLLMConfigured && !isAnalyzing}
        on:click={handleAnalyze}
        disabled={isAnalyzing}
        title={isLLMConfigured
            ? (isAnalyzing ? 'Analyzing...' : 'Analyze document')
            : 'Configure LLM in settings to enable'}
    >
        {#if isAnalyzing}
            <Loader2 size={14} class="spin" />
        {:else}
            <Wand2 size={14} />
        {/if}
    </button>

    <!-- Template Selector Button -->
    <div class="dropdown-wrapper" bind:this={templatePopupRef}>
        <button
            class="control-btn selector-btn"
            class:active={showTemplatePopup}
            on:click={toggleTemplatePopup}
            title="Select analysis template"
        >
            <span class="selector-label">{selectedPrompt?.name?.slice(0, 12) || 'Template'}</span>
            <ChevronDown size={10} />
        </button>

        {#if showTemplatePopup}
            <div class="dropdown-popup template-popup">
                <div class="popup-header">Analysis Templates</div>
                <div class="popup-list">
                    {#each enabledPrompts as prompt}
                        <button
                            class="popup-item"
                            class:selected={prompt.id === selectedTemplateId}
                            on:click={() => selectTemplate(prompt)}
                        >
                            <span class="item-name">{prompt.name}</span>
                            {#if prompt.description}
                                <span class="item-desc">{prompt.description}</span>
                            {/if}
                        </button>
                    {/each}
                </div>
            </div>
        {/if}
    </div>

    <!-- Model Selector Button -->
    <div class="dropdown-wrapper" bind:this={modelPopupRef}>
        <button
            class="control-btn selector-btn model-btn"
            class:active={showModelPopup}
            on:click={toggleModelPopup}
            title="Select model"
        >
            <Cpu size={12} />
            <span class="selector-label">{currentModelInfo?.name?.slice(0, 10) || getProviderLabel(currentProvider)}</span>
            <ChevronDown size={10} />
        </button>

        {#if showModelPopup}
            <div class="dropdown-popup model-popup">
                <div class="popup-header">{getProviderLabel(currentProvider)} Models</div>
                <div class="popup-list">
                    {#each availableModels as model}
                        <button
                            class="popup-item"
                            class:selected={model.id === currentModel}
                            on:click={() => selectModel(model.id)}
                        >
                            <span class="item-name">
                                {model.name}
                                {#if model.recommended}
                                    <span class="recommended-badge">★</span>
                                {/if}
                            </span>
                            {#if model.context}
                                <span class="item-meta">{model.context.toLocaleString()}k context</span>
                            {/if}
                        </button>
                    {/each}
                </div>
            </div>
        {/if}
    </div>

    <!-- Context Sources Button -->
    <div class="dropdown-wrapper" bind:this={contextPopupRef}>
        <button
            class="control-btn selector-btn context-btn"
            class:active={showContextPopup}
            on:click={toggleContextPopup}
            title="Context sources"
        >
            <Globe size={12} />
            {#if enabledContextCount > 0}
                <span class="context-count">{enabledContextCount}</span>
            {/if}
            <ChevronDown size={10} />
        </button>

        {#if showContextPopup}
            <div class="dropdown-popup context-popup">
                <div class="popup-header">Context Sources</div>
                <div class="popup-list">
                    <label class="toggle-item">
                        <input
                            type="checkbox"
                            checked={webSearchEnabled}
                            on:change={toggleWebSearch}
                        />
                        <Globe size={14} />
                        <span class="toggle-label">Web Search</span>
                    </label>
                    <label class="toggle-item">
                        <input
                            type="checkbox"
                            checked={semanticSearchEnabled}
                            on:change={toggleSemanticSearch}
                        />
                        <Brain size={14} />
                        <span class="toggle-label">Semantic Search</span>
                    </label>
                    <label class="toggle-item">
                        <input
                            type="checkbox"
                            checked={openAlexEnabled}
                            on:change={toggleOpenAlex}
                        />
                        <BookOpen size={14} />
                        <span class="toggle-label">OpenAlex</span>
                    </label>
                </div>
            </div>
        {/if}
    </div>

    <!-- Spacer -->
    <div class="spacer"></div>

    <!-- Clear suggestions -->
    {#if suggestionCount > 0}
        <button
            class="control-btn"
            on:click={handleClearSuggestions}
            title="Clear suggestions"
        >
            <Trash2 size={14} />
        </button>
    {/if}

    <!-- Settings -->
    <button
        class="control-btn"
        on:click={handleOpenSettings}
        title="AI Settings"
    >
        <Settings size={14} />
    </button>

    <!-- Suggestion count badge -->
    {#if suggestionCount > 0}
        <span class="suggestion-count" title="Suggestions">
            {suggestionCount}
        </span>
    {/if}
</div>

<style>
    .ai-controls {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .control-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 4px;
        border: none;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        border-radius: 4px;
        transition: all 0.15s ease;
    }

    .control-btn:hover {
        background: var(--background-modifier-hover);
        color: var(--text-normal);
    }

    .control-btn.active {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
    }

    .control-btn.disabled {
        opacity: 0.5;
    }

    .control-btn.magic-wand.active {
        background: var(--color-purple);
        color: white;
    }

    /* Selector buttons */
    .selector-btn {
        gap: 4px;
        padding: 4px 6px;
        font-size: 11px;
    }

    .selector-label {
        max-width: 70px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .model-btn, .context-btn {
        gap: 3px;
    }

    .context-count {
        font-size: 9px;
        background: var(--interactive-accent);
        color: var(--text-on-accent);
        padding: 1px 4px;
        border-radius: 8px;
        min-width: 14px;
        text-align: center;
    }

    /* Spin animation for loading state */
    :global(.spin) {
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }

    .suggestion-count {
        font-size: var(--font-ui-smaller);
        color: var(--text-muted);
        background: var(--background-modifier-border);
        padding: 2px 6px;
        border-radius: 10px;
    }

    .spacer {
        flex: 1;
    }

    /* Dropdown wrapper */
    .dropdown-wrapper {
        position: relative;
    }

    /* Dropdown popup */
    .dropdown-popup {
        position: absolute;
        top: 100%;
        left: 0;
        z-index: 1000;
        min-width: 180px;
        max-width: 280px;
        margin-top: 4px;
        background: var(--background-primary);
        border: 1px solid var(--background-modifier-border);
        border-radius: 6px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
        overflow: hidden;
    }

    .template-popup {
        min-width: 220px;
    }

    .popup-header {
        padding: 8px 10px;
        font-size: 11px;
        font-weight: 600;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        border-bottom: 1px solid var(--background-modifier-border);
    }

    .popup-list {
        max-height: 300px;
        overflow-y: auto;
        padding: 4px;
    }

    .popup-item {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
        width: 100%;
        padding: 8px 10px;
        border: none;
        background: transparent;
        cursor: pointer;
        text-align: left;
        border-radius: 4px;
        transition: background 0.1s ease;
    }

    .popup-item:hover {
        background: var(--background-modifier-hover);
    }

    .popup-item.selected {
        background: var(--background-modifier-active-hover);
    }

    .item-name {
        font-size: var(--font-ui-small);
        color: var(--text-normal);
        font-weight: 500;
    }

    .item-desc {
        font-size: 11px;
        color: var(--text-muted);
        line-height: 1.3;
    }

    .item-meta {
        font-size: 10px;
        color: var(--text-faint);
    }

    .recommended-badge {
        color: var(--color-yellow);
        margin-left: 4px;
    }

    /* Toggle items for context sources */
    .toggle-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        cursor: pointer;
        border-radius: 4px;
        transition: background 0.1s ease;
    }

    .toggle-item:hover {
        background: var(--background-modifier-hover);
    }

    .toggle-item input[type="checkbox"] {
        margin: 0;
        cursor: pointer;
    }

    .toggle-label {
        font-size: var(--font-ui-small);
        color: var(--text-normal);
    }
</style>
