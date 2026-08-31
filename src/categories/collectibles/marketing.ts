import { configExperimentCentral, configWumpusUniv } from '../../config.js';
import { changedKeys, diffByKey, sendTrackerMessage, target } from '../../tracker.js';
import { DiscordEmbed } from '../../types.js';
import { sendReq } from '../../utils.js';

interface Marketing extends Record<string, unknown> {
    tracker_id: string;
    type: number;
    version: number;
    title: string;
    body?: string;
    asset?: string;
}

type MarketingCollection = Record<string, Omit<Marketing, 'tracker_id'>>;

function normalizeMarketing(value: MarketingCollection): Marketing[] {
    return Object.entries(value).map(
        ([trackerId, marketing]) => ({
            ...marketing,
            tracker_id: trackerId,
        }) as Marketing,
    );
}

async function getMarketing(): Promise<MarketingCollection> {
    const response = await sendReq({
        url: 'users/@me/collectibles-marketing?platform=0',
    });
    const body = await response.json() as {
        marketings?: MarketingCollection;
        message?: string;
    };
    if (!response.ok || !body.marketings || typeof body.marketings !== 'object') {
        throw new Error(body.message ?? `Failed to fetch marketing: HTTP ${response.status}`);
    }
    return body.marketings;
}

function marketingEmbed(
    marketing: Marketing,
    change: 'Added' | 'Removed' | 'Updated',
    changes: string[] = [],
): DiscordEmbed {
    return {
        title: `Collectibles Marketing - ${change}`,
        description: marketing.body || 'No body',
        fields: [
            { name: 'Title', value: marketing.title || 'Untitled', inline: true },
            { name: 'Type', value: String(marketing.type), inline: true },
            { name: 'Version', value: String(marketing.version), inline: true },
            ...(changes.length
                ? [{ name: 'Changed fields', value: changes.join(', ') }]
                : []),
        ],
        image: marketing.asset ? { url: marketing.asset } : undefined,
        color: change === 'Removed' ? 0xff0000 : change === 'Added' ? 0x008000 : 0xffa500,
    };
}

async function diff(
    before: MarketingCollection,
    after: MarketingCollection,
): Promise<void> {
    const changes = diffByKey(
        normalizeMarketing(before),
        normalizeMarketing(after),
        ({ tracker_id }) => tracker_id,
    );
    const embeds: DiscordEmbed[] = [
        ...changes.removed.map((marketing) => marketingEmbed(marketing, 'Removed')),
        ...changes.added.map((marketing) => marketingEmbed(marketing, 'Added')),
        ...changes.updated.map(({ before: previous, after: marketing }) =>
            marketingEmbed(marketing, 'Updated', changedKeys(previous, marketing))),
    ];
    if (!embeds.length) return;
    await sendTrackerMessage(
        [
            target(
                'Experiment Central collectibles marketing',
                configExperimentCentral.webhooks.collectibles?.categories,
                configExperimentCentral.pings.collectibles?.categories,
            ),
            target(
                'Wumpus University collectibles marketing',
                configWumpusUniv.webhooks.collectibles?.categories,
                configWumpusUniv.pings.collectibles?.categories,
            ),
        ],
        { embeds },
    );
}

export default { getMarketing, diff };
export type { MarketingCollection };
