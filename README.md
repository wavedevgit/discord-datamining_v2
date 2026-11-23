# please for god sake dont fork this or use it THIS IS MEANT FOR A PRIVATE PROJECT....

## Branches

| Branch | Contents |
| --- | --- |
| `src` (default) | Trackers, workflows, docs. No data. |
| `data` | Machine-written JSON/text only, at the branch root. Rewritten every five minutes by `.github/workflows/mine.yml`. |

`src` writes into `DATA_DIR` (default `./data`, absolute path in CI). Run locally with the
data branch next to this tree:

```sh
git clone -b data git@github.com:wavedevgit/discord-datamining_v2.git data
npm ci && npm run build && npm run start
```

Data is read straight from the branch:

```
https://raw.githubusercontent.com/wavedevgit/discord-datamining_v2/data/domains.json
```

## Local Claude-to-Codex bridge

This repository includes `codex-claude-proxy.js`, a loopback-only adapter for using the
authenticated Codex subscription from an Anthropic-compatible client. It reads the local
Codex access token at request time and never logs or exposes it.

Start it after completing `codex login`:

```sh
CODEX_CLAUDE_PROXY_TOKEN='choose-a-local-secret' node codex-claude-proxy.js
```

Configure the client with:

- Base URL: `http://127.0.0.1:8787`
- API key: the value of `CODEX_CLAUDE_PROXY_TOKEN`
- Endpoint: `/v1/messages`

Set `CODEX_MODEL` to override the default `gpt-5.6-sol` model, or
`CODEX_RESPONSES_URL` to override the upstream endpoint. Claude Code system instructions
and function tools are translated to the Responses format, and returned function calls
are translated back to Anthropic `tool_use` blocks.
