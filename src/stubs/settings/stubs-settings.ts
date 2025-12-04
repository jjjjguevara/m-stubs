/**
 * Stubs Settings Tab Component
 *
 * Provides UI for configuring stubs types, properties, and behavior.
 */

import { Setting, ButtonComponent, TextComponent, DropdownComponent, setIcon, Notice } from 'obsidian';
import type LabeledAnnotations from '../../main';
import {
    StubsConfiguration,
    StubTypeDefinition,
    StructuredPropertyDefinition,
} from '../stubs-types';
import { getSortedStubTypes, getSortedProperties } from '../stubs-defaults';

// Common Lucide icon names for suggestions
const COMMON_ICONS = [
    'alert-circle', 'alert-triangle', 'arrow-right', 'bookmark', 'check', 'check-circle',
    'circle', 'clipboard', 'code', 'edit', 'external-link', 'file', 'file-text',
    'flag', 'hash', 'help-circle', 'info', 'layers', 'link', 'list', 'list-checks',
    'message-circle', 'message-square', 'pen', 'pencil', 'plus', 'plus-circle',
    'quote', 'search', 'star', 'tag', 'target', 'type', 'x', 'zap',
];

type Props = {
    containerEl: HTMLElement;
    plugin: LabeledAnnotations;
};

/**
 * Main stubs settings section
 */
export const StubsSettings = ({ plugin, containerEl }: Props): void => {
    const config = plugin.settings.getValue().stubs;

    // Add styles
    addStubsSettingsStyles(containerEl);

    // Main heading
    new Setting(containerEl)
        .setName('Stubs')
        .setHeading()
        .setDesc('Configure stub types, properties, and sync behavior');

    // Enable/Disable stubs
    new Setting(containerEl)
        .setName('Enable stubs')
        .setDesc('Enable or disable the stubs feature entirely')
        .addToggle((toggle) => {
            toggle.setValue(config.enabled).onChange((value) => {
                plugin.settings.dispatch({
                    type: 'STUBS_SET_ENABLED',
                    payload: { enabled: value },
                });
            });
        });

    // Frontmatter key
    new Setting(containerEl)
        .setName('Frontmatter key')
        .setDesc('The YAML frontmatter key used for stubs (default: "stubs")')
        .addText((text) => {
            text.setPlaceholder('stubs')
                .setValue(config.frontmatterKey)
                .onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'STUBS_SET_FRONTMATTER_KEY',
                        payload: { key: value },
                    });
                });
        });

    // Stub Types Section
    renderStubTypesSection({ plugin, containerEl, config });

    // Structured Properties Section
    renderPropertiesSection({ plugin, containerEl, config });

    // Anchor Settings Section
    renderAnchorSettings({ plugin, containerEl, config });

    // Decoration Settings Section
    renderDecorationSettings({ plugin, containerEl, config });

    // Sidebar Settings Section
    renderSidebarSettings({ plugin, containerEl, config });
};

/**
 * Render stub types configuration section
 */
