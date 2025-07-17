import { configExperimentCentral, configWumpusUniv } from "../config.js";
import { sendReq, sendToWebhook } from "../utils.js";
import { diffChars } from "diff";

async function getModules() {
  const html = await (
    await fetch("https://canary.discord.com/acknowledgements")
  ).text();
  const scripts = [
    ...html.matchAll(
      /script async data-chunk="refresh-text_pages-Acknowledgements" src="(?<url>\/assets\/.+?\.js)"><\/script>/g
    ),
  ].map((m) => m.groups?.url);
  const script = scripts[scripts.length - 2];
  const content = await (
    await fetch("https://canary.discord.com" + script)
  ).text();
  return content
    .match(/\.exports="(?<modules>\*.+)"/)
    .groups?.modules?.replaceAll("* ", "- ")
    .replaceAll("\\n", "\n");
}

/** differ for our webhook, each module has to have a differ that generates an embed. */
function diff(a, b) {
  let result = "";
  const linesA = a.split("\n");
  const linesB = b.split("\n");
  for (let l = 0; l < linesA.length; l++) {
    // updated
    if (linesA[l] !== linesB[l] && linesB[l] !== undefined) {
      if (result.length === 0) result += "```diff\n";
      result += `# Updated\n- ${linesA[l]}\n+ ${linesB[l]}\n\nn`;
    }
    // removed
    if (linesA[l] !== linesB[l] && linesB[l] === undefined) {
      if (result.length === 0) result += "```diff\n";
      result += `# Removed\n- ${linesA[l]}\n\n`;
    }
  }
  for (let l = 0; l < linesB.length; l++) {
    // added
    if (linesA[l] !== linesB[l] && linesA[l] === undefined) {
      if (result.length === 0) result += "```diff\n";
      result += `# Added\n+ ${linesB[l]}\n`;
    }
  }
  if (result.length !== 0) result += "\n```";
  if (result.length) {
    sendToWebhook(configExperimentCentral.webhooks.acknowledgements, {
      content: configExperimentCentral.pings.acknowledgements + "\n" + result,
    });
    sendToWebhook(configWumpusUniv.webhooks.acknowledgements, {
      content: configWumpusUniv.pings.acknowledgements + "\n" + result,
    });
  }
}

export default { getModules, diff };
