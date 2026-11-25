import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_POOL_INFO } from "../src/defaultPoolInfo.ts";
import { ITEM_NAME_I18N, POOL_NAME_I18N } from "../src/itemI18n.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const outPath = path.join(rootDir, "data", "eggroll-i18n.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(
  outPath,
  JSON.stringify(
    {
      updatedAt: new Date().toISOString(),
      poolInfo: DEFAULT_POOL_INFO,
      items: ITEM_NAME_I18N,
      pools: POOL_NAME_I18N,
    },
    null,
    2,
  ) + "\n",
  "utf8",
);
console.log(`Generated ${outPath}`);
