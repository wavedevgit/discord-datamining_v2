import { isDeepStrictEqual } from 'node:util';

import { configExperimentCentral, configWumpusUniv } from '../config.js';
import { diffByKey, sendTrackerMessage, target } from '../tracker.js';
import { DiscordEmbed, JsonObject, JsonValue } from '../types.js';

const MERCH_URL =
    'https://discordmerch.com/collections/all/products.json?limit=250';
const NOISE_KEYS = new Set(['updated_at']);
const MAX_DIFF_LENGTH = 1_024;
const MAX_VALUE_LENGTH = 220;

interface MerchProduct extends JsonObject {
    id: number;
    title: string;
    handle: string;
    vendor: string;
    product_type: string;
    tags: string[];
    variants: JsonObject[];
    images: JsonObject[];
    options: JsonObject[];
}

interface JsonChange {
    path: string;
    before: JsonValue | undefined;
    after: JsonValue | undefined;
}

function isJsonObject(value: unknown): value is JsonObject {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compareJsonIds(left: JsonObject, right: JsonObject): number {
    return String(left.id ?? '').localeCompare(String(right.id ?? ''), undefined, {
        numeric: true,
    });
}

function normalizeJson(value: JsonValue): JsonValue {
    if (Array.isArray(value)) return value.map(normalizeJson);
    if (!isJsonObject(value)) return value;

    const result: JsonObject = {};
    for (const key of Object.keys(value).sort()) {
        if (NOISE_KEYS.has(key)) continue;
        const normalized = normalizeJson(value[key]);
        result[key] =
            key === 'body_html' && typeof normalized === 'string'
                ? normalized.replace(/\r\n/g, '\n').trim()
                : normalized;
    }
    return result;
}

function normalizeIdList(record: JsonObject, key: string): void {
    const value = record[key];
    if (!Array.isArray(value)) return;
    if (!value.every((item) => typeof item === 'string' || typeof item === 'number')) {
        return;
    }
    record[key] = [...value].sort((left, right) =>
        String(left).localeCompare(String(right), undefined, { numeric: true }),
    );
}

function assertMerchProduct(value: JsonValue, index: number): asserts value is MerchProduct {
    if (
        !isJsonObject(value) ||
        typeof value.id !== 'number' ||
        typeof value.title !== 'string' ||
        typeof value.handle !== 'string' ||
        typeof value.vendor !== 'string' ||
        typeof value.product_type !== 'string' ||
        !Array.isArray(value.tags) ||
        !value.tags.every((tag) => typeof tag === 'string') ||
        !Array.isArray(value.variants) ||
        !value.variants.every(isJsonObject) ||
        !Array.isArray(value.images) ||
        !value.images.every(isJsonObject) ||
        !Array.isArray(value.options) ||
        !value.options.every(isJsonObject)
    ) {
        throw new Error(`Invalid merch product at index ${index}`);
    }
}

function normalizeProduct(value: JsonValue, index: number): MerchProduct {
    const normalized = normalizeJson(value);
    assertMerchProduct(normalized, index);

    normalized.tags = [...normalized.tags].sort((left, right) =>
        left.localeCompare(right),
    );
    normalized.variants = [...normalized.variants].sort(compareJsonIds);
    normalized.images = [...normalized.images]
        .map((image) => {
            normalizeIdList(image, 'variant_ids');
            return image;
        })
        .sort(compareJsonIds);
    normalized.options = [...normalized.options].sort((left, right) =>
        Number(left.position ?? 0) - Number(right.position ?? 0),
    );
    return normalized;
}

function normalizeProducts(values: JsonValue[]): MerchProduct[] {
    const products = values.map(normalizeProduct).sort(compareJsonIds);
    const ids = new Set<number>();
    for (const product of products) {
        if (ids.has(product.id)) throw new Error(`Duplicate merch product ID: ${product.id}`);
        ids.add(product.id);
    }
    return products;
}

async function getMerch(): Promise<MerchProduct[]> {
    const response = await fetch(MERCH_URL, {
        headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Failed to fetch merch: HTTP ${response.status}`);

    const payload = (await response.json()) as unknown;
    if (!isJsonObject(payload) || !Array.isArray(payload.products)) {
        throw new Error('Merch response did not contain a products array');
    }
    if (!payload.products.length) throw new Error('Merch response returned no products');
    return normalizeProducts(payload.products);
}

function objectPath(parent: string, key: string): string {
    if (!parent) return key;
    return /^[A-Za-z_$][\w$]*$/.test(key)
        ? `${parent}.${key}`
        : `${parent}[${JSON.stringify(key)}]`;
}

function diffJson(
    before: JsonValue | undefined,
    after: JsonValue | undefined,
    path = '',
): JsonChange[] {
    if (isDeepStrictEqual(before, after)) return [];

    if (Array.isArray(before) && Array.isArray(after)) {
        const changes: JsonChange[] = [];
        for (let index = 0; index < Math.max(before.length, after.length); index++) {
            changes.push(...diffJson(before[index], after[index], `${path}[${index}]`));
        }
        return changes;
    }

    if (isJsonObject(before) && isJsonObject(after)) {
        const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
        return [...keys]
            .sort()
            .flatMap((key) => diffJson(before[key], after[key], objectPath(path, key)));
    }

    return [{ path: path || '(root)', before, after }];
}

function truncate(value: string, limit: number): string {
    return value.length <= limit ? value : `${value.slice(0, limit - 3)}...`;
}

function formatJsonValue(value: JsonValue | undefined): string {
    if (value === undefined) return '(missing)';
    const serialized =
        typeof value === 'string'
            ? value.replace(/\s+/g, ' ').trim() || '""'
            : JSON.stringify(value);
    return truncate(serialized.replace(/```/g, '``\u200b`'), MAX_VALUE_LENGTH);
}

function formatChange(change: JsonChange): string {
    return [
        change.path,
        `- ${formatJsonValue(change.before)}`,
        `+ ${formatJsonValue(change.after)}`,
    ].join('\n');
}

function formatJsonDiff(changes: readonly JsonChange[]): string {
    if (!changes.length) return 'No meaningful changes.';

    const blocks: string[] = [];
    for (let index = 0; index < changes.length; index++) {
        const block = formatChange(changes[index]);
        const remaining = changes.length - index - 1;
        const suffix = remaining ? `\n# ${remaining} more change${remaining === 1 ? '' : 's'}` : '';
        const candidate = `\`\`\`diff\n${[...blocks, block].join('\n\n')}${suffix}\n\`\`\``;
        if (candidate.length > MAX_DIFF_LENGTH) break;
        blocks.push(block);
    }

    const remaining = changes.length - blocks.length;
    const suffix = remaining ? `\n# ${remaining} more change${remaining === 1 ? '' : 's'}` : '';
    return `\`\`\`diff\n${blocks.join('\n\n')}${suffix}\n\`\`\``;
}

function productUrl(product: MerchProduct): string {
    return `https://discordmerch.com/products/${encodeURIComponent(product.handle)}`;
}

function merchEmbed(
    product: MerchProduct,
    change: 'Added' | 'Removed' | 'Updated',
    changes: JsonChange[] = [],
): DiscordEmbed {
    const firstImage = product.images
        .filter((image) => typeof image.src === 'string')
        .sort(
            (left, right) =>
                Number(left.position ?? Number.MAX_SAFE_INTEGER) -
                Number(right.position ?? Number.MAX_SAFE_INTEGER),
        )[0]?.src;
    return {
        title: product.title,
        url: productUrl(product),
        fields: [
            { name: 'Id', value: String(product.id), inline: true },
            { name: 'Handle', value: product.handle, inline: true },
            {
                name: 'Product Type',
                value: product.product_type || 'Uncategorized',
                inline: true,
            },
            ...(changes.length
                ? [{ name: 'Updates', value: formatJsonDiff(changes) }]
                : [{ name: 'Change', value: change }]),
        ],
        thumbnail: typeof firstImage === 'string' ? { url: firstImage } : undefined,
        footer: { text: `Discord Merch • ${change}` },
        color: change === 'Removed' ? 0xed4245 : change === 'Added' ? 0x57f287 : 0xfee75c,
    };
}

async function diff(before: MerchProduct[], after: MerchProduct[]): Promise<void> {
    const changes = diffByKey(before, after, ({ id }) => String(id));
    const byTitle = (left: MerchProduct, right: MerchProduct) =>
        left.title.localeCompare(right.title) || left.id - right.id;
    changes.added.sort(byTitle);
    changes.removed.sort(byTitle);
    changes.updated.sort((left, right) => byTitle(left.after, right.after));

    const embeds: DiscordEmbed[] = [
        ...changes.removed.map((product) => merchEmbed(product, 'Removed')),
        ...changes.added.map((product) => merchEmbed(product, 'Added')),
        ...changes.updated.map(({ before: previous, after: product }) =>
            merchEmbed(product, 'Updated', diffJson(previous, product))),
    ];
    if (!embeds.length) return;

    await sendTrackerMessage(
        [
            target(
                'Experiment Central merch',
                configExperimentCentral.webhooks.merch,
                configExperimentCentral.pings.merch,
            ),
            target(
                'Wumpus University merch',
                configWumpusUniv.webhooks.merch,
                configWumpusUniv.pings.merch,
            ),
        ],
        { embeds },
    );
}

export default { getMerch, diff };
export { diffJson, formatJsonDiff, normalizeProducts };
export type { JsonChange, MerchProduct };
