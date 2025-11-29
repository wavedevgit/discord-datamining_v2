import { configExperimentCentral, configWumpusUniv } from '../../config.js';
import { sendReq, sendToWebhook } from '../../utils.js';

async function getMarketing() {
    const marketing = await (
        await sendReq({
            url: 'users/@me/collectibles-marketing?platform=0',
        })
    ).json();

    return marketing.marketings;
}



/** differ for our webhook, each module has to have a differ that generates an embed. */
function diff(a, b) {
    const result = [];


    if (b[2].title === "Create your dream look") {
        sendToWebhook(configExperimentCentral.webhooks.collectibles.categories, {
            content: configWumpusUniv.pings.collectibles.categories + "\n" + "New category might be uploaded (collectibles marketing is back to default)",
            embeds: result,
        });
        sendToWebhook(configWumpusUniv.webhooks.collectibles.categories, {
            content: configWumpusUniv.pings.collectibles.categories + "\n" +  "New category might be uploaded (collectibles marketing is back to default)",
        });
    }
}

export default { getMarketing, diff };
