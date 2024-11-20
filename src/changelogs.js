import { WEBHOOKS_URLS, PINGS } from './config.js';
import sendReq from './utils/RestApi.js';
import sendToWebhook from './utils/sendToWebhook.js';

async function getChangelogs() {
    const changelogsDesktop = await (
        await sendReq({
            url: 'https://cdn.discordapp.com/changelogs/config_0.json',
        })
    ).json();
    const changelogsMobile = await (
        await sendReq({
            url: 'https://cdn.discordapp.com/changelogs/config_1.json',
        })
    ).json();
    let resultMobile = [];
    let resultDesktop = [];
    for (let changelogId in changelogsDesktop) {
        let content = await (
            await sendReq({
                url: `https://cdn.discordapp.com/changelogs/0/${changelogId}/en-US.json`,
            })
        ).json();
        let obj = {
            ...changelogsDesktop[changelogId],
            ...content,
        };
        resultDesktop.push(obj);
    }
    for (let changelogId in changelogsMobile) {
        let content = await (
            await sendReq({
                url: `https://cdn.discordapp.com/changelogs/1/${changelogId}/en-US.json`,
            })
        ).json();
        let obj = {
            ...changelogsMobile[changelogId],
            ...content,
        };
        resultMobile.push(obj);
    }

    return [resultDesktop, resultMobile];
}
function generateEmbed(changelog) {
    return {
        description: changelog.content.length > 4096 ? changelog.content.slice(3999) + '...' : changelog.content,
        image: {
            url:
                changelog.asset_type === 1
                    ? changelog.asset
                    : `https://img.youtube.com/vi/${changelog.asset}/hqdefault.jpg`,
        },
        fields: [
            {
                name: 'Changelog ID',
                value: `**\`${changelog.changelog_id}\`**`,
                inline: true,
            },
            {
                name: 'Entry ID',
                value: `**\`${changelog.entry_id}\`**`,
                inline: true,
            },
            {
                name: 'Date',
                value: `**\`${changelog.date}\`**`,
                inline: true,
            },
            {
                name: 'Asset Type',
                value: `**\`${changelog.asset_type === 0 ? 'Youtube Video' : 'Image'}\`**`,
                inline: true,
            },
            {
                name: 'Asset URL',
                value: `**\`${
                    changelog.asset_type === 0 ? `https://youtube.com/watch?v=${changelog.asset}` : changelog.asset
                }\`**`,
                inline: true,
            },
        ],
    };
}
function diff(a, b, type) {
    let diff = { added: [], removed: [] };
    for (let changelog of a) {
        // removed
        if (b.filter((changelog_) => changelog_.changelog_id !== changelog.changelog_id)) diff.removed.push(changelog);
    }
    for (let changelog of b) {
        // added
        if (a.filter((changelog_) => changelog_.changelog_id !== changelog.changelog_id)) diff.added.push(changelog);
    }
    let result = [];

    for (let changelog of diff.removed) {
        result.push({
            title: `Changelogs - Removed (${type})`,
            color: 0xff0000,
            ...generateEmbed(changelog),
        });
    }
    for (let changelog of diff.added) {
        result.push({
            title: `Changelogs - Added (${type})`,
            color: 0x008000,
            ...generateEmbed(changelog),
        });
    }
    if (result.length)
        sendToWebhook(WEBHOOKS_URLS.changelogs, {
            content: PINGS.changelogs,
            embeds: result,
        });
}
export default { getChangelogs, diff };
