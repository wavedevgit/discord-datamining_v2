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
import powerups, { Powerup } from './categories/powerups.js';
import robots from './categories/robots.js';
import servers, { SitemapCache } from './categories/servers.js';
import skus, { SkuListing } from './categories/skus.js';
import { configExperimentCentral } from './config.js';
import { sendTrackerMessage, target } from './tracker.js';
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

async function runTracker(name: string, run: () => Promise<void>): Promise<void> {
    try {
        await run();
        console.log(`${name}: complete`);
    } catch (error) {
        if (isAuthenticationError(error)) await notifyAuthenticationFailure(error);
        throw new Error(`${name}: ${String(error)}`);
    }
}

async function commitDataChanges(): Promise<string | undefined> {
    if (process.env.GITHUB_ACTIONS !== 'true') return undefined;

    await execFileAsync('git', ['add', 'data']);
    const { stdout } = await execFileAsync('git', ['diff', '--cached', '--name-only']);
    if (!stdout.trim()) return undefined;

    await execFileAsync('git', ['commit', '-m', '✅ data updated!']);
    await execFileAsync('git', ['push']);
    const { stdout: sha } = await execFileAsync('git', ['rev-parse', 'HEAD']);
    return `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/commit/${sha.trim()}`;
}

async function main(): Promise<void> {
    console.log('Tracker Central - V2.0.0');
    const notifications: Array<() => Promise<void>> = [];
    const runs = [
        runTracker('changelogs', async () => {
            const [beforeDesktop, beforeMobile, after] = await Promise.all([
                readFile<Changelog[]>('./data/changelogs_desktop.json'),
                readFile<Changelog[]>('./data/changelogs_mobile.json'),
                changelogs.getChangelogs(),
            ]);
            const [afterDesktop, afterMobile] = after;
            await saveFile('./data/changelogs_desktop.json', afterDesktop);
            await saveFile('./data/changelogs_mobile.json', afterMobile);
            notifications.push(async () => {
                await changelogs.diff(beforeDesktop, afterDesktop, 'Desktop');
                await changelogs.diff(beforeMobile, afterMobile, 'Mobile');
            });
        }),
        runTracker('collectible categories', async () => {
            const before = await readFile<CollectibleCategory[]>(
                './data/collectibles/categories.json',
            );
            const after = await categories.getCollectiblesCategories();
            await saveFile('./data/collectibles/categories.json', after);
            notifications.push(() => categories.diff(before, after));
        }),
        runTracker('collectibles marketing', async () => {
            const before = await readFile<MarketingCollection>(
                './data/collectibles/marketing.json',
            );
            const after = await marketing.getMarketing();
            await saveFile('./data/collectibles/marketing.json', after);
            notifications.push(() => marketing.diff(before, after));
        }),
        runTracker('CSP', async () => {
            const before = await readFile<string>('./data/csp.txt', false);
            const after = await csp.getCSP();
            await saveFileText('./data/csp.txt', after);
            notifications.push(() => csp.diff(before, after));
        }),
        runTracker('acknowledgements', async () => {
            const before = await readFile<string>('./data/acknowledgements.md', false);
            const after =
                '# Acknowledgements\n**Source:** https://canary.discord.com/acknowledgements\n\n' +
                (await acknowledgements.getModules());
            await saveFileText('./data/acknowledgements.md', after);
            notifications.push(() => acknowledgements.diff(before, after));
        }),
        runTracker('robots.txt', async () => {
            const before = await readFile<string>('./data/robots.txt', false);
            const after = await robots.getRobots();
            await saveFileText('./data/robots.txt', after);
            notifications.push(() => robots.diff(before, after));
        }),
        runTracker('domains', async () => {
            const before = await readFile<string[]>('./data/domains.json');
            const after = await domains.getDomains(before);
            await saveFile('./data/domains.json', after);
            notifications.push(() => domains.diff(before, after));
        }),
        runTracker('powerups', async () => {
            const before = await readFile<Powerup[]>('./data/powerups.json');
            const after = await powerups.getPowerups();
            await saveFile('./data/powerups.json', after);
            notifications.push(() => powerups.diff(before, after));
        }),
        runTracker('SKU publication', async () => {
            const before = await readFile<string[]>('./data/skus.json');
            const after = await skus.getSkus(before);
            await saveFile('./data/skus.json', after);
            notifications.push(() => skus.diff(before, after));
        }),
        runTracker('SKU listings', async () => {
            const [before, appIds] = await Promise.all([
                readFile<SkuListing[]>('./data/skus_apps_listings.json'),
                readFile<string[]>('./data/skus_apps.json'),
            ]);
            const after = await skus.getSkuApps(appIds);
            await saveFile('./data/skus_apps_listings.json', after);
            notifications.push(() => skus.diffSkuApps(before, after));
        }),
        runTracker('server directory', async () => {
            const [before, cache] = await Promise.all([
                readFile<string>('./data/servers.txt', false),
                readFile<SitemapCache>('./data/servers_sitemaps.json').catch(() => ({})),
            ]);
            const after = await servers.getServersList(cache, before);
            await Promise.all([
                saveFileText('./data/servers.txt', after.data),
                saveFile('./data/servers_sitemaps.json', after.cache),
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
