import { configExperimentCentral, configWumpusUniv } from "../config.js";
import { sendToWebhook } from "../utils.js";

/**
 * Fetches robots.txt content from a given URL
 */
async function getRobots(url = "https://discord.com/robots.txt") {
  const content = await (await fetch(url)).text();
  return content.trim();
}

/**
 * Compare two versions of robots.txt and send diffs to webhooks
 */
function diff(oldContent: string, newContent: string) {
  let result = "";
  const linesA = oldContent.split("\n");
  const linesB = newContent.split("\n");

  for (let l = 0; l < linesA.length; l++) {
    if (linesA[l] !== linesB[l] && linesB[l] !== undefined) {
      if (result.length === 0) result += "```diff\n";
      result += `# Updated\n- ${linesA[l]}\n+ ${linesB[l]}\n\n`;
    }
    if (linesA[l] !== linesB[l] && linesB[l] === undefined) {
      if (result.length === 0) result += "```diff\n";
      result += `# Removed\n- ${linesA[l]}\n\n`;
    }
  }

  for (let l = 0; l < linesB.length; l++) {
    if (linesA[l] !== linesB[l] && linesA[l] === undefined) {
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

export default { getRobots, diff };
