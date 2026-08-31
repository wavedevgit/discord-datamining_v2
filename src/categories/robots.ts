import { configExperimentCentral, configWumpusUniv } from '../config.js';
import { diffLines, formatTextDiff, sendTrackerMessage, target } from '../tracker.js';

async function getRobots(url = 'https://discord.com/robots.txt'): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch robots.txt: HTTP ${response.status}`);
    return (await response.text()).trim();
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
