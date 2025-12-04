/**
 * LLM Module - Prompts and Context Builder
 *
 * Default system prompt and context builder for LLM-powered stub suggestions.
 * Now supports schema-driven prompt generation using J-Editorial schema.
 */

import type { StubTypeDefinition, StubsConfiguration, ParsedStub } from '../stubs/stubs-types';
import type { DocumentContext, LLMSuggestionResponse, SuggestedStub, FoundReference } from './llm-types';
import type { JEditorialSchema, DocumentState, CreativityModeId } from '../schema/schema-types';
import { LLMContextBuilder, LLMContext } from './context-builder';
import { SchemaLoader } from '../schema/schema-loader';

// =============================================================================
// DEFAULT SYSTEM PROMPT
// =============================================================================

/**
 * Strong default system prompt that explains Doc Doctor and J-Editorial philosophy.
 * This prompt works even when stub types don't have custom semanticPurpose definitions.
 */
export const DEFAULT_SYSTEM_PROMPT = `You are an editorial assistant for Doc Doctor, an Obsidian plugin implementing the J-Editorial Framework for knowledge management. Your role is to analyze documents and identify knowledge gaps that should be marked with "stubs."

## What is Doc Doctor?

Doc Doctor is a vector-based stubs system that transforms document gaps into trackable, actionable demand signals. Unlike simple TODO lists, stubs have:

1. **Type**: Categorizes the nature of the gap (citation needed, expand, question, fix, etc.)
2. **Form**: Indicates severity and lifecycle (transient, persistent, blocking, structural)
3. **Priority**: Urgency level (low, medium, high, critical)
4. **Vector Properties**: Enable intelligent routing and resolution forecasting

## The J-Editorial Philosophy

Stubs follow a three-layer architecture:
- **L1 (Intrinsic)**: What the stub IS - stored in frontmatter, portable metadata
- **L2 (Extrinsic)**: What the stub MEANS - calculated dimensions (health, urgency, controversy)
- **L3 (Operational)**: How the stub BEHAVES - automation rules and workflows

Stubs affect document refinement scores:
- \`transient\`: -0.02 per stub (minor, resolve soon)
- \`persistent\`: -0.05 per stub (long-term tracking)
- \`blocking\`: -0.10 per stub (must resolve before promotion)
- \`structural\`: -0.15 per stub (fundamental architecture issue)

## The Five Vector Families

Every gap belongs to one of five editorial work families:

| Family | Description | Examples |
|--------|-------------|----------|
| **Retrieval** | Finding existing information | Citations, references, fact-checking |
| **Computation** | Analyzing and deriving values | Clarifications, calculations, research |
| **Synthesis** | Combining multiple perspectives | Resolving conflicts, balancing views |
| **Creation** | Generating new content | Expanding sections, adding examples |
| **Structural** | Architectural changes | Reorganizing, splitting, dependencies |

## Common Gap Patterns to Identify

When analyzing documents, look for:

**Epistemic Gaps** (truth/evidence concerns):
- Statistics or claims without sources
- "According to..." without attribution
- Technical specifications without references
- Dubious or questionable assertions

**Completeness Gaps** (coverage concerns):
- Sections that are too brief for their importance
- Concepts introduced but not explained
- Procedures without steps
- Empty or placeholder sections
- Missing examples for abstract concepts

**Structural Gaps** (organization concerns):
- Poor flow between sections
- Content that should be split or merged
- Inconsistent depth across sections

**Workflow Gaps** (action concerns):
- Unresolved questions (TBD, TBA, ???)
- TODOs embedded in content
- Placeholders like XXX or FIXME

## Your Task

Analyze the provided document and:

1. **Identify gaps**: For each gap:
   - Determine the most appropriate stub type from the available types
   - Write a clear, actionable description (not generic like "needs work")
   - Suggest stub_form based on severity
   - Identify the location (section or context quote)
   - Provide rationale for your choice

2. **Extract references**: Identify references that could enrich the document:
   - Internal vault links (wikilinks like [[Note Name]])
   - External URLs mentioned or implied
   - Citations and sources mentioned
   - Related topics that should be linked

## Guidelines

- **Be specific**: "Add citation for OAuth 2.0 token expiration claim" not "needs citation"
- **Be conservative**: Only flag genuine gaps, not stylistic preferences
- **Don't duplicate**: Check existing stubs before suggesting new ones
- **Consider audience**: Personal notes have lower standards than public docs
- **Consider form**: A "developing" document expects more gaps than "stable"
- **Quality over quantity**: A few precise suggestions beats many vague ones

## Thinking Process

As you analyze, share your reasoning by structuring your response with:
- Which sections you're examining
- What patterns you notice
- Why certain gaps are significant
- What references would strengthen the document

## Output Format

Respond with valid JSON matching the specified schema. Do not include any text before or after the JSON.`;

