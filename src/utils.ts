import fs from 'node:fs/promises';

import { ApiBaseUrl, headers } from './config.js';
import {
    DiscordEmbed,
    HttpMethod,
    RestApiRequestData,
    WebhookMessage,
} from './types.js';

const SUPER_PROPERTIES_URL =
    'https://gist.githubusercontent.com/MinerPL/731977099ca84bef7ad0a66978010045/raw/a39b41a94455253dc956445142ddea765f325d55/canary.txt';
const MAX_WEBHOOK_CONTENT = 2_000;
const MAX_EMBEDS = 10;
const MAX_EMBED_CHARACTERS = 6_000;
const MAX_ATTEMPTS = 4;

let superPropertiesPromise: Promise<string | undefined> | undefined;

async function atomicWrite(file: string, content: string): Promise<void> {
    const temporaryFile = `${file}.tmp`;
    await fs.writeFile(temporaryFile, content, 'utf-8');
    await fs.rename(temporaryFile, file);
}

async function saveFile(file: string, data: unknown): Promise<void> {
    await atomicWrite(file, JSON.stringify(data, null, 4));
}

async function saveFileText(file: string, data: string): Promise<void> {
    await atomicWrite(file, data);
}

async function readFile<T = unknown>(file: string, parseJson = true): Promise<T> {
    const content = await fs.readFile(file, 'utf-8');
    return (parseJson ? JSON.parse(content) : content) as T;
}

function resolveDiscordUrl(value: string): string {
    if (/^https?:\/\//.test(value)) return value;
    if (value.startsWith('/api/')) return `https://canary.discord.com${value}`;
    return new URL(value.replace(/^\/+/, ''), ApiBaseUrl).toString();
}

async function getSuperProperties(): Promise<string | undefined> {
    superPropertiesPromise ??= fetch(SUPER_PROPERTIES_URL)
        .then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.text();
        })
        .catch((error: unknown) => {
            console.warn('Failed to load X-Super-Properties:', error);
            return undefined;
        });
    return superPropertiesPromise;
}

async function sendReq(data: RestApiRequestData): Promise<Response> {
    const url = resolveDiscordUrl(data.url);
    const requestHeaders = Object.fromEntries(
        Object.entries(headers).filter(
            (entry): entry is [string, string] => entry[1] !== undefined,
        ),
    );
    const method: HttpMethod = data.method ?? 'GET';

    if (!requestHeaders.Authorization) delete requestHeaders.Authorization;
    if (data.auth !== false) {
        const superProperties = await getSuperProperties();
        if (superProperties) requestHeaders['X-Super-Properties'] = superProperties;
    } else {
        delete requestHeaders.Authorization;
    }

    const init: RequestInit = { method, headers: requestHeaders };
    if (data.body !== undefined) {
        init.body = JSON.stringify(data.body);
        requestHeaders['Content-Type'] = 'application/json';
    }

    return fetch(url, init);
}

function truncate(value: string | undefined, limit: number): string | undefined {
    if (value === undefined || value.length <= limit) return value;
    if (limit <= 3) return value.slice(0, Math.max(0, limit));
    return `${value.slice(0, limit - 3)}...`;
}

function sanitizeEmbed(embed: DiscordEmbed): DiscordEmbed {
    const sanitized: DiscordEmbed = {
        ...embed,
        title: truncate(embed.title, 256),
        description: truncate(embed.description, 4_096),
        fields: undefined,
        footer: embed.footer
            ? { text: truncate(embed.footer.text, 2_048) ?? '' }
            : undefined,
        author: embed.author
            ? { name: truncate(embed.author.name, 256) ?? '' }
            : undefined,
    };
    let budget = MAX_EMBED_CHARACTERS - embedCharacterCount(sanitized);
    const fields = [];
    for (const field of embed.fields?.slice(0, 25) ?? []) {
        if (budget < 2) break;
        const name = truncate(field.name, Math.min(256, budget - 1)) ?? '';
        budget -= name.length;
        const value = truncate(field.value, Math.min(1_024, budget)) ?? '';
        budget -= value.length;
        fields.push({ ...field, name, value });
    }
    if (fields.length) sanitized.fields = fields;
    return sanitized;
}

