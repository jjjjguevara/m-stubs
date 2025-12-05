/**
 * Error Handling Tests
 *
 * Tests for LLM error scenarios: timeouts, rate limits, malformed responses,
 * network failures, and graceful degradation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
    LLMError,
    LLMErrorType,
    LLMSuggestionResponse,
} from '../../src/llm/llm-types';
import { ERROR_MESSAGES } from '../../src/llm/llm-types';

// =============================================================================
// ERROR HANDLING UTILITIES (to be tested and potentially moved to src/)
// =============================================================================

interface ParsedAPIError {
    type: LLMErrorType;
    message: string;
    retryable: boolean;
    retryAfterMs?: number;
}

/**
 * Parse error responses from different LLM providers
 */
function parseProviderError(
    provider: 'anthropic' | 'openai' | 'gemini',
    statusCode: number,
    responseBody: unknown,
): ParsedAPIError {
    // Rate limit errors
    if (statusCode === 429) {
        const body = responseBody as Record<string, unknown>;
        let retryAfterMs: number | undefined;

        // Parse retry-after from different provider formats
        if (provider === 'anthropic' && body?.error) {
            const error = body.error as Record<string, unknown>;
            if (error.type === 'rate_limit_error') {
                // Anthropic sometimes includes retry time in message
                const match = String(error.message || '').match(/try again in (\d+)/i);
                if (match) retryAfterMs = parseInt(match[1], 10) * 1000;
            }
        } else if (provider === 'openai' && body?.error) {
            // OpenAI may include retry_after header
            retryAfterMs = 60000; // Default 60s for OpenAI
        } else if (provider === 'gemini') {
            retryAfterMs = 60000; // Default 60s for Gemini
        }

        return {
            type: 'rate_limited',
            message: 'Rate limit exceeded',
            retryable: true,
            retryAfterMs: retryAfterMs || 60000,
        };
    }

    // Authentication errors
    if (statusCode === 401 || statusCode === 403) {
        return {
            type: 'invalid_api_key',
            message: 'API key is invalid or expired',
            retryable: false,
        };
    }

    // Context length errors
    if (statusCode === 400) {
        const body = responseBody as Record<string, unknown>;
        const errorMessage = String(
            (body?.error as Record<string, unknown>)?.message || body?.message || ''
        ).toLowerCase();

        if (
            errorMessage.includes('context') ||
            errorMessage.includes('token') ||
            errorMessage.includes('too long')
        ) {
            return {
                type: 'context_too_long',
                message: 'Document too long for analysis',
                retryable: false,
            };
        }
    }

    // Server errors
    if (statusCode >= 500) {
        return {
            type: 'provider_error',
            message: `Provider returned status ${statusCode}`,
            retryable: true,
        };
    }

    // Not found (model doesn't exist)
    if (statusCode === 404) {
        return {
            type: 'provider_error',
            message: 'Model not found or unavailable',
            retryable: false,
        };
    }

    // Default error
    return {
        type: 'unknown',
        message: `Unexpected error: ${statusCode}`,
        retryable: false,
    };
}

/**
 * Determine if an error is retryable and calculate backoff
 */
function calculateRetryStrategy(
    error: ParsedAPIError,
    attemptNumber: number,
    maxAttempts: number = 3,
): { shouldRetry: boolean; delayMs: number } {
    if (!error.retryable || attemptNumber >= maxAttempts) {
        return { shouldRetry: false, delayMs: 0 };
    }

    // Use retry-after if available
    if (error.retryAfterMs) {
        return { shouldRetry: true, delayMs: error.retryAfterMs };
    }

    // Exponential backoff: 1s, 2s, 4s, 8s...
    const baseDelay = 1000;
    const delayMs = baseDelay * Math.pow(2, attemptNumber - 1);

    return { shouldRetry: true, delayMs: Math.min(delayMs, 30000) }; // Cap at 30s
}

/**
 * Extract JSON from potentially wrapped LLM response
 */
function extractJSONFromResponse(rawResponse: string): string {
    // Try to extract JSON from markdown code block
    const codeBlockMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
        return codeBlockMatch[1].trim();
    }

    // Try to find JSON object directly
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        return jsonMatch[0];
    }

    // Return as-is if no extraction needed
    return rawResponse.trim();
}

/**
 * Create LLMError from various error types
 */
function createLLMError(
    type: LLMErrorType,
    originalError?: Error,
    customMessage?: string,
): LLMError {
    const baseError = ERROR_MESSAGES[type];
    return {
        ...baseError,
        message: customMessage || baseError.message,
        originalError,
    };
}

// =============================================================================
// TEST FIXTURES
// =============================================================================

