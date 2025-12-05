#!/usr/bin/env npx tsx
/**
 * Benchmark Results Analyzer
 *
 * Comprehensive analysis of benchmark results to establish baseline metrics.
 * Generates insights for orchestration routing decisions.
 *
 * Usage:
 *   npx tsx scripts/analyze-results.ts [results-file]
 *   npx tsx scripts/analyze-results.ts --latest
 */

import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// TYPES
// =============================================================================

interface Suggestion {
    type: string;
    description: string;
    stub_form?: string;
    location?: { lineNumber?: number };
    priority?: string;
    rationale?: string;
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
    response?: {
        suggested_stubs?: Suggestion[];
        confidence?: number;
        analysis?: string;
    };
    error?: string;
}

interface BenchmarkData {
    results: BenchmarkResult[];
    timestamp?: string;
}

interface ProviderStats {
    runs: number;
    successes: number;
    totalLatency: number;
    totalCost: number;
    totalSuggestions: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    stubTypes: Record<string, number>;
    priorities: Record<string, number>;
    stubForms: Record<string, number>;
    suggestionsByMode: Record<string, number>;
    latencyByMode: Record<string, number[]>;
}

interface DocumentComparison {
    documentPath: string;
    creativityMode: string;
    providers: string[];
    suggestionCounts: Record<string, number>;
    jaccardSimilarity: number;
    typeOverlap: string[];
    uniqueTypes: Record<string, string[]>;
}

// =============================================================================
// ANALYSIS FUNCTIONS
// =============================================================================

function inferTaskFamily(docPath: string): string {
    if (docPath.includes('by-vector-family')) return 'vector-family';
    if (docPath.includes('by-task-family')) return 'task-family';
    if (docPath.includes('by-creativity-mode')) return 'creativity-mode';
    if (docPath.includes('edge-cases')) return 'edge-cases';
    return 'other';
}

function inferDocumentCategory(docPath: string): string {
    const filename = path.basename(docPath, '.md');
    if (filename.includes('retrieval')) return 'retrieval';
    if (filename.includes('computation')) return 'computation';
    if (filename.includes('synthesis')) return 'synthesis';
    if (filename.includes('creation')) return 'creation';
    if (filename.includes('combinatorial')) return 'combinatorial';
    if (filename.includes('synoptic')) return 'synoptic';
    if (filename.includes('generative')) return 'generative';
    if (filename.includes('operational')) return 'operational';
    if (filename.includes('learning')) return 'learning';
    if (filename.includes('research')) return 'research';
    if (filename.includes('review')) return 'review';
    if (filename.includes('draft')) return 'draft';
    if (filename.includes('creative')) return 'creative';
    return 'general';
}

function calculateJaccard(set1: Set<string>, set2: Set<string>): number {
    if (set1.size === 0 && set2.size === 0) return 1;
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return intersection.size / union.size;
}

function analyzeProviders(results: BenchmarkResult[]): Map<string, ProviderStats> {
    const stats = new Map<string, ProviderStats>();

    for (const result of results) {
        if (!stats.has(result.provider)) {
            stats.set(result.provider, {
                runs: 0,
                successes: 0,
                totalLatency: 0,
                totalCost: 0,
                totalSuggestions: 0,
                totalInputTokens: 0,
                totalOutputTokens: 0,
                stubTypes: {},
                priorities: {},
                stubForms: {},
                suggestionsByMode: {},
                latencyByMode: {},
            });
        }

        const s = stats.get(result.provider)!;
        s.runs++;
        if (result.success) s.successes++;
        s.totalLatency += result.latencyMs;
        s.totalCost += result.cost;
        s.totalSuggestions += result.suggestionCount;
        s.totalInputTokens += result.inputTokens;
        s.totalOutputTokens += result.outputTokens;

        // Track by mode
        s.suggestionsByMode[result.creativityMode] =
            (s.suggestionsByMode[result.creativityMode] || 0) + result.suggestionCount;
        if (!s.latencyByMode[result.creativityMode]) {
            s.latencyByMode[result.creativityMode] = [];
        }
        s.latencyByMode[result.creativityMode].push(result.latencyMs);

        // Analyze suggestions
        const suggestions = result.response?.suggested_stubs || [];
        for (const stub of suggestions) {
            s.stubTypes[stub.type] = (s.stubTypes[stub.type] || 0) + 1;
            if (stub.priority) {
                s.priorities[stub.priority] = (s.priorities[stub.priority] || 0) + 1;
            }
            if (stub.stub_form) {
                s.stubForms[stub.stub_form] = (s.stubForms[stub.stub_form] || 0) + 1;
            }
        }
    }

    return stats;
}

