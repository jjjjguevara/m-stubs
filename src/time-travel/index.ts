/**
 * Time Travel Module Exports
 */

export type {
    DocumentSnapshot,
    TimeTravelSettings,
    SnapshotGranularity,
    TimeTravelViewState,
    SnapshotSelectionResult,
    TimeTravelContext,
} from './time-travel-types';

export {
    DEFAULT_TIME_TRAVEL_SETTINGS,
    toDocumentSnapshot,
} from './time-travel-types';

export {
    TIME_TRAVEL_VIEW_TYPE,
    TimeTravelView,
    createTimeTravelView,
} from './time-travel-view';

export {
    registerTimeTravelCommands,
    closeAllTimeTravelTabs,
} from './time-travel-commands';

export type { TimeTravelSettingsActions } from './time-travel-settings-reducer';
export { timeTravelSettingsReducer } from './time-travel-settings-reducer';
