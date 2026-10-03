import {
    configExperimentCentral,
    configWumpusUniv,
    SECURITYTRIALS_API_KEY,
} from '../config.js';
import { formatTextDiff, sendTrackerMessage, target } from '../tracker.js';

const DOMAINS = [
    'dis.gd',
    'i.dis.gd',
    'discord.co',
    'discord.com',
    'discord.design',
    'discord.gg', 
    'discord.dev',
    'discord.gift',
    'discord.gifts',
    'discord.media',
    'discord.new',
    'discord.store',
    'discord.tools',
    'discordactivities.com',
    'discordapp.com',
    'discordapp.net',
    'discordmerch.com',
    'discordquests.com',
    'discordstatus.com',
    'discordpartygames.com',
    'discord-activities.com',
    'discordvibeapps.com',
];

function sortDomains(domains: Iterable<string>): string[] {
    return [...new Set(domains)].sort((a, b) => {
        const aParts = a.split('.').reverse();
        const bParts = b.split('.').reverse();

        const len = Math.max(aParts.length, bParts.length);

        for (let i = 0; i < len; i++) {
            const aPart = aParts[i] ?? '';
            const bPart = bParts[i] ?? '';

            const cmp = aPart.localeCompare(bPart);
            if (cmp !== 0) return cmp;
        }

        return a.localeCompare(b);
    });
}

function isValidDomainLabel(label: string): boolean {
    if (!label || label.length > 63) return false;
    if (label.startsWith('-') || label.endsWith('-')) return false;
    if (!/^[a-z0-9-]+$/.test(label)) return false;
    return true;
}

function isValidDomain(name: string, baseDomain: string): boolean {
    const cleaned = name.trim().toLowerCase();
    if (!cleaned || cleaned.length > 253) return false;
    if (cleaned.includes('..') || cleaned.includes('__') || cleaned.includes('*') || cleaned.includes('_')) return false;
    if (!/^[a-z0-9.-]+$/.test(cleaned)) return false;
    if (!(cleaned === baseDomain || cleaned.endsWith(`.${baseDomain}`))) return false;
    // Filter ephemeral / random subdomains that create noise (e.g., xxx-yyy123., foo-bar-123.)
    if (/(^|\.)[a-z]+-[a-z]+-?\d+(\.|$)/.test(cleaned)) return false;
    if (/[a-z]+\-[a-z]+\d+\./.test(cleaned)) return false;
    const labels = cleaned.split('.');
    for (const label of labels) {
        if (!isValidDomainLabel(label)) return false;
    }
    return true;
}

async function findSubdomainsCrtSh(domain: string): Promise<string[]> {
    const subs = new Set<string>();

    try {
        const res = await fetch(
            `https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`,
            {
                headers: {
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
                signal: AbortSignal.timeout(20_000),
            },
        );

        if (!res.ok) return [...subs];

        const data = (await res.json()) as { name_value: string }[];
        for (const entry of data) {
            const names = entry.name_value.split('\n');
            for (const name of names) {
                const cleaned = name.trim().toLowerCase();
                if (isValidDomain(cleaned, domain)) {
                    subs.add(cleaned);
                }
            }
        }
    } catch {}

    return [...subs];
}

async function findSubdomainsSecurityTrails(domain: string): Promise<string[]> {
    const subs = new Set<string>();

    if (!SECURITYTRIALS_API_KEY) return [...subs];

    try {
        const res = await fetch(
            `https://api.securitytrails.com/v1/domain/${encodeURIComponent(domain)}/subdomains`,
            {
                headers: {
                    Accept: 'application/json',
                    APIKEY: SECURITYTRIALS_API_KEY,
                },
                signal: AbortSignal.timeout(20_000),
            },
        );

        if (!res.ok) return [...subs];

        const data = (await res.json()) as { subdomains: string[] };
        if (data.subdomains) {
            for (const sub of data.subdomains) {
                const full = `${sub}.${domain}`.toLowerCase();
                if (isValidDomain(full, domain)) {
                    subs.add(full);
                }
            }
        }
    } catch {}

    return [...subs];
}

async function getDomains(previous: string[] = []): Promise<string[]> {
    const results = await Promise.all(
        DOMAINS.map(async (domain) => {
            const [crtSh, st] = await Promise.all([
                findSubdomainsCrtSh(domain),
                findSubdomainsSecurityTrails(domain),
            ]);

            return sortDomains([domain, ...crtSh, ...st]);
        }),
    );

    // Certificate transparency is append-only. Keep known domains when a
    // provider has a transient failure instead of reporting false removals.
    // Prune any previously stored noise/invalid domains while preserving valid ones.
    const all = new Set<string>();
    for (const domain of previous) {
        const normalized = domain.trim().toLowerCase();
        const isValid = DOMAINS.some((base) => normalized === base || isValidDomain(normalized, base));
        if (isValid) all.add(normalized);
        else if (DOMAINS.includes(normalized)) all.add(normalized);
    }

    for (const subs of results) {
        for (const sub of subs) {
            all.add(sub);
        }
    }

    return sortDomains(all);
}

async function diff(oldData: string[], newData: string[]) {
    const oldSet = new Set(oldData);
    const newSet = new Set(newData);

    const added = sortDomains(newData.filter((v) => !oldSet.has(v)));
    const removed = sortDomains(oldData.filter((v) => !newSet.has(v)));

    if (!added.length && !removed.length) return;

    const content = formatTextDiff({ added, removed });
    if (!content) return;
    await sendTrackerMessage(
        [
            target(
                'Experiment Central domains',
                configExperimentCentral.webhooks.domains,
                configExperimentCentral.pings.domains,
            ),
            target(
                'Wumpus University domains',
                configWumpusUniv.webhooks.domains,
                configWumpusUniv.pings.domains,
            ),
        ],
        { content },
    );
}

export default { getDomains, diff };