function renderStubTypesSection({
    plugin,
    containerEl,
    config,
}: {
    plugin: LabeledAnnotations;
    containerEl: HTMLElement;
    config: StubsConfiguration;
}): void {
    new Setting(containerEl)
        .setName('Stub Types')
        .setHeading()
        .setDesc('Define the vocabulary of stub types available in your documents');

    const typesContainer = containerEl.createDiv('dd-stubs-list');

    const sortedTypes = getSortedStubTypes(config);

    for (const typeDef of sortedTypes) {
        renderStubTypeCard({ plugin, containerEl: typesContainer, typeDef, config });
    }

    // Add new type button
    const addContainer = containerEl.createDiv('dd-add-item-container');
    const addBtn = addContainer.createEl('button', {
        cls: 'dd-add-item-btn',
        text: '+ Add stub type',
    });
    addBtn.addEventListener('click', () => {
        const key = `type-${Date.now()}`;
        const newTypeDef: StubTypeDefinition = {
            id: key,
            key: 'new-type',
            displayName: 'New Type',
            color: '#888888',
            sortOrder: Object.keys(config.stubTypes).length,
        };

        plugin.settings.dispatch({
            type: 'STUBS_ADD_TYPE',
            payload: {
                key: newTypeDef.key,
                displayName: newTypeDef.displayName,
                color: newTypeDef.color,
            },
        });

        // Add new card at the end without full re-render
        const updatedConfig = plugin.settings.getValue().stubs;
        const addedType = Object.values(updatedConfig.stubTypes).find(
            (t) => t.displayName === 'New Type' && t.key === 'new-type'
        );
        if (addedType) {
            renderStubTypeCard({
                plugin,
                containerEl: typesContainer,
                typeDef: addedType,
                config: updatedConfig,
            });
            // Scroll the new card into view
            const newCard = typesContainer.lastElementChild;
            newCard?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    });
}

/**
 * Render a single stub type as a card (compact layout)
 */
function renderStubTypeCard({
    plugin,
    containerEl,
    typeDef,
    config,
}: {
    plugin: LabeledAnnotations;
    containerEl: HTMLElement;
    typeDef: StubTypeDefinition;
    config: StubsConfiguration;
}): void {
    const card = containerEl.createDiv('dd-item-card dd-compact-card');
    card.dataset.stubTypeId = typeDef.id;

    // Drag handle
    const dragHandle = card.createDiv('dd-drag-handle');
    setIcon(dragHandle, 'grip-vertical');
    dragHandle.title = 'Drag to reorder';

    // Main content wrapper
    const content = card.createDiv('dd-card-content');

    // Row 1: Color | Icon | Name | YAML key (all inline)
    const row1 = content.createDiv('dd-compact-row');

    // Color picker
    const colorPicker = row1.createEl('input', {
        cls: 'dd-color-picker-sm',
        attr: { type: 'color', value: typeDef.color, title: 'Color' },
    });
    colorPicker.addEventListener('change', (e) => {
        plugin.settings.dispatch({
            type: 'STUBS_UPDATE_TYPE',
            payload: { id: typeDef.id, updates: { color: (e.target as HTMLInputElement).value } },
        });
    });

    // Icon picker (compact with label)
    const iconGroup = row1.createDiv('dd-labeled-field dd-icon-field');
    iconGroup.createSpan({ text: 'Icon', cls: 'dd-field-label-inline' });
    const iconWrapper = iconGroup.createDiv('dd-icon-compact');
    const iconPreview = iconWrapper.createDiv('dd-icon-preview-sm');
    if (typeDef.icon) {
        setIcon(iconPreview, typeDef.icon);
    } else {
        iconPreview.textContent = '—';
    }
    const iconInput = iconWrapper.createEl('input', {
        cls: 'dd-field-input dd-key-input-compact',
        attr: {
            type: 'text',
            value: typeDef.icon || '',
            placeholder: 'lucide icon',
            title: 'Lucide icon name (lucide.dev/icons)',
            list: 'dd-icon-suggestions',
        },
    });

    // Ensure datalist exists
    if (!document.getElementById('dd-icon-suggestions')) {
        const datalist = document.createElement('datalist');
        datalist.id = 'dd-icon-suggestions';
        COMMON_ICONS.forEach((icon) => {
            const option = document.createElement('option');
            option.value = icon;
            datalist.appendChild(option);
        });
        document.body.appendChild(datalist);
    }

    iconInput.addEventListener('input', (e) => {
        const value = (e.target as HTMLInputElement).value.trim();
        iconPreview.empty();
        if (value) {
            try { setIcon(iconPreview, value); } catch { iconPreview.textContent = '?'; }
        } else {
            iconPreview.textContent = '—';
        }
    });
    iconInput.addEventListener('change', (e) => {
        plugin.settings.dispatch({
            type: 'STUBS_UPDATE_TYPE',
            payload: { id: typeDef.id, updates: { icon: (e.target as HTMLInputElement).value.trim() || undefined } },
        });
    });

    // Name input (with label)
    const nameGroup = row1.createDiv('dd-labeled-field dd-name-field');
    nameGroup.createSpan({ text: 'Name', cls: 'dd-field-label-inline' });
    const nameInput = nameGroup.createEl('input', {
        cls: 'dd-field-input',
        attr: { type: 'text', value: typeDef.displayName, placeholder: 'Display name' },
    });
    nameInput.addEventListener('change', (e) => {
        const value = (e.target as HTMLInputElement).value;
        const isDuplicate = Object.values(config.stubTypes)
            .filter((t) => t.id !== typeDef.id)
            .some((t) => t.displayName.toLowerCase() === value.toLowerCase());
        if (isDuplicate) {
            nameInput.classList.add('dd-input-error');
            new Notice('A stub type with this name already exists');
            return;
        }
        nameInput.classList.remove('dd-input-error');
        plugin.settings.dispatch({
            type: 'STUBS_UPDATE_TYPE',
            payload: { id: typeDef.id, updates: { displayName: value } },
        });
    });

    // YAML key input (with label)
    const keyGroup = row1.createDiv('dd-labeled-field dd-key-field');
    keyGroup.createSpan({ text: 'Key', cls: 'dd-field-label-inline' });
    const keyInput = keyGroup.createEl('input', {
        cls: 'dd-field-input dd-key-input-compact',
        attr: { type: 'text', value: typeDef.key, placeholder: 'yaml-key' },
    });
    keyInput.addEventListener('change', (e) => {
        const value = (e.target as HTMLInputElement).value;
        const normalizedKey = value.toLowerCase().replace(/\s+/g, '-');
        keyInput.value = normalizedKey;
        plugin.settings.dispatch({
            type: 'STUBS_UPDATE_TYPE',
            payload: { id: typeDef.id, updates: { key: normalizedKey } },
        });
    });

    // Row 2: Description | Delete button
    const row2 = content.createDiv('dd-compact-row dd-row-spaced');

    const descInput = row2.createEl('input', {
        cls: 'dd-field-input dd-desc-input-compact',
        attr: { type: 'text', value: typeDef.defaultStubDescription || '', placeholder: 'Default description (e.g., Citation needed)' },
    });
    descInput.addEventListener('change', (e) => {
        plugin.settings.dispatch({
            type: 'STUBS_UPDATE_TYPE',
            payload: { id: typeDef.id, updates: { defaultStubDescription: (e.target as HTMLInputElement).value } },
        });
    });

    // Delete button (two-step)
    const deleteBtn = row2.createEl('button', { cls: 'dd-delete-btn', attr: { title: 'Delete type' } });
    setIcon(deleteBtn, 'trash-2');

    let deleteConfirming = false;
    deleteBtn.addEventListener('click', () => {
        if (deleteConfirming) {
            plugin.settings.dispatch({ type: 'STUBS_DELETE_TYPE', payload: { id: typeDef.id } });
            card.remove();
        } else {
            deleteConfirming = true;
            deleteBtn.classList.add('dd-delete-confirming');
            deleteBtn.empty();
            deleteBtn.createSpan({ text: 'Delete?' });
            deleteBtn.title = 'Click again to confirm';
            setTimeout(() => {
                if (deleteConfirming) {
                    deleteConfirming = false;
                    deleteBtn.classList.remove('dd-delete-confirming');
                    deleteBtn.empty();
                    setIcon(deleteBtn, 'trash-2');
                    deleteBtn.title = 'Delete type';
                }
            }, 3000);
        }
    });

    // Setup drag and drop
    setupDragAndDrop(card, plugin, 'stubType');
}

/**
 * Render structured properties configuration section
 */
function renderPropertiesSection({
    plugin,
    containerEl,
    config,
}: {
    plugin: LabeledAnnotations;
    containerEl: HTMLElement;
    config: StubsConfiguration;
}): void {
    new Setting(containerEl)
        .setName('Structured Properties')
        .setHeading()
        .setDesc('Properties available in structured stub syntax. Toggle each property to include it when inserting structured stubs (^^^).');

    const propsContainer = containerEl.createDiv('dd-stubs-list');

    const sortedProps = getSortedProperties(config);

    for (const propDef of sortedProps) {
        renderPropertyCard({ plugin, containerEl: propsContainer, propDef, config });
    }

    // Add new property button
    const addContainer = containerEl.createDiv('dd-add-item-container');
    const addBtn = addContainer.createEl('button', {
        cls: 'dd-add-item-btn',
        text: '+ Add property',
    });
    addBtn.addEventListener('click', () => {
        const key = `prop_${Date.now()}`;
        plugin.settings.dispatch({
            type: 'STUBS_ADD_PROPERTY',
            payload: {
                key,
                displayName: 'New Property',
                type: 'string',
            },
        });
        // Re-render entire section
        const parentEl = containerEl;
        parentEl.empty();
        StubsSettings({ plugin, containerEl: parentEl });
    });
}

/**
 * Render type-specific content (default value inputs) for a property
 */
function renderTypeSpecificContent({
    plugin,
    containerEl,
    propDef,
}: {
    plugin: LabeledAnnotations;
    containerEl: HTMLElement;
    propDef: StructuredPropertyDefinition;
}): void {
    if (propDef.type === 'enum') {
        renderEnumHorizontalSelector({ plugin, containerEl, propDef });
    } else if (propDef.type === 'string') {
        const defaultInput = containerEl.createEl('input', {
            cls: 'dd-field-input dd-default-compact',
            attr: { type: 'text', value: String(propDef.defaultValue ?? ''), placeholder: 'Default value' },
        });
        defaultInput.addEventListener('change', (e) => {
            plugin.settings.dispatch({
                type: 'STUBS_UPDATE_PROPERTY',
                payload: { id: propDef.id, updates: { defaultValue: (e.target as HTMLInputElement).value || undefined } },
            });
        });
    } else if (propDef.type === 'number') {
        const defaultInput = containerEl.createEl('input', {
            cls: 'dd-field-input dd-default-compact',
            attr: { type: 'number', value: propDef.defaultValue !== undefined ? String(propDef.defaultValue) : '', placeholder: 'Default' },
        });
        defaultInput.addEventListener('change', (e) => {
            const value = (e.target as HTMLInputElement).value;
            plugin.settings.dispatch({
                type: 'STUBS_UPDATE_PROPERTY',
                payload: { id: propDef.id, updates: { defaultValue: value ? parseFloat(value) : undefined } },
            });
        });
    } else if (propDef.type === 'boolean') {
        const boolWrapper = containerEl.createDiv('dd-bool-compact');
        boolWrapper.createSpan({ text: 'Default: ', cls: 'dd-label' });
        const toggle = boolWrapper.createEl('input', {
            cls: 'dd-default-toggle',
            attr: { type: 'checkbox', ...(propDef.defaultValue === true ? { checked: '' } : {}) },
        });
        const label = boolWrapper.createSpan({ text: propDef.defaultValue === true ? 'true' : 'false', cls: 'dd-bool-label' });
        toggle.addEventListener('change', (e) => {
            const checked = (e.target as HTMLInputElement).checked;
            label.textContent = checked ? 'true' : 'false';
            plugin.settings.dispatch({
                type: 'STUBS_UPDATE_PROPERTY',
                payload: { id: propDef.id, updates: { defaultValue: checked } },
            });
        });
    }
    // array type has no default value input currently
}

/**
 * Render a single property as a card (compact layout)
 */
function renderPropertyCard({
    plugin,
    containerEl,
    propDef,
    config,
}: {
    plugin: LabeledAnnotations;
    containerEl: HTMLElement;
    propDef: StructuredPropertyDefinition;
    config: StubsConfiguration;
}): void {
    const card = containerEl.createDiv('dd-item-card dd-compact-card');
    card.dataset.propertyId = propDef.id;

    // Drag handle
    const dragHandle = card.createDiv('dd-drag-handle');
    setIcon(dragHandle, 'grip-vertical');
    dragHandle.title = 'Drag to reorder';

    // Main content wrapper
    const content = card.createDiv('dd-card-content');

    // Row 1: Name | Key | Type selector | ^^^ toggle (top right)
    const row1 = content.createDiv('dd-compact-row dd-row-spaced');

    // Left side: Name, Key, Type
    const leftGroup = row1.createDiv('dd-compact-row');

    // Name input (with label)
    const nameGroup = leftGroup.createDiv('dd-labeled-field dd-name-field');
    nameGroup.createSpan({ text: 'Name', cls: 'dd-field-label-inline' });
    const nameInput = nameGroup.createEl('input', {
        cls: 'dd-field-input',
        attr: { type: 'text', value: propDef.displayName, placeholder: 'Display name' },
    });
    nameInput.addEventListener('change', (e) => {
        plugin.settings.dispatch({
            type: 'STUBS_UPDATE_PROPERTY',
            payload: { id: propDef.id, updates: { displayName: (e.target as HTMLInputElement).value } },
        });
    });

    // Key input (with label)
    const keyGroup = leftGroup.createDiv('dd-labeled-field dd-key-field');
    keyGroup.createSpan({ text: 'Key', cls: 'dd-field-label-inline' });
    const keyInput = keyGroup.createEl('input', {
        cls: 'dd-field-input dd-key-input-compact',
        attr: { type: 'text', value: propDef.key, placeholder: 'yaml_key' },
    });
    keyInput.addEventListener('change', (e) => {
        const value = (e.target as HTMLInputElement).value;
        const normalizedKey = value.toLowerCase().replace(/\s+/g, '_');
        keyInput.value = normalizedKey;
        plugin.settings.dispatch({
            type: 'STUBS_UPDATE_PROPERTY',
            payload: { id: propDef.id, updates: { key: normalizedKey } },
        });
    });

    // Type selector (horizontal buttons)
    const typeSelector = leftGroup.createDiv('dd-type-selector');
    const types: Array<{ key: StructuredPropertyDefinition['type']; label: string }> = [
        { key: 'string', label: 'Text' },
        { key: 'enum', label: 'Enum' },
        { key: 'number', label: 'Num' },
        { key: 'boolean', label: 'Bool' },
        { key: 'array', label: 'Array' },
    ];
    for (const t of types) {
        const btn = typeSelector.createEl('button', {
            cls: `dd-type-btn ${propDef.type === t.key ? 'is-active' : ''}`,
            text: t.label,
        });
        btn.addEventListener('click', () => {
            plugin.settings.dispatch({
                type: 'STUBS_UPDATE_PROPERTY',
                payload: { id: propDef.id, updates: { type: t.key } },
            });
            typeSelector.querySelectorAll('.dd-type-btn').forEach((b) => b.classList.remove('is-active'));
            btn.classList.add('is-active');
            // Re-render type-specific content in place (don't remove the whole card)
            typeContent.empty();
            const updatedPropDef = { ...propDef, type: t.key };
            renderTypeSpecificContent({ plugin, containerEl: typeContent, propDef: updatedPropDef });
        });
    }

    // Right side: ^^^ Include toggle (top right)
    const includeWrapper = row1.createDiv('dd-include-top-right');
    includeWrapper.createEl('label', {
        text: '^^^',
        attr: { for: `include-${propDef.id}`, title: 'Include in structured stubs' },
        cls: 'dd-include-label',
    });
    const includeToggle = includeWrapper.createEl('input', {
        cls: 'dd-include-toggle',
        attr: {
            type: 'checkbox',
            id: `include-${propDef.id}`,
            title: 'Include in structured stubs (^^^)',
            ...(propDef.includeInStructured !== false ? { checked: '' } : {}),
        },
    });
    includeToggle.addEventListener('change', (e) => {
        plugin.settings.dispatch({
            type: 'STUBS_UPDATE_PROPERTY',
            payload: { id: propDef.id, updates: { includeInStructured: (e.target as HTMLInputElement).checked } },
        });
    });

    // Row 2: Type-specific content | Delete button
    const row2 = content.createDiv('dd-compact-row dd-row-spaced');

    // Type-specific content container
    const typeContent = row2.createDiv('dd-type-content');

    // Setup drag and drop
    setupDragAndDrop(card, plugin, 'property');

    // Render type-specific options
    renderTypeSpecificContent({ plugin, containerEl: typeContent, propDef });

    // Delete button (two-step)
    const deleteBtn = row2.createEl('button', { cls: 'dd-delete-btn', attr: { title: 'Delete property' } });
    setIcon(deleteBtn, 'trash-2');

    let deleteConfirming = false;
    deleteBtn.addEventListener('click', () => {
        if (deleteConfirming) {
            plugin.settings.dispatch({ type: 'STUBS_DELETE_PROPERTY', payload: { id: propDef.id } });
            card.remove();
        } else {
            deleteConfirming = true;
            deleteBtn.classList.add('dd-delete-confirming');
            deleteBtn.empty();
            deleteBtn.createSpan({ text: 'Delete?' });
            setTimeout(() => {
                if (deleteConfirming) {
                    deleteConfirming = false;
                    deleteBtn.classList.remove('dd-delete-confirming');
                    deleteBtn.empty();
                    setIcon(deleteBtn, 'trash-2');
                }
            }, 3000);
        }
    });
}

/**
 * Render enum values as horizontal button selector
 */
function renderEnumHorizontalSelector({
    plugin,
    containerEl,
    propDef,
}: {
    plugin: LabeledAnnotations;
    containerEl: HTMLElement;
    propDef: StructuredPropertyDefinition;
}): void {
    const enumContainer = containerEl.createDiv('dd-enum-container');

    const enumValues = propDef.enumValues || [];
    const enumDisplayNames = propDef.enumDisplayNames || [];

    // Label
    enumContainer.createSpan({ text: 'Values (click to set default):', cls: 'dd-label' });

    // Horizontal button list
    const buttonRow = enumContainer.createDiv('dd-enum-buttons');

    for (let i = 0; i < enumValues.length; i++) {
        const value = enumValues[i];
        const displayName = enumDisplayNames[i] || value;
        const isDefault = propDef.defaultValue === value;

        // Wrapper for button + delete
        const btnWrapper = buttonRow.createDiv('dd-enum-btn-wrapper');

        const btn = btnWrapper.createEl('button', {
            cls: `dd-enum-btn ${isDefault ? 'is-default' : ''}`,
            text: displayName,
            attr: { title: `Value: ${value}${isDefault ? ' (default)' : ''}\nClick to set default` },
        });

        // Delete button (appears on hover)
        const deleteBtn = btnWrapper.createEl('button', {
            cls: 'dd-enum-delete-btn',
            attr: { title: 'Remove value' },
        });
        setIcon(deleteBtn, 'x');

        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            plugin.settings.dispatch({
                type: 'STUBS_REMOVE_ENUM_VALUE',
                payload: { propertyId: propDef.id, value },
            });
            btnWrapper.remove();
        });

        // Click to set as default
        btn.addEventListener('click', () => {
            const newDefault = isDefault ? undefined : value; // Toggle off if already default
            plugin.settings.dispatch({
                type: 'STUBS_UPDATE_PROPERTY',
                payload: { id: propDef.id, updates: { defaultValue: newDefault } },
            });
            // Update UI
            buttonRow.querySelectorAll('.dd-enum-btn').forEach((b) => b.classList.remove('is-default'));
            if (newDefault) btn.classList.add('is-default');
        });
    }

    // Add new value button
    const addBtn = buttonRow.createEl('button', {
        cls: 'dd-enum-add-btn',
        text: '+',
        attr: { title: 'Add new value' },
    });
    addBtn.addEventListener('click', () => {
        showEnumValueModal(plugin, propDef, enumContainer);
    });

    // Help text
    enumContainer.createEl('small', {
        text: 'Click to set default, hover for delete',
        cls: 'dd-help-text',
    });
}

