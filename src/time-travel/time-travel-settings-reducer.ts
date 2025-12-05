/**
 * Time Travel Settings Reducer
 *
 * Handles state updates for Time Travel feature settings.
 */

import type {
    TimeTravelSettings,
    SnapshotGranularity,
    CloseBehavior,
    TabTitleComponent,
    TabTitleComponentConfig,
} from './time-travel-types';

// =============================================================================
// ACTIONS
// =============================================================================

export type TimeTravelSettingsActions =
    | { type: 'TIME_TRAVEL_SET_ENABLED'; payload: { enabled: boolean } }
    | { type: 'TIME_TRAVEL_SET_GRANULARITY'; payload: { granularity: SnapshotGranularity } }
    | { type: 'TIME_TRAVEL_SET_MAX_SNAPSHOTS'; payload: { maxSnapshots: number } }
    | { type: 'TIME_TRAVEL_SET_AUTO_OPEN'; payload: { autoOpen: boolean } }
    | { type: 'TIME_TRAVEL_SET_USE_STACKED_TABS'; payload: { useStackedTabs: boolean } }
    | { type: 'TIME_TRAVEL_SET_FOCUS_MODE'; payload: { focusMode: boolean } }
    | { type: 'TIME_TRAVEL_SET_CLOSE_BEHAVIOR'; payload: { closeBehavior: CloseBehavior } }
    | { type: 'TIME_TRAVEL_SET_USE_CUSTOM_TAB_TITLE'; payload: { useCustomTabTitle: boolean } }
    | { type: 'TIME_TRAVEL_SET_TAB_COMPONENT_ENABLED'; payload: { componentType: TabTitleComponent; enabled: boolean } }
    | { type: 'TIME_TRAVEL_REORDER_TAB_COMPONENTS'; payload: { components: TabTitleComponentConfig[] } }
    | { type: 'TIME_TRAVEL_SET_CUSTOM_PROPERTY_KEYS'; payload: { customPropertyKeys: string } };

// =============================================================================
// REDUCER
// =============================================================================

export function timeTravelSettingsReducer(
    state: TimeTravelSettings,
    action: TimeTravelSettingsActions,
): TimeTravelSettings {
    switch (action.type) {
        case 'TIME_TRAVEL_SET_ENABLED':
            return { ...state, enabled: action.payload.enabled };

        case 'TIME_TRAVEL_SET_GRANULARITY':
            return { ...state, granularity: action.payload.granularity };

        case 'TIME_TRAVEL_SET_MAX_SNAPSHOTS':
            return { ...state, maxSnapshots: action.payload.maxSnapshots };

        case 'TIME_TRAVEL_SET_AUTO_OPEN':
            return { ...state, autoOpen: action.payload.autoOpen };

        case 'TIME_TRAVEL_SET_USE_STACKED_TABS':
            return { ...state, useStackedTabs: action.payload.useStackedTabs };

        case 'TIME_TRAVEL_SET_FOCUS_MODE':
            return { ...state, focusMode: action.payload.focusMode };

        case 'TIME_TRAVEL_SET_CLOSE_BEHAVIOR':
            return { ...state, closeBehavior: action.payload.closeBehavior };

        case 'TIME_TRAVEL_SET_USE_CUSTOM_TAB_TITLE':
            return { ...state, useCustomTabTitle: action.payload.useCustomTabTitle };

        case 'TIME_TRAVEL_SET_TAB_COMPONENT_ENABLED': {
            const { componentType, enabled } = action.payload;
            const updatedComponents = state.tabTitleComponents.map((comp) =>
                comp.type === componentType ? { ...comp, enabled } : comp,
            );
            return { ...state, tabTitleComponents: updatedComponents };
        }

        case 'TIME_TRAVEL_REORDER_TAB_COMPONENTS':
            return { ...state, tabTitleComponents: action.payload.components };

        case 'TIME_TRAVEL_SET_CUSTOM_PROPERTY_KEYS':
            return { ...state, customPropertyKeys: action.payload.customPropertyKeys };

        default:
            return state;
    }
}
