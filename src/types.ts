type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'PATCH';
type JsonObject = Record<string, any> | any[];
interface RestApiRequestData {
    url: string;
    auth?: boolean;
    method?: HttpMethod;
    body?: JsonObject;
}
interface FetchRequestInit {
    method: HttpMethod;
    headers: Record<string, string>;
    body?: string;
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
    status?: {
        token: string;
    };
}

export { HttpMethod, RestApiRequestData, JsonObject, Config, ConfigCategoriesObject, FetchRequestInit };
