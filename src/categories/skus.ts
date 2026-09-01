import { configExperimentCentral, configWumpusUniv } from '../config.js';
import { changedKeys, diffByKey, sendTrackerMessage, target } from '../tracker.js';
import { DiscordEmbed } from '../types.js';

const SKU_URL = 'https://canary.discord.com/api/v9/store/published-listings/skus';

interface SkuListing extends Record<string, unknown> {
    sku: {
        id: string;
        name: string;
        application_id: string;
    };
}

function normalizeFeatureLists(value: unknown): void {
    if (Array.isArray(value)) {
        for (const item of value) normalizeFeatureLists(item);
        return;
    }
    if (!value || typeof value !== 'object') return;

    for (const [key, child] of Object.entries(value)) {
        if (key === 'features' && Array.isArray(child) && child.every((item) => typeof item === 'string')) {
            child.sort();
        } else {
            normalizeFeatureLists(child);
        }
    }
}

async function getSkus(skus: string[]): Promise<string[]> {
    const results = await Promise.all(
        skus.map(async (sku) => {
            try {
                const response = await fetch(
                    `${SKU_URL}/${sku}?country_code=US&variants_return_style=2`,
                );
                return response.status === 200 ? undefined : sku;
            } catch {
                return sku;
            }
        }),
    );
    return results.filter((sku): sku is string => sku !== undefined);
}

function skuTargets() {
    return [
        target(
            'Experiment Central SKUs',
            configExperimentCentral.webhooks.skus,
            configExperimentCentral.pings.skus,
        ),
        target(
            'Wumpus University SKUs',
            configWumpusUniv.webhooks.skus,
            configWumpusUniv.pings.skus,
        ),
    ];
}

async function diff(before: string[], after: string[]): Promise<void> {
    const afterSet = new Set(after);
    const published = before.filter((sku) => !afterSet.has(sku));
    if (!published.length) return;
    await sendTrackerMessage(skuTargets(), {
        embeds: published.map((sku): DiscordEmbed => ({
            title: 'SKU Published',
            fields: [
                { name: 'SKU ID', value: sku, inline: true },
                {
                    name: 'View SKU',
                    value: `[view sku](${SKU_URL}/${sku}?country_code=US&variants_return_style=2)`,
                    inline: true,
                },
            ],
            color: 0x008000,
        })),
    });
}

async function getSkuApps(appIds: string[]): Promise<SkuListing[]> {
    const listings = await Promise.all(
        appIds.map(async (appId) => {
            const response = await fetch(`${SKU_URL}?application_id=${appId}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch SKUs for ${appId}: HTTP ${response.status}`);
            }
            const body = await response.json() as SkuListing[];
            if (!Array.isArray(body)) throw new Error(`Invalid SKU response for ${appId}`);
            for (const listing of body) normalizeFeatureLists(listing);
            return body;
        }),
    );
    return listings.flat();
}

function listingEmbed(
    listing: SkuListing,
    change: 'Added' | 'Removed' | 'Updated',
    changes: string[] = [],
): DiscordEmbed {
    return {
        title: `SKU Listing - ${change}`,
        fields: [
            { name: 'Name', value: listing.sku.name || 'Unnamed', inline: true },
            { name: 'App ID', value: listing.sku.application_id, inline: true },
            { name: 'SKU ID', value: listing.sku.id, inline: true },
            {
                name: 'View SKU',
                value: `[view sku](${SKU_URL}/${listing.sku.id}?country_code=US&variants_return_style=2)`,
                inline: true,
            },
            ...(changes.length
                ? [{ name: 'Changed fields', value: changes.join(', ') }]
                : []),
        ],
        color: change === 'Removed' ? 0xff0000 : change === 'Added' ? 0x008000 : 0xffa500,
    };
}

async function diffSkuApps(before: SkuListing[], after: SkuListing[]): Promise<void> {
    const changes = diffByKey(before, after, ({ sku }) => sku.id);
    const embeds: DiscordEmbed[] = [
        ...changes.removed.map((listing) => listingEmbed(listing, 'Removed')),
        ...changes.added.map((listing) => listingEmbed(listing, 'Added')),
        ...changes.updated.map(({ before: previous, after: listing }) =>
            listingEmbed(listing, 'Updated', changedKeys(previous, listing))),
    ];
    if (!embeds.length) return;
    await sendTrackerMessage(skuTargets(), { embeds });
}

export default { getSkus, diff, getSkuApps, diffSkuApps };
export { normalizeFeatureLists };
export type { SkuListing };