function compareProviders(results: BenchmarkResult[]): DocumentComparison[] {
    // Group by document + mode
    const groups = new Map<string, BenchmarkResult[]>();
    for (const result of results) {
        const key = `${result.documentPath}|${result.creativityMode}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(result);
    }

    const comparisons: DocumentComparison[] = [];

    for (const [key, groupResults] of groups) {
        if (groupResults.length < 2) continue;

        const [docPath, mode] = key.split('|');
        const providers = groupResults.map(r => r.provider);
        const suggestionCounts: Record<string, number> = {};
        const typesByProvider: Record<string, Set<string>> = {};

        for (const result of groupResults) {
            suggestionCounts[result.provider] = result.suggestionCount;
            typesByProvider[result.provider] = new Set(
                (result.response?.suggested_stubs || []).map(s => s.type)
            );
        }

        // Calculate Jaccard between all pairs
        let totalJaccard = 0;
        let pairCount = 0;
        const providerList = Object.keys(typesByProvider);
        for (let i = 0; i < providerList.length; i++) {
            for (let j = i + 1; j < providerList.length; j++) {
                totalJaccard += calculateJaccard(
                    typesByProvider[providerList[i]],
                    typesByProvider[providerList[j]]
                );
                pairCount++;
            }
        }

        // Find overlapping types
        const allTypes = new Set<string>();
        for (const types of Object.values(typesByProvider)) {
            for (const t of types) allTypes.add(t);
        }
        const typeOverlap = [...allTypes].filter(t =>
            Object.values(typesByProvider).every(types => types.has(t))
        );

        // Find unique types per provider
        const uniqueTypes: Record<string, string[]> = {};
        for (const [provider, types] of Object.entries(typesByProvider)) {
            uniqueTypes[provider] = [...types].filter(t => {
                const otherProviders = Object.entries(typesByProvider)
                    .filter(([p]) => p !== provider);
                return otherProviders.every(([, otherTypes]) => !otherTypes.has(t));
            });
        }

        comparisons.push({
            documentPath: docPath,
            creativityMode: mode,
            providers,
            suggestionCounts,
            jaccardSimilarity: pairCount > 0 ? totalJaccard / pairCount : 0,
            typeOverlap,
            uniqueTypes,
        });
    }

    return comparisons;
}

function analyzeByCategory(results: BenchmarkResult[]): Map<string, Map<string, ProviderStats>> {
    const byCategory = new Map<string, BenchmarkResult[]>();

    for (const result of results) {
        const category = inferDocumentCategory(result.documentPath);
        if (!byCategory.has(category)) byCategory.set(category, []);
        byCategory.get(category)!.push(result);
    }

    const analysis = new Map<string, Map<string, ProviderStats>>();
    for (const [category, categoryResults] of byCategory) {
        analysis.set(category, analyzeProviders(categoryResults));
    }

    return analysis;
}

// =============================================================================
// REPORT GENERATION
// =============================================================================

function generateReport(data: BenchmarkData): string {
    const { results } = data;
    const providers = [...new Set(results.map(r => r.provider))];
    const providerStats = analyzeProviders(results);
    const comparisons = compareProviders(results);
    const categoryAnalysis = analyzeByCategory(results);

    let report = `# Benchmark Analysis Report

Generated: ${new Date().toISOString()}
Results file: ${results.length} runs across ${providers.length} providers

---

## Executive Summary

`;

    // Provider overview
    report += `### Provider Comparison\n\n`;
    report += `| Metric | ${providers.join(' | ')} |\n`;
    report += `|--------|${providers.map(() => '------').join('|')}|\n`;

    const metrics = [
        ['Success Rate', (s: ProviderStats) => `${((s.successes / s.runs) * 100).toFixed(1)}%`],
        ['Avg Latency', (s: ProviderStats) => `${(s.totalLatency / s.runs / 1000).toFixed(1)}s`],
        ['Avg Suggestions', (s: ProviderStats) => `${(s.totalSuggestions / s.runs).toFixed(1)}`],
        ['Cost/Suggestion', (s: ProviderStats) => `$${(s.totalCost / s.totalSuggestions).toFixed(4)}`],
        ['Total Cost', (s: ProviderStats) => `$${s.totalCost.toFixed(4)}`],
        ['Tokens/Run', (s: ProviderStats) => `${Math.round((s.totalInputTokens + s.totalOutputTokens) / s.runs)}`],
    ] as const;

    for (const [name, fn] of metrics) {
        report += `| ${name} | ${providers.map(p => fn(providerStats.get(p)!)).join(' | ')} |\n`;
    }

    // Agreement analysis
    report += `\n### Provider Agreement\n\n`;
    const avgJaccard = comparisons.reduce((sum, c) => sum + c.jaccardSimilarity, 0) / comparisons.length;
    report += `- **Average Jaccard Similarity**: ${(avgJaccard * 100).toFixed(1)}%\n`;
    report += `- **Documents with >50% agreement**: ${comparisons.filter(c => c.jaccardSimilarity > 0.5).length}/${comparisons.length}\n`;
    report += `- **Documents with 0% agreement**: ${comparisons.filter(c => c.jaccardSimilarity === 0).length}/${comparisons.length}\n`;

    // Stub type distribution
    report += `\n---\n\n## Stub Type Distribution\n\n`;
    const allTypes = new Set<string>();
    for (const stats of providerStats.values()) {
        for (const type of Object.keys(stats.stubTypes)) allTypes.add(type);
    }

    report += `| Stub Type | ${providers.join(' | ')} |\n`;
    report += `|-----------|${providers.map(() => '------').join('|')}|\n`;
    for (const type of [...allTypes].sort()) {
        const counts = providers.map(p => {
            const stats = providerStats.get(p)!;
            const count = stats.stubTypes[type] || 0;
            const pct = ((count / stats.totalSuggestions) * 100).toFixed(0);
            return `${count} (${pct}%)`;
        });
        report += `| ${type} | ${counts.join(' | ')} |\n`;
    }

    // Priority distribution
    report += `\n---\n\n## Priority Distribution\n\n`;
    const allPriorities = ['critical', 'high', 'medium', 'low'];
    report += `| Priority | ${providers.join(' | ')} |\n`;
    report += `|----------|${providers.map(() => '------').join('|')}|\n`;
    for (const priority of allPriorities) {
        const counts = providers.map(p => {
            const stats = providerStats.get(p)!;
            const count = stats.priorities[priority] || 0;
            const total = Object.values(stats.priorities).reduce((a, b) => a + b, 0);
            const pct = total > 0 ? ((count / total) * 100).toFixed(0) : '0';
            return `${count} (${pct}%)`;
        });
        report += `| ${priority} | ${counts.join(' | ')} |\n`;
    }

    // By creativity mode
    report += `\n---\n\n## Performance by Creativity Mode\n\n`;
    const modes = ['research', 'review', 'draft', 'creative'];
    for (const mode of modes) {
        report += `### ${mode.charAt(0).toUpperCase() + mode.slice(1)} Mode\n\n`;
        report += `| Provider | Suggestions | Avg Latency |\n`;
        report += `|----------|-------------|-------------|\n`;
        for (const provider of providers) {
            const stats = providerStats.get(provider)!;
            const suggestions = stats.suggestionsByMode[mode] || 0;
            const latencies = stats.latencyByMode[mode] || [];
            const avgLatency = latencies.length > 0
                ? (latencies.reduce((a, b) => a + b, 0) / latencies.length / 1000).toFixed(1)
                : 'N/A';
            report += `| ${provider} | ${suggestions} | ${avgLatency}s |\n`;
        }
        report += '\n';
    }

    // By document category
    report += `---\n\n## Performance by Document Category\n\n`;
    for (const [category, catStats] of categoryAnalysis) {
        if (category === 'general') continue;
        report += `### ${category}\n\n`;
        report += `| Provider | Runs | Suggestions | Avg Latency |\n`;
        report += `|----------|------|-------------|-------------|\n`;
        for (const provider of providers) {
            const stats = catStats.get(provider);
            if (!stats) continue;
            report += `| ${provider} | ${stats.runs} | ${stats.totalSuggestions} (${(stats.totalSuggestions / stats.runs).toFixed(1)}/run) | ${(stats.totalLatency / stats.runs / 1000).toFixed(1)}s |\n`;
        }
        report += '\n';
    }

    // High-agreement documents
    report += `---\n\n## High Agreement Documents (Jaccard > 60%)\n\n`;
    const highAgreement = comparisons
        .filter(c => c.jaccardSimilarity > 0.6)
        .sort((a, b) => b.jaccardSimilarity - a.jaccardSimilarity)
        .slice(0, 10);

    if (highAgreement.length > 0) {
        report += `| Document | Mode | Similarity | Agreed Types |\n`;
        report += `|----------|------|------------|---------------|\n`;
        for (const comp of highAgreement) {
            const docName = path.basename(comp.documentPath);
            report += `| ${docName} | ${comp.creativityMode} | ${(comp.jaccardSimilarity * 100).toFixed(0)}% | ${comp.typeOverlap.join(', ') || 'none'} |\n`;
        }
    } else {
        report += `No documents with >60% agreement found.\n`;
    }

    // Low-agreement documents
    report += `\n---\n\n## Low Agreement Documents (Jaccard < 20%)\n\n`;
    const lowAgreement = comparisons
        .filter(c => c.jaccardSimilarity < 0.2)
        .sort((a, b) => a.jaccardSimilarity - b.jaccardSimilarity)
        .slice(0, 10);

    if (lowAgreement.length > 0) {
        report += `| Document | Mode | Similarity | Provider Unique Types |\n`;
        report += `|----------|------|------------|----------------------|\n`;
        for (const comp of lowAgreement) {
            const docName = path.basename(comp.documentPath);
            const uniqueStr = Object.entries(comp.uniqueTypes)
                .map(([p, types]) => `${p}: ${types.join(',')}`)
                .join('; ');
            report += `| ${docName} | ${comp.creativityMode} | ${(comp.jaccardSimilarity * 100).toFixed(0)}% | ${uniqueStr || 'none'} |\n`;
        }
    } else {
        report += `No documents with <20% agreement found.\n`;
    }

    // Baseline metrics placeholder
    report += `\n---\n\n## Baseline Metrics (For Future Comparison)\n\n`;
    report += `These metrics establish the current baseline. Production metrics will be compared against these.\n\n`;
    report += `### Quality Baseline\n\n`;
    report += `| Metric | ${providers.join(' | ')} |\n`;
    report += `|--------|${providers.map(() => '------').join('|')}|\n`;
    report += `| Suggestions/Document | ${providers.map(p => (providerStats.get(p)!.totalSuggestions / providerStats.get(p)!.runs).toFixed(1)).join(' | ')} |\n`;
    report += `| Unique Stub Types | ${providers.map(p => Object.keys(providerStats.get(p)!.stubTypes).length).join(' | ')} |\n`;
    report += `| High Priority % | ${providers.map(p => {
        const stats = providerStats.get(p)!;
        const high = (stats.priorities['critical'] || 0) + (stats.priorities['high'] || 0);
        const total = Object.values(stats.priorities).reduce((a, b) => a + b, 0);
        return total > 0 ? ((high / total) * 100).toFixed(0) + '%' : 'N/A';
    }).join(' | ')} |\n`;

    report += `\n### Efficiency Baseline\n\n`;
    report += `| Metric | ${providers.join(' | ')} |\n`;
    report += `|--------|${providers.map(() => '------').join('|')}|\n`;
    report += `| Latency (p50) | ${providers.map(p => {
        const latencies = results.filter(r => r.provider === p).map(r => r.latencyMs).sort((a, b) => a - b);
        const p50 = latencies[Math.floor(latencies.length * 0.5)];
        return `${(p50 / 1000).toFixed(1)}s`;
    }).join(' | ')} |\n`;
    report += `| Latency (p95) | ${providers.map(p => {
        const latencies = results.filter(r => r.provider === p).map(r => r.latencyMs).sort((a, b) => a - b);
        const p95 = latencies[Math.floor(latencies.length * 0.95)];
        return `${(p95 / 1000).toFixed(1)}s`;
    }).join(' | ')} |\n`;
    report += `| Cost/1K Suggestions | ${providers.map(p => {
        const stats = providerStats.get(p)!;
        return `$${((stats.totalCost / stats.totalSuggestions) * 1000).toFixed(2)}`;
    }).join(' | ')} |\n`;

    report += `\n### Acceptance Baseline (TBD - Requires Production Data)\n\n`;
    report += `| Metric | Target | Current |\n`;
    report += `|--------|--------|--------|\n`;
    report += `| Acceptance Rate | >50% | TBD |\n`;
    report += `| Modification Rate | <30% | TBD |\n`;
    report += `| Rejection Rate | <20% | TBD |\n`;
    report += `| Time to Resolution | <5min | TBD |\n`;

    report += `\n---\n\n## Recommendations\n\n`;

    // Generate recommendations based on data
    const anthropicStats = providerStats.get('anthropic');
    const geminiStats = providerStats.get('gemini');

    if (anthropicStats && geminiStats) {
        const anthropicCostPerSugg = anthropicStats.totalCost / anthropicStats.totalSuggestions;
        const geminiCostPerSugg = geminiStats.totalCost / geminiStats.totalSuggestions;
        const costRatio = anthropicCostPerSugg / geminiCostPerSugg;

        const anthropicLatency = anthropicStats.totalLatency / anthropicStats.runs;
        const geminiLatency = geminiStats.totalLatency / geminiStats.runs;
        const latencyRatio = anthropicLatency / geminiLatency;

        report += `1. **Cost Optimization**: Gemini is ${costRatio.toFixed(0)}x cheaper per suggestion. Consider using Gemini for high-volume, lower-stakes tasks.\n\n`;
        report += `2. **Latency Optimization**: Gemini is ${latencyRatio.toFixed(1)}x faster. Use for interactive/real-time analysis.\n\n`;
        report += `3. **Quality Trade-off**: Anthropic generates ${((anthropicStats.totalSuggestions / anthropicStats.runs) / (geminiStats.totalSuggestions / geminiStats.runs) * 100 - 100).toFixed(0)}% more suggestions per document. Consider for thorough analysis.\n\n`;
        report += `4. **Agreement Analysis**: ${(avgJaccard * 100).toFixed(0)}% average agreement suggests providers identify similar issues. Low agreement areas may benefit from ensemble approach.\n\n`;
    }

    report += `---\n\n*Report generated by Doc Doctor Benchmark Analyzer*\n`;

    return report;
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    let resultsFile: string;

    if (args.length === 0 || args[0] === '--latest') {
        resultsFile = './benchmark-results/results-latest.json';
    } else if (args[0] === '--help') {
        console.log(`
Benchmark Results Analyzer

Usage:
  npx tsx scripts/analyze-results.ts [results-file]
  npx tsx scripts/analyze-results.ts --latest

Options:
  --latest    Use the latest results file (default)
  --help      Show this help
`);
        process.exit(0);
    } else {
        resultsFile = args[0];
    }

    if (!fs.existsSync(resultsFile)) {
        console.error(`Results file not found: ${resultsFile}`);
        process.exit(1);
    }

    console.log(`Loading results from: ${resultsFile}`);
    const data: BenchmarkData = JSON.parse(fs.readFileSync(resultsFile, 'utf-8'));
    console.log(`Loaded ${data.results.length} results\n`);

    const report = generateReport(data);

    // Save report
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFile = `./benchmark-results/analysis-${timestamp}.md`;
    fs.writeFileSync(reportFile, report);
    fs.writeFileSync('./benchmark-results/analysis-latest.md', report);

    console.log('Analysis complete!');
    console.log(`Report saved to: ${reportFile}`);
    console.log(`Latest report: ./benchmark-results/analysis-latest.md`);

    // Print summary to console
    console.log('\n' + '='.repeat(60));
    console.log('QUICK SUMMARY');
    console.log('='.repeat(60));

    const providers = [...new Set(data.results.map(r => r.provider))];
    const providerStats = analyzeProviders(data.results);

    for (const provider of providers) {
        const stats = providerStats.get(provider)!;
        console.log(`\n${provider}:`);
        console.log(`  Suggestions/run: ${(stats.totalSuggestions / stats.runs).toFixed(1)}`);
        console.log(`  Cost/suggestion: $${(stats.totalCost / stats.totalSuggestions).toFixed(4)}`);
        console.log(`  Top stub types: ${Object.entries(stats.stubTypes)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([t, c]) => `${t}(${c})`)
            .join(', ')}`);
    }

    const comparisons = compareProviders(data.results);
    const avgJaccard = comparisons.reduce((sum, c) => sum + c.jaccardSimilarity, 0) / comparisons.length;
    console.log(`\nProvider Agreement: ${(avgJaccard * 100).toFixed(1)}% avg Jaccard similarity`);
}

main().catch(error => {
    console.error('Analysis failed:', error);
    process.exit(1);
});
