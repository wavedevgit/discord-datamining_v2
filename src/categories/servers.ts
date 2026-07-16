import { configExperimentCentral, configWumpusUniv } from '../config.js';
import { sendToWebhook } from '../utils.js';

const SITEMAP_INDEX = 'https://discord.com/servers/servers-sitemap-index.xml';

const MAX_DIFF_ENTRIES = 30;

async function fetchText(url: string) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed fetch ${url}: ${res.status}`);
    return (await res.text()).trim();
}

function extractLocs(xml: string): string[] {
    const matches = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)];
    return matches.map((m) => m[1]);
}

async function getChildSitemaps(): Promise<string[]> {
    const xml = await fetchText(SITEMAP_INDEX);
    return extractLocs(xml);
}

export interface SitemapCache {
    [url: string]: { urls: string[] };
}

async function getServersList(
    oldCache?: SitemapCache,
): Promise<{ data: string; cache: SitemapCache }> {
    const children = await getChildSitemaps();
    const oldChildren = oldCache ?? {};

    const cache: SitemapCache = {};
    const seen = new Set<string>();

    const toFetch: string[] = [];

    for (const url of children) {
        if (oldChildren[url]) {
            // cache hit — reuse
            cache[url] = oldChildren[url];
            for (const loc of oldChildren[url].urls) {
                seen.add(loc);
            }
        } else {
            toFetch.push(url);
        }
    }

    // fetch only new/changed sitemaps
    const xmls = await Promise.all(toFetch.map(fetchText));

    for (let i = 0; i < toFetch.length; i++) {
        const url = toFetch[i];
        const locs = extractLocs(xmls[i]);
        cache[url] = { urls: locs };
        for (const loc of locs) {
            seen.add(loc);
        }
    }

    const lines = [...seen].sort();
    return { data: lines.join('\n'), cache };
}

function diffSnapshots(oldSnap: string, newSnap: string) {
    const oldSet = new Set(oldSnap.split('\n').filter(Boolean));
    const newSet = new Set(newSnap.split('\n').filter(Boolean));

    const added: string[] = [];
    const removed: string[] = [];

    for (const v of newSet) {
        if (!oldSet.has(v)) added.push(v);
    }

    for (const v of oldSet) {
        if (!newSet.has(v)) removed.push(v);
    }

    if (!added.length && !removed.length) return '';

    added.sort();
    removed.sort();

    let out = '```diff\n';

    if (added.length) {
        out += `# Added (${added.length})\n`;
        const display = added.slice(0, MAX_DIFF_ENTRIES);
        for (const a of display) out += `+ ${a}\n`;
        const remaining = added.length - display.length;
        if (remaining > 0) out += `… and ${remaining} more\n`;
        out += '\n';
    }

    if (removed.length) {
        out += `# Removed (${removed.length})\n`;
        const display = removed.slice(0, MAX_DIFF_ENTRIES);
        for (const r of display) out += `- ${r}\n`;
        const remaining = removed.length - display.length;
        if (remaining > 0) out += `… and ${remaining} more\n`;
        out += '\n';
    }

    out += '```';
    return out;
}

function chunkString(str: string, maxLength = 2000): string[] {
    const chunks: string[] = [];
    let remaining = str;
    while (remaining.length > maxLength) {
        let splitAt = remaining.lastIndexOf('\n', maxLength);
        if (splitAt <= 0) splitAt = maxLength;
        chunks.push(remaining.slice(0, splitAt));
        remaining = remaining.slice(splitAt).trimStart();
    }
    if (remaining.length > 0) chunks.push(remaining);
    return chunks;
}

async function diff(oldSnap: string, newSnap: string) {
    const result = diffSnapshots(oldSnap, newSnap);
    if (!result) return;

    try {
        const serverContent =
            configExperimentCentral.pings.servers + '\n' + result;
        for (const chunk of chunkString(serverContent)) {
            await sendToWebhook(configExperimentCentral.webhooks.servers, {
                content: chunk,
            });
        }
    } catch (e) {
        console.error('Failed to send central server diff:', e);
    }

    try {
        const universityContent =
            configWumpusUniv.pings.servers + '\n' + result;
        for (const chunk of chunkString(universityContent)) {
            await sendToWebhook(configWumpusUniv.webhooks.servers, {
                content: chunk,
            });
        }
    } catch (e) {
        console.error('Failed to send wumpus server diff:', e);
    }
}

export default { diff, getServersList };
