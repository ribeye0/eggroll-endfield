import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AccountInfo,
  AccountRecords,
  AppStore,
  CharRecord,
  PoolInfoEntry,
  Provider,
  RerunCountMap,
  WeaponRecord,
} from "./types";
import {
  CHAR_POOL_TYPES,
  compareSeqId,
  getPoolUp6Ids,
  JOINT_POOL_KEY,
  RERUN_POOL_KEY,
  resolveWeaponPoolType,
  SPECIAL_POOL_KEY,
  WEAPON_RERUN_POOL_TYPE,
} from "./gachaCalc";
import { DEFAULT_POOL_INFO } from "./defaultPoolInfo";
import { TRANSLATIONS, type Locale } from "./i18n";

const LOCAL_STORAGE_FALLBACK_KEY = "endfield_gacha_tui_store_v1";

const isTauriEnv = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function exportJsonToFile(
  filename: string,
  content: string,
): Promise<string | null> {
  if (isTauriEnv()) {
    return invoke<string | null>("export_json_file", { filename, content });
  }
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return filename;
}

export async function exportBinaryToFile(
  filename: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<string | null> {
  if (isTauriEnv()) {
    return invoke<string | null>("export_binary_file", {
      filename,
      bytes: Array.from(bytes),
    });
  }
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return filename;
}

export interface LogDetectionResult {
  url: string;
  provider: Provider;
  path: string;
}

function mergeAccountRecords(
  base: AccountRecords,
  incoming: AccountRecords,
): AccountRecords {
  const char: Record<string, CharRecord[]> = { ...(base.char || {}) };
  for (const [k, list] of Object.entries(incoming.char || {})) {
    char[k] = mergeRecordsBySeqId(char[k] || [], list || []).merged;
  }
  const weapon: Record<string, WeaponRecord[]> = { ...(base.weapon || {}) };
  for (const [k, list] of Object.entries(incoming.weapon || {})) {
    weapon[k] = mergeRecordsBySeqId(weapon[k] || [], list || []).merged;
  }
  return {
    char,
    weapon,
    charRerunCounts: { ...(base.charRerunCounts || {}), ...(incoming.charRerunCounts || {}) },
    weaponRerunCounts: { ...(base.weaponRerunCounts || {}), ...(incoming.weaponRerunCounts || {}) },
    lastSyncAt: incoming.lastSyncAt || base.lastSyncAt,
  };
}

function normalizeAndMergeStoreAccounts(store: AppStore): AppStore {
  const byRoleKey = new Map<string, AccountInfo>();
  const recordsByKey: Record<string, AccountRecords> = {};
  const oldKeyToNewKey = new Map<string, string>();

  for (const acc of store.accounts) {
    const region = acc.provider === "hypergryph" ? "cn" : "global";
    const sid = acc.serverId || (region === "cn" ? "1" : "2");
    const rid = acc.roleId || acc.uid;
    const canonicalKey = `${region}_${sid}_${rid}`;
    oldKeyToNewKey.set(acc.key, canonicalKey);

    const existing = byRoleKey.get(canonicalKey);
    const normalized: AccountInfo = {
      ...existing,
      ...acc,
      key: canonicalKey,
      roleId: rid,
      serverId: sid,
      u8Token: acc.u8Token || existing?.u8Token,
      nickName:
        acc.nickName && acc.nickName !== rid
          ? acc.nickName
          : existing?.nickName || acc.nickName || rid,
      uid:
        acc.uid && acc.uid !== rid
          ? acc.uid
          : existing?.uid || acc.uid || rid,
    };
    byRoleKey.set(canonicalKey, normalized);

    const rec = store.records[acc.key];
    if (rec) {
      recordsByKey[canonicalKey] = recordsByKey[canonicalKey]
        ? mergeAccountRecords(recordsByKey[canonicalKey]!, rec)
        : rec;
    }
  }

  const activeKey = store.activeAccountKey
    ? oldKeyToNewKey.get(store.activeAccountKey) || store.activeAccountKey
    : undefined;

  return {
    ...store,
    accounts: Array.from(byRoleKey.values()),
    activeAccountKey: activeKey,
    records: recordsByKey,
  };
}

export async function loadAppStore(): Promise<AppStore> {
  const defaultStore: AppStore = {
    accounts: [],
    records: {},
    poolInfo: { ...DEFAULT_POOL_INFO },
    theme: "dark",
    locale: "zh-TW",
    zoom: 1,
    historyLimit: 20,
  };
  try {
    if (isTauriEnv()) {
      const data = await invoke<AppStore | null>("load_store");
      if (data && typeof data === "object") {
        return normalizeAndMergeStoreAccounts({
          accounts: Array.isArray(data.accounts) ? data.accounts : [],
          activeAccountKey: data.activeAccountKey,
          records: data.records || {},
          poolInfo: { ...DEFAULT_POOL_INFO, ...(data.poolInfo || {}) },
          theme: data.theme === "light" ? "light" : "dark",
          locale: data.locale || "zh-TW",
          zoom: typeof data.zoom === "number" ? data.zoom : 1,
          historyLimit:
            data.historyLimit === "all" || (typeof data.historyLimit === "number" && data.historyLimit > 0)
              ? data.historyLimit
              : 20,
        });
      }
      return defaultStore;
    }
    const raw = localStorage.getItem(LOCAL_STORAGE_FALLBACK_KEY);
    if (!raw) return defaultStore;
    const parsed = JSON.parse(raw);
    return normalizeAndMergeStoreAccounts({
      ...defaultStore,
      ...parsed,
      poolInfo: { ...DEFAULT_POOL_INFO, ...(parsed?.poolInfo || {}) },
      theme: parsed?.theme === "light" ? "light" : "dark",
      locale: parsed?.locale || "zh-TW",
      zoom: typeof parsed?.zoom === "number" ? parsed.zoom : 1,
      historyLimit:
        parsed?.historyLimit === "all" || (typeof parsed?.historyLimit === "number" && parsed.historyLimit > 0)
          ? parsed.historyLimit
          : 20,
    });
  } catch {
    return defaultStore;
  }
}

export async function saveAppStore(store: AppStore): Promise<void> {
  if (isTauriEnv()) {
    await invoke("save_store", { data: store });
  } else {
    localStorage.setItem(LOCAL_STORAGE_FALLBACK_KEY, JSON.stringify(store));
  }
}

export async function openOfficialLoginWindow(
  provider: Provider = "gryphline",
  locale: Locale = "zh-TW",
): Promise<string | null> {
  if (!isTauriEnv()) {
    throw new Error(TRANSLATIONS[locale].errBrowserLog);
  }

  return new Promise<string | null>(async (resolve, reject) => {
    let unlistenSuccess: UnlistenFn | null = null;
    let unlistenClose: UnlistenFn | null = null;
    let isResolved = false;

    const cleanup = () => {
      if (unlistenSuccess) unlistenSuccess();
      if (unlistenClose) unlistenClose();
    };

    try {
      unlistenSuccess = await listen<string>("hg-login-success", (event) => {
        if (isResolved) return;
        isResolved = true;
        cleanup();
        resolve(event.payload || null);
      });

      unlistenClose = await listen("hg-login-closed", () => {
        if (isResolved) return;
        isResolved = true;
        cleanup();
        resolve(null);
      });

      await invoke("open_login_window", { provider });
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}

async function grantOAuthToken(loginToken: string, provider: Provider): Promise<string | null> {
  const url = `https://as.${provider}.com/user/oauth2/v2/grant`;
  const appCode = provider === "gryphline" ? "3dacefa138426cfe" : "be36d44aa36bfb5b";
  const res = await httpPostJson<any>(url, {
    token: loginToken,
    appCode,
    type: 1,
  });
  if (res?.status === 0 && res?.data?.token) {
    return String(res.data.token);
  }
  return null;
}

export async function refreshU8TokenFromLoginToken(
  loginToken: string,
  uid: string,
  provider: Provider,
): Promise<string | null> {
  const oauthToken = await grantOAuthToken(loginToken, provider);
  if (!oauthToken) return null;
  const res = await httpPostJson<any>(
    `https://binding-api-account-prod.${provider}.com/account/binding/v1/u8_token_by_uid`,
    { uid, token: oauthToken },
  );
  if (res?.status === 0 && res?.data?.token) {
    return String(res.data.token);
  }
  return null;
}

export async function exchangeLoginTokenToAccounts(
  loginToken: string,
  provider: Provider = "gryphline",
  locale: Locale = "zh-TW",
): Promise<AccountInfo[]> {
  const tr = TRANSLATIONS[locale];
  const oauthToken = await grantOAuthToken(loginToken, provider);
  if (!oauthToken) {
    throw new Error(tr.errOAuthFailed);
  }

  const query = new URLSearchParams({
    token: oauthToken,
    appCode: "endfield",
  });
  const bindRes = await httpGetJson<any>(
    `https://binding-api-account-prod.${provider}.com/account/binding/v1/binding_list?${query.toString()}`,
  );
  const list = Array.isArray(bindRes?.data?.list) ? bindRes.data.list : [];
  const appInfo =
    list.find((x: any) => x?.appCode === "endfield") || list[0];
  const bindings: any[] = Array.isArray(appInfo?.bindingList)
    ? appInfo.bindingList
    : list;
  const regionPrefix = provider === "hypergryph" ? "cn" : "global";
  const accounts: AccountInfo[] = [];

  for (const binding of bindings) {
    const uid = String(binding?.uid ?? "").trim();
    if (!uid) continue;
    const u8TokenRes = await httpPostJson<any>(
      `https://binding-api-account-prod.${provider}.com/account/binding/v1/u8_token_by_uid`,
      { uid, token: oauthToken },
    );
    const u8Token = String(u8TokenRes?.data?.token ?? "").trim();
    if (!u8Token) continue;

    const roles = Array.isArray(binding?.roles) ? binding.roles : [];
    if (roles.length === 0) {
      const queried = await queryAccountFromToken(
        { u8Token, provider, serverId: provider === "hypergryph" ? "1" : "auto" },
        locale,
      ).catch(() => null);
      if (queried) {
        accounts.push({ ...queried, loginToken });
      }
      continue;
    }

    for (const role of roles) {
      const roleId = String(role?.roleId ?? "").trim();
      if (!roleId) continue;
      const serverId = String(role?.serverId ?? (provider === "hypergryph" ? "1" : "2")).trim();
      const serverName = String(
        role?.serverName ?? (provider === "hypergryph" ? tr.serverCn : `Server-${serverId}`),
      ).trim();
      const nickName = String(role?.nickName ?? role?.nickname ?? roleId).trim() || roleId;
      accounts.push({
        key: `${regionPrefix}_${serverId}_${roleId}`,
        uid,
        roleId,
        nickName,
        serverId,
        serverName,
        provider,
        u8Token,
        loginToken,
      });
    }
  }

  if (accounts.length === 0) {
    throw new Error(tr.errNoBindingRoles);
  }
  return accounts;
}

async function httpGetJson<T = any>(url: string): Promise<T> {
  if (isTauriEnv()) {
    return invoke<T>("http_get_json", { url });
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function httpPostJson<T = any>(url: string, body: unknown): Promise<T> {
  if (isTauriEnv()) {
    return invoke<T>("http_post_json", { url, body });
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json;charset=UTF-8" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface ParsedGachaInput {
  u8Token: string;
  provider: Provider;
  serverId: string;
}

export async function queryAccountFromToken(
  parsed: ParsedGachaInput,
  locale: Locale = "zh-TW",
): Promise<AccountInfo> {
  const tr = TRANSLATIONS[locale];
  const url = `https://u8.${parsed.provider}.com/game/role/v1/query_role_list`;
  const candidates =
    parsed.serverId && parsed.serverId !== "auto"
      ? Array.from(new Set([parsed.serverId, "2", "3", "4"]))
      : ["2", "3", "4"];

  let lastError: string = tr.errTokenExpired;
  let json: any = null;
  let usedServerId = candidates[0]!;

  for (const sid of candidates) {
    try {
      const res = await httpPostJson<any>(url, {
        token: parsed.u8Token,
        serverId: sid,
      });
      if (res?.status === 0) {
        json = res;
        usedServerId = sid;
        break;
      }
      lastError = res?.msg || tr.errTokenExpired;
    } catch (e: any) {
      lastError = e?.message || String(e);
    }
  }

  if (!json) {
    throw new Error(tr.errRoleQuery(lastError));
  }

  const uid = String(json?.data?.uid ?? "").trim();
  const roles = Array.isArray(json?.data?.roles) ? json.data.roles : [];
  const role =
    roles.find((r: any) => String(r?.serverId ?? "") === String(usedServerId)) ||
    roles[0];
  const roleId = String(role?.roleId ?? "").trim();
  if (!uid || !roleId) throw new Error(tr.errMissingUidRole);

  const resolvedServerId = String(role?.serverId ?? usedServerId);
  const regionPrefix = parsed.provider === "hypergryph" ? "cn" : "global";

  return {
    key: `${regionPrefix}_${resolvedServerId}_${roleId}`,
    uid,
    roleId,
    nickName: String(role?.nickname ?? role?.nickName ?? roleId),
    serverId: resolvedServerId,
    serverName: String(role?.serverName ?? "Global"),
    provider: parsed.provider,
    u8Token: parsed.u8Token,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mergeRecordsBySeqId<T extends { seqId: string }>(
  existing: T[],
  incoming: T[],
): { merged: T[]; added: number } {
  const map = new Map<string, T>();
  for (const item of existing) {
    if (item?.seqId) map.set(String(item.seqId), item);
  }
  let added = 0;
  for (const item of incoming) {
    const id = String(item?.seqId || "");
    if (!id) continue;
    if (!map.has(id)) added++;
    map.set(id, item);
  }
  const merged = Array.from(map.values()).sort((a, b) =>
    compareSeqId(String(b.seqId), String(a.seqId)),
  );
  return { merged, added };
}

function getLatestSeqId(records: Record<string, Array<{ seqId: string }>>): string {
  let maxSeq = "";
  for (const list of Object.values(records)) {
    for (const item of list || []) {
      const id = String(item?.seqId || "");
      if (id && (!maxSeq || compareSeqId(id, maxSeq) > 0)) {
        maxSeq = id;
      }
    }
  }
  return maxSeq;
}

async function fetchPaginated<T extends { seqId: string }>(
  baseUrl: string,
  token: string,
  serverId: string,
  extraParams: Record<string, string>,
  stopSeqId: string,
  lang: string,
  onPage: (page: number) => void,
  locale: Locale = "zh-TW",
): Promise<T[]> {
  const out: T[] = [];
  let nextSeqId = "";
  let hasMore = true;
  let page = 0;

  while (hasMore) {
    page++;
    onPage(page);
    const query = new URLSearchParams({
      lang,
      token,
      server_id: serverId,
      ...extraParams,
    });
    if (nextSeqId) query.set("seq_id", nextSeqId);

    const json = await httpGetJson<any>(`${baseUrl}?${query.toString()}`);
    if (json?.code !== 0 || !Array.isArray(json?.data?.list)) {
      throw new Error(TRANSLATIONS[locale].errApiResponse(json?.code, json?.msg || ""));
    }

    const list = json.data.list as T[];
    if (list.length === 0) break;

    if (stopSeqId) {
      const newer = list.filter((it) => compareSeqId(String(it.seqId || ""), stopSeqId) > 0);
      out.push(...newer);
      if (newer.length < list.length) break;
    } else {
      out.push(...list);
    }

    hasMore = !!json.data.hasMore;
    nextSeqId = String(list[list.length - 1]?.seqId || "");
    if (hasMore) await sleep(350);
  }
  return out;
}

function findUp6IdsByNames(all: any[], names: string[]): string[] {
  const ids: string[] = [];
  for (const name of names) {
    if (!name) continue;
    const found =
      all.find((x) => x && String(x.name || "") === name && Number(x.rarity) === 6) ||
      all.find((x) => x && String(x.name || "") === name);
    if (found?.id) ids.push(String(found.id));
  }
  return Array.from(new Set(ids));
}

async function fetchPoolContent(
  provider: Provider,
  serverId: string,
  poolId: string,
  lang: string,
): Promise<PoolInfoEntry | null> {
  try {
    const query = new URLSearchParams({ lang, pool_id: poolId, server_id: serverId });
    const json = await httpGetJson<any>(
      `https://ef-webview.${provider}.com/api/content?${query.toString()}`,
    );
    const pool = json?.code === 0 ? json?.data?.pool : null;
    if (!pool) return null;

    const gachaType = String(pool.pool_gacha_type || "");
    const all = Array.isArray(pool.all) ? pool.all : [];
    const up6Name = String(pool.up6_name || "").trim();
    let up6Ids: string[] = [];

    if (pool.up6_id) {
      up6Ids = [String(pool.up6_id).trim()].filter(Boolean);
    }
    if (up6Ids.length === 0 && gachaType !== "weapon" && String(pool.pool_type || "") === "extra") {
      const names = Array.isArray(pool.rotate_reward_item_list)
        ? pool.rotate_reward_item_list.map((n: unknown) =>
            String(n || "").trim().replace(/的信物$/, "").trim(),
          )
        : [];
      up6Ids = findUp6IdsByNames(all, names);
    }
    if (up6Ids.length === 0 && up6Name) {
      up6Ids = findUp6IdsByNames(all, [up6Name]);
    }

    return {
      pool_id: poolId,
      pool_gacha_type: gachaType,
      pool_name: String(pool.pool_name || ""),
      pool_type: gachaType === "weapon" ? resolveWeaponPoolType(poolId) : String(pool.pool_type || ""),
      up6_id: up6Ids.length === 1 ? up6Ids[0]! : "",
      up6_ids: up6Ids.length > 1 ? up6Ids : undefined,
      up6_name: up6Name || undefined,
      version_num: pool.version_num ? String(pool.version_num) : undefined,
    };
  } catch {
    return null;
  }
}

async function fetchRerunCounts(
  type: "char" | "weapon",
  provider: Provider,
  token: string,
  serverId: string,
  lang: string,
): Promise<RerunCountMap> {
  try {
    const query = new URLSearchParams({ lang, token, server_id: serverId });
    const json = await httpGetJson<any>(
      `https://ef-webview.${provider}.com/api/record/${type}/rerun-counts?${query.toString()}`,
    );
    if (json?.code !== 0 || !Array.isArray(json.data)) return {};
    const map: RerunCountMap = {};
    for (const item of json.data) {
      const pid = String(item?.poolId || "").trim();
      const cnt = Number(item?.totalPullCount);
      if (pid && Number.isFinite(cnt) && cnt >= 0) {
        map[pid] = Math.max(map[pid] || 0, Math.floor(cnt));
      }
    }
    return map;
  } catch {
    return {};
  }
}

export async function syncAccountGacha(
  account: AccountInfo,
  currentRecords: AccountRecords,
  poolInfo: Record<string, PoolInfoEntry>,
  onProgress: (msg: string) => void,
  preferredLang?: string,
  locale: Locale = "zh-TW",
): Promise<{
  records: AccountRecords;
  poolInfo: Record<string, PoolInfoEntry>;
  addedChar: number;
  addedWeapon: number;
}> {
  const tr = TRANSLATIONS[locale];
  const token = account.u8Token;
  if (!token) throw new Error(tr.errNoAccountToken);

  const provider = account.provider;
  const serverId = account.serverId || "1";
  const lang = preferredLang || (provider === "gryphline" ? "zh-tw" : "zh-cn");
  const nextPoolInfo = { ...poolInfo };
  const nextRecords: AccountRecords = {
    char: { ...currentRecords.char },
    weapon: { ...currentRecords.weapon },
    charRerunCounts: { ...(currentRecords.charRerunCounts || {}) },
    weaponRerunCounts: { ...(currentRecords.weaponRerunCounts || {}) },
    lastSyncAt: new Date().toLocaleString("zh-TW", { hour12: false }),
  };

  let addedChar = 0;
  let addedWeapon = 0;
  const charStopSeq = getLatestSeqId(nextRecords.char);
  const weaponStopSeq = getLatestSeqId(nextRecords.weapon);

  // 1. Character pools
  for (const poolType of CHAR_POOL_TYPES) {
    onProgress(tr.progSyncChar(poolType));
    const list = await fetchPaginated<CharRecord>(
      `https://ef-webview.${provider}.com/api/record/char`,
      token,
      serverId,
      { pool_type: poolType },
      charStopSeq,
      lang,
      (p) => onProgress(tr.progSyncChar(poolType, p)),
      locale,
    );
    const { merged, added } = mergeRecordsBySeqId(nextRecords.char[poolType] || [], list);
    nextRecords.char[poolType] = merged;
    addedChar += added;

    if (
      (poolType === SPECIAL_POOL_KEY || poolType === RERUN_POOL_KEY || poolType === JOINT_POOL_KEY) &&
      merged.length > 0
    ) {
      const poolIds = Array.from(new Set(merged.map((x) => x.poolId).filter(Boolean)));
      for (const pid of poolIds) {
        if (getPoolUp6Ids(nextPoolInfo[pid]).length === 0 && !nextPoolInfo[pid]?.up6_name) {
          const info = await fetchPoolContent(provider, serverId, pid, lang);
          if (info) nextPoolInfo[pid] = info;
        }
      }
    }
  }

  // 1.5 Fetch char rerun counts
  const charRerun = await fetchRerunCounts("char", provider, token, serverId, lang);
  if (Object.keys(charRerun).length > 0) {
    nextRecords.charRerunCounts = { ...nextRecords.charRerunCounts, ...charRerun };
  }

  // 2. Weapon pools
  onProgress(tr.progFetchWeapons);
  const weaponRerun = await fetchRerunCounts("weapon", provider, token, serverId, lang);
  if (Object.keys(weaponRerun).length > 0) {
    nextRecords.weaponRerunCounts = { ...nextRecords.weaponRerunCounts, ...weaponRerun };
  }
  const weaponPoolQuery = new URLSearchParams({ lang, token, server_id: serverId });
  const weaponPoolRes = await httpGetJson<any>(
    `https://ef-webview.${provider}.com/api/record/weapon/pool?${weaponPoolQuery.toString()}`,
  );
  if (weaponPoolRes?.code === 0 && Array.isArray(weaponPoolRes.data)) {
    const pools = weaponPoolRes.data as Array<{ poolId: string; poolName?: string; poolType?: string }>;
    const rerunIds: string[] = [];
    const normalPools: Array<{ poolId: string; poolName?: string }> = [];

    for (const p of pools) {
      const pid = String(p?.poolId || "").trim();
      if (!pid) continue;
      if (p.poolType === WEAPON_RERUN_POOL_TYPE || resolveWeaponPoolType(pid) === WEAPON_RERUN_POOL_TYPE) {
        rerunIds.push(pid);
      } else {
        normalPools.push({ poolId: pid, poolName: p.poolName });
      }
    }

    for (const p of normalPools) {
      const displayPool = p.poolName || p.poolId;
      onProgress(tr.progSyncWeapon(displayPool));
      if (!nextPoolInfo[p.poolId]?.up6_id) {
        const info = await fetchPoolContent(provider, serverId, p.poolId, lang);
        if (info) nextPoolInfo[p.poolId] = info;
      }
      const list = await fetchPaginated<WeaponRecord>(
        `https://ef-webview.${provider}.com/api/record/weapon`,
        token,
        serverId,
        { pool_id: p.poolId },
        weaponStopSeq,
        lang,
        (pg) => onProgress(tr.progSyncWeapon(displayPool, pg)),
        locale,
      );
      const { merged, added } = mergeRecordsBySeqId(nextRecords.weapon[p.poolId] || [], list);
      nextRecords.weapon[p.poolId] = merged;
      addedWeapon += added;
    }

    if (rerunIds.length > 0) {
      onProgress(tr.progSyncWeaponRerun());
      const list = await fetchPaginated<WeaponRecord>(
        `https://ef-webview.${provider}.com/api/record/weapon`,
        token,
        serverId,
        { pool_ids: rerunIds.join(",") },
        weaponStopSeq,
        lang,
        (pg) => onProgress(tr.progSyncWeaponRerun(pg)),
        locale,
      );
      const grouped: Record<string, WeaponRecord[]> = {};
      for (const pid of rerunIds) grouped[pid] = [];
      for (const item of list) {
        const pid = String(item.poolId || "").trim();
        if (!grouped[pid]) grouped[pid] = [];
        grouped[pid].push(item);
      }
      for (const [pid, items] of Object.entries(grouped)) {
        const { merged, added } = mergeRecordsBySeqId(nextRecords.weapon[pid] || [], items);
        nextRecords.weapon[pid] = merged;
        addedWeapon += added;
      }
    }
  }

  return { records: nextRecords, poolInfo: nextPoolInfo, addedChar, addedWeapon };
}

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseNotes: string;
  releaseUrl: string;
  assetName: string | null;
  downloadUrl: string | null;
  checksumUrl: string | null;
  assetSize: number | null;
}

export interface UpdateDownloadProgress {
  downloaded: number;
  total: number | null;
  percent: number | null;
}

export async function checkAppUpdate(): Promise<UpdateCheckResult> {
  if (!isTauriEnv()) {
    throw new Error("僅桌面版支援檢查更新");
  }
  return invoke<UpdateCheckResult>("check_app_update");
}

export async function downloadAppUpdate(
  url: string,
  assetName: string,
  checksumUrl: string | null,
  onProgress?: (p: UpdateDownloadProgress) => void,
): Promise<string> {
  if (!isTauriEnv()) {
    throw new Error("僅桌面版支援下載更新");
  }
  let unlisten: UnlistenFn | null = null;
  if (onProgress) {
    unlisten = await listen<UpdateDownloadProgress>("update-download-progress", (e) => {
      if (e.payload) onProgress(e.payload);
    });
  }
  try {
    return await invoke<string>("download_app_update", { url, assetName, checksumUrl });
  } finally {
    if (unlisten) unlisten();
  }
}

export async function installAppUpdate(downloadedPath: string): Promise<void> {
  if (!isTauriEnv()) {
    throw new Error("僅桌面版支援安裝更新");
  }
  await invoke("install_app_update", { downloadedPath });
}
