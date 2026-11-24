import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import acknowledgements from './categories/acknowledgements.js';
import changelogs, { Changelog } from './categories/changelogs.js';
import categories, {
    CollectibleCategory,
} from './categories/collectibles/categories.js';
import marketing, {
    MarketingCollection,
} from './categories/collectibles/marketing.js';
import csp from './categories/csp.js';
import domains from './categories/domains.js';
import ipRanges, { IpRangesDocument } from './categories/ip-ranges.js';
import merch, { MerchProduct } from './categories/merch.js';
import powerups, { Powerup } from './categories/powerups.js';
import policies from './categories/policies.js';
import robots from './categories/robots.js';
import servers, { SitemapCache } from './categories/servers.js';
import skus, { SkuListing } from './categories/skus.js';
import topics, { TopicsSnapshot } from './categories/topics.js';
import { configExperimentCentral } from './config.js';
import { DATA_DIR, dataPath } from './paths.js';
import {
    getIpCountry,
    sendTrackerMessage,
    target,
} from './tracker.js';
import { readFile, saveFile, saveFileText } from './utils.js';

const execFileAsync = promisify(execFile);

let authAlert: Promise<void> | undefined;

function isAuthenticationError(error: unknown): boolean {
    return /HTTP 401|unauthori[sz]ed|token.*expir/i.test(String(error));
}

function notifyAuthenticationFailure(error: unknown): Promise<void> {
    authAlert ??= sendTrackerMessage(
        [
            target(
                'Authentication status',
                configExperimentCentral.webhooks.status?.token,
                configExperimentCentral.pings.status?.token,
            ),
        ],
        {
            content: `Authenticated Discord trackers failed. Check ALT_TOKEN.\n\`\`\`\n${String(error).slice(0, 1_500)}\n\`\`\``,
        },
    );
    return authAlert;
}

async function runTracker<T>(name: string, run: () => Promise<T>): Promise<T> {
    try {
        const result = await run();
        console.log(`${name}: complete`);
        return result;
    } catch (error) {
        if (isAuthenticationError(error)) await notifyAuthenticationFailure(error);
        throw new Error(`${name}: ${String(error)}`);
    }
}

const DATA_BRANCH = process.env.DATA_BRANCH?.trim() || 'data';

async function commitDataChanges(): Promise<string | undefined> {
    if (process.env.GITHUB_ACTIONS !== 'true') return undefined;

    const git = (...args: string[]) => execFileAsync('git', ['-C', DATA_DIR, ...args]);
    try {
        await git('rev-parse', '--git-dir');
    } catch {
        console.warn(`${DATA_DIR} is not a git checkout; data left uncommitted.`);
        return undefined;
    }

    await git('add', '-A');
    const { stdout } = await git('diff', '--cached', '--name-only');
    if (!stdout.trim()) return undefined;

    await git('commit', '-m', '✅ data updated!');
    await git('push', 'origin', `HEAD:${DATA_BRANCH}`);
    const { stdout: sha } = await git('rev-parse', 'HEAD');
    return `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/commit/${sha.trim()}`;
}

