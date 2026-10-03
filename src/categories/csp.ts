import { configExperimentCentral, configWumpusUniv } from '../config.js';
import { diffLines, formatTextDiff, sendTrackerMessage, target } from '../tracker.js';

function normalizeCSP(raw: string): string {
    const withoutNonce = raw.replace(/'nonce-[^']+'/g, "'nonce-{NONCE}'").trim();
    if (!withoutNonce) throw new Error('Empty CSP header');
    const directives = withoutNonce
        .split(';')
        .map((directive) => directive.trim())
        .filter(Boolean)
        .map((directive) => {
            const [name, ...sources] = directive.split(/\s+/).filter(Boolean);
            if (!name) return '';
            if (!sources.length) return name;
            const deduped = [...new Set(sources)].sort();
            return `${name} ${deduped.join(' ')}`;
        })
        .filter(Boolean)
        .sort();
    return directives.join('; ');
}

async function getCSP(): Promise<string> {
    const response = await fetch('https://canary.discord.com/app', {
        headers: {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
    });
    if (!response.ok) throw new Error(`Failed to fetch CSP: HTTP ${response.status}`);
    const raw = response.headers.get('content-security-policy') ?? '';
    return normalizeCSP(raw);
}

function cspEntries(content: string): string {
    // content is expected to be normalized via normalizeCSP; handle legacy raw as well
    const normalized = (() => {
        try {
            return normalizeCSP(content);
        } catch {
            return content
                .replace(/'nonce-[^']+'/g, "'nonce-{NONCE}'")
                .trim();
        }
    })();
    return normalized
        .split(';')
        .flatMap((rawDirective) => {
            const [directive, ...sources] = rawDirective.trim().split(/\s+/);
            if (!directive) return [];
            return sources.length
                ? [...new Set(sources)].sort().map((source) => `${directive}: ${source}`)
                : [directive];
        })
        .sort()
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
