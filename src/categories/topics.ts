import { load } from 'cheerio';

import { configExperimentCentral } from '../config.js';
import { sendTrackerMessage, target } from '../tracker.js';

const SITEMAP_INDEX = 'https://discord.com/topics/topics-sitemap-index.xml';
const MAX_XML_BYTES = 12_000_000;
// ponytail: 32 shards and 250k topic URLs; raise limits or stream if the published sitemap outgrows them.
const MAX_SHARDS = 32;
const MAX_TOPICS = 250_000;
const MAX_INLINE_DIFF = 1_400;

type TopicsSnapshot = Record<string, string>;

async function fetchXml(url: string): Promise<string> {
    const response = await fetch(url, { signal: AbortSignal.timeout(45_000) });
    if (!response.ok)
        throw new Error(`Topics sitemap: HTTP ${response.status} for ${url}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error(`Topics sitemap: empty response for ${url}`);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_XML_BYTES)
                throw new Error(
                    `Topics sitemap: response too large for ${url}`,
                );
            chunks.push(value);
        }
    } finally {
        await reader.cancel();
    }
    return Buffer.concat(chunks).toString('utf8');
}

function parseSitemap(
    xml: string,
    index: boolean,
): Array<{ url: string; lastmod: string }> {
    const root = index ? 'sitemapindex' : 'urlset';
    const entry = index ? 'sitemap' : 'url';
    if (
        !xml.trimEnd().endsWith(`</${root}>`) ||
        /<!DOCTYPE|<!ENTITY/i.test(xml)
    ) {
        throw new Error(`Topics sitemap: invalid or truncated ${root}`);
    }
    const $ = load(xml, { xmlMode: true });
    const container = $.root().children();
    if (container.length !== 1 || !container.is(root))
        throw new Error(`Topics sitemap: expected ${root}`);
    const entries = container.children();
    const limit = index ? MAX_SHARDS : MAX_TOPICS;
    if (
        !entries.length ||
        entries.length > limit ||
        entries.not(entry).length
    ) {
        throw new Error(`Topics sitemap: invalid ${entry} count`);
    }
    return entries.toArray().map((element) => {
        const row = $(element);
        if (
            row.children('loc').length !== 1 ||
            row.children('lastmod').length > 1
        ) {
            throw new Error('Topics sitemap: invalid entry');
        }
        const url = row.children('loc').text().trim();
        const parsed = new URL(url);
        const validPath = index
            ? /^\/topics\/topics-sitemap[^/]*\.xml$/
            : /^\/topics\/\d+(?:\/\d+)?$/;
        if (
            parsed.origin !== 'https://discord.com' ||
            parsed.search ||
            parsed.hash ||
            parsed.username ||
            parsed.password ||
            !validPath.test(parsed.pathname)
        ) {
            throw new Error(`Topics sitemap: unexpected URL ${url}`);
        }
        const lastmod = row.children('lastmod').text().trim();
        if (
            lastmod &&
            (!/^\d{4}-\d{2}-\d{2}(?:T[0-9:.+-]+Z?)?$/.test(lastmod) ||
                !Number.isFinite(Date.parse(lastmod)))
        ) {
            throw new Error(`Topics sitemap: invalid lastmod for ${url}`);
        }
        return { url, lastmod };
    });
}

async function getTopics(): Promise<TopicsSnapshot> {
    const children = [
        ...new Set(
            parseSitemap(await fetchXml(SITEMAP_INDEX), true).map(
                ({ url }) => url,
            ),
        ),
    ].sort();
    const snapshot: TopicsSnapshot = {};
    let count = 0;
    // Shards may change anywhere, not just at the end; never reuse a shard based on its position.
    for (const child of children) {
        for (const { url, lastmod } of parseSitemap(
            await fetchXml(child),
            false,
        )) {
            if (Object.hasOwn(snapshot, url)) {
                if (snapshot[url] !== lastmod)
                    throw new Error(
                        `Topics sitemap: conflicting duplicates for ${url}`,
                    );
                continue;
            }
            if (++count > MAX_TOPICS)
                throw new Error('Topics sitemap: too many topic URLs');
            snapshot[url] = lastmod;
        }
    }
    return Object.fromEntries(
        Object.entries(snapshot).sort(([a], [b]) => a.localeCompare(b)),
    );
}

function diffSnapshots(
    before: TopicsSnapshot,
    after: TopicsSnapshot,
): string | undefined {
    const added: string[] = [];
    const removed: string[] = [];
    const updated: string[] = [];
    for (const url of Object.keys(before).sort()) {
        if (!Object.hasOwn(after, url)) removed.push(`- ${url}`);
        else if (before[url] !== after[url]) {
            updated.push(
                `- ${url} lastmod=${before[url] || '(none)'}`,
                `+ ${url} lastmod=${after[url] || '(none)'}`,
            );
        }
    }
    for (const url of Object.keys(after).sort()) {
        if (!Object.hasOwn(before, url)) added.push(`+ ${url}`);
    }
    if (!added.length && !removed.length && !updated.length) return;
    const summary = `Topics sitemap changed: +${added.length} / -${removed.length} / ${updated.length / 2} lastmod updates`;
    const patch = [...removed, ...added, ...updated].join('\n');
    return patch.length <= MAX_INLINE_DIFF
        ? `${summary}\n\`\`\`diff\n${patch}\n\`\`\``
        : `${summary}\nFull changes in the data commit.`;
}

async function diff(
    before: TopicsSnapshot,
    after: TopicsSnapshot,
): Promise<void> {
    const content = diffSnapshots(before, after);
    if (!content) return;
    await sendTrackerMessage(
        [
            target(
                'Experiment Central topics sitemap',
                configExperimentCentral.webhooks.robots,
                configExperimentCentral.pings.robots,
            ),
        ],
        { content },
    );
}

export { parseSitemap, diffSnapshots };
export type { TopicsSnapshot };
export default { getTopics, diff };
