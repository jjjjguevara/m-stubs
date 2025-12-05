/**
 * Schema Validation Tests
 *
 * Ensures LLM responses are correctly parsed and validated.
 * Critical for production stability - malformed responses should not crash the plugin.
 */

import { describe, it, expect } from 'vitest';
import type {
    LLMSuggestionResponse,
    SuggestedStub,
    FoundReference,
} from '../../src/llm/llm-types';

// =============================================================================
// VALIDATION FUNCTIONS (to be tested and potentially moved to src/)
// =============================================================================

interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

const VALID_STUB_TYPES = [
    'source', 'check', 'link', 'data',
    'fix', 'cut',
    'draft', 'expand', 'idea', 'question',
    'move', 'restructure',
];

const VALID_STUB_FORMS = ['transient', 'persistent', 'blocking'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'];
const VALID_REFERENCE_TYPES = ['vault', 'web', 'citation', 'unknown'];

function validateSuggestedStub(stub: unknown, index: number): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!stub || typeof stub !== 'object') {
        return { valid: false, errors: [`Stub ${index}: not an object`], warnings: [] };
    }

    const s = stub as Record<string, unknown>;

    // Required fields
    if (typeof s.type !== 'string' || !s.type.trim()) {
        errors.push(`Stub ${index}: missing or invalid 'type'`);
    } else if (!VALID_STUB_TYPES.includes(s.type)) {
        warnings.push(`Stub ${index}: unknown type '${s.type}'`);
    }

    if (typeof s.description !== 'string' || !s.description.trim()) {
        errors.push(`Stub ${index}: missing or invalid 'description'`);
    }

    if (typeof s.stub_form !== 'string') {
        errors.push(`Stub ${index}: missing 'stub_form'`);
    } else if (!VALID_STUB_FORMS.includes(s.stub_form)) {
        errors.push(`Stub ${index}: invalid stub_form '${s.stub_form}'`);
    }

    // Location validation
    if (!s.location || typeof s.location !== 'object') {
        errors.push(`Stub ${index}: missing 'location' object`);
    } else {
        const loc = s.location as Record<string, unknown>;
        if (typeof loc.lineNumber !== 'number' || loc.lineNumber < 1) {
            errors.push(`Stub ${index}: invalid or missing 'location.lineNumber'`);
        }
    }

    if (typeof s.rationale !== 'string' || !s.rationale.trim()) {
        errors.push(`Stub ${index}: missing or invalid 'rationale'`);
    }

    // Optional fields
    if (s.priority !== undefined && !VALID_PRIORITIES.includes(s.priority as string)) {
        warnings.push(`Stub ${index}: invalid priority '${s.priority}'`);
    }

    return { valid: errors.length === 0, errors, warnings };
}

function validateFoundReference(ref: unknown, index: number): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!ref || typeof ref !== 'object') {
        return { valid: false, errors: [`Reference ${index}: not an object`], warnings: [] };
    }

    const r = ref as Record<string, unknown>;

    if (typeof r.type !== 'string' || !VALID_REFERENCE_TYPES.includes(r.type)) {
        errors.push(`Reference ${index}: invalid type '${r.type}'`);
    }

    if (typeof r.title !== 'string' || !r.title.trim()) {
        errors.push(`Reference ${index}: missing or invalid 'title'`);
    }

    if (typeof r.target !== 'string' || !r.target.trim()) {
        errors.push(`Reference ${index}: missing or invalid 'target'`);
    }

    return { valid: errors.length === 0, errors, warnings };
}

