import { configExperimentCentral, configWumpusUniv } from '../config.js';
import { sendToWebhook } from '../utils.js';

const POWERUPS_URL = 'https://raw.githubusercontent.com/nexpid/Themelings/data/source/discord_common/js/shared/shared-constants/Powerups.tsx';

async function getPowerups() {
    const res = await fetch(POWERUPS_URL, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
    });
    const text = await res.text();
    const powerups = [];
    const regex = /var3\['(\w+)'\]\s*=\s*'(\d+)'/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        powerups.push({
            name: match[1],
            sku_id: match[2],
        });
    }
    return powerups;
}

function getFieldsForPowerup(powerup) {
    return [
        { name: 'Name', value: powerup.name, inline: true },
        { name: 'SKU ID', value: powerup.sku_id, inline: true },
        { name: 'View SKU', value: `[view sku](https://canary.discord.com/api/v9/store/published-listings/skus/${powerup.sku_id}?country_code=US&variants_return_style=2)`, inline: true },
    ];
}

function diff(a, b) {
    const result = [];
    const diff = { removed: [], added: [] };

    for (let powerup of a) {
        if (!b.find(p => p.sku_id === powerup.sku_id)) {
            diff.removed.push(powerup);
        }
    }

    for (let powerup of b) {
        if (!a.find(p => p.sku_id === powerup.sku_id)) {
            diff.added.push(powerup);
        }
    }

    for (let powerup of diff.removed) {
        result.push({
            title: 'Powerups — Removed:',
            fields: getFieldsForPowerup(powerup),
            color: 0xff0000,
        });
    }

    for (let powerup of diff.added) {
        result.push({
            title: 'Powerups — Added:',
            fields: getFieldsForPowerup(powerup),
            color: 0x008000,
        });
    }

    if (result.length) {
        sendToWebhook(configExperimentCentral.webhooks.powerups, {
            content: configExperimentCentral.pings.powerups,
            embeds: result,
        });
        sendToWebhook(configWumpusUniv.webhooks.powerups, {
            content: configWumpusUniv.pings.powerups,
            embeds: result,
        });
    }
}

export default { getPowerups, diff };
