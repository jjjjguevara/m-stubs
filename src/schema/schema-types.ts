/**
 * J-Editorial Schema Types
 *
 * Defines the ontology for document quality and editorial demand signals.
 * This schema is transmitted to the LLM with every request to provide
 * grounding context for J-Editorial concepts.
 *
 * Architecture:
 * - L1 (Intrinsic): Properties that describe what documents ARE
 * - L2 (Extrinsic): Computed dimensions derived from L1 + context
 * - L3 (Operational): Rules and automation behaviors
 */

// =============================================================================
// CORE SCHEMA INTERFACE
// =============================================================================

/**
 * Complete J-Editorial Schema Definition
 * This is the "grammar" that teaches the LLM how to think about documents.
 */
export interface JEditorialSchema {
    /** Schema version for compatibility tracking */
    version: string;

    /** How user schema applies to bundled default: 'extend' merges, 'replace' overrides */
    mode: SchemaMode;

    /** L1 Intrinsic Properties (Essential 5) */
    intrinsicProperties: IntrinsicProperties;

    /** Vector Families (5 work classification categories) */
    vectorFamilies: VectorFamilyDefinition[];

    /** Stub Types (the actual demand signal types) */
    stubTypes: StubTypeSchema[];

    /** Quality Gates (audience → minimum refinement threshold) */
    qualityGates: QualityGates;

    /** Formulas for L2 computed dimensions (future use) */
    formulas?: FormulaDefinition[];
}

export type SchemaMode = 'extend' | 'replace';

// =============================================================================
// INTRINSIC PROPERTIES (L1)
// =============================================================================

/**
 * The Essential 5 intrinsic properties that every J-Editorial document has.
 */
export interface IntrinsicProperties {
    /** Quality score measuring alignment with stated purpose (0.00-1.00) */
    refinement: NumberPropertyDefinition;

    /** Creation driver - what created the need for this note */
    origin: EnumPropertyDefinition<OriginValue>;

    /** Permanence intent - how long the document should live */
    form: EnumPropertyDefinition<FormValue>;

    /** Visibility scope + quality gate */
    audience: EnumPropertyDefinition<AudienceValue>;

    /** Editorial demand signals (stubs array) */
    stubs: StubsPropertyDefinition;
}

// =============================================================================
// PROPERTY DEFINITIONS
// =============================================================================

/**
 * Base property definition with common fields
 */
export interface PropertyDefinitionBase {
    /** Unique key for the property */
    key: string;

    /** Human-readable display name */
    displayName: string;

    /** Full description of the property */
    description: string;

    /** Property data type */
    type: PropertyType;

    /** What question does this property answer? (for LLM context) */
    questionAnswered: string;

    /** Is this property required in every document? */
    required: boolean;
}

export type PropertyType = 'number' | 'string' | 'enum' | 'array' | 'object';

/**
 * Number property definition (e.g., refinement)
 */
export interface NumberPropertyDefinition extends PropertyDefinitionBase {
    type: 'number';

    /** Minimum value (inclusive) */
    min: number;

    /** Maximum value (inclusive) */
    max: number;

    /** Default value if not specified */
    defaultValue: number;

    /** Scoring ranges with semantic meanings */
    ranges?: NumberRange[];
}

export interface NumberRange {
    /** Minimum value for this range (inclusive) */
    min: number;

    /** Maximum value for this range (exclusive, except for final range) */
    max: number;

    /** Label for this range (e.g., "Draft", "Review Ready") */
    label: string;

    /** Semantic meaning for LLM context */
    semanticMeaning: string;
}

/**
 * Enum property definition (e.g., origin, form, audience)
 */
export interface EnumPropertyDefinition<T extends EnumValue = EnumValue>
    extends PropertyDefinitionBase {
    type: 'enum';

    /** Available enum values */
    values: T[];

    /** Default value if not specified */
    defaultValue?: string;
}

/**
 * Base enum value definition
 */
export interface EnumValue {
    /** Unique key for the value */
    key: string;

