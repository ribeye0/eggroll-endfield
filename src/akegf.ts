import type {
  AccountInfo,
  AccountRecords,
  CharRecord,
  Provider,
  WeaponRecord,
} from "./types";
import {
  BEGINNER_POOL_KEY,
  compareSeqId,
  JOINT_POOL_KEY,
  RERUN_POOL_KEY,
  SPECIAL_POOL_KEY,
  STANDARD_POOL_KEY,
} from "./gachaCalc";

export const AKEGF_VERSION = "v0.4" as const;
export const AKEGF_HOME_URL = "https://www.akedata.wiki/?plugin=akegf&id=home";

export interface AkegfInfo {
  version: "v0.4";
  export_app?: string;
  export_app_version?: string;
  export_timestamp?: number;
}

export interface AkegfPull {
  kind: string;
  record_type?: "char" | "weapon";
  seq_id?: string;
  pool_id?: string;
  item_id?: string;
  gacha_ts?: number;
  rarity?: number;
  pool_name?: string;
  item_name?: string;
  pool_type?: string;
  weapon_type?: string;
  is_new?: boolean;
  is_free?: boolean;
  name_text?: string;
  seq_id_source?: "batch_end";
  gift_reward_label?: string;
}

export interface AkegfAccount {
  region?: "cn" | "global";
  server_id?: string;
  uid: string;
  lang?: string;
  list: AkegfPull[];
  account_uid?: string;
}

export interface AkegfDocument {
  info: AkegfInfo;
  endfield: AkegfAccount[];
}

function nonEmptyText(val: unknown): string | undefined {
  if (val === null || val === undefined) return undefined;
  const s = String(val).trim();
  return /\S/.test(s) ? s : undefined;
}

function toUnixMs(val: unknown): number | undefined {
  const num = Number(val);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  const ms = num < 10_000_000_000 ? Math.round(num * 1000) : Math.round(num);
  if (ms < 1_000_000_000_000 || ms > 9_999_999_999_999) return undefined;
  return ms;
}

function resolveCharPoolKey(poolType?: string, poolId?: string): string {
  const pt = String(poolType || "").trim();
  if (
    pt === SPECIAL_POOL_KEY ||
    pt === RERUN_POOL_KEY ||
    pt === JOINT_POOL_KEY ||
    pt === STANDARD_POOL_KEY ||
    pt === BEGINNER_POOL_KEY
  ) {
    return pt;
  }
  const pid = String(poolId || "").toLowerCase();
  if (pid.startsWith("special")) return SPECIAL_POOL_KEY;
  if (pid.startsWith("rerun")) return RERUN_POOL_KEY;
  if (pid.startsWith("joint")) return JOINT_POOL_KEY;
  if (pid.startsWith("beginner")) return BEGINNER_POOL_KEY;
  return STANDARD_POOL_KEY;
}

