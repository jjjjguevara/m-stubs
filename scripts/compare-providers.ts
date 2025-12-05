#!/usr/bin/env npx ts-node
/**
 * Provider Comparison Script
 *
 * Compares LLM provider outputs on the same document using the LLMComparator.
 *
 * Usage:
 *   npx ts-node scripts/compare-providers.ts <document-path> [options]
 *
 * Options:
 *   --mode <mode>       Creativity mode (default: review)
 *   --output <file>     Output file for comparison report
 *
 * Environment Variables:
 *   ANTHROPIC_API_KEY   Anthropic API key
 *   OPENAI_API_KEY      OpenAI API key
 *   GEMINI_API_KEY      Google Gemini API key
 */

import * as fs from 'fs';
import * as path from 'path';
import { LLMComparator, type ProviderResult } from '../src/observability/llm-comparator';
import { DEFAULT_PROVIDERS, type ProviderConfig, calculateCost } from './benchmark-config';
import type { SuggestedStub } from '../src/llm/llm-types';

// =============================================================================
// TYPES
// =============================================================================

interface ParsedDocument {
    path: string;
    title: string;
    content: string;
    frontmatter: Record<string, unknown>;
    refinement: number;
    stubs: Array<{ type: string; description: string }>;
}

// =============================================================================
// DOCUMENT PARSING
// =============================================================================

function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
    const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) return { frontmatter: {}, body: content };

    const [, yamlStr, body] = match;
    const frontmatter: Record<string, unknown> = {};

    for (const line of yamlStr.split('\n')) {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
            const key = line.slice(0, colonIdx).trim();
            const value = line.slice(colonIdx + 1).trim();
            if (value === 'true') frontmatter[key] = true;
            else if (value === 'false') frontmatter[key] = false;
            else if (/^-?\d+(\.\d+)?$/.test(value)) frontmatter[key] = parseFloat(value);
            else frontmatter[key] = value.replace(/^["']|["']$/g, '');
        }
    }

    return { frontmatter, body };
}

function parseDocument(filePath: string): ParsedDocument {
    const content = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter } = parseFrontmatter(content);

    return {
        path: filePath,
        title: String(frontmatter.title || path.basename(filePath, '.md')),
        content,
        frontmatter,
        refinement: typeof frontmatter.refinement === 'number' ? frontmatter.refinement : 0.5,
        stubs: [],
    };
}

// =============================================================================
// LLM CALLS
// =============================================================================

function buildSystemPrompt(mode: string): string {
    const instructions: Record<string, string> = {
        research: 'Focus on factual accuracy. Use conservative estimates.',
        review: 'Balance thoroughness with practicality.',
        draft: 'Be creative and suggest expansions.',
        creative: 'Think expansively. Suggest novel approaches.',
    };

    return `You are a document analysis assistant. Analyze the document and suggest improvements as "stubs".

${instructions[mode] || instructions.review}

Return JSON:
{
  "suggested_stubs": [
    { "type": "<type>", "description": "<what>", "stub_form": "<form>", "location": { "lineNumber": <n> }, "priority": "<priority>", "rationale": "<why>" }
  ],
  "confidence": <0-1>,
  "analysis": "<brief>"
}`;
}

function buildUserPrompt(doc: ParsedDocument): string {
    return `Analyze this document:

Title: ${doc.title}
Refinement: ${doc.refinement}

---

${doc.content}`;
}

async function callAnthropic(
    provider: ProviderConfig,
    system: string,
    user: string,
    temp: number,
): Promise<{ response: unknown; inputTokens: number; outputTokens: number }> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': provider.apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: provider.model,
            max_tokens: provider.maxTokens,
            temperature: temp,
            system,
            messages: [{ role: 'user', content: user }],
        }),
    });

    if (!res.ok) throw new Error(`Anthropic: ${res.status} - ${await res.text()}`);

    const data = await res.json() as {
        content: Array<{ text: string }>;
        usage: { input_tokens: number; output_tokens: number };
    };

    const text = data.content[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const response = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: text };

    return { response, inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens };
}

async function callOpenAI(
    provider: ProviderConfig,
    system: string,
    user: string,
    temp: number,
): Promise<{ response: unknown; inputTokens: number; outputTokens: number }> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
            model: provider.model,
            max_tokens: provider.maxTokens,
            temperature: temp,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: user },
            ],
            response_format: { type: 'json_object' },
        }),
    });

    if (!res.ok) throw new Error(`OpenAI: ${res.status} - ${await res.text()}`);

    const data = await res.json() as {
        choices: Array<{ message: { content: string } }>;
        usage: { prompt_tokens: number; completion_tokens: number };
    };

    const text = data.choices[0]?.message?.content || '';
    const response = JSON.parse(text);

    return { response, inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens };
}

