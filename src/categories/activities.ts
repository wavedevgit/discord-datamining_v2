import { configExperimentCentral, configWumpusUniv } from '../config.js';
import { sendReq, sendToWebhook } from '../utils.js';

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
        sendToWebhook(configExperimentCentral.webhooks.activities, {
            content: configExperimentCentral.pings.activities + '\n' + result.join('\n'),
        });
        sendToWebhook(configWumpusUniv.webhooks.activities, {
            content: configWumpusUniv.pings.activities + '\n' + result.join('\n'),
        });
    }
}

export default { getActivities, diff };
