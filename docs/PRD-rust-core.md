# PRD: Doc Doctor Rust Core Library

**Version**: 0.1.0
**Date**: 2024-12-02
**Author**: Claude (with Josué Guevara)
**Status**: Draft

---

## 1. Overview

### 1.1 Problem Statement

The Doc Doctor Obsidian plugin currently implements J-Editorial calculations (health scores, usefulness margins, vector physics) in TypeScript. This approach has limitations:

1. **Performance**: Complex calculations on large vaults are slow in JavaScript
2. **Correctness**: No compile-time guarantees for numeric operations
3. **Portability**: Logic is locked inside the Obsidian plugin, unavailable to CLI tools or other integrations
4. **AI Integration**: Claude Code lacks deterministic J-Editorial tools for document analysis

### 1.2 Proposed Solution

Create a **Rust core library** (`doc-doctor-core`) that implements all deterministic J-Editorial calculations with:

- **High performance**: Native speed via WASM compilation
- **Type safety**: Rust's type system ensures correctness
- **Portability**: Single source of truth for CLI, MCP server, and Obsidian plugin
- **AI-native**: MCP server exposes tools to Claude Code

### 1.3 Architecture

```
doc-doctor/core/
├── Cargo.toml                    # Workspace root
├── rust-toolchain.toml           # Rust 1.75+
└── crates/
    ├── doc-doctor-core/          # Core library (no I/O)
    ├── doc-doctor-ffi/           # WASM + N-API bindings
    ├── doc-doctor-mcp/           # MCP server binary
    └── doc-doctor-cli/           # CLI binary
```

### 1.4 Target Users

| User | Use Case |
|------|----------|
| **Obsidian Users** | Real-time health scores, usefulness feedback in sidebar |
| **Claude Code Users** | AI-assisted document analysis with J-Editorial intelligence |
| **CI/CD Pipelines** | Automated quality gates on documentation PRs |
| **CLI Power Users** | Batch processing, vault-wide reports |

---

## 2. Goals & Non-Goals

### 2.1 Goals

| ID | Goal | Success Metric |
|----|------|----------------|
| G1 | Implement L1 property parsing with position tracking | Parse frontmatter with line/column info for error messages |
| G2 | Implement L2 dimension calculations | Health, usefulness, vector physics match J-Editorial spec |
| G3 | Compile to WASM for Obsidian integration | `<100ms` cold start, `<1ms` per document calculation |
| G4 | Provide MCP server for Claude Code | All tools callable via MCP protocol |
| G5 | Provide CLI for batch operations | Process 1000+ documents in <10 seconds |
| G6 | Maintain formula parity with J-Editorial spec | All calculations produce identical results |
| G7 | Support both compact and structured stub syntax | Parse `- link: "desc"` and `- link: { description: "..." }` |

### 2.2 Non-Goals

| ID | Non-Goal | Rationale |
|----|----------|-----------|
| NG1 | File system operations in core | Core is pure computation; I/O handled by CLI/MCP |
| NG2 | Network requests | No external API calls from core library |
| NG3 | UI rendering | WASM produces data; Obsidian renders it |
| NG4 | L3 operational rules | Rule engine is future work |
| NG5 | Database/persistence | Stateless library; state managed by callers |

---

## 3. Requirements

### 3.1 doc-doctor-core (Core Library)

#### 3.1.1 L1 Property Types

| Type | Description | Validation |
|------|-------------|------------|
| `Refinement` | Score 0.0-1.0 | Clamp or error on out-of-range |
| `Audience` | Enum: personal, internal, trusted, public | Case-insensitive parsing |
| `Origin` | Enum: human, ai_assisted, ai, mixed | Affects trust calculations |
| `Form` | Enum: note, article, reference, etc. | Extensible |
| `Stub` | Type, description, anchor, form, priority | Full J-Editorial stub model |
| `StubForm` | Enum: transient, persistent, blocking, structural | Refinement penalties |
| `Priority` | Enum: low, medium, high, critical | Urgency multiplier |

#### 3.1.2 L2 Dimension Calculations

**Health Score**
```
health = 0.7 × refinement + 0.3 × (1 - stub_penalty)
```

Where `stub_penalty` is sum of:
- transient: 0.02 per stub
- persistent: 0.05 per stub
- blocking: 0.10 per stub
- structural: 0.15 per stub

**Usefulness Margin**
```
margin = refinement - audience_gate
is_useful = margin >= 0
```

Audience gates:
- Personal: 0.50
- Internal: 0.70
- Trusted: 0.80
- Public: 0.90

**Vector Physics**
```
potential_energy = urgency × impact × complexity
friction_coefficient = base_friction + participant_penalty + blocking_penalty
magnitude = √(PE² + friction²)
```

#### 3.1.3 Parser Requirements

