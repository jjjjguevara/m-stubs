import { AnnotationType } from '../sidebar-outline/components/components/annotations-list/annotations-list.store';
import { ClipboardTemplates } from '../clipboard/helpers/annotations-to-text';
import { StubsConfiguration } from '../stubs/stubs-types';
import { LLMConfiguration } from '../llm/llm-types';
import { MCPSettings } from '../mcp/mcp-types';
import { PromptSettings } from '../llm/prompt-schema';
import type { SmartConnectionsSettings } from '../smart-connections/types';
import type { ProvidersSettings } from '../llm/providers';
import type { CardSegmentationSettings } from '../shared/types/segmented-card-types';
import type { MilestoneSettings } from '../observability/milestone-settings';
import type { TimeTravelSettings } from '../time-travel/time-travel-types';

export type Case = 'upper' | 'lower' | 'title';
export type Opacity = 80 | 60 | 40 | 20;
export type FontWeight = 'thin' | 'bold';
export type FontFamily = 'sans-serif' | 'serif' | 'monospace';

export type TagStyle = {
    fontSize?: number;
    fontWeight?: FontWeight;
    fontFamily?: FontFamily;
    opacity?: Opacity;
};

export type TagSettings = {
    style: TagStyle;
    enableStyle: boolean;
};

export type StyleScope = 'comments' | 'highlights';

export type LabelStyle = {
    color?: string;
    italic?: boolean;
    underline?: boolean;
    fontSize?: number;
    case?: Case;
    fontWeight?: FontWeight;
    opacity?: Opacity;
    fontFamily?: FontFamily;
    scope?: StyleScope;
};
export type LabelSettings = {
    label: string;
    id: string;
    style: LabelStyle;
    enableStyle: boolean;
};
export type NotesNamingMode =
    | 'annotation-text'
    | 'annotation-label - annotation-text'
    | 'annotation-label/annotation-text';
export type CommentFormat = 'markdown' | 'html';
export type DefaultFolderMode =
    | 'vault'
    | 'current folder'
    | 'current folder/notes'
    | 'current folder/notes/<file-name>'
    | 'customFolder';

export type DateString = string;

export type DefaultPalette = 'bright' | 'dull';

export type SidebarViewMode = 'annotations' | 'stubs' | 'ai' | 'explore';

/**
 * Master feature toggles for enabling/disabling entire plugin features
 */
export type FeatureToggles = {
    annotations: boolean;
    stubs: boolean;
    ai: boolean;
    explore: boolean;
};

/**
 * Diagnostic test result state
 */
export type DiagnosticStatus = 'untested' | 'testing' | 'success' | 'error';

/**
 * Diagnostic state for a single service
 */
export type DiagnosticState = {
    status: DiagnosticStatus;
    lastTested: number | null; // Unix timestamp
    message?: string;
    version?: string;
};

/**
 * All diagnostic states
 */
export type DiagnosticsState = {
    llm: DiagnosticState;
    mcp: DiagnosticState;
    smartConnections: DiagnosticState;
    obsidianGit: DiagnosticState;
    dataview: DiagnosticState;
};

export type Settings = {
    /** Master feature toggles */
    features: FeatureToggles;
    editorSuggest: {
        enableAutoSuggest: boolean;
        triggerPhrase: string;
        commentFormat: CommentFormat;
    };
    decoration: {
        autoRegisterLabels: boolean;
        styles: {
            labels: Record<string, LabelSettings>;
            tag: TagSettings;
        };
        defaultPalette: DefaultPalette;
    };
    outline: {
        showSearchInput: boolean;
        fontSize: number;
        showLabelsFilter: boolean;
        hiddenLabels: string[];
        hiddenTypes: AnnotationType[];
        sidebarViewMode: SidebarViewMode;
    };
    tts: {
        volume: number;
        rate: number;
        voice?: string;
        pitch: number;
        focusAnnotationInEditor: boolean;
    };
    notes: {
        defaultFolderMode: DefaultFolderMode;
        defaultFolder: string;
        notesNamingMode: NotesNamingMode;
        openNoteAfterCreation: boolean;
        insertLinkToNote: boolean;
        template: string;
        truncateFileName: boolean;
    };
    clipboard: { templates: ClipboardTemplates };
    idling: {
        daysUnused: [DateString?, DateString?, DateString?];
    };
    stubs: StubsConfiguration;
    llm: LLMConfiguration;
    mcp: MCPSettings;
    prompts: PromptSettings;
    smartConnections: SmartConnectionsSettings;
    /** External context providers (OpenAlex, Web Search, URL Scraping) */
    providers: ProvidersSettings;
    /** Diagnostic test states */
    diagnostics: DiagnosticsState;
    /** Card segmentation settings for Explore and AI views */
    cardSegmentation: CardSegmentationSettings;
    /** Milestone tracking and git integration */
    milestones: MilestoneSettings;
    /** Time Travel feature settings */
    timeTravel: TimeTravelSettings;
};
