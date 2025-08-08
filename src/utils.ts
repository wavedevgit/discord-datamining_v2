import fs from "fs/promises";
import { FetchRequestInit, JsonObject, RestApiRequestData } from "./types.js";
import { ApiBaseUrl, headers } from "./config.js";

async function saveFile(file: string, data: JsonObject) {
  return await fs.writeFile(file, JSON.stringify(data, null, 4), "utf-8");
}
async function saveFileText(file: string, data: string) {
  return await fs.writeFile(file, data, "utf-8");
}
async function readFile(file: string,parseJson:boolean) {
  const content = await fs.readFile(file, "utf-8")
   parseJson = [true,false].includes(parseJson] ? parseJson : true  

  return parseJson ? JSON.parse(content) : content
}
async function sendReq(data: RestApiRequestData) {
  if (!data.url) throw Error("No url given");

  console.log(`${ApiBaseUrl}${data.url}`);
  const reqData: FetchRequestInit = {
    method: data.method || "GET",
    headers: headers,
  };

  if (data.body) {
    reqData.body = JSON.stringify(data.body);
    reqData.headers["Content-type"] = "application/json";
  }

  const res = await fetch(`${ApiBaseUrl}${data.url}`, reqData);
  return res;
}
async function sendToWebhook(url, message) {
  const res = await sendReq({ method: "POST", url, body: message });
  console.log(await res.text());
  return res;
}

export { readFile, saveFile, saveFileText, sendReq, sendToWebhook };
