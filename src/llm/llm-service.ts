/**
 * LLM Module - Service
 *
 * Main service for making API calls to LLM providers (Anthropic, OpenAI).
 * Now supports schema-driven prompts with creativity modes and reference verification.
 */

import { requestUrl, RequestUrlParam } from 'obsidian';
import type {
    LLMConfiguration,
    LLMError,
    LLMSuggestionResponse,
    RequestHistoryEntry,
    DocumentContext,
} from './llm-types';
import { ERROR_MESSAGES } from './llm-types';
import {
    DEFAULT_SYSTEM_PROMPT,
    buildUserPrompt,
    validateLLMResponse,
    estimateTokens,
    getSortedStubTypesForPrompt,
    getConfiguredTypeKeys,
    SchemaPromptBuilder,
    buildCombinedPrompts,
} from './llm-prompts';
import type { StubsConfiguration } from '../stubs/stubs-types';
import type { DocumentState, CreativityModeId } from '../schema/schema-types';
import { SchemaLoader } from '../schema/schema-loader';
import { ReferenceVerifier, extractReferences, VerifiedReference } from './reference-verification';
import { suggestCreativityMode, getEffectiveTemperature, getEffectiveToolPolicy } from './creativity-modes';

// =============================================================================
// LLM SERVICE CLASS
// =============================================================================

export class LLMService {
    private config: LLMConfiguration;
    private stubsConfig: StubsConfiguration;
    private requestHistory: RequestHistoryEntry[] = [];
    private schemaLoader: SchemaLoader | null = null;
    private referenceVerifier: ReferenceVerifier = new ReferenceVerifier();

    constructor(config: LLMConfiguration, stubsConfig: StubsConfiguration) {
        this.config = config;
        this.stubsConfig = stubsConfig;
    }

    /**
     * Update configuration
     */
    updateConfig(config: LLMConfiguration, stubsConfig: StubsConfiguration): void {
        this.config = config;
        this.stubsConfig = stubsConfig;
    }

    /**
     * Set schema loader for schema-driven prompts
     */
    setSchemaLoader(schemaLoader: SchemaLoader): void {
        this.schemaLoader = schemaLoader;
    }

    /**
     * Get the current schema loader
     */
    getSchemaLoader(): SchemaLoader | null {
        return this.schemaLoader;
    }

    /**
     * Get the reference verifier
     */
    getReferenceVerifier(): ReferenceVerifier {
        return this.referenceVerifier;
    }

    /**
     * Analyze a document for stub suggestions
     */
    async analyzeDocument(context: DocumentContext): Promise<LLMSuggestionResponse> {
        // Validate configuration
        if (!this.config.enabled) {
            throw this.createError('no_api_key', 'LLM features are not enabled');
        }

        if (!this.config.apiKey) {
            throw this.createError('no_api_key');
        }

        // Build prompts
        const stubTypes = getSortedStubTypesForPrompt(this.stubsConfig);
        const systemPrompt = DEFAULT_SYSTEM_PROMPT;
        const userPrompt = buildUserPrompt(context, stubTypes);

        // Estimate tokens
        const inputTokenEstimate = estimateTokens(systemPrompt + userPrompt);

        // Log request if debug enabled
        this.logDebug('info', `Analyzing document: ${context.path}`);
        this.logDebug('debug', `Input token estimate: ${inputTokenEstimate}`);

        // Create history entry
        const historyEntry: RequestHistoryEntry = {
            id: this.generateId(),
            timestamp: new Date(),
            documentPath: context.path,
            provider: this.config.provider,
            model: this.config.model,
            request: {
                systemPrompt,
                userPrompt,
                tokenEstimate: inputTokenEstimate,
            },
        };

        // Dry run mode - return mock response
        if (this.config.debug.dryRunMode) {
            this.logDebug('info', 'Dry run mode - returning mock response');
            this.addToHistory(historyEntry);
            return this.createDryRunResponse();
        }

        // Make API call
        const startTime = Date.now();

        try {
            // Use configured temperature for legacy analyzeDocument method
            const response = await this.callProvider(systemPrompt, userPrompt, this.config.temperature);
            const duration = Date.now() - startTime;

            // Parse and validate response
            const configuredTypes = getConfiguredTypeKeys(this.stubsConfig);
            const parsed = validateLLMResponse(response, configuredTypes);

            // Update history entry with response
            historyEntry.response = {
                raw: JSON.stringify(response),
                parsed,
                duration,
            };
            this.addToHistory(historyEntry);

            this.logDebug('info', `Analysis complete: ${parsed.suggested_stubs.length} suggestions in ${duration}ms`);

            return parsed;
        } catch (error) {
            const duration = Date.now() - startTime;
            const llmError = this.handleError(error);

            // Update history entry with error
            historyEntry.error = llmError;
            historyEntry.response = { raw: '', parsed: { analysis_summary: '', suggested_stubs: [], references: [], confidence: 0 }, duration };
            this.addToHistory(historyEntry);

            this.logDebug('error', `Analysis failed: ${llmError.message}`);
            throw llmError;
        }
    }

