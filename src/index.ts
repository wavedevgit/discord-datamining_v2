import { readFile, saveFile, saveFileText, sendToWebhook } from './utils.js';
import { configExperimentCentral } from './config.js';
import activities from './categories/activities.js';
import changelogs from './categories/changelogs.js';
import profileEffects from './categories/collectibles/profile-effects.js';
import categories from './categories/collectibles/categories.js';
import acknowledgements from './categories/acknowledgements.js';
import robots_ from './categories/robots.js';
import marketing from './categories/collectibles/marketing.js';
import csp from './categories/csp.js';
import servers from './categories/servers.js';
import domains from './categories/domains.js';
import powerups from './categories/powerups.js';
import skus from './categories/skus.js';

async function main() {
    console.log('Tracker central - V1.0.0');
    const collectiblesCategories = await categories.getCollectiblesCategories();
    const oldMarketing = await readFile('./data/collectibles/marketing.json');
    const oldChangeLogsMobile = await readFile('./data/changelogs_mobile.json');
    const oldChangeLogsDesktop = await readFile(
        './data/changelogs_desktop.json',
    );
    const oldProfileEffects = await readFile(
        './data/collectibles/profile-effects.json',
    );
    const oldCSP = await readFile('./data/csp.txt', false);
    const oldCategories = await readFile('./data/collectibles/categories.json');
    const oldAcknowledgements = await readFile(
        './data/acknowledgements.md',
        false,
    );
    const oldServers = await readFile('./data/servers.txt', false);
    const oldRobots = await readFile('./data/robots.txt', false);
    const oldDomains = await readFile('./data/domains.json');
    const oldPowerups = await readFile('./data/powerups.json');
    const oldSkus = await readFile('./data/skus.json');
    const oldSkuApps = await readFile('./data/skus_apps_listings.json');
    const skuAppIds = await readFile('./data/skus_apps.json');
    let oldServerSitemaps: Record<string, { urls: string[] }> = {};
    try {
        oldServerSitemaps = await readFile('./data/servers_sitemaps.json');
    } catch {}
    // break, and notify me that i need update token
    if (collectiblesCategories?.message) {
        const res = await await sendToWebhook(
            configExperimentCentral.webhooks.status.token,
            {
                content: `${
                    configExperimentCentral.pings.status.token
                } **Your alt token has expired!!!**\n\`\`\`json\n${JSON.stringify(
                    collectiblesCategories,
                )}\n\`\`\``,
            },
        );
        return;
    }
    const cspData = await csp.getCSP();
    const acknowledgementsData =
        '# Acknowledgements\n**Source:** https://canary.discord.com/acknowledgements\n\n' +
        (await acknowledgements.getModules());
    const robots = await robots_.getRobots();
    const marketingData = await marketing.getMarketing();
    const { data: serversData, cache: serverSitemaps } =
        await servers.getServersList(oldServerSitemaps);
    const domainsData = await domains.getDomains();
    const powerupsData = await powerups.getPowerups();
    const skusData = await skus.getSkus(oldSkus);
    const skuAppsData = await skus.getSkuApps(skuAppIds);
    const [changelogsDesktop, changelogsMobile] =
        await changelogs.getChangelogs();
    await saveFileText('./data/robots.txt', robots);
    await saveFileText('./data/servers.txt', serversData);
    await saveFile('./data/servers_sitemaps.json', serverSitemaps);
    await saveFile('./data/domains.json', domainsData);
    await saveFile('./data/powerups.json', powerupsData);
    await saveFile('./data/skus.json', skusData);
    await saveFile('./data/skus_apps_listings.json', skuAppsData);
    await saveFile('./data/changelogs_desktop.json', changelogsDesktop);
    await saveFile('./data/changelogs_mobile.json', changelogsMobile);
    await saveFileText(
        './data/acknowledgements.md',

        acknowledgementsData,
    );

    await saveFile(
        './data/collectibles/marketing.json',
        marketingData || 'invalid data',
    );
    await saveFileText('./data/csp.txt', cspData);
    await saveFile(
        './data/collectibles/categories.json',
        collectiblesCategories,
    );

    // start diff action
    await changelogs.diff(oldChangeLogsDesktop, changelogsDesktop, 'Desktop');
    await changelogs.diff(oldChangeLogsMobile, changelogsMobile, 'Mobile');
    await csp.diff(oldCSP, cspData);
    await categories.diff(oldCategories, collectiblesCategories);
    await acknowledgements.diff(oldAcknowledgements, acknowledgementsData);
    await robots_.diff(oldRobots, robots);
    await marketing.diff(oldMarketing, marketingData);
    await servers.diff(oldServers, serversData);
    //await domains.diff(oldDomains, domainsData);
    await powerups.diff(oldPowerups, powerupsData);
    await skus.diff(oldSkus, skusData);
    await skus.diffSkuApps(oldSkuApps, skuAppsData);
}
main().catch(console.error);
