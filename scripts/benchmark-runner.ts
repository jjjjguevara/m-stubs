#!/usr/bin/env npx ts-node
/**
 * Benchmark Runner for Doc Doctor
 *
 * Runs LLM benchmarks across providers using the test corpus.
 *
 * Usage:
 *   npx ts-node scripts/benchmark-runner.ts [options]
 *
 * Options:
 *   --corpus <dir>      Test corpus directory (default: ./tests)
 *   --output <dir>      Output directory (default: ./benchmark-results)
 *   --provider <name>   Run only specific provider (anthropic|openai|gemini)
 *   --mode <mode>       Creativity mode (research|review|draft|creative)
 *   --runs <n>          Number of runs per document (default: 1)
 *   --parallel          Run providers in parallel
 *   --dry-run           Show what would be run without executing
 *
 * Environment Variables:
 *   ANTHROPIC_API_KEY   Anthropic API key
 *   OPENAI_API_KEY      OpenAI API key
 *   GEMINI_API_KEY      Google Gemini API key
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    InteractionRecorder,
    MetricsCollector,
    type TaskFamily,
    type TaskMetrics,
    type RecordedInteraction,
} from '../test/harness';
import {
    type BenchmarkConfig,
    type ProviderConfig,
    DEFAULT_BENCHMARK_CONFIG,
    DEFAULT_PROVIDERS,
    calculateCost,
    inferTaskFamily,
} from './benchmark-config';

// =============================================================================
// TYPES
// =============================================================================

interface ParsedDocument {
    path: string;
    title: string;
    content: string;
    frontmatter: Record<string, unknown>;
    refinement: number;
    origin?: string;
    form?: string;
    audience?: string;
    stubs: Array<{
        type: string;
        description: string;
        stub_form?: string;
        priority?: string;
    }>;
}

interface BenchmarkResult {
    documentPath: string;
    provider: string;
    model: string;
    creativityMode: string;
    runIndex: number;
    success: boolean;
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    suggestionCount: number;
    error?: string;
    response?: unknown;
}

interface BenchmarkSummary {
    totalDocuments: number;
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    totalLatencyMs: number;
    totalCost: number;
    byProvider: Record<string, {
        runs: number;
        successes: number;
        avgLatencyMs: number;
        totalCost: number;
        avgSuggestions: number;
    }>;
    byCreativityMode: Record<string, {
        runs: number;
        successes: number;
        avgLatencyMs: number;
    }>;
}

// =============================================================================
// DOCUMENT PARSING
// =============================================================================

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
    const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) {
        return { frontmatter: {}, body: content };
    }

    const [, yamlStr, body] = match;
    const frontmatter: Record<string, unknown> = {};

    // Simple YAML parsing (handles basic key: value and arrays)
    const lines = yamlStr.split('\n');
    let currentKey: string | null = null;
    let currentArray: unknown[] | null = null;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        // Check for array item
        if (trimmed.startsWith('- ')) {
            if (currentKey && currentArray !== null) {
                const value = trimmed.slice(2).trim();
                // Check if it's an object (has colon)
                if (value.includes(':')) {
                    const obj: Record<string, unknown> = {};
                    // Parse inline object or start of multi-line object
                    const parts = value.split(':');
                    if (parts.length >= 2) {
                        obj[parts[0].trim()] = parts.slice(1).join(':').trim().replace(/^["']|["']$/g, '');
                    }
                    currentArray.push(obj);
                } else {
                    currentArray.push(value.replace(/^["']|["']$/g, ''));
                }
            }
            continue;
        }

        // Check for continuation of object in array
        if (line.startsWith('    ') && currentArray !== null && currentArray.length > 0) {
            const colonIdx = trimmed.indexOf(':');
            if (colonIdx > 0) {
                const key = trimmed.slice(0, colonIdx).trim();
                const value = trimmed.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
                const lastItem = currentArray[currentArray.length - 1];
                if (typeof lastItem === 'object' && lastItem !== null) {
                    (lastItem as Record<string, unknown>)[key] = value;
                }
            }
            continue;
        }

        // Regular key: value
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx > 0) {
            // Save previous array if any
            if (currentKey && currentArray !== null) {
                frontmatter[currentKey] = currentArray;
            }

            currentKey = trimmed.slice(0, colonIdx).trim();
            const value = trimmed.slice(colonIdx + 1).trim();

            if (value === '' || value === '[]') {
                // Start of array or empty value
                currentArray = [];
            } else {
                currentArray = null;
                // Parse value
                if (value === 'true') frontmatter[currentKey] = true;
                else if (value === 'false') frontmatter[currentKey] = false;
                else if (/^-?\d+(\.\d+)?$/.test(value)) frontmatter[currentKey] = parseFloat(value);
                else frontmatter[currentKey] = value.replace(/^["']|["']$/g, '');
            }
        }
    }

    // Save final array if any
    if (currentKey && currentArray !== null) {
        frontmatter[currentKey] = currentArray;
    }

    return { frontmatter, body };
}

/**
 * Parse a markdown document
 */
