import {
    Case,
    CommentFormat,
    DefaultFolderMode,
    DefaultPalette,
    DiagnosticStatus,
    FontFamily,
    FontWeight,
    NotesNamingMode,
    Opacity,
    Settings,
    SidebarViewMode,
    StyleScope,
} from './settings-type';
import { getDefaultColor } from './helpers/get-default-color';
import { isValidLabel } from '../editor-suggest/helpers/is-valid-label';
import { formattedDate } from '../helpers/date-utils';
import { DAYS_UNUSED } from './settings-selectors';
import { ClipboardTemplateSection } from '../clipboard/helpers/annotations-to-text';
import { StubsSettingsActions, stubsSettingsReducer } from '../stubs/stubs-settings-reducer';
import { LLMSettingsActions, llmSettingsReducer } from '../llm/llm-settings-reducer';
import { MCPSettingsActions, mcpSettingsReducer } from '../mcp/mcp-settings-reducer';
import { PromptsSettingsActions, promptsSettingsReducer } from '../llm/prompts-settings-reducer';
import { SmartConnectionsSettingsActions, smartConnectionsSettingsReducer } from '../smart-connections/settings-reducer';
import { ProvidersSettingsActions, providersSettingsReducer } from '../llm/providers';
import { CARD_PRESETS, type CardPreset, type CardRegion } from '../shared/types/segmented-card-types';

