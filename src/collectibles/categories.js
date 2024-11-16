import { PINGS, WEBHOOKS_URLS } from "../config.js";
import  assets from "./assets.js";
import sendReq from "../utils/RestApi.js";
import sendToWebhook from "../utils/sendToWebhook.js";

const { formatAssetUrl } = assets
async function getCollectiblesCategories() {
  const categories = await (
    await sendReq({
      url: "collectibles-categories",
    })
  ).json();

  return categories;
}

function getFieldsForCategory(category){
  return  [
    {
      "name": "Name",
      "value": category.name,
      "inline": true
    },
    {
      "name": "Sku ID",
      "value": category.sku_id,
      "inline": true
    },
    {
      "name": "Products Count",
      "value": `${category.products.length}`,
      "inline": true
    },
    {
      "name": "Description",
      "value": category.summary,
      "inline": true
    },
    {
      "name": "Button Colors",
      "value": category.styles.button_colors.map(color=>color.toString(16)).join(", "),
      "inline": true
    },
    {
      "name": "Background Colors",
      "value": category.styles.background_colors.map(color=>color.toString(16)).join(", ")
    }
  ]
}

/** differ for our webhook, each module has to have a differ that generates an embed. */
function diff(a, b) {
  const result = [];
  const diff = { removed: [], added: [] };


  /** a is before */
  for (let category in a) {
    /** removed type */
    if (!b.map(category=>category.sku_id).includes(a[category]?.sku_id)) {
      diff.removed.push(a[category]);
    }
  }


  /** b is after */
  for (let category in b) {
    /** added type */
    if (!a.map(category=>category.sku_id).includes(b[category]?.sku_id)) {
      diff.added.push(b[category]);
    }
  }

  for (let category of diff.removed) {
    result.push({
      title: "Collectibles — Removed Category:",
      fields: getFieldsForCategory(category),
      image: { url: formatAssetUrl(category.banner) },
      thumbnail: { url: formatAssetUrl(category.logo) },
      color: 0xff0000,
    })
  }

  for (let category of diff.added) {
    result.push({
      title: "Collectibles — Added Category:",
      fields: getFieldsForCategory(category),
      image: { url: formatAssetUrl(category.banner) },
      thumbnail: { url: formatAssetUrl(category.logo) },
      color: 0x008000,
    })
  }

  if (result.length) {
    sendToWebhook(WEBHOOKS_URLS.collectibles.categories, {
      content: PINGS.collectibles.categories,
      embeds: result,
    });
  }
}


export default { getCollectiblesCategories, diff };
