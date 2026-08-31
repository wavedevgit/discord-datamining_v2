import { isDeepStrictEqual } from 'node:util';

import { configExperimentCentral } from '../config.js';
import { changedKeys, diffByKey, sendTrackerMessage, target } from '../tracker.js';
import { DiscordEmbed } from '../types.js';

interface Changelog extends Record<string, unknown> {
    changelog_id: string;
    entry_id: string;
    date: string;
    asset: string;
    asset_type: 0 | 1;
    content: string;
}

type ChangelogConfig = Record<string, Omit<Changelog, 'content'>>;

async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
    return response.json() as Promise<T>;
}

async function hydrateChangelogs(platform: 0 | 1): Promise<Changelog[]> {
    const config = await fetchJson<ChangelogConfig>(
        `https://cdn.discordapp.com/changelogs/config_${platform}.json`,
    );
    return Promise.all(
        Object.entries(config).map(async ([changelogId, metadata]): Promise<Changelog> => ({
            ...metadata,
            ...(await fetchJson<Pick<Changelog, 'content'>>(
                `https://cdn.discordapp.com/changelogs/${platform}/${changelogId}/en-US.json`,
            )),
        }) as Changelog),
    );
}

async function getChangelogs(): Promise<[Changelog[], Changelog[]]> {
    return Promise.all([hydrateChangelogs(0), hydrateChangelogs(1)]);
}

function stableAsset(asset: string): string {
    try {
        const url = new URL(asset);
        url.search = '';
        return url.toString();
    } catch {
        return asset;
    }
}

function sameChangelog(before: Changelog, after: Changelog): boolean {
    return isDeepStrictEqual(
        { ...before, asset: stableAsset(before.asset) },
        { ...after, asset: stableAsset(after.asset) },
    );
}

function generateEmbed(
    changelog: Changelog,
    type: string,
    change: 'Added' | 'Removed' | 'Updated',
    changes: string[] = [],
): DiscordEmbed {
    const assetUrl = changelog.asset_type === 0
        ? `https://youtube.com/watch?v=${changelog.asset}`
        : changelog.asset;
    return {
        title: `Changelogs - ${change} (${type})`,
        description: changelog.content,
        image: {
            url: changelog.asset_type === 1
                ? changelog.asset
                : `https://img.youtube.com/vi/${changelog.asset}/hqdefault.jpg`,
        },
        fields: [
            { name: 'Changelog ID', value: changelog.changelog_id, inline: true },
            { name: 'Entry ID', value: changelog.entry_id, inline: true },
            { name: 'Date', value: changelog.date, inline: true },
            {
                name: 'Asset Type',
                value: changelog.asset_type === 0 ? 'YouTube Video' : 'Image',
                inline: true,
            },
            { name: 'Asset URL', value: assetUrl, inline: true },
            ...(changes.length
                ? [{ name: 'Changed fields', value: changes.join(', ') }]
                : []),
        ],
        color: change === 'Removed' ? 0xff0000 : change === 'Added' ? 0x008000 : 0xffa500,
    };
}

async function diff(before: Changelog[], after: Changelog[], type: string): Promise<void> {
    const changes = diffByKey(
        before,
        after,
        ({ changelog_id }) => changelog_id,
        sameChangelog,
    );
    const byId = (left: Changelog, right: Changelog) =>
        left.changelog_id.localeCompare(right.changelog_id);
    changes.added.sort(byId);
    changes.removed.sort(byId);

    const embeds: DiscordEmbed[] = [
        ...changes.removed.map((changelog) =>
            generateEmbed(changelog, type, 'Removed')),
        ...changes.added.map((changelog) =>
            generateEmbed(changelog, type, 'Added')),
        ...changes.updated.map(({ before: previous, after: changelog }) => {
            const fields = changedKeys(previous, changelog).filter(
                (field) => field !== 'asset' || stableAsset(previous.asset) !== stableAsset(changelog.asset),
            );
            return generateEmbed(changelog, type, 'Updated', fields);
        }),
    ];
    if (!embeds.length) return;
    await sendTrackerMessage(
        [
            target(
                'Experiment Central changelogs',
                configExperimentCentral.webhooks.changelogs,
                configExperimentCentral.pings.changelogs,
            ),
        ],
        { embeds },
    );
}

export default { getChangelogs, diff };
export type { Changelog };
