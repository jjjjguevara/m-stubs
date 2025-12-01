# M-Stubs

A vector-based stubs system for [Obsidian](https://obsidian.md) that enables tracking document gaps, quality control, and editorial workflows. Built on the [J-Editorial Framework](https://github.com/jjjjguevara/j-editorial) principles.

> **Fork Notice**: M-Stubs is a fork of [Enhanced Annotations](https://github.com/ycnmhd/obsidian-enhanced-annotations) by [ycnmhd](https://github.com/ycnmhd). The original plugin provides excellent comment/highlight management features which remain fully functional in this fork. M-Stubs extends these capabilities with a comprehensive stubs system for document quality tracking.

## What are Stubs?

Stubs are **dynamic demand signals** that function as editorial vectors—not just TODO lists. Each stub has measurable properties that enable:

- **Gap Tracking**: Acknowledge what's missing in your documents
- **Quality Control**: Track refinement scores and resolution progress
- **Bidirectional Sync**: Link frontmatter stubs to inline anchors
- **Workflow Automation**: Route work based on stub type and priority

### Stub Types

M-Stubs supports configurable stub types out of the box:

| Type | Purpose | Example |
|:-----|:--------|:--------|
| **Link** | Citation or reference needed | "Add source for this claim" |
| **Expand** | Section needs more content | "Elaborate on implementation details" |
| **Question** | Clarification needed | "What's the performance impact?" |
| **Fix** | Error or issue to address | "Correct the date format" |

## Features

### Stubs System (New in v0.2.0)

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
  - link: "Citation needed" ^stub-abc123
  - expand:
      description: "Add deployment examples"
      stub_form: persistent
      priority: high
    ^stub-def456
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
2. Search for "M-Stubs"
3. Install and enable

### Manual Installation
1. Download the latest release from [GitHub Releases](https://github.com/jjjjguevara/obsidian-enhanced-annotations/releases)
2. Extract to your vault's `.obsidian/plugins/m-stubs/` folder
3. Enable the plugin in Settings → Community Plugins

### Building from Source
```bash
git clone https://github.com/jjjjguevara/obsidian-enhanced-annotations.git
cd obsidian-enhanced-annotations
npm install
npm run build
```

## Usage

### Quick Start (2 Minutes)

1. **Create your first stub**: Type `^^` in your document, select a stub type
2. **View in sidebar**: Click the M-Stubs icon in the left ribbon
3. **Navigate**: Click a stub to jump to its location

### Stub Syntax

#### Compact Syntax (`^^`)
```markdown
Some text that needs a citation. ^stub-abc123
```
Frontmatter:
```yaml
stubs:
  - link: "Citation needed." ^stub-abc123
```

#### Structured Syntax (`^^^`)
```markdown
This section needs expansion. ^stub-def456
```
Frontmatter:
```yaml
stubs:
  - expand:
      description: "Add more details"
      stub_form: persistent
      priority: medium
    ^stub-def456
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

Access settings via **Settings → M-Stubs** or the gear icon in the stubs sidebar panel.

#### Stub Types
- Add/remove/reorder stub types
- Set display name, color, and icon
- Configure default descriptions

#### Structured Properties
- Define properties like `stub_form`, `priority`, `assignees`
- Set default values for each property
- Toggle which properties appear in structured stubs

## J-Editorial Framework Integration

M-Stubs implements the [J-Editorial Stubs Standard](https://github.com/jjjjguevara/j-editorial/blob/main/framework/02-practice/stubs/spec-stubs-standard.md), a comprehensive quality control framework for knowledge management.

### Three-Layer Architecture

| Layer | Description | M-Stubs Support |
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

## Changelog

### v0.2.0 (2024-12-01)
- **New**: Complete stubs system with sidebar panel
- **New**: Quick stub insertion (`^^` and `^^^` triggers)
- **New**: Bidirectional sync between frontmatter and inline anchors
- **New**: Configurable stub types with custom colors/icons
- **New**: Multi-select type filter and position-based sorting
- **New**: View state persistence across sessions
- **New**: Structured property configuration
- Renamed from Enhanced Annotations to M-Stubs

### v0.1.x (Original Enhanced Annotations)
See [original changelog](https://github.com/ycnmhd/obsidian-enhanced-annotations/releases)

## Attribution

### Original Author
**[ycnmhd](https://github.com/ycnmhd)** - Creator of Enhanced Annotations

The core annotation features (sidebar view, note creation, custom styling, auto-complete) are the work of ycnmhd. This fork builds upon that excellent foundation.

### Fork Author
**[Josué Guevara](https://github.com/jjjjguevara)** - Creator of M-Stubs extension

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

- [J-Editorial Framework](https://github.com/jjjjguevara/j-editorial) - The parent framework for knowledge management
- [Enhanced Annotations](https://github.com/ycnmhd/obsidian-enhanced-annotations) - The original plugin this fork is based on

---

**Version**: 0.2.0
**Obsidian**: 0.15.0+
**License**: MIT
