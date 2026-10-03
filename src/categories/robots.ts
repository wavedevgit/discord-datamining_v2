import { configExperimentCentral, configWumpusUniv } from '../config.js';
import { diffLines, formatTextDiff, sendTrackerMessage, target } from '../tracker.js';

function normalizeRobots(text: string): string {
    const lines = text
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    if (!lines.length) throw new Error('Empty robots.txt');
    // Deduplicate preserving first occurrence to avoid duplicate line noise
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const line of lines) {
        if (!seen.has(line)) {
            seen.add(line);
            deduped.push(line);
        }
    }
    return deduped.join('\n');
}

async function getRobots(url = 'https://discord.com/robots.txt'): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch robots.txt: HTTP ${response.status}`);
    const text = await response.text();
    return normalizeRobots(text.trim());
}

async function diff(before: string, after: string): Promise<void> {
    const content = formatTextDiff(diffLines(before, after));
    if (!content) return;
    await sendTrackerMessage(
        [
            target(
                'Experiment Central robots',
                configExperimentCentral.webhooks.robots,
                configExperimentCentral.pings.robots,
            ),
            target(
                'Wumpus University robots',
                configWumpusUniv.webhooks.robots,
                configWumpusUniv.pings.robots,
            ),
        ],
        { content },
    );
}

export default { getRobots, diff };
