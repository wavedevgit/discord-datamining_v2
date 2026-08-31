import { configExperimentCentral, configWumpusUniv } from '../config.js';
import { diffLines, formatTextDiff, sendTrackerMessage, target } from '../tracker.js';

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
    const lastChild = children.at(-1);

    for (const url of children) {
        if (oldChildren[url] && url !== lastChild) {
            // Completed sitemap shards are immutable. The final shard can
            // still grow, so always refresh it.
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

function diffSnapshots(oldSnap: string, newSnap: string): string {
    const changes = diffLines(oldSnap, newSnap);
    const { added, removed } = changes;

    if (!added.length && !removed.length) return '';

    added.sort();
    removed.sort();

    const shown = {
        added: added.slice(0, MAX_DIFF_ENTRIES),
        removed: removed.slice(0, MAX_DIFF_ENTRIES),
    };
    const summary = `Server directory changed: +${added.length} / -${removed.length}`;
    const formatted = formatTextDiff(shown);
    return `${summary}\n${formatted ?? ''}`;
}

async function diff(oldSnap: string, newSnap: string) {
    const result = diffSnapshots(oldSnap, newSnap);
    if (!result) return;

    await sendTrackerMessage(
        [
            target(
                'Experiment Central servers',
                configExperimentCentral.webhooks.servers,
                configExperimentCentral.pings.servers,
            ),
            target(
                'Wumpus University servers',
                configWumpusUniv.webhooks.servers,
                configWumpusUniv.pings.servers,
            ),
        ],
        { content: result },
    );
}

export default { diff, getServersList };
