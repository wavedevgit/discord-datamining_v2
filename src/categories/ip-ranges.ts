import { isIP } from 'node:net';

import { configExperimentCentral, configWumpusUniv } from '../config.js';
import { diffByKey, formatTextDiff, sendTrackerMessage, target } from '../tracker.js';

const IP_RANGES_URL = 'https://cdn.discordapp.com/ipranges/discord.json';

interface IpRangePrefix {
    ipv4Prefix?: string;
    ipv6Prefix?: string;
    services: string[];
}

interface IpRangesDocument {
    creationTime: string;
    syncToken: string;
    notes: string;
    prefixes: IpRangePrefix[];
}

function prefixValue(prefix: IpRangePrefix): string {
    return prefix.ipv4Prefix ?? prefix.ipv6Prefix ?? '';
}

function normalizeCidr(value: unknown, family: 4 | 6): string {
    if (typeof value !== 'string') throw new Error(`Invalid IPv${family} prefix`);
    const [address, prefixLength, ...extra] = value.trim().split('/');
    const length = Number(prefixLength);
    const maximum = family === 4 ? 32 : 128;
    if (
        extra.length ||
        isIP(address) !== family ||
        !Number.isInteger(length) ||
        length < 0 ||
        length > maximum
    ) {
        throw new Error(`Invalid IPv${family} prefix: ${value}`);
    }
    return `${address}/${length}`;
}

function normalizePrefix(value: unknown, index: number): IpRangePrefix {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`Invalid IP range prefix at index ${index}`);
    }
    const raw = value as Record<string, unknown>;
    const hasIpv4 = raw.ipv4Prefix !== undefined;
    const hasIpv6 = raw.ipv6Prefix !== undefined;
    if (hasIpv4 === hasIpv6) {
        throw new Error(`IP range prefix ${index} must contain exactly one CIDR`);
    }
    if (!Array.isArray(raw.services) || !raw.services.every(
        (service) => typeof service === 'string' && service.trim().length > 0,
    )) {
        throw new Error(`Invalid services for IP range prefix ${index}`);
    }

    const services = [...new Set(raw.services.map((service) => service.trim()))].sort();
    return hasIpv4
        ? { ipv4Prefix: normalizeCidr(raw.ipv4Prefix, 4), services }
        : { ipv6Prefix: normalizeCidr(raw.ipv6Prefix, 6), services };
}

function normalizeIpRanges(value: unknown): IpRangesDocument {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Invalid IP ranges response');
    }
    const raw = value as Record<string, unknown>;
    if (typeof raw.creationTime !== 'string' || !Number.isFinite(Date.parse(raw.creationTime))) {
        throw new Error('Invalid IP ranges creationTime');
    }
    if (typeof raw.syncToken !== 'string' || !raw.syncToken.trim()) {
        throw new Error('Invalid IP ranges syncToken');
    }
    if (typeof raw.notes !== 'string') throw new Error('Invalid IP ranges notes');
    if (!Array.isArray(raw.prefixes) || !raw.prefixes.length) {
        throw new Error('IP ranges response contained no prefixes');
    }

    const prefixes = raw.prefixes.map(normalizePrefix);
    const byCidr = new Map<string, IpRangePrefix>();
    for (const prefix of prefixes) {
        const cidr = prefixValue(prefix);
        const existing = byCidr.get(cidr);
        if (!existing) {
            byCidr.set(cidr, prefix);
            continue;
        }
        existing.services = [...new Set([...existing.services, ...prefix.services])].sort();
    }

    return {
        creationTime: raw.creationTime,
        syncToken: raw.syncToken.trim(),
        notes: raw.notes.trim(),
        prefixes: [...byCidr.values()].sort((left, right) =>
            prefixValue(left).localeCompare(prefixValue(right), undefined, { numeric: true }),
        ),
    };
}

async function getIpRanges(): Promise<IpRangesDocument> {
    const response = await fetch(IP_RANGES_URL, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Failed to fetch IP ranges: HTTP ${response.status}`);
    return normalizeIpRanges(await response.json());
}

function formatPrefix(prefix: IpRangePrefix): string {
    const services = prefix.services.length ? prefix.services.join(', ') : 'no services';
    return `${prefixValue(prefix)} — ${services}`;
}

function formatIpRangesNotification(
    beforeValue: IpRangesDocument,
    afterValue: IpRangesDocument,
): string | undefined {
    const before = normalizeIpRanges(beforeValue);
    const after = normalizeIpRanges(afterValue);
    const changes = diffByKey(before.prefixes, after.prefixes, prefixValue);
    const metadata: string[] = [];

    if (before.syncToken !== after.syncToken) {
        metadata.push(`**Sync token:** \`${before.syncToken}\` → \`${after.syncToken}\``);
    }
    if (before.creationTime !== after.creationTime) {
        metadata.push(`**Creation time:** <t:${Math.floor(Date.parse(after.creationTime) / 1_000)}:F>`);
    }
    if (before.notes !== after.notes) {
        metadata.push(`**Notes:** ${before.notes || 'None'} → ${after.notes || 'None'}`);
    }

    const removed = [
        ...changes.removed.map(formatPrefix),
        ...changes.updated.map(({ before: prefix }) => formatPrefix(prefix)),
    ];
    const added = [
        ...changes.added.map(formatPrefix),
        ...changes.updated.map(({ after: prefix }) => formatPrefix(prefix)),
    ];
    const prefixDiff = formatTextDiff({ added, removed });
    const metadataChanged = metadata.length > 0;
    if (!metadataChanged && !prefixDiff) return undefined;
    return [
        '## Discord Egress IP Ranges Updated',
        metadata.join('\n'),
        prefixDiff,
    ].filter(Boolean).join('\n\n');
}

async function diff(before: IpRangesDocument, after: IpRangesDocument): Promise<void> {
    const content = formatIpRangesNotification(before, after);
    if (!content) return;
    await sendTrackerMessage(
        [
            target(
                'Experiment Central IP ranges',
                configExperimentCentral.webhooks.ipRanges,
                configExperimentCentral.pings.ipRanges,
            ),
            target(
                'Wumpus University IP ranges',
                configWumpusUniv.webhooks.ipRanges,
                configWumpusUniv.pings.ipRanges,
            ),
        ],
        { content },
    );
}

export default { getIpRanges, diff };
export { formatIpRangesNotification, normalizeIpRanges };
export type { IpRangePrefix, IpRangesDocument };
