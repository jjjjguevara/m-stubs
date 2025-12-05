import { Settings } from './settings-type';
import { copiedAnnotationsTemplates } from '../clipboard/helpers/annotations-to-text';
import { noteTemplate } from '../note-creation/create-note-file';
import { DEFAULT_STUBS_CONFIGURATION } from '../stubs/stubs-defaults';
import { DEFAULT_LLM_CONFIGURATION } from '../llm/llm-types';
import { DEFAULT_MCP_SETTINGS } from '../mcp/mcp-types';
import { DEFAULT_PROMPT_SETTINGS } from '../llm/prompt-schema';
import { DEFAULT_SMART_CONNECTIONS_SETTINGS } from '../smart-connections/types';
import { DEFAULT_PROVIDERS_SETTINGS } from '../llm/providers';
import { DEFAULT_CARD_SEGMENTATION_SETTINGS } from '../shared/types/segmented-card-types';
import { DEFAULT_MILESTONE_SETTINGS } from '../observability/milestone-settings';
import { DEFAULT_TIME_TRAVEL_SETTINGS } from '../time-travel/time-travel-types';

export const DEFAULT_SETTINGS = (): Settings => ({
    features: {
        annotations: true,
        stubs: true,
        ai: true,
        explore: true,
    },
    editorSuggest: {
        enableAutoSuggest: true,
        triggerPhrase: '//',
        commentFormat: 'html',
    },
    decoration: {
        autoRegisterLabels: true,
        styles: {
            labels: {},
            tag: {
                style: { fontSize: 10, opacity: 40 },
                enableStyle: true,
            },
        },
        defaultPalette: 'bright',
    },
    outline: {
        fontSize: 12,
        showLabelsFilter: false,
        showSearchInput: false,
        hiddenLabels: [],
        hiddenTypes: [],
        sidebarViewMode: 'annotations',
    },
    tts: {
        rate: 1.1,
        pitch: 1.0,
        volume: 1,
        voice: typeof window !== 'undefined' && window.speechSynthesis
            ? window.speechSynthesis.getVoices().find((v) => v.default)?.name
            : undefined,
        focusAnnotationInEditor: true,
    },
    notes: {
        defaultFolder: 'notes',
        notesNamingMode: 'annotation-label/annotation-text',
        openNoteAfterCreation: false,
        insertLinkToNote: true,
        defaultFolderMode: 'current folder/notes/<file-name>',
        template: noteTemplate,
        truncateFileName: false,
    },
    idling: {
        daysUnused: [],
    },
    clipboard: {
        templates: copiedAnnotationsTemplates,
    },
    stubs: DEFAULT_STUBS_CONFIGURATION(),
    llm: DEFAULT_LLM_CONFIGURATION(),
    mcp: DEFAULT_MCP_SETTINGS(),
    prompts: DEFAULT_PROMPT_SETTINGS(),
    smartConnections: DEFAULT_SMART_CONNECTIONS_SETTINGS,
    providers: DEFAULT_PROVIDERS_SETTINGS,
    diagnostics: {
        llm: { status: 'untested', lastTested: null },
        mcp: { status: 'untested', lastTested: null },
        smartConnections: { status: 'untested', lastTested: null },
        obsidianGit: { status: 'untested', lastTested: null },
        dataview: { status: 'untested', lastTested: null },
    },
    cardSegmentation: DEFAULT_CARD_SEGMENTATION_SETTINGS,
    milestones: DEFAULT_MILESTONE_SETTINGS,
    timeTravel: DEFAULT_TIME_TRAVEL_SETTINGS,
});
