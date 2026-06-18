import { configExperimentCentral, configWumpusUniv } from '../config.js';
import { sendToWebhook } from '../utils.js';

const SITEMAP_INDEX = 'https://discord.com/servers/servers-sitemap-index.xml';

/**
 * fetch raw xml
 */
async function fetchText(url: string) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed fetch ${url}: ${res.status}`);
    return (await res.text()).trim();
}

/**
 * extract <loc> values from sitemap xml
 */
function extractLocs(xml: string): string[] {
    const matches = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)];
    return matches.map((m) => m[1]);
}

/**
 * get child sitemap urls
 */
async function getChildSitemaps(): Promise<string[]> {
    const xml = await fetchText(SITEMAP_INDEX);
    return extractLocs(xml);
}

/**
 * build newline-separated server list string
 */
async function getServersList(): Promise<string> {
    const children = await getChildSitemaps();

    const xmls = await Promise.all(children.map(fetchText));

    const allLocs = xmls.flatMap(extractLocs);

    // dedupe manually (since you hate Set now)
    const seen = new Set<string>();
    const lines: string[] = [];

    for (const loc of allLocs) {
        if (!seen.has(loc)) {
            seen.add(loc);
            lines.push(loc);
        }
    }

    return lines.join('\n');
}

/**
 * diff two newline-separated snapshots
 */
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

    let out = '```diff\n';

    if (added.length) {
        out += '# Added\n';
        for (const a of added) out += `+ ${a}\n`;
        out += '\n';
    }

    if (removed.length) {
        out += '# Removed\n';
        for (const r of removed) out += `- ${r}\n`;
        out += '\n';
    }

    out += '```';
    return out;
}

/**
 * compare snapshots and send webhook updates
 */
function diff(oldSnap: string, newSnap: string) {
    const result = diffSnapshots(oldSnap, newSnap);
    if (!result) return;

    sendToWebhook(configExperimentCentral.webhooks.servers, {
        content: configExperimentCentral.pings.servers + '\n' + result,
    });

    sendToWebhook(configWumpusUniv.webhooks.servers, {
        content: configWumpusUniv.pings.servers + '\n' + result,
    });
}

export default { diff, getServersList };