/**
 * Show modal for adding enum values (replaces window.prompt)
 */
function showEnumValueModal(
    plugin: LabeledAnnotations,
    propDef: StructuredPropertyDefinition,
    enumContainer: HTMLElement
): void {
    const overlay = document.createElement('div');
    overlay.className = 'dd-modal-overlay';

    const modal = overlay.createDiv('dd-input-modal');

    const header = modal.createDiv('dd-modal-header');
    header.createEl('h4', { text: 'Add Enum Value' });
    const closeBtn = header.createEl('button', { cls: 'dd-modal-close' });
    setIcon(closeBtn, 'x');
    closeBtn.addEventListener('click', () => overlay.remove());

    const content = modal.createDiv('dd-modal-content');

    // Value input
    const valueGroup = content.createDiv('dd-modal-field');
    valueGroup.createEl('label', { text: 'Value (stored in YAML):' });
    const valueInput = valueGroup.createEl('input', {
        cls: 'dd-modal-input',
        attr: { type: 'text', placeholder: 'e.g., high' },
    });

    // Display name input
    const displayGroup = content.createDiv('dd-modal-field');
    displayGroup.createEl('label', { text: 'Display name (optional):' });
    const displayInput = displayGroup.createEl('input', {
        cls: 'dd-modal-input',
        attr: { type: 'text', placeholder: 'Leave blank to use value' },
    });

    // Auto-fill display name from value
    valueInput.addEventListener('input', () => {
        if (!displayInput.value) {
            displayInput.placeholder = valueInput.value || 'Leave blank to use value';
        }
    });

    // Actions
    const actions = modal.createDiv('dd-modal-actions');

    const cancelBtn = actions.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => overlay.remove());

    const addBtn = actions.createEl('button', { cls: 'mod-cta', text: 'Add' });
    addBtn.addEventListener('click', () => {
        const value = valueInput.value.trim();
        if (!value) {
            valueInput.classList.add('dd-input-error');
            return;
        }

        const displayName = displayInput.value.trim() || value;

        plugin.settings.dispatch({
            type: 'STUBS_ADD_ENUM_VALUE',
            payload: { propertyId: propDef.id, value, displayName },
        });

        // Re-render enum section
        const updatedConfig = plugin.settings.getValue().stubs;
        const updatedProp = updatedConfig.structuredProperties[propDef.id];
        if (updatedProp) {
            enumContainer.empty();
            renderEnumHorizontalSelector({
                plugin,
                containerEl: enumContainer,
                propDef: updatedProp,
            });
        }

        overlay.remove();
    });

    // Handle Enter key
    valueInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addBtn.click();
    });
    displayInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addBtn.click();
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
    valueInput.focus();
}

