/**
 * LLM Context Builder
 *
 * Builds the complete context transmitted to the LLM on every request.
 * Includes both schema context (the grammar) and instance context (document state).
 */

import {
    JEditorialSchema,
    DocumentState,
    VectorFamilyDefinition,
    StubTypeSchema,
    StubInstance,
    CreativityModeId,
    ToolUsePolicy,
    VectorFamilyId,
    QualityGateStatus,
    AggregateVectorMetrics,
} from '../schema/schema-types';
import { SchemaLoader, CREATIVITY_MODES } from '../schema/schema-loader';
import { PromptTemplate } from './llm-types';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Complete LLM context for a request
 */
export interface LLMContext {
    /** Schema context (the grammar) */
    schema: SchemaContext;

    /** Instance context (this document's state) */
    document: DocumentContext;

    /** Request context (what we're asking) */
    request: RequestContext;
}

export interface SchemaContext {
    /** Full intrinsic properties definitions */
    intrinsicProperties: string;

    /** All 5 vector families with work patterns */
    vectorFamilies: string;

    /** All stub types with semantics */
    stubTypes: string;

    /** Audience → threshold mapping */
    qualityGates: string;

    /** Ep, friction, velocity formulas */
    formulas: string;
}

export interface DocumentContext {
    path: string;
    title: string;
    description?: string;
    refinement: number;
    origin?: string;
    form?: string;
    audience?: string;
    qualityGateStatus: QualityGateStatus;
    existingStubs: StubInstance[];
    aggregateMetrics: AggregateVectorMetrics;
}

export interface RequestContext {
    template: PromptTemplate;
    creativityMode: CreativityModeId;
    toolPolicy: ToolUsePolicy;
    temperature: number;
    externalContext?: string;
}

// =============================================================================
// CONTEXT BUILDER CLASS
// =============================================================================

export class LLMContextBuilder {
    private schemaLoader: SchemaLoader;

    constructor(schemaLoader: SchemaLoader) {
        this.schemaLoader = schemaLoader;
    }

    /**
     * Build full context for LLM request
     */
    buildContext(document: DocumentState, request: Partial<RequestContext>): LLMContext {
        const schema = this.schemaLoader.getSchema();

        // Determine creativity mode
        const suggestedMode = this.suggestCreativityMode(document);
        const creativityMode = request.creativityMode || suggestedMode;
        const modeConfig = CREATIVITY_MODES.find((m) => m.id === creativityMode) || CREATIVITY_MODES[2]; // draft default

        return {
            schema: this.buildSchemaContext(schema),
            document: this.buildDocumentContext(document, schema),
            request: {
                template: request.template || this.getDefaultTemplate(),
                creativityMode,
                toolPolicy: modeConfig.toolUsePolicy,
                temperature: modeConfig.temperature,
                externalContext: request.externalContext,
            },
        };
    }

    /**
     * Build schema context section
     */
    private buildSchemaContext(schema: JEditorialSchema): SchemaContext {
        return {
            intrinsicProperties: this.buildIntrinsicPropertiesPrompt(schema),
            vectorFamilies: this.buildVectorFamiliesPrompt(schema),
            stubTypes: this.buildStubTypesPrompt(schema),
            qualityGates: this.buildQualityGatesPrompt(schema),
            formulas: this.buildFormulasPrompt(schema),
        };
    }

    /**
     * Build document context section
     */
    private buildDocumentContext(
        document: DocumentState,
        schema: JEditorialSchema
    ): DocumentContext {
        const audienceGate = schema.qualityGates[document.audience || 'personal'] || 0.5;
        const qualityGateStatus: QualityGateStatus = {
            meetsThreshold: document.refinement >= audienceGate,
            requiredThreshold: audienceGate,
            currentRefinement: document.refinement,
            gap: document.refinement - audienceGate,
        };

        return {
            path: document.path,
            title: document.title,
            description: document.description,
            refinement: document.refinement,
            origin: document.origin,
            form: document.form,
            audience: document.audience,
            qualityGateStatus,
            existingStubs: document.existingStubs,
            aggregateMetrics: document.aggregateMetrics,
        };
    }

    /**
     * Build complete system prompt from context
     */
    buildSystemPrompt(context: LLMContext): string {
        const sections: string[] = [];

        // Framework introduction
        sections.push(this.buildFrameworkIntro());

        // Schema sections
        sections.push(context.schema.intrinsicProperties);
        sections.push(context.schema.vectorFamilies);
        sections.push(context.schema.stubTypes);
        sections.push(context.schema.qualityGates);
        sections.push(context.schema.formulas);

        // Tool use instructions (critical for reference integrity)
        sections.push(this.buildToolUseInstructions(context.request.toolPolicy));

        // Reference integrity rules
        sections.push(this.buildReferenceIntegrityRules());

        // Creativity mode context
        sections.push(this.buildCreativityModeContext(context.request.creativityMode));

        return sections.join('\n\n---\n\n');
    }