function validateLLMResponse(response: unknown): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!response || typeof response !== 'object') {
        return { valid: false, errors: ['Response is not an object'], warnings: [] };
    }

    const r = response as Record<string, unknown>;

    // Validate analysis_summary
    if (typeof r.analysis_summary !== 'string') {
        errors.push("Missing or invalid 'analysis_summary'");
    }

    // Validate confidence
    if (typeof r.confidence !== 'number') {
        errors.push("Missing or invalid 'confidence'");
    } else if (r.confidence < 0 || r.confidence > 1) {
        warnings.push(`Confidence ${r.confidence} out of range [0, 1]`);
    }

    // Validate suggested_stubs array
    if (!Array.isArray(r.suggested_stubs)) {
        errors.push("Missing or invalid 'suggested_stubs' array");
    } else {
        for (let i = 0; i < r.suggested_stubs.length; i++) {
            const stubResult = validateSuggestedStub(r.suggested_stubs[i], i);
            errors.push(...stubResult.errors);
            warnings.push(...stubResult.warnings);
        }
    }

    // Validate references array
    if (!Array.isArray(r.references)) {
        errors.push("Missing or invalid 'references' array");
    } else {
        for (let i = 0; i < r.references.length; i++) {
            const refResult = validateFoundReference(r.references[i], i);
            errors.push(...refResult.errors);
            warnings.push(...refResult.warnings);
        }
    }

    return { valid: errors.length === 0, errors, warnings };
}

function parseAndValidateLLMResponse(jsonString: string): {
    response: LLMSuggestionResponse | null;
    validation: ValidationResult;
    parseError: string | null;
} {
    let parsed: unknown;

    try {
        parsed = JSON.parse(jsonString);
    } catch (e) {
        return {
            response: null,
            validation: { valid: false, errors: [], warnings: [] },
            parseError: e instanceof Error ? e.message : 'JSON parse error',
        };
    }

    const validation = validateLLMResponse(parsed);

    return {
        response: validation.valid ? (parsed as LLMSuggestionResponse) : null,
        validation,
        parseError: null,
    };
}

// =============================================================================
// TEST FIXTURES
// =============================================================================

const VALID_RESPONSE: LLMSuggestionResponse = {
    analysis_summary: 'Document has several gaps requiring attention.',
    suggested_stubs: [
        {
            type: 'source',
            description: 'Find citation for efficiency claim',
            stub_form: 'blocking',
            location: { lineNumber: 42 },
            rationale: 'Quantitative claims require verifiable sources',
            priority: 'critical',
        },
        {
            type: 'expand',
            description: 'Elaborate on methodology section',
            stub_form: 'persistent',
            location: { lineNumber: 55, section: 'Methodology' },
            rationale: 'Section is too brief for reader understanding',
            priority: 'medium',
        },
    ],
    references: [
        {
            type: 'web',
            title: 'Related research paper',
            target: 'https://example.com/paper.pdf',
            context: 'Supports methodology claim',
        },
    ],
    confidence: 0.85,
};

// =============================================================================
// TESTS: VALID RESPONSES
// =============================================================================

describe('Schema Validation - Valid Responses', () => {
    it('should accept a fully valid response', () => {
        const result = validateLLMResponse(VALID_RESPONSE);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should accept response with empty stubs array', () => {
        const response = {
            ...VALID_RESPONSE,
            suggested_stubs: [],
        };
        const result = validateLLMResponse(response);
        expect(result.valid).toBe(true);
    });

    it('should accept response with empty references array', () => {
        const response = {
            ...VALID_RESPONSE,
            references: [],
        };
        const result = validateLLMResponse(response);
        expect(result.valid).toBe(true);
    });

    it('should accept all valid stub types', () => {
        for (const stubType of VALID_STUB_TYPES) {
            const response = {
                ...VALID_RESPONSE,
                suggested_stubs: [{
                    type: stubType,
                    description: 'Test',
                    stub_form: 'persistent',
                    location: { lineNumber: 1 },
                    rationale: 'Test rationale',
                }],
            };
            const result = validateLLMResponse(response);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        }
    });

    it('should accept all valid stub forms', () => {
        for (const stubForm of VALID_STUB_FORMS) {
            const response = {
                ...VALID_RESPONSE,
                suggested_stubs: [{
                    type: 'source',
                    description: 'Test',
                    stub_form: stubForm,
                    location: { lineNumber: 1 },
                    rationale: 'Test rationale',
                }],
            };
            const result = validateLLMResponse(response);
            expect(result.valid).toBe(true);
        }
    });

    it('should accept all valid priorities', () => {
        for (const priority of VALID_PRIORITIES) {
            const response = {
                ...VALID_RESPONSE,
                suggested_stubs: [{
                    type: 'source',
                    description: 'Test',
                    stub_form: 'persistent',
                    location: { lineNumber: 1 },
                    rationale: 'Test rationale',
                    priority,
                }],
            };
            const result = validateLLMResponse(response);
            expect(result.valid).toBe(true);
        }
    });

    it('should accept all valid reference types', () => {
        for (const refType of VALID_REFERENCE_TYPES) {
            const response = {
                ...VALID_RESPONSE,
                references: [{
                    type: refType,
                    title: 'Test reference',
                    target: 'test-target',
                }],
            };
            const result = validateLLMResponse(response);
            expect(result.valid).toBe(true);
        }
    });
});