async function callGemini(
    provider: ProviderConfig,
    system: string,
    user: string,
    temp: number,
): Promise<{ response: unknown; inputTokens: number; outputTokens: number }> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${provider.model}:generateContent?key=${provider.apiKey}`;

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: `${system}\n\n${user}` }] }],
            generationConfig: { temperature: temp, maxOutputTokens: provider.maxTokens },
        }),
    });

    if (!res.ok) throw new Error(`Gemini: ${res.status} - ${await res.text()}`);

    const data = await res.json() as {
        candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
        usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
    };

    const text = data.candidates[0]?.content?.parts[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const response = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: text };

    return {
        response,
        inputTokens: data.usageMetadata?.promptTokenCount || 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
    };
}

async function callProvider(
    provider: ProviderConfig,
    system: string,
    user: string,
    temp: number,
): Promise<ProviderResult> {
    const startTime = Date.now();

    try {
        let result: { response: unknown; inputTokens: number; outputTokens: number };

        switch (provider.name) {
            case 'anthropic':
                result = await callAnthropic(provider, system, user, temp);
                break;
            case 'openai':
                result = await callOpenAI(provider, system, user, temp);
                break;
            case 'gemini':
                result = await callGemini(provider, system, user, temp);
                break;
            default:
                throw new Error(`Unknown provider: ${provider.name}`);
        }

        const latencyMs = Date.now() - startTime;
        const resp = result.response as Record<string, unknown>;

        return {
            provider: provider.name,
            model: provider.model,
            success: true,
            response: {
                suggested_stubs: (resp.suggested_stubs as SuggestedStub[]) || [],
                confidence: (resp.confidence as number) || 0.5,
                analysis_summary: (resp.analysis_summary as string) || '',
                references: [],
            },
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            latencyMs,
            estimatedCost: calculateCost(provider.model, result.inputTokens, result.outputTokens),
        };
    } catch (error) {
        return {
            provider: provider.name,
            model: provider.model,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            inputTokens: 0,
            outputTokens: 0,
            latencyMs: Date.now() - startTime,
        };
    }
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === '--help') {
        console.log(`
Provider Comparison Script

Usage: npx ts-node scripts/compare-providers.ts <document-path> [options]

Options:
  --mode <mode>       Creativity mode (default: review)
  --output <file>     Output file for comparison report

Environment Variables:
  ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY
`);
        process.exit(0);
    }

    const documentPath = args[0];
    let mode = 'review';
    let outputFile: string | null = null;

    for (let i = 1; i < args.length; i++) {
        if (args[i] === '--mode') mode = args[++i];
        if (args[i] === '--output') outputFile = args[++i];
    }

    if (!fs.existsSync(documentPath)) {
        console.error(`❌ Document not found: ${documentPath}`);
        process.exit(1);
    }

    const providers = DEFAULT_PROVIDERS.filter(p => p.apiKey);
    if (providers.length === 0) {
        console.error('❌ No API keys configured');
        process.exit(1);
    }

    console.log(`📄 Document: ${documentPath}`);
    console.log(`🎨 Mode: ${mode}`);
    console.log(`🔌 Providers: ${providers.map(p => p.name).join(', ')}\n`);

    const doc = parseDocument(documentPath);
    const system = buildSystemPrompt(mode);
    const user = buildUserPrompt(doc);
    const temp = { research: 0.2, review: 0.4, draft: 0.6, creative: 0.8 }[mode] || 0.4;

    console.log('🔄 Calling providers...\n');

    const results: ProviderResult[] = [];
    for (const provider of providers) {
        console.log(`  ${provider.name}...`);
        const result = await callProvider(provider, system, user, temp);
        results.push(result);

        if (result.success) {
            const suggestions = (result.response as { suggested_stubs: unknown[] })?.suggested_stubs?.length || 0;
            console.log(`    ✅ ${result.latencyMs}ms, ${suggestions} suggestions, $${result.estimatedCost?.toFixed(4)}`);
        } else {
            console.log(`    ❌ ${result.error}`);
        }

        // Rate limit
        await new Promise(r => setTimeout(r, 1000));
    }

    // Compare
    console.log('\n📊 Comparing results...\n');
    const comparator = new LLMComparator();
    const comparison = comparator.compare(documentPath, results);

    // Output
    console.log('='.repeat(60));
    console.log('COMPARISON RESULTS');
    console.log('='.repeat(60));
    console.log(`\nJaccard Similarity: ${(comparison.overlap.jaccardSimilarity * 100).toFixed(1)}%`);
    console.log(`Unanimous Suggestions: ${comparison.overlap.unanimousSuggestions.length}`);

    if (comparison.winner) {
        console.log(`\n🏆 Winner: ${comparison.winner.provider}`);
        console.log(`   Rationale: ${comparison.winner.rationale}`);
        console.log(`   Confidence: ${(comparison.winner.confidence * 100).toFixed(1)}%`);
    }

    console.log('\n📈 Quality Metrics:');
    for (const [provider, metrics] of Object.entries(comparison.qualityDelta)) {
        console.log(`  ${provider}: ${metrics.suggestionCount} suggestions, ${(metrics.avgConfidence * 100).toFixed(0)}% confidence`);
    }

    console.log('\n⚡ Efficiency Metrics:');
    for (const [provider, metrics] of Object.entries(comparison.efficiencyDelta)) {
        console.log(`  ${provider}: ${metrics.latencyMs}ms, ${metrics.totalTokens} tokens, $${metrics.estimatedCost?.toFixed(4)}`);
    }

    if (comparison.overlap.pairwiseComparisons.length > 0) {
        console.log('\n🔗 Pairwise Similarity:');
        for (const pair of comparison.overlap.pairwiseComparisons) {
            console.log(`  ${pair.provider1} ↔ ${pair.provider2}: ${(pair.similarity * 100).toFixed(1)}%`);
        }
    }

    // Save if requested
    if (outputFile) {
        fs.writeFileSync(outputFile, JSON.stringify(comparison, null, 2));
        console.log(`\n📁 Saved to ${outputFile}`);
    }

    console.log('\n✅ Comparison complete!');
}

main().catch(error => {
    console.error('❌ Comparison failed:', error);
    process.exit(1);
});
