/**
 * Model Fetch Service
 *
 * Fetches available models from LLM provider APIs and manages caching.
 */

import { requestUrl } from 'obsidian';
import type {
    LLMProvider,
    ModelInfo,
    CachedModels,
    CachedProviderModels,
} from './llm-types';
import { DEFAULT_MODELS } from './llm-types';

// =============================================================================
// PROVIDER API ENDPOINTS
// =============================================================================

const PROVIDER_ENDPOINTS = {
    anthropic: 'https://api.anthropic.com/v1/models',
    openai: 'https://api.openai.com/v1/models',
    gemini: 'https://generativelanguage.googleapis.com/v1/models',
} as const;

// =============================================================================
// MODEL FILTERS (only include relevant chat/completion models)
// =============================================================================

/**
 * Filter patterns for each provider to include only relevant models
 */
const MODEL_FILTERS: Record<LLMProvider, (id: string) => boolean> = {
    anthropic: (id) =>
        id.startsWith('claude-') &&
        !id.includes('embed') &&
        !id.includes('instant'),
    openai: (id) =>
        (id.startsWith('gpt-4') || id.startsWith('gpt-3.5') || id.startsWith('o1') || id.startsWith('o3')) &&
        !id.includes('vision') &&
        !id.includes('instruct') &&
        !id.includes('audio'),
    gemini: (id) =>
        id.includes('gemini') &&
        !id.includes('embed') &&
        !id.includes('vision') &&
        (id.includes('generateContent') || !id.includes('/')),
};

/**
 * Recommended model IDs per provider
 */
const RECOMMENDED_MODELS: Record<LLMProvider, string[]> = {
    anthropic: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet', 'claude-3-opus'],
    openai: ['gpt-4o', 'gpt-4-turbo', 'o1'],
    gemini: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-2.0-pro'],
};

// =============================================================================
// FETCH FUNCTIONS
// =============================================================================

/**
 * Fetch models from Anthropic API
 */
async function fetchAnthropicModels(apiKey: string): Promise<ModelInfo[]> {
    const response = await requestUrl({
        url: PROVIDER_ENDPOINTS.anthropic,
        method: 'GET',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
        },
    });

    if (response.status !== 200) {
        throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = response.json;
    const models: ModelInfo[] = [];

    // Anthropic returns { data: [{ id, display_name, ... }] }
    if (data?.data && Array.isArray(data.data)) {
        for (const model of data.data) {
            if (MODEL_FILTERS.anthropic(model.id)) {
                models.push({
                    id: model.id,
                    name: model.display_name || formatModelName(model.id),
                    recommended: RECOMMENDED_MODELS.anthropic.some(r => model.id.includes(r)),
                });
            }
        }
    }

    // Sort: recommended first, then alphabetically
    return sortModels(models);
}

/**
 * Fetch models from OpenAI API
 */
