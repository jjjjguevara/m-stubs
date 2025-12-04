/**
 * Schema Settings Component
 *
 * Settings UI for viewing and exporting J-Editorial schema.
 * Displays current schema source, vector families, stub types, and quality gates.
 */

import { Notice, Setting } from 'obsidian';
import type LabeledAnnotations from '../../main';
import { SchemaLoader } from '../../schema/schema-loader';
import type { VectorFamilyDefinition, StubTypeSchema } from '../../schema/schema-types';

interface Props {
    plugin: LabeledAnnotations;
    containerEl: HTMLElement;
}

export const SchemaSettings = ({ plugin, containerEl }: Props) => {
    const schemaLoader = plugin.schemaLoader;

    // Header
    containerEl.createEl('h2', { text: 'J-Editorial Schema' });
    containerEl.createEl('p', {
        text: 'The J-Editorial schema defines the ontology for document quality and editorial demand signals. This schema is transmitted to the LLM with every request.',
        cls: 'setting-item-description',
    });

    // ==========================================================================
    // SCHEMA SOURCE
    // ==========================================================================

    containerEl.createEl('h3', { text: 'Schema Source' });

    if (schemaLoader) {
        const schema = schemaLoader.getSchema();

        new Setting(containerEl)
            .setName('Active Schema')
            .setDesc(schemaLoader.getSchemaSource())
            .addExtraButton((button) => {
                button
                    .setIcon('refresh-cw')
                    .setTooltip('Reload schema from vault')
                    .onClick(async () => {
                        await schemaLoader.loadUserSchema();
                        new Notice('Schema reloaded');
                        // Refresh the settings tab
                        plugin.settingsTab?.display();
                    });
            });

        new Setting(containerEl)
            .setName('Schema Version')
            .setDesc(`Version: ${schema.version}`);

        // Export button
        new Setting(containerEl)
            .setName('Export Schema')
            .setDesc('Export current schema as YAML to customize')
            .addButton((button) => {
                button.setButtonText('Export to Vault').onClick(async () => {
                    try {
                        const path = await schemaLoader.saveSchemaExport();
                        new Notice(`Schema exported to ${path}`);
                    } catch (error) {
                        new Notice(`Export failed: ${error}`);
                    }
                });
            });

        // User override info
        if (schemaLoader.hasUserSchema()) {
            const userSchema = schemaLoader.getUserSchema();
            new Setting(containerEl)
                .setName('Override Mode')
                .setDesc(
                    userSchema?.mode === 'replace'
                        ? 'User schema completely replaces bundled defaults'
                        : 'User schema extends/merges with bundled defaults'
                );
        } else {
            new Setting(containerEl)
                .setName('Customization')
                .setDesc('No user override found. Export the schema to create .doc-doctor/schema.yaml')
                .addButton((button) => {
                    button.setButtonText('Create Override').onClick(async () => {
                        try {
                            const path = await schemaLoader.saveSchemaExport();
                            new Notice(`Schema template created at ${path}`);
                        } catch (error) {
                            new Notice(`Failed to create: ${error}`);
                        }
                    });
                });
        }

        // ==========================================================================
        // VECTOR FAMILIES
        // ==========================================================================

        containerEl.createEl('h3', { text: 'Vector Families' });
        containerEl.createEl('p', {
            text: 'The 5 categories that classify editorial work types. Each stub belongs to one family.',
            cls: 'setting-item-description',
        });

        const familiesContainer = containerEl.createEl('div', { cls: 'schema-families-container' });

        for (const family of schema.vectorFamilies) {
            renderVectorFamily(familiesContainer, family);
        }

        // ==========================================================================
        // STUB TYPES
        // ==========================================================================

        containerEl.createEl('h3', { text: 'Stub Types' });
        containerEl.createEl('p', {
            text: `${schema.stubTypes.length} stub types available. Each has semantic guidance for LLM analysis.`,
            cls: 'setting-item-description',
        });

        const stubsContainer = containerEl.createEl('div', { cls: 'schema-stubs-container' });

        for (const stubType of schema.stubTypes) {
            renderStubType(stubsContainer, stubType);
        }

        // ==========================================================================
        // QUALITY GATES
        // ==========================================================================

        containerEl.createEl('h3', { text: 'Quality Gates' });
        containerEl.createEl('p', {
            text: 'Minimum refinement thresholds for each audience level.',
            cls: 'setting-item-description',
        });

        const gatesContainer = containerEl.createEl('div', { cls: 'schema-gates-container' });

        for (const [audience, threshold] of Object.entries(schema.qualityGates)) {
            new Setting(gatesContainer)
                .setName(capitalizeFirst(audience))
                .setDesc(`Minimum refinement: ${threshold}`);
        }

        // ==========================================================================
        // L2 FORMULAS
        // ==========================================================================

        if (schema.formulas && schema.formulas.length > 0) {
            containerEl.createEl('h3', { text: 'L2 Formulas (Computed Dimensions)' });
            containerEl.createEl('p', {
                text: 'Formulas for computing document metrics from L1 properties.',
                cls: 'setting-item-description',
            });

            const formulasContainer = containerEl.createEl('div', { cls: 'schema-formulas-container' });

            for (const formula of schema.formulas) {
                new Setting(formulasContainer)
                    .setName(formula.name)
                    .setDesc(`${formula.formula} - ${formula.description}`);
            }
        }
    } else {
        // Schema loader not initialized
        containerEl.createEl('p', {
            text: 'Schema loader not initialized. Restart the plugin.',
            cls: 'setting-item-description mod-warning',
        });
    }

    // ==========================================================================
    // CSS STYLES
    // ==========================================================================

    addSchemaStyles(containerEl);
};