    /**
     * Analyze document using schema-driven prompts with creativity mode
     * This is the preferred method when schema loader is available.
     */
    async analyzeDocumentWithSchema(
        context: DocumentContext,
        documentState: DocumentState,
        options?: {
            creativityMode?: CreativityModeId;
            externalContext?: string;
        }
    ): Promise<LLMSuggestionResponse & { verifiedReferences?: VerifiedReference[] }> {
        // Validate configuration
        if (!this.config.enabled) {
            throw this.createError('no_api_key', 'LLM features are not enabled');
        }

        if (!this.config.apiKey) {
            throw this.createError('no_api_key');
        }

        // Clear previous reference verification state
        this.referenceVerifier.clear();

        // Determine creativity mode
        const creativityMode = options?.creativityMode || suggestCreativityMode(documentState);
        const effectiveTemp = getEffectiveTemperature(creativityMode, this.config.temperature);
        const toolPolicy = getEffectiveToolPolicy(creativityMode);

        // Build prompts
        let systemPrompt: string;
        let userPrompt: string;

        if (this.schemaLoader) {
            // Use schema-driven prompts
            const builder = new SchemaPromptBuilder(this.schemaLoader);
            const prompts = builder.buildPrompts(documentState, 'Analyze this document for editorial gaps.', {
                creativityMode,
                externalContext: options?.externalContext,
            });
            systemPrompt = prompts.systemPrompt;
            userPrompt = prompts.userPrompt + `\n\n---\n\n## Document Content\n\n\`\`\`markdown\n${context.content}\n\`\`\``;
        } else {
            // Fall back to legacy prompts
            const stubTypes = getSortedStubTypesForPrompt(this.stubsConfig);
            systemPrompt = DEFAULT_SYSTEM_PROMPT;
            userPrompt = buildUserPrompt(context, stubTypes);
        }

        // Estimate tokens
        const inputTokenEstimate = estimateTokens(systemPrompt + userPrompt);

        // Log request
        this.logDebug('info', `Schema analysis for: ${context.path} (mode: ${creativityMode}, temp: ${effectiveTemp})`);
        this.logDebug('debug', `Tool policy: ${toolPolicy}, input tokens: ${inputTokenEstimate}`);

        // Create history entry
        const historyEntry: RequestHistoryEntry = {
            id: this.generateId(),
            timestamp: new Date(),
            documentPath: context.path,
            provider: this.config.provider,
            model: this.config.model,
            request: {
                systemPrompt,
                userPrompt,
                tokenEstimate: inputTokenEstimate,
            },
        };

        // Dry run mode
        if (this.config.debug.dryRunMode) {
            this.logDebug('info', 'Dry run mode - returning mock response');
            this.addToHistory(historyEntry);
            return this.createDryRunResponse();
        }

        const startTime = Date.now();

        try {
            // Pass effective temperature directly to avoid mutating shared config
            const response = await this.callProvider(systemPrompt, userPrompt, effectiveTemp);

            const duration = Date.now() - startTime;

            // Parse and validate response
            const configuredTypes = getConfiguredTypeKeys(this.stubsConfig);
            const parsed = validateLLMResponse(response, configuredTypes);

            // Extract and verify references
            const responseText = JSON.stringify(response);
            const foundRefs = extractReferences(responseText);
            const verifiedRefs = this.referenceVerifier.verifyAll(foundRefs);

            // Update history entry
            historyEntry.response = {
                raw: responseText,
                parsed,
                duration,
            };
            this.addToHistory(historyEntry);

            this.logDebug('info', `Schema analysis complete: ${parsed.suggested_stubs.length} suggestions, ${verifiedRefs.filter(r => r.verified).length}/${verifiedRefs.length} refs verified`);

            return {
                ...parsed,
                verifiedReferences: verifiedRefs,
            };
        } catch (error) {
            const duration = Date.now() - startTime;
            const llmError = this.handleError(error);

            historyEntry.error = llmError;
            historyEntry.response = { raw: '', parsed: { analysis_summary: '', suggested_stubs: [], references: [], confidence: 0 }, duration };
            this.addToHistory(historyEntry);

            this.logDebug('error', `Schema analysis failed: ${llmError.message}`);
            throw llmError;
        }
    }

