import { configExperimentCentral, configWumpusUniv } from '../config.js';
import { diffLines, formatTextDiff, sendTrackerMessage, target } from '../tracker.js';

async function getCSP(): Promise<string> {
    const response = await fetch('https://canary.discord.com/app', {
        headers: {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
    });
    if (!response.ok) throw new Error(`Failed to fetch CSP: HTTP ${response.status}`);
    return (response.headers.get('content-security-policy') ?? '')
        .replace(/'nonce-[^']+'/g, "'nonce-{NONCE}'")
        .trim();
}

function cspEntries(content: string): string {
    return content
        .split(';')
        .flatMap((rawDirective) => {
            const [directive, ...sources] = rawDirective.trim().split(/\s+/);
            if (!directive) return [];
            return sources.length
                ? sources.map((source) => `${directive}: ${source}`)
                : [directive];
        })
        .join('\n');
}

async function diff(before: string, after: string): Promise<void> {
    const content = formatTextDiff(diffLines(cspEntries(before), cspEntries(after)));
    if (!content) return;
    await sendTrackerMessage(
        [
            target(
                'Experiment Central CSP',
                configExperimentCentral.webhooks.csp,
                configExperimentCentral.pings.csp,
            ),
            target(
                'Wumpus University CSP',
                configWumpusUniv.webhooks.csp,
                configWumpusUniv.pings.csp,
            ),
        ],
        { content },
    );
}

export default { getCSP, diff };
