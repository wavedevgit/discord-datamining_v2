const ALT_TOKEN =
  process.env.ALT_TOKEN
const API_BASE_URL = "https://canary.discord.com/api/v10/";

const WEBHOOKS_URLS = {
  collectibles: {
    categories:
     process.env.categories,
    profileEffects:
      process.env.profileEffects,
    assets:
      process.env.assets,
  },
  status: {
    token:
      process.env.token,
  },
};

const PINGS = {
  collectibles: {
    categories:
      "<@&1234231619758587986>",
    profileEffects:
      "<@&1234231661550370928>",
    assets:
      "<@&1234231704109977710>",
  },
  status: {
    token:
      "<@1083437693347827764>",
  },
};

export { ALT_TOKEN, API_BASE_URL, WEBHOOKS_URLS, PINGS };