// =============================================================================
// CONTEXT BUILDER
// =============================================================================

/**
 * Build user prompt with document context and stub type definitions
 */
export function buildUserPrompt(
    context: DocumentContext,
    stubTypes: StubTypeDefinition[],
): string {
    const frontmatterSection = buildFrontmatterSection(context.frontmatter);
    const existingStubsSection = buildExistingStubsSection(context.frontmatter.existingStubs);
    const stubTypesSection = buildStubTypesSection(stubTypes);
    const externalContextSection = context.externalContext
        ? `\n### External Context (from web search, URL scraping, related notes)\n${context.externalContext}`
        : '';

    return `## Document to Analyze

### Metadata
${frontmatterSection}

### Existing Stubs
${existingStubsSection}

### Content
\`\`\`markdown
${context.content}
\`\`\`
${externalContextSection}

---

## Available Stub Types

${stubTypesSection}

---

## Your Response

Analyze the document and respond with ONLY valid JSON (no markdown, no code fences, no explanation text).

CRITICAL: Use ONLY these exact stub type keys from the list above. Do NOT invent new types.

REQUIRED JSON SCHEMA:
{
  "thinking": "string - Your analysis process: sections examined, patterns found, reasoning",
  "analysis_summary": "string - 1-2 sentence overview of document quality",
  "suggested_stubs": [
    {
      "type": "string - MUST be one of the stub type keys listed above (e.g., 'link', 'expand', 'verify')",
      "description": "string - Clear, actionable description (NOT generic like 'needs work')",
      "stub_form": "string - One of: transient, persistent, blocking",
      "priority": "string - One of: low, medium, high, critical",
      "location": {
        "section": "string - Heading where gap appears",
        "context": "string - Quote or description of location",
        "lineNumber": "number (REQUIRED) - Exact 1-indexed line number in the document content where the stub anchor should be placed. Count lines from the START of the document including frontmatter delimiters (---). The anchor will be inserted at the END of this line."
      },
      "rationale": "string - Why this stub type fits this gap"
    }
  ],
  "references": [
    {
      "type": "string - One of: vault, web, citation, unknown",
      "title": "string - Display name for the reference",
      "target": "string - The actual link: [[Note Name]] for vault, https://... for web, or citation text",
      "context": "string - Why this reference is relevant",
      "section": "string - Section where reference would fit"
    }
  ],
  "confidence": "number - 0.0 to 1.0, your confidence in the analysis"
}

IMPORTANT LINE NUMBER INSTRUCTIONS:
- lineNumber is REQUIRED for every suggested stub
- Count from line 1 at the very start of the document (including the opening ---)
- The anchor will be appended to the END of the specified line
- Choose the line that best represents where the gap exists
- For paragraph gaps, use the first line of the paragraph
- For section gaps, use the heading line
- For inline claims/statements, use the line containing the claim

EXAMPLE (using hypothetical stub types):
{"thinking":"Analyzed 3 sections. Found unsupported claims in Introduction at line 15.","analysis_summary":"Document has good structure but lacks citations for key claims.","suggested_stubs":[{"type":"link","description":"Add citation for claim that 'performance improves by 40%'","stub_form":"persistent","priority":"high","location":{"section":"Introduction","context":"Near 'performance improves by 40%'","lineNumber":15},"rationale":"Statistical claim requires source"}],"references":[{"type":"web","title":"Performance Benchmarks 2024","target":"https://example.com/benchmarks","context":"Could support the 40% claim","section":"Introduction"}],"confidence":0.85}`;
}

/**
 * Build frontmatter metadata section
 */
