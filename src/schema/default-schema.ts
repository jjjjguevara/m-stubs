/**
 * Default J-Editorial Schema
 *
 * The complete bundled J-Editorial schema defining the ontology for
 * document quality and editorial demand signals. This schema is
 * transmitted to the LLM with every request for grounding context.
 *
 * Based on J-Editorial Framework specifications:
 * - spec-intrinsic-properties.md (L1)
 * - conc-vectors.md (Vector Families)
 */

import {
    JEditorialSchema,
    VectorFamilyDefinition,
    StubTypeSchema,
    FormulaDefinition,
    CreativityModeConfig,
} from './schema-types';

// =============================================================================
// VECTOR FAMILIES (defined first for use in schema)
// =============================================================================

const VECTOR_FAMILIES: VectorFamilyDefinition[] = [
    {
        id: 'Retrieval',
        displayName: 'Retrieval',
        description:
            'Finding existing information that should be cited, linked, or referenced. ' +
            'Work involves searching, locating, and properly attributing external sources.',
        workPattern: 'Search -> Locate -> Verify -> Cite',
        typicalTools: ['web_search', 'semantic_search', 'openalex_search'],
        indicators: [
            'Missing citation for factual claim',
            'Needs reference to external source',
            'Fact to verify against authoritative source',
            'Source needed for statistic or quote',
            'Link to related vault note needed',
        ],
        stubTypes: ['link', 'verify'],
        potentialEnergyWeight: 0.3,
    },
    {
        id: 'Computation',
        displayName: 'Computation',
        description:
            'Resolving ambiguity or making decisions. Work involves analysis, ' +
            'clarification, and selecting among alternatives.',
        workPattern: 'Analyze -> Clarify -> Decide',
        typicalTools: ['semantic_search'],
        indicators: [
            'Ambiguous content needing clarification',
            'Open question requiring resolution',
            'Decision point with multiple options',
            'Unclear scope or boundaries',
            'Implicit assumptions to make explicit',
        ],
        stubTypes: ['clarify', 'question'],
        potentialEnergyWeight: 0.4,
    },
    {
        id: 'Synthesis',
        displayName: 'Synthesis',
        description:
            'Integrating multiple perspectives or resolving conflicts. ' +
            'Work involves comparing viewpoints and finding common ground.',
        workPattern: 'Compare -> Balance -> Integrate',
        typicalTools: ['semantic_search', 'web_search'],
        indicators: [
            'Conflicting sources or recommendations',
            'Multiple valid approaches to present',
            'Debate or controversy to address',
            'Need to balance different perspectives',
            'Integration of disparate information',
        ],
        stubTypes: ['controversy'],
        potentialEnergyWeight: 0.5,
    },
    {
        id: 'Creation',
        displayName: 'Creation',
        description:
            'Generating new content that does not exist elsewhere. ' +
            'Work involves writing, expanding, and developing original material.',
        workPattern: 'Draft -> Develop -> Refine',
        typicalTools: ['semantic_search'],
        indicators: [
            'Section needs more detail or content',
            'Placeholder text to replace',
            'Concept introduced but not explained',
            'Blocking issue requiring resolution',
            'Missing critical content',
        ],
        stubTypes: ['expand', 'blocker', 'todo'],
        potentialEnergyWeight: 0.6,
    },
    {
        id: 'Structural',
        displayName: 'Structural',
        description:
            'Organizing, restructuring, or reorganizing content. ' +
            'Work involves document architecture and information hierarchy.',
        workPattern: 'Assess -> Reorganize -> Connect',
        typicalTools: [],
        indicators: [
            'Document needs restructuring',
            'Sections in wrong order',
            'Missing navigation or headers',
            'Content belongs elsewhere',
            'Needs table of contents or index',
        ],
        stubTypes: [],
        potentialEnergyWeight: 0.2,
    },
];

// =============================================================================
// STUB TYPES (defined first for use in schema)
// =============================================================================