function embedCharacterCount(embed: DiscordEmbed): number {
    return (
        (embed.title?.length ?? 0) +
        (embed.description?.length ?? 0) +
        (embed.footer?.text.length ?? 0) +
        (embed.author?.name.length ?? 0) +
        (embed.fields?.reduce(
            (total, field) => total + field.name.length + field.value.length,
            0,
        ) ?? 0)
    );
}

function splitPlainText(content: string, limit: number): string[] {
    const chunks: string[] = [];
    let remaining = content;

    while (remaining.length > limit) {
        let splitAt = remaining.lastIndexOf('\n', limit);
        if (splitAt <= 0) splitAt = limit;
        chunks.push(remaining.slice(0, splitAt));
        remaining = remaining.slice(splitAt).replace(/^\n/, '');
    }
    if (remaining) chunks.push(remaining);
    return chunks;
}

function splitWebhookContent(content: string): string[] {
    if (content.length <= MAX_WEBHOOK_CONTENT) return [content];

    const fenced = content.match(/^([\s\S]*?)(```[^\n]*\n)([\s\S]*)(```)[ \t]*$/);
    if (!fenced) return splitPlainText(content, MAX_WEBHOOK_CONTENT);

    const [, prefix, opening, body, closing] = fenced;
    const chunks: string[] = [];
    let remaining = body;
    let first = true;

    while (remaining) {
        const currentPrefix = first ? prefix : '';
        const available = MAX_WEBHOOK_CONTENT - currentPrefix.length - opening.length - closing.length;
        let splitAt = Math.min(remaining.length, available);
        if (remaining.length > available) {
            const newline = remaining.lastIndexOf('\n', available);
            if (newline > 0) splitAt = newline;
        }
        chunks.push(`${currentPrefix}${opening}${remaining.slice(0, splitAt)}${closing}`);
        remaining = remaining.slice(splitAt).replace(/^\n/, '');
        first = false;
    }

    return chunks;
}

function batchEmbeds(embeds: DiscordEmbed[]): DiscordEmbed[][] {
    const batches: DiscordEmbed[][] = [];
    let batch: DiscordEmbed[] = [];
    let characters = 0;

    for (const rawEmbed of embeds) {
        const embed = sanitizeEmbed(rawEmbed);
        const embedCharacters = embedCharacterCount(embed);
        if (
            batch.length > 0 &&
            (batch.length === MAX_EMBEDS ||
                characters + embedCharacters > MAX_EMBED_CHARACTERS)
        ) {
            batches.push(batch);
            batch = [];
            characters = 0;
        }
        batch.push(embed);
        characters += embedCharacters;
    }
    if (batch.length) batches.push(batch);
    return batches;
}

function splitWebhookPayload(message: WebhookMessage): WebhookMessage[] {
    const contentChunks = message.content
        ? splitWebhookContent(message.content)
        : [];
    const embedBatches = batchEmbeds(message.embeds ?? []);
    const count = Math.max(contentChunks.length, embedBatches.length, 1);

    return Array.from({ length: count }, (_, index) => ({
        content: contentChunks[index],
        embeds: embedBatches[index],
        allowed_mentions: message.allowed_mentions,
    })).filter((payload) => payload.content || payload.embeds?.length);
}

function wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function postWebhook(url: string, message: WebhookMessage): Promise<void> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const response = await fetch(resolveDiscordUrl(url), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message),
        });

        if (response.ok) return;

        const responseBody = await response.text();
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt === MAX_ATTEMPTS - 1) {
            throw new Error(
                `Webhook failed with HTTP ${response.status}: ${responseBody.slice(0, 500)}`,
            );
        }

        let retryAfter = Number(response.headers.get('retry-after')) * 1_000;
        if (response.status === 429) {
            try {
                const parsed = JSON.parse(responseBody) as { retry_after?: number };
                if (parsed.retry_after !== undefined) {
                    retryAfter = parsed.retry_after * 1_000;
                }
            } catch {}
        }
        await wait(Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter
            : 500 * 2 ** attempt);
    }
}

async function sendToWebhook(
    url: string | undefined,
    message: WebhookMessage,
): Promise<void> {
    if (!url) return;
    const payloads = splitWebhookPayload(message);
    for (const payload of payloads) await postWebhook(url, payload);
}

export {
    readFile,
    saveFile,
    saveFileText,
    sendReq,
    sendToWebhook,
    splitWebhookPayload,
};
