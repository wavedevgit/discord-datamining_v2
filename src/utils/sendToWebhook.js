import sendReq from "./RestApi.js"

async function sendToWebhook(url, message){
    const res = await sendReq({ method:"POST", url, body: message })
    console.log(await res.text())
    return res
}

export default sendToWebhook