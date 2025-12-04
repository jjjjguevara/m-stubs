/**
 * MCP Settings Component
 *
 * Settings UI for MCP integration configuration.
 */

import { Setting, Notice } from 'obsidian';
import type LabeledAnnotations from '../../main';
import { MCPClient } from '../../mcp';

interface Props {
    plugin: LabeledAnnotations;
    containerEl: HTMLElement;
}

// Store MCP client instance for testing
let testClient: MCPClient | null = null;

export const MCPSettings = ({ plugin, containerEl }: Props) => {
    const settings = plugin.settings.getValue();
    const mcpConfig = settings.mcp;

    // Header
    containerEl.createEl('h2', { text: 'MCP Integration' });
    containerEl.createEl('p', {
        text: 'Connect to the doc-doctor-mcp server for document operations. Install via: cargo install doc-doctor',
        cls: 'setting-item-description',
    });

    // Enable MCP
    new Setting(containerEl)
        .setName('Enable MCP')
        .setDesc('Use MCP server for document operations (recommended for full functionality)')
        .addToggle((toggle) => {
            toggle.setValue(mcpConfig.enabled).onChange((value) => {
                plugin.settings.dispatch({
                    type: 'MCP_SET_ENABLED',
                    payload: { enabled: value },
                });
                // Refresh settings display
                containerEl.empty();
                MCPSettings({ plugin, containerEl });
            });
        });

    // Only show remaining settings if enabled
    if (!mcpConfig.enabled) {
        return;
    }

    // Binary path
    const binaryPathSetting = new Setting(containerEl)
        .setName('Binary Path')
        .setDesc('Path to dd-mcp binary (leave empty for auto-detect)');

    binaryPathSetting.addText((text) => {
        text.inputEl.style.width = '300px';
        text.setPlaceholder('Auto-detect (~/.cargo/bin/dd-mcp)')
            .setValue(mcpConfig.binaryPath)
            .onChange((value) => {
                plugin.settings.dispatch({
                    type: 'MCP_SET_BINARY_PATH',
                    payload: { path: value.trim() },
                });
            });
    });

    // Test connection button
    binaryPathSetting.addButton((button) => {
        button
            .setButtonText('Test')
            .setCta()
            .onClick(async () => {
                button.setButtonText('Testing...');
                button.setDisabled(true);

                try {
                    // Clean up any existing test client
                    if (testClient) {
                        await testClient.disconnect();
                        testClient = null;
                    }

                    // Create new test client
                    const currentSettings = plugin.settings.getValue();
                    testClient = new MCPClient({
                        binaryPath: currentSettings.mcp.binaryPath,
                        timeout: currentSettings.mcp.connectionTimeout,
                    });

                    await testClient.connect();
                    const tools = await testClient.listTools();

                    button.setButtonText('Success!');
                    new Notice(`MCP connected! ${tools.length} tools available.`);

                    // Disconnect after test
                    await testClient.disconnect();
                    testClient = null;

                    setTimeout(() => button.setButtonText('Test'), 2000);
                } catch (error) {
                    button.setButtonText('Failed');
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    new Notice(`MCP connection failed: ${message}`);
                    console.error('[Doc Doctor] MCP test error:', error);
                    setTimeout(() => button.setButtonText('Test'), 2000);
                } finally {
                    button.setDisabled(false);
                }
            });
    });

    // Auto-connect
    new Setting(containerEl)
        .setName('Auto-connect on Load')
        .setDesc('Automatically connect to MCP server when plugin loads')
        .addToggle((toggle) => {
            toggle.setValue(mcpConfig.autoConnect).onChange((value) => {
                plugin.settings.dispatch({
                    type: 'MCP_SET_AUTO_CONNECT',
                    payload: { enabled: value },
                });
            });
        });

    // Connection timeout
    new Setting(containerEl)
        .setName('Connection Timeout')
        .setDesc('Maximum time to wait for MCP responses (seconds)')
        .addSlider((slider) => {
            slider
                .setLimits(5, 120, 5)
                .setValue(mcpConfig.connectionTimeout / 1000)
                .setDynamicTooltip()
                .onChange((value) => {
                    plugin.settings.dispatch({
                        type: 'MCP_SET_CONNECTION_TIMEOUT',
                        payload: { timeout: value * 1000 },
                    });
                });
        });

    // Show status bar
    new Setting(containerEl)
        .setName('Show Status in Status Bar')
        .setDesc('Display MCP connection status in the status bar')
        .addToggle((toggle) => {
            toggle.setValue(mcpConfig.showStatusBar).onChange((value) => {
                plugin.settings.dispatch({
                    type: 'MCP_SET_SHOW_STATUS_BAR',
                    payload: { enabled: value },
                });
            });
        });

    // Installation help
    containerEl.createEl('h3', { text: 'Installation' });
    containerEl.createEl('p', {
        text: 'To install the MCP server, run:',
        cls: 'setting-item-description',
    });

    const codeEl = containerEl.createEl('pre', {
        cls: 'doc-doctor-code-block',
    });
    codeEl.createEl('code', {
        text: 'cargo install doc-doctor',
    });

    containerEl.createEl('p', {
        text: 'The binary will be installed to ~/.cargo/bin/dd-mcp which is auto-detected.',
        cls: 'setting-item-description',
    });

    // Available tools info
    containerEl.createEl('h3', { text: 'Available Operations' });

    const toolsList = containerEl.createEl('ul', {
        cls: 'setting-item-description',
    });

    const tools = [
        'parse_document - Parse frontmatter and content',
        'analyze_document - Full document analysis with health metrics',
        'add_stub / resolve_stub - Manage document stubs',
        'link_stub_anchor - Connect stubs to inline anchors',
        'calculate_health - Get document health score',
        'scan_vault - Analyze multiple documents',
    ];

    tools.forEach((tool) => {
        toolsList.createEl('li', { text: tool });
    });
};
