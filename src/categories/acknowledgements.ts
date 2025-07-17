import { configExperimentCentral, configWumpusUniv } from "../config.js";
import { sendReq, sendToWebhook } from "../utils.js";

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
  const result = [];
  const diff = { removed: [], added: [] };
  const aIds = a.activities.map((activity) => activity.application_id);
  const bIds = b.activities.map((activity) => activity.application_id);
  const names = {};

  for (let activityId of aIds) {
    // removed
    if (!bIds.includes(activityId)) {
      diff.removed.push(
        a.activities.find((activity) => activity.application_id == activityId)
      );
    }
  }

  for (let activityId of bIds) {
    // added
    if (!aIds.includes(activityId)) {
      diff.added.push(
        b.activities.find((activity) => activity.application_id == activityId)
      );
    }
  }

  if (diff.added.length)
    result.push(
      "## Activites - Added\n",
      ...diff.added.map(
        (activity) =>
          `https://discord.com/activities/${activity.application_id} - \`https://${activity.application_id}.discordsays.com\`\n`
      )
    );

  if (diff.removed.length)
    result.push(
      "## Activites - Removed",
      ...diff.removed.map(
        (activity) =>
          `https://discord.com/activities/${activity.application_id} - \`https://${activity.application_id}.discordsays.com\``
      )
    );

  if (result.length) {
    sendToWebhook(configExperimentCentral.webhooks.activities, {
      content:
        configExperimentCentral.pings.activities + "\n" + result.join("\n"),
    });
    sendToWebhook(configWumpusUniv.webhooks.activities, {
      content: configWumpusUniv.pings.activities + "\n" + result.join("\n"),
    });
  }
}

export default { getModules, diff };
