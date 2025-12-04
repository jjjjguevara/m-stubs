/**
 * Providers Module Index
 *
 * Re-exports all provider-related types, services, and utilities.
 */

// Types
export * from './provider-types';

// Services
export { OpenAlexService, formatAcademicResults, extractDoisFromContent } from './openalex-service';
export {
    WebSearchService,
    formatWebSearchResults,
    extractSearchQueries,
    type WebSearchResult,
    type WebSearchResponse,
} from './web-search-service';
export {
    ExternalContextService,
    getExternalContextService,
    resetExternalContextService,
    type ExternalContextResult,
    type ScrapedUrlContent,
    type RelatedNote,
} from './external-context-service';

// Settings
export {
    providersSettingsReducer,
    DEFAULT_PROVIDERS_SETTINGS,
    getActiveWebSearchConfig,
    type ProvidersSettings,
    type ProvidersSettingsActions,
} from './providers-settings-reducer';
