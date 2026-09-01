import assert from 'node:assert/strict';
import test from 'node:test';

import { changedKeys, diffByKey, diffLines, formatTextDiff } from './tracker.js';
import { parsePowerups } from './categories/powerups.js';
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