    /**
     * Build user prompt with document instance context
     */
    buildUserPrompt(context: LLMContext, userRequest: string): string {
        const sections: string[] = [];

        // Document state
        sections.push(this.buildDocumentStatePrompt(context.document));

        // Existing stubs
        if (context.document.existingStubs.length > 0) {
            sections.push(this.buildExistingStubsPrompt(context.document.existingStubs));
        }

        // Aggregate metrics
        sections.push(this.buildAggregateMetricsPrompt(context.document.aggregateMetrics));

        // External context if present
        if (context.request.externalContext) {
            sections.push(`## External Research Context\n\n${context.request.externalContext}`);
        }

        // User request
        sections.push(`## Analysis Request\n\n${userRequest}`);

        return sections.join('\n\n');
    }

    // =========================================================================
    // PROMPT BUILDERS
    // =========================================================================

    private buildFrameworkIntro(): string {
        return `# J-Editorial Framework Analysis

You are analyzing a document using the **J-Editorial Framework**, an ontology for knowledge management that classifies documents and their editorial demand signals.

## Core Principle

Documents have **intrinsic properties (L1)** that describe what they ARE. These properties enable:
- **L2 (Computed)**: Derived dimensions like health, potential energy, velocity
- **L3 (Operational)**: Rules and automation behaviors

Your task is to understand the document within this framework and provide analysis that respects its ontology.`;
    }

    private buildIntrinsicPropertiesPrompt(schema: JEditorialSchema): string {
        const props = schema.intrinsicProperties;

        return `## Document Properties (L1 Intrinsic)

The 5 essential properties that every J-Editorial document has:

### 1. Refinement (\`refinement\`)
**Question**: ${props.refinement.questionAnswered}
**Type**: Number (${props.refinement.min}-${props.refinement.max})
**Scoring Ranges**:
${props.refinement.ranges?.map((r) => `- **${r.min}-${r.max} (${r.label})**: ${r.semanticMeaning}`).join('\n') || ''}

### 2. Origin (\`origin\`)
**Question**: ${props.origin.questionAnswered}
**Values**:
${props.origin.values.map((v) => `- **${v.key}**: ${v.description}\n  *LLM Guidance*: ${v.semanticMeaning}`).join('\n')}

### 3. Form (\`form\`)
**Question**: ${props.form.questionAnswered}
**Values**:
${props.form.values.map((v) => `- **${v.key}**: ${v.description}\n  *LLM Guidance*: ${v.semanticMeaning}`).join('\n')}

### 4. Audience (\`audience\`)
**Question**: ${props.audience.questionAnswered}
**Values**:
${props.audience.values.map((v) => `- **${v.key}** (gate: ${v.qualityGate}): ${v.description}\n  *LLM Guidance*: ${v.semanticMeaning}`).join('\n')}

### 5. Stubs (\`stubs\`)
**Question**: ${props.stubs.questionAnswered}
Array of editorial demand signals. Each stub represents work needed to increase refinement.`;
    }

    private buildVectorFamiliesPrompt(schema: JEditorialSchema): string {
        return `## Vector Families (Editorial Work Classification)

Stubs are demand signals classified into 5 vector families. Each family represents a type of editorial work:

${schema.vectorFamilies
    .map(
        (family) => `### ${family.displayName} (${family.id})
**Purpose**: ${family.description}
**Work Pattern**: ${family.workPattern}
**Tools to Use**: ${family.typicalTools.length > 0 ? family.typicalTools.join(', ') : 'None required'}
**Indicators**: ${family.indicators.join('; ')}
**Stub Types**: ${family.stubTypes.join(', ') || 'None assigned'}`
    )
    .join('\n\n')}`;
    }

    private buildStubTypesPrompt(schema: JEditorialSchema): string {
        return `## Available Stub Types

Use ONLY these stub types when suggesting editorial gaps. Each belongs to a vector family:

${schema.stubTypes
    .map(
        (stub) => `### ${stub.displayName} (\`${stub.key}\`)
**Vector Family**: ${stub.vectorFamily}
**Purpose**: ${stub.semanticPurpose}
**Look for**: ${stub.indicators.slice(0, 3).join('; ')}
**Avoid when**: ${stub.antiPatterns.slice(0, 2).join('; ')}
**Default form**: ${stub.defaultForm} | **Penalty**: -${stub.refinementPenalty}`
    )
    .join('\n\n')}

**CRITICAL**: When suggesting stubs of type \`link\` or \`verify\`, you MUST first use search tools to find real sources.`;
    }

