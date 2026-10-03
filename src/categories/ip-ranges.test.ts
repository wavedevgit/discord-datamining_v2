import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeIpRanges } from './ip-ranges.js';

const metadata = {
    creationTime: '2026-08-04T18:01:19Z',
    syncToken: '4ce19406',
    notes: 'discord egress',
};

test('merges duplicate CIDRs and canonicalizes reordered services', () => {
    const normalized = normalizeIpRanges({
        ...metadata,
        prefixes: [
            { ipv4Prefix: '35.190.130.193/32', services: ['media', 'api', 'api'] },
            { ipv4Prefix: '35.190.130.193/32', services: ['voice', 'media'] },
        ],
    });

    assert.deepEqual(normalized.prefixes, [
        {
            ipv4Prefix: '35.190.130.193/32',
            services: ['api', 'media', 'voice'],
        },
    ]);
});

test('accepts IPv6 boundary masks and rejects invalid address-family combinations', () => {
    assert.deepEqual(
        normalizeIpRanges({
            ...metadata,
            prefixes: [{ ipv6Prefix: '2600:1900::/128', services: ['media'] }],
        }).prefixes,
        [{ ipv6Prefix: '2600:1900::/128', services: ['media'] }],
    );

    assert.throws(
        () => normalizeIpRanges({
            ...metadata,
            prefixes: [{
                ipv4Prefix: '35.190.130.193/32',
                ipv6Prefix: '2600:1900::/48',
                services: ['api'],
            }],
        }),
        /exactly one CIDR/,
    );
    assert.throws(
        () => normalizeIpRanges({
            ...metadata,
            prefixes: [{ ipv6Prefix: '2600:1900::/129', services: ['media'] }],
        }),
        /Invalid IPv6 prefix/,
    );
});

test('rejects malformed responses instead of replacing the stored snapshot', () => {
    assert.throws(
        () => normalizeIpRanges({ ...metadata, prefixes: [] }),
        /no prefixes/,
    );
    assert.throws(
        () => normalizeIpRanges({
            ...metadata,
            prefixes: [{ ipv4Prefix: '999.1.1.1/32', services: ['api'] }],
        }),
        /Invalid IPv4 prefix/,
    );
    assert.throws(
        () => normalizeIpRanges({
            ...metadata,
            prefixes: [{ ipv4Prefix: '35.190.130.193/32', services: [''] }],
        }),
        /Invalid services/,
    );
});
