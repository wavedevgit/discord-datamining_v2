import { configExperimentCentral, configWumpusUniv } from '../config.js';
import { diffLines, formatTextDiff, sendTrackerMessage, target } from '../tracker.js';

async function getModules(): Promise<string> {
    const response = await fetch('https://canary.discord.com/acknowledgements');
    if (!response.ok) {
        throw new Error(`Failed to fetch acknowledgements: HTTP ${response.status}`);
    }
    const html = await response.text();
    const scripts = [
        ...html.matchAll(
            /script async data-chunk="refresh-text_pages-Acknowledgements" src="(?<url>\/assets\/.+?\.js)"><\/script>/g,
        ),
    ].map((match) => match.groups?.url).filter((url): url is string => Boolean(url));
    if (!scripts.length) throw new Error('Acknowledgements script was not found');

    let lastError: unknown;
    for (const script of [...scripts].reverse()) {
        try {
            const scriptResponse = await fetch(`https://canary.discord.com${script}`);
            if (!scriptResponse.ok) continue;
            const content = await scriptResponse.text();
            const modules = content.match(/\.exports="(?<modules>\*.+)"/)?.groups?.modules;
            if (!modules) continue;
            const normalized = modules.replaceAll('* ', '- ').replaceAll('\\n', '\n');
            const lines = normalized
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => line.replace(/\s+/g, ' '));
            const deduped = [...new Set(lines)].sort((a, b) => a.localeCompare(b));
            if (!deduped.length) continue;
            return deduped.join('\n');
        } catch (error) {
            lastError = error;
        }
    }
    throw new Error(`Acknowledgements modules were not found: ${String(lastError)}`);
}

async function diff(before: string, after: string): Promise<void> {
    const content = formatTextDiff(diffLines(before, after));
    if (!content) return;
    await sendTrackerMessage(
        [
            target(
                'Experiment Central acknowledgements',
                configExperimentCentral.webhooks.acknowledgements,
                configExperimentCentral.pings.acknowledgements,
            ),
            target(
                'Wumpus University acknowledgements',
                configWumpusUniv.webhooks.acknowledgements,
                configWumpusUniv.pings.acknowledgements,
            ),
        ],
        { content },
    );
}

export default { getModules, diff };
