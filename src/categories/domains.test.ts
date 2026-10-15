import assert from 'node:assert/strict';
import test from 'node:test';

import { formatDomainDiff, getDomains, parseCrtNameResponse } from './domains.js';

test('parses valid crt.name subdomains', () => {
    assert.deepEqual(
        parseCrtNameResponse(
            'devtun.to\nAlice-Workspace.devtun.to\n*.devtun.to\nother.test\n',
            'devtun.to',
        ),
        ['devtun.to', 'alice-workspace.devtun.to'],
    );
});

test('queries crt.name for devtun.to only', async () => {
    const originalFetch = globalThis.fetch;
    const urls: string[] = [];

    globalThis.fetch = (async (input: string | URL | Request) => {
        const url = input.toString();
        urls.push(url);
        if (url.includes('crt.name')) {
            return new Response('devtun.to\nalice-workspace.devtun.to\n');
        }
        return new Response('[]');
    }) as typeof fetch;

    try {
        const domains = await getDomains([]);

        assert.deepEqual(
            urls.filter((url) => url.includes('crt.name')),
            ['https://crt.name/v1/search?apex=devtun.to'],
        );
        assert.ok(domains.includes('alice-workspace.devtun.to'));
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('caps large domain diffs behind a summary', () => {
    const added = Array.from({ length: 500 }, (_, index) => `h${index}.discord.gg`);
    const content = formatDomainDiff(added, []);

    assert.match(content ?? '', /^Domains changed: \+500 \/ -0/);
    assert.equal(content?.match(/^\+ /gm)?.length, 50);

    assert.equal(formatDomainDiff([], []), undefined);
});