| Requirement | Description |
|-------------|-------------|
| Frontmatter extraction | Find `---` delimiters, extract YAML |
| Position tracking | Map byte offsets to line/column |
| Error recovery | Return partial results with error list |
| Strict mode | Reject unknown fields when enabled |

#### 3.1.4 API Surface

```rust
// Main entry points
pub fn parse_document(content: &str) -> Result<L1Properties>;
pub fn validate_frontmatter(content: &str, strict: bool) -> Result<Vec<ValidationWarning>>;

// L2 calculations
pub fn calculate_health(refinement: f64, stubs: &[Stub]) -> f64;
pub fn calculate_usefulness(refinement: f64, audience: Audience) -> Usefulness;
pub fn calculate_vector_physics(stub: &Stub, context: &StubContext) -> VectorPhysics;

// Batch operations
pub fn calculate_state_dimensions(props: &L1Properties) -> StateDimensions;
```

### 3.2 doc-doctor-ffi (Foreign Function Interface)

#### 3.2.1 WASM Bindings

| Function | Parameters | Returns |
|----------|------------|---------|
| `parseDocument` | `content: string` | `JSON<L1Properties>` |
| `calculateHealth` | `refinement: number, stubs: JSON` | `number` |
| `calculateUsefulness` | `refinement: number, audience: string` | `JSON<Usefulness>` |
| `validateFrontmatter` | `content: string, strict: boolean` | `JSON<ValidationResult>` |

#### 3.2.2 Build Targets

| Target | Use Case |
|--------|----------|
| `wasm32-unknown-unknown` | Obsidian plugin (via wasm-bindgen) |
| `wasm32-wasi` | Node.js CLI (optional) |

### 3.3 doc-doctor-mcp (MCP Server)

#### 3.3.1 Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `doc_doctor_parse` | Parse document frontmatter | `content: string` |
| `doc_doctor_health` | Calculate health score | `refinement: number, stubs?: Stub[]` |
| `doc_doctor_usefulness` | Calculate usefulness margin | `refinement: number, audience: string` |
| `doc_doctor_validate` | Validate against schema | `content: string, strict?: boolean` |
| `doc_doctor_batch_health` | Batch health calculation | `files: string[]` (glob patterns) |

#### 3.3.2 Resources

| Resource | URI Pattern | Description |
|----------|-------------|-------------|
| Schema | `doc-doctor://schema/frontmatter` | JSON Schema for frontmatter |
| Schema | `doc-doctor://schema/stubs` | JSON Schema for stubs array |

#### 3.3.3 Protocol

- Transport: stdio (for Claude Code integration)
- Protocol version: MCP 1.0
- Authentication: None (local process)

### 3.4 doc-doctor-cli (Command Line Tool)

#### 3.4.1 Commands

```bash
# Parse and display L1 properties
doc-doctor parse <file>

# Validate frontmatter
doc-doctor validate <pattern> [--strict]

# Calculate health score
doc-doctor health --refinement 0.75 [--stubs <json>]

# Calculate usefulness
doc-doctor usefulness --refinement 0.75 --audience internal

# List stubs from documents
doc-doctor stubs <file> [--type <type>] [--form <form>]

# Calculate all dimensions
doc-doctor dimensions <file>

# Batch process with report
doc-doctor batch <pattern> [--format json|yaml|table]

# Check stub-anchor sync status
doc-doctor sync <file>

# Export JSON schema
doc-doctor schema <type>
```

#### 3.4.2 Output Formats

| Format | Flag | Use Case |
|--------|------|----------|
| Human | `--format human` (default) | Terminal display |
| JSON | `--format json` | Scripting, piping |
| YAML | `--format yaml` | Config generation |

---

## 4. Integration Plans

### 4.1 Phase 1: Core Library (Complete)

- [x] Workspace structure
- [x] L1 property types with validation
- [x] Stub types (StubForm, Priority, VectorPhysics)
- [x] Frontmatter parser with position tracking
- [x] L2 state dimension calculations
- [x] 43 unit tests passing

### 4.2 Phase 2: WASM Bindings

- [ ] Add wasm-bindgen annotations to FFI crate
- [ ] Build WASM module with `wasm-pack`
- [ ] Create TypeScript type declarations
- [ ] Integrate into Obsidian plugin build
- [ ] Replace TypeScript calculations with WASM calls
- [ ] Performance benchmarking

### 4.3 Phase 3: CLI Tool

- [ ] Implement remaining commands (validate, stubs, dimensions, batch, sync, schema)
- [ ] Add glob pattern support for batch operations
- [ ] Implement output formatters (human, JSON, YAML)
- [ ] Add progress indicators for batch operations
- [ ] Write integration tests

### 4.4 Phase 4: MCP Server

- [ ] Implement MCP protocol handler
- [ ] Register tools with schema definitions
- [ ] Add resource providers for schemas
- [ ] Test with Claude Code
- [ ] Document tool usage in Claude Code context

