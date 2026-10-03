#!/usr/bin/env node

// Local Anthropic facade for the Codex subscription Responses endpoint.
// The endpoint and its auth headers are not a public API and may change.

import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const HOST = '127.0.0.1';
const PORT = Number(process.env.CODEX_CLAUDE_PROXY_PORT || 8787);
const LOCAL_TOKEN = process.env.CODEX_CLAUDE_PROXY_TOKEN || crypto.randomBytes(24).toString('hex');
const ENDPOINT = process.env.CODEX_RESPONSES_URL || 'https://chatgpt.com/backend-api/codex/responses';
const CODEX_MODEL = process.env.CODEX_MODEL || 'gpt-5.6-sol';
const MAX_BODY = 10 * 1024 * 1024;

const text = (value) => {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.map((part) => part?.type === 'text' ? part.text || '' : '').join('');
};

async function auth() {
  if (process.env.CODEX_ACCESS_TOKEN) {
    return { accessToken: process.env.CODEX_ACCESS_TOKEN, accountId: process.env.CODEX_ACCOUNT_ID };
  }
  const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const data = JSON.parse(await fs.readFile(path.join(home, 'auth.json'), 'utf8'));
  const token = data.tokens?.access_token || data.access_token;
  if (!token) throw new Error('No Codex access token found. Run `codex login`.');
  return { accessToken: token, accountId: data.tokens?.account_id || data.account_id };
}

function toResponses(body) {
  const input = [];
  for (const message of body.messages || []) {
    for (const part of Array.isArray(message.content) ? message.content : [{ type: 'text', text: message.content }]) {
      if (part.type === 'text') input.push({ role: message.role, content: [{ type: 'input_text', text: part.text || '' }] });
      else if (part.type === 'tool_result') {
        input.push({ type: 'function_call_output', call_id: part.tool_use_id, output: text(part.content) });
      } else if (part.type === 'tool_use') {
        input.push({ type: 'function_call', call_id: part.id, name: part.name, arguments: JSON.stringify(part.input ?? {}) });
      }
    }
  }
  const request = {
    model: CODEX_MODEL,
    instructions: text(body.system),
    input,
    tools: (body.tools || []).map((tool) => ({ type: 'function', name: tool.name, description: tool.description || '', parameters: tool.input_schema || {} })),
    stream: true,
    store: false,
  };
  if (body.tool_choice && body.tool_choice.type === 'tool') request.tool_choice = { type: 'function', name: body.tool_choice.name };
  else if (body.tool_choice?.type === 'any') request.tool_choice = 'required';
  else if (body.tool_choice?.type === 'none') request.tool_choice = 'none';
  return request;
}

function fromResponses(data, requestedModel) {
  const content = [];
  for (const item of data.output || []) {
    if (item.type === 'message') {
      for (const part of item.content || []) if (part.type === 'output_text') content.push({ type: 'text', text: part.text || '' });
    }
    if (item.type === 'function_call') {
      let input = {};
      try { input = JSON.parse(item.arguments || '{}'); } catch { input = {}; }
      content.push({ type: 'tool_use', id: item.call_id || item.id, name: item.name, input });
    }
  }
  const hasTool = content.some((part) => part.type === 'tool_use');
  return {
    id: `msg_${crypto.randomBytes(12).toString('hex')}`,
    type: 'message', role: 'assistant', model: requestedModel || data.model || 'codex',
    content, stop_reason: hasTool ? 'tool_use' : 'end_turn', stop_sequence: null,
    usage: { input_tokens: data.usage?.input_tokens || 0, output_tokens: data.usage?.output_tokens || 0 },
  };
}

async function callCodex(body) {
  const credentials = await auth();
  const headers = { authorization: `Bearer ${credentials.accessToken}`, 'content-type': 'application/json', originator: 'claude-code-local-proxy' };
  if (credentials.accountId) headers['chatgpt-account-id'] = credentials.accountId;
  const response = await fetch(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(toResponses(body)) });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Codex responded ${response.status}: ${raw.slice(0, 1000)}`);
  let completed;
  let streamedText = '';
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    try {
      const event = JSON.parse(line.slice(5).trim());
      if (event.type === 'response.output_text.delta') streamedText += event.delta || '';
      if (event.type === 'response.completed') completed = event.response;
    } catch {
      // Ignore keep-alives and incomplete SSE records.
    }
  }
  if (!completed) {
    try { completed = JSON.parse(raw); } catch { /* handled below */ }
  }
  if (!completed) throw new Error('Codex stream ended without response.completed');
  if (!completed.output?.length && streamedText) {
    completed.output = [{ type: 'message', content: [{ type: 'output_text', text: streamedText }] }];
  }
  return fromResponses(completed, body.model);
}

function reply(res, status, body) {
  const raw = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(raw) });
  res.end(raw);
}

function streamReply(res, message) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  res.write(`event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message })}\n\n`);
  message.content.forEach((part, index) => {
    res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index, content_block: part.type === 'text' ? { type: 'text', text: '' } : { type: 'tool_use', id: part.id, name: part.name, input: {} } })}\n\n`);
    if (part.type === 'text') res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: part.text } })}\n\n`);
    if (part.type === 'tool_use') res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(part.input) } })}\n\n`);
    res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index })}\n\n`);
  });
  res.write(`event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: message.stop_reason, stop_sequence: null }, usage: message.usage })}\n\n`);
  res.write(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
  res.end();
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/v1/messages') return reply(res, 404, { error: { type: 'not_found', message: 'POST /v1/messages only' } });
  if (req.headers.authorization !== `Bearer ${LOCAL_TOKEN}`) return reply(res, 401, { error: { type: 'authentication_error', message: 'Invalid local proxy token' } });
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; if (raw.length > MAX_BODY) req.destroy(); });
  req.on('end', async () => {
    try {
      const body = JSON.parse(raw);
      const message = await callCodex(body);
      body.stream ? streamReply(res, message) : reply(res, 200, message);
    } catch (error) {
      reply(res, 502, { error: { type: 'api_error', message: error.message } });
    }
  });
});

server.listen(PORT, HOST, () => {
  console.error(`Claude -> Codex bridge listening on http://${HOST}:${PORT}`);
  console.error(`Claude Code API key: ${LOCAL_TOKEN}`);
});