const MOCK_VALID_RESPONSE: LLMSuggestionResponse = {
    analysis_summary: 'Test analysis',
    suggested_stubs: [],
    references: [],
    confidence: 0.8,
};

// =============================================================================
// TESTS: PROVIDER ERROR PARSING
// =============================================================================

describe('Error Handling - Provider Error Parsing', () => {
    describe('Rate Limit Errors', () => {
        it('should parse Anthropic rate limit error', () => {
            const error = parseProviderError('anthropic', 429, {
                error: {
                    type: 'rate_limit_error',
                    message: 'Rate limit exceeded. Please try again in 30 seconds.',
                },
            });
            expect(error.type).toBe('rate_limited');
            expect(error.retryable).toBe(true);
            expect(error.retryAfterMs).toBe(30000);
        });

        it('should parse OpenAI rate limit error', () => {
            const error = parseProviderError('openai', 429, {
                error: {
                    message: 'Rate limit reached',
                    type: 'rate_limit_exceeded',
                },
            });
            expect(error.type).toBe('rate_limited');
            expect(error.retryable).toBe(true);
        });

        it('should parse Gemini rate limit error', () => {
            const error = parseProviderError('gemini', 429, {
                error: { message: 'RESOURCE_EXHAUSTED' },
            });
            expect(error.type).toBe('rate_limited');
            expect(error.retryable).toBe(true);
        });
    });

    describe('Authentication Errors', () => {
        it('should parse 401 as invalid API key', () => {
            const error = parseProviderError('anthropic', 401, {
                error: { message: 'Invalid API key' },
            });
            expect(error.type).toBe('invalid_api_key');
            expect(error.retryable).toBe(false);
        });

        it('should parse 403 as invalid API key', () => {
            const error = parseProviderError('openai', 403, {
                error: { message: 'Access denied' },
            });
            expect(error.type).toBe('invalid_api_key');
            expect(error.retryable).toBe(false);
        });
    });

    describe('Context Length Errors', () => {
        it('should parse context length error from Anthropic', () => {
            const error = parseProviderError('anthropic', 400, {
                error: {
                    message: 'prompt is too long: 150000 tokens > 100000 maximum',
                },
            });
            expect(error.type).toBe('context_too_long');
            expect(error.retryable).toBe(false);
        });

        it('should parse context length error from OpenAI', () => {
            const error = parseProviderError('openai', 400, {
                error: {
                    message: "This model's maximum context length is 128000 tokens",
                },
            });
            expect(error.type).toBe('context_too_long');
            expect(error.retryable).toBe(false);
        });

        it('should parse token limit error', () => {
            const error = parseProviderError('gemini', 400, {
                error: { message: 'Token count exceeds limit' },
            });
            expect(error.type).toBe('context_too_long');
            expect(error.retryable).toBe(false);
        });
    });

    describe('Server Errors', () => {
        it('should parse 500 as provider error', () => {
            const error = parseProviderError('anthropic', 500, {
                error: { message: 'Internal server error' },
            });
            expect(error.type).toBe('provider_error');
            expect(error.retryable).toBe(true);
        });

        it('should parse 502 as provider error', () => {
            const error = parseProviderError('openai', 502, {});
            expect(error.type).toBe('provider_error');
            expect(error.retryable).toBe(true);
        });

        it('should parse 503 as provider error', () => {
            const error = parseProviderError('gemini', 503, {
                error: { message: 'Service temporarily unavailable' },
            });
            expect(error.type).toBe('provider_error');
            expect(error.retryable).toBe(true);
        });
    });

    describe('Model Not Found', () => {
        it('should parse 404 as non-retryable provider error', () => {
            const error = parseProviderError('anthropic', 404, {
                error: { message: 'model: claude-nonexistent' },
            });
            expect(error.type).toBe('provider_error');
            expect(error.retryable).toBe(false);
        });
    });
});

// =============================================================================
// TESTS: RETRY STRATEGY
// =============================================================================

