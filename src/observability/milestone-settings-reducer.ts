/**
 * Milestone Settings Reducer
 *
 * Handles state updates for milestone settings.
 */

import type { MilestoneSettings, UserMilestoneConfig } from './milestone-settings';

// =============================================================================
// ACTIONS
// =============================================================================

export type MilestoneSettingsActions =
    | { type: 'MILESTONE_SET_ENABLED'; payload: { enabled: boolean } }
    | { type: 'MILESTONE_SET_GIT_ENABLED'; payload: { enabled: boolean } }
    | { type: 'MILESTONE_SET_GIT_BRANCH'; payload: { branch: string } }
    | { type: 'MILESTONE_SET_GIT_AUTO_PULL'; payload: { autoPull: boolean } }
    | { type: 'MILESTONE_SET_GIT_SIGN_COMMITS'; payload: { signCommits: boolean } }
    | { type: 'MILESTONE_SET_QA_ENABLED'; payload: { enabled: boolean } }
    | { type: 'MILESTONE_SET_QA_VERBOSITY'; payload: { verbosity: 'minimal' | 'standard' | 'verbose' } }
    | { type: 'MILESTONE_ADD_USER_MILESTONE'; payload: { milestone: UserMilestoneConfig } }
    | { type: 'MILESTONE_UPDATE_USER_MILESTONE'; payload: { id: string; updates: Partial<UserMilestoneConfig> } }
    | { type: 'MILESTONE_DELETE_USER_MILESTONE'; payload: { id: string } }
    | { type: 'MILESTONE_TOGGLE_USER_MILESTONE'; payload: { id: string; enabled: boolean } };

// =============================================================================
// REDUCER
// =============================================================================

export function milestoneSettingsReducer(
    state: MilestoneSettings,
    action: MilestoneSettingsActions,
): MilestoneSettings {
    switch (action.type) {
        case 'MILESTONE_SET_ENABLED':
            return { ...state, enabled: action.payload.enabled };

        case 'MILESTONE_SET_GIT_ENABLED':
            return { ...state, git: { ...state.git, enabled: action.payload.enabled } };

        case 'MILESTONE_SET_GIT_BRANCH':
            return { ...state, git: { ...state.git, defaultBranch: action.payload.branch } };

        case 'MILESTONE_SET_GIT_AUTO_PULL':
            return { ...state, git: { ...state.git, autoPull: action.payload.autoPull } };

        case 'MILESTONE_SET_GIT_SIGN_COMMITS':
            return { ...state, git: { ...state.git, signCommits: action.payload.signCommits } };

        case 'MILESTONE_SET_QA_ENABLED':
            return { ...state, qaEnabled: action.payload.enabled };

        case 'MILESTONE_SET_QA_VERBOSITY':
            return { ...state, qaVerbosity: action.payload.verbosity };

        case 'MILESTONE_ADD_USER_MILESTONE':
            return {
                ...state,
                userMilestones: [...state.userMilestones, action.payload.milestone],
            };

        case 'MILESTONE_UPDATE_USER_MILESTONE':
            return {
                ...state,
                userMilestones: state.userMilestones.map((m) =>
                    m.id === action.payload.id ? { ...m, ...action.payload.updates } : m,
                ),
            };

        case 'MILESTONE_DELETE_USER_MILESTONE':
            return {
                ...state,
                userMilestones: state.userMilestones.filter((m) => m.id !== action.payload.id),
            };

        case 'MILESTONE_TOGGLE_USER_MILESTONE':
            return {
                ...state,
                userMilestones: state.userMilestones.map((m) =>
                    m.id === action.payload.id ? { ...m, enabled: action.payload.enabled } : m,
                ),
            };

        default:
            return state;
    }
}
