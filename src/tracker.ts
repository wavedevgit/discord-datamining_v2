import { isDeepStrictEqual } from 'node:util';

import { WebhookMessage, WebhookTarget } from './types.js';
import { sendToWebhook } from './utils.js';

interface Updated<T> {
    before: T;
    after: T;
}

interface EntityDiff<T> {
    added: T[];
    removed: T[];
    updated: Updated<T>[];
}

interface TextDiff {
    added: string[];
    removed: string[];
}

function indexBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T> {
    const result = new Map<string, T>();
    for (const item of items) {
        const itemKey = key(item);
        if (result.has(itemKey)) throw new Error(`Duplicate tracker key: ${itemKey}`);
        result.set(itemKey, item);
    }
    return result;
}

function diffByKey<T>(
    before: readonly T[],
    after: readonly T[],
    key: (item: T) => string,
    equal: (before: T, after: T) => boolean = isDeepStrictEqual,
): EntityDiff<T> {
    const beforeByKey = indexBy(before, key);
    const afterByKey = indexBy(after, key);
    const added: T[] = [];
    const removed: T[] = [];
    const updated: Updated<T>[] = [];

    for (const [itemKey, item] of beforeByKey) {
        const next = afterByKey.get(itemKey);
        if (!next) removed.push(item);
        else if (!equal(item, next)) updated.push({ before: item, after: next });
    }
    for (const [itemKey, item] of afterByKey) {
        if (!beforeByKey.has(itemKey)) added.push(item);
    }

    return { added, removed, updated };
}

function normalizedLines(content: string): string[] {
    return content
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line) => line.trimEnd())
        .filter(Boolean);
}

function diffLines(before: string, after: string): TextDiff {
    const beforeLines = new Set(normalizedLines(before));
    const afterLines = new Set(normalizedLines(after));
    return {
        added: [...afterLines].filter((line) => !beforeLines.has(line)),
        removed: [...beforeLines].filter((line) => !afterLines.has(line)),
    };
}

function changedKeys<T extends object>(
    before: T,
    after: T,
    ignored: readonly (keyof T)[] = [],
): string[] {
    const ignoredKeys = new Set<PropertyKey>(ignored);
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys]
        .filter((key) => !ignoredKeys.has(key))
        .filter(
            (key) =>
                !isDeepStrictEqual(
                    before[key as keyof T],
                    after[key as keyof T],
                ),
        )
        .sort();
}

function target(
    name: string,
    url: string | undefined,
    ping: string | undefined,
): WebhookTarget {
    return { name, url, ping };
}

async function sendTrackerMessage(
    targets: readonly WebhookTarget[],
    message: WebhookMessage,
): Promise<void> {
    const configured = targets.filter(({ url }) => Boolean(url));
    if (!configured.length) {
        console.warn('Tracker changed, but no webhook target is configured.');
        return;
    }

    const results = await Promise.allSettled(
        configured.map(async ({ name, url, ping }) => {
            const content = [ping, message.content].filter(Boolean).join('\n');
            try {
                await sendToWebhook(url, { ...message, content: content || undefined });
            } catch (error) {
                throw new Error(`${name}: ${String(error)}`);
            }
        }),
    );
    const failures = results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map(({ reason }) => reason);
    if (failures.length) throw new AggregateError(failures, 'Tracker delivery failed');
}

function formatTextDiff(diff: TextDiff): string | undefined {
    if (!diff.added.length && !diff.removed.length) return undefined;
    const lines = ['```diff'];
    if (diff.removed.length) {
        lines.push(`# Removed (${diff.removed.length})`);
        lines.push(...diff.removed.map((line) => `- ${line}`));
    }
    if (diff.added.length) {
        lines.push(`# Added (${diff.added.length})`);
        lines.push(...diff.added.map((line) => `+ ${line}`));
    }
    lines.push('```');
    return lines.join('\n');
}

export {
    changedKeys,
    diffByKey,
    diffLines,
    formatTextDiff,
    sendTrackerMessage,
    target,
};
export type { EntityDiff, TextDiff, Updated };
