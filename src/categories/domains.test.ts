import assert from 'node:assert/strict';
import test from 'node:test';

import { findSubdomainsCrtSh, parseCrtNameResponse } from './domains.js';

test('parses valid crt.name subdomains', () => {
    assert.deepEqual(
        parseCrtNameResponse(
            'devtun.to\nAlice-Workspace.devtun.to\n*.devtun.to\nother.test\n',
            'devtun.to',
        ),
        ['devtun.to', 'alice-workspace.devtun.to'],
    );
});

test('uses crt.name only when crt.sh times out', async () => {
    const originalFetch = globalThis.fetch;
    const urls: string[] = [];

    globalThis.fetch = (async (input: string | URL | Request) => {
        urls.push(input.toString());
        if (urls.length === 1) throw new DOMException('timed out', 'TimeoutError');
        return new Response('devtun.to\nalice-workspace.devtun.to\n');
    }) as typeof fetch;

    try {
        assert.deepEqual(await findSubdomainsCrtSh('devtun.to'), [
            'devtun.to',
            'alice-workspace.devtun.to',
        ]);
        assert.deepEqual(urls, [
            'https://crt.sh/?q=%25.devtun.to&output=json',
            'https://crt.name/v1/search?apex=devtun.to',
        ]);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
