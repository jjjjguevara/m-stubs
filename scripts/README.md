# Doc Doctor Scripts

Utility scripts for benchmarking and comparing LLM providers.

## Setup

Set environment variables with your API keys:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
export GEMINI_API_KEY="AIza..."
```

Install dependencies:

```bash
npm install
```

The scripts use `tsx` for TypeScript execution.

## Benchmark Runner

Run benchmarks across all configured providers on the test corpus:

```bash
# Full benchmark
npm run benchmark

# Dry run (see what would be executed)
npm run benchmark:dry

# With options
npx tsx scripts/benchmark-runner.ts --corpus ./tests --mode review --provider anthropic
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--corpus <dir>` | Test corpus directory | `./tests` |
| `--output <dir>` | Output directory | `./benchmark-results` |
| `--provider <name>` | Run only specific provider | All with API keys |
| `--mode <mode>` | Creativity mode | All modes |
| `--runs <n>` | Runs per document | `1` |
| `--parallel` | Run providers in parallel | `false` |
| `--dry-run` | Show plan without executing | `false` |

### Output

Results are saved to `./benchmark-results/`:
- `results-<timestamp>.json` - Raw results
- `report-<timestamp>.md` - Markdown report
- `results-latest.json` - Latest results
- `report-latest.md` - Latest report

## Provider Comparison

Compare provider outputs on a single document:

```bash
npm run compare -- tests/by-vector-family/retrieval-heavy.md

# With options
npx tsx scripts/compare-providers.ts tests/example.md --mode research --output comparison.json
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--mode <mode>` | Creativity mode | `review` |
| `--output <file>` | Save comparison to file | None |

### Output

The script outputs:
- Jaccard similarity between providers
- Unanimous suggestions (agreed by all)
- Quality metrics per provider
- Efficiency metrics (latency, tokens, cost)
- Winner determination with rationale

## Creativity Modes

| Mode | Temperature | Tool Policy | Use Case |
|------|-------------|-------------|----------|
| `research` | 0.2 | Mandatory | Factual accuracy, citations |
| `review` | 0.4 | Encouraged | Balanced analysis |
| `draft` | 0.6 | Optional | Creative expansion |
| `creative` | 0.8 | Disabled | Novel ideas |

## Results Analysis

Analyze benchmark results with comprehensive metrics:

```bash
# Analyze latest results
npm run analyze

# Analyze specific results file
npx tsx scripts/analyze-results.ts ./benchmark-results/results-2025-12-05.json
```

### Output

Generates detailed analysis including:
- Provider comparison (latency, cost, suggestions)
- Stub type distribution per provider
- Priority distribution
- Jaccard similarity (agreement analysis)
- Performance by creativity mode and document category
- Baseline metrics for production comparison

## Claude Code Opus Comparison

Compare API benchmark results with Claude Code (Opus) manual analysis:

```bash
npm run compare:opus
```

This generates a three-way comparison:
- Anthropic API vs Gemini API vs Claude Code Opus
- Per-document agreement metrics
- Stub type and priority alignment

## Model Costs

Costs are estimated per 1K tokens:

| Model | Input | Output |
|-------|-------|--------|
| claude-sonnet-4-20250514 | $0.003 | $0.015 |
| gemini-2.0-flash | $0.0001 | $0.0004 |
| gpt-4o | $0.005 | $0.015 |

## Test Corpus

The test corpus is organized by:

```
tests/
├── by-vector-family/     # Retrieval, Computation, etc.
├── by-task-family/       # Combinatorial, Synoptic, etc.
├── by-creativity-mode/   # Research, Review, etc.
└── edge-cases/           # Boundary conditions
```

See `tests/README.md` for document details.
