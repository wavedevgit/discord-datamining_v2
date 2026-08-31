import assert from 'node:assert/strict';
import test from 'node:test';

import { DiscordEmbed } from './types.js';
import { splitWebhookPayload } from './utils.js';

test('splitWebhookPayload preserves fences while respecting content limits', () => {
    const lines = Array.from({ length: 300 }, (_, index) => `+ changed-${index}`);
    const payloads = splitWebhookPayload({
        content: `<@&123>\n\`\`\`diff\n${lines.join('\n')}\n\`\`\``,
    });

    assert.ok(payloads.length > 1);
    for (const payload of payloads) {
        assert.ok((payload.content?.length ?? 0) <= 2_000);
        assert.match(payload.content ?? '', /```diff\n/);
        assert.match(payload.content ?? '', /```$/);
    }
    assert.match(payloads[0].content ?? '', /^<@&123>/);
    assert.doesNotMatch(payloads[1].content ?? '', /<@&123>/);
});

test('splitWebhookPayload batches and sanitizes embeds to Discord limits', () => {
    const embeds: DiscordEmbed[] = Array.from({ length: 23 }, (_, index) => ({
        title: `Embed ${index}`,
        description: 'x'.repeat(5_000),
        fields: Array.from({ length: 30 }, () => ({
            name: 'n'.repeat(300),
            value: 'v'.repeat(1_200),
        })),
    }));

    const payloads = splitWebhookPayload({ embeds });

    assert.equal(payloads.length, 23);
    for (const payload of payloads) {
        assert.ok((payload.embeds?.length ?? 0) <= 10);
        const embed = payload.embeds?.[0];
        assert.ok((embed?.description?.length ?? 0) <= 4_096);
        assert.ok((embed?.fields?.length ?? 0) <= 25);
        assert.ok((embed?.fields?.[0].name.length ?? 0) <= 256);
        assert.ok((embed?.fields?.[0].value.length ?? 0) <= 1_024);
        const characters =
            (embed?.title?.length ?? 0) +
            (embed?.description?.length ?? 0) +
            (embed?.fields?.reduce(
                (total, field) => total + field.name.length + field.value.length,
                0,
            ) ?? 0);
        assert.ok(characters <= 6_000);
    }
});