/**
 * Setup drag and drop for reordering items
 */
function setupDragAndDrop(
    card: HTMLElement,
    plugin: LabeledAnnotations,
    itemType: 'stubType' | 'property'
): void {
    const handle = card.querySelector('.dd-drag-handle') as HTMLElement;
    if (!handle) return;

    handle.draggable = true;
    card.draggable = false; // Only drag via handle

    handle.addEventListener('dragstart', (e) => {
        e.dataTransfer?.setData('text/plain', card.dataset.stubTypeId || card.dataset.propertyId || '');
        card.classList.add('dd-dragging');
    });

    handle.addEventListener('dragend', () => {
        card.classList.remove('dd-dragging');
        document.querySelectorAll('.dd-drag-over').forEach((el) => el.classList.remove('dd-drag-over'));
    });

    card.addEventListener('dragover', (e) => {
        e.preventDefault();
        const dragging = document.querySelector('.dd-dragging');
        if (dragging && dragging !== card) {
            card.classList.add('dd-drag-over');
        }
    });

    card.addEventListener('dragleave', () => {
        card.classList.remove('dd-drag-over');
    });

    card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('dd-drag-over');

        const draggedId = e.dataTransfer?.getData('text/plain');
        const targetId = card.dataset.stubTypeId || card.dataset.propertyId;

        if (!draggedId || !targetId || draggedId === targetId) return;

        // Dispatch reorder action
        if (itemType === 'stubType') {
            plugin.settings.dispatch({
                type: 'STUBS_REORDER_TYPES',
                payload: { sourceId: draggedId, targetId },
            });
        } else {
            plugin.settings.dispatch({
                type: 'STUBS_REORDER_PROPERTIES',
                payload: { sourceId: draggedId, targetId },
            });
        }

        // Reorder DOM elements
        const container = card.parentElement;
        const draggedCard = container?.querySelector(`[data-stub-type-id="${draggedId}"], [data-property-id="${draggedId}"]`);
        if (draggedCard && container) {
            container.insertBefore(draggedCard, card);
        }
    });
}