export type SettingsActions =
    | {
          type: 'SET_PATTERN';
          payload: {
              id: string;
              pattern: string;
          };
      }
    | {
          type: 'SET_COLOR';
          payload: {
              id: string;
              color: string;
          };
      }
    | {
          type: 'DELETE_GROUP';
          payload: {
              id: string;
          };
      }
    | {
          type: 'NEW_GROUP';
          payload: {
              pattern: string;
          };
      }
    | { type: 'ENABLE_AUTO_SUGGEST'; payload: { enable: boolean } }
    | { type: 'SET_AUTO_SUGGEST_TRIGGER'; payload: { trigger: string } }
    | { type: 'ENABLE_AUTO_REGISTER_LABELS'; payload: { enable: boolean } }
    | {
          type: 'ENABLE_LABEL_STYLES';
          payload: { id: string; enable: boolean };
      }
    | {
          type: 'SET_LABEL_UNDERLINE';
          payload: {
              id: string;
              underline: boolean;
          };
      }
    | { type: 'SET_TAG_FONT_WEIGHT'; payload: { weight?: FontWeight } }
    | { type: 'SET_TAG_FONT_FAMILY'; payload: { family?: FontFamily } }
    | { type: 'SET_TAG_FONT_SIZE'; payload: { fontSize?: number } }
    | { type: 'SET_TAG_OPACITY'; payload: { opacity?: Opacity } }
    | { type: 'ENABLE_TAG_STYLES'; payload: { enable: boolean } }
    | {
          type: 'SET_LABEL_FONT_WEIGHT';
          payload: {
              id: string;
              weight?: FontWeight;
          };
      }
    | {
          type: 'SET_LABEL_FONT_FAMILY';
          payload: {
              id: string;
              family?: FontFamily;
          };
      }
    | {
          type: 'SET_LABEL_FONT_OPACITY';
          payload: {
              id: string;
              opacity?: Opacity;
          };
      }
    | {
          type: 'SET_LABEL_FONT_SIZE';
          payload: {
              id: string;
              fontSize?: number;
          };
      }
    | {
          type: 'SET_LABEL_ITALIC';
          payload: {
              id: string;
              italic: boolean;
          };
      }
    | {
          type: 'SET_LABEL_CASE';
          payload: {
              id: string;
              case?: Case;
          };
      }
    | {
          type: 'SET_LABEL_SCOPE';
          payload: {
              id: string;
              scope?: StyleScope;
          };
      }
    | { type: 'SET_TTS_VOLUME'; payload: { volume: number } }
    | { type: 'SET_TTS_RATE'; payload: { rate: number } }
    | { type: 'SET_TTS_PITCH'; payload: { pitch: number } }
    | { type: 'SET_TTS_VOICE'; payload: { voice: string } }
    | { type: 'SET_TTS_FOCUS_COMMENT_IN_EDITOR'; payload: { enable: boolean } }
    | { type: 'SET_NOTES_FOLDER'; payload: { folder: string } }
    | { type: 'SET_NOTES_FOLDER_MODE'; payload: { mode: DefaultFolderMode } }
    | { type: 'SET_NOTES_TEMPLATE'; payload: { template: string } }
    | { type: 'SET_NOTES_NAMING_MODE'; payload: { folder: NotesNamingMode } }
    | { type: 'SET_NOTES_OPEN_AFTER_CREATION'; payload: { open: boolean } }
    | { type: 'SET_NOTES_INSERT_LINK_TO_NOTE'; payload: { insert: boolean } }
    | {
          type: 'SET_AUTO_SUGGEST_COMMENT_TYPE';
          payload: { type: CommentFormat };
      }
    | { type: 'LOG_PLUGIN_USED' }
    | { type: 'LOG_PLUGIN_STARTED' }
    | {
          type: 'SET_CLIPBOARD_TEMPLATE';
          payload: { template: string; name: ClipboardTemplateSection };
      }
    | {
          type: 'TOGGLE_TRUNCATE_FILE_NAME';
      }
    | { type: 'SET_DEFAULT_PALETTE'; payload: { palette: DefaultPalette } }
    | { type: 'SET_SIDEBAR_VIEW_MODE'; payload: { mode: SidebarViewMode } }
    // Feature toggles
    | { type: 'SET_FEATURE_ANNOTATIONS'; payload: { enabled: boolean } }
    | { type: 'SET_FEATURE_STUBS'; payload: { enabled: boolean } }
    | { type: 'SET_FEATURE_AI'; payload: { enabled: boolean } }
    | { type: 'SET_FEATURE_EXPLORE'; payload: { enabled: boolean } }
    // Diagnostic actions
    | { type: 'SET_DIAGNOSTIC_LLM'; payload: { status: DiagnosticStatus; message?: string } }
    | { type: 'SET_DIAGNOSTIC_MCP'; payload: { status: DiagnosticStatus; message?: string; version?: string } }
    | { type: 'SET_DIAGNOSTIC_SMART_CONNECTIONS'; payload: { status: DiagnosticStatus; message?: string } }
    | { type: 'SET_DIAGNOSTIC_OBSIDIAN_GIT'; payload: { status: DiagnosticStatus; message?: string; version?: string } }
    | { type: 'SET_DIAGNOSTIC_DATAVIEW'; payload: { status: DiagnosticStatus; message?: string; version?: string } }
    // Card segmentation actions
    | { type: 'SET_CARD_SEGMENTATION_ENABLED'; payload: { enabled: boolean } }
    | { type: 'SET_CARD_SEGMENTATION_SHOW_LABELS'; payload: { showLabels: boolean } }
    | { type: 'SET_CARD_SEGMENTATION_SHOW_SEPARATORS'; payload: { showSeparators: boolean } }
    | { type: 'SET_CARD_SEGMENTATION_PRESET'; payload: { preset: CardPreset } }
    | { type: 'SET_CARD_REGION_COMMAND'; payload: { regionIndex: number; commandId: string; preset: CardPreset } }
    | { type: 'SET_CARD_CUSTOM_REGIONS'; payload: { regions: CardRegion[] } }
    | StubsSettingsActions
    | LLMSettingsActions
    | MCPSettingsActions
    | PromptsSettingsActions
    | SmartConnectionsSettingsActions
    | ProvidersSettingsActions;

