import { configExperimentCentral, configWumpusUniv } from '../../config.js';
import { changedKeys, diffByKey, sendTrackerMessage, target } from '../../tracker.js';
import { DiscordEmbed } from '../../types.js';
import { sendReq } from '../../utils.js';
import { formatAssetUrl } from './assets.js';

interface CollectibleCategory extends Record<string, unknown> {
    sku_id: string;
    name: string;
    summary: string;
    products: unknown[];
    banner: string;
    logo: string;
    styles?: {
        button_colors?: number[];
        background_colors?: number[];
    };
}

async function getCollectiblesCategories(): Promise<CollectibleCategory[]> {
    const response = await sendReq({ url: 'collectibles-categories/v2' });
    const body = await response.json() as {
        categories?: CollectibleCategory[];
        message?: string;
    };
    if (!response.ok || !Array.isArray(body.categories) || !body.categories.length) {
        throw new Error(body.message ?? `Failed to fetch categories: HTTP ${response.status}`);
    }
    return body.categories;
}

function colors(values: number[] | undefined): string {
    return values?.map((color) => `#${color.toString(16).padStart(6, '0')}`).join(', ') || 'None';
}

function categoryEmbed(
    category: CollectibleCategory,
    change: 'Added' | 'Removed' | 'Updated',
    changes: string[] = [],
): DiscordEmbed {
    return {
        title: `Collectibles - ${change} Category`,
        fields: [
            { name: 'Name', value: category.name || 'Unnamed', inline: true },
            { name: 'SKU ID', value: category.sku_id, inline: true },
            { name: 'Products', value: String(category.products.length), inline: true },
            { name: 'Description', value: category.summary || 'None' },
            { name: 'Button Colors', value: colors(category.styles?.button_colors), inline: true },
            {
                name: 'Background Colors',
                value: colors(category.styles?.background_colors),
                inline: true,
            },
            ...(changes.length
                ? [{ name: 'Changed fields', value: changes.join(', ') }]
                : []),
        ],
        image: { url: formatAssetUrl(category.banner) },
        thumbnail: { url: formatAssetUrl(category.logo) },
        color: change === 'Removed' ? 0xff0000 : change === 'Added' ? 0x008000 : 0xffa500,
    };
}

async function diff(
    before: CollectibleCategory[],
    after: CollectibleCategory[],
): Promise<void> {
    const changes = diffByKey(before, after, ({ sku_id }) => sku_id);
    const byName = (left: CollectibleCategory, right: CollectibleCategory) =>
        left.name.localeCompare(right.name);
    changes.added.sort(byName);
    changes.removed.sort(byName);
    const embeds: DiscordEmbed[] = [
        ...changes.removed.map((category) => categoryEmbed(category, 'Removed')),
        ...changes.added.map((category) => categoryEmbed(category, 'Added')),
        ...changes.updated.map(({ before: previous, after: category }) =>
            categoryEmbed(category, 'Updated', changedKeys(previous, category))),
    ];
    if (!embeds.length) return;
    await sendTrackerMessage(
        [
            target(
                'Experiment Central collectible categories',
                configExperimentCentral.webhooks.collectibles?.categories,
                configExperimentCentral.pings.collectibles?.categories,
            ),
            target(
                'Wumpus University collectible categories',
                configWumpusUniv.webhooks.collectibles?.categories,
                configWumpusUniv.pings.collectibles?.categories,
            ),
        ],
        { embeds },
    );
}

export default { getCollectiblesCategories, diff };
export type { CollectibleCategory };