    /** Human-readable display name */
    displayName: string;

    /** Full description of this value */
    description: string;

    /** What this value means for LLM analysis */
    semanticMeaning: string;
}

/**
 * Origin enum values - what created the need for this note
 */
export interface OriginValue extends EnumValue {
    key:
        | 'question'
        | 'requirement'
        | 'insight'
        | 'dialogue'
        | 'curiosity'
        | 'derivative'
        | 'experimental';
}

/**
 * Form enum values - permanence intent
 */
export interface FormValue extends EnumValue {
    key: 'transient' | 'developing' | 'stable' | 'evergreen' | 'canonical';
}

/**
 * Audience enum values - visibility scope + quality gate
 */
export interface AudienceValue extends EnumValue {
    key: 'personal' | 'internal' | 'trusted' | 'public';

    /** Minimum refinement threshold for this audience */
    qualityGate: number;
}

/**
 * Stubs array property definition
 */
export interface StubsPropertyDefinition extends PropertyDefinitionBase {
    type: 'array';

    /** Reference to stub type schemas */
    itemSchema: 'StubTypeSchema';

    /** Maximum stubs before document is considered overloaded */
    warningThreshold?: number;
}

// =============================================================================
// VECTOR FAMILIES
// =============================================================================

/**
 * Vector Family Definition
 * The 5 categories that classify editorial work types
 */
export interface VectorFamilyDefinition {
    /** Unique identifier */
    id: VectorFamilyId;

    /** Human-readable name */
    displayName: string;

    /** Full description of this family */
    description: string;

    /** Typical work pattern (e.g., "Search, locate, cite") */
    workPattern: string;

    /** Tools appropriate for this family */
    typicalTools: string[];

    /** Patterns that suggest a stub belongs to this family */
    indicators: string[];

    /** Stub type keys that belong to this family */
    stubTypes: string[];

    /** Weight for potential energy calculation */
    potentialEnergyWeight: number;
}

export type VectorFamilyId =
    | 'Retrieval'
    | 'Computation'
    | 'Synthesis'
    | 'Creation'
    | 'Structural';

// =============================================================================
// STUB TYPES
// =============================================================================

/**
 * Stub Type Schema Definition
 * Defines a single type of editorial demand signal
 */
export interface StubTypeSchema {
    /** Unique key (e.g., 'link', 'expand', 'verify') */
    key: string;

    /** Human-readable display name */
    displayName: string;

    /** Full description */
    description: string;

    /** Which vector family this stub belongs to */
    vectorFamily: VectorFamilyId;

    /** Detailed guidance for when to use this stub type (for LLM) */
    semanticPurpose: string;

    /** Patterns that suggest this stub type is needed */
    indicators: string[];

    /** When NOT to use this stub type */
    antiPatterns: string[];

    /** Default form for new stubs of this type */
    defaultForm: StubForm;

    /** How much this stub type reduces refinement (0.00-0.10 typically) */
    refinementPenalty: number;

    /** Ontological dimension this stub addresses */
    ontologicalDimension?: OntologicalDimension;

    /** Display properties */
    color?: string;
    icon?: string;
}

export type StubForm = 'transient' | 'persistent' | 'blocking' | 'structural';

export type OntologicalDimension =
    | 'Epistemic Status'
    | 'Content Completeness'
    | 'Perspective'
    | 'Workflow';

// =============================================================================
// QUALITY GATES
// =============================================================================

/**
 * Quality Gates mapping audience to minimum refinement
 */
export type QualityGates = Record<string, number>;

// =============================================================================
// FORMULAS (L2 Computed Dimensions)
// =============================================================================

/**
 * Formula Definition for L2 computed dimensions
 */
export interface FormulaDefinition {
    /** Unique identifier */
    id: string;

    /** Human-readable name */
    name: string;

    /** Full description */
    description: string;

    /** Formula expression (e.g., "urgency × impact × complexity") */
    formula: string;

    /** Input variables and their sources */
    inputs: FormulaInput[];

