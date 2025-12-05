#!/usr/bin/env npx tsx
/**
 * Compare API Benchmark Results with Claude Code Opus Analysis
 *
 * Merges automated benchmark results with manual Claude Code analysis
 * to provide a three-way comparison: Anthropic API vs Gemini API vs Claude Code Opus
 */

import * as fs from 'fs';

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
    success: boolean;
    latencyMs: number;
    cost: number;
    suggestionCount: number;
    response?: {
        suggested_stubs?: Suggestion[];
        confidence?: number;
        analysis?: string;
    };
}

interface OpusResults {
    provider: string;
    model: string;
    results: BenchmarkResult[];
}

function calculateJaccard(types1: string[], types2: string[]): number {
    const set1 = new Set(types1);
    const set2 = new Set(types2);
    if (set1.size === 0 && set2.size === 0) return 1;
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return intersection.size / union.size;
}

async function main(): Promise<void> {
    // Load API benchmark results
    const benchmarkFile = './benchmark-results/results-latest.json';
    const opusFile = './benchmark-results/claude-code-opus-results.json';

    if (!fs.existsSync(benchmarkFile)) {
        console.error('Benchmark results not found. Run npm run benchmark first.');
        process.exit(1);
    }

    if (!fs.existsSync(opusFile)) {
        console.error('Opus results not found.');
        process.exit(1);
    }

    const benchmarkData = JSON.parse(fs.readFileSync(benchmarkFile, 'utf-8'));
    const opusData: OpusResults = JSON.parse(fs.readFileSync(opusFile, 'utf-8'));

    console.log('='.repeat(70));
    console.log('CLAUDE CODE OPUS vs API PROVIDERS COMPARISON');
    console.log('='.repeat(70));

    // Get unique documents analyzed by Opus
    const opusDocs = opusData.results.map(r => r.documentPath);
    console.log(`\nOpus analyzed ${opusDocs.length} documents:`);
    opusDocs.forEach(d => console.log(`  - ${d}`));

    // Compare each document
    console.log('\n' + '-'.repeat(70));
    console.log('DOCUMENT-BY-DOCUMENT COMPARISON');
    console.log('-'.repeat(70));

    for (const opusResult of opusData.results) {
        const docPath = opusResult.documentPath;
        const mode = opusResult.creativityMode;

        console.log(`\n## ${docPath} (${mode} mode)\n`);

        // Get API results for same document/mode
        const apiResults = benchmarkData.results.filter(
            (r: BenchmarkResult) => r.documentPath === docPath && r.creativityMode === mode
        );

        // Collect all providers including Opus
        const allResults = [...apiResults, opusResult];
        const providers = allResults.map(r => r.provider);

        // Show suggestion counts
        console.log('Suggestion counts:');
        for (const result of allResults) {
            console.log(`  ${result.provider}: ${result.suggestionCount}`);
        }

        // Get stub types per provider
        const typesByProvider: Record<string, string[]> = {};
        for (const result of allResults) {
            const types = (result.response?.suggested_stubs || []).map((s: { type: string }) => s.type);
            typesByProvider[result.provider] = types;
        }

        // Calculate Jaccard similarities
        console.log('\nStub type similarity (Jaccard):');
        for (let i = 0; i < providers.length; i++) {
            for (let j = i + 1; j < providers.length; j++) {
                const sim = calculateJaccard(
                    typesByProvider[providers[i]],
                    typesByProvider[providers[j]]
                );
                console.log(`  ${providers[i]} ↔ ${providers[j]}: ${(sim * 100).toFixed(0)}%`);
            }
        }

        // Show stub types per provider
        console.log('\nStub types by provider:');
        for (const [provider, types] of Object.entries(typesByProvider)) {
            const typeCounts: Record<string, number> = {};
            for (const t of types) {
                typeCounts[t] = (typeCounts[t] || 0) + 1;
            }
            const typeStr = Object.entries(typeCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([t, c]) => `${t}(${c})`)
                .join(', ');
            console.log(`  ${provider}: ${typeStr}`);
        }

        // Show priorities per provider
        console.log('\nPriority distribution:');
        for (const result of allResults) {
            const priorities: Record<string, number> = {};
            for (const stub of result.response?.suggested_stubs || []) {
                if (stub.priority) {
                    priorities[stub.priority] = (priorities[stub.priority] || 0) + 1;
                }
            }
            const prioStr = ['critical', 'high', 'medium', 'low']
                .filter(p => priorities[p])
                .map(p => `${p}:${priorities[p]}`)
                .join(', ');
            console.log(`  ${result.provider}: ${prioStr}`);
        }

        // Show confidence if available
        const confidences = allResults
            .filter(r => r.response?.confidence)
            .map(r => `${r.provider}: ${((r.response?.confidence || 0) * 100).toFixed(0)}%`);
        if (confidences.length > 0) {
            console.log(`\nConfidence: ${confidences.join(', ')}`);
        }

        // Show Opus analysis
        if (opusResult.response?.analysis) {
            console.log(`\nOpus analysis: ${opusResult.response.analysis}`);
        }
    }

    // Summary comparison
    console.log('\n' + '='.repeat(70));
    console.log('SUMMARY COMPARISON');
    console.log('='.repeat(70));

    // Aggregate stats
    const providerStats: Record<string, {
        totalSuggestions: number;
        stubTypes: Record<string, number>;
        priorities: Record<string, number>;
        docCount: number;
    }> = {};

    // Add API providers
    for (const result of benchmarkData.results) {
        if (!opusDocs.includes(result.documentPath)) continue;

        if (!providerStats[result.provider]) {
            providerStats[result.provider] = {
                totalSuggestions: 0,
                stubTypes: {},
                priorities: {},
                docCount: 0,
            };
        }

        const stats = providerStats[result.provider];
        stats.totalSuggestions += result.suggestionCount;
        stats.docCount++;

        for (const stub of result.response?.suggested_stubs || []) {
            stats.stubTypes[stub.type] = (stats.stubTypes[stub.type] || 0) + 1;
            if (stub.priority) {
                stats.priorities[stub.priority] = (stats.priorities[stub.priority] || 0) + 1;
            }
        }
    }

    // Add Opus
    providerStats['claude-code-opus'] = {
        totalSuggestions: 0,
        stubTypes: {},
        priorities: {},
        docCount: opusData.results.length,
    };

    for (const result of opusData.results) {
        providerStats['claude-code-opus'].totalSuggestions += result.suggestionCount;
        for (const stub of result.response?.suggested_stubs || []) {
            providerStats['claude-code-opus'].stubTypes[stub.type] =
                (providerStats['claude-code-opus'].stubTypes[stub.type] || 0) + 1;
            if (stub.priority) {
                providerStats['claude-code-opus'].priorities[stub.priority] =
                    (providerStats['claude-code-opus'].priorities[stub.priority] || 0) + 1;
            }
        }
    }

    // Print comparison table
    const allProviders = Object.keys(providerStats);
    console.log('\n| Metric | ' + allProviders.join(' | ') + ' |');
    console.log('|--------|' + allProviders.map(() => '------').join('|') + '|');

    // Suggestions per doc
    console.log('| Sugg/Doc | ' + allProviders.map(p => {
        const stats = providerStats[p];
        return (stats.totalSuggestions / stats.docCount).toFixed(1);
    }).join(' | ') + ' |');

    // Top stub types
    console.log('| Top Type | ' + allProviders.map(p => {
        const stats = providerStats[p];
        const sorted = Object.entries(stats.stubTypes).sort((a, b) => b[1] - a[1]);
        return sorted[0]?.[0] || 'N/A';
    }).join(' | ') + ' |');

    // High priority %
    console.log('| High Prio % | ' + allProviders.map(p => {
        const stats = providerStats[p];
        const high = (stats.priorities['critical'] || 0) + (stats.priorities['high'] || 0);
        const total = Object.values(stats.priorities).reduce((a, b) => a + b, 0);
        return total > 0 ? ((high / total) * 100).toFixed(0) + '%' : 'N/A';
    }).join(' | ') + ' |');

    // Unique types
    console.log('| Unique Types | ' + allProviders.map(p => {
        const stats = providerStats[p];
        return Object.keys(stats.stubTypes).length;
    }).join(' | ') + ' |');

    // Calculate average agreement between Opus and APIs
    console.log('\n### Agreement with Claude Code Opus');

    for (const opusResult of opusData.results) {
        const opusTypes = (opusResult.response?.suggested_stubs || []).map(s => s.type);

        for (const provider of ['anthropic', 'gemini']) {
            const apiResult = benchmarkData.results.find(
                (r: BenchmarkResult) =>
                    r.documentPath === opusResult.documentPath &&
                    r.creativityMode === opusResult.creativityMode &&
                    r.provider === provider
            );

            if (apiResult) {
                const apiTypes = (apiResult.response?.suggested_stubs || []).map((s: Suggestion) => s.type);
                const jaccard = calculateJaccard(opusTypes, apiTypes);
                console.log(`  ${opusResult.documentPath} (${opusResult.creativityMode}): Opus ↔ ${provider} = ${(jaccard * 100).toFixed(0)}%`);
            }
        }
    }

    console.log('\n✅ Comparison complete!');
}

main().catch(error => {
    console.error('Comparison failed:', error);
    process.exit(1);
});
