import { Menu, Notice, Plugin, TAbstractFile, TFile, TFolder, MarkdownView } from 'obsidian';
import { addInsertCommentCommands } from './commands/commands';
import { Settings } from './settings/settings-type';
import {
    SIDEBAR_OUTLINE_VIEW_TYPE,
    SidebarOutlineView,
} from './sidebar-outline/sidebar-outline-view';
import { SettingsTab } from './settings/settings-tab/settings-tab';
import { Store } from './helpers/store';
import { SettingsActions, settingsReducer } from './settings/settings-reducer';
import { AnnotationSuggest } from './editor-suggest/annotation-suggest';
import { DEFAULT_SETTINGS } from './settings/default-settings';
import { tts } from './sidebar-outline/components/components/controls-bar/helpers/tts';
import { mergeDeep } from './settings/helpers/merge-objects';
import { registerEditorMenuEvent } from './note-creation/register-editor-menu-event';

import { OutlineUpdater } from './sidebar-outline/helpers/outline-updater/outline-updater';
import { loadOutlineStateFromSettings } from './settings/helpers/load-outline-state-from-settings';
import { subscribeSettingsToOutlineState } from './settings/helpers/subscribe-settings-to-outline-state';
import { StatusBar } from './status-bar/status-bar';
import { fileMenuItems } from './clipboard/file-menu-items';
import { subscribeDecorationStateToSettings } from './settings/helpers/subscribe-decoration-state-to-settings';
import { DecorationSettings } from './editor-plugin/helpers/decorate-annotations/decoration-settings';
import { EditorPlugin, editorPlugin } from './editor-plugin/editor-plugin';
import { Idling } from './idling/idling';

// Stubs imports
import {
    registerStubsCommands,
    stubsEditorPlugin,
    StubsEditorPlugin,
    updateStubsConfig,
    updateSyncState,
    performSync,
    stubAnchorStyles,
    StubSuggest,
    stubSuggestStyles,
} from './stubs';

// MCP imports
import { MCPClient, MCPTools } from './mcp';

// Smart Connections imports
import { SmartConnectionsService, createSmartConnectionsService } from './smart-connections';

// Model fetch service for session refresh
import { refreshAllCachedModels } from './llm/model-fetch-service';

// Schema loader for J-Editorial schema
import { SchemaLoader } from './schema/schema-loader';

export default class LabeledAnnotations extends Plugin {
    outline: OutlineUpdater;
    settings: Store<Settings, SettingsActions>;
    statusBar: StatusBar;
    idling: Idling;
    decorationSettings: DecorationSettings;
    editorSuggest: AnnotationSuggest;
    stubSuggest: StubSuggest;
    mcpClient: MCPClient | null = null;
    mcpTools: MCPTools | null = null;
    smartConnectionsService: SmartConnectionsService | null = null;
    schemaLoader: SchemaLoader | null = null;
    settingsTab: SettingsTab | null = null;
    private unsubscribeCallbacks: Set<() => void> = new Set();
    private syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    private syncDebounceDelay = 150; // ms

    async onload() {
        await this.loadSettings();

        this.editorSuggest = new AnnotationSuggest(this.app, this);
        this.registerEditorSuggest(this.editorSuggest);
        this.registerEvent(
            this.app.workspace.on(
                'file-menu',
                (menu: Menu, abstractFiles: TAbstractFile) => {
                    if (
                        abstractFiles instanceof TFolder ||
                        (abstractFiles instanceof TFile &&
                            abstractFiles.extension === 'md')
                    )
                        fileMenuItems(this)(menu, abstractFiles);
                },
            ),
        );
        this.registerEvent(
            this.app.workspace.on('files-menu', fileMenuItems(this)),
        );

        addInsertCommentCommands(this);

        // Register stubs commands
        try {
            registerStubsCommands(this);
        } catch (error) {
            console.error('Failed to register stubs commands:', error);
        }

        this.registerView(
            SIDEBAR_OUTLINE_VIEW_TYPE,
            (leaf) => new SidebarOutlineView(leaf, this),
        );

        this.app.workspace.onLayoutReady(async () => {
            await this.attachLeaf();
            loadOutlineStateFromSettings(this);
            this.registerSubscription(...subscribeSettingsToOutlineState(this));

            // Initialize schema loader before settings tab
            await this.initializeSchemaLoader();

            this.settingsTab = new SettingsTab(this.app, this);
            this.addSettingTab(this.settingsTab);
            registerEditorMenuEvent(this);
            this.outline = new OutlineUpdater(this);
            this.statusBar = new StatusBar(this);
            tts.setPlugin(this);
            this.idling = new Idling(this);

            // Refresh LLM models on session start (if enabled and has API keys)
            this.refreshModelsOnSessionStart();
        });
    }

