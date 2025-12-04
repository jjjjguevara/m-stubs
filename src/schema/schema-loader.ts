/**
 * Schema Loader Service
 *
 * Loads, merges, and validates J-Editorial schemas.
 * Supports user overrides from vault's .doc-doctor/schema.yaml
 */

import { App, TFile, normalizePath } from 'obsidian';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import {
    JEditorialSchema,
    SchemaValidationResult,
    SchemaValidationError,
    SchemaValidationWarning,
    VectorFamilyDefinition,
    StubTypeSchema,
    FormulaDefinition,
    SchemaMode,
} from './schema-types';
import { DEFAULT_J_EDITORIAL_SCHEMA, CREATIVITY_MODES } from './default-schema';

// =============================================================================
// CONSTANTS
// =============================================================================

const SCHEMA_FILE_PATH = '.doc-doctor/schema.yaml';
const SCHEMA_FILE_NAME = 'schema.yaml';
const DOC_DOCTOR_DIR = '.doc-doctor';

// =============================================================================
// SCHEMA LOADER CLASS
// =============================================================================

export class SchemaLoader {
    private app: App;
    private bundledSchema: JEditorialSchema;
    private userSchema: Partial<JEditorialSchema> | null = null;
    private effectiveSchema: JEditorialSchema;
    private fileWatcherRegistered = false;

    constructor(app: App) {
        this.app = app;
        this.bundledSchema = DEFAULT_J_EDITORIAL_SCHEMA;
        this.effectiveSchema = { ...this.bundledSchema };
    }

    /**
     * Initialize the schema loader
     * Loads user schema if present and sets up file watcher
     */
    async initialize(): Promise<void> {
        await this.loadUserSchema();
        this.watchUserSchema();
    }

    /**
     * Load user schema from vault's .doc-doctor/schema.yaml
     */
    async loadUserSchema(): Promise<void> {
        const schemaPath = normalizePath(SCHEMA_FILE_PATH);
        const file = this.app.vault.getAbstractFileByPath(schemaPath);

        if (file instanceof TFile) {
            try {
                const content = await this.app.vault.read(file);
                const parsed = parseYaml(content);

                // Validate parsed schema
                const validation = this.validatePartialSchema(parsed);
                if (validation.valid) {
                    this.userSchema = parsed as Partial<JEditorialSchema>;
                    console.log('[SchemaLoader] Loaded user schema from', schemaPath);
                } else {
                    console.warn(
                        '[SchemaLoader] User schema validation errors:',
                        validation.errors
                    );
                    this.userSchema = null;
                }
            } catch (error) {
                console.error('[SchemaLoader] Failed to load user schema:', error);
                this.userSchema = null;
            }
        } else {
            this.userSchema = null;
        }

        // Recompute effective schema
        this.effectiveSchema = this.computeEffectiveSchema();
    }

    /**
     * Watch for changes to user schema file
     */
    watchUserSchema(): void {
        if (this.fileWatcherRegistered) return;

        this.app.vault.on('modify', async (file) => {
            if (file.path === normalizePath(SCHEMA_FILE_PATH)) {
                console.log('[SchemaLoader] User schema modified, reloading...');
                await this.loadUserSchema();
            }
        });

        this.app.vault.on('create', async (file) => {
            if (file.path === normalizePath(SCHEMA_FILE_PATH)) {
                console.log('[SchemaLoader] User schema created, loading...');
                await this.loadUserSchema();
            }
        });

        this.app.vault.on('delete', (file) => {
            if (file.path === normalizePath(SCHEMA_FILE_PATH)) {
                console.log('[SchemaLoader] User schema deleted, reverting to bundled...');
                this.userSchema = null;
                this.effectiveSchema = this.computeEffectiveSchema();
            }
        });

        this.fileWatcherRegistered = true;
    }

    /**
     * Compute effective schema by merging bundled with user schema
     */
    computeEffectiveSchema(): JEditorialSchema {
        if (!this.userSchema) {
            return { ...this.bundledSchema };
        }

        const mode: SchemaMode = this.userSchema.mode || 'extend';

        if (mode === 'replace') {
            // Replace mode: user schema completely overrides bundled
            return this.mergeSchemas(this.bundledSchema, this.userSchema, true);
        }

        // Extend mode: merge user schema into bundled
        return this.mergeSchemas(this.bundledSchema, this.userSchema, false);
    }