function buildFrontmatterSection(frontmatter: DocumentContext['frontmatter']): string {
    const lines: string[] = [];

    if (frontmatter.title) {
        lines.push(`- **Title**: ${frontmatter.title}`);
    }
    if (frontmatter.description) {
        lines.push(`- **Description**: ${frontmatter.description}`);
    }
    if (frontmatter.refinement !== undefined) {
        lines.push(`- **Refinement Score**: ${frontmatter.refinement}`);
    }
    if (frontmatter.form) {
        lines.push(`- **Document Form**: ${frontmatter.form}`);
    }
    if (frontmatter.audience) {
        lines.push(`- **Audience**: ${frontmatter.audience}`);
    }

    return lines.length > 0 ? lines.join('\n') : 'No metadata available';
}

/**
 * Build existing stubs section
 */
function buildExistingStubsSection(existingStubs?: Array<{ type: string; description: string }>): string {
    if (!existingStubs || existingStubs.length === 0) {
        return 'None';
    }

    return existingStubs
        .map((stub) => `- **${stub.type}**: "${stub.description}"`)
        .join('\n');
}

/**
 * Build stub types reference section
 */
function buildStubTypesSection(stubTypes: StubTypeDefinition[]): string {
    return stubTypes
        .map((type) => {
            const lines: string[] = [];
            lines.push(`### ${type.displayName} (\`${type.key}\`)`);

            if (type.vectorFamily) {
                lines.push(`**Vector Family**: ${type.vectorFamily}`);
            }
            if (type.ontologicalDimension) {
                lines.push(`**Dimension**: ${type.ontologicalDimension}`);
            }
            if (type.semanticPurpose) {
                lines.push(`**Purpose**: ${type.semanticPurpose}`);
            } else if (type.description) {
                lines.push(`**Purpose**: ${type.description}`);
            }
            if (type.indicators && type.indicators.length > 0) {
                lines.push(`**Look for**: ${type.indicators.join(', ')}`);
            }
            if (type.antiPatterns && type.antiPatterns.length > 0) {
                lines.push(`**Avoid when**: ${type.antiPatterns.join(', ')}`);
            }

            return lines.join('\n');
        })
        .join('\n\n');
}

// =============================================================================
// RESPONSE VALIDATION
// =============================================================================

/**
 * Validate and parse LLM response
 */
export function validateLLMResponse(
    response: unknown,
    configuredTypes: Set<string>,
): LLMSuggestionResponse & { thinking?: string } {
    // Type checking
    if (!response || typeof response !== 'object') {
        throw new Error('Invalid response format: expected object');
    }

    const r = response as Record<string, unknown>;

    // Validate required fields
    if (!Array.isArray(r.suggested_stubs)) {
        throw new Error('Missing suggested_stubs array');
    }

    // Validate each stub
    const validStubs: SuggestedStub[] = [];

    for (const stub of r.suggested_stubs) {
        const validatedStub = validateSuggestedStub(stub, configuredTypes);
        if (validatedStub) {
            validStubs.push(validatedStub);
        }
    }

    // Validate references
    const validReferences: FoundReference[] = [];
    if (Array.isArray(r.references)) {
        for (const ref of r.references) {
            const validatedRef = validateReference(ref);
            if (validatedRef) {
                validReferences.push(validatedRef);
            }
        }
    }

    return {
        thinking: typeof r.thinking === 'string' ? r.thinking : undefined,
        analysis_summary: String(r.analysis_summary || 'Analysis complete'),
        suggested_stubs: validStubs,
        references: validReferences,
        confidence: typeof r.confidence === 'number' ? Math.min(1, Math.max(0, r.confidence)) : 0.5,
    };
}

/**
 * Validate a single reference
 */
function validateReference(ref: unknown): FoundReference | null {
    if (!ref || typeof ref !== 'object') {
        return null;
    }

    const r = ref as Record<string, unknown>;

    // Validate required fields
    if (typeof r.title !== 'string' || !r.title) {
        return null;
    }
    if (typeof r.target !== 'string' || !r.target) {
        return null;
    }

    // Validate type
    const validTypes = ['vault', 'web', 'citation', 'unknown'];
    const type = validTypes.includes(String(r.type))
        ? (r.type as 'vault' | 'web' | 'citation' | 'unknown')
        : 'unknown';

    return {
        type,
        title: r.title,
        target: r.target,
        context: typeof r.context === 'string' ? r.context : undefined,
        section: typeof r.section === 'string' ? r.section : undefined,
    };
}

