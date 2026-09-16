import assert from 'node:assert/strict';
import test from 'node:test';

import { changedKeys, diffByKey, diffLines, formatTextDiff } from './tracker.js';
import {
    diffJson,
    formatJsonDiff,
    normalizeProducts,
} from './categories/merch.js';
import { parsePowerups } from './categories/powerups.js';
import { categoryForNotification } from './categories/collectibles/categories.js';
import { normalizeFeatureLists } from './categories/skus.js';

test('diffByKey ignores reordering and reports entity changes', () => {
    const before = [
        { id: '1', name: 'one' },
        { id: '2', name: 'two' },
        { id: '3', name: 'three' },
    ];
    const after = [
        { id: '3', name: 'three' },
        { id: '2', name: 'updated' },
        { id: '4', name: 'four' },
    ];

    const result = diffByKey(before, after, ({ id }) => id);

    assert.deepEqual(result.added, [{ id: '4', name: 'four' }]);
    assert.deepEqual(result.removed, [{ id: '1', name: 'one' }]);
    assert.deepEqual(result.updated, [
        {
            before: { id: '2', name: 'two' },
            after: { id: '2', name: 'updated' },
        },
    ]);
    assert.deepEqual(changedKeys(result.updated[0].before, result.updated[0].after), [
        'name',
    ]);
});

test('diffLines treats an inserted line as one addition instead of positional updates', () => {
    const result = diffLines('alpha\nbeta\ngamma', 'new\nalpha\nbeta\ngamma');
    assert.deepEqual(result, { added: ['new'], removed: [] });
    assert.match(formatTextDiff(result) ?? '', /^```diff\n# Added \(1\)\n\+ new\n```$/);
});

test('diffByKey rejects ambiguous duplicate keys', () => {
    assert.throws(
        () => diffByKey([{ id: '1' }, { id: '1' }], [], ({ id }) => id),
        /Duplicate tracker key: 1/,
    );
});

test('collectible notifications ignore localized prices and product order', () => {
    const before = {
        sku_id: 'category',
        products: [
            { sku_id: 'b', name: 'B', prices: { country_code: 'CL' } },
            { sku_id: 'a', name: 'A', prices: { country_code: 'CL' } },
        ],
    };
    const after = {
        sku_id: 'category',
        products: [
            { sku_id: 'a', name: 'A', prices: { country_code: 'US' } },
            { sku_id: 'b', name: 'B', prices: { country_code: 'US' } },
        ],
    };
    const normalizedBefore = categoryForNotification(before);
    assert.deepEqual(normalizedBefore, categoryForNotification(after));
    assert.equal(before.products[0].sku_id, 'b');
    after.products[0].name = 'Changed';
    assert.notDeepEqual(normalizedBefore, categoryForNotification(after));
});

test('parsePowerups reads exported mobile constants without shifting SKU IDs', () => {
    const source = [
        'export const VANITY_URL_POWERUP_SKU_ID = "1387197800336330924";',
        "export const GUILD_POWERUP_LEVEL_1_SKU_ID = '1341586379779604621';",
    ].join('\n');

    assert.deepEqual(parsePowerups(source), [
        { name: 'VANITY_URL_POWERUP_SKU_ID', sku_id: '1387197800336330924' },
        { name: 'GUILD_POWERUP_LEVEL_1_SKU_ID', sku_id: '1341586379779604621' },
    ]);
});

test('normalizeFeatureLists ignores unordered SKU feature lists', () => {
    const listing = {
        guild_features: { features: ['ROLE_ICONS', 'BANNER', 'ANIMATED_ICON'] },
    };

    normalizeFeatureLists(listing);

    assert.deepEqual(listing.guild_features.features, [
        'ANIMATED_ICON',
        'BANNER',
        'ROLE_ICONS',
    ]);
});

test('normalizeProducts removes merch noise and canonicalizes unordered data', () => {
    const product = {
        id: 2,
        title: 'Hoodie',
        handle: 'hoodie',
        vendor: 'Discord',
        product_type: 'Outerwear',
        updated_at: '2026-01-01',
        tags: ['new', 'Outerwear'],
        variants: [
            { id: 20, title: 'Large', updated_at: '2026-01-01' },
            { id: 10, title: 'Small', updated_at: '2026-01-01' },
        ],
        images: [
            { id: 2, src: 'two.png', variant_ids: [20, 10], updated_at: 'noise' },
            { id: 1, src: 'one.png', variant_ids: [] },
        ],
        options: [],
    };

    const [normalized] = normalizeProducts([product]);

    assert.equal(normalized.updated_at, undefined);
    assert.deepEqual(normalized.tags, ['new', 'Outerwear']);
    assert.deepEqual(normalized.variants.map(({ id }) => id), [10, 20]);
    assert.deepEqual(normalized.images.map(({ id }) => id), [1, 2]);
    assert.deepEqual(normalized.images[1].variant_ids, [10, 20]);
    assert.equal(normalized.variants[0].updated_at, undefined);
});

test('diffJson formats nested merch changes as object paths', () => {
    const changes = diffJson(
        { variants: [{ id: 10, available: false }], tags: ['Outerwear'] },
        { variants: [{ id: 10, available: true }], tags: ['Outerwear', 'new'] },
    );

    assert.deepEqual(changes, [
        { path: 'tags[1]', before: undefined, after: 'new' },
        { path: 'variants[0].available', before: false, after: true },
    ]);
    assert.equal(
        formatJsonDiff(changes),
        [
            '```diff',
            'tags[1]',
            '- (missing)',
            '+ new',
            '',
            'variants[0].available',
            '- false',
            '+ true',
            '```',
        ].join('\n'),
    );
});
