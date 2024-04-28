import sendReq from "../utils/RestApi.js";

async function getCollectiblesProduct(sku_id) {
  const product = await (await sendReq({
    url: `collectibles-products/${sku_id}`,
  })).json();

  return product
}




export default getCollectiblesProduct
