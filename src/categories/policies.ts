import { mkdir } from 'node:fs/promises';

import { load } from 'cheerio';
import { createTwoFilesPatch } from 'diff';
import TurndownService from 'turndown';

import { configExperimentCentral, configWumpusUniv } from '../config.js';
import { dataPath } from '../paths.js';
import { sendTrackerMessage, target } from '../tracker.js';
import { readFile, saveFileText } from '../utils.js';

const POLICY_PAGES = [
    ['terms', 'Terms of Service'],
    ['privacy', 'Privacy Policy'],
    ['guidelines', 'Community Guidelines'],
    ['acknowledgements', 'Acknowledgements'],
    ['licenses', 'Licences'],
    ['company-information', 'Company Information'],
] as const;
const MAX_HTML_BYTES = 12_000_000;
const MAX_INLINE_DIFF = 1_400;

interface PolicyChange {
    slug: string;
    before: string;
    after: string;
}

async function fetchText(url: string): Promise<string> {
    const response = await fetch(url, {
        signal: AbortSignal.timeout(45_000),
        headers: { 'Accept-Language': 'en-US,en;q=0.9' },
    });
    if (!response.ok)
        throw new Error(`Policies: HTTP ${response.status} fetching ${url}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error(`Policies: empty response from ${url}`);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_HTML_BYTES)
                throw new Error(`Policies: oversized response from ${url}`);
            chunks.push(value);
        }
    } finally {
        await reader.cancel();
    }
    return Buffer.concat(chunks).toString('utf8');
}

function toMarkdown(html: string, slug: string, title: string): string {
    const $ = load(html);
    $(
        'script, style, noscript, nav, footer, header, [hidden], .w-condition-invisible',
    ).remove();
    // ponytail: six known footer documents; add selectors when Discord changes their layouts.
    const main = $('main, .section-rich, .section.guidlines').first();
    const content = main.length
        ? main
        : slug === 'licenses'
          ? $('[class*="document-"]').first()
          : $('section[class*="projectListWrapper"]').first();
    if (!content.length)
        throw new Error(`Policies: document container missing for ${slug}`);
    content.find('a[href]').each((_, element) => {
        const link = $(element);
        const href = link.attr('href')!;
        const resolved = new URL(href, `https://discord.com/${slug}`);
        link.attr(
            'href',
            resolved.protocol === 'http:' && resolved.hostname === 'discord.com'
                ? resolved.href.replace(/^http:/, 'https:')
                : resolved.href,
        );
    });
    const converter = new TurndownService({
        headingStyle: 'atx',
        bulletListMarker: '-',
    });
    const text = converter
        .turndown(content.html() ?? '')
        .replace(/[\u200b-\u200d\ufeff]/g, '')
        .replace(/\r\n/g, '\n')
        .trim();
    if (text.length < 100 || !content.find('h1, h2, h3, p, pre').length) {
        throw new Error(`Policies: empty or unrecognized document for ${slug}`);
    }
    return `# ${title}\n\nSource: https://discord.com/${slug}\n\n${text}\n`;
}

async function documentMarkdown(
    html: string,
    slug: string,
    title: string,
): Promise<string> {
    if (slug !== 'acknowledgements') return toMarkdown(html, slug, title);
    const $ = load(html);
    const scripts = $('script[data-chunk*="Acknowledgements"][src]')
        .map((_, element) => $(element).attr('src')!)
        .get();
    // ponytail: at most eight acknowledgement chunks; revisit if the page splits into more chunks.
    let lastError: unknown;
    for (const src of scripts.slice(0, 8).reverse()) {
        const url = new URL(src, 'https://discord.com');
        if (
            url.origin !== 'https://discord.com' ||
            !url.pathname.startsWith('/assets/')
        )
            continue;
        let script: string;
        try {
            script = await fetchText(url.href);
        } catch (error) {
            lastError = error;
            continue;
        }
        const literal = script.match(/\.exports=("(?:\\.|[^"\\])*")/)?.[1];
        if (!literal) continue;
        const modules: unknown = JSON.parse(literal);
        if (
            typeof modules !== 'string' ||
            !modules.startsWith('* [') ||
            !modules.includes('](')
        )
            continue;
        return `# ${title}\n\nSource: https://discord.com/${slug}\n\n${modules.trim()}\n`;
    }
    throw new Error(
        `Policies: acknowledgements library list missing; refusing an empty baseline. ${String(lastError ?? '')}`,
    );
}

async function getPolicies(): Promise<PolicyChange[]> {
    await mkdir(dataPath('policies'), { recursive: true });
    const changes: PolicyChange[] = [];
    const failures: unknown[] = [];
    // Sequential requests avoid fetching all six documents simultaneously.
    for (const [slug, title] of POLICY_PAGES) {
        try {
            const file = dataPath(`policies/${slug}.md`);
            let before: string | undefined;
            try {
                before = await readFile<string>(file, false);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                    throw error;
            }
            const after = await documentMarkdown(
                await fetchText(`https://discord.com/${slug}`),
                slug,
                title,
            );
            await saveFileText(file, after);
            if (before !== undefined && before !== after)
                changes.push({ slug, before, after });
        } catch (error) {
            failures.push(error);
        }
    }
    for (const failure of failures) console.error(failure);
    if (failures.length === POLICY_PAGES.length) {
        throw new AggregateError(failures, 'All policy pages failed');
    }
    return changes;
}

function notification(change: PolicyChange): string {
    const heading = `Policy updated: https://discord.com/${change.slug}`;
    const patch = createTwoFilesPatch(
        change.slug,
        change.slug,
        change.before,
        change.after,
        undefined,
        undefined,
        { context: 2, timeout: 1_000, maxEditLength: 2_000 },
    );
    if (patch && patch.length <= MAX_INLINE_DIFF && !patch.includes('```')) {
        return `${heading}\n\`\`\`diff\n${patch}\`\`\``;
    }
    return `${heading}\n${
        process.env.COMMIT_URL
            ? 'Full diff in the data commit below.'
            : `Full Markdown: https://github.com/wavedevgit/discord-datamining_v2/blob/data/policies/${change.slug}.md`
    }`;
}

async function diff(changes: PolicyChange[]): Promise<void> {
    for (const change of changes) {
        await sendTrackerMessage(
            [
                target(
                    'Experiment Central policies',
                    configExperimentCentral.webhooks.policies,
                    configExperimentCentral.pings.policies,
                ),
                target(
                    'Wumpus University policies',
                    configWumpusUniv.webhooks.policies,
                    configWumpusUniv.pings.policies,
                ),
            ],
            { content: notification(change), allowed_mentions: { parse: [] } },
        );
    }
}

export { toMarkdown, notification, POLICY_PAGES };
export type { PolicyChange };
export default { getPolicies, diff };
