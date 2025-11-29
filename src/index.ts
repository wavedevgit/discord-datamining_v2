import { readFile, saveFile, saveFileText, sendToWebhook } from "./utils.js";
import { configExperimentCentral } from "./config.js";
import activities from "./categories/activities.js";
import changelogs from "./categories/changelogs.js";
import profileEffects from "./categories/collectibles/profile-effects.js";
import categories from "./categories/collectibles/categories.js";
import acknowledgements from "./categories/acknowledgements.js";
import robots_ from "./categories/robots.js";

async function main() {
  console.log("Tracker central - V1.0.0");
  const collectiblesCategories = await categories.getCollectiblesCategories();
  const oldActivities = await readFile("./data/activities.json");
  const oldChangeLogsMobile = await readFile("./data/changelogs_mobile.json");
  const oldChangeLogsDesktop = await readFile("./data/changelogs_desktop.json");
  const oldProfileEffects = await readFile(
    "./data/collectibles/profile-effects.json"
  );
  const oldCategories = await readFile("./data/collectibles/categories.json");
  const oldAcknowledgements = await readFile("./data/acknowledgements.md",false);
  const oldRobots = await readFile("./data/robots.txt",false);
  // break, and notify me that i need update token
  if (collectiblesCategories?.message) {
    const res = await await sendToWebhook(
      configExperimentCentral.webhooks.status.token,
      {
        content: `${
          configExperimentCentral.pings.status.token
        } **Your alt token has expired!!!**\n\`\`\`json\n${JSON.stringify(
          categories
        )}\n\`\`\``,
      }
    );
    return;
  }
  const acknowledgementsData =
    "# Acknowledgements\n**Source:** https://canary.discord.com/acknowledgements\n\n" +
    (await acknowledgements.getModules());
  const robots = await robots_.getRobots();
  const profileEffectsData = await profileEffects.getProfileEffects();
  const [changelogsDesktop, changelogsMobile] =
    await changelogs.getChangelogs();
  await saveFileText("./data/robots.txt", robots);
  await saveFile("./data/changelogs_desktop.json", changelogsDesktop);
  await saveFile("./data/changelogs_mobile.json", changelogsMobile);
  await saveFileText(
    "./data/acknowledgements.md",

    acknowledgementsData
  );
  await saveFile(
    "./data/collectibles/profile-effects.json",
    profileEffectsData
  );
  await saveFile("./data/collectibles/categories.json", collectiblesCategories);

  // start diff action
  changelogs.diff(oldChangeLogsDesktop, changelogsDesktop, "Desktop");
  changelogs.diff(oldChangeLogsMobile, changelogsMobile, "Mobile");
  profileEffects.diff(oldProfileEffects, profileEffectsData);
  categories.diff(oldCategories, collectiblesCategories);
  acknowledgements.diff(oldAcknowledgements, acknowledgementsData);
  robots_.diff(oldRobots,robots);
}
main();