/**
 * Validate a single suggested stub
 */
function validateSuggestedStub(
    stub: unknown,
    configuredTypes: Set<string>,
): SuggestedStub | null {
    if (!stub || typeof stub !== 'object') {
        console.warn('[Doc Doctor LLM] Skipping invalid stub suggestion: not an object');
        return null;
    }

    const s = stub as Record<string, unknown>;

    // Validate type
    if (typeof s.type !== 'string' || !s.type) {
        console.warn('[Doc Doctor LLM] Skipping stub with missing type');
        return null;
    }

    if (!configuredTypes.has(s.type)) {
        console.warn(`[Doc Doctor LLM] Unknown stub type "${s.type}", skipping`);
        return null;
    }

    // Validate description
    if (typeof s.description !== 'string' || !s.description) {
        console.warn('[Doc Doctor LLM] Skipping stub with missing description');
        return null;
    }

    // Validate stub_form
    const validForms = ['transient', 'persistent', 'blocking'];
    const stubForm = validForms.includes(String(s.stub_form))
        ? (s.stub_form as 'transient' | 'persistent' | 'blocking')
        : 'transient';

    // Validate priority
    const validPriorities = ['low', 'medium', 'high', 'critical'];
    const priority = validPriorities.includes(String(s.priority))
        ? (s.priority as 'low' | 'medium' | 'high' | 'critical')
        : undefined;

    // Build location - lineNumber is required
    if (!s.location || typeof s.location !== 'object') {
        console.warn('[Doc Doctor LLM] Skipping stub with missing location');
        return null;
    }

    const loc = s.location as Record<string, unknown>;

    // lineNumber is required
    if (typeof loc.lineNumber !== 'number' || loc.lineNumber < 1) {
        console.warn('[Doc Doctor LLM] Skipping stub with invalid or missing lineNumber');
        return null;
    }

    const location: SuggestedStub['location'] = {
        lineNumber: Math.floor(loc.lineNumber), // Ensure integer
    };
    if (typeof loc.section === 'string') location.section = loc.section;
    if (typeof loc.context === 'string') location.context = loc.context;

    // Validate rationale
    const rationale = typeof s.rationale === 'string' ? s.rationale : 'No rationale provided';

    return {
        type: s.type,
        description: s.description,
        stub_form: stubForm,
        priority,
        location,
        rationale,
    };
}

// =============================================================================
// TOKEN ESTIMATION
// =============================================================================

/**
 * Estimate token count for text (rough approximation: ~4 chars per token)
 */
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

/**
 * Estimate cost for API call based on provider and model
 */
