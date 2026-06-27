import { configExperimentCentral, configWumpusUniv } from '../config.js';
import { sendToWebhook } from '../utils.js';

const SKU_URL = 'https://canary.discord.com/api/v9/store/published-listings/skus';

async function getSkus(skus) {
    const remaining = [];
    for (const sku of skus) {
        try {
            const res = await fetch(`${SKU_URL}/${sku}?country_code=US&variants_return_style=2`);
            if (res.status !== 200) {
                remaining.push(sku);
            }
        } catch {
            remaining.push(sku);
        }
    }
    return remaining;
}

function diff(a, b) {
    const published = a.filter(sku => !b.includes(sku));
    if (!published.length) return;

    const result = published.map(sku => ({
        title: 'SKU Published!',
        fields: [
            { name: 'SKU ID', value: sku, inline: true },
            { name: 'View SKU', value: `[view sku](${SKU_URL}/${sku}?country_code=US&variants_return_style=2)`, inline: true },
        ],
        color: 0x008000,
    }));

    sendToWebhook(configExperimentCentral.webhooks.skus, {
        content: configExperimentCentral.pings.skus,
        embeds: result,
    });
    sendToWebhook(configWumpusUniv.webhooks.skus, {
        content: configWumpusUniv.pings.skus,
        embeds: result,
    });
}

async function getSkuApps(appIds) {
    const allListings = [];
    for (const appId of appIds) {
        try {
            const res = await fetch(`${SKU_URL}?application_id=${appId}`);
            const data = await res.json();
            allListings.push(...data);
        } catch {}
    }
    return allListings;
}

function diffSkuApps(a, b) {
    const aIds = a.map(l => l.sku.id);
    const bIds = b.map(l => l.sku.id);
    const newListings = b.filter(l => !aIds.includes(l.sku.id));
    if (!newListings.length) return;

    const result = newListings.map(l => ({
        title: 'New SKU Published!',
        fields: [
            { name: 'Name', value: l.sku.name, inline: true },
            { name: 'App ID', value: l.sku.application_id, inline: true },
            { name: 'SKU ID', value: l.sku.id, inline: true },
            { name: 'View SKU', value: `[view sku](${SKU_URL}/${l.sku.id}?country_code=US&variants_return_style=2)`, inline: true },
        ],
        color: 0x008000,
    }));

    sendToWebhook(configExperimentCentral.webhooks.skus, {
        content: configExperimentCentral.pings.skus,
        embeds: result,
    });
    sendToWebhook(configWumpusUniv.webhooks.skus, {
        content: configWumpusUniv.pings.skus,
        embeds: result,
    });
}

export default { getSkus, diff, getSkuApps, diffSkuApps };