    /**
     * Refresh cached models on first session load
     * Only runs once per session if LLM is enabled and API keys are configured
     */
    private async refreshModelsOnSessionStart(): Promise<void> {
        const settings = this.settings.getValue();
        const llmConfig = settings.llm;

        // Skip if LLM not enabled or already refreshed this session
        if (!llmConfig.enabled || llmConfig.cachedModels?.sessionRefreshed) {
            return;
        }

        // Check if we have any API keys configured
        const apiKeys = llmConfig.apiKeys || { anthropic: '', openai: '', gemini: '' };
        const hasAnyKey = Object.values(apiKeys).some(key => key.length > 0);

        if (!hasAnyKey) {
            return;
        }

        console.log('[Doc Doctor] Refreshing LLM models for new session...');

        try {
            const updatedCache = await refreshAllCachedModels(
                apiKeys,
                llmConfig.cachedModels,
            );

            this.settings.dispatch({
                type: 'LLM_SET_CACHED_MODELS',
                payload: { cachedModels: updatedCache },
            });

            console.log('[Doc Doctor] LLM models refreshed successfully');
        } catch (error) {
            console.warn('[Doc Doctor] Failed to refresh LLM models:', error);
        }
    }

    onunload() {
        tts.stop();
        // Clear any pending debounce timer
        if (this.syncDebounceTimer) {
            clearTimeout(this.syncDebounceTimer);
            this.syncDebounceTimer = null;
        }
        // Disconnect MCP client
        if (this.mcpClient) {
            this.mcpClient.disconnect().catch(console.error);
            this.mcpClient = null;
            this.mcpTools = null;
        }
        for (const callback of this.unsubscribeCallbacks) {
            callback();
        }
    }

    loadPlugin() {
        this.decorationSettings = new DecorationSettings(this);
        EditorPlugin.plugin = this;
        this.unsubscribeCallbacks.add(subscribeDecorationStateToSettings(this));
        this.registerEditorExtension([editorPlugin]);

        // Initialize stubs
        this.initializeStubs();
    }

    /**
     * Initialize stubs module
     */
    initializeStubs() {
        try {
            // Set stubs editor plugin reference
            StubsEditorPlugin.plugin = this;

            // Register stubs editor extension
            this.registerEditorExtension([stubsEditorPlugin]);

            // Register stub suggest (^^ trigger)
            this.stubSuggest = new StubSuggest(this.app, this);
            this.registerEditorSuggest(this.stubSuggest);

            // Initialize stubs config from settings
            updateStubsConfig(this.settings.getValue().stubs);

            // Subscribe to settings changes to update stubs config
            this.unsubscribeCallbacks.add(
                this.settings.subscribe(() => {
                    updateStubsConfig(this.settings.getValue().stubs);
                })
            );

            // Register event to sync stubs when file changes
            this.registerEvent(
                this.app.workspace.on('active-leaf-change', () => {
                    // Immediate sync on leaf change (user switched files)
                    this.syncStubsForActiveFile();
                })
            );

            this.registerEvent(
                this.app.metadataCache.on('changed', (file) => {
                    const activeFile = this.app.workspace.getActiveFile();
                    if (activeFile && file.path === activeFile.path) {
                        // Debounced sync on file content changes to prevent UI freeze
                        this.debouncedSyncStubsForActiveFile();
                    }
                })
            );

            // Add CSS for stub decorations and suggest styles
            this.addStubStyles();

            // Initialize MCP after stubs
            this.initializeMCP();

            // Initialize Smart Connections service
            this.initializeSmartConnections();
        } catch (error) {
            console.error('Failed to initialize stubs module:', error);
        }
    }

    /**
     * Initialize MCP client if enabled
     */
    async initializeMCP(): Promise<void> {
        const settings = this.settings.getValue();
        if (!settings.mcp.enabled) {
            console.log('[Doc Doctor] MCP is disabled in settings');
            return;
        }

        try {
            this.mcpClient = new MCPClient({
                binaryPath: settings.mcp.binaryPath,
                timeout: settings.mcp.connectionTimeout,
            });

            // Auto-connect if enabled
            if (settings.mcp.autoConnect) {
                await this.mcpClient.connect();
                this.mcpTools = new MCPTools(this.mcpClient);
                console.log('[Doc Doctor] MCP connected successfully');

                // Show status bar if enabled
                if (settings.mcp.showStatusBar) {
                    new Notice('MCP connected');
                }
            }

            // Subscribe to MCP events
            this.mcpClient.on((event) => {
                if (event.type === 'disconnected') {
                    console.log('[Doc Doctor] MCP disconnected:', event.reason);
                    this.mcpTools = null;
                } else if (event.type === 'error') {
                    console.error('[Doc Doctor] MCP error:', event.error);
                } else if (event.type === 'reconnecting') {
                    console.log('[Doc Doctor] MCP reconnecting, attempt:', event.attempt);
                }
            });

            // Subscribe to settings changes to handle MCP enable/disable
            this.unsubscribeCallbacks.add(
                this.settings.subscribe(async () => {
                    const newSettings = this.settings.getValue();
                    if (!newSettings.mcp.enabled && this.mcpClient?.isConnected()) {
                        await this.mcpClient.disconnect();
                        this.mcpTools = null;
                    } else if (newSettings.mcp.enabled && !this.mcpClient?.isConnected()) {
                        try {
                            await this.mcpClient?.connect();
                            if (this.mcpClient) {
                                this.mcpTools = new MCPTools(this.mcpClient);
                            }
                        } catch (error) {
                            console.error('[Doc Doctor] Failed to reconnect MCP:', error);
                        }
                    }
                })
            );
        } catch (error) {
            console.error('[Doc Doctor] Failed to initialize MCP:', error);
        }
    }