/**
 * Render anchor settings section
 */
function renderAnchorSettings({
    plugin,
    containerEl,
    config,
}: {
    plugin: LabeledAnnotations;
    containerEl: HTMLElement;
    config: StubsConfiguration;
}): void {
    new Setting(containerEl).setName('Anchor Settings').setHeading();

    // Anchor prefix
    new Setting(containerEl)
        .setName('Anchor prefix')
        .setDesc('Prefix for generated anchor IDs (default: "stub")')
        .addText((text) => {
            text.setPlaceholder('stub')
                .setValue(config.anchors.prefix)
                .onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'STUBS_SET_ANCHOR_PREFIX',
                        payload: { prefix: value },
                    });
                });
        });

    // ID style
    new Setting(containerEl)
        .setName('ID generation style')
        .setDesc('How to generate new anchor IDs')
        .addDropdown((dropdown) => {
            dropdown
                .addOptions({
                    random: 'Random (e.g., ^stub-a1b2c3)',
                    sequential: 'Sequential (e.g., ^stub-001)',
                    'type-prefixed': 'Type-prefixed (e.g., ^stub-link-a1b2)',
                    'type-only': 'Type-only (e.g., ^link-a1b2)',
                })
                .setValue(config.anchors.idStyle)
                .onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'STUBS_SET_ANCHOR_ID_STYLE',
                        payload: { style: value as 'random' | 'sequential' | 'type-prefixed' | 'type-only' },
                    });
                });
        });

    // Random ID length
    new Setting(containerEl)
        .setName('Random ID length')
        .setDesc('Length of random portion in anchor IDs (4-12)')
        .addSlider((slider) => {
            slider
                .setLimits(4, 12, 1)
                .setValue(config.anchors.randomIdLength)
                .setDynamicTooltip()
                .onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'STUBS_SET_ANCHOR_ID_LENGTH',
                        payload: { length: value },
                    });
                });
        });
}