const STUB_TYPES: StubTypeSchema[] = [
    {
        key: 'link',
        displayName: 'Citation Needed',
        description: 'Content needs a citation or reference to external source.',
        vectorFamily: 'Retrieval',
        semanticPurpose:
            'Use when a factual claim, statistic, quote, or technical specification ' +
            'lacks supporting evidence or citation. IMPORTANT: The LLM MUST use search tools to find real sources.',
        indicators: [
            'Statistics or numerical claims without source',
            'Quoted text without attribution',
            'Technical specifications without reference',
            '"According to..." without link',
            'Historical facts or dates without citation',
            'Claims about external systems or standards',
        ],
        antiPatterns: [
            'Self-evident truths that need no citation',
            "Author's own opinions clearly marked as such",
            'Document content cited as its own source (NEVER do this)',
        ],
        defaultForm: 'persistent',
        refinementPenalty: 0.02,
        ontologicalDimension: 'Epistemic Status',
        color: '#e67e22',
        icon: 'link',
    },
    {
        key: 'clarify',
        displayName: 'Clarify',
        description: 'Content is ambiguous and needs clarification.',
        vectorFamily: 'Computation',
        semanticPurpose:
            'Use when content is ambiguous, vague, or could be interpreted multiple ways.',
        indicators: [
            'Ambiguous pronouns or references',
            'Unclear scope or boundaries',
            'Jargon without definition',
            'Vague quantifiers (some, many, few)',
        ],
        antiPatterns: [
            'Content that is simply incomplete (use Expand)',
            'Content with unknown answers (use Question)',
        ],
        defaultForm: 'transient',
        refinementPenalty: 0.015,
        ontologicalDimension: 'Content Completeness',
        color: '#3498db',
        icon: 'help-circle',
    },
    {
        key: 'expand',
        displayName: 'Expand',
        description: 'Section needs more detail or content.',
        vectorFamily: 'Creation',
        semanticPurpose:
            'Use when a topic is introduced but not sufficiently developed for the document\'s intended audience.',
        indicators: [
            'One-sentence explanations of complex topics',
            'Bullet lists that could be paragraphs',
            'Concepts introduced but not explained',
            'Procedures described without steps',
        ],
        antiPatterns: [
            'Intentionally brief overview sections',
            'Summaries meant to be concise',
        ],
        defaultForm: 'transient',
        refinementPenalty: 0.02,
        ontologicalDimension: 'Content Completeness',
        color: '#2ecc71',
        icon: 'plus-circle',
    },
    {
        key: 'question',
        displayName: 'Question',
        description: 'Open question that needs research or decision.',
        vectorFamily: 'Computation',
        semanticPurpose:
            'Use when the author has an unresolved question that affects content direction or accuracy.',
        indicators: [
            'Explicit question marks in content',
            '"TODO: decide..." or similar markers',
            'Uncertainty language: "might", "could", "possibly"',
            'Placeholders like TBD, TBA, XXX',
        ],
        antiPatterns: [
            'Rhetorical questions for effect',
            'Questions answered in following text',
        ],
        defaultForm: 'transient',
        refinementPenalty: 0.015,
        ontologicalDimension: 'Workflow',
        color: '#9b59b6',
        icon: 'message-circle',
    },
    {
        key: 'verify',
        displayName: 'Verify',
        description: 'Content needs fact-checking or verification.',
        vectorFamily: 'Retrieval',
        semanticPurpose:
            'Use when content exists but its accuracy is uncertain. IMPORTANT: LLM MUST use search tools to verify.',
        indicators: [
            'Dates or versions that may be outdated',
            'Information from secondary sources',
            'Content copied from other documents',
            'Technical details that may have changed',
        ],
        antiPatterns: [
            'Content that simply needs a citation (use Citation Needed)',
            'Content known to be wrong (use Blocker)',
        ],
        defaultForm: 'transient',
        refinementPenalty: 0.015,
        ontologicalDimension: 'Epistemic Status',
        color: '#f39c12',
        icon: 'check-circle',
    },
    {
        key: 'controversy',
        displayName: 'Controversy',
        description: 'Conflicting perspectives or unresolved disagreement.',
        vectorFamily: 'Synthesis',
        semanticPurpose:
            'Use when there are conflicting perspectives that need resolution or balanced presentation.',
        indicators: [
            'Contradicting sources or recommendations',
            'Industry debates without consensus',
            'Multiple valid approaches described',
        ],
        antiPatterns: [
            'Simple factual errors (use Blocker)',
            'Personal preference differences',
        ],
        defaultForm: 'blocking',
        refinementPenalty: 0.03,
        ontologicalDimension: 'Perspective',
        color: '#e74c3c',
        icon: 'alert-triangle',
    },
    {
        key: 'blocker',
        displayName: 'Blocker',
        description: 'Cannot proceed until this is resolved.',
        vectorFamily: 'Creation',
        semanticPurpose:
            'Use when there is a known error or critical issue that must be resolved.',
        indicators: [
            'Contradictions within the document',
            'Outdated information (dates, versions)',
            'Broken links or references',
            'Code examples that do not compile',
        ],
        antiPatterns: [
            'Content that is merely incomplete',
            'Opinions that someone disagrees with',
        ],
        defaultForm: 'blocking',
        refinementPenalty: 0.05,
        ontologicalDimension: 'Epistemic Status',
        color: '#c0392b',
        icon: 'octagon',
    },
    {
        key: 'todo',
        displayName: 'Todo',
        description: 'Task reminder or action item.',
        vectorFamily: 'Creation',
        semanticPurpose:
            'Use for general task reminders that do not fit other categories.',
        indicators: [
            'Explicit TODO or FIXME markers',
            'Inline comments about future work',
            'Placeholder content like [TBD]',
        ],
        antiPatterns: [
            'Gaps better served by specific types',
            'Long-term aspirational improvements',
        ],
        defaultForm: 'transient',
        refinementPenalty: 0.01,
        ontologicalDimension: 'Workflow',
        color: '#7f8c8d',
        icon: 'check-square',
    },
];

