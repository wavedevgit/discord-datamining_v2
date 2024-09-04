import { WEBHOOKS_URLS, PINGS } from './config.js';
import sendReq from './utils/RestApi.js';
import sendToWebhook from './utils/sendToWebhook.js';

async function getActivities() {
    const activities = await (
        await sendReq({
            url: 'activities/shelf?guild_id=612443491770957833',
        })
    ).json();

    return activities;
}

/** differ for our webhook, each module has to have a differ that generates an embed. */
function diff(a, b) {
    const result = [];
    const diff = { removed: [], added: [] };
    const aIds = a.activities.map((activity) => activity.application_id);
    const bIds = b.activities.map((activity) => activity.application_id);
    const names = {};

    for (let activityId of aIds) {
        // removed
        if (!bIds.includes(activityId)) {
            diff.removed.push(a.activities.find((activity) => activity.application_id == activityId));
        }
    }

    for (let activityId of bIds) {
        // added
        if (!aIds.includes(activityId)) {
            diff.added.push(b.activities.find((activity) => activity.application_id == activityId));
        }
    }

    if (diff.added.length)
        result.push(
            '## Activites - Added\n',
            ...diff.added.map(
                (activity) =>
                    `https://discord.com/activities/${activity.application_id} - \`https://${activity.application_id}.discordsays.com\`\n`,
            ),
        );

    if (diff.removed.length)
        result.push(
            '## Activites - Removed',
            ...diff.removed.map(
                (activity) =>
                    `https://discord.com/activities/${activity.application_id} - \`https://${activity.application_id}.discordsays.com\``,
            ),
        );

    if (result.length) {
        sendToWebhook(WEBHOOKS_URLS.activities, {
            content: PINGS.activities + '\n' + result.join('\n'),
        });
        sendToWebhook(process.env.ACTIVIESWC, {
            content: PINGS.activities + '\n' + result.join('\n'),
        });
    }
}

export default { getActivities, diff };
