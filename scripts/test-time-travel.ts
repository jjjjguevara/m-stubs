/**
 * Time Travel Integration Test Script
 *
 * Standalone script to test the Time Travel git operations
 * without needing Obsidian dependencies.
 *
 * Run with: npx tsx scripts/test-time-travel.ts
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Test configuration
const VAULT_PATH = '/Users/josueguevara/Library/Mobile Documents/iCloud~md~obsidian/Documents/M';
const TEST_FILE = 'Proyectos/Builds/doc-doctor/tests/time-travel-test.md';
const MILESTONE_PATTERN = /^(milestone|draft|research|publication|doc-doctor):/i;

interface GitCommitEntry {
    sha: string;
    message: string;
    author: string;
    timestamp: number;
}

interface DocumentSnapshot {
    id: string;
    commitSha: string;
    commitMessage: string;
    author: string;
    timestamp: number;
    documentPath: string;
    content?: string;
    isMilestoneSnapshot: boolean;
}

// Color helpers for console output
const colors = {
    green: (s: string) => `\x1b[32m${s}\x1b[0m`,
    red: (s: string) => `\x1b[31m${s}\x1b[0m`,
    yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
    cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
    dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

async function execGit(args: string[]): Promise<string> {
    // Properly escape args for shell
    const escapedArgs = args.map(arg => {
        // Quote args that contain special characters
        if (/[|<>&\s"'\\]/.test(arg)) {
            return `"${arg.replace(/"/g, '\\"')}"`;
        }
        return arg;
    });
    const command = `git ${escapedArgs.join(' ')}`;
    const { stdout } = await execAsync(command, { cwd: VAULT_PATH, maxBuffer: 10 * 1024 * 1024 });
    return stdout;
}

async function getFileHistory(documentPath: string, milestoneOnly: boolean): Promise<GitCommitEntry[]> {
    const format = '%H|%s|%an|%at';
    const output = await execGit([
        'log',
        `--format=${format}`,
        '--follow',
        '-n', '20',
        '--',
        documentPath,
    ]);

    const lines = output.trim().split('\n').filter(l => l);
    let commits: GitCommitEntry[] = lines.map(line => {
        const [sha, message, author, timestamp] = line.split('|');
        return { sha, message, author, timestamp: parseInt(timestamp, 10) };
    });

    if (milestoneOnly) {
        commits = commits.filter(c => MILESTONE_PATTERN.test(c.message));
    }

    return commits;
}

async function getContentAtCommit(documentPath: string, commitSha: string): Promise<string> {
    return execGit(['show', `${commitSha}:${documentPath}`]);
}

function toDocumentSnapshot(commit: GitCommitEntry, documentPath: string): DocumentSnapshot {
    return {
        id: `snapshot-${commit.sha.substring(0, 8)}`,
        commitSha: commit.sha,
        commitMessage: commit.message,
        author: commit.author,
        timestamp: commit.timestamp,
        documentPath,
        isMilestoneSnapshot: MILESTONE_PATTERN.test(commit.message),
    };
}

async function runTests() {
    console.log('\n' + colors.cyan('═══════════════════════════════════════════════════════════'));
    console.log(colors.cyan('           TIME TRAVEL FEATURE - INTEGRATION TEST           '));
    console.log(colors.cyan('═══════════════════════════════════════════════════════════') + '\n');

    let passed = 0;
    let failed = 0;

    // Test 1: Git availability
    console.log(colors.yellow('Test 1: Git Availability'));
    try {
        const version = await execGit(['--version']);
        console.log(colors.green('  ✓ Git CLI available: ') + version.trim());
        passed++;
    } catch (error) {
        console.log(colors.red('  ✗ Git CLI not available'));
        failed++;
    }

    // Test 2: Repository check
    console.log('\n' + colors.yellow('Test 2: Repository Check'));
    try {
        const root = await execGit(['rev-parse', '--show-toplevel']);
        console.log(colors.green('  ✓ Git root: ') + root.trim());
        passed++;
    } catch (error) {
        console.log(colors.red('  ✗ Not a git repository'));
        failed++;
    }

    // Test 3: File history (all commits)
    console.log('\n' + colors.yellow('Test 3: File History (All Commits)'));
    try {
        const allCommits = await getFileHistory(TEST_FILE, false);
        console.log(colors.green(`  ✓ Found ${allCommits.length} commits`));
        allCommits.slice(0, 5).forEach(c => {
            console.log(colors.dim(`    ${c.sha.substring(0, 7)} | ${c.message}`));
        });
        passed++;
    } catch (error) {
        console.log(colors.red('  ✗ Failed to get history: ') + error);
        failed++;
    }

    // Test 4: File history (milestone only)
    console.log('\n' + colors.yellow('Test 4: File History (Milestone Only)'));
    try {
        const milestoneCommits = await getFileHistory(TEST_FILE, true);
        console.log(colors.green(`  ✓ Found ${milestoneCommits.length} milestone commits`));
        milestoneCommits.forEach(c => {
            const date = new Date(c.timestamp * 1000).toLocaleString();
            console.log(colors.dim(`    ${c.sha.substring(0, 7)} | ${c.message} | ${date}`));
        });

        if (milestoneCommits.length >= 3) {
            console.log(colors.green('  ✓ At least 3 milestone commits found'));
            passed++;
        } else {
            console.log(colors.red('  ✗ Expected at least 3 milestone commits'));
            failed++;
        }
    } catch (error) {
        console.log(colors.red('  ✗ Failed to get milestone history: ') + error);
        failed++;
    }

    // Test 5: Content retrieval at different commits
    console.log('\n' + colors.yellow('Test 5: Content Retrieval'));
    try {
        const commits = await getFileHistory(TEST_FILE, true);
        const newestCommit = commits[0];
        const oldestCommit = commits[commits.length - 1];

        const newestContent = await getContentAtCommit(TEST_FILE, newestCommit.sha);
        const oldestContent = await getContentAtCommit(TEST_FILE, oldestCommit.sha);

        const newestRefinement = newestContent.match(/refinement: ([\d.]+)/)?.[1];
        const oldestRefinement = oldestContent.match(/refinement: ([\d.]+)/)?.[1];

        console.log(colors.green('  ✓ Retrieved content at different commits'));
        console.log(colors.dim(`    Newest (${newestCommit.sha.substring(0, 7)}): refinement=${newestRefinement}, ${newestContent.length} chars`));
        console.log(colors.dim(`    Oldest (${oldestCommit.sha.substring(0, 7)}): refinement=${oldestRefinement}, ${oldestContent.length} chars`));

        if (parseFloat(newestRefinement!) > parseFloat(oldestRefinement!)) {
            console.log(colors.green('  ✓ Refinement increased over time'));
            passed++;
        } else {
            console.log(colors.red('  ✗ Expected refinement to increase'));
            failed++;
        }
    } catch (error) {
        console.log(colors.red('  ✗ Failed to retrieve content: ') + error);
        failed++;
    }

    // Test 6: Snapshot conversion
    console.log('\n' + colors.yellow('Test 6: Snapshot Conversion'));
    try {
        const commits = await getFileHistory(TEST_FILE, true);
        const snapshots = commits.map(c => toDocumentSnapshot(c, TEST_FILE));

        console.log(colors.green(`  ✓ Converted ${snapshots.length} commits to snapshots`));
        snapshots.forEach(s => {
            console.log(colors.dim(`    ${s.id} | ${s.commitMessage.substring(0, 50)}...`));
        });

        // Verify snapshot structure
        const firstSnapshot = snapshots[0];
        const hasRequiredFields =
            firstSnapshot.id &&
            firstSnapshot.commitSha &&
            firstSnapshot.commitMessage &&
            firstSnapshot.author &&
            firstSnapshot.timestamp &&
            firstSnapshot.documentPath &&
            typeof firstSnapshot.isMilestoneSnapshot === 'boolean';

        if (hasRequiredFields) {
            console.log(colors.green('  ✓ Snapshot has all required fields'));
            passed++;
        } else {
            console.log(colors.red('  ✗ Snapshot missing required fields'));
            failed++;
        }
    } catch (error) {
        console.log(colors.red('  ✗ Failed to convert snapshots: ') + error);
        failed++;
    }

    // Test 7: Full flow simulation
    console.log('\n' + colors.yellow('Test 7: Full Time Travel Flow'));
    try {
        console.log(colors.dim('  Step 1: Check git availability...'));
        await execGit(['--version']);

        console.log(colors.dim('  Step 2: Get milestone commits...'));
        const commits = await getFileHistory(TEST_FILE, true);

        console.log(colors.dim('  Step 3: Convert to snapshots...'));
        const snapshots = commits.map(c => toDocumentSnapshot(c, TEST_FILE));

        console.log(colors.dim('  Step 4: Fetch content for each snapshot...'));
        for (const snapshot of snapshots) {
            const content = await getContentAtCommit(snapshot.documentPath, snapshot.commitSha);
            snapshot.content = content;
        }

        console.log(colors.dim('  Step 5: Verify all snapshots have content...'));
        const allHaveContent = snapshots.every(s => s.content && s.content.length > 0);

        if (allHaveContent) {
            console.log(colors.green(`  ✓ Full flow completed successfully`));
            console.log(colors.green(`    ${snapshots.length} snapshots ready for display`));
            passed++;
        } else {
            console.log(colors.red('  ✗ Some snapshots missing content'));
            failed++;
        }
    } catch (error) {
        console.log(colors.red('  ✗ Full flow failed: ') + error);
        failed++;
    }

    // Summary
    console.log('\n' + colors.cyan('═══════════════════════════════════════════════════════════'));
    console.log(colors.cyan('                       TEST SUMMARY                        '));
    console.log(colors.cyan('═══════════════════════════════════════════════════════════'));
    console.log(`\n  ${colors.green(`Passed: ${passed}`)}  ${colors.red(`Failed: ${failed}`)}`);

    if (failed === 0) {
        console.log(colors.green('\n  ✓ All tests passed! Time Travel feature is ready.'));
    } else {
        console.log(colors.red(`\n  ✗ ${failed} test(s) failed.`));
        process.exit(1);
    }

    // Display sample snapshot data
    console.log('\n' + colors.cyan('═══════════════════════════════════════════════════════════'));
    console.log(colors.cyan('                    SAMPLE SNAPSHOT DATA                   '));
    console.log(colors.cyan('═══════════════════════════════════════════════════════════') + '\n');

    const commits = await getFileHistory(TEST_FILE, true);
    const snapshots = await Promise.all(
        commits.map(async c => {
            const snapshot = toDocumentSnapshot(c, TEST_FILE);
            snapshot.content = await getContentAtCommit(TEST_FILE, c.sha);
            return snapshot;
        })
    );

    snapshots.forEach((s, i) => {
        const date = new Date(s.timestamp * 1000).toLocaleString();
        const refinement = s.content?.match(/refinement: ([\d.]+)/)?.[1] || 'N/A';
        console.log(`${colors.yellow(`Snapshot ${i + 1}:`)} ${s.commitMessage}`);
        console.log(`  ${colors.dim('SHA:')} ${s.commitSha.substring(0, 7)}`);
        console.log(`  ${colors.dim('Date:')} ${date}`);
        console.log(`  ${colors.dim('Author:')} ${s.author}`);
        console.log(`  ${colors.dim('Refinement:')} ${refinement}`);
        console.log(`  ${colors.dim('Content length:')} ${s.content?.length} chars`);
        console.log();
    });
}

runTests().catch(console.error);