    private buildQualityGatesPrompt(schema: JEditorialSchema): string {
        return `## Quality Gates

Each audience level has a minimum refinement threshold. Documents below threshold cannot be promoted to that audience:

${Object.entries(schema.qualityGates)
    .map(([audience, gate]) => `- **${audience}**: requires refinement ≥ ${gate}`)
    .join('\n')}

When analyzing a document, check if it meets its audience's quality gate.`;
    }

    private buildFormulasPrompt(schema: JEditorialSchema): string {
        if (!schema.formulas || schema.formulas.length === 0) {
            return `## L2 Formulas (Computed Dimensions)

Key formulas for computing document metrics:

- **Potential Energy**: Eₚ = urgency × impact × complexity
- **Health**: health = 0.7 × refinement + 0.3 × (1 - stub_penalty)
- **Usefulness Margin**: margin = refinement - quality_gate`;
        }

        return `## L2 Formulas (Computed Dimensions)

${schema.formulas
    .map((f) => `### ${f.name}
**Formula**: ${f.formula}
**Description**: ${f.description}`)
    .join('\n\n')}`;
    }

    private buildToolUseInstructions(policy: ToolUsePolicy): string {
        const policyText = {
            mandatory: `**MANDATORY**: You MUST use search tools before suggesting ANY reference or citation.`,
            encouraged: `**ENCOURAGED**: You should use search tools to verify references when possible.`,
            optional: `**OPTIONAL**: You may use search tools to find sources, but it's not required for all suggestions.`,
            disabled: `**DISABLED**: Focus on document structure and content without external research.`,
        };

        return `## Tool Use Policy: ${policy.toUpperCase()}

${policyText[policy]}

### Available Search Tools

1. **web_search**: General web search for facts, documentation, current information
2. **semantic_search**: Search within the vault for related notes
3. **openalex_search**: Academic paper search for scholarly references

### When to Use Each Tool

| Vector Family | Primary Tool | Use Case |
|---------------|--------------|----------|
| Retrieval | web_search, openalex_search | Finding citations, verifying facts |
| Computation | semantic_search | Finding related vault content for context |
| Synthesis | semantic_search, web_search | Finding conflicting perspectives |
| Creation | semantic_search | Finding related content to expand from |
| Structural | (none) | Reorganization doesn't require external lookup |`;
    }

    private buildReferenceIntegrityRules(): string {
        return `## Reference Integrity Rules (CRITICAL)

These rules are MANDATORY and non-negotiable:

1. **DO NOT use document content as a source**
   - The content you're analyzing is NOT a citable source
   - If the document says "OAuth tokens expire after 1 hour", that claim needs an external source
   - You cannot cite the document itself to verify its own claims

2. **DO NOT invent URLs, DOIs, or citation details**
   - Every URL must come from a search tool result
   - Every DOI must be verified through openalex_search
   - Every vault link must come from semantic_search

3. **DO NOT suggest vault links unless found**
   - Only suggest \`[[Note Name]]\` links if semantic_search returned that note
   - Never guess that a note might exist

4. **Mark unverified references clearly**
   - If you cannot verify a reference, mark it as "⚠️ needs verification"
   - Never present unverified information as fact

5. **Distinguish source types**
   - External URL: verified through web_search
   - Academic: verified through openalex_search
   - Vault note: verified through semantic_search
   - Unverified: clearly marked as such`;
    }

    private buildCreativityModeContext(mode: CreativityModeId): string {
        const modeConfig = CREATIVITY_MODES.find((m) => m.id === mode);
        if (!modeConfig) return '';

        return `## Current Creativity Mode: ${modeConfig.name}

${modeConfig.description}

**Temperature**: ${modeConfig.temperature}
**Tool Policy**: ${modeConfig.toolUsePolicy}

Adjust your analysis approach accordingly:
${mode === 'research' ? '- Prioritize accuracy and verification\n- Every claim needs a source\n- Conservative suggestions only' : ''}
${mode === 'review' ? '- Focus on quality gate alignment\n- Verify key claims\n- Balance thoroughness with practicality' : ''}
${mode === 'draft' ? '- Focus on capturing ideas\n- Verification optional for most claims\n- Encourage exploration' : ''}
${mode === 'creative' ? '- Maximum freedom in suggestions\n- Verification only for core claims\n- Encourage tangential discoveries' : ''}`;
    }

