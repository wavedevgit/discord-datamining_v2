import { Config } from './types.js';

const configExperimentCentral: Config = {
    webhooks: {
        collectibles: {
            categories: process.env.CATEGORIES,
            profileEffects: process.env.PROFILEEFFECTS,
            assets: process.env.ASSETS,
        },
        changelogs: process.env.CHANGELOGS,
        activities: process.env.ACTIVITIES,
        status: {
            token: process.env.TOKEN,
        },
    },
    pings: {
        collectibles: {
            categories: '<@&1234231619758587986>',
            profileEffects: '<@&1234231661550370928>',
            assets: '<@&1234231704109977710>',
        },
        activities: '<@&1262808781608452107>',
        changelogs: '<@&1308872618186772480>',
        status: {
            token: '<@1083437693347827764>',
        },
    },
};
const configWumpusUniv: Config = {
    webhooks: {
        collectibles: {
            categories: process.env.EXPCENTRALWEBHOOK,
            profileEffects: process.env.EXPCENTRALWEBHOOK,
        },
        activities: process.env.ACTIVIESWC,
    },
    pings: {
        collectibles: {
            categories: '<@&1309873655085400074>',
            profileEffects: '<@&1309873655085400074>',
        },
        activities: '<@&1309874632127680582>',
    },
};
const headers = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:2.2a1pre) Gecko/20110324 Firefox/4.2a1pre',
    Authorization: process.env.ALT_TOKEN,
};
const ApiBaseUrl = 'https://canary.discord.com/api/v10/';

export { configExperimentCentral, configWumpusUniv, headers, ApiBaseUrl };
