import { configExperimentCentral, configWumpusUniv } from "../config.js";
import { sendToWebhook } from "../utils.js";

async function getCSP() {
  const response = await fetch("https://canary.discord.com/app", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  return (response.headers.get("content-security-policy") ?? "")
    .replace(/'nonce-[^']+'/g, "'nonce-{NONCE}'");
}

async function diff(oldContent: string, newContent: string) {
  const oldTokens = oldContent
    .trim()
    .replace(/\s+/g, " ")
    .split(" ");

  const newTokens = newContent
    .trim()
    .replace(/\s+/g, " ")
    .split(" ");

  const removed = oldTokens.filter(
    token =>
      !newTokens.includes(token) &&
      !token.startsWith("'nonce-")
  ).sort();

  const added = newTokens.filter(
    token =>
      !oldTokens.includes(token) &&
      !token.startsWith("'nonce-")
  ).sort();

  if (!removed.length && !added.length) return;

  let result = "```diff\n";

  for (const token of removed) {
    result += `- ${token}\n`;
  }

  for (const token of added) {
    result += `+ ${token}\n`;
  }

  result += "```";

  try {
    await sendToWebhook(configExperimentCentral.webhooks.csp, {
      content: configExperimentCentral.pings.csp + "\n" + result,
    });
  } catch (e) {
    console.error("Failed to send central csp diff:", e);
  }

  try {
    await sendToWebhook(configWumpusUniv.webhooks.csp, {
      content: configWumpusUniv.pings.csp + "\n" + result,
    });
  } catch (e) {
    console.error("Failed to send wumpus csp diff:", e);
  }
}

export default { getCSP, diff };