const updateState = (store: Settings, action: SettingsActions) => {
    const labels = store.decoration.styles.labels;
    const tag = store.decoration.styles.tag;
    if (action.type === 'SET_PATTERN') {
        if (!action.payload.pattern || isValidLabel(action.payload.pattern))
            labels[action.payload.id].label = action.payload.pattern;
    } else if (action.type === 'SET_COLOR') {
        labels[action.payload.id].style.color = action.payload.color;
    } else if (action.type === 'DELETE_GROUP') {
        delete labels[action.payload.id];
    } else if (action.type === 'NEW_GROUP') {
        if (!action.payload.pattern || isValidLabel(action.payload.pattern)) {
            const id = String(Date.now());
            labels[id] = {
                label: action.payload.pattern,
                id,
                enableStyle: true,
                style: {
                    color: getDefaultColor(store),
                    italic: true,
                    fontWeight: 'thin',
                },
            };
        }
    } else if (action.type === 'ENABLE_AUTO_SUGGEST') {
        store.editorSuggest.enableAutoSuggest = action.payload.enable;
    } else if (action.type === 'SET_AUTO_SUGGEST_TRIGGER') {
        if (action.payload.trigger)
            store.editorSuggest.triggerPhrase = action.payload.trigger;
    } else if (action.type === 'ENABLE_AUTO_REGISTER_LABELS')
        store.decoration.autoRegisterLabels = action.payload.enable;
    else if (action.type === 'ENABLE_LABEL_STYLES')
        labels[action.payload.id].enableStyle = action.payload.enable;
    else if (action.type === 'SET_LABEL_UNDERLINE')
        labels[action.payload.id].style.underline = action.payload.underline;
    else if (action.type === 'SET_LABEL_FONT_WEIGHT')
        labels[action.payload.id].style.fontWeight = action.payload.weight;
    else if (action.type === 'SET_LABEL_SCOPE')
        labels[action.payload.id].style.scope = action.payload.scope;
    else if (action.type === 'SET_LABEL_FONT_OPACITY')
        labels[action.payload.id].style.opacity = action.payload.opacity;
    else if (action.type === 'SET_LABEL_FONT_FAMILY')
        labels[action.payload.id].style.fontFamily = action.payload.family;
    else if (action.type === 'SET_LABEL_FONT_SIZE')
        labels[action.payload.id].style.fontSize = action.payload.fontSize;
    else if (action.type === 'SET_LABEL_ITALIC')
        labels[action.payload.id].style.italic = action.payload.italic;
    else if (action.type === 'SET_LABEL_CASE')
        labels[action.payload.id].style.case = action.payload.case;
    else if (action.type === 'SET_TTS_PITCH')
        store.tts.pitch = action.payload.pitch;
    else if (action.type === 'SET_TTS_RATE')
        store.tts.rate = action.payload.rate;
    else if (action.type === 'SET_TTS_VOLUME')
        store.tts.volume = action.payload.volume;
    else if (action.type === 'SET_TTS_VOICE')
        store.tts.voice = action.payload.voice;
    else if (action.type === 'SET_NOTES_FOLDER')
        store.notes.defaultFolder = action.payload.folder;
    else if (action.type === 'SET_NOTES_FOLDER_MODE')
        store.notes.defaultFolderMode = action.payload.mode;
    else if (action.type === 'SET_NOTES_NAMING_MODE')
        store.notes.notesNamingMode = action.payload.folder;
    else if (action.type === 'SET_NOTES_OPEN_AFTER_CREATION')
        store.notes.openNoteAfterCreation = action.payload.open;
    else if (action.type === 'SET_AUTO_SUGGEST_COMMENT_TYPE')
        store.editorSuggest.commentFormat = action.payload.type;
    else if (action.type === 'SET_NOTES_INSERT_LINK_TO_NOTE')
        store.notes.insertLinkToNote = action.payload.insert;
    else if (action.type === 'SET_NOTES_TEMPLATE')
        store.notes.template = action.payload.template;
    else if (action.type === 'ENABLE_TAG_STYLES')
        tag.enableStyle = action.payload.enable;
    else if (action.type === 'SET_TAG_FONT_FAMILY')
        tag.style.fontFamily = action.payload.family;
    else if (action.type === 'SET_TAG_FONT_SIZE')
        tag.style.fontSize = action.payload.fontSize;
    else if (action.type === 'SET_TAG_FONT_WEIGHT')
        tag.style.fontWeight = action.payload.weight;
    else if (action.type === 'SET_TAG_OPACITY')
        tag.style.opacity = action.payload.opacity;
    else if (action.type === 'SET_TTS_FOCUS_COMMENT_IN_EDITOR')
        store.tts.focusAnnotationInEditor = action.payload.enable;
    else if (action.type === 'LOG_PLUGIN_USED') {
        store.idling.daysUnused = [];
    } else if (action.type === 'LOG_PLUGIN_STARTED') {
        const isIdle = store.idling.daysUnused.length > DAYS_UNUSED;
        if (!isIdle) {
            const date = formattedDate();
            const daysUnused = store.idling.daysUnused.sort();
            if (!daysUnused.includes(date)) {
                daysUnused.push(date);
                store.idling.daysUnused = daysUnused;
            }
        }
    } else if (action.type === 'SET_CLIPBOARD_TEMPLATE') {
        const { template, name } = action.payload;
        store.clipboard.templates[name] = template;
    } else if (action.type === 'TOGGLE_TRUNCATE_FILE_NAME') {
        store.notes.truncateFileName = !store.notes.truncateFileName;
    } else if (action.type === 'SET_DEFAULT_PALETTE') {
        store.decoration.defaultPalette = action.payload.palette;
    } else if (action.type === 'SET_SIDEBAR_VIEW_MODE') {
        store.outline.sidebarViewMode = action.payload.mode;
    } else if (action.type === 'SET_FEATURE_ANNOTATIONS') {
        store.features.annotations = action.payload.enabled;
    } else if (action.type === 'SET_FEATURE_STUBS') {
        store.features.stubs = action.payload.enabled;
    } else if (action.type === 'SET_FEATURE_AI') {
        store.features.ai = action.payload.enabled;
    } else if (action.type === 'SET_FEATURE_EXPLORE') {
        store.features.explore = action.payload.enabled;
    } else if (action.type === 'SET_DIAGNOSTIC_LLM') {
        if (!store.diagnostics) {
            store.diagnostics = {
                llm: { status: 'untested', lastTested: null },
                mcp: { status: 'untested', lastTested: null },
                smartConnections: { status: 'untested', lastTested: null },
                obsidianGit: { status: 'untested', lastTested: null },
                dataview: { status: 'untested', lastTested: null },
            };
        }
        store.diagnostics.llm = {
            status: action.payload.status,
            lastTested: action.payload.status !== 'testing' ? Date.now() : store.diagnostics.llm.lastTested,
            message: action.payload.message,
        };
    } else if (action.type === 'SET_DIAGNOSTIC_MCP') {
        if (!store.diagnostics) {
            store.diagnostics = {
                llm: { status: 'untested', lastTested: null },
                mcp: { status: 'untested', lastTested: null },
                smartConnections: { status: 'untested', lastTested: null },
                obsidianGit: { status: 'untested', lastTested: null },
                dataview: { status: 'untested', lastTested: null },
            };
        }
        store.diagnostics.mcp = {
            status: action.payload.status,
            lastTested: action.payload.status !== 'testing' ? Date.now() : store.diagnostics.mcp.lastTested,
            message: action.payload.message,
            version: action.payload.version || store.diagnostics.mcp.version,
        };
    } else if (action.type === 'SET_DIAGNOSTIC_SMART_CONNECTIONS') {
        if (!store.diagnostics) {
            store.diagnostics = {
                llm: { status: 'untested', lastTested: null },
                mcp: { status: 'untested', lastTested: null },
                smartConnections: { status: 'untested', lastTested: null },
                obsidianGit: { status: 'untested', lastTested: null },
                dataview: { status: 'untested', lastTested: null },
            };
        }
        store.diagnostics.smartConnections = {
            status: action.payload.status,
            lastTested: action.payload.status !== 'testing' ? Date.now() : store.diagnostics.smartConnections.lastTested,
            message: action.payload.message,
        };
    } else if (action.type === 'SET_DIAGNOSTIC_OBSIDIAN_GIT') {
        if (!store.diagnostics) {
            store.diagnostics = {
                llm: { status: 'untested', lastTested: null },
                mcp: { status: 'untested', lastTested: null },
                smartConnections: { status: 'untested', lastTested: null },
                obsidianGit: { status: 'untested', lastTested: null },
                dataview: { status: 'untested', lastTested: null },
            };
        }
        store.diagnostics.obsidianGit = {
            status: action.payload.status,
            lastTested: action.payload.status !== 'testing' ? Date.now() : store.diagnostics.obsidianGit.lastTested,
            message: action.payload.message,
            version: action.payload.version || store.diagnostics.obsidianGit.version,
        };
    } else if (action.type === 'SET_DIAGNOSTIC_DATAVIEW') {
        if (!store.diagnostics) {
            store.diagnostics = {
                llm: { status: 'untested', lastTested: null },
                mcp: { status: 'untested', lastTested: null },
                smartConnections: { status: 'untested', lastTested: null },
                obsidianGit: { status: 'untested', lastTested: null },
                dataview: { status: 'untested', lastTested: null },
            };
        }
        store.diagnostics.dataview = {
            status: action.payload.status,
            lastTested: action.payload.status !== 'testing' ? Date.now() : store.diagnostics.dataview.lastTested,
            message: action.payload.message,
            version: action.payload.version || store.diagnostics.dataview.version,
        };
    } else if (action.type === 'SET_CARD_SEGMENTATION_ENABLED') {
        store.cardSegmentation.enabled = action.payload.enabled;
    } else if (action.type === 'SET_CARD_SEGMENTATION_SHOW_LABELS') {
        store.cardSegmentation.showLabelsOnHover = action.payload.showLabels;
    } else if (action.type === 'SET_CARD_SEGMENTATION_SHOW_SEPARATORS') {
        store.cardSegmentation.showSeparators = action.payload.showSeparators;
    } else if (action.type === 'SET_CARD_SEGMENTATION_PRESET') {
        store.cardSegmentation.defaultPreset = action.payload.preset;
        // When switching to a non-custom preset, copy regions to customRegions for reference
        if (action.payload.preset !== 'custom') {
            store.cardSegmentation.customRegions = [...CARD_PRESETS[action.payload.preset]];
        }
    } else if (action.type === 'SET_CARD_REGION_COMMAND') {
        const { regionIndex, commandId, preset } = action.payload;
        // Update the command ID in the current regions
        if (preset === 'custom') {
            if (store.cardSegmentation.customRegions[regionIndex]) {
                store.cardSegmentation.customRegions[regionIndex].commandId = commandId;
            }
        } else {
            // For presets, we need to copy to customRegions to preserve customizations
            if (!store.cardSegmentation.customRegions.length) {
                store.cardSegmentation.customRegions = [...CARD_PRESETS[preset]];
            }
            if (store.cardSegmentation.customRegions[regionIndex]) {
                store.cardSegmentation.customRegions[regionIndex].commandId = commandId;
            }
        }
    } else if (action.type === 'SET_CARD_CUSTOM_REGIONS') {
        store.cardSegmentation.customRegions = action.payload.regions;
    } else if (action.type.startsWith('STUBS_')) {
        // Delegate stubs actions to stubs reducer
        stubsSettingsReducer(store.stubs, action as StubsSettingsActions);
    } else if (action.type.startsWith('LLM_')) {
        // Delegate LLM actions to LLM reducer
        llmSettingsReducer(store.llm, action as LLMSettingsActions);
    } else if (action.type.startsWith('MCP_')) {
        // Delegate MCP actions to MCP reducer
        mcpSettingsReducer(store.mcp, action as MCPSettingsActions);
    } else if (action.type.startsWith('PROMPTS_')) {
        // Delegate prompts actions to prompts reducer
        promptsSettingsReducer(store.prompts, action as PromptsSettingsActions);
    } else if (action.type.startsWith('SET_SMART_CONNECTIONS_')) {
        // Delegate Smart Connections actions to smart connections reducer
        smartConnectionsSettingsReducer(store.smartConnections, action as SmartConnectionsSettingsActions);
    } else if (action.type.startsWith('PROVIDERS_')) {
        // Delegate providers actions to providers reducer
        providersSettingsReducer(store.providers, action as ProvidersSettingsActions);
    }
};
export const settingsReducer = (
    store: Settings,
    action: SettingsActions,
): Settings => {
    updateState(store, action);
    return store;
};
