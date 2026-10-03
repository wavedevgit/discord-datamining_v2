# please for god sake dont fork this or use it THIS IS MEANT FOR A PRIVATE PROJECT....

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