// =============================================================================
// L2 FORMULAS (defined first for use in schema)
// =============================================================================

const L2_FORMULAS: FormulaDefinition[] = [
    {
        id: 'potential_energy',
        name: 'Potential Energy',
        description: 'Measures the magnitude of work required to resolve a stub.',
        formula: 'Ep = urgency * impact * complexity',
        inputs: [
            { name: 'urgency', source: 'stub.urgency', defaultValue: 0.5 },
            { name: 'impact', source: 'stub.impact', defaultValue: 0.5 },
            { name: 'complexity', source: 'stub.complexity', defaultValue: 0.5 },
        ],
        outputType: 'number',
        unit: 'Ep',
        layer: 'L2',
    },
    {
        id: 'health',
        name: 'Document Health',
        description: 'Overall document quality score.',
        formula: 'health = 0.7 * refinement + 0.3 * (1 - stub_penalty)',
        inputs: [
            { name: 'refinement', source: 'document.refinement', defaultValue: 0.5 },
            { name: 'stub_penalty', source: 'document.stub_penalty', defaultValue: 0 },
        ],
        outputType: 'number',
        unit: 'health',
        layer: 'L2',
    },
    {
        id: 'usefulness_margin',
        name: 'Usefulness Margin',
        description: 'Gap between current refinement and audience quality gate.',
        formula: 'margin = refinement - quality_gate',
        inputs: [
            { name: 'refinement', source: 'document.refinement', defaultValue: 0.5 },
            { name: 'quality_gate', source: 'document.audience_gate', defaultValue: 0.5 },
        ],
        outputType: 'number',
        unit: 'margin',
        layer: 'L2',
    },
];

// =============================================================================
// BUNDLED J-EDITORIAL SCHEMA v1.0.0
// =============================================================================