### 4.5 Phase 5: Obsidian Integration

- [ ] Load WASM module in plugin initialization
- [ ] Replace manual health/usefulness calculations
- [ ] Add real-time dimension display in sidebar
- [ ] Implement caching for performance
- [ ] Add settings for calculation preferences

---

## 5. Testing Strategy

### 5.1 Unit Tests (doc-doctor-core)

| Category | Coverage Target |
|----------|-----------------|
| L1 type parsing | 100% of variants |
| L2 calculations | Formula verification with known values |
| Edge cases | Empty stubs, boundary values, invalid input |
| Error handling | Position tracking accuracy |

### 5.2 Integration Tests (CLI)

| Test | Description |
|------|-------------|
| Parse real documents | Test against vault samples |
| Batch processing | 100+ file processing |
| Output formats | Verify JSON/YAML validity |
| Error recovery | Partial failures in batch mode |

### 5.3 WASM Tests

| Test | Description |
|------|-------------|
| Round-trip | Parse → serialize → parse produces same result |
| Performance | <1ms per document calculation |
| Memory | No leaks in repeated operations |

### 5.4 Test Vault

Location: `/Users/josueguevara/Library/Mobile Documents/iCloud~md~obsidian/Documents/M/Proyectos/Builds/doc-doctor/tests`

Contains:
- Documents with various frontmatter formats
- Stubs in compact and structured syntax
- Edge cases (empty stubs, missing fields, invalid values)

---

## 6. Dependencies

### 6.1 Rust Crates

| Crate | Version | Purpose |
|-------|---------|---------|
| `serde` | 1.0 | Serialization framework |
| `serde_yaml` | 0.9 | YAML parsing |
| `serde_json` | 1.0 | JSON serialization |
| `thiserror` | 1.0 | Error type derivation |
| `chrono` | 0.4 | Date/time handling |
| `clap` | 4.0 | CLI argument parsing |
| `wasm-bindgen` | 0.2 | WASM bindings |
| `tokio` | 1.0 | Async runtime (MCP server) |
| `glob` | 0.3 | File pattern matching |

### 6.2 Build Requirements

| Tool | Version | Purpose |
|------|---------|---------|
| Rust | 1.75+ | Compiler |
| wasm-pack | 0.12+ | WASM packaging |
| Node.js | 18+ | Obsidian plugin build |

---

## 7. Success Criteria

### 7.1 Performance

| Metric | Target |
|--------|--------|
| WASM cold start | <100ms |
| Per-document calculation | <1ms |
| CLI batch (1000 files) | <10s |
| Memory per document | <1MB |

### 7.2 Correctness

| Metric | Target |
|--------|--------|
| Formula parity | 100% match with J-Editorial spec |
| Test coverage | >90% for core library |
| Error handling | All errors include position info |

### 7.3 Usability

| Metric | Target |
|--------|--------|
| CLI help | All commands documented with examples |
| MCP tools | All tools have JSON Schema definitions |
| Error messages | Actionable with suggestions |

---

## 8. Open Questions

1. **Compact stub syntax deserializer**: Should we implement custom serde deserializer for `- link: "description"` syntax, or require explicit `type:` key?

2. **WASM bundle size**: Target size for WASM module? Current estimate ~500KB gzipped.

3. **MCP authentication**: Should MCP server support API key authentication for remote deployment?

4. **Cache invalidation**: How should Obsidian plugin cache WASM calculation results? File modification time? Content hash?

5. **L3 rule engine**: Should rule definitions be YAML-based or use a DSL?

---

## 9. Appendix

### 9.1 J-Editorial Formula Reference

See: [J-Editorial Framework Specification](https://jjjjguevara.vercel.app/j-editorial)

### 9.2 Related Documents

- [PRD-stubs-support.md](./PRD-stubs-support.md) - Original stubs system PRD
- [SPEC-yaml-parsing.md](./SPEC-yaml-parsing.md) - YAML parsing specification
- [SPEC-bidirectional-sync.md](./SPEC-bidirectional-sync.md) - Sync behavior specification

### 9.3 Glossary

| Term | Definition |
|------|------------|
| **L1** | Layer 1 - Intrinsic properties stored in frontmatter |
| **L2** | Layer 2 - Extrinsic dimensions calculated from L1 |
| **L3** | Layer 3 - Operational rules for automated workflows |
| **Stub** | A demand signal representing a gap in a document |
| **Refinement** | Quality score from 0.0 (draft) to 1.0 (polished) |
| **Health** | Combined score of refinement and stub burden |
| **Usefulness** | Whether document meets audience quality gate |
| **Vector Physics** | Energy/friction model for stub prioritization |
| **MCP** | Model Context Protocol - AI tool integration standard |