function parseDocument(filePath: string): ParsedDocument {
    const content = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);

    const stubs = (frontmatter.stubs as Array<Record<string, unknown>> || []).map(s => ({
        type: String(s.type || 'unknown'),
        description: String(s.description || ''),
        stub_form: s.stub_form ? String(s.stub_form) : undefined,
        priority: s.priority ? String(s.priority) : undefined,
    }));

    return {
        path: filePath,
        title: String(frontmatter.title || path.basename(filePath, '.md')),
        content,
        frontmatter,
        refinement: typeof frontmatter.refinement === 'number' ? frontmatter.refinement : 0.5,
        origin: frontmatter.origin ? String(frontmatter.origin) : undefined,
        form: frontmatter.form ? String(frontmatter.form) : undefined,
        audience: frontmatter.audience ? String(frontmatter.audience) : undefined,
        stubs,
    };
}

/**
 * Find all markdown files in a directory
 */
function findDocuments(dir: string, patterns: string[] = ['**/*.md']): string[] {
    const results: string[] = [];

    function walk(currentDir: string): void {
        if (!fs.existsSync(currentDir)) return;

        const entries = fs.readdirSync(currentDir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);

            if (entry.isDirectory()) {
                walk(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
                results.push(fullPath);
            }
        }
    }

    walk(dir);
    return results;
}

// =============================================================================
// LLM API CALLS
// =============================================================================

/**
 * Build the system prompt for document analysis
 */
function buildSystemPrompt(creativityMode: string): string {
    const modeInstructions: Record<string, string> = {
        research: 'Focus on factual accuracy and verifiable information. Use conservative estimates and cite sources where possible.',
        review: 'Balance thoroughness with practicality. Identify both issues and opportunities for improvement.',
        draft: 'Be creative and suggest expansions. Focus on developing ideas and filling gaps.',
        creative: 'Think expansively. Suggest novel approaches, alternative perspectives, and creative improvements.',
    };

    return `You are a document analysis assistant. Your task is to analyze documents and suggest improvements in the form of "stubs" - placeholders for work that needs to be done.

${modeInstructions[creativityMode] || modeInstructions.review}

Analyze the document and return a JSON response with the following structure:
{
  "suggested_stubs": [
    {
      "type": "<stub_type>",
      "description": "<what needs to be done>",
      "stub_form": "<blocking|persistent|transient>",
      "location": { "lineNumber": <line> },
      "priority": "<critical|high|medium|low>",
      "rationale": "<why this stub is needed>"
    }
  ],
  "confidence": <0.0-1.0>,
  "analysis": "<brief analysis of the document>"
}

Available stub types:
- source: Find citation or reference
- check: Verify a claim or fact
- link: Find related document
- data: Find or verify data/statistics
- fix: Correct an error or issue
- cut: Remove unnecessary content
- draft: Write new content
- expand: Expand existing content
- idea: Capture an idea for later
- question: Note a question to answer
- move: Relocate content
- restructure: Reorganize structure`;
}

/**
 * Build the user prompt for a document
 */
function buildUserPrompt(doc: ParsedDocument): string {
    const existingStubs = doc.stubs.length > 0
        ? `\n\nExisting stubs:\n${doc.stubs.map(s => `- [${s.type}] ${s.description}`).join('\n')}`
        : '';

    return `Analyze this document:

Title: ${doc.title}
Refinement: ${doc.refinement}
${doc.audience ? `Audience: ${doc.audience}` : ''}
${doc.origin ? `Origin: ${doc.origin}` : ''}
${doc.form ? `Form: ${doc.form}` : ''}
${existingStubs}

---

${doc.content}`;
}

/**
 * Call Anthropic API
 */
