import assert from 'node:assert/strict';
import test from 'node:test';

import { parseCrtNameResponse } from './domains.js';

test('parses valid crt.name subdomains', () => {
    assert.deepEqual(
        parseCrtNameResponse(
            'devtun.to\nAlice-Workspace.devtun.to\n*.devtun.to\nother.test\n',
            'devtun.to',
        ),
        ['devtun.to', 'alice-workspace.devtun.to'],
    );
});