describe('Error Handling - Retry Strategy', () => {
    it('should not retry non-retryable errors', () => {
        const error: ParsedAPIError = {
            type: 'invalid_api_key',
            message: 'Invalid key',
            retryable: false,
        };
        const strategy = calculateRetryStrategy(error, 1);
        expect(strategy.shouldRetry).toBe(false);
    });

    it('should respect retry-after header', () => {
        const error: ParsedAPIError = {
            type: 'rate_limited',
            message: 'Rate limited',
            retryable: true,
            retryAfterMs: 45000,
        };
        const strategy = calculateRetryStrategy(error, 1);
        expect(strategy.shouldRetry).toBe(true);
        expect(strategy.delayMs).toBe(45000);
    });

    it('should use exponential backoff without retry-after', () => {
        const error: ParsedAPIError = {
            type: 'provider_error',
            message: 'Server error',
            retryable: true,
        };

        // With maxAttempts=5, attempts 1-4 should retry
        const strategy1 = calculateRetryStrategy(error, 1, 5);
        expect(strategy1.shouldRetry).toBe(true);
        expect(strategy1.delayMs).toBe(1000); // 1s

        const strategy2 = calculateRetryStrategy(error, 2, 5);
        expect(strategy2.shouldRetry).toBe(true);
        expect(strategy2.delayMs).toBe(2000); // 2s

        const strategy3 = calculateRetryStrategy(error, 3, 5);
        expect(strategy3.shouldRetry).toBe(true);
        expect(strategy3.delayMs).toBe(4000); // 4s
    });

    it('should cap backoff at 30 seconds', () => {
        const error: ParsedAPIError = {
            type: 'provider_error',
            message: 'Server error',
            retryable: true,
        };
        // Attempt 6 would be 32s without cap
        const strategy = calculateRetryStrategy(error, 6, 10);
        expect(strategy.delayMs).toBe(30000);
    });

    it('should stop retrying after max attempts', () => {
        const error: ParsedAPIError = {
            type: 'rate_limited',
            message: 'Rate limited',
            retryable: true,
        };
        const strategy = calculateRetryStrategy(error, 3, 3);
        expect(strategy.shouldRetry).toBe(false);
    });
});

// =============================================================================
// TESTS: JSON EXTRACTION
// =============================================================================

describe('Error Handling - JSON Extraction', () => {
    it('should extract JSON from markdown code block', () => {
        const wrapped = '```json\n{"key": "value"}\n```';
        const extracted = extractJSONFromResponse(wrapped);
        expect(extracted).toBe('{"key": "value"}');
    });

    it('should extract JSON from untagged code block', () => {
        const wrapped = '```\n{"key": "value"}\n```';
        const extracted = extractJSONFromResponse(wrapped);
        expect(extracted).toBe('{"key": "value"}');
    });

    it('should extract JSON object from mixed content', () => {
        const mixed = 'Here is the analysis:\n\n{"key": "value"}\n\nEnd of response.';
        const extracted = extractJSONFromResponse(mixed);
        expect(extracted).toBe('{"key": "value"}');
    });

    it('should handle nested JSON objects', () => {
        const nested = '{"outer": {"inner": "value"}}';
        const extracted = extractJSONFromResponse(nested);
        expect(extracted).toBe(nested);
    });

    it('should handle JSON with arrays', () => {
        const withArray = '{"items": [1, 2, 3]}';
        const extracted = extractJSONFromResponse(withArray);
        expect(extracted).toBe(withArray);
    });

    it('should return trimmed input if no JSON found', () => {
        const noJson = '  This is just text  ';
        const extracted = extractJSONFromResponse(noJson);
        expect(extracted).toBe('This is just text');
    });

    it('should handle multiline JSON', () => {
        const multiline = `{
            "key": "value",
            "nested": {
                "deep": true
            }
        }`;
        const extracted = extractJSONFromResponse(multiline);
        expect(JSON.parse(extracted)).toEqual({
            key: 'value',
            nested: { deep: true },
        });
    });
});

// =============================================================================
// TESTS: ERROR CREATION
// =============================================================================

describe('Error Handling - LLMError Creation', () => {
    it('should create error with default message', () => {
        const error = createLLMError('rate_limited');
        expect(error.type).toBe('rate_limited');
        expect(error.message).toBe('Rate limit exceeded');
        expect(error.retryable).toBe(true);
    });

    it('should create error with custom message', () => {
        const error = createLLMError('rate_limited', undefined, 'Custom rate limit message');
        expect(error.message).toBe('Custom rate limit message');
    });

    it('should include original error', () => {
        const originalError = new Error('Network failed');
        const error = createLLMError('network_error', originalError);
        expect(error.originalError).toBe(originalError);
    });

    it('should include suggested action', () => {
        const error = createLLMError('no_api_key');
        expect(error.suggestedAction).toBeDefined();
        expect(error.suggestedAction).toContain('Settings');
    });
});

// =============================================================================
// TESTS: ERROR MESSAGE COMPLETENESS
// =============================================================================