async function callAnthropic(
    provider: ProviderConfig,
    systemPrompt: string,
    userPrompt: string,
    temperature: number,
): Promise<{ response: unknown; inputTokens: number; outputTokens: number }> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': provider.apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: provider.model,
            max_tokens: provider.maxTokens,
            temperature,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
        content: Array<{ type: string; text: string }>;
        usage: { input_tokens: number; output_tokens: number };
    };

    const text = data.content[0]?.text || '';
    let parsed: unknown;

    try {
        // Extract JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
        } else {
            parsed = { raw: text };
        }
    } catch {
        parsed = { raw: text };
    }

    return {
        response: parsed,
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
    };
}

/**
 * Call OpenAI API
 */
async function callOpenAI(
    provider: ProviderConfig,
    systemPrompt: string,
    userPrompt: string,
    temperature: number,
): Promise<{ response: unknown; inputTokens: number; outputTokens: number }> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
            model: provider.model,
            max_tokens: provider.maxTokens,
            temperature,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            response_format: { type: 'json_object' },
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
        usage: { prompt_tokens: number; completion_tokens: number };
    };

    const text = data.choices[0]?.message?.content || '';
    let parsed: unknown;

    try {
        parsed = JSON.parse(text);
    } catch {
        parsed = { raw: text };
    }

    return {
        response: parsed,
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
    };
}

/**
 * Call Gemini API
 */