export function estimateCost(
    inputTokens: number,
    outputTokens: number,
    model: string,
): number {
    // Pricing per 1K tokens (approximate as of late 2024)
    const pricing: Record<string, { input: number; output: number }> = {
        // Anthropic
        'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
        'claude-3-5-haiku-20241022': { input: 0.0008, output: 0.004 },
        // OpenAI
        'gpt-4o': { input: 0.0025, output: 0.01 },
        'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
        'gpt-4-turbo': { input: 0.01, output: 0.03 },
    };

    const p = pricing[model] || { input: 0.001, output: 0.002 };
    return (inputTokens * p.input + outputTokens * p.output) / 1000;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get sorted stub types from configuration
 */
export function getSortedStubTypesForPrompt(config: StubsConfiguration): StubTypeDefinition[] {
    return Object.values(config.stubTypes).sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Get configured type keys as a Set for validation
 */
export function getConfiguredTypeKeys(config: StubsConfiguration): Set<string> {
    return new Set(Object.values(config.stubTypes).map((t) => t.key));
}

/**
 * Build document context from file and frontmatter
 */
export function buildDocumentContext(
    path: string,
    content: string,
    frontmatter: Record<string, unknown>,
    existingStubs: ParsedStub[],
    externalContext?: string,
): DocumentContext {
    return {
        path,
        content,
        frontmatter: {
            title: typeof frontmatter.title === 'string' ? frontmatter.title : undefined,
            description: typeof frontmatter.description === 'string' ? frontmatter.description : undefined,
            refinement: typeof frontmatter.refinement === 'number' ? frontmatter.refinement : undefined,
            form: isValidForm(frontmatter.form) ? frontmatter.form : undefined,
            audience: isValidAudience(frontmatter.audience) ? frontmatter.audience : undefined,
            existingStubs: existingStubs.map((s) => ({ type: s.type, description: s.description })),
        },
        externalContext,
    };
}

function isValidForm(value: unknown): value is DocumentContext['frontmatter']['form'] {
    return ['transient', 'developing', 'stable', 'evergreen', 'canonical'].includes(String(value));
}

function isValidAudience(value: unknown): value is DocumentContext['frontmatter']['audience'] {
    return ['personal', 'internal', 'trusted', 'public'].includes(String(value));
}

// =============================================================================
// SCHEMA-DRIVEN PROMPT BUILDER
// =============================================================================

/**
 * Schema-driven prompt builder that uses the J-Editorial schema
 * to generate contextual prompts for LLM analysis.
 */
export class SchemaPromptBuilder {
    private contextBuilder: LLMContextBuilder;
    private schemaLoader: SchemaLoader;

    constructor(schemaLoader: SchemaLoader) {
        this.schemaLoader = schemaLoader;
        this.contextBuilder = new LLMContextBuilder(schemaLoader);
    }

    /**
     * Build complete prompts using schema-driven context
     */
    buildPrompts(
        document: DocumentState,
        userRequest: string,
        options?: {
            creativityMode?: CreativityModeId;
            externalContext?: string;
        }
    ): { systemPrompt: string; userPrompt: string; context: LLMContext } {
        // Build context using schema
        const context = this.contextBuilder.buildContext(document, {
            creativityMode: options?.creativityMode,
            externalContext: options?.externalContext,
        });

        // Build system prompt from schema context
        const systemPrompt = this.contextBuilder.buildSystemPrompt(context);

        // Build user prompt with document state and request
        const userPrompt = this.buildSchemaUserPrompt(context, userRequest);

        return { systemPrompt, userPrompt, context };
    }

    /**
     * Build user prompt with schema-aware formatting
     */
    private buildSchemaUserPrompt(context: LLMContext, userRequest: string): string {
        const sections: string[] = [];

        // Document state
        sections.push(this.buildDocumentStateSection(context.document));

        // Existing stubs
        if (context.document.existingStubs.length > 0) {
            sections.push(this.buildExistingStubsSection(context.document.existingStubs));
        }

        // Aggregate metrics
        sections.push(this.buildMetricsSection(context.document.aggregateMetrics));

        // External context if present
        if (context.request.externalContext) {
            sections.push(`## External Research Context\n\n${context.request.externalContext}`);
        }

        // User request
        sections.push(this.buildRequestSection(userRequest));

        // Response format instructions
        sections.push(this.buildResponseFormatSection());

        return sections.join('\n\n---\n\n');
    }

    private buildDocumentStateSection(doc: LLMContext['document']): string {
        return `## Document Being Analyzed

**Path**: ${doc.path}
**Title**: ${doc.title}
${doc.description ? `**Description**: ${doc.description}` : ''}

### L1 Properties
- **Refinement**: ${doc.refinement.toFixed(2)}
- **Origin**: ${doc.origin || 'not specified'}
- **Form**: ${doc.form || 'not specified'}
- **Audience**: ${doc.audience || 'personal'}

### Quality Gate Status
${doc.qualityGateStatus.meetsThreshold ? `✅ Meets threshold (${doc.qualityGateStatus.requiredThreshold})` : `❌ Below threshold: needs ${doc.qualityGateStatus.requiredThreshold}, has ${doc.qualityGateStatus.currentRefinement.toFixed(2)} (gap: ${doc.qualityGateStatus.gap.toFixed(2)})`}`;
    }

    private buildExistingStubsSection(stubs: LLMContext['document']['existingStubs']): string {
        return `### Existing Stubs (${stubs.length})

${stubs
    .map(
        (s, i) =>
            `${i + 1}. **${s.type}**: ${s.description}${s.anchorId ? ` (^${s.anchorId})` : ''}${s.form ? ` [${s.form}]` : ''}`
    )
    .join('\n')}

Consider these existing stubs when making suggestions. Avoid duplicating them.`;
    }

    private buildMetricsSection(metrics: LLMContext['document']['aggregateMetrics']): string {
        return `### Aggregate Metrics

- **Total Stubs**: ${metrics.totalStubs}
- **Blocking Stubs**: ${metrics.blockingCount}
- **Total Potential Energy**: ${metrics.totalPotentialEnergy.toFixed(2)} Eₚ
- **Estimated Refinement Penalty**: -${metrics.estimatedPenalty.toFixed(2)}

**Vector Family Distribution**:
${Object.entries(metrics.vectorFamilyDistribution)
    .filter(([_, count]) => count > 0)
    .map(([family, count]) => `- ${family}: ${count}`)
    .join('\n') || '- No stubs by family'}`;
    }

    private buildRequestSection(userRequest: string): string {
        return `## Analysis Request

${userRequest}`;
    }

    private buildResponseFormatSection(): string {
        return `## Response Format

Respond with ONLY valid JSON (no markdown, no code fences, no explanation text).

CRITICAL RULES:
1. Use ONLY stub type keys from the schema above
2. Every reference MUST come from tool call results
3. DO NOT cite document content as a source
4. DO NOT invent URLs, DOIs, or vault links

REQUIRED JSON SCHEMA:
{
  "thinking": "string - Your analysis process: sections examined, patterns found, reasoning",
  "analysis_summary": "string - 1-2 sentence overview of document quality",
  "suggested_stubs": [
    {
      "type": "string - MUST be one of the stub type keys from schema",
      "description": "string - Clear, actionable description",
      "stub_form": "string - One of: transient, persistent, blocking",
      "priority": "string - One of: low, medium, high, critical",
      "location": {
        "section": "string - Heading where gap appears",
        "context": "string - Quote or description of location",
        "lineNumber": "number (REQUIRED) - 1-indexed line number for anchor placement"
      },
      "rationale": "string - Why this stub type fits this gap",
      "vector_family": "string - The vector family this stub belongs to"
    }
  ],
  "references": [
    {
      "type": "string - One of: vault, web, citation, unknown",
      "title": "string - Display name for the reference",
      "target": "string - The actual link: [[Note Name]] for vault, https://... for web",
      "context": "string - Why this reference is relevant",
      "section": "string - Section where reference would fit",
      "verified": "boolean - true if found through tool call, false otherwise"
    }
  ],
  "tool_calls_made": [
    {
      "tool": "string - Tool name used",
      "query": "string - Search query or URL",
      "results_count": "number - How many results returned"
    }
  ],
  "confidence": "number - 0.0 to 1.0, your confidence in the analysis"
}

LINE NUMBER INSTRUCTIONS:
- lineNumber is REQUIRED for every suggested stub
- Count from line 1 at the very start of the document (including the opening ---)
- The anchor will be appended to the END of the specified line
- Choose the line that best represents where the gap exists`;
    }

    /**
     * Get suggested creativity mode for a document
     */
    getSuggestedMode(document: DocumentState): CreativityModeId {
        return this.contextBuilder.suggestCreativityMode(document);
    }

    /**
     * Get the current schema
     */
    getSchema(): JEditorialSchema {
        return this.schemaLoader.getSchema();
    }
}

// =============================================================================
// COMBINED PROMPT BUILDER (Backward Compatible)
// =============================================================================

/**
 * Build prompts using both legacy and schema-driven approaches.
 * Uses schema when available, falls back to legacy.
 */
export function buildCombinedPrompts(
    legacyContext: DocumentContext,
    stubTypes: StubTypeDefinition[],
    schemaLoader?: SchemaLoader,
    document?: DocumentState,
    creativityMode?: CreativityModeId
): { systemPrompt: string; userPrompt: string } {
    // If schema loader and document state are provided, use schema-driven approach
    if (schemaLoader && document) {
        const builder = new SchemaPromptBuilder(schemaLoader);
        const { systemPrompt, userPrompt } = builder.buildPrompts(
            document,
            'Analyze this document for editorial gaps and suggest improvements.',
            { creativityMode }
        );

        // Append document content to user prompt
        const contentSection = `

---

## Document Content

\`\`\`markdown
${legacyContext.content}
\`\`\``;

        return {
            systemPrompt,
            userPrompt: userPrompt + contentSection,
        };
    }

    // Fall back to legacy approach
    return {
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        userPrompt: buildUserPrompt(legacyContext, stubTypes),
    };
}
