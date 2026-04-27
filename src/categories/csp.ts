import { configExperimentCentral, configWumpusUniv } from "../config.js";
import { sendToWebhook } from "../utils.js";

async function getCSP() {
  const response = await fetch("https://canary.discord.com/app", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  return response.headers.get("content-security-policy") ?? "";
}

function diff(oldContent: string, newContent: string) {
  let result = "";
  const linesA = oldContent.split(";");
  const linesB = newContent.split(";");

  for (let l = 0; l < linesA.length; l++) {
    if (linesA[l]?.trim() !== linesB[l]?.trim() && linesB[l] !== undefined) {
      if (result.length === 0) result += "```diff\n";
      result += `# Updated\n- ${linesA[l]}\n+ ${linesB[l]}\n\n`;
    }
    if (linesA[l]?.trim() !== linesB[l]?.trim() && linesB[l] === undefined) {
      if (result.length === 0) result += "```diff\n";
      result += `# Removed\n- ${linesA[l]}\n\n`;
    }
  }

  for (let l = 0; l < linesB.length; l++) {
    if (linesA[l]?.trim() !== linesB[l]?.trim() && linesA[l] === undefined) {
      if (result.length === 0) result += "```diff\n";
      result += `# Added\n+ ${linesB[l]}\n`;
    }
  }

  if (result.length !== 0) result += "```";

  if (result.length) {
    sendToWebhook(configExperimentCentral.webhooks.robots, {
      content: configExperimentCentral.pings.robots + "\n" + result,
    });
    sendToWebhook(configWumpusUniv.webhooks.robots, {
      content: configWumpusUniv.pings.robots + "\n" + result,
    });
  }
}

export default { getCSP, diff };