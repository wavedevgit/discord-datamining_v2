import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { notification, toMarkdown } from './policies.js';

const paragraph = 'This policy applies to the use of Discord services and describes the rights and responsibilities of everyone using those services.';

test('policies preserve headings, paragraphs and absolute links without navigation or scripts', () => {
    const html = `<nav>Navigation noise</nav><main><h1>Terms</h1><p>${paragraph}</p>
        <a href="/privacy">Privacy</a><script>noise</script><footer>footer noise</footer></main>`;
    const md = toMarkdown(html, 'terms', 'Terms of Service');
    assert.match(md, /# Terms\n/);
    assert.match(md, /\[Privacy\]\(https:\/\/discord.com\/privacy\)/);
    assert.doesNotMatch(md, /noise/);
    assert.equal(md, toMarkdown(html.replace('noise', 'other noise'), 'terms', 'Terms of Service'));
});

test('policies reject challenge pages and empty bodies', () => {
    assert.throws(() => toMarkdown('<html><body>Just a moment</body></html>', 'terms', 'Terms'));
    assert.throws(() => toMarkdown('<main><h1>Terms</h1></main>', 'terms', 'Terms'));
});

test('policies extract historical Webflow layouts without a main element', () => {
    const md = toMarkdown(`<div class="section-rich"><h1>Terms</h1><p>${paragraph}</p></div>
        <footer>Unrelated links</footer>`, 'terms', 'Terms');
    assert.match(md, /rights and responsibilities/);
    assert.doesNotMatch(md, /Unrelated links/);
});

test('policy markdown canonicalizes archive links and excludes hidden sections', () => {
    const md = toMarkdown(`<main><h1>Privacy</h1><p>${paragraph}</p>
        <a href="https://web.archive.org/web/20250101000000/https://discord.com/terms">Terms</a>
        <p class="w-condition-invisible">invisible</p></main>`, 'privacy', 'Privacy');
    assert.match(md, /\[Terms\]\(https:\/\/discord.com\/terms\)/);
    assert.doesNotMatch(md, /web\.archive|invisible/);
});

test('policy notifications use ordered diffs including repeated lines', () => {
    const msg = notification({ slug: 'terms', before: 'first\nrepeat\nrepeat\n', after: 'repeat\nfirst\n' });
    assert.match(msg, /```diff/);
    assert.match(msg, /-repeat/);
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

test('policies bootstrap archives once, save Markdown, and preserve failed pages', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'policies-test-'));
    try {
        const moduleUrl = new URL('./policies.js', import.meta.url).href;
        const code = `
            import assert from 'node:assert/strict';
            import { readFile } from 'node:fs/promises';
            const policies = (await import(${JSON.stringify(moduleUrl)})).default;
            let archiveRequests = 0;
            let failTerms = false;
            globalThis.fetch = async (url) => {
                url = String(url);
                if (url.includes('/cdx/')) {
                    archiveRequests++;
                    return new Response(JSON.stringify([['timestamp','original'],
                        ['20250101000000','https://discord.com/'+new URL(url).searchParams.get('url').split('/').pop()]]));
                }
                if (failTerms && url === 'https://discord.com/terms') return new Response('', {status:503});
                if (url.includes('/assets/')) return new Response('module.exports="* [Library](https://example.com/library)";');
                if (url.endsWith('/acknowledgements')) return new Response('<script data-chunk="Acknowledgements" src="/assets/a.js"></script>');
                const archived = url.includes('web.archive.org');
                const body = ${JSON.stringify(paragraph)} + (archived ? ' Previous version.' : ' Current version.');
                return new Response('<main><h1>Document</h1><p>'+body+'</p></main>');
            };
            const first = await policies.getPolicies();
            assert.equal(first.length, 5);
            assert.equal(archiveRequests, 6);
            assert.ok(first.every(c => c.archiveUrl));
            const terms = await readFile(process.env.DATA_DIR+'/policies/terms.md','utf8');
            failTerms = true;
            assert.deepEqual(await policies.getPolicies(), []);
            assert.equal(archiveRequests, 6);
            assert.equal(await readFile(process.env.DATA_DIR+'/policies/terms.md','utf8'), terms);
        `;
        const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
            env: { ...process.env, DATA_DIR: dir, POLICIES_ARCHIVE_BOOTSTRAP: 'true' },
            encoding: 'utf8', timeout: 15_000,
        });
        assert.equal(result.status, 0, result.stderr);
        assert.match(await readFile(path.join(dir, 'policies/archive/terms.md'), 'utf8'),
            /Archived source: https:\/\/web.archive.org\/web\/20250101000000id_/);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
