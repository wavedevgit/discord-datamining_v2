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
    const script = scripts.at(-2);
    if (!script) throw new Error('Acknowledgements script was not found');

    const scriptResponse = await fetch(`https://canary.discord.com${script}`);
    if (!scriptResponse.ok) {
        throw new Error(`Failed to fetch acknowledgements script: HTTP ${scriptResponse.status}`);
    }
    const content = await scriptResponse.text();
    const modules = content.match(/\.exports="(?<modules>\*.+)"/)?.groups?.modules;
    if (!modules) throw new Error('Acknowledgements modules were not found');
    return modules.replaceAll('* ', '- ').replaceAll('\\n', '\n');
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
