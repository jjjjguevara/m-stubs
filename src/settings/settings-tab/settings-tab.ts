import { App, PluginSettingTab, setIcon } from 'obsidian';
import LabeledAnnotations from '../../main';
import { AutoSuggestSettings } from './components/auto-suggest-settings';
import { TTSSettings } from './components/tts-settings';
import { NoteSettings } from './components/note-settings/note-settings';
import { LabelsSettings } from './components/label-settings/labels-settings';
import { ClipboardSettings } from './components/clipboard-settings';
import { StubsSettings } from '../../stubs/settings/stubs-settings';
import { GeneralSettings } from './general-settings';
import { LLMSettings } from './llm-settings';
import { MCPSettings } from './mcp-settings';
import { PromptsSettings } from './prompts-settings';
import { ExploreSettings } from './explore-settings';
import { SchemaSettings } from './schema-settings';

type SettingsTabId = 'general' | 'annotations' | 'stubs' | 'ai' | 'explore';

interface TabDefinition {
    id: SettingsTabId;
    name: string;
    icon: string;
}

const TABS: TabDefinition[] = [
    { id: 'general', name: 'General', icon: 'settings' },
    { id: 'annotations', name: 'Annotations', icon: 'highlighter' },
    { id: 'stubs', name: 'Stubs', icon: 'list-todo' },
    { id: 'ai', name: 'AI', icon: 'sparkles' },
    { id: 'explore', name: 'Explore', icon: 'compass' },
];

export class SettingsTab extends PluginSettingTab {
    plugin: LabeledAnnotations;
    activeTab: SettingsTabId = 'general'; // Default to General tab for feature toggles and API keys
    contentContainers: Map<SettingsTabId, HTMLElement> = new Map();
    tabButtons: Map<SettingsTabId, HTMLElement> = new Map();

    constructor(app: App, plugin: LabeledAnnotations) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display = (): void => {
        const { containerEl } = this;
        containerEl.empty();
        this.contentContainers.clear();
        this.tabButtons.clear();

        // Add custom styles
        this.addStyles(containerEl);

        // Create tab navigation
        const navEl = containerEl.createEl('nav', { cls: 'dd-settings-nav' });

        for (const tab of TABS) {
            const tabBtn = navEl.createEl('button', {
                cls: `dd-settings-tab ${tab.id === this.activeTab ? 'is-active' : ''}`,
                attr: { 'data-tab': tab.id },
            });

            const iconEl = tabBtn.createEl('span', { cls: 'dd-tab-icon' });
            setIcon(iconEl, tab.icon);

            tabBtn.createEl('span', { cls: 'dd-tab-name', text: tab.name });

            tabBtn.addEventListener('click', () => this.switchTab(tab.id));
            this.tabButtons.set(tab.id, tabBtn);
        }

        // Create content containers for each tab
        const contentWrapper = containerEl.createEl('div', { cls: 'dd-settings-content' });

        // General tab content
        const generalContent = contentWrapper.createEl('div', {
            cls: `dd-tab-content ${this.activeTab === 'general' ? 'is-active' : ''}`,
            attr: { 'data-tab-content': 'general' },
        });
        this.contentContainers.set('general', generalContent);

        GeneralSettings({
            plugin: this.plugin,
            containerEl: generalContent.createEl('div'),
        });

        // Annotations tab content
        const annotationsContent = contentWrapper.createEl('div', {
            cls: `dd-tab-content ${this.activeTab === 'annotations' ? 'is-active' : ''}`,
            attr: { 'data-tab-content': 'annotations' },
        });
        this.contentContainers.set('annotations', annotationsContent);

        NoteSettings({
            containerEl: annotationsContent.createEl('div'),
            plugin: this.plugin,
        });
        ClipboardSettings({
            plugin: this.plugin,
            containerEl: annotationsContent.createEl('div'),
        });
        AutoSuggestSettings({
            plugin: this.plugin,
            containerEl: annotationsContent.createEl('div'),
        });
        LabelsSettings({
            plugin: this.plugin,
            containerEl: annotationsContent.createEl('div'),
        });
        TTSSettings({
            plugin: this.plugin,
            containerEl: annotationsContent.createEl('div'),
        });

        // Stubs tab content
        const stubsContent = contentWrapper.createEl('div', {
            cls: `dd-tab-content ${this.activeTab === 'stubs' ? 'is-active' : ''}`,
            attr: { 'data-tab-content': 'stubs' },
        });
        this.contentContainers.set('stubs', stubsContent);

        StubsSettings({
            plugin: this.plugin,
            containerEl: stubsContent.createEl('div'),
        });

        // AI tab content
        const aiContent = contentWrapper.createEl('div', {
            cls: `dd-tab-content ${this.activeTab === 'ai' ? 'is-active' : ''}`,
            attr: { 'data-tab-content': 'ai' },
        });
        this.contentContainers.set('ai', aiContent);

        LLMSettings({
            plugin: this.plugin,
            containerEl: aiContent.createEl('div'),
        });
        MCPSettings({
            plugin: this.plugin,
            containerEl: aiContent.createEl('div'),
        });
        PromptsSettings({
            plugin: this.plugin,
            containerEl: aiContent.createEl('div'),
        });
        SchemaSettings({
            plugin: this.plugin,
            containerEl: aiContent.createEl('div'),
        });

        // Explore tab content
        const exploreContent = contentWrapper.createEl('div', {
            cls: `dd-tab-content ${this.activeTab === 'explore' ? 'is-active' : ''}`,
            attr: { 'data-tab-content': 'explore' },
        });
        this.contentContainers.set('explore', exploreContent);

        ExploreSettings({
            plugin: this.plugin,
            containerEl: exploreContent.createEl('div'),
        });
    };