export function exportAccountToAkegf(
  account: AccountInfo,
  records: AccountRecords,
  appVersion = "0.1.0",
): AkegfDocument {
  const region: "cn" | "global" = account.provider === "hypergryph" ? "cn" : "global";
  const serverId = nonEmptyText(account.serverId) || (region === "cn" ? "1" : "2");
  const uid = nonEmptyText(account.roleId) || nonEmptyText(account.uid) || account.key;
  const accountUid =
    nonEmptyText(account.uid) && nonEmptyText(account.uid) !== uid
      ? nonEmptyText(account.uid)
      : undefined;

  const list: AkegfPull[] = [];

  for (const [poolTypeKey, items] of Object.entries(records.char || {})) {
    for (const item of items || []) {
      const kind = nonEmptyText(item.kind) || "draw";
      const pull: AkegfPull = {
        kind,
        record_type: "char",
      };
      const seqId = nonEmptyText(item.seqId);
      if (seqId) pull.seq_id = seqId;
      const poolId = nonEmptyText(item.poolId);
      if (poolId) pull.pool_id = poolId;
      const poolName = nonEmptyText(item.poolName);
      if (poolName) pull.pool_name = poolName;
      const pType = nonEmptyText(item.poolType) || nonEmptyText(poolTypeKey);
      if (pType) pull.pool_type = pType;
      const itemId = nonEmptyText(item.charId);
      if (itemId) pull.item_id = itemId;
      const itemName = nonEmptyText(item.charName);
      if (itemName) pull.item_name = itemName;
      const ts = toUnixMs(item.gachaTs);
      if (ts !== undefined) pull.gacha_ts = ts;
      if (Number.isInteger(item.rarity) && item.rarity >= 1 && item.rarity <= 99) {
        pull.rarity = item.rarity;
      }
      if (typeof item.isNew === "boolean") pull.is_new = item.isNew;
      if (typeof item.isFree === "boolean") pull.is_free = item.isFree;

      // Ensure required fields for kind === "draw"
      if (kind === "draw") {
        if (!pull.pool_id) pull.pool_id = "unknown";
        if (!pull.item_name) pull.item_name = "unknown";
        if (pull.rarity === undefined) pull.rarity = 4;
        if (pull.gacha_ts === undefined) pull.gacha_ts = Date.now();
      }
      list.push(pull);
    }
  }

  for (const [poolKey, items] of Object.entries(records.weapon || {})) {
    for (const item of items || []) {
      const kind = nonEmptyText(item.kind) || "draw";
      const pull: AkegfPull = {
        kind,
        record_type: "weapon",
      };
      const seqId = nonEmptyText(item.seqId);
      if (seqId) pull.seq_id = seqId;
      const poolId = nonEmptyText(item.poolId) || nonEmptyText(poolKey);
      if (poolId) pull.pool_id = poolId;
      const poolName = nonEmptyText(item.poolName);
      if (poolName) pull.pool_name = poolName;
      const pType = nonEmptyText(item.poolType);
      if (pType) pull.pool_type = pType;
      const itemId = nonEmptyText(item.weaponId);
      if (itemId) pull.item_id = itemId;
      const itemName = nonEmptyText(item.weaponName);
      if (itemName) pull.item_name = itemName;
      const weaponType = nonEmptyText(item.weaponType);
      if (weaponType) pull.weapon_type = weaponType;
      const ts = toUnixMs(item.gachaTs);
      if (ts !== undefined) pull.gacha_ts = ts;
      if (Number.isInteger(item.rarity) && item.rarity >= 1 && item.rarity <= 99) {
        pull.rarity = item.rarity;
      }
      if (typeof item.isNew === "boolean") pull.is_new = item.isNew;
      // Note: record_type === "weapon" MUST NOT have is_free per AKEGF v0.4

      if (kind === "draw") {
        if (!pull.pool_id) pull.pool_id = "unknown";
        if (!pull.item_name) pull.item_name = "unknown";
        if (pull.rarity === undefined) pull.rarity = 4;
        if (pull.gacha_ts === undefined) pull.gacha_ts = Date.now();
      }
      list.push(pull);
    }
  }

  // Sort newest first by gacha_ts then seq_id
  list.sort((a, b) => {
    const tsDiff = (b.gacha_ts || 0) - (a.gacha_ts || 0);
    if (tsDiff !== 0) return tsDiff;
    return compareSeqId(String(b.seq_id || ""), String(a.seq_id || ""));
  });

  const acc: AkegfAccount = {
    region,
    server_id: serverId,
    uid,
    lang: region === "global" ? "zh-tw" : "zh-cn",
    list,
  };
  if (accountUid) acc.account_uid = accountUid;

  return {
    info: {
      version: AKEGF_VERSION,
      export_app: "Simple Endfield Pull Tracker",
      export_app_version: appVersion,
      export_timestamp: Date.now(),
    },
    endfield: [acc],
  };
}