// =============================================================================
// TESTS: INVALID RESPONSES - MISSING FIELDS
// =============================================================================

describe('Schema Validation - Missing Required Fields', () => {
    it('should reject response missing analysis_summary', () => {
        const response = { ...VALID_RESPONSE };
        delete (response as Record<string, unknown>).analysis_summary;
        const result = validateLLMResponse(response);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain("Missing or invalid 'analysis_summary'");
    });

    it('should reject response missing confidence', () => {
        const response = { ...VALID_RESPONSE };
        delete (response as Record<string, unknown>).confidence;
        const result = validateLLMResponse(response);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain("Missing or invalid 'confidence'");
    });

    it('should reject response missing suggested_stubs', () => {
        const response = { ...VALID_RESPONSE };
        delete (response as Record<string, unknown>).suggested_stubs;
        const result = validateLLMResponse(response);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain("Missing or invalid 'suggested_stubs' array");
    });

    it('should reject response missing references', () => {
        const response = { ...VALID_RESPONSE };
        delete (response as Record<string, unknown>).references;
        const result = validateLLMResponse(response);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain("Missing or invalid 'references' array");
    });

    it('should reject stub missing type', () => {
        const response = {
            ...VALID_RESPONSE,
            suggested_stubs: [{
                description: 'Test',
                stub_form: 'persistent',
                location: { lineNumber: 1 },
                rationale: 'Test',
            }],
        };
        const result = validateLLMResponse(response);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes("missing or invalid 'type'"))).toBe(true);
    });

    it('should reject stub missing description', () => {
        const response = {
            ...VALID_RESPONSE,
            suggested_stubs: [{
                type: 'source',
                stub_form: 'persistent',
                location: { lineNumber: 1 },
                rationale: 'Test',
            }],
        };
        const result = validateLLMResponse(response);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes("missing or invalid 'description'"))).toBe(true);
    });

    it('should reject stub missing stub_form', () => {
        const response = {
            ...VALID_RESPONSE,
            suggested_stubs: [{
                type: 'source',
                description: 'Test',
                location: { lineNumber: 1 },
                rationale: 'Test',
            }],
        };
        const result = validateLLMResponse(response);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes("missing 'stub_form'"))).toBe(true);
    });

    it('should reject stub missing location', () => {
        const response = {
            ...VALID_RESPONSE,
            suggested_stubs: [{
                type: 'source',
                description: 'Test',
                stub_form: 'persistent',
                rationale: 'Test',
            }],
        };
        const result = validateLLMResponse(response);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes("missing 'location' object"))).toBe(true);
    });

    it('should reject stub missing lineNumber in location', () => {
        const response = {
            ...VALID_RESPONSE,
            suggested_stubs: [{
                type: 'source',
                description: 'Test',
                stub_form: 'persistent',
                location: { section: 'Intro' },
                rationale: 'Test',
            }],
        };
        const result = validateLLMResponse(response);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('lineNumber'))).toBe(true);
    });

    it('should reject stub missing rationale', () => {
        const response = {
            ...VALID_RESPONSE,
            suggested_stubs: [{
                type: 'source',
                description: 'Test',
                stub_form: 'persistent',
                location: { lineNumber: 1 },
            }],
        };
        const result = validateLLMResponse(response);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes("missing or invalid 'rationale'"))).toBe(true);
    });
});

// =============================================================================
// TESTS: INVALID VALUES
// =============================================================================