async function main(): Promise<void> {
    console.log('Tracker Central - V2.0.0');
    const notifications: Array<() => Promise<void>> = [];
    const trackDiscordProducts = await runTracker('IP location', async () => {
        const previousCountry = await readFile<string>(dataPath('ip_country.txt'), false).catch(() => '');
        const currentCountry = await getIpCountry();
        await saveFileText(dataPath('ip_country.txt'), currentCountry);
        const shouldTrack = previousCountry.trim() === currentCountry;
        if (!shouldTrack) {
            console.warn(
                `Discord products: skipped because IP country changed from ${previousCountry.trim() || 'unknown'} to ${currentCountry}`,
            );
        }
        return shouldTrack;
    }).catch((error) => {
        console.error(error);
        return false;
    });
    const runs = [
        runTracker('topics sitemap', async () => {
            let before: TopicsSnapshot | undefined;
            try {
                before = await readFile<TopicsSnapshot>(dataPath('topics.json'));
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            }
            const after = await topics.getTopics();
            await saveFile(dataPath('topics.json'), after);
            if (before !== undefined) {
                const previous = before;
                notifications.push(() => topics.diff(previous, after));
            }
        }),
        runTracker('policies', async () => {
            const changes = await policies.getPolicies();
            notifications.push(() => policies.diff(changes));
        }),
        runTracker('changelogs', async () => {
            const [beforeDesktop, beforeMobile, after] = await Promise.all([
                readFile<Changelog[]>(dataPath('changelogs_desktop.json')),
                readFile<Changelog[]>(dataPath('changelogs_mobile.json')),
                changelogs.getChangelogs(),
            ]);
            const [afterDesktop, afterMobile] = after;
            await saveFile(dataPath('changelogs_desktop.json'), afterDesktop);
            await saveFile(dataPath('changelogs_mobile.json'), afterMobile);
            notifications.push(async () => {
                await changelogs.diff(beforeDesktop, afterDesktop, 'Desktop');
                await changelogs.diff(beforeMobile, afterMobile, 'Mobile');
            });
        }),
        trackDiscordProducts
            ? runTracker('collectible categories', async () => {
                const before = await readFile<CollectibleCategory[]>(
                    dataPath('collectibles/categories.json'),
                );
                const after = await categories.getCollectiblesCategories();
                await saveFile(dataPath('collectibles/categories.json'), after);
                notifications.push(() => categories.diff(before, after));
            })
            : Promise.resolve(),
        runTracker('collectibles marketing', async () => {
            const before = await readFile<MarketingCollection>(
                dataPath('collectibles/marketing.json'),
            );
            const after = await marketing.getMarketing();
            await saveFile(dataPath('collectibles/marketing.json'), after);
            notifications.push(() => marketing.diff(before, after));
        }),
        runTracker('CSP', async () => {
            const before = await readFile<string>(dataPath('csp.txt'), false);
            const after = await csp.getCSP();
            await saveFileText(dataPath('csp.txt'), after);
            notifications.push(() => csp.diff(before, after));
        }),
        runTracker('acknowledgements', async () => {
            const before = await readFile<string>(dataPath('acknowledgements.md'), false);
            const after =
                '# Acknowledgements\n**Source:** https://canary.discord.com/acknowledgements\n\n' +
                (await acknowledgements.getModules());
            await saveFileText(dataPath('acknowledgements.md'), after);
            notifications.push(() => acknowledgements.diff(before, after));
        }),
        runTracker('robots.txt', async () => {
            const before = await readFile<string>(dataPath('robots.txt'), false);
            const after = await robots.getRobots();
            await saveFileText(dataPath('robots.txt'), after);
            notifications.push(() => robots.diff(before, after));
        }),
        runTracker('domains', async () => {
            const before = await readFile<string[]>(dataPath('domains.json'));
            const after = await domains.getDomains(before);
            await saveFile(dataPath('domains.json'), after);
            notifications.push(() => domains.diff(before, after));
        }),
        runTracker('IP ranges', async () => {
            const before = await readFile<IpRangesDocument>(dataPath('ip_ranges.json'));
            const after = await ipRanges.getIpRanges();
            await saveFile(dataPath('ip_ranges.json'), after);
            notifications.push(() => ipRanges.diff(before, after));
        }),
        runTracker('powerups', async () => {
            const before = await readFile<Powerup[]>(dataPath('powerups.json'));
            const after = await powerups.getPowerups();
            await saveFile(dataPath('powerups.json'), after);
            notifications.push(() => powerups.diff(before, after));
        }),
        runTracker('merch', async () => {
            const before = await readFile<MerchProduct[]>(dataPath('merch.json'));
            const after = await merch.getMerch();
            await saveFile(dataPath('merch.json'), after);
            notifications.push(() => merch.diff(before, after));
        }),
        runTracker('SKU publication', async () => {
            const before = await readFile<string[]>(dataPath('skus.json'));
            const after = await skus.getSkus(before);
            await saveFile(dataPath('skus.json'), after);
            notifications.push(() => skus.diff(before, after));
        }),
        runTracker('SKU listings', async () => {
            const [before, appIds] = await Promise.all([
                readFile<SkuListing[]>(dataPath('skus_apps_listings.json')),
                readFile<string[]>(dataPath('skus_apps.json')),
            ]);
            const after = await skus.getSkuApps(appIds);
            await saveFile(dataPath('skus_apps_listings.json'), after);
            notifications.push(() => skus.diffSkuApps(before, after));
        }),
        runTracker('server directory', async () => {
            const [before, cache] = await Promise.all([
                readFile<string>(dataPath('servers.txt'), false),
                readFile<SitemapCache>(dataPath('servers_sitemaps.json')).catch(() => ({})),
            ]);
            const after = await servers.getServersList(cache, before);
            await Promise.all([
                saveFileText(dataPath('servers.txt'), after.data),
                saveFile(dataPath('servers_sitemaps.json'), after.cache),
            ]);
            notifications.push(() => servers.diff(before, after.data));
        }),
    ];

    const results = await Promise.allSettled(runs);
    const failures = results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map(({ reason }) => reason);
    for (const failure of failures) console.error(failure);

    const commitUrl = await commitDataChanges();
    if (commitUrl) process.env.COMMIT_URL = commitUrl;
    const notificationResults = await Promise.allSettled(notifications.map((notify) => notify()));
    const notificationFailures = notificationResults
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map(({ reason }) => reason);
    if (notificationFailures.length) {
        for (const failure of notificationFailures) console.error(failure);
    }
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
