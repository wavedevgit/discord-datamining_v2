import assert from 'node:assert/strict';
import test from 'node:test';

import { notification, toMarkdown } from './policies.js';

test('policies reject challenge pages and empty bodies', () => {
    assert.throws(() => toMarkdown('<html><body>Just a moment</body></html>', 'terms', 'Terms'));
    assert.throws(() => toMarkdown('<main><h1>Terms</h1></main>', 'terms', 'Terms'));
});

test('large policy diffs use a link rather than flooding the webhook', () => {
    const oldCommit = process.env.COMMIT_URL;
    try {
        process.env.COMMIT_URL = 'https://github.com/example/repo/commit/abc';
        const msg = notification({ slug: 'privacy', before: 'old', after: 'new paragraph\n'.repeat(500) });
        assert.doesNotMatch(msg, /```diff/);
        assert.match(msg, /Full diff in the data commit/);
        assert.ok(msg.length < 2_000);
    } finally {
        if (oldCommit === undefined) delete process.env.COMMIT_URL;
        else process.env.COMMIT_URL = oldCommit;
    }
});