export const DEFAULT_J_EDITORIAL_SCHEMA: JEditorialSchema = {
    version: '1.0.0',
    mode: 'extend',

    // =========================================================================
    // L1 INTRINSIC PROPERTIES (Essential 5)
    // =========================================================================
    intrinsicProperties: {
        refinement: {
            key: 'refinement',
            displayName: 'Refinement',
            description:
                'Quality score measuring how well content aligns with stated purpose. ' +
                'A value between 0.00 (raw draft) and 1.00 (publication ready). ' +
                'This is the PRIMARY quality metric for J-Editorial documents.',
            type: 'number',
            questionAnswered:
                "How well does the content align with the note's stated purpose?",
            required: true,
            min: 0.0,
            max: 1.0,
            defaultValue: 0.5,
            ranges: [
                {
                    min: 0.0,
                    max: 0.3,
                    label: 'Draft',
                    semanticMeaning:
                        'Raw capture, placeholder content, minimal structure. ' +
                        'Expect significant gaps, unclear organization, missing context.',
                },
                {
                    min: 0.3,
                    max: 0.5,
                    label: 'Developing',
                    semanticMeaning:
                        'Core ideas present but incomplete. Some structure exists, ' +
                        'major sections identified but not fully developed.',
                },
                {
                    min: 0.5,
                    max: 0.7,
                    label: 'Review Ready',
                    semanticMeaning:
                        'Content substantially complete. Appropriate for internal ' +
                        'sharing and feedback. May have gaps but core value is present.',
                },
                {
                    min: 0.7,
                    max: 0.9,
                    label: 'Polished',
                    semanticMeaning:
                        'High quality content with proper citations, clear structure, ' +
                        'and professional presentation. Ready for trusted audiences.',
                },
                {
                    min: 0.9,
                    max: 1.0,
                    label: 'Publication Ready',
                    semanticMeaning:
                        'Fully verified, professionally edited, meets external publication ' +
                        'standards. All claims cited, all gaps resolved.',
                },
            ],
        },

        origin: {
            key: 'origin',
            displayName: 'Origin',
            description:
                'Creation driver - what created the need for this note. ' +
                'Answers WHY the document exists and what should motivate its completion.',
            type: 'enum',
            questionAnswered:
                'What created the need for this note? Why should I persist in completing it?',
            required: false,
            defaultValue: 'curiosity',
            values: [
                {
                    key: 'question',
                    displayName: 'Question',
                    description:
                        'Specific inquiry or problem to solve. Document exists to answer something.',
                    semanticMeaning:
                        'Note exists to answer a specific question. LLM should help find ' +
                        'the answer through research and tool use. Focus on accuracy and ' +
                        'completeness of the answer.',
                },
                {
                    key: 'requirement',
                    displayName: 'Requirement',
                    description:
                        'Workflow or operational necessity. Document is obligatory.',
                    semanticMeaning:
                        'Note is obligatory - focus on completeness over creativity. ' +
                        'Ensure all required elements are present. Use Research mode.',
                },
                {
                    key: 'insight',
                    displayName: 'Insight',
                    description:
                        'Spontaneous realization or discovery. Document captures a breakthrough.',
                    semanticMeaning:
                        'Note captures a breakthrough. Help develop and connect the insight ' +
                        'to existing knowledge. Encourage Creative mode exploration.',
                },
                {
                    key: 'dialogue',
                    displayName: 'Dialogue',
                    description:
                        'Discussion or collaborative exchange. Document synthesizes conversation.',
                    semanticMeaning:
                        'Note synthesizes conversation or multiple perspectives. ' +
                        'Help balance viewpoints and identify areas of agreement/disagreement.',
                },
                {
                    key: 'curiosity',
                    displayName: 'Curiosity',
                    description:
                        'Exploratory interest or voluntary learning. Self-directed exploration.',
                    semanticMeaning:
                        'Note is self-directed learning. Encourage exploration and tangential ' +
                        'discoveries. Creative mode appropriate. Lower verification urgency.',
                },
                {
                    key: 'derivative',
                    displayName: 'Derivative',
                    description:
                        'Derived from other artifacts. Document adapts or transforms a source.',
                    semanticMeaning:
                        'Note adapts source material. Check for accuracy to original. ' +
                        'Ensure proper attribution. May need verification of transformations.',
                },
                {
                    key: 'experimental',
                    displayName: 'Experimental',
                    description:
                        'Hypothesis testing or prototype. Document tests ideas.',
                    semanticMeaning:
                        'Note tests ideas or hypotheses. Help design experiments, ' +
                        'identify variables, suggest validation approaches.',
                },
            ],
        },

        form: {
            key: 'form',
            displayName: 'Form',
            description:
                'Permanence intent - how long the document is expected to remain relevant. ' +
                'Influences review cycles and maintenance expectations.',
            type: 'enum',
            questionAnswered:
                'What is the intended lifespan and permanence of this document?',
            required: false,
            defaultValue: 'developing',
            values: [
                {
                    key: 'transient',
                    displayName: 'Transient',
                    description:
                        'Short-lived notes, meeting captures, temporary references.',
                    semanticMeaning:
                        'Disposable content - lower quality standards acceptable. ' +
                        'Do not invest heavily in verification or structure.',
                },
                {
                    key: 'developing',
                    displayName: 'Developing',
                    description:
                        'Active work in progress. Expected to evolve significantly.',
                    semanticMeaning:
                        'Work in progress - expect changes. Focus on capturing ideas ' +
                        'over polish. Draft mode appropriate.',
                },
                {
                    key: 'stable',
                    displayName: 'Stable',
                    description:
                        'Mature content with occasional updates. Core content settled.',
                    semanticMeaning:
                        'Core content settled. Updates should be careful and reviewed. ' +
                        'Higher verification standards. Review mode appropriate.',
                },
                {
                    key: 'evergreen',
                    displayName: 'Evergreen',
                    description:
                        'Long-term reference material. Maintained for ongoing relevance.',
                    semanticMeaning:
                        'Reference material - must be accurate and well-maintained. ' +
                        'High verification standards. Check for outdated information.',
                },
                {
                    key: 'canonical',
                    displayName: 'Canonical',
                    description:
                        'Authoritative source. Single source of truth for a topic.',
                    semanticMeaning:
                        'Authoritative document - highest quality standards. ' +
                        'All claims must be verified. Research mode mandatory.',
                },
            ],
        },

        audience: {
            key: 'audience',
            displayName: 'Audience',
            description:
                'Visibility scope AND quality gate. Determines who can see the document ' +
                'and what minimum refinement is required.',
            type: 'enum',
            questionAnswered:
                'Who is the intended reader and what quality level is required?',
            required: false,
            defaultValue: 'personal',
            values: [
                {
                    key: 'personal',
                    displayName: 'Personal',
                    description: 'Private notes for self only.',
                    semanticMeaning:
                        'Private content - minimal external standards. ' +
                        'Focus on usefulness to author over presentation.',
                    qualityGate: 0.5,
                },
                {
                    key: 'internal',
                    displayName: 'Internal',
                    description: 'Shared within organization or team.',
                    semanticMeaning:
                        'Team-shared content - needs to be understandable by colleagues. ' +
                        'Define jargon, provide context. Medium verification.',
                    qualityGate: 0.7,
                },
                {
                    key: 'trusted',
                    displayName: 'Trusted',
                    description: 'Shared with trusted external parties.',
                    semanticMeaning:
                        'External but trusted audience - professional standards. ' +
                        'Verify claims, proper citations, clear structure.',
                    qualityGate: 0.8,
                },
                {
                    key: 'public',
                    displayName: 'Public',
                    description: 'Publicly accessible content.',
                    semanticMeaning:
                        'Public content - publication-quality standards. ' +
                        'All claims verified, proper citations, professional editing. ' +
                        'Research mode mandatory.',
                    qualityGate: 0.9,
                },
            ],
        },

        stubs: {
            key: 'stubs',
            displayName: 'Stubs',
            description:
                'Array of editorial demand signals. Each stub represents a gap, ' +
                'todo, or quality issue that needs resolution.',
            type: 'array',
            questionAnswered: 'What editorial work remains to be done on this document?',
            required: false,
            itemSchema: 'StubTypeSchema',
            warningThreshold: 10,
        },
    },

    // =========================================================================
    // VECTOR FAMILIES (5 Work Classification Categories)
    // =========================================================================
    vectorFamilies: VECTOR_FAMILIES,

    // =========================================================================
    // STUB TYPES
    // =========================================================================
    stubTypes: STUB_TYPES,

    // =========================================================================
    // QUALITY GATES
    // =========================================================================
    qualityGates: {
        personal: 0.5,
        internal: 0.7,
        trusted: 0.8,
        public: 0.9,
    },

    // =========================================================================
    // L2 FORMULAS (Computed Dimensions)
    // =========================================================================
    formulas: L2_FORMULAS,
};

