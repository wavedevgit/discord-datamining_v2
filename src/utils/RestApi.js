import { ALT_TOKEN, API_BASE_URL } from "../config.js";

async function sendReq(data) {
  if (!data.url) throw Error("No url given");

  console.log(`${API_BASE_URL}${data.url}`);
  const reqData = {
    method: data.method || "GET",
    headers: { Authorization: data.notoken ? "" : ALT_TOKEN, ...data.headers },
    ...data,
  };

  if (data.body) {
    reqData.body = JSON.stringify(data.body);
    reqData.headers["Content-type"] = "application/json";
  }

  const res = await fetch(`${API_BASE_URL}${data.url}`, reqData);
  return res;
}

export default sendReq;