async function fetchOpenAIModels(apiKey: string): Promise<ModelInfo[]> {
    const response = await requestUrl({
        url: PROVIDER_ENDPOINTS.openai,
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
    });

    if (response.status !== 200) {
        throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = response.json;
    const models: ModelInfo[] = [];

    // OpenAI returns { data: [{ id, ... }] }
    if (data?.data && Array.isArray(data.data)) {
        for (const model of data.data) {
            if (MODEL_FILTERS.openai(model.id)) {
                models.push({
                    id: model.id,
                    name: formatModelName(model.id),
                    recommended: RECOMMENDED_MODELS.openai.some(r => model.id.startsWith(r)),
                });
            }
        }
    }

    return sortModels(models);
}

/**
 * Fetch models from Google Gemini API
 */
async function fetchGeminiModels(apiKey: string): Promise<ModelInfo[]> {
    const response = await requestUrl({
        url: `${PROVIDER_ENDPOINTS.gemini}?key=${apiKey}`,
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    if (response.status !== 200) {
        throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = response.json;
    const models: ModelInfo[] = [];

    // Gemini returns { models: [{ name, displayName, supportedGenerationMethods }] }
    if (data?.models && Array.isArray(data.models)) {
        for (const model of data.models) {
            // Only include models that support generateContent
            const supportsChat = model.supportedGenerationMethods?.includes('generateContent');
            if (!supportsChat) continue;

            // Extract model ID from name (e.g., "models/gemini-1.5-pro" -> "gemini-1.5-pro")
            const id = model.name?.replace('models/', '') || model.name;

            if (MODEL_FILTERS.gemini(id)) {
                models.push({
                    id,
                    name: model.displayName || formatModelName(id),
                    recommended: RECOMMENDED_MODELS.gemini.some(r => id.includes(r)),
                });
            }
        }
    }

    return sortModels(models);
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Format model ID into human-readable name
 */
function formatModelName(id: string): string {
    return id
        .replace(/-/g, ' ')
        .replace(/(\d{4})(\d{2})(\d{2})/, '') // Remove date suffixes
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Sort models: recommended first, then by name
 */
function sortModels(models: ModelInfo[]): ModelInfo[] {
    return models.sort((a, b) => {
        if (a.recommended && !b.recommended) return -1;
        if (!a.recommended && b.recommended) return 1;
        return a.name.localeCompare(b.name);
    });
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Fetch models for a specific provider
 */
export async function fetchModelsForProvider(
    provider: LLMProvider,
    apiKey: string,
): Promise<ModelInfo[]> {
    if (!apiKey) {
        console.warn(`[Model Fetch] No API key for ${provider}, using defaults`);
        return DEFAULT_MODELS[provider];
    }

    try {
        console.log(`[Model Fetch] Fetching models from ${provider}...`);

        let models: ModelInfo[];
        switch (provider) {
            case 'anthropic':
                models = await fetchAnthropicModels(apiKey);
                break;
            case 'openai':
                models = await fetchOpenAIModels(apiKey);
                break;
            case 'gemini':
                models = await fetchGeminiModels(apiKey);
                break;
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }

        console.log(`[Model Fetch] Found ${models.length} models for ${provider}`);

        // If no models found, fall back to defaults
        if (models.length === 0) {
            console.warn(`[Model Fetch] No models returned for ${provider}, using defaults`);
            return DEFAULT_MODELS[provider];
        }

        return models;
    } catch (error) {
        console.error(`[Model Fetch] Error fetching ${provider} models:`, error);
        return DEFAULT_MODELS[provider];
    }
}

/**
 * Refresh cached models for a provider
 */
export async function refreshCachedModels(
    provider: LLMProvider,
    apiKey: string,
    currentCache?: CachedModels,
): Promise<CachedModels> {
    const models = await fetchModelsForProvider(provider, apiKey);

    const updatedCache: CachedModels = {
        ...currentCache,
        [provider]: {
            models,
            fetchedAt: Date.now(),
        } as CachedProviderModels,
    };

    return updatedCache;
}

/**
 * Get models for a provider (from cache or defaults)
 */
export function getModelsForProvider(
    provider: LLMProvider,
    cachedModels?: CachedModels,
): ModelInfo[] {
    const cached = cachedModels?.[provider];
    if (cached && cached.models.length > 0) {
        return cached.models;
    }
    return DEFAULT_MODELS[provider];
}

/**
 * Check if cache exists and is recent (within 24 hours)
 */
export function isCacheValid(
    provider: LLMProvider,
    cachedModels?: CachedModels,
): boolean {
    const cached = cachedModels?.[provider];
    if (!cached) return false;

    const ONE_DAY = 24 * 60 * 60 * 1000;
    return Date.now() - cached.fetchedAt < ONE_DAY;
}

/**
 * Refresh all providers with valid API keys
 */
export async function refreshAllCachedModels(
    apiKeys: Record<LLMProvider, string>,
    currentCache?: CachedModels,
): Promise<CachedModels> {
    let cache = { ...currentCache };

    for (const provider of ['anthropic', 'openai', 'gemini'] as LLMProvider[]) {
        const apiKey = apiKeys[provider];
        if (apiKey) {
            cache = await refreshCachedModels(provider, apiKey, cache);
        }
    }

    cache.sessionRefreshed = true;
    return cache;
}