    private buildDocumentStatePrompt(doc: DocumentContext): string {
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

    private buildExistingStubsPrompt(stubs: StubInstance[]): string {
        if (stubs.length === 0) return '';

        return `### Existing Stubs (${stubs.length})

${stubs
    .map(
        (s, i) =>
            `${i + 1}. **${s.type}**: ${s.description}${s.anchorId ? ` (^${s.anchorId})` : ''}${s.form ? ` [${s.form}]` : ''}`
    )
    .join('\n')}

Consider these existing stubs when making suggestions. Avoid duplicating them.`;
    }

    private buildAggregateMetricsPrompt(metrics: AggregateVectorMetrics): string {
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

    // =========================================================================
    // CREATIVITY MODE SUGGESTION
    // =========================================================================

    /**
     * Auto-suggest creativity mode based on document L1 properties
     */
    suggestCreativityMode(doc: DocumentState): CreativityModeId {
        // Research mode: requirement origin + public/trusted audience
        if (doc.origin === 'requirement' && ['public', 'trusted'].includes(doc.audience || '')) {
            return 'research';
        }

        // Research mode: canonical form always needs strict verification
        if (doc.form === 'canonical') {
            return 'research';
        }

        // Review mode: stable/evergreen forms with reasonable refinement
        if (['stable', 'evergreen'].includes(doc.form || '') && doc.refinement >= 0.6) {
            return 'review';
        }

        // Creative mode: insight/curiosity origins with transient/developing forms
        if (
            ['insight', 'curiosity'].includes(doc.origin || '') &&
            ['transient', 'developing'].includes(doc.form || '')
        ) {
            return 'creative';
        }

        // Draft mode: default for developing documents
        if (doc.form === 'developing' || doc.refinement < 0.5) {
            return 'draft';
        }

        // Default to draft
        return 'draft';
    }

    /**
     * Get default template
     */
    private getDefaultTemplate(): PromptTemplate {
        return {
            id: 'default',
            name: 'Default Analysis',
            description: 'General document analysis',
            systemPromptOverride: null,
            vectorFamilyFilter: null,
            isBuiltIn: true,
        };
    }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate aggregate metrics from stubs
 */
export function calculateAggregateMetrics(
    stubs: StubInstance[],
    stubTypes: StubTypeSchema[]
): AggregateVectorMetrics {
    const distribution: Record<VectorFamilyId, number> = {
        Retrieval: 0,
        Computation: 0,
        Synthesis: 0,
        Creation: 0,
        Structural: 0,
    };

    let totalEp = 0;
    let blockingCount = 0;
    let totalPenalty = 0;

    const stubTypeMap = new Map(stubTypes.map((st) => [st.key, st]));

    for (const stub of stubs) {
        const stubType = stubTypeMap.get(stub.type);
        if (stubType) {
            distribution[stubType.vectorFamily]++;
            totalPenalty += stubType.refinementPenalty;

            if (stub.form === 'blocking' || stubType.defaultForm === 'blocking') {
                blockingCount++;
            }
        }

        // Calculate potential energy
        const ep =
            stub.potentialEnergy ||
            (stub.urgency || 0.5) * (stub.impact || 0.5) * (stub.complexity || 0.5);
        totalEp += ep;
    }

    return {
        totalStubs: stubs.length,
        totalPotentialEnergy: totalEp,
        blockingCount,
        vectorFamilyDistribution: distribution,
        estimatedPenalty: totalPenalty,
    };
}

/**
 * Create DocumentState from parsed frontmatter and stubs
 */
export function createDocumentState(
    path: string,
    title: string,
    frontmatter: Record<string, unknown>,
    stubs: StubInstance[]
): DocumentState {
    return {
        path,
        title,
        description: frontmatter.description as string | undefined,
        refinement: (frontmatter.refinement as number) || 0.5,
        origin: frontmatter.origin as string | undefined,
        form: frontmatter.form as string | undefined,
        audience: frontmatter.audience as string | undefined,
        qualityGateStatus: {
            meetsThreshold: true, // Will be calculated by context builder
            requiredThreshold: 0.5,
            currentRefinement: (frontmatter.refinement as number) || 0.5,
            gap: 0,
        },
        existingStubs: stubs,
        aggregateMetrics: {
            totalStubs: stubs.length,
            totalPotentialEnergy: 0,
            blockingCount: 0,
            vectorFamilyDistribution: {
                Retrieval: 0,
                Computation: 0,
                Synthesis: 0,
                Creation: 0,
                Structural: 0,
            },
            estimatedPenalty: 0,
        },
    };
}
