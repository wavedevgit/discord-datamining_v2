import { configExperimentCentral, configWumpusUniv } from '../../config.js';
import { changedKeys, diffByKey, sendTrackerMessage, target } from '../../tracker.js';
import { DiscordEmbed } from '../../types.js';
import { sendReq } from '../../utils.js';

interface ProfileEffect extends Record<string, unknown> {
    sku_id: string;
    title: string;
    description: string;
    thumbnailPreviewSrc?: string;
    effects: Array<{ src: string }>;
}

function normalizeProfileEffects(effects: ProfileEffect[]): ProfileEffect[] {
    const cloned = JSON.parse(JSON.stringify(effects)) as ProfileEffect[];
    cloned.sort((a, b) => a.sku_id.localeCompare(b.sku_id));
    for (const effect of cloned) {
        if (Array.isArray(effect.effects)) {
            effect.effects.sort((a, b) => String(a.src).localeCompare(String(b.src)));
        }
    }
    return cloned;
}

async function getProfileEffects(): Promise<ProfileEffect[]> {
    const response = await sendReq({ url: 'user-profile-effects' });
    const body = await response.json() as {
        profile_effect_configs?: ProfileEffect[];
        message?: string;
    };
    if (!response.ok || !Array.isArray(body.profile_effect_configs)) {
        throw new Error(body.message ?? `Failed to fetch profile effects: HTTP ${response.status}`);
    }
    if (!body.profile_effect_configs.length) {
        throw new Error('Profile effects response is empty');
    }
    return normalizeProfileEffects(body.profile_effect_configs);
}

function profileEffectEmbed(
    profileEffect: ProfileEffect,
    change: 'Added' | 'Removed' | 'Updated',
    changes: string[] = [],
): DiscordEmbed {
    const intro = profileEffect.effects[0]?.src;
    return {
        title: `Collectibles - ${change} Profile Effect`,
        description: intro ? `[Open effect asset](${intro})` : undefined,
        fields: [
            { name: 'Name', value: profileEffect.title || 'Unnamed', inline: true },
            {
                name: 'Description',
                value: profileEffect.description || 'None',
                inline: true,
            },
            { name: 'SKU ID', value: profileEffect.sku_id, inline: true },
            { name: 'Effects', value: String(profileEffect.effects.length), inline: true },
            ...(changes.length
                ? [{ name: 'Changed fields', value: changes.join(', ') }]
                : []),
        ],
        image: profileEffect.thumbnailPreviewSrc
            ? { url: profileEffect.thumbnailPreviewSrc }
            : undefined,
        color: change === 'Removed' ? 0xff0000 : change === 'Added' ? 0x008000 : 0xffa500,
    };
}

async function diff(before: ProfileEffect[], after: ProfileEffect[]): Promise<void> {
    const changes = diffByKey(
        normalizeProfileEffects([...before]),
        normalizeProfileEffects([...after]),
        ({ sku_id }) => sku_id,
    );
    const embeds: DiscordEmbed[] = [
        ...changes.removed.map((effect) => profileEffectEmbed(effect, 'Removed')),
        ...changes.added.map((effect) => profileEffectEmbed(effect, 'Added')),
        ...changes.updated.map(({ before: previous, after: effect }) =>
            profileEffectEmbed(effect, 'Updated', changedKeys(previous, effect))),
    ];
    if (!embeds.length) return;
    await sendTrackerMessage(
        [
            target(
                'Experiment Central profile effects',
                configExperimentCentral.webhooks.collectibles?.profileEffects,
                configExperimentCentral.pings.collectibles?.profileEffects,
            ),
            target(
                'Wumpus University profile effects',
                configWumpusUniv.webhooks.collectibles?.profileEffects,
                configWumpusUniv.pings.collectibles?.profileEffects,
            ),
        ],
        { embeds },
    );
}

export default { getProfileEffects, diff };
export type { ProfileEffect };