    /**
     * Get suggested creativity mode for a document
     */
    getSuggestedCreativityMode(documentState: DocumentState): CreativityModeId {
        return suggestCreativityMode(documentState);
    }

    /**
     * Record a tool call for reference verification
     */
    recordToolCall(tool: string, args: Record<string, unknown>, results: Array<{
        title?: string;
        url?: string;
        doi?: string;
        vaultPath?: string;
        snippet?: string;
        score?: number;
    }>): void {
        this.referenceVerifier.recordToolCall(tool, args, results);
    }

    /**
     * Get request history for debugging
     */
    getRequestHistory(): RequestHistoryEntry[] {
        return [...this.requestHistory];
    }

    /**
     * Clear request history
     */
    clearHistory(): void {
        this.requestHistory = [];
    }

    /**
     * Test API connection
     */
    async testConnection(): Promise<{ success: boolean; message: string }> {
        if (!this.config.apiKey) {
            return { success: false, message: 'No API key configured' };
        }

        try {
            // Simple test request - use raw call methods
            if (this.config.provider === 'anthropic') {
                await this.testCallAnthropic();
            } else if (this.config.provider === 'gemini') {
                await this.testCallGemini();
            } else {
                await this.testCallOpenAI();
            }

            return { success: true, message: 'Connection successful' };
        } catch (error) {
            const llmError = this.handleError(error);
            return { success: false, message: llmError.message };
        }
    }

    /**
     * Simple test call to Anthropic (no JSON parsing)
     */
    private async testCallAnthropic(): Promise<void> {
        const requestParams: RequestUrlParam = {
            url: 'https://api.anthropic.com/v1/messages',
            method: 'POST',
            headers: {
                'x-api-key': this.config.apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                model: this.config.model,
                max_tokens: 50,
                messages: [{ role: 'user', content: 'Say "ok"' }],
            }),
            throw: false,
        };

        const response = await requestUrl(requestParams);