    /**
     * Merge two schemas
     */
    private mergeSchemas(
        base: JEditorialSchema,
        override: Partial<JEditorialSchema>,
        replace: boolean
    ): JEditorialSchema {
        const merged: JEditorialSchema = { ...base };

        // Merge version
        if (override.version) {
            merged.version = `${base.version}+user:${override.version}`;
        }

        // Merge vector families
        if (override.vectorFamilies) {
            if (replace) {
                merged.vectorFamilies = override.vectorFamilies as VectorFamilyDefinition[];
            } else {
                merged.vectorFamilies = this.mergeArrayById(
                    base.vectorFamilies,
                    override.vectorFamilies as VectorFamilyDefinition[],
                    'id'
                );
            }
        }

        // Merge stub types
        if (override.stubTypes) {
            if (replace) {
                merged.stubTypes = override.stubTypes as StubTypeSchema[];
            } else {
                merged.stubTypes = this.mergeArrayById(
                    base.stubTypes,
                    override.stubTypes as StubTypeSchema[],
                    'key'
                );
            }
        }

        // Merge quality gates
        if (override.qualityGates) {
            if (replace) {
                merged.qualityGates = override.qualityGates;
            } else {
                merged.qualityGates = { ...base.qualityGates, ...override.qualityGates };
            }
        }

        // Merge formulas
        if (override.formulas) {
            if (replace) {
                merged.formulas = override.formulas;
            } else {
                merged.formulas = this.mergeArrayById(
                    base.formulas || [],
                    override.formulas as FormulaDefinition[],
                    'id'
                );
            }
        }

        return merged;
    }

    /**
     * Merge arrays by ID field
     */
    private mergeArrayById<T>(
        base: T[],
        override: T[],
        idField: keyof T
    ): T[] {
        const merged = [...base];

        for (const item of override) {
            const itemId = item[idField];
            const existingIndex = merged.findIndex(
                (m) => m[idField] === itemId
            );
            if (existingIndex >= 0) {
                // Override existing
                merged[existingIndex] = { ...merged[existingIndex], ...item };
            } else {
                // Add new
                merged.push(item);
            }
        }

        return merged;
    }

    /**
     * Get current effective schema
     */
    getSchema(): JEditorialSchema {
        return this.effectiveSchema;
    }

    /**
     * Get bundled default schema
     */
    getBundledSchema(): JEditorialSchema {
        return this.bundledSchema;
    }

    /**
     * Get user schema if present
     */
    getUserSchema(): Partial<JEditorialSchema> | null {
        return this.userSchema;
    }

    /**
     * Check if user schema is loaded
     */
    hasUserSchema(): boolean {
        return this.userSchema !== null;
    }

    /**
     * Get schema source description
     */
    getSchemaSource(): string {
        if (!this.userSchema) {
            return 'Bundled default';
        }
        const mode = this.userSchema.mode || 'extend';
        return `Vault override (${mode} mode)`;
    }

    /**
     * Export current schema as YAML
     */
    exportSchemaAsYAML(): string {
        const exportSchema = {
            // Header comment will be added separately
            version: '1.0.0',
            mode: 'extend' as const,

            // Only export customizable sections
            stubTypes: this.effectiveSchema.stubTypes.map((st) => ({
                key: st.key,
                displayName: st.displayName,
                description: st.description,
                vectorFamily: st.vectorFamily,
                semanticPurpose: st.semanticPurpose,
                indicators: st.indicators,
                antiPatterns: st.antiPatterns,
                defaultForm: st.defaultForm,
                refinementPenalty: st.refinementPenalty,
                color: st.color,
                icon: st.icon,
            })),

            vectorFamilies: this.effectiveSchema.vectorFamilies.map((vf) => ({
                id: vf.id,
                displayName: vf.displayName,
                description: vf.description,
                workPattern: vf.workPattern,
                typicalTools: vf.typicalTools,
                stubTypes: vf.stubTypes,
                potentialEnergyWeight: vf.potentialEnergyWeight,
            })),

            qualityGates: this.effectiveSchema.qualityGates,
        };

        const header = `# J-Editorial Schema Override
# Place this file at: .doc-doctor/schema.yaml
#
# Mode options:
#   - extend: Merge with bundled schema (add/override items)
#   - replace: Completely replace bundled schema
#
# Schema version: ${this.bundledSchema.version}
# Generated: ${new Date().toISOString()}
#
# Customize stub types, vector families, and quality gates below.
# Delete sections you don't want to customize.

`;

        return header + stringifyYaml(exportSchema, { lineWidth: 100 });
    }