    /** Output type */
    outputType: 'number' | 'boolean' | 'string';

    /** Unit of measurement if applicable */
    unit?: string;

    /** Layer this formula belongs to */
    layer: 'L2' | 'L3';
}

export interface FormulaInput {
    /** Variable name */
    name: string;

    /** Source property path (e.g., "stubs[].urgency") */
    source: string;

    /** Default value if source is missing */
    defaultValue?: number | string | boolean;
}

// =============================================================================
// DOCUMENT STATE (Instance Context)
// =============================================================================

/**
 * Document State for LLM context
 * Represents the current state of a document within the schema
 */
export interface DocumentState {
    /** File path */
    path: string;

    /** Document title */
    title: string;

    /** Document description/summary */
    description?: string;

    /** L1 Properties */
    refinement: number;
    origin?: string;
    form?: string;
    audience?: string;

    /** Quality gate status */
    qualityGateStatus: QualityGateStatus;

    /** Existing stubs */
    existingStubs: StubInstance[];

    /** Aggregate metrics */
    aggregateMetrics: AggregateVectorMetrics;
}

export interface QualityGateStatus {
    /** Whether the document meets its audience's quality gate */
    meetsThreshold: boolean;

    /** The required threshold */
    requiredThreshold: number;

    /** Current refinement */
    currentRefinement: number;

    /** Gap to threshold (negative if below) */
    gap: number;
}

export interface StubInstance {
    /** Stub type key */
    type: string;

    /** Stub description */
    description: string;

    /** Anchor ID if present */
    anchorId?: string;

    /** Stub form */
    form?: StubForm;

    /** Vector magnitude components (if specified) */
    urgency?: number;
    impact?: number;
    complexity?: number;

    /** Calculated potential energy */
    potentialEnergy?: number;

    /** Line number in document */
    lineNumber?: number;
}

export interface AggregateVectorMetrics {
    /** Total stubs count */
    totalStubs: number;

    /** Total potential energy across all stubs */
    totalPotentialEnergy: number;

    /** Count of blocking stubs */
    blockingCount: number;

    /** Distribution across vector families */
    vectorFamilyDistribution: Record<VectorFamilyId, number>;

    /** Estimated refinement penalty from stubs */
    estimatedPenalty: number;
}

// =============================================================================
// CREATIVITY MODES
// =============================================================================

/**
 * Creativity Mode Configuration
 * Adjusts LLM behavior based on document properties
 */
export interface CreativityModeConfig {
    /** Unique identifier */
    id: CreativityModeId;

    /** Human-readable name */
    name: string;

    /** Full description */
    description: string;

    /** LLM temperature setting (0.0-1.0) */
    temperature: number;

    /** Tool use policy */
    toolUsePolicy: ToolUsePolicy;

    /** When this mode is auto-suggested (based on L1 properties) */
    autoSuggestConditions: AutoSuggestCondition[];
}

export type CreativityModeId = 'research' | 'review' | 'draft' | 'creative';

export type ToolUsePolicy = 'mandatory' | 'encouraged' | 'optional' | 'disabled';

export interface AutoSuggestCondition {
    /** Property to check */
    property: 'origin' | 'form' | 'audience' | 'refinement';

    /** Operator */
    operator: 'equals' | 'in' | 'less_than' | 'greater_than';

    /** Value to compare against */
    value: string | string[] | number;
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Schema validation result
 */
export interface SchemaValidationResult {
    /** Whether the schema is valid */
    valid: boolean;

    /** Validation errors if any */
    errors: SchemaValidationError[];

    /** Validation warnings */
    warnings: SchemaValidationWarning[];
}

export interface SchemaValidationError {
    /** Path to the invalid property */
    path: string;

    /** Error message */
    message: string;

    /** Expected type or value */
    expected?: string;

    /** Actual type or value */
    actual?: string;
}

export interface SchemaValidationWarning {
    /** Path to the property */
    path: string;

    /** Warning message */
    message: string;
}
