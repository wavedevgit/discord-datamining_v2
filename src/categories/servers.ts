import { configExperimentCentral, configWumpusUniv } from '../config.js';
import { diffLines, formatTextDiff, sendTrackerMessage, target } from '../tracker.js';

const SITEMAP_INDEX = 'https://discord.com/servers/servers-sitemap-index.xml';

const MAX_DIFF_ENTRIES = 30;

async function fetchText(url: string) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed fetch ${url}: ${res.status}`);
    return (await res.text()).trim();
}

interface ServerEntry {
    id: string;
    url: string;
}

export function serverEntry(value: string): ServerEntry | undefined {
    const match = value.match(/^(?:(\d+)\s+)?(https:\/\/discord\.com\/servers\/[^\s]*?(\d+))$/);
    if (!match) return;
    return { id: match[1] ?? match[3], url: match[2] };
}

export function formatServer(entry: ServerEntry): string {
    return `${entry.id} ${entry.url}`;
}

export function compareServers(a: string, b: string): number {
    const first = serverEntry(a);
    const second = serverEntry(b);
    if (!first || !second) return a.localeCompare(b);
    if (first.id.length !== second.id.length) return first.id.length - second.id.length;
    return first.id.localeCompare(second.id);
}

function extractLocs(xml: string): string[] {
    const matches = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)];
    return matches.map((match) => {
        const url = match[1];
        const entry = serverEntry(url);
        if (!entry) return url;
        return formatServer(entry);
    });
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
    ..._legacyPreviousData: [string?]
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
            cache[url] = {
                urls: oldChildren[url].urls.map((line) => {
                    const entry = serverEntry(line);
                    return entry ? formatServer(entry) : line;
                }),
            };
            for (const loc of cache[url].urls) {
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
        const locs = extractLocs(xmls[i]).sort(compareServers);
        cache[url] = { urls: locs };
        for (const loc of locs) {
            seen.add(loc);
        }
    }

    // Ensure cached shards that were reused remain deterministically sorted
    for (const key of Object.keys(cache)) {
        cache[key].urls = [...new Set(cache[key].urls)].sort(compareServers);
    }

    const lines = [...seen].sort(compareServers);
    return { data: lines.join('\n'), cache };
}

function diffSnapshots(oldSnap: string, newSnap: string): string | undefined {
    const changes = diffLines(oldSnap, newSnap);
    const { added, removed } = changes;

    if (!added.length && !removed.length) return '';

    added.sort();
    removed.sort();

    if (added.length > MAX_DIFF_ENTRIES || removed.length > MAX_DIFF_ENTRIES) {
        return undefined;
    }

    const shown = {
        added: added.slice(0, MAX_DIFF_ENTRIES),
        removed: removed.slice(0, MAX_DIFF_ENTRIES),
    };
    const summary = `Server directory changed: +${added.length} / -${removed.length}`;
    const formatted = formatTextDiff(shown);
    return `${summary}\n${formatted ?? ''}`;
}

async function diff(oldSnap: string, newSnap: string) {
    const changes = diffLines(oldSnap, newSnap);
    if (!changes.added.length && !changes.removed.length) return;
    const result = diffSnapshots(oldSnap, newSnap);

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