describe('Schema Validation - Invalid Values', () => {
    it('should reject invalid stub_form value', () => {
        const response = {
            ...VALID_RESPONSE,
            suggested_stubs: [{
                type: 'source',
                description: 'Test',
                stub_form: 'invalid_form',
                location: { lineNumber: 1 },
                rationale: 'Test',
            }],
        };
        const result = validateLLMResponse(response);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('invalid stub_form'))).toBe(true);
    });

    it('should reject negative lineNumber', () => {
        const response = {
            ...VALID_RESPONSE,
            suggested_stubs: [{
                type: 'source',
                description: 'Test',
                stub_form: 'persistent',
                location: { lineNumber: -5 },
                rationale: 'Test',
            }],
        };
        const result = validateLLMResponse(response);
        expect(result.valid).toBe(false);
    });

    it('should reject zero lineNumber', () => {
        const response = {
            ...VALID_RESPONSE,
            suggested_stubs: [{
                type: 'source',
                description: 'Test',
                stub_form: 'persistent',
                location: { lineNumber: 0 },
                rationale: 'Test',
            }],
        };
        const result = validateLLMResponse(response);
        expect(result.valid).toBe(false);
    });

    it('should reject non-numeric confidence', () => {
        const response = {
            ...VALID_RESPONSE,
            confidence: 'high',
        };
        const result = validateLLMResponse(response);
        expect(result.valid).toBe(false);
    });

    it('should warn on out-of-range confidence', () => {
        const response = {
            ...VALID_RESPONSE,
            confidence: 1.5,
        };
        const result = validateLLMResponse(response);
        expect(result.valid).toBe(true); // Valid but with warning
        expect(result.warnings.some(w => w.includes('out of range'))).toBe(true);
    });

    it('should reject invalid reference type', () => {
        const response = {
            ...VALID_RESPONSE,
            references: [{
                type: 'invalid_type',
                title: 'Test',
                target: 'test',
            }],
        };
        const result = validateLLMResponse(response);
        expect(result.valid).toBe(false);
    });
});

// =============================================================================
// TESTS: EDGE CASES
// =============================================================================

describe('Schema Validation - Edge Cases', () => {
    it('should handle null response', () => {
        const result = validateLLMResponse(null);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Response is not an object');
    });

    it('should handle undefined response', () => {
        const result = validateLLMResponse(undefined);
        expect(result.valid).toBe(false);
    });

    it('should handle array instead of object', () => {
        const result = validateLLMResponse([]);
        expect(result.valid).toBe(false);
    });

    it('should handle string instead of object', () => {
        const result = validateLLMResponse('not an object');
        expect(result.valid).toBe(false);
    });

    it('should handle empty string fields', () => {
        const response = {
            ...VALID_RESPONSE,
            suggested_stubs: [{
                type: '',
                description: '',
                stub_form: 'persistent',
                location: { lineNumber: 1 },
                rationale: '',
            }],
        };
        const result = validateLLMResponse(response);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle whitespace-only fields', () => {
        const response = {
            ...VALID_RESPONSE,
            suggested_stubs: [{
                type: '   ',
                description: '\n\t',
                stub_form: 'persistent',
                location: { lineNumber: 1 },
                rationale: '  ',
            }],
        };
        const result = validateLLMResponse(response);
        expect(result.valid).toBe(false);
    });

    it('should warn on unknown stub type but not reject', () => {
        const response = {
            ...VALID_RESPONSE,
            suggested_stubs: [{
                type: 'custom_unknown_type',
                description: 'Test',
                stub_form: 'persistent',
                location: { lineNumber: 1 },
                rationale: 'Test',
            }],
        };
        const result = validateLLMResponse(response);
        expect(result.valid).toBe(true); // Unknown types generate warnings, not errors
        expect(result.warnings.some(w => w.includes('unknown type'))).toBe(true);
    });

    it('should handle very large lineNumber', () => {
        const response = {
            ...VALID_RESPONSE,
            suggested_stubs: [{
                type: 'source',
                description: 'Test',
                stub_form: 'persistent',
                location: { lineNumber: 999999 },
                rationale: 'Test',
            }],
        };
        const result = validateLLMResponse(response);
        expect(result.valid).toBe(true); // Large numbers are valid
    });

    it('should handle float lineNumber', () => {
        const response = {
            ...VALID_RESPONSE,
            suggested_stubs: [{
                type: 'source',
                description: 'Test',
                stub_form: 'persistent',
                location: { lineNumber: 10.5 },
                rationale: 'Test',
            }],
        };
        const result = validateLLMResponse(response);
        // Float is technically a number, so it passes basic validation
        // Could add stricter integer check if needed
        expect(result.valid).toBe(true);
    });
});

