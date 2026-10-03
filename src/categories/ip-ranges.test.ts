import assert from 'node:assert/strict';
import test from 'node:test';

import {
    formatIpRangesNotification,
    normalizeIpRanges,
} from './ip-ranges.js';

const base = {
    creationTime: '2026-08-04T18:01:19Z',
    syncToken: '4ce19406',
    notes: 'discord egress',
    prefixes: [
        { ipv4Prefix: '35.190.130.193/32', services: ['media', 'api', 'api'] },
        { ipv6Prefix: '2600:1900::/48', services: ['media'] },
    ],
};

test('normalizeIpRanges canonicalizes prefixes and services', () => {
    const normalized = normalizeIpRanges(base);

    assert.deepEqual(normalized.prefixes, [
        { ipv4Prefix: '35.190.130.193/32', services: ['api', 'media'] },
        { ipv6Prefix: '2600:1900::/48', services: ['media'] },
    ]);
});

test('normalizeIpRanges merges duplicate CIDRs', () => {
    const normalized = normalizeIpRanges({
        ...base,
        prefixes: [
            { ipv4Prefix: '35.190.130.193/32', services: ['api'] },
            { ipv4Prefix: '35.190.130.193/32', services: ['media'] },
        ],
    });

    assert.deepEqual(normalized.prefixes, [
        { ipv4Prefix: '35.190.130.193/32', services: ['api', 'media'] },
    ]);
});

test('normalizeIpRanges rejects invalid or empty payloads', () => {
    assert.throws(() => normalizeIpRanges({ ...base, prefixes: [] }), /no prefixes/);
    assert.throws(
        () => normalizeIpRanges({
            ...base,
            prefixes: [{ ipv4Prefix: '999.1.1.1/32', services: ['api'] }],
        }),
        /Invalid IPv4 prefix/,
    );
});

test('IP range notifications track tokens and prefix changes', () => {
    const notification = formatIpRangesNotification(
        normalizeIpRanges(base),
        normalizeIpRanges({
            ...base,
            creationTime: '2026-08-05T18:01:19Z',
            syncToken: '4ce19407',
            prefixes: [
                { ipv4Prefix: '35.190.130.193/32', services: ['api'] },
                { ipv4Prefix: '34.138.218.50/32', services: ['api'] },
            ],
        }),
    );

    assert.match(notification ?? '', /4ce19406.*4ce19407/);
    assert.match(notification ?? '', /- 2600:1900::\/48 — media/);
    assert.match(notification ?? '', /- 35.190.130.193\/32 — api, media/);
    assert.match(notification ?? '', /\+ 34.138.218.50\/32 — api/);
    assert.match(notification ?? '', /\+ 35.190.130.193\/32 — api/);
});

test('IP range notifications ignore response reordering', () => {
    const before = normalizeIpRanges(base);
    const after = normalizeIpRanges({
        ...base,
        prefixes: [...base.prefixes].reverse(),
    });

    assert.equal(formatIpRangesNotification(before, after), undefined);
});

test('IP range notifications report sync-token-only changes', () => {
    const before = normalizeIpRanges(base);
    const after = normalizeIpRanges({ ...base, syncToken: '4ce19407' });

    assert.equal(
        formatIpRangesNotification(before, after),
        '**Discord IP ranges updated**\n**Sync token:** `4ce19406` → `4ce19407`',
    );
});
