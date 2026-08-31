import acknowledgements from './categories/acknowledgements.js';
import activities, { ActivitiesResponse } from './categories/activities.js';
import changelogs, { Changelog } from './categories/changelogs.js';
import categories, {
    CollectibleCategory,
} from './categories/collectibles/categories.js';
import marketing, {
    MarketingCollection,
} from './categories/collectibles/marketing.js';
import profileEffects, {
    ProfileEffect,
} from './categories/collectibles/profile-effects.js';
import csp from './categories/csp.js';
import domains from './categories/domains.js';
import powerups, { Powerup } from './categories/powerups.js';
import robots from './categories/robots.js';
import servers, { SitemapCache } from './categories/servers.js';
import skus, { SkuListing } from './categories/skus.js';
import { configExperimentCentral } from './config.js';
import { sendTrackerMessage, target } from './tracker.js';
import { readFile, saveFile, saveFileText } from './utils.js';

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

async function main(): Promise<void> {
    console.log('Tracker Central - V2.0.0');
    const runs = [
        runTracker('activities', async () => {
            const before = await readFile<ActivitiesResponse>('./data/activities.json');
            const after = await activities.getActivities();
            await activities.diff(before, after);
            await saveFile('./data/activities.json', after);
        }),
        runTracker('changelogs', async () => {
            const [beforeDesktop, beforeMobile, after] = await Promise.all([
                readFile<Changelog[]>('./data/changelogs_desktop.json'),
                readFile<Changelog[]>('./data/changelogs_mobile.json'),
                changelogs.getChangelogs(),
            ]);
            const [afterDesktop, afterMobile] = after;
            await changelogs.diff(beforeDesktop, afterDesktop, 'Desktop');
            await saveFile('./data/changelogs_desktop.json', afterDesktop);
            await changelogs.diff(beforeMobile, afterMobile, 'Mobile');
            await saveFile('./data/changelogs_mobile.json', afterMobile);
        }),
        runTracker('collectible categories', async () => {
            const before = await readFile<CollectibleCategory[]>(
                './data/collectibles/categories.json',
            );
            const after = await categories.getCollectiblesCategories();
            await categories.diff(before, after);
            await saveFile('./data/collectibles/categories.json', after);
        }),
        runTracker('profile effects', async () => {
            const before = await readFile<ProfileEffect[]>(
                './data/collectibles/profile-effects.json',
            );
            const after = await profileEffects.getProfileEffects();
            await profileEffects.diff(before, after);
            await saveFile('./data/collectibles/profile-effects.json', after);
        }),
        runTracker('collectibles marketing', async () => {
            const before = await readFile<MarketingCollection>(
                './data/collectibles/marketing.json',
            );
            const after = await marketing.getMarketing();
            await marketing.diff(before, after);
            await saveFile('./data/collectibles/marketing.json', after);
        }),
        runTracker('CSP', async () => {
            const before = await readFile<string>('./data/csp.txt', false);
            const after = await csp.getCSP();
            await csp.diff(before, after);
            await saveFileText('./data/csp.txt', after);
        }),
        runTracker('acknowledgements', async () => {
            const before = await readFile<string>('./data/acknowledgements.md', false);
            const after =
                '# Acknowledgements\n**Source:** https://canary.discord.com/acknowledgements\n\n' +
                (await acknowledgements.getModules());
            await acknowledgements.diff(before, after);
            await saveFileText('./data/acknowledgements.md', after);
        }),
        runTracker('robots.txt', async () => {
            const before = await readFile<string>('./data/robots.txt', false);
            const after = await robots.getRobots();
            await robots.diff(before, after);
            await saveFileText('./data/robots.txt', after);
        }),
        runTracker('domains', async () => {
            const before = await readFile<string[]>('./data/domains.json');
            const after = await domains.getDomains(before);
            await domains.diff(before, after);
            await saveFile('./data/domains.json', after);
        }),
        runTracker('powerups', async () => {
            const before = await readFile<Powerup[]>('./data/powerups.json');
            const after = await powerups.getPowerups();
            await powerups.diff(before, after);
            await saveFile('./data/powerups.json', after);
        }),
        runTracker('SKU publication', async () => {
            const before = await readFile<string[]>('./data/skus.json');
            const after = await skus.getSkus(before);
            await skus.diff(before, after);
            await saveFile('./data/skus.json', after);
        }),
        runTracker('SKU listings', async () => {
            const [before, appIds] = await Promise.all([
                readFile<SkuListing[]>('./data/skus_apps_listings.json'),
                readFile<string[]>('./data/skus_apps.json'),
            ]);
            const after = await skus.getSkuApps(appIds);
            await skus.diffSkuApps(before, after);
            await saveFile('./data/skus_apps_listings.json', after);
        }),
        runTracker('server directory', async () => {
            const [before, cache] = await Promise.all([
                readFile<string>('./data/servers.txt', false),
                readFile<SitemapCache>('./data/servers_sitemaps.json').catch(() => ({})),
            ]);
            const after = await servers.getServersList(cache);
            await servers.diff(before, after.data);
            await Promise.all([
                saveFileText('./data/servers.txt', after.data),
                saveFile('./data/servers_sitemaps.json', after.cache),
            ]);
        }),
    ];

    const results = await Promise.allSettled(runs);
    const failures = results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map(({ reason }) => reason);
    if (failures.length) throw new AggregateError(failures, `${failures.length} tracker(s) failed`);
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