// =============================================================================
// TESTS: JSON PARSING
// =============================================================================

describe('Schema Validation - JSON Parsing', () => {
    it('should parse valid JSON string', () => {
        const jsonString = JSON.stringify(VALID_RESPONSE);
        const result = parseAndValidateLLMResponse(jsonString);
        expect(result.parseError).toBeNull();
        expect(result.validation.valid).toBe(true);
        expect(result.response).not.toBeNull();
    });

    it('should handle invalid JSON', () => {
        const result = parseAndValidateLLMResponse('{ invalid json }');
        expect(result.parseError).not.toBeNull();
        expect(result.response).toBeNull();
    });

    it('should handle empty string', () => {
        const result = parseAndValidateLLMResponse('');
        expect(result.parseError).not.toBeNull();
    });

    it('should handle JSON with extra fields (lenient)', () => {
        const extendedResponse = {
            ...VALID_RESPONSE,
            extra_field: 'should be ignored',
            another_extra: { nested: true },
        };
        const result = parseAndValidateLLMResponse(JSON.stringify(extendedResponse));
        expect(result.validation.valid).toBe(true);
    });

    it('should handle JSON with markdown code block wrapper', () => {
        const wrapped = '```json\n' + JSON.stringify(VALID_RESPONSE) + '\n```';
        // This would fail raw parsing - would need preprocessing
        const result = parseAndValidateLLMResponse(wrapped);
        expect(result.parseError).not.toBeNull();
        // In production, you'd strip the code block first
    });

    it('should handle JSON with leading/trailing whitespace', () => {
        const jsonString = '  \n' + JSON.stringify(VALID_RESPONSE) + '\n  ';
        const result = parseAndValidateLLMResponse(jsonString);
        expect(result.parseError).toBeNull();
        expect(result.validation.valid).toBe(true);
    });
});

// =============================================================================
// TESTS: REALISTIC LLM OUTPUT VARIATIONS
// =============================================================================

describe('Schema Validation - Realistic LLM Outputs', () => {
    it('should handle response with optional fields present', () => {
        const response = {
            ...VALID_RESPONSE,
            suggested_stubs: [{
                type: 'source',
                description: 'Test',
                stub_form: 'blocking',
                location: {
                    lineNumber: 42,
                    section: 'Introduction',
                    context: 'Near the opening paragraph',
                },
                rationale: 'Claims need sources',
                priority: 'critical',
                reasoning: 'This claim is central to the argument',
            }],
        };
        const result = validateLLMResponse(response);
        expect(result.valid).toBe(true);
    });

    it('should handle response with unicode content', () => {
        const response = {
            ...VALID_RESPONSE,
            analysis_summary: 'Análisis del documento con caractères spéciaux 日本語',
            suggested_stubs: [{
                type: 'source',
                description: 'Référence für 日本語 文書',
                stub_form: 'persistent',
                location: { lineNumber: 1 },
                rationale: 'Test with émojis 🎉',
            }],
        };
        const result = validateLLMResponse(response);
        expect(result.valid).toBe(true);
    });

    it('should handle response with very long description', () => {
        const longDescription = 'A'.repeat(10000);
        const response = {
            ...VALID_RESPONSE,
            suggested_stubs: [{
                type: 'source',
                description: longDescription,
                stub_form: 'persistent',
                location: { lineNumber: 1 },
                rationale: 'Test',
            }],
        };
        const result = validateLLMResponse(response);
        expect(result.valid).toBe(true);
    });

    it('should handle response with many stubs', () => {
        const manyStubs = Array.from({ length: 50 }, (_, i) => ({
            type: VALID_STUB_TYPES[i % VALID_STUB_TYPES.length],
            description: `Stub ${i}`,
            stub_form: VALID_STUB_FORMS[i % VALID_STUB_FORMS.length],
            location: { lineNumber: i + 1 },
            rationale: `Rationale ${i}`,
        }));
        const response = {
            ...VALID_RESPONSE,
            suggested_stubs: manyStubs,
        };
        const result = validateLLMResponse(response);
        expect(result.valid).toBe(true);
    });
});
