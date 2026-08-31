import { configExperimentCentral, configWumpusUniv } from '../config.js';
import { changedKeys, diffByKey, sendTrackerMessage, target } from '../tracker.js';
import { DiscordEmbed } from '../types.js';

const POWERUPS_URL =
    'https://raw.githubusercontent.com/Wumpus-Central/discord-mobile-datamining/refs/heads/main/discord_common/js/shared/shared-constants/Powerups.tsx';

interface Powerup extends Record<string, unknown> {
    name: string;
    sku_id: string;
}

function parsePowerups(text: string): Powerup[] {
    return [...text.matchAll(/export const (\w+) = ["'](\d+)["'];/g)].map((match) => ({
        name: match[1],
        sku_id: match[2],
    }));
}

async function getPowerups(): Promise<Powerup[]> {
    const response = await fetch(POWERUPS_URL);
    if (!response.ok) throw new Error(`Failed to fetch powerups: HTTP ${response.status}`);
    const text = await response.text();
    const powerups = parsePowerups(text);
    if (!powerups.length) throw new Error('Powerup parser returned no entries');
    return powerups;
}

function powerupEmbed(
    powerup: Powerup,
    change: 'Added' | 'Removed' | 'Updated',
    changes: string[] = [],
): DiscordEmbed {
    return {
        title: `Powerups - ${change}`,
        fields: [
            { name: 'Name', value: powerup.name, inline: true },
            { name: 'SKU ID', value: powerup.sku_id, inline: true },
            {
                name: 'View SKU',
                value: `[view sku](https://canary.discord.com/api/v9/store/published-listings/skus/${powerup.sku_id}?country_code=US&variants_return_style=2)`,
                inline: true,
            },
            ...(changes.length
                ? [{ name: 'Changed fields', value: changes.join(', ') }]
                : []),
        ],
        color: change === 'Removed' ? 0xff0000 : change === 'Added' ? 0x008000 : 0xffa500,
    };
}

async function diff(before: Powerup[], after: Powerup[]): Promise<void> {
    const changes = diffByKey(before, after, ({ sku_id }) => sku_id);
    const byName = (left: Powerup, right: Powerup) => left.name.localeCompare(right.name);
    changes.added.sort(byName);
    changes.removed.sort(byName);
    const embeds: DiscordEmbed[] = [
        ...changes.removed.map((powerup) => powerupEmbed(powerup, 'Removed')),
        ...changes.added.map((powerup) => powerupEmbed(powerup, 'Added')),
        ...changes.updated.map(({ before: previous, after: powerup }) =>
            powerupEmbed(powerup, 'Updated', changedKeys(previous, powerup))),
    ];
    if (!embeds.length) return;
    await sendTrackerMessage(
        [
            target(
                'Experiment Central powerups',
                configExperimentCentral.webhooks.powerups,
                configExperimentCentral.pings.powerups,
            ),
            target(
                'Wumpus University powerups',
                configWumpusUniv.webhooks.powerups,
                configWumpusUniv.pings.powerups,
            ),
        ],
        { embeds },
    );
}

export default { getPowerups, diff };
export { parsePowerups };
export type { Powerup };
