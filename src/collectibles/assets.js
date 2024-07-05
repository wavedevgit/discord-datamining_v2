import { PINGS, WEBHOOKS_URLS } from "../config.js";
import sendReq from "../utils/RestApi.js";
import sendToWebhook from "../utils/sendToWebhook.js";

async function getCollectiblesAssets() {
  // discord patched this
  return [];
}

function formatAssetUrl(asset_id) {
  return `https://cdn.discordapp.com/app-assets/1096190356233670716/${asset_id}.png?size=4096`;
}

/** differ for our webhook, each module has to have a differ that generates an embed. */
function diff(a, b) {
  const result = [];
  const diff = { removed: [], added: [] };

  /** a is before */
  for (let asset in a) {
    const a_id = a[asset].id
    /** removed type */
    if (!b.find(asset=>asset.id === a_id)) {
      diff.removed.push(a[asset]);
    }
  }

  /** b is after */
  for (let asset in b) {
    const b_id = b[asset].id
    /** added type */
    if (!a.find(asset=>asset.id === b_id)) {
      diff.added.push(b[asset]);
    }
  }

  // generate the embed

  if (diff.removed.length > 0) {
    result.push({
      title: "Collectibles — Removed Assets:",
      description: diff.removed
        .map((asset) => `[${asset.name}](${formatAssetUrl(asset.id)})`)
        .join("\n"),
      color: 0xff0000,
    });
  }
  if (diff.added.length > 0) {
    result.push({
      title: "Collectibles — Added Assets:",
      description: diff.added
        .map((asset) => `[${asset.name}](${formatAssetUrl(asset.id)})`)
        .join("\n"),
      color: 0x008000,
    });
  }


  if (result.length) {
    sendToWebhook(WEBHOOKS_URLS.collectibles.assets, {
      content: PINGS.collectibles.assets,
      embeds: result,
    });  
  }
}


export default { getCollectiblesAssets, formatAssetUrl,diff };