/**
 * Render decoration settings section
 */
function renderDecorationSettings({
    plugin,
    containerEl,
    config,
}: {
    plugin: LabeledAnnotations;
    containerEl: HTMLElement;
    config: StubsConfiguration;
}): void {
    new Setting(containerEl).setName('Inline Decorations').setHeading();

    // Enable decorations
    new Setting(containerEl)
        .setName('Enable decorations')
        .setDesc('Highlight stub anchors in the editor')
        .addToggle((toggle) => {
            toggle.setValue(config.decorations.enabled).onChange((value) => {
                plugin.settings.dispatch({
                    type: 'STUBS_SET_DECORATIONS_ENABLED',
                    payload: { enabled: value },
                });
            });
        });

    // Decoration style
    new Setting(containerEl)
        .setName('Decoration style')
        .setDesc('How to display stub anchors in the editor')
        .addDropdown((dropdown) => {
            dropdown
                .addOptions({
                    background: 'Background highlight',
                    underline: 'Underline',
                    badge: 'Badge/chip',
                    gutter: 'Gutter icon only',
                })
                .setValue(config.decorations.style)
                .onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'STUBS_SET_DECORATION_STYLE',
                        payload: {
                            style: value as 'background' | 'underline' | 'badge' | 'gutter',
                        },
                    });
                });
        });

    // Decoration opacity
    new Setting(containerEl)
        .setName('Decoration opacity')
        .setDesc('Opacity of anchor highlights (0.1-1.0)')
        .addSlider((slider) => {
            slider
                .setLimits(0.1, 1.0, 0.1)
                .setValue(config.decorations.opacity)
                .setDynamicTooltip()
                .onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'STUBS_SET_DECORATION_OPACITY',
                        payload: { opacity: value },
                    });
                });
        });
}

/**
 * Render sidebar settings section
 */
function renderSidebarSettings({
    plugin,
    containerEl,
    config,
}: {
    plugin: LabeledAnnotations;
    containerEl: HTMLElement;
    config: StubsConfiguration;
}): void {
    new Setting(containerEl).setName('Sidebar Settings').setHeading();

    // Font size
    new Setting(containerEl)
        .setName('Font size')
        .setDesc('Font size for stub items in sidebar (8-24)')
        .addSlider((slider) => {
            slider
                .setLimits(8, 24, 1)
                .setValue(config.sidebar.fontSize)
                .setDynamicTooltip()
                .onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'STUBS_SET_SIDEBAR_FONT_SIZE',
                        payload: { fontSize: value },
                    });
                });
        });

    // Expanded by default
    new Setting(containerEl)
        .setName('Expand types by default')
        .setDesc('Automatically expand all type groups in sidebar')
        .addToggle((toggle) => {
            toggle.setValue(config.sidebar.expandedByDefault).onChange((value) => {
                plugin.settings.dispatch({
                    type: 'STUBS_SET_SIDEBAR_EXPANDED_DEFAULT',
                    payload: { expanded: value },
                });
            });
        });

    // Show search input
    new Setting(containerEl)
        .setName('Show search input')
        .setDesc('Display search input in sidebar controls')
        .addToggle((toggle) => {
            toggle.setValue(config.sidebar.showSearchInput).onChange((value) => {
                plugin.settings.dispatch({
                    type: 'STUBS_SET_SHOW_SEARCH',
                    payload: { show: value },
                });
            });
        });

    // Show type filter
    new Setting(containerEl)
        .setName('Show type filter')
        .setDesc('Display type filter in sidebar controls')
        .addToggle((toggle) => {
            toggle.setValue(config.sidebar.showTypeFilter).onChange((value) => {
                plugin.settings.dispatch({
                    type: 'STUBS_SET_SHOW_TYPE_FILTER',
                    payload: { show: value },
                });
            });
        });
}

/**
 * Add styles for stubs settings UI
 */
