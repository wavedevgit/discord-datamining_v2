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
                if ((cleaned.endsWith(`.${domain}`) || cleaned === domain) && !cleaned.startsWith('*') && !/[a-z]+\-[a-z]+\d+\./.test(cleaned)) {
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
                subs.add(full);
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
    const all = new Set<string>(previous);

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