// =============================================================================
// CREATIVITY MODE PRESETS
// =============================================================================

export const CREATIVITY_MODES: CreativityModeConfig[] = [
    {
        id: 'research',
        name: 'Research Mode',
        description:
            'Strict sourcing and verification. Tool use is mandatory for any reference. ' +
            'Best for requirement/question origin documents with public/trusted audiences.',
        temperature: 0.3,
        toolUsePolicy: 'mandatory',
        autoSuggestConditions: [
            { property: 'origin', operator: 'equals', value: 'requirement' },
            { property: 'audience', operator: 'in', value: ['public', 'trusted'] },
        ],
    },
    {
        id: 'review',
        name: 'Review Mode',
        description:
            'Quality gate focus for stable/evergreen documents. Tool use encouraged ' +
            'for verification. Best near publication threshold.',
        temperature: 0.5,
        toolUsePolicy: 'encouraged',
        autoSuggestConditions: [
            { property: 'form', operator: 'in', value: ['stable', 'evergreen', 'canonical'] },
            { property: 'refinement', operator: 'greater_than', value: 0.6 },
        ],
    },
    {
        id: 'draft',
        name: 'Draft Mode',
        description:
            'Exploratory mode for developing documents. Tool use optional. ' +
            'Focus on capturing ideas over verification.',
        temperature: 0.7,
        toolUsePolicy: 'optional',
        autoSuggestConditions: [
            { property: 'form', operator: 'equals', value: 'developing' },
            { property: 'refinement', operator: 'less_than', value: 0.5 },
        ],
    },
    {
        id: 'creative',
        name: 'Creative Mode',
        description:
            'Maximum freedom for insight/curiosity origins. Lower verification urgency. ' +
            'Encourages exploration and tangential discoveries.',
        temperature: 0.9,
        toolUsePolicy: 'optional',
        autoSuggestConditions: [
            { property: 'origin', operator: 'in', value: ['insight', 'curiosity'] },
            { property: 'form', operator: 'in', value: ['transient', 'developing'] },
        ],
    },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get vector family by ID
 */
export function getVectorFamily(id: string): VectorFamilyDefinition | undefined {
    return VECTOR_FAMILIES.find((f) => f.id === id);
}

/**
 * Get stub type schema by key
 */
export function getStubTypeSchema(key: string): StubTypeSchema | undefined {
    return STUB_TYPES.find((s) => s.key === key);
}

/**
 * Get quality gate for audience level
 */
export function getQualityGate(audience: string): number {
    return DEFAULT_J_EDITORIAL_SCHEMA.qualityGates[audience] ?? 0.5;
}

/**
 * Get stub types for a vector family
 */
export function getStubTypesForFamily(familyId: string): StubTypeSchema[] {
    return STUB_TYPES.filter((s) => s.vectorFamily === familyId);
}

/**
 * Calculate potential energy for a stub
 */
export function calculatePotentialEnergy(
    urgency: number = 0.5,
    impact: number = 0.5,
    complexity: number = 0.5
): number {
    return urgency * impact * complexity;
}