describe('Error Handling - Error Messages', () => {
    const allErrorTypes: LLMErrorType[] = [
        'no_api_key',
        'invalid_api_key',
        'rate_limited',
        'context_too_long',
        'network_error',
        'invalid_response',
        'provider_error',
        'timeout',
        'unknown',
    ];

    it('should have messages for all error types', () => {
        for (const errorType of allErrorTypes) {
            expect(ERROR_MESSAGES[errorType]).toBeDefined();
            expect(ERROR_MESSAGES[errorType].message).toBeTruthy();
        }
    });

    it('should mark retryable errors correctly', () => {
        const retryableTypes: LLMErrorType[] = [
            'rate_limited',
            'network_error',
            'invalid_response',
            'provider_error',
            'timeout',
        ];
        const nonRetryableTypes: LLMErrorType[] = [
            'no_api_key',
            'invalid_api_key',
            'context_too_long',
            'unknown',
        ];

        for (const type of retryableTypes) {
            expect(ERROR_MESSAGES[type].retryable).toBe(true);
        }

        for (const type of nonRetryableTypes) {
            expect(ERROR_MESSAGES[type].retryable).toBe(false);
        }
    });
});

// =============================================================================
// TESTS: TIMEOUT HANDLING
// =============================================================================

describe('Error Handling - Timeout Scenarios', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should handle request timeout', async () => {
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
                reject(createLLMError('timeout'));
            }, 30000);
        });

        const resultPromise = Promise.race([
            timeoutPromise,
            new Promise(resolve => setTimeout(resolve, 60000)),
        ]);

        vi.advanceTimersByTime(30000);

        await expect(resultPromise).rejects.toMatchObject({
            type: 'timeout',
            retryable: true,
        });
    });

    it('should resolve before timeout', async () => {
        const quickResponse = new Promise<string>(resolve => {
            setTimeout(() => resolve('success'), 1000);
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('timeout')), 30000);
        });

        const resultPromise = Promise.race([quickResponse, timeoutPromise]);

        vi.advanceTimersByTime(1000);

        await expect(resultPromise).resolves.toBe('success');
    });
});

// =============================================================================
// TESTS: GRACEFUL DEGRADATION
// =============================================================================

describe('Error Handling - Graceful Degradation', () => {
    function getDefaultResponseOnError(error: LLMError): LLMSuggestionResponse | null {
        // For certain errors, we might want to return a safe default
        if (error.type === 'context_too_long') {
            return {
                analysis_summary: 'Document too long for full analysis. Consider breaking into sections.',
                suggested_stubs: [
                    {
                        type: 'restructure',
                        description: 'Document exceeds analysis limits. Consider splitting into smaller documents.',
                        stub_form: 'transient',
                        location: { lineNumber: 1 },
                        rationale: 'Large documents are harder to analyze comprehensively',
                        priority: 'medium',
                    },
                ],
                references: [],
                confidence: 0.3,
            };
        }
        return null;
    }

    it('should provide fallback for context_too_long error', () => {
        const error = createLLMError('context_too_long');
        const fallback = getDefaultResponseOnError(error);

        expect(fallback).not.toBeNull();
        expect(fallback?.suggested_stubs).toHaveLength(1);
        expect(fallback?.suggested_stubs[0].type).toBe('restructure');
        expect(fallback?.confidence).toBeLessThan(0.5);
    });

    it('should return null for non-degradable errors', () => {
        const error = createLLMError('invalid_api_key');
        const fallback = getDefaultResponseOnError(error);
        expect(fallback).toBeNull();
    });
});

// =============================================================================
// TESTS: NETWORK ERROR SIMULATION
// =============================================================================

describe('Error Handling - Network Errors', () => {
    function simulateNetworkError(errorType: string): ParsedAPIError {
        switch (errorType) {
            case 'ECONNREFUSED':
                return {
                    type: 'network_error',
                    message: 'Connection refused - server may be down',
                    retryable: true,
                };
            case 'ETIMEDOUT':
                return {
                    type: 'timeout',
                    message: 'Connection timed out',
                    retryable: true,
                };
            case 'ENOTFOUND':
                return {
                    type: 'network_error',
                    message: 'DNS lookup failed',
                    retryable: true,
                };
            case 'CERT_ERROR':
                return {
                    type: 'network_error',
                    message: 'SSL certificate error',
                    retryable: false,
                };
            default:
                return {
                    type: 'network_error',
                    message: `Network error: ${errorType}`,
                    retryable: true,
                };
        }
    }

    it('should handle connection refused', () => {
        const error = simulateNetworkError('ECONNREFUSED');
        expect(error.type).toBe('network_error');
        expect(error.retryable).toBe(true);
    });

    it('should handle DNS failure', () => {
        const error = simulateNetworkError('ENOTFOUND');
        expect(error.type).toBe('network_error');
        expect(error.retryable).toBe(true);
    });

    it('should not retry SSL errors', () => {
        const error = simulateNetworkError('CERT_ERROR');
        expect(error.type).toBe('network_error');
        expect(error.retryable).toBe(false);
    });
});