    /**
     * Check if MCP is connected and tools are available
     */
    isMCPConnected(): boolean {
        return this.mcpClient?.isConnected() ?? false;
    }

    /**
     * Get MCP tools (returns null if not connected)
     */
    getMCPTools(): MCPTools | null {
        return this.mcpTools;
    }

    /**
     * Initialize Smart Connections service
     */
    initializeSmartConnections(): void {
        try {
            const settings = this.settings.getValue();
            this.smartConnectionsService = createSmartConnectionsService(
                this.app,
                settings.smartConnections
            );

            // Subscribe to settings changes
            this.unsubscribeCallbacks.add(
                this.settings.subscribe(() => {
                    const newSettings = this.settings.getValue();
                    if (this.smartConnectionsService) {
                        this.smartConnectionsService.updateSettings(newSettings.smartConnections);
                    }
                })
            );

            const status = this.smartConnectionsService.getStatus();
            if (status.smartConnections) {
                console.log('[Doc Doctor] Smart Connections available with', status.embeddingsCount, 'embeddings');
            } else {
                console.log('[Doc Doctor] Smart Connections not available, using keyword fallback');
            }
        } catch (error) {
            console.error('[Doc Doctor] Failed to initialize Smart Connections:', error);
        }
    }

    /**
     * Initialize J-Editorial Schema Loader
     */
    async initializeSchemaLoader(): Promise<void> {
        try {
            this.schemaLoader = new SchemaLoader(this.app);
            await this.schemaLoader.initialize();

            const source = this.schemaLoader.getSchemaSource();
            const schema = this.schemaLoader.getSchema();
            console.log(`[Doc Doctor] Schema loaded: ${source} (v${schema.version})`);
        } catch (error) {
            console.error('[Doc Doctor] Failed to initialize schema loader:', error);
        }
    }

    /**
     * Sync stubs for the active file
     */
    async syncStubsForActiveFile() {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || !view.file) {
            return;
        }

        const config = this.settings.getValue().stubs;
        if (!config.enabled) {
            return;
        }

        try {
            const content = await this.app.vault.read(view.file);
            const result = await performSync(this.app, view.file, content, config);
            updateSyncState(result);
        } catch (error) {
            console.error('Failed to sync stubs:', error);
        }
    }

    /**
     * Debounced version of syncStubsForActiveFile to prevent UI freeze
     * when rapid file changes occur (e.g., accepting suggestions)
     */
    debouncedSyncStubsForActiveFile() {
        if (this.syncDebounceTimer) {
            clearTimeout(this.syncDebounceTimer);
        }
        this.syncDebounceTimer = setTimeout(() => {
            this.syncDebounceTimer = null;
            this.syncStubsForActiveFile();
        }, this.syncDebounceDelay);
    }

    /**
     * Add CSS styles for stub anchor decorations and suggest dropdown
     */
    addStubStyles() {
        const styleEl = document.createElement('style');
        styleEl.id = 'doc-doctor-styles';
        styleEl.textContent = stubAnchorStyles + '\n' + stubSuggestStyles;
        document.head.appendChild(styleEl);

        // Clean up on unload
        this.register(() => {
            const el = document.getElementById('doc-doctor-styles');
            if (el) {
                el.remove();
            }
        });
    }

    async loadSettings() {
        const settings = (await this.loadData()) || {};
        this.settings = new Store<Settings, SettingsActions>(
            mergeDeep(settings, DEFAULT_SETTINGS()),
            settingsReducer,
        );
        this.registerSubscription(
            this.settings.subscribe(() => {
                this.saveSettings();
            }),
        );
    }

    async saveSettings() {
        await this.saveData(this.settings.getValue());
    }

    async attachLeaf() {
        const leaves = this.app.workspace.getLeavesOfType(
            SIDEBAR_OUTLINE_VIEW_TYPE,
        );
        if (leaves.length === 0) {
            await this.app.workspace.getRightLeaf(false).setViewState({
                type: SIDEBAR_OUTLINE_VIEW_TYPE,
                active: true,
            });
        }
    }

    async revealLeaf() {
        const leaf = this.app.workspace.getLeavesOfType(
            SIDEBAR_OUTLINE_VIEW_TYPE,
        )[0];
        if (leaf) this.app.workspace.revealLeaf(leaf);
        else {
            await this.attachLeaf();
            await this.revealLeaf();
        }
    }

    registerSubscription(...callback: (() => void)[]) {
        callback.forEach((callback) => {
            this.unsubscribeCallbacks.add(callback);
        });
    }
}
