import { configExperimentCentral, configWumpusUniv } from '../config.js';
import { changedKeys, diffByKey, sendTrackerMessage, target } from '../tracker.js';
import { DiscordEmbed } from '../types.js';
import { sendReq } from '../utils.js';

interface Activity extends Record<string, unknown> {
    application_id: string;
}

interface ActivitiesResponse {
    activities: Activity[];
}

async function getActivities(): Promise<ActivitiesResponse> {
    const response = await sendReq({
        url: 'activities/shelf?guild_id=612443491770957833',
    });
    if (!response.ok) throw new Error(`Failed to fetch activities: HTTP ${response.status}`);
    return response.json() as Promise<ActivitiesResponse>;
}

function activityEmbed(
    activity: Activity,
    change: 'Added' | 'Removed' | 'Updated',
    changes: string[] = [],
): DiscordEmbed {
    return {
        title: `Activities - ${change}`,
        description: `[Open activity](https://discord.com/activities/${activity.application_id})`,
        color: change === 'Removed' ? 0xff0000 : change === 'Added' ? 0x008000 : 0xffa500,
        fields: [
            { name: 'Application ID', value: activity.application_id, inline: true },
            {
                name: 'Activity URL',
                value: `https://${activity.application_id}.discordsays.com`,
                inline: true,
            },
            ...(changes.length
                ? [{ name: 'Changed fields', value: changes.join(', ') }]
                : []),
        ],
    };
}

async function diff(before: ActivitiesResponse, after: ActivitiesResponse): Promise<void> {
    const changes = diffByKey(
        before.activities,
        after.activities,
        ({ application_id }) => application_id,
    );
    const embeds: DiscordEmbed[] = [
        ...changes.removed.map((activity) => activityEmbed(activity, 'Removed')),
        ...changes.added.map((activity) => activityEmbed(activity, 'Added')),
        ...changes.updated.map(({ before: previous, after: activity }) =>
            activityEmbed(activity, 'Updated', changedKeys(previous, activity)),
        ),
    ];
    if (!embeds.length) return;

    await sendTrackerMessage(
        [
            target(
                'Experiment Central activities',
                configExperimentCentral.webhooks.activities,
                configExperimentCentral.pings.activities,
            ),
            target(
                'Wumpus University activities',
                configWumpusUniv.webhooks.activities,
                configWumpusUniv.pings.activities,
            ),
        ],
        { embeds },
    );
}

export default { getActivities, diff };
export type { ActivitiesResponse };