/**
 * Render a vector family card
 */
function renderVectorFamily(container: HTMLElement, family: VectorFamilyDefinition) {
    const card = container.createEl('div', { cls: 'schema-family-card' });

    const header = card.createEl('div', { cls: 'schema-family-header' });
    header.createEl('span', { text: family.displayName, cls: 'schema-family-name' });
    header.createEl('span', {
        text: `Eₚ weight: ${family.potentialEnergyWeight}`,
        cls: 'schema-family-weight',
    });

    card.createEl('p', { text: family.description, cls: 'schema-family-desc' });

    const details = card.createEl('div', { cls: 'schema-family-details' });
    details.createEl('div', { text: `Work pattern: ${family.workPattern}` });

    if (family.typicalTools.length > 0) {
        details.createEl('div', { text: `Tools: ${family.typicalTools.join(', ')}` });
    }

    if (family.stubTypes.length > 0) {
        details.createEl('div', { text: `Stub types: ${family.stubTypes.join(', ')}` });
    }
}

/**
 * Render a stub type card
 */
function renderStubType(container: HTMLElement, stubType: StubTypeSchema) {
    const card = container.createEl('div', { cls: 'schema-stub-card' });

    const header = card.createEl('div', { cls: 'schema-stub-header' });

    // Color indicator
    const colorDot = header.createEl('span', { cls: 'schema-stub-color' });
    colorDot.style.backgroundColor = stubType.color || '#7f8c8d';

    header.createEl('span', { text: stubType.displayName, cls: 'schema-stub-name' });
    header.createEl('code', { text: stubType.key, cls: 'schema-stub-key' });
    header.createEl('span', { text: stubType.vectorFamily, cls: 'schema-stub-family' });

    card.createEl('p', { text: stubType.description, cls: 'schema-stub-desc' });

    // Expandable details
    const details = card.createEl('details', { cls: 'schema-stub-details' });
    const summary = details.createEl('summary');
    summary.textContent = 'Show semantic guidance';

    const content = details.createEl('div', { cls: 'schema-stub-content' });

    content.createEl('div', { cls: 'schema-stub-section' }).innerHTML =
        `<strong>Semantic Purpose:</strong> ${stubType.semanticPurpose}`;

    if (stubType.indicators.length > 0) {
        const indicators = content.createEl('div', { cls: 'schema-stub-section' });
        indicators.createEl('strong', { text: 'Look for:' });
        const list = indicators.createEl('ul');
        for (const indicator of stubType.indicators.slice(0, 4)) {
            list.createEl('li', { text: indicator });
        }
    }

    if (stubType.antiPatterns.length > 0) {
        const antiPatterns = content.createEl('div', { cls: 'schema-stub-section' });
        antiPatterns.createEl('strong', { text: 'Avoid when:' });
        const list = antiPatterns.createEl('ul');
        for (const pattern of stubType.antiPatterns.slice(0, 3)) {
            list.createEl('li', { text: pattern });
        }
    }

    content.createEl('div', { cls: 'schema-stub-section' }).innerHTML =
        `<strong>Default form:</strong> ${stubType.defaultForm} | <strong>Penalty:</strong> -${stubType.refinementPenalty}`;
}

/**
 * Capitalize first letter
 */
function capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Add CSS styles for schema display
 */
function addSchemaStyles(containerEl: HTMLElement) {
    const existingStyle = containerEl.querySelector('.schema-settings-styles');
    if (existingStyle) return;

    const style = document.createElement('style');
    style.className = 'schema-settings-styles';
    style.textContent = `
        .schema-families-container,
        .schema-stubs-container,
        .schema-gates-container,
        .schema-formulas-container {
            margin: 10px 0 20px 0;
        }

        .schema-family-card,
        .schema-stub-card {
            background: var(--background-secondary);
            border-radius: 8px;
            padding: 12px 16px;
            margin-bottom: 10px;
        }

        .schema-family-header,
        .schema-stub-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 6px;
        }

        .schema-family-name,
        .schema-stub-name {
            font-weight: 600;
        }

        .schema-family-weight,
        .schema-stub-family {
            margin-left: auto;
            font-size: 0.85em;
            opacity: 0.7;
        }

        .schema-stub-color {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            flex-shrink: 0;
        }

        .schema-stub-key {
            font-size: 0.85em;
            background: var(--background-modifier-border);
            padding: 2px 6px;
            border-radius: 4px;
        }

        .schema-family-desc,
        .schema-stub-desc {
            font-size: 0.9em;
            opacity: 0.8;
            margin: 4px 0;
        }

        .schema-family-details {
            font-size: 0.85em;
            opacity: 0.7;
            margin-top: 8px;
        }

        .schema-family-details > div {
            margin: 2px 0;
        }

        .schema-stub-details {
            margin-top: 8px;
        }

        .schema-stub-details summary {
            cursor: pointer;
            font-size: 0.85em;
            opacity: 0.7;
        }

        .schema-stub-details summary:hover {
            opacity: 1;
        }

        .schema-stub-content {
            margin-top: 8px;
            padding-left: 10px;
            border-left: 2px solid var(--background-modifier-border);
        }

        .schema-stub-section {
            font-size: 0.85em;
            margin: 8px 0;
        }

        .schema-stub-section ul {
            margin: 4px 0 0 16px;
            padding: 0;
        }

        .schema-stub-section li {
            margin: 2px 0;
        }
    `;
    containerEl.appendChild(style);
}