    /**
     * Save schema export to vault
     */
    async saveSchemaExport(): Promise<string> {
        const content = this.exportSchemaAsYAML();
        const dirPath = normalizePath(DOC_DOCTOR_DIR);
        const filePath = normalizePath(SCHEMA_FILE_PATH);

        // Ensure directory exists
        const dir = this.app.vault.getAbstractFileByPath(dirPath);
        if (!dir) {
            await this.app.vault.createFolder(dirPath);
        }

        // Create or update file
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
            await this.app.vault.modify(file, content);
        } else {
            await this.app.vault.create(filePath, content);
        }

        return filePath;
    }

    /**
     * Validate a partial schema (for user overrides)
     */
    validatePartialSchema(schema: unknown): SchemaValidationResult {
        const errors: SchemaValidationError[] = [];
        const warnings: SchemaValidationWarning[] = [];

        if (typeof schema !== 'object' || schema === null) {
            errors.push({
                path: '',
                message: 'Schema must be an object',
                expected: 'object',
                actual: typeof schema,
            });
            return { valid: false, errors, warnings };
        }

        const obj = schema as Record<string, unknown>;

        // Validate mode
        if (obj.mode !== undefined) {
            if (obj.mode !== 'extend' && obj.mode !== 'replace') {
                errors.push({
                    path: 'mode',
                    message: 'Mode must be "extend" or "replace"',
                    expected: '"extend" | "replace"',
                    actual: String(obj.mode),
                });
            }
        }

        // Validate version
        if (obj.version !== undefined && typeof obj.version !== 'string') {
            errors.push({
                path: 'version',
                message: 'Version must be a string',
                expected: 'string',
                actual: typeof obj.version,
            });
        }

        // Validate stub types
        if (obj.stubTypes !== undefined) {
            if (!Array.isArray(obj.stubTypes)) {
                errors.push({
                    path: 'stubTypes',
                    message: 'stubTypes must be an array',
                    expected: 'array',
                    actual: typeof obj.stubTypes,
                });
            } else {
                obj.stubTypes.forEach((st, i) => {
                    const stubErrors = this.validateStubType(st, `stubTypes[${i}]`);
                    errors.push(...stubErrors);
                });
            }
        }

        // Validate vector families
        if (obj.vectorFamilies !== undefined) {
            if (!Array.isArray(obj.vectorFamilies)) {
                errors.push({
                    path: 'vectorFamilies',
                    message: 'vectorFamilies must be an array',
                    expected: 'array',
                    actual: typeof obj.vectorFamilies,
                });
            } else {
                obj.vectorFamilies.forEach((vf, i) => {
                    const vfErrors = this.validateVectorFamily(vf, `vectorFamilies[${i}]`);
                    errors.push(...vfErrors);
                });
            }
        }

        // Validate quality gates
        if (obj.qualityGates !== undefined) {
            if (typeof obj.qualityGates !== 'object' || obj.qualityGates === null) {
                errors.push({
                    path: 'qualityGates',
                    message: 'qualityGates must be an object',
                    expected: 'object',
                    actual: typeof obj.qualityGates,
                });
            } else {
                const gates = obj.qualityGates as Record<string, unknown>;
                for (const [key, value] of Object.entries(gates)) {
                    if (typeof value !== 'number' || value < 0 || value > 1) {
                        errors.push({
                            path: `qualityGates.${key}`,
                            message: 'Quality gate value must be a number between 0 and 1',
                            expected: 'number (0-1)',
                            actual: String(value),
                        });
                    }
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }

    /**
     * Validate a stub type definition
     */
    private validateStubType(st: unknown, path: string): SchemaValidationError[] {
        const errors: SchemaValidationError[] = [];

        if (typeof st !== 'object' || st === null) {
            errors.push({
                path,
                message: 'Stub type must be an object',
                expected: 'object',
                actual: typeof st,
            });
            return errors;
        }

        const obj = st as Record<string, unknown>;

        // Required fields
        if (!obj.key || typeof obj.key !== 'string') {
            errors.push({
                path: `${path}.key`,
                message: 'Stub type must have a key string',
                expected: 'string',
                actual: typeof obj.key,
            });
        }

        // Validate vector family if present
        const validFamilies = ['Retrieval', 'Computation', 'Synthesis', 'Creation', 'Structural'];
        if (obj.vectorFamily && !validFamilies.includes(obj.vectorFamily as string)) {
            errors.push({
                path: `${path}.vectorFamily`,
                message: `Vector family must be one of: ${validFamilies.join(', ')}`,
                expected: validFamilies.join(' | '),
                actual: String(obj.vectorFamily),
            });
        }

        // Validate default form if present
        const validForms = ['transient', 'persistent', 'blocking', 'structural'];
        if (obj.defaultForm && !validForms.includes(obj.defaultForm as string)) {
            errors.push({
                path: `${path}.defaultForm`,
                message: `Default form must be one of: ${validForms.join(', ')}`,
                expected: validForms.join(' | '),
                actual: String(obj.defaultForm),
            });
        }

        // Validate refinement penalty if present
        if (obj.refinementPenalty !== undefined) {
            const penalty = obj.refinementPenalty as number;
            if (typeof penalty !== 'number' || penalty < 0 || penalty > 0.5) {
                errors.push({
                    path: `${path}.refinementPenalty`,
                    message: 'Refinement penalty must be a number between 0 and 0.5',
                    expected: 'number (0-0.5)',
                    actual: String(penalty),
                });
            }
        }

        return errors;
    }

    /**
     * Validate a vector family definition
     */
    private validateVectorFamily(vf: unknown, path: string): SchemaValidationError[] {
        const errors: SchemaValidationError[] = [];

        if (typeof vf !== 'object' || vf === null) {
            errors.push({
                path,
                message: 'Vector family must be an object',
                expected: 'object',
                actual: typeof vf,
            });
            return errors;
        }

        const obj = vf as Record<string, unknown>;

        // Required fields
        const validIds = ['Retrieval', 'Computation', 'Synthesis', 'Creation', 'Structural'];
        if (!obj.id || !validIds.includes(obj.id as string)) {
            errors.push({
                path: `${path}.id`,
                message: `Vector family id must be one of: ${validIds.join(', ')}`,
                expected: validIds.join(' | '),
                actual: String(obj.id),
            });
        }

        // Validate potential energy weight if present
        if (obj.potentialEnergyWeight !== undefined) {
            const weight = obj.potentialEnergyWeight as number;
            if (typeof weight !== 'number' || weight < 0 || weight > 1) {
                errors.push({
                    path: `${path}.potentialEnergyWeight`,
                    message: 'Potential energy weight must be a number between 0 and 1',
                    expected: 'number (0-1)',
                    actual: String(weight),
                });
            }
        }

        return errors;
    }

    /**
     * Validate full schema
     */
    validateSchema(schema: JEditorialSchema): SchemaValidationResult {
        const errors: SchemaValidationError[] = [];
        const warnings: SchemaValidationWarning[] = [];

        // Check version
        if (!schema.version) {
            errors.push({
                path: 'version',
                message: 'Schema must have a version',
            });
        }

        // Check intrinsic properties
        if (!schema.intrinsicProperties) {
            errors.push({
                path: 'intrinsicProperties',
                message: 'Schema must define intrinsic properties',
            });
        }

        // Check vector families
        if (!schema.vectorFamilies || schema.vectorFamilies.length === 0) {
            errors.push({
                path: 'vectorFamilies',
                message: 'Schema must define at least one vector family',
            });
        }

        // Check stub types
        if (!schema.stubTypes || schema.stubTypes.length === 0) {
            errors.push({
                path: 'stubTypes',
                message: 'Schema must define at least one stub type',
            });
        }

        // Check that all stub types reference valid vector families
        const familyIds = new Set(schema.vectorFamilies?.map((f) => f.id) || []);
        for (const stubType of schema.stubTypes || []) {
            if (!familyIds.has(stubType.vectorFamily)) {
                warnings.push({
                    path: `stubTypes.${stubType.key}.vectorFamily`,
                    message: `Stub type "${stubType.key}" references unknown vector family "${stubType.vectorFamily}"`,
                });
            }
        }

        // Check quality gates
        if (!schema.qualityGates || Object.keys(schema.qualityGates).length === 0) {
            warnings.push({
                path: 'qualityGates',
                message: 'Schema should define quality gates',
            });
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }
}

// =============================================================================
// CREATIVITY MODE HELPERS
// =============================================================================

/**
 * Get creativity modes configuration
 */
export function getCreativityModes(): typeof CREATIVITY_MODES {
    return CREATIVITY_MODES;
}

/**
 * Get creativity mode by ID
 */
export function getCreativityMode(id: string): (typeof CREATIVITY_MODES)[number] | undefined {
    return CREATIVITY_MODES.find((m) => m.id === id);
}

// =============================================================================
// EXPORTS
// =============================================================================

export { DEFAULT_J_EDITORIAL_SCHEMA, CREATIVITY_MODES };