async function callGemini(
    provider: ProviderConfig,
    systemPrompt: string,
    userPrompt: string,
    temperature: number,
): Promise<{ response: unknown; inputTokens: number; outputTokens: number }> {
    const url = `https://generativelanguage.googleapis.com/v1/models/${provider.model}:generateContent?key=${provider.apiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contents: [
                {
                    parts: [
                        { text: `${systemPrompt}\n\n${userPrompt}` },
                    ],
                },
            ],
            generationConfig: {
                temperature,
                maxOutputTokens: provider.maxTokens,
            },
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
        candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
        usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
    };

    const text = data.candidates[0]?.content?.parts[0]?.text || '';
    let parsed: unknown;

    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
        } else {
            parsed = { raw: text };
        }
    } catch {
        parsed = { raw: text };
    }

    return {
        response: parsed,
        inputTokens: data.usageMetadata?.promptTokenCount || 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
    };
}

/**
 * Call LLM provider
 */
async function callProvider(
    provider: ProviderConfig,
    systemPrompt: string,
    userPrompt: string,
    temperature: number,
): Promise<{ response: unknown; inputTokens: number; outputTokens: number }> {
    switch (provider.name) {
        case 'anthropic':
            return callAnthropic(provider, systemPrompt, userPrompt, temperature);
        case 'openai':
            return callOpenAI(provider, systemPrompt, userPrompt, temperature);
        case 'gemini':
            return callGemini(provider, systemPrompt, userPrompt, temperature);
        default:
            throw new Error(`Unknown provider: ${provider.name}`);
    }
}

// =============================================================================
// BENCHMARK EXECUTION
// =============================================================================

/**
 * Get temperature for creativity mode
 */
function getTemperature(creativityMode: string): number {
    const temps: Record<string, number> = {
        research: 0.2,
        review: 0.4,
        draft: 0.6,
        creative: 0.8,
    };
    return temps[creativityMode] || 0.4;
}

/**
 * Run a single benchmark
 */
async function runBenchmark(
    doc: ParsedDocument,
    provider: ProviderConfig,
    creativityMode: string,
    runIndex: number,
): Promise<BenchmarkResult> {
    const systemPrompt = buildSystemPrompt(creativityMode);
    const userPrompt = buildUserPrompt(doc);
    const temperature = getTemperature(creativityMode);

    const startTime = Date.now();

    try {
        const result = await callProvider(provider, systemPrompt, userPrompt, temperature);
        const latencyMs = Date.now() - startTime;

        const suggestionCount = Array.isArray((result.response as Record<string, unknown>)?.suggested_stubs)
            ? ((result.response as Record<string, unknown>).suggested_stubs as unknown[]).length
            : 0;

        return {
            documentPath: doc.path,
            provider: provider.name,
            model: provider.model,
            creativityMode,
            runIndex,
            success: true,
            latencyMs,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            cost: calculateCost(provider.model, result.inputTokens, result.outputTokens),
            suggestionCount,
            response: result.response,
        };
    } catch (error) {
        return {
            documentPath: doc.path,
            provider: provider.name,
            model: provider.model,
            creativityMode,
            runIndex,
            success: false,
            latencyMs: Date.now() - startTime,
            inputTokens: 0,
            outputTokens: 0,
            cost: 0,
            suggestionCount: 0,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Run all benchmarks
 */
async function runBenchmarks(config: BenchmarkConfig): Promise<{
    results: BenchmarkResult[];
    summary: BenchmarkSummary;
}> {
    const documents = findDocuments(config.corpusDir);
    console.log(`Found ${documents.length} documents in ${config.corpusDir}`);

    const results: BenchmarkResult[] = [];
    let totalRuns = 0;

    for (const docPath of documents) {
        const doc = parseDocument(docPath);
        console.log(`\n📄 Processing: ${path.relative(config.corpusDir, docPath)}`);

        for (const provider of config.providers) {
            if (!provider.apiKey) {
                console.log(`  ⏭️  Skipping ${provider.name} (no API key)`);
                continue;
            }

            for (const mode of config.creativityModes) {
                for (let run = 0; run < config.runsPerDocument; run++) {
                    totalRuns++;
                    const runLabel = config.runsPerDocument > 1 ? ` (run ${run + 1}/${config.runsPerDocument})` : '';
                    console.log(`  🔄 ${provider.name}/${mode}${runLabel}...`);

                    const result = await runBenchmark(doc, provider, mode, run);
                    results.push(result);

                    if (result.success) {
                        console.log(`     ✅ ${result.latencyMs}ms, ${result.suggestionCount} suggestions, $${result.cost.toFixed(4)}`);
                    } else {
                        console.log(`     ❌ ${result.error}`);
                    }

                    // Rate limiting
                    if (config.requestDelayMs > 0) {
                        await sleep(config.requestDelayMs);
                    }
                }
            }
        }
    }

    // Calculate summary
    const summary = calculateSummary(results);

    return { results, summary };
}

/**
 * Calculate benchmark summary
 */
function calculateSummary(results: BenchmarkResult[]): BenchmarkSummary {
    const byProvider: Record<string, {
        runs: number;
        successes: number;
        totalLatency: number;
        totalCost: number;
        totalSuggestions: number;
    }> = {};

    const byMode: Record<string, {
        runs: number;
        successes: number;
        totalLatency: number;
    }> = {};

    let totalLatencyMs = 0;
    let totalCost = 0;
    let successfulRuns = 0;

    for (const result of results) {
        // By provider
        if (!byProvider[result.provider]) {
            byProvider[result.provider] = {
                runs: 0,
                successes: 0,
                totalLatency: 0,
                totalCost: 0,
                totalSuggestions: 0,
            };
        }
        byProvider[result.provider].runs++;
        if (result.success) {
            byProvider[result.provider].successes++;
            byProvider[result.provider].totalLatency += result.latencyMs;
            byProvider[result.provider].totalSuggestions += result.suggestionCount;
        }
        byProvider[result.provider].totalCost += result.cost;

        // By mode
        if (!byMode[result.creativityMode]) {
            byMode[result.creativityMode] = {
                runs: 0,
                successes: 0,
                totalLatency: 0,
            };
        }
        byMode[result.creativityMode].runs++;
        if (result.success) {
            byMode[result.creativityMode].successes++;
            byMode[result.creativityMode].totalLatency += result.latencyMs;
        }

        // Totals
        if (result.success) {
            successfulRuns++;
            totalLatencyMs += result.latencyMs;
        }
        totalCost += result.cost;
    }

    const uniqueDocs = new Set(results.map(r => r.documentPath)).size;

    return {
        totalDocuments: uniqueDocs,
        totalRuns: results.length,
        successfulRuns,
        failedRuns: results.length - successfulRuns,
        totalLatencyMs,
        totalCost,
        byProvider: Object.fromEntries(
            Object.entries(byProvider).map(([name, data]) => [
                name,
                {
                    runs: data.runs,
                    successes: data.successes,
                    avgLatencyMs: data.successes > 0 ? data.totalLatency / data.successes : 0,
                    totalCost: data.totalCost,
                    avgSuggestions: data.successes > 0 ? data.totalSuggestions / data.successes : 0,
                },
            ]),
        ),
        byCreativityMode: Object.fromEntries(
            Object.entries(byMode).map(([mode, data]) => [
                mode,
                {
                    runs: data.runs,
                    successes: data.successes,
                    avgLatencyMs: data.successes > 0 ? data.totalLatency / data.successes : 0,
                },
            ]),
        ),
    };
}

// =============================================================================
// REPORTING
// =============================================================================

/**
 * Generate markdown report
 */
function generateReport(
    results: BenchmarkResult[],
    summary: BenchmarkSummary,
): string {
    const lines: string[] = [
        '# Doc Doctor Benchmark Report',
        '',
        `Generated: ${new Date().toISOString()}`,
        '',
        '## Summary',
        '',
        `- **Documents**: ${summary.totalDocuments}`,
        `- **Total Runs**: ${summary.totalRuns}`,
        `- **Successful**: ${summary.successfulRuns} (${((summary.successfulRuns / summary.totalRuns) * 100).toFixed(1)}%)`,
        `- **Failed**: ${summary.failedRuns}`,
        `- **Total Cost**: $${summary.totalCost.toFixed(4)}`,
        '',
        '## By Provider',
        '',
        '| Provider | Runs | Success Rate | Avg Latency | Avg Suggestions | Total Cost |',
        '|----------|------|--------------|-------------|-----------------|------------|',
    ];

    for (const [provider, data] of Object.entries(summary.byProvider)) {
        const successRate = data.runs > 0 ? ((data.successes / data.runs) * 100).toFixed(1) : '0';
        lines.push(
            `| ${provider} | ${data.runs} | ${successRate}% | ${data.avgLatencyMs.toFixed(0)}ms | ${data.avgSuggestions.toFixed(1)} | $${data.totalCost.toFixed(4)} |`,
        );
    }

    lines.push('', '## By Creativity Mode', '');
    lines.push('| Mode | Runs | Success Rate | Avg Latency |');
    lines.push('|------|------|--------------|-------------|');

    for (const [mode, data] of Object.entries(summary.byCreativityMode)) {
        const successRate = data.runs > 0 ? ((data.successes / data.runs) * 100).toFixed(1) : '0';
        lines.push(`| ${mode} | ${data.runs} | ${successRate}% | ${data.avgLatencyMs.toFixed(0)}ms |`);
    }

    lines.push('', '## Failed Runs', '');

    const failures = results.filter(r => !r.success);
    if (failures.length === 0) {
        lines.push('No failures! 🎉');
    } else {
        for (const failure of failures) {
            lines.push(`- **${path.basename(failure.documentPath)}** (${failure.provider}/${failure.creativityMode}): ${failure.error}`);
        }
    }

    return lines.join('\n');
}

/**
 * Save results to disk
 */
function saveResults(
    outputDir: string,
    results: BenchmarkResult[],
    summary: BenchmarkSummary,
): void {
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Save raw results
    fs.writeFileSync(
        path.join(outputDir, `results-${timestamp}.json`),
        JSON.stringify({ results, summary }, null, 2),
    );

    // Save report
    const report = generateReport(results, summary);
    fs.writeFileSync(
        path.join(outputDir, `report-${timestamp}.md`),
        report,
    );

    // Save latest symlinks
    fs.writeFileSync(path.join(outputDir, 'results-latest.json'), JSON.stringify({ results, summary }, null, 2));
    fs.writeFileSync(path.join(outputDir, 'report-latest.md'), report);

    console.log(`\n📁 Results saved to ${outputDir}/`);
}

// =============================================================================
// CLI
// =============================================================================

/**
 * Parse command line arguments
 */
function parseArgs(): Partial<BenchmarkConfig> & { dryRun?: boolean } {
    const args = process.argv.slice(2);
    const config: Partial<BenchmarkConfig> & { dryRun?: boolean } = {};

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        switch (arg) {
            case '--corpus':
                config.corpusDir = args[++i];
                break;
            case '--output':
                config.outputDir = args[++i];
                break;
            case '--provider':
                const providerName = args[++i] as 'anthropic' | 'openai' | 'gemini';
                config.providers = DEFAULT_PROVIDERS.filter(p => p.name === providerName);
                break;
            case '--mode':
                config.creativityModes = [args[++i]];
                break;
            case '--runs':
                config.runsPerDocument = parseInt(args[++i], 10);
                break;
            case '--parallel':
                config.parallel = true;
                break;
            case '--dry-run':
                config.dryRun = true;
                break;
            case '--help':
                console.log(`
Doc Doctor Benchmark Runner

Usage: npx ts-node scripts/benchmark-runner.ts [options]

Options:
  --corpus <dir>      Test corpus directory (default: ./tests)
  --output <dir>      Output directory (default: ./benchmark-results)
  --provider <name>   Run only specific provider (anthropic|openai|gemini)
  --mode <mode>       Creativity mode (research|review|draft|creative)
  --runs <n>          Number of runs per document (default: 1)
  --parallel          Run providers in parallel
  --dry-run           Show what would be run without executing
  --help              Show this help message

Environment Variables:
  ANTHROPIC_API_KEY   Anthropic API key
  OPENAI_API_KEY      OpenAI API key
  GEMINI_API_KEY      Google Gemini API key
`);
                process.exit(0);
        }
    }

    return config;
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
    console.log('🏃 Doc Doctor Benchmark Runner\n');

    const cliConfig = parseArgs();

    // Handle dry run before API key validation
    if (cliConfig.dryRun) {
        const corpusDir = cliConfig.corpusDir || DEFAULT_BENCHMARK_CONFIG.corpusDir;
        const modes = cliConfig.creativityModes || DEFAULT_BENCHMARK_CONFIG.creativityModes;
        const runsPerDoc = cliConfig.runsPerDocument || DEFAULT_BENCHMARK_CONFIG.runsPerDocument;
        const providers = (cliConfig.providers || DEFAULT_PROVIDERS).filter(p => p.apiKey);
        const allProviders = cliConfig.providers || DEFAULT_PROVIDERS;

        console.log('Configuration:');
        console.log(`  Corpus: ${corpusDir}`);
        console.log(`  Output: ${cliConfig.outputDir || DEFAULT_BENCHMARK_CONFIG.outputDir}`);
        console.log(`  Providers with API keys: ${providers.length > 0 ? providers.map(p => p.name).join(', ') : '(none)'}`);
        console.log(`  All providers: ${allProviders.map(p => p.name).join(', ')}`);
        console.log(`  Modes: ${modes.join(', ')}`);
        console.log(`  Runs per document: ${runsPerDoc}`);

        const documents = findDocuments(corpusDir);
        const totalRuns = documents.length * (providers.length || allProviders.length) * modes.length * runsPerDoc;
        console.log(`\n🔍 Dry run: would execute ${totalRuns} benchmark runs across ${documents.length} documents`);

        if (documents.length > 0) {
            console.log('\nDocuments found:');
            for (const doc of documents.slice(0, 10)) {
                console.log(`  - ${path.relative(corpusDir, doc)}`);
            }
            if (documents.length > 10) {
                console.log(`  ... and ${documents.length - 10} more`);
            }
        }

        if (providers.length === 0) {
            console.log('\n⚠️  No API keys configured. Set environment variables to run actual benchmarks:');
            console.log('   ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY');
        }

        process.exit(0);
    }

    const config: BenchmarkConfig = {
        ...DEFAULT_BENCHMARK_CONFIG,
        ...cliConfig,
        providers: (cliConfig.providers || DEFAULT_PROVIDERS).filter(p => p.apiKey),
    };

    // Validate configuration
    if (config.providers.length === 0) {
        console.error('❌ No API keys configured. Set environment variables:');
        console.error('   ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY');
        process.exit(1);
    }

    console.log('Configuration:');
    console.log(`  Corpus: ${config.corpusDir}`);
    console.log(`  Output: ${config.outputDir}`);
    console.log(`  Providers: ${config.providers.map(p => p.name).join(', ')}`);
    console.log(`  Modes: ${config.creativityModes.join(', ')}`);
    console.log(`  Runs per document: ${config.runsPerDocument}`);

    console.log('\n🚀 Starting benchmarks...\n');

    const { results, summary } = await runBenchmarks(config);

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('BENCHMARK SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total runs: ${summary.totalRuns}`);
    console.log(`Successful: ${summary.successfulRuns} (${((summary.successfulRuns / summary.totalRuns) * 100).toFixed(1)}%)`);
    console.log(`Total cost: $${summary.totalCost.toFixed(4)}`);

    for (const [provider, data] of Object.entries(summary.byProvider)) {
        console.log(`\n${provider}:`);
        console.log(`  Success rate: ${((data.successes / data.runs) * 100).toFixed(1)}%`);
        console.log(`  Avg latency: ${data.avgLatencyMs.toFixed(0)}ms`);
        console.log(`  Avg suggestions: ${data.avgSuggestions.toFixed(1)}`);
        console.log(`  Total cost: $${data.totalCost.toFixed(4)}`);
    }

    // Save results
    saveResults(config.outputDir, results, summary);

    console.log('\n✅ Benchmark complete!');
}

// Run if executed directly
main().catch(error => {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
});