export interface ImportedAccountBundle {
  account: AccountInfo;
  records: AccountRecords;
}

export function isAkegfDocument(data: unknown): data is AkegfDocument {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  const info = obj.info as Record<string, unknown> | undefined;
  return (
    !!info &&
    typeof info === "object" &&
    typeof info.version === "string" &&
    Array.isArray(obj.endfield)
  );
}

export function importFromAkegf(doc: AkegfDocument): ImportedAccountBundle[] {
  if (!Array.isArray(doc.endfield) || doc.endfield.length === 0) {
    throw new Error("AKEGF 檔案缺少 endfield 帳號陣列");
  }

  const results: ImportedAccountBundle[] = [];

  for (const rawAcc of doc.endfield) {
    const region = rawAcc.region === "global" ? "global" : "cn";
    const serverId =
      nonEmptyText(rawAcc.server_id) || (region === "cn" ? "1" : "");
    if (region === "global" && !serverId) {
      throw new Error(`國際服帳號 ${rawAcc.uid} 缺少必要的 server_id`);
    }
    const roleId = nonEmptyText(rawAcc.uid);
    if (!roleId) {
      throw new Error("AKEGF 帳號缺少 uid");
    }

    const provider: Provider = region === "global" ? "gryphline" : "hypergryph";
    const accountUid = nonEmptyText(rawAcc.account_uid) || roleId;
    const key = `${region}_${serverId}_${roleId}`;

    const charMap: Record<string, CharRecord[]> = {};
    const weaponMap: Record<string, WeaponRecord[]> = {};
    const seen = new Set<string>();

    for (const pull of rawAcc.list || []) {
      const recordType =
        pull.record_type || (pull.weapon_type ? "weapon" : "char");
      const seqId = nonEmptyText(pull.seq_id) || "";

      if (recordType && seqId) {
        const dedupKey = `${recordType}:${seqId}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
      }

      const poolId = nonEmptyText(pull.pool_id) || "unknown";
      const poolName = nonEmptyText(pull.pool_name) || poolId;
      const gachaTs = pull.gacha_ts !== undefined ? String(pull.gacha_ts) : "0";
      const itemName =
        nonEmptyText(pull.item_name) ||
        nonEmptyText(pull.name_text) ||
        nonEmptyText(pull.gift_reward_label) ||
        "未知";
      const rarity = typeof pull.rarity === "number" ? pull.rarity : 0;

      if (recordType === "weapon") {
        if (!weaponMap[poolId]) weaponMap[poolId] = [];
        weaponMap[poolId].push({
          poolId,
          poolName,
          weaponId: nonEmptyText(pull.item_id) || "",
          weaponName: itemName,
          weaponType: nonEmptyText(pull.weapon_type) || "",
          rarity,
          isNew: !!pull.is_new,
          gachaTs,
          seqId,
          kind: nonEmptyText(pull.kind) || "draw",
          poolType: nonEmptyText(pull.pool_type),
        });
      } else {
        const poolKey = resolveCharPoolKey(pull.pool_type, poolId);
        if (!charMap[poolKey]) charMap[poolKey] = [];
        charMap[poolKey].push({
          charId: nonEmptyText(pull.item_id) || "",
          charName: itemName,
          gachaTs,
          kind: nonEmptyText(pull.kind) || "draw",
          isFree: !!pull.is_free,
          isNew: !!pull.is_new,
          poolId,
          poolName,
          rarity,
          seqId,
          poolType: nonEmptyText(pull.pool_type),
        });
      }
    }

    results.push({
      account: {
        key,
        uid: accountUid,
        roleId,
        nickName: roleId,
        serverId,
        serverName: region === "global" ? `Global-${serverId}` : "國服",
        provider,
      },
      records: {
        char: charMap,
        weapon: weaponMap,
        lastSyncAt: new Date().toLocaleString("zh-TW", { hour12: false }),
      },
    });
  }

  return results;
}
