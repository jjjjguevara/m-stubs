# Doc Doctor

An AI-powered document quality system for [Obsidian](https://obsidian.md) that enables tracking document gaps, semantic exploration, and editorial workflows. Built on the [J-Editorial Framework](https://jjjjguevara.vercel.app/j-editorial) principles.

> **Fork Notice**: Doc Doctor is a fork of [Enhanced Annotations](https://github.com/ycnmhd/obsidian-enhanced-annotations) by [ycnmhd](https://github.com/ycnmhd). The original plugin provides excellent comment/highlight management features which remain fully functional in this fork. Doc Doctor extends these capabilities with a comprehensive stubs system for document quality tracking.

## What are Stubs?

Stubs are **dynamic demand signals** that function as editorial vectors—not just TODO lists. Each stub has measurable properties that enable:

- **Gap Tracking**: Acknowledge what's missing in your documents
- **Quality Control**: Track refinement scores and resolution progress
- **Bidirectional Sync**: Link frontmatter stubs to inline anchors
- **Workflow Automation**: Route work based on stub type and priority

### Stub Types

Doc Doctor supports configurable stub types out of the box:

| Type | Purpose | Example |
|:-----|:--------|:--------|
| **Link** | Citation or reference needed | "Add source for this claim" |
| **Expand** | Section needs more content | "Elaborate on implementation details" |
| **Question** | Clarification needed | "What's the performance impact?" |
| **Fix** | Error or issue to address | "Correct the date format" |

## Features

### AI Integration (New in v0.4.0+)

Doc Doctor integrates with LLMs to provide intelligent document analysis and stub resolution assistance, powered by a schema-first architecture.

#### J-Editorial Schema System (v0.4.2)
- **Schema-Driven Prompts**: LLM requests include full J-Editorial ontology (property definitions, vector families, stub semantics)
- **User-Overridable Schema**: Extend or replace the default schema via `.doc-doctor/schema.yaml`
- **Creativity Modes**: Auto-suggested modes based on document properties (Research, Review, Draft, Creative)
- **Reference Verification**: Mandatory tool use for citations with verification pipeline

#### LLM-Powered Features
- **Stub Suggestions**: Get AI-generated recommendations for resolving stubs
- **Document Analysis**: Analyze document structure and identify quality gaps
- **Custom Prompts**: Configure custom prompt templates for specific workflows
- **Multi-Provider Support**: Choose between Anthropic (Claude) or OpenAI (GPT)

#### MCP Server Integration
- Connect Claude Code via Model Context Protocol for batch operations
- Document parsing, validation, and analysis tools
- Stub manipulation and resolution workflows

#### Web Search (Firecrawl)
- Optional Firecrawl integration for external context
- Search and scrape web content to inform stub resolution
- Enrich documents with cited sources

### Explore View (New in v0.4.0+)

Semantic search and related notes discovery powered by [Smart Connections](https://github.com/brianpetro/obsidian-smart-connections).

#### Smart Connections Integration
- **Embedding-Based Search**: Find semantically related notes using AI embeddings
- **Related Notes Panel**: View and navigate to related content in the sidebar
- **Configurable Threshold**: Adjust similarity threshold for result filtering
- **Fallback Search**: Keyword-based search when Smart Connections unavailable

#### Related Property Management
- Customize the frontmatter property name for related notes (default: `related`)
- Auto-populate suggestions from semantic search results
- Navigate directly to related documents

#### Result Card Customization (v0.4.2)
- **Segmented Cards**: Divide result cards into 1-6 clickable regions
- **Command Mapping**: Map each region to any Obsidian command
- **Draggable Handles**: Resize regions with visual drag handles
- **Preset Layouts**: Choose from Equal 4, Equal 5, Asymmetric, or Custom

### Stubs System (v0.2.0+)

#### Quick Stub Insertion
- Type `^^` to insert a **compact stub** with default description
- Type `^^^` to insert a **structured stub** with configurable properties
- Inline anchors (`^stub-xxx`) automatically sync with frontmatter

#### Sidebar Stubs Panel
- View all stubs in your document organized by type
- Click to navigate between inline anchor and frontmatter definition
- Delete stubs with two-step confirmation and undo
- Filter by stub type (multi-select) and sort by document position

#### Frontmatter Integration
```yaml
stubs:
  - expand: #structured stub
      description: "Add deployment examples"
      stub_form: persistent
      priority: high
      anchor: ^expand-def456
  - verify: "This statement contradicts Section 1.2" # compact stub
    anchor: ^verify-ghi789
  - question: "What's the performance impact of the new approach from section 2.3?" # orphaned stub
    
```

#### Configurable Stub Types
- Add custom stub types with unique colors and icons
- Set default descriptions for quick insertion
- Configure structured properties (stub_form, priority, etc.)
- Per-property toggles for structured stub insertion

### Original Enhanced Annotations Features

All features from the original Enhanced Annotations plugin remain:

- **Sidebar View**: Explore comments/highlights of the active file
- **Note Creation**: Create notes from comments using context menu
- **Clipboard Export**: Copy comments from selected files
- **Custom Styling**: Assign styles based on comment labels (e.g., `<!--todo: -->`)
- **Auto-complete**: Use trigger phrases to insert labeled comments

## Installation

### From Obsidian Community Plugins (Coming Soon)
1. Open Settings → Community Plugins
2. Search for "Doc Doctor"
3. Install and enable

### Manual Installation
1. Download the latest release from [GitHub Releases](https://github.com/jjjjguevara/doc-doctor/releases)
2. Extract to your vault's `.obsidian/plugins/doc-doctor/` folder
3. Enable the plugin in Settings → Community Plugins

### Building from Source
```bash
git clone https://github.com/jjjjguevara/doc-doctor.git
cd doc-doctor
npm install
npm run build
```

## Usage

### Quick Start (2 Minutes)

1. **Create your first stub**: Type `^^` in your document, select a stub type
2. **View in sidebar**: Click the Doc Doctor icon in the left ribbon
3. **Navigate**: Click a stub to jump to its location

### Stub Syntax

#### Compact Syntax (`^^`)
```markdown
Some text that needs a citation. ^stub-abc123
```
Frontmatter:
```yaml
stubs:
  - link: "Citation needed."
    anchor: ^stub-abc123
```

#### Structured Syntax (`^^^`)
```markdown
*A section needing expansion.* ^stub-def456
```
Frontmatter:
```yaml
stubs:
  - expand:
      description: "Add more details"
      stub_form: persistent
      priority: medium
      anchor: ^stub-def456
```

### Sidebar Controls

| Button | Function |
|:-------|:---------|
| 🔄 | Sync stubs with document |
| 🔍 | Search stubs by text |
| 🏷️ | Filter by stub type (multi-select) |
| ↕️ | Sort: by type / first-to-last / last-to-first |
| ⚙️ | Stub type settings |

### Configuration

Access settings via **Settings → Doc Doctor** or the gear icon in the stubs sidebar panel.

#### Stub Types
- Add/remove/reorder stub types
- Set display name, color, and icon
- Configure default descriptions

#### Structured Properties
- Define properties like `stub_form`, `priority`, `assignees`
- Set default values for each property
- Toggle which properties appear in structured stubs

## J-Editorial Framework Integration

Doc Doctor implements the [J-Editorial Framework](https://jjjjguevara.vercel.app/j-editorial/), a comprehensive quality control framework for knowledge management.

### Three-Layer Architecture

| Layer | Description | Doc Doctor Support |
|:------|:------------|:----------------|
| **L1: Intrinsic** | What stubs ARE (stored in frontmatter) | ✅ Full support |
| **L2: Extrinsic** | What stubs MEAN (calculated dimensions) | 🔄 Dashboard integration |
| **L3: Operational** | How stubs BEHAVE (automated workflows) | 🔜 Future release |

### Stub Properties

**`stub_form`** - Expected lifecycle and severity:
- `transient`: Temporary gap, resolve soon
- `persistent`: Long-term gap, document anyway
- `blocking`: Must resolve before promotion
- `structural`: Fundamental architecture issue

**`priority`** - Urgency level:
- `low`, `medium`, `high`, `critical`

### Refinement Impact

Stubs affect document refinement scores:
- `transient`: -0.02 per stub
- `persistent`: -0.05 per stub
- `blocking`: -0.10 per stub
- `structural`: -0.15 per stub

## Roadmap

Doc Doctor is evolving toward a comprehensive document quality system with deterministic J-Editorial calculations.

### Phase 1: Rust Core Library (In Progress)

A high-performance Rust library (`doc-doctor-core`) providing:

- **L1 Property Parsing**: YAML frontmatter extraction with position tracking
- **L2 Dimension Calculations**: Health, usefulness, vector physics
- **Stub System**: Type validation, form penalties, sync status

```
doc-doctor/core/
├── crates/
│   ├── doc-doctor-core/   # Core library (Rust)
│   ├── doc-doctor-ffi/    # WASM bindings for Obsidian
│   ├── doc-doctor-mcp/    # MCP server for Claude Code
│   └── doc-doctor-cli/    # Command-line tool
```

### Phase 2: WASM Integration

Compile `doc-doctor-core` to WebAssembly for native performance in Obsidian:
- Real-time health score calculation
- Instant usefulness margin feedback
- Vector physics visualization

### Phase 3: CLI Tool

Batch processing and CI/CD integration:
- `doc-doctor validate "**/*.md"` - Schema validation
- `doc-doctor health --audience internal` - Quality gates
- `doc-doctor sync --fix` - Automatic stub-anchor repair

### Phase 4: MCP Server

Claude Code integration with J-Editorial intelligence:
- Document analysis tools
- Stub resolution assistance
- Quality improvement suggestions

### Key Formulas (Implemented in Rust)

**Health Score**:
```
health = 0.7 × refinement + 0.3 × (1 - stub_penalty)
```

**Usefulness Margin**:
```
margin = refinement - audience_gate
```
Where gates are: Personal (0.50), Internal (0.70), Trusted (0.80), Public (0.90)

**Vector Physics**:
```
potential_energy = urgency × impact × complexity
magnitude = √(PE² + friction²)
```

## Changelog

### v0.4.2 (2024-12-04)
- **New**: J-Editorial Schema System - schema-first LLM architecture with full ontology transmission
- **New**: Creativity Modes (Research, Review, Draft, Creative) auto-suggested from document properties
- **New**: Reference Verification pipeline with mandatory tool use for citations
- **New**: User-overridable schema via `.doc-doctor/schema.yaml`
- **New**: Result Card Customization with segmented regions (1-6) and command mapping
- **New**: Draggable region resize handles for custom card layouts
- **New**: Searchable command dropdown with verbatim word-start matching
- **New**: Command Manifest (`src/commands/command-manifest.ts`) for developer tooling
- **Improved**: Explore search field input handling (fixed reactive statement bug)
- **Improved**: Settings scroll preservation during UI updates
- **Fixed**: Stubs Data Type change no longer rearranges the property list

### v0.4.1 (2024-12-03)
- **New**: General settings tab with master feature toggles (Annotations, Stubs, AI, Explore)
- **New**: Unified diagnostics panel for all integrations (LLM, MCP, Smart Connections)
- **New**: Configurable related property name in Explore settings
- **Improved**: Smart Connections loading reliability (auto-refresh when embeddings ready)
- **Improved**: Settings organization with cross-cutting concerns in General tab

### v0.4.0 (2024-12-03)
- **New**: AI Integration with LLM-powered document analysis
- **New**: Multi-provider support (Anthropic Claude, OpenAI GPT)
- **New**: MCP server for Claude Code integration
- **New**: Custom prompt templates for stub resolution
- **New**: Firecrawl integration for web search and scraping
- **New**: Explore view with Smart Connections integration
- **New**: Semantic search using AI embeddings
- **New**: Related notes discovery with configurable similarity threshold
- **New**: Fallback keyword search when Smart Connections unavailable
- **New**: Debug mode with dry-run and verbose logging options

### v0.3.0 (2024-12-02)
- **Fixed**: Stub deletion now works correctly (two-click confirmation)
- **Fixed**: Frontmatter preservation during stub operations (no more reformatting)
- **New**: Direct string manipulation for stub removal preserves YAML formatting
- **New**: Rust workspace scaffolding in `core/` directory
- **New**: `doc-doctor-core` crate with L1/L2 calculations (43 tests passing)

### v0.2.0 (2024-12-01)
- **New**: Complete stubs system with sidebar panel
- **New**: Quick stub insertion (`^^` and `^^^` triggers)
- **New**: Bidirectional sync between frontmatter and inline anchors
- **New**: Configurable stub types with custom colors/icons
- **New**: Multi-select type filter and position-based sorting
- **New**: View state persistence across sessions
- **New**: Structured property configuration
- Renamed from Enhanced Annotations to Doc Doctor

### v0.1.x (Original Enhanced Annotations)
See [original changelog](https://github.com/ycnmhd/obsidian-enhanced-annotations/releases)

## Attribution

### Original Author
**[ycnmhd](https://github.com/ycnmhd)** - Creator of Enhanced Annotations

The core annotation features (sidebar view, note creation, custom styling, auto-complete) are the work of ycnmhd. This fork builds upon that excellent foundation.

### Fork Author
**[Josué Guevara](https://github.com/jjjjguevara)** - Creator of Doc Doctor

The stubs system, J-Editorial integration, and related features were developed as part of the J-Editorial Framework project.

## License

MIT License - See [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

For major changes, please open an issue first to discuss the proposed changes.

## Related Projects

- [J-Editorial Framework](https://jjjjguevara.vercel.app/j-editorial) - The parent framework for knowledge management
- [Enhanced Annotations](https://github.com/ycnmhd/obsidian-enhanced-annotations) - The original plugin this fork is based on

---

**Version**: 0.4.2
**Obsidian**: 0.15.0+
**License**: MIT
