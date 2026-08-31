type HttpMethod =
    | 'GET'
    | 'POST'
    | 'PUT'
    | 'DELETE'
    | 'HEAD'
    | 'OPTIONS'
    | 'PATCH';
type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
interface JsonObject {
    [key: string]: JsonValue;
}
interface RestApiRequestData {
    url: string;
    auth?: boolean;
    method?: HttpMethod;
    body?: unknown;
}
interface DiscordEmbedField {
    name: string;
    value: string;
    inline?: boolean;
}
interface DiscordEmbed {
    title?: string;
    description?: string;
    color?: number;
    fields?: DiscordEmbedField[];
    image?: { url: string };
    thumbnail?: { url: string };
    footer?: { text: string };
    author?: { name: string };
}
interface WebhookMessage {
    content?: string;
    embeds?: DiscordEmbed[];
    allowed_mentions?: {
        parse?: Array<'everyone' | 'roles' | 'users'>;
        roles?: string[];
        users?: string[];
    };
}
interface WebhookTarget {
    name: string;
    url?: string;
    ping?: string;
}
interface Config {
    webhooks: ConfigCategoriesObject;
    pings: ConfigCategoriesObject;
}
interface ConfigCategoriesObject {
    collectibles?: {
        categories?: string;
        profileEffects?: string;
        assets?: string;
    };
    changelogs?: string;
    activities?: string;
    csp?: string;
    domains?: string;
    servers?: string;
    robots?: string;
    acknowledgements?: string;
    powerups?: string;
    skus?: string;
    status?: {
        token?: string;
    };
}

export {
    HttpMethod,
    RestApiRequestData,
    JsonValue,
    JsonObject,
    Config,
    ConfigCategoriesObject,
    DiscordEmbed,
    DiscordEmbedField,
    WebhookMessage,
    WebhookTarget,
};
