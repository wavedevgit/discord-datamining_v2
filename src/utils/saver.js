import fs from "fs/promises";

async function save(file, data) {
  return await fs.writeFile(file, JSON.stringify(data, null, 4), {
    encoding: "utf-8",
  });
}

export default save