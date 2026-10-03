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

// Prices are localized to the request's country, which can change between runs.
// Product and bundle order is also unstable in the API response.
function categoryForNotification(value: unknown, parentKey = ''): unknown {
    if (Array.isArray(value)) {
        const items = value.map((item) => categoryForNotification(item));
        if (['products', 'bundled_products', 'items'].includes(parentKey)) {
            items.sort((left, right) =>
                String((left as CollectibleCategory).sku_id).localeCompare(
                    String((right as CollectibleCategory).sku_id),
                ),
            );
        }
        return items;
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).filter(([key]) => key !== 'prices').map(
                ([key, item]) => [key, categoryForNotification(item, key)],
            ),
        );
    }
    return value;
}

function normalizeCollectibleCategories(categories: CollectibleCategory[]): CollectibleCategory[] {
    const cloned = JSON.parse(JSON.stringify(categories)) as CollectibleCategory[];
    const sorted = cloned.sort((a, b) => a.sku_id.localeCompare(b.sku_id));
    for (const category of sorted) {
        if (Array.isArray((category as any).products)) {
            const products = (category as any).products as Array<Record<string, unknown>>;
            products.sort((a, b) => String((a as any).sku_id).localeCompare(String((b as any).sku_id)));
            for (const product of products) {
                const styles = (product as any).styles;
                if (styles) {
                    if (Array.isArray(styles.button_colors)) styles.button_colors.sort((a: number, b: number) => a - b);
                    if (Array.isArray(styles.background_colors)) styles.background_colors.sort((a: number, b: number) => a - b);
                    if (Array.isArray(styles.confetti_colors)) styles.confetti_colors.sort((a: number, b: number) => a - b);
                }
                if (Array.isArray((product as any).items)) {
                    (product as any).items.sort((a: any, b: any) => String(a.sku_id).localeCompare(String(b.sku_id)));
                }
                if (Array.isArray((product as any).bundled_products)) {
                    (product as any).bundled_products.sort((a: any, b: any) => String(a.sku_id).localeCompare(String(b.sku_id)));
                }
            }
        }
        const styles = (category as any).styles;
        if (styles) {
            if (Array.isArray(styles.button_colors)) styles.button_colors.sort((a: number, b: number) => a - b);
            if (Array.isArray(styles.background_colors)) styles.background_colors.sort((a: number, b: number) => a - b);
            if (Array.isArray(styles.confetti_colors)) styles.confetti_colors.sort((a: number, b: number) => a - b);
        }
    }
    return sorted;
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
    return normalizeCollectibleCategories(body.categories);
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
    const changes = diffByKey(
        normalizeCollectibleCategories([...before]).map(
            (category) => categoryForNotification(category) as CollectibleCategory,
        ),
        normalizeCollectibleCategories([...after]).map(
            (category) => categoryForNotification(category) as CollectibleCategory,
        ),
        ({ sku_id }) => sku_id,
    );
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
export { categoryForNotification };
export type { CollectibleCategory };