    switchTab = (tabId: SettingsTabId): void => {
        if (tabId === this.activeTab) return;

        // Update active state on buttons
        for (const [id, btn] of this.tabButtons) {
            btn.classList.toggle('is-active', id === tabId);
        }

        // Update active state on content
        for (const [id, content] of this.contentContainers) {
            content.classList.toggle('is-active', id === tabId);
        }

        this.activeTab = tabId;
    };

    addStyles = (containerEl: HTMLElement): void => {
        // Check if styles already exist
        if (containerEl.querySelector('.dd-settings-styles')) return;

        const style = document.createElement('style');
        style.className = 'dd-settings-styles';
        style.textContent = `
            .dd-settings-nav {
                display: flex;
                gap: 4px;
                margin-bottom: 20px;
                padding-bottom: 12px;
                border-bottom: 1px solid var(--background-modifier-border);
            }

            .dd-settings-tab {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 16px;
                border: none;
                background: transparent;
                color: var(--text-muted);
                font-size: var(--font-ui-medium);
                cursor: pointer;
                border-radius: 6px;
                transition: all 0.15s ease;
            }

            .dd-settings-tab:hover {
                background: var(--background-modifier-hover);
                color: var(--text-normal);
            }

            .dd-settings-tab.is-active {
                background: var(--interactive-accent);
                color: var(--text-on-accent);
            }

            .dd-tab-icon {
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .dd-tab-icon svg {
                width: 16px;
                height: 16px;
            }

            .dd-tab-name {
                font-weight: 500;
            }

            .dd-settings-content {
                position: relative;
            }

            .dd-tab-content {
                display: none;
            }

            .dd-tab-content.is-active {
                display: block;
            }

            /* Heading hierarchy for settings */
            .dd-tab-content h2 {
                font-size: 1.4em;
                font-weight: 600;
                margin: 1.5em 0 0.5em 0;
                padding-bottom: 0.3em;
                border-bottom: 1px solid var(--background-modifier-border);
            }

            .dd-tab-content h2:first-child {
                margin-top: 0;
            }

            .dd-tab-content h3 {
                font-size: 1.15em;
                font-weight: 600;
                margin: 1.2em 0 0.4em 0;
                color: var(--text-normal);
            }

            .dd-tab-content h4 {
                font-size: 1em;
                font-weight: 600;
                margin: 1em 0 0.3em 0;
                color: var(--text-muted);
            }

            .dd-tab-content h5 {
                font-size: 0.9em;
                font-weight: 500;
                margin: 0.8em 0 0.2em 0;
                color: var(--text-muted);
            }
        `;
        containerEl.prepend(style);
    };
}