        if (response.status !== 200) {
            throw this.createProviderError(response.status, response.json);
        }
    }

    /**
     * Simple test call to OpenAI (no JSON parsing)
     */
    private async testCallOpenAI(): Promise<void> {
        const requestParams: RequestUrlParam = {
            url: 'https://api.openai.com/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.config.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this.config.model,
                max_tokens: 50,
                messages: [{ role: 'user', content: 'Say "ok"' }],
            }),
            throw: false,
        };

        const response = await requestUrl(requestParams);

        if (response.status !== 200) {
            throw this.createProviderError(response.status, response.json);
        }
    }

    /**
     * Simple test call to Google Gemini (no JSON parsing)
     */
    private async testCallGemini(): Promise<void> {
        const model = this.config.model || 'gemini-1.5-flash';
        const requestParams: RequestUrlParam = {
            url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.config.apiKey}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: 'Say "ok"' }],
                }],
                generationConfig: {
                    maxOutputTokens: 50,
                },
            }),
            throw: false,
        };

        const response = await requestUrl(requestParams);

        if (response.status !== 200) {
            throw this.createProviderError(response.status, response.json);
        }
    }

    // =========================================================================
    // PROVIDER-SPECIFIC IMPLEMENTATIONS
    // =========================================================================

    private async callProvider(systemPrompt: string, userPrompt: string, temperature: number): Promise<unknown> {
        if (this.config.provider === 'anthropic') {
            return this.callAnthropic(systemPrompt, userPrompt, temperature);
        } else if (this.config.provider === 'gemini') {
            return this.callGemini(systemPrompt, userPrompt, temperature);
        } else {
            return this.callOpenAI(systemPrompt, userPrompt, temperature);
        }
    }

    /**
     * Call Anthropic API
     */
    private async callAnthropic(systemPrompt: string, userPrompt: string, temperature: number): Promise<unknown> {
        const requestParams: RequestUrlParam = {
            url: 'https://api.anthropic.com/v1/messages',
            method: 'POST',
            headers: {
                'x-api-key': this.config.apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                model: this.config.model,
                max_tokens: this.config.maxTokens,
                temperature,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }],
            }),
            throw: false,
        };

        this.logDebug('debug', 'Calling Anthropic API...');

        const response = await requestUrl(requestParams);

        if (response.status !== 200) {
            this.logDebug('error', `Anthropic API error: ${response.status}`, response.json);
            throw this.createProviderError(response.status, response.json);
        }

        // Extract content from Anthropic response
        const data = response.json;
        if (!data.content || !Array.isArray(data.content) || data.content.length === 0) {
            throw this.createError('invalid_response', 'Empty response from Anthropic');
        }

        const textContent = data.content.find((c: { type: string }) => c.type === 'text');
        if (!textContent || !textContent.text) {
            throw this.createError('invalid_response', 'No text content in Anthropic response');
        }

        // Parse JSON from response
        return this.parseJSONResponse(textContent.text);
    }

    /**
     * Call OpenAI API
     */
    private async callOpenAI(systemPrompt: string, userPrompt: string, temperature: number): Promise<unknown> {
        const requestParams: RequestUrlParam = {
            url: 'https://api.openai.com/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.config.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this.config.model,
                max_tokens: this.config.maxTokens,
                temperature,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
            }),
            throw: false,
        };

        this.logDebug('debug', 'Calling OpenAI API...');

        const response = await requestUrl(requestParams);

        if (response.status !== 200) {
            this.logDebug('error', `OpenAI API error: ${response.status}`, response.json);
            throw this.createProviderError(response.status, response.json);
        }

        // Extract content from OpenAI response
        const data = response.json;
        if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
            throw this.createError('invalid_response', 'Empty response from OpenAI');
        }

        const message = data.choices[0].message;
        if (!message || !message.content) {
            throw this.createError('invalid_response', 'No content in OpenAI response');
        }

        // Parse JSON from response
        return this.parseJSONResponse(message.content);
    }

    /**
     * Call Google Gemini API
     */
    private async callGemini(systemPrompt: string, userPrompt: string, temperature: number): Promise<unknown> {
        const model = this.config.model || 'gemini-1.5-flash';
        const requestParams: RequestUrlParam = {
            url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.config.apiKey}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
                }],
                generationConfig: {
                    maxOutputTokens: this.config.maxTokens,
                    temperature,
                    responseMimeType: 'application/json',
                },
            }),
            throw: false,
        };

        this.logDebug('debug', 'Calling Gemini API...');

        const response = await requestUrl(requestParams);

        if (response.status !== 200) {
            this.logDebug('error', `Gemini API error: ${response.status}`, response.json);
            throw this.createProviderError(response.status, response.json);
        }

        // Extract content from Gemini response
        const data = response.json;
        if (!data.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) {
            throw this.createError('invalid_response', 'Empty response from Gemini');
        }

        const content = data.candidates[0]?.content;
        if (!content || !content.parts || !Array.isArray(content.parts) || content.parts.length === 0) {
            throw this.createError('invalid_response', 'No content in Gemini response');
        }

        const textPart = content.parts.find((p: { text?: string }) => p.text);
        if (!textPart || !textPart.text) {
            throw this.createError('invalid_response', 'No text in Gemini response');
        }

        // Parse JSON from response
        return this.parseJSONResponse(textPart.text);
    }

    // =========================================================================
    // STREAMING METHODS
    // =========================================================================

    /**
     * Analyze document with streaming (shows text as it arrives)
     */
    async analyzeDocumentStreaming(
        context: DocumentContext,
        onChunk: (chunk: string, fullText: string) => void,
    ): Promise<LLMSuggestionResponse> {
        // Validate configuration
        if (!this.config.enabled) {
            throw this.createError('no_api_key', 'LLM features are not enabled');
        }

        if (!this.config.apiKey) {
            throw this.createError('no_api_key');
        }

        // Build prompts
        const stubTypes = getSortedStubTypesForPrompt(this.stubsConfig);
        const systemPrompt = DEFAULT_SYSTEM_PROMPT;
        const userPrompt = buildUserPrompt(context, stubTypes);

        this.logDebug('info', `Streaming analysis for: ${context.path}`);

        // Dry run mode
        if (this.config.debug.dryRunMode) {
            // Simulate streaming
            const mockText = 'Analyzing document structure... Checking for gaps... Identifying references...';
            for (let i = 0; i < mockText.length; i += 5) {
                onChunk(mockText.slice(i, i + 5), mockText.slice(0, i + 5));
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            return this.createDryRunResponse();
        }

        try {
            if (this.config.provider === 'anthropic') {
                return await this.callAnthropicStreaming(systemPrompt, userPrompt, onChunk);
            } else if (this.config.provider === 'gemini') {
                return await this.callGeminiStreaming(systemPrompt, userPrompt, onChunk);
            } else {
                return await this.callOpenAIStreaming(systemPrompt, userPrompt, onChunk);
            }
        } catch (error) {
            throw this.handleError(error);
        }
    }

    /**
     * Call Anthropic API with streaming simulation
     * Note: Uses requestUrl (no CORS issues) and simulates streaming by chunking the response
     */
    private async callAnthropicStreaming(
        systemPrompt: string,
        userPrompt: string,
        onChunk: (chunk: string, fullText: string) => void,
    ): Promise<LLMSuggestionResponse> {
        // Show initial progress
        onChunk('Sending request to Anthropic...', 'Sending request to Anthropic...');

        const requestParams: RequestUrlParam = {
            url: 'https://api.anthropic.com/v1/messages',
            method: 'POST',
            headers: {
                'x-api-key': this.config.apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                model: this.config.model,
                max_tokens: this.config.maxTokens,
                temperature: this.config.temperature,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }],
            }),
            throw: false,
        };

        const response = await requestUrl(requestParams);

        if (response.status !== 200) {
            this.logDebug('error', `Anthropic API error: ${response.status}`, response.json);
            throw this.createProviderError(response.status, response.json);
        }

        // Extract content from Anthropic response
        const data = response.json;
        if (!data.content || !Array.isArray(data.content) || data.content.length === 0) {
            throw this.createError('invalid_response', 'Empty response from Anthropic');
        }

        const textContent = data.content.find((c: { type: string }) => c.type === 'text');
        if (!textContent || !textContent.text) {
            throw this.createError('invalid_response', 'No text content in Anthropic response');
        }

        const fullText = textContent.text;

        // Simulate streaming by showing the response progressively
        await this.simulateStreaming(fullText, onChunk);

        // Parse final JSON
        const configuredTypes = getConfiguredTypeKeys(this.stubsConfig);
        return validateLLMResponse(this.parseJSONResponse(fullText), configuredTypes);
    }

    /**
     * Call OpenAI API with streaming simulation
     * Note: Uses requestUrl (no CORS issues) and simulates streaming by chunking the response
     */
    private async callOpenAIStreaming(
        systemPrompt: string,
        userPrompt: string,
        onChunk: (chunk: string, fullText: string) => void,
    ): Promise<LLMSuggestionResponse> {
        // Show initial progress
        onChunk('Sending request to OpenAI...', 'Sending request to OpenAI...');

        const requestParams: RequestUrlParam = {
            url: 'https://api.openai.com/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.config.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this.config.model,
                max_tokens: this.config.maxTokens,
                temperature: this.config.temperature,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
            }),
            throw: false,
        };

        const response = await requestUrl(requestParams);

        if (response.status !== 200) {
            this.logDebug('error', `OpenAI API error: ${response.status}`, response.json);
            throw this.createProviderError(response.status, response.json);
        }

        // Extract content from OpenAI response
        const data = response.json;
        if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
            throw this.createError('invalid_response', 'Empty response from OpenAI');
        }

        const message = data.choices[0].message;
        if (!message || !message.content) {
            throw this.createError('invalid_response', 'No content in OpenAI response');
        }

        const fullText = message.content;

        // Simulate streaming by showing the response progressively
        await this.simulateStreaming(fullText, onChunk);

        // Parse final JSON
        const configuredTypes = getConfiguredTypeKeys(this.stubsConfig);
        return validateLLMResponse(this.parseJSONResponse(fullText), configuredTypes);
    }

    /**
     * Call Google Gemini API with streaming simulation
     * Note: Uses requestUrl (no CORS issues) and simulates streaming by chunking the response
     */
    private async callGeminiStreaming(
        systemPrompt: string,
        userPrompt: string,
        onChunk: (chunk: string, fullText: string) => void,
    ): Promise<LLMSuggestionResponse> {
        // Show initial progress
        onChunk('Sending request to Gemini...', 'Sending request to Gemini...');

        const model = this.config.model || 'gemini-1.5-flash';
        const requestParams: RequestUrlParam = {
            url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.config.apiKey}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
                }],
                generationConfig: {
                    maxOutputTokens: this.config.maxTokens,
                    temperature: this.config.temperature,
                    responseMimeType: 'application/json',
                },
            }),
            throw: false,
        };

        const response = await requestUrl(requestParams);

        if (response.status !== 200) {
            this.logDebug('error', `Gemini API error: ${response.status}`, response.json);
            throw this.createProviderError(response.status, response.json);
        }

        // Extract content from Gemini response
        const data = response.json;
        if (!data.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) {
            throw this.createError('invalid_response', 'Empty response from Gemini');
        }

        const content = data.candidates[0]?.content;
        if (!content || !content.parts || !Array.isArray(content.parts) || content.parts.length === 0) {
            throw this.createError('invalid_response', 'No content in Gemini response');
        }

        const textPart = content.parts.find((p: { text?: string }) => p.text);
        if (!textPart || !textPart.text) {
            throw this.createError('invalid_response', 'No text in Gemini response');
        }

        const fullText = textPart.text;

        // Simulate streaming by showing the response progressively
        await this.simulateStreaming(fullText, onChunk);

        // Parse final JSON
        const configuredTypes = getConfiguredTypeKeys(this.stubsConfig);
        return validateLLMResponse(this.parseJSONResponse(fullText), configuredTypes);
    }

    /**
     * Simulate streaming by showing text progressively
     */
    private async simulateStreaming(
        text: string,
        onChunk: (chunk: string, fullText: string) => void,
    ): Promise<void> {
        const chunkSize = 50; // characters per chunk
        const delay = 10; // ms between chunks

        for (let i = 0; i < text.length; i += chunkSize) {
            const chunk = text.slice(i, i + chunkSize);
            const fullSoFar = text.slice(0, i + chunkSize);
            onChunk(chunk, fullSoFar);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    /**
     * Parse JSON from LLM response text
     */
    private parseJSONResponse(text: string): unknown {
        // Try to extract JSON from response (may be wrapped in markdown code fences)
        let jsonText = text.trim();

        // Remove markdown code fences if present
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.slice(7);
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.slice(3);
        }
        if (jsonText.endsWith('```')) {
            jsonText = jsonText.slice(0, -3);
        }

        jsonText = jsonText.trim();

        try {
            return JSON.parse(jsonText);
        } catch (e) {
            this.logDebug('error', 'Failed to parse JSON response', jsonText);
            throw this.createError('invalid_response', 'Failed to parse JSON from LLM response');
        }
    }

    /**
     * Create provider-specific error from HTTP response
     */
    private createProviderError(status: number, data: unknown): LLMError {
        if (status === 401) {
            return this.createError('invalid_api_key');
        }
        if (status === 429) {
            return this.createError('rate_limited');
        }
        if (status === 400) {
            // Check for context length errors
            const dataObj = data as Record<string, Record<string, unknown>> | null;
            const message = String(dataObj?.error?.message || '');
            if (message.includes('context') || message.includes('token')) {
                return this.createError('context_too_long');
            }
        }

        return this.createError('provider_error', `HTTP ${status}: ${JSON.stringify(data)}`);
    }

    /**
     * Handle and categorize errors
     */
    private handleError(error: unknown): LLMError {
        if (this.isLLMError(error)) {
            return error;
        }

        if (error instanceof Error) {
            if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
                return this.createError('timeout', error.message, error);
            }
            if (error.message.includes('network') || error.message.includes('ENOTFOUND')) {
                return this.createError('network_error', error.message, error);
            }
            return this.createError('unknown', error.message, error);
        }

        return this.createError('unknown', String(error));
    }

    /**
     * Create an LLM error
     */
    private createError(type: LLMError['type'], customMessage?: string, originalError?: Error): LLMError {
        const template = ERROR_MESSAGES[type];
        return {
            ...template,
            message: customMessage || template.message,
            originalError,
        };
    }

    /**
     * Type guard for LLM error
     */
    private isLLMError(error: unknown): error is LLMError {
        return (
            typeof error === 'object' &&
            error !== null &&
            'type' in error &&
            'message' in error &&
            'retryable' in error
        );
    }

    /**
     * Create dry run mock response
     */
    private createDryRunResponse(): LLMSuggestionResponse {
        return {
            analysis_summary: '[DRY RUN] This is a mock response. No API call was made.',
            suggested_stubs: [
                {
                    type: 'expand',
                    description: '[DRY RUN] Example suggestion - expand this section',
                    stub_form: 'transient',
                    priority: 'low',
                    location: { section: 'Example Section', context: 'Example context', lineNumber: 10 },
                    rationale: 'This is a mock suggestion for dry run mode',
                },
            ],
            references: [
                {
                    type: 'vault',
                    title: '[DRY RUN] Example vault reference',
                    target: '[[Example Note]]',
                    context: 'This is a mock reference for dry run mode',
                },
                {
                    type: 'web',
                    title: '[DRY RUN] Example web reference',
                    target: 'https://example.com',
                    context: 'This is a mock web reference',
                },
            ],
            confidence: 0.5,
        };
    }

    /**
     * Add entry to request history
     */
    private addToHistory(entry: RequestHistoryEntry): void {
        this.requestHistory.unshift(entry);

        // Trim history to configured size
        const maxSize = this.config.debug.historySize;
        if (this.requestHistory.length > maxSize) {
            this.requestHistory = this.requestHistory.slice(0, maxSize);
        }
    }

    /**
     * Log debug message
     */
    private logDebug(level: 'error' | 'warn' | 'info' | 'debug', message: string, data?: unknown): void {
        if (!this.config.debug.enabled) return;

        const levels = ['error', 'warn', 'info', 'debug'];
        const configLevel = levels.indexOf(this.config.debug.logLevel);
        const messageLevel = levels.indexOf(level);

        if (messageLevel > configLevel) return;

        const prefix = '[Doc Doctor LLM]';

        switch (level) {
            case 'error':
                console.error(prefix, message, data ?? '');
                break;
            case 'warn':
                console.warn(prefix, message, data ?? '');
                break;
            case 'info':
                console.info(prefix, message, data ?? '');
                break;
            case 'debug':
                console.log(prefix, message, data ?? '');
                break;
        }
    }

    /**
     * Generate unique ID
     */
    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let llmServiceInstance: LLMService | null = null;

/**
 * Get or create LLM service instance
 */
export function getLLMService(
    config: LLMConfiguration,
    stubsConfig: StubsConfiguration,
): LLMService {
    if (!llmServiceInstance) {
        llmServiceInstance = new LLMService(config, stubsConfig);
    } else {
        llmServiceInstance.updateConfig(config, stubsConfig);
    }
    return llmServiceInstance;
}

/**
 * Reset LLM service instance (for testing)
 */
export function resetLLMService(): void {
    llmServiceInstance = null;
}
