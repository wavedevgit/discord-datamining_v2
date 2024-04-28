import sendReq from "../utils/RestApi.js";

async function getProfileEffects() {
  const profileEffects = await (await sendReq({
    url: "user-profile-effects",
  })).json();

  console.log(profileEffects)
  return profileEffects?.profile_effect_configs || ""
}

function getFieldsForProfileEffect(profileEffect) {
  return [
    {
      "name": "Name",
      "value": profileEffect.title,
      "inline": true
    },
    {
      "name": "Description",
      "value": profileEffect.description,
      "inline": true
    },
    {
      "name": "Sku ID",
      "value": profileEffect.sku_id,
      "inline": true
    },
    {
      "name": "Frames Count",
      "value": `${profileEffect.effects.length}`,
      "inline": true
    },
    {
      "name": "Snippet",
      "value": `\`\`\`js\nfindByProps("getUserProfile").profileEffectId = "${profileEffect.sku_id}"\n\`\`\``,
      "inline": true
    }
  ]
}


/** differ for our webhook, each module has to have a differ that generates an embed. */
function diff(a, b) {
  const result = [];
  const diff = { removed: [], added: [] };

  /** a is before */
  for (let asset in a) {
    /** removed type */
    if (a[profileEffect].sku_id !== b[profileEffect].sku_id) {
      diff.removed.push(a[profileEffect]);
    }
  }

  /** b is after */
  for (let profileEffect in b) {
    /** added type */
    if (typeof a[profileEffect] === "undefined" || a[profileEffect]?.sku_id !== b[profileEffect].sku_id) {
      diff.added.push(b[profileEffect]);
    }
  }

  // generate the embed

  for (let profileEffect of diff.removed) {
    result.push({
      title: "Collectibles — Removed Profile Effect:",
      fields: getFieldsForProfileEffect(profileEffect),
      image: { url:  profileEffect.thumbnailPreviewSrc },
      color: 0xff0000,
    })
  }

  for (let profileEffect of diff.added) {
    result.push({
      title: "Collectibles — Added Profile Effect:",
      fields: getFieldsForProfileEffect(profileEffect),
      image: { url:  profileEffect.thumbnailPreviewSrc },
      color: 0x008000,
    })
  }

  if (result.length) {
    sendToWebhook(WEBHOOKS_URLS.collectibles.assets, {
      content: PINGS.collectibles.assets,
      embeds: result,
    });  
  }
}

export default { getProfileEffects, diff }
