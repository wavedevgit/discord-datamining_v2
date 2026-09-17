import assert from 'node:assert/strict';
import test from 'node:test';

import { compareServers, formatServer, serverEntry } from './servers.js';

test('parses legacy and id-prefixed server lines', () => {
    const url = 'https://discord.com/servers/example-123456789012345678';
    assert.deepEqual(serverEntry(url), { id: '123456789012345678', url });
    assert.deepEqual(serverEntry(`123456789012345678 ${url}`), {
        id: '123456789012345678',
        url,
    });
    assert.equal(formatServer({ id: '123456789012345678', url }), `123456789012345678 ${url}`);
});

test('parses server URLs whose slug is empty', () => {
    const url = 'https://discord.com/servers/-1152768388393881600';
    assert.deepEqual(serverEntry(url), { id: '1152768388393881600', url });
});

test('sorts snowflakes numerically without losing precision', () => {
    const lines = [
        '1000000000000000000 https://discord.com/servers/third-1000000000000000000',
        '999999999999999999 https://discord.com/servers/second-999999999999999999',
        '55294077867917312 https://discord.com/servers/first-55294077867917312',
    ];

    assert.deepEqual([...lines].sort(compareServers), [lines[2], lines[1], lines[0]]);
});