function addStubsSettingsStyles(containerEl: HTMLElement): void {
    const styleId = 'dd-stubs-settings-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        /* Card list container */
        .dd-stubs-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin: 12px 0;
        }

        /* Individual card */
        .dd-item-card {
            display: flex;
            background: var(--background-secondary);
            border-radius: 8px;
            padding: 12px;
            border: 1px solid var(--background-modifier-border);
            transition: all 0.15s ease;
        }

        .dd-item-card:hover {
            border-color: var(--background-modifier-border-hover);
        }

        .dd-item-card.dd-dragging {
            opacity: 0.5;
            border-color: var(--interactive-accent);
        }

        .dd-item-card.dd-drag-over {
            border-color: var(--interactive-accent);
            border-style: dashed;
        }

        /* Drag handle */
        .dd-drag-handle {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 20px;
            margin-right: 8px;
            cursor: grab;
            color: var(--text-faint);
            opacity: 0.5;
            transition: opacity 0.15s ease;
        }

        .dd-drag-handle:hover {
            opacity: 1;
            color: var(--text-muted);
        }

        .dd-drag-handle:active {
            cursor: grabbing;
        }

        .dd-drag-handle svg {
            width: 14px;
            height: 14px;
        }

        /* Card content wrapper */
        .dd-card-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        /* Compact card layout */
        .dd-compact-card {
            padding: 10px;
        }

        .dd-compact-card .dd-drag-handle {
            align-self: center;
        }

        .dd-compact-row {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }

        .dd-row-spaced {
            justify-content: space-between;
        }

        /* Compact color picker */
        .dd-color-picker-sm {
            width: 28px;
            height: 28px;
            padding: 0;
            border: 2px solid var(--background-modifier-border);
            border-radius: 4px;
            cursor: pointer;
            flex-shrink: 0;
        }

        .dd-color-picker-sm:hover {
            border-color: var(--interactive-accent);
        }

        /* Compact icon picker */
        .dd-icon-compact {
            display: flex;
            align-items: center;
            gap: 4px;
            flex-shrink: 0;
        }

        .dd-icon-preview-sm {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            background: var(--background-primary);
            border: 1px solid var(--background-modifier-border);
            border-radius: 4px;
            color: var(--text-muted);
            font-size: 11px;
        }

        .dd-icon-preview-sm svg {
            width: 14px;
            height: 14px;
        }

        .dd-icon-input-sm {
            width: 70px;
            padding: 4px 8px;
            border: 1px solid var(--background-modifier-border);
            border-radius: 4px;
            background: var(--background-primary);
            color: var(--text-normal);
            font-size: var(--font-ui-smaller);
        }

        /* Compact input fields */
        .dd-name-input-compact {
            flex: 1;
            min-width: 100px;
            max-width: 180px;
        }

        .dd-key-input-compact {
            width: 100px;
            font-family: var(--font-monospace);
            font-size: var(--font-ui-smaller);
        }

        .dd-desc-input-compact {
            flex: 1;
            min-width: 150px;
        }

        .dd-default-compact {
            flex: 1;
            min-width: 100px;
            max-width: 200px;
        }

        /* Type content area */
        .dd-type-content {
            flex: 1;
            min-width: 0;
        }

        /* Right actions group */
        .dd-right-actions {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-shrink: 0;
        }

        /* Compact include toggle */
        .dd-include-compact {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .dd-include-compact .dd-include-label {
            font-family: var(--font-monospace);
            font-size: var(--font-ui-smaller);
            color: var(--text-muted);
            cursor: pointer;
        }

        /* Compact bool wrapper */
        .dd-bool-compact {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        /* Labeled field groups */
        .dd-labeled-field {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .dd-field-label-inline {
            font-size: 10px;
            color: var(--text-faint);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .dd-icon-field {
            flex-shrink: 0;
        }

        .dd-name-field {
            flex: 1;
            min-width: 100px;
        }

        .dd-name-field .dd-field-input {
            width: 100%;
        }

        .dd-key-field {
            flex-shrink: 0;
        }

        /* Include toggle top right position */
        .dd-include-top-right {
            display: flex;
            align-items: center;
            gap: 4px;
            flex-shrink: 0;
            padding: 2px 6px;
            background: var(--background-modifier-hover);
            border-radius: 4px;
        }

        .dd-include-top-right .dd-include-label {
            font-family: var(--font-monospace);
            font-size: var(--font-ui-smaller);
            color: var(--text-muted);
            cursor: pointer;
        }

        .dd-include-top-right .dd-include-toggle {
            width: 14px;
            height: 14px;
            cursor: pointer;
        }

        /* Name row - horizontal layout */
        .dd-name-row {
            display: flex;
            gap: 12px;
        }

        .dd-input-group {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .dd-input-group-small {
            flex: 0 0 140px;
        }

        .dd-field-label {
            font-size: var(--font-ui-smaller);
            color: var(--text-muted);
            font-weight: 500;
        }

        .dd-field-input {
            padding: 6px 10px;
            border: 1px solid var(--background-modifier-border);
            border-radius: 4px;
            background: var(--background-primary);
            color: var(--text-normal);
            font-size: var(--font-ui-small);
        }

        .dd-field-input:focus {
            border-color: var(--interactive-accent);
            outline: none;
        }

        .dd-field-input.dd-input-error {
            border-color: var(--text-error);
        }

        .dd-key-input {
            font-family: var(--font-monospace);
            font-size: var(--font-ui-smaller);
        }

        /* Description row */
        .dd-desc-row {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        /* Visual row - color and icon */
        .dd-visual-row {
            display: flex;
            gap: 20px;
            align-items: flex-start;
        }

        .dd-visual-group {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .dd-icon-group {
            flex: 1;
        }

        .dd-color-picker {
            width: 36px;
            height: 36px;
            padding: 0;
            border: 2px solid var(--background-modifier-border);
            border-radius: 6px;
            cursor: pointer;
        }

        .dd-color-picker:hover {
            border-color: var(--interactive-accent);
        }

        /* Icon picker */
        .dd-icon-picker-wrapper {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .dd-icon-preview {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            background: var(--background-primary);
            border: 1px solid var(--background-modifier-border);
            border-radius: 6px;
            color: var(--text-muted);
        }

        .dd-icon-preview svg {
            width: 18px;
            height: 18px;
        }

        .dd-icon-input {
            flex: 1;
            max-width: 160px;
            padding: 6px 10px;
            border: 1px solid var(--background-modifier-border);
            border-radius: 4px;
            background: var(--background-primary);
            color: var(--text-normal);
            font-size: var(--font-ui-smaller);
        }

        /* Type row */
        .dd-type-row {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        /* Type selector buttons */
        .dd-type-selector {
            display: flex;
            gap: 2px;
            background: var(--background-modifier-border);
            padding: 2px;
            border-radius: 6px;
        }

        .dd-type-btn {
            padding: 4px 10px;
            border: none;
            background: transparent;
            color: var(--text-muted);
            font-size: var(--font-ui-smaller);
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .dd-type-btn:hover {
            background: var(--background-modifier-hover);
            color: var(--text-normal);
        }

        .dd-type-btn.is-active {
            background: var(--interactive-accent);
            color: var(--text-on-accent);
        }

        /* Include toggle with label */
        .dd-include-wrapper {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-left: auto;
        }

        .dd-include-toggle {
            width: 16px;
            height: 16px;
            cursor: pointer;
        }

        .dd-include-label {
            font-size: var(--font-ui-smaller);
            color: var(--text-muted);
            cursor: pointer;
        }

        /* Card actions (delete button) */
        .dd-card-actions {
            display: flex;
            justify-content: flex-end;
            margin-top: 4px;
        }

        .dd-delete-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 28px;
            height: 28px;
            padding: 0 8px;
            border: none;
            background: transparent;
            color: var(--text-muted);
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .dd-delete-btn:hover {
            background: var(--background-modifier-error);
            color: var(--text-on-accent);
        }

        .dd-delete-btn svg {
            width: 14px;
            height: 14px;
        }

        .dd-delete-btn.dd-delete-confirming {
            background: var(--text-error);
            color: var(--text-on-accent);
            padding: 0 12px;
        }

        /* Default value row */
        .dd-default-value-row {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 0;
        }

        .dd-label {
            font-size: var(--font-ui-smaller);
            color: var(--text-muted);
        }

        .dd-default-input {
            flex: 1;
            max-width: 200px;
            padding: 6px 10px;
            border: 1px solid var(--background-modifier-border);
            border-radius: 4px;
            background: var(--background-primary);
            color: var(--text-normal);
        }

        .dd-bool-label {
            font-size: var(--font-ui-smaller);
            color: var(--text-muted);
            margin-left: 4px;
        }

        /* Enum horizontal buttons */
        .dd-enum-container {
            padding: 8px 0;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .dd-enum-buttons {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            align-items: center;
        }

        .dd-enum-btn-wrapper {
            position: relative;
            display: inline-flex;
        }

        .dd-enum-btn {
            padding: 6px 14px;
            border: 1px solid var(--background-modifier-border);
            background: var(--background-primary);
            color: var(--text-muted);
            border-radius: 16px;
            font-size: var(--font-ui-smaller);
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .dd-enum-btn:hover {
            border-color: var(--interactive-accent);
            color: var(--text-normal);
        }

        .dd-enum-btn.is-default {
            background: var(--interactive-accent);
            border-color: var(--interactive-accent);
            color: var(--text-on-accent);
        }

        /* Enum delete button - appears on hover */
        .dd-enum-delete-btn {
            position: absolute;
            top: -6px;
            right: -6px;
            width: 18px;
            height: 18px;
            padding: 0;
            border: none;
            background: var(--text-error);
            color: white;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transform: scale(0.8);
            transition: all 0.15s ease;
        }

        .dd-enum-delete-btn svg {
            width: 10px;
            height: 10px;
        }

        .dd-enum-btn-wrapper:hover .dd-enum-delete-btn {
            opacity: 1;
            transform: scale(1);
        }

        .dd-enum-add-btn {
            padding: 6px 14px;
            border: 1px dashed var(--background-modifier-border);
            background: transparent;
            color: var(--text-muted);
            border-radius: 16px;
            font-size: var(--font-ui-smaller);
            cursor: pointer;
        }

        .dd-enum-add-btn:hover {
            border-color: var(--interactive-accent);
            color: var(--interactive-accent);
        }

        .dd-help-text {
            font-size: var(--font-ui-smaller);
            color: var(--text-faint);
        }

        /* Add item button */
        .dd-add-item-container {
            margin: 8px 0;
        }

        .dd-add-item-btn {
            padding: 10px 16px;
            border: 1px dashed var(--background-modifier-border);
            background: transparent;
            color: var(--text-muted);
            border-radius: 8px;
            cursor: pointer;
            width: 100%;
            text-align: center;
            transition: all 0.15s ease;
        }

        .dd-add-item-btn:hover {
            border-color: var(--interactive-accent);
            color: var(--interactive-accent);
            background: var(--background-secondary);
        }

        /* Modal overlay */
        .dd-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        }

        /* Input modal */
        .dd-input-modal {
            background: var(--background-primary);
            border-radius: 12px;
            width: 360px;
            max-width: 90vw;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            overflow: hidden;
        }

        .dd-input-modal .dd-modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 14px 18px;
            border-bottom: 1px solid var(--background-modifier-border);
        }

        .dd-input-modal .dd-modal-header h4 {
            margin: 0;
            font-size: 1em;
        }

        .dd-modal-close {
            background: transparent;
            border: none;
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            color: var(--text-muted);
        }

        .dd-modal-close:hover {
            background: var(--background-modifier-hover);
            color: var(--text-normal);
        }

        .dd-input-modal .dd-modal-content {
            padding: 18px;
            display: flex;
            flex-direction: column;
            gap: 14px;
        }

        .dd-modal-field {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .dd-modal-field label {
            font-size: var(--font-ui-smaller);
            color: var(--text-muted);
            font-weight: 500;
        }

        .dd-modal-input {
            padding: 8px 12px;
            border: 1px solid var(--background-modifier-border);
            border-radius: 6px;
            background: var(--background-primary);
            color: var(--text-normal);
            font-size: var(--font-ui-small);
        }

        .dd-modal-input:focus {
            border-color: var(--interactive-accent);
            outline: none;
        }

        .dd-modal-input.dd-input-error {
            border-color: var(--text-error);
        }

        .dd-modal-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            padding: 12px 18px;
            border-top: 1px solid var(--background-modifier-border);
        }

        .dd-modal-actions button {
            padding: 6px 16px;
            border: 1px solid var(--background-modifier-border);
            border-radius: 6px;
            background: var(--background-primary);
            color: var(--text-normal);
            cursor: pointer;
        }

        .dd-modal-actions button:hover {
            background: var(--background-secondary);
        }

        .dd-modal-actions button.mod-cta {
            background: var(--interactive-accent);
            border-color: var(--interactive-accent);
            color: var(--text-on-accent);
        }

        .dd-modal-actions button.mod-cta:hover {
            filter: brightness(1.1);
        }
    `;
    document.head.appendChild(style);
}
