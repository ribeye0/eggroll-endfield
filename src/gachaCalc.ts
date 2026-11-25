import type {
  CharRecord,
  GachaStatistics,
  HistoryRecord,
  PoolInfoEntry,
  RerunCountMap,
  WeaponRecord,
} from "./types";

export const SPECIAL_POOL_KEY = "E_CharacterGachaPoolType_Special";
export const RERUN_POOL_KEY = "E_CharacterGachaPoolType_Rerun";
export const JOINT_POOL_KEY = "E_CharacterGachaPoolType_Joint";
export const STANDARD_POOL_KEY = "E_CharacterGachaPoolType_Standard";
export const BEGINNER_POOL_KEY = "E_CharacterGachaPoolType_Beginner";

export const CHAR_POOL_TYPES = [
  SPECIAL_POOL_KEY,
  RERUN_POOL_KEY,
  JOINT_POOL_KEY,
  STANDARD_POOL_KEY,
  BEGINNER_POOL_KEY,
] as const;

export const POOL_NAME_MAP: Record<string, string> = {
  [SPECIAL_POOL_KEY]: "特許尋訪",
  [RERUN_POOL_KEY]: "重構尋訪",
  [JOINT_POOL_KEY]: "輝光慶典",
  [STANDARD_POOL_KEY]: "基礎尋訪",
  [BEGINNER_POOL_KEY]: "啟程尋訪",
};

export const CHAR_SMALL_PITY_MAX = 80;
export const SPECIAL_BIG_PITY_MAX = 120;
export const WEAPON_SMALL_PITY_MAX = 40;
export const WEAPON_BIG_PITY_MAX = 80;

export const WEAPON_LIMITED_POOL_TYPE = "special";
export const WEAPON_CONSTANT_POOL_TYPE = "constant";
export const WEAPON_RERUN_POOL_TYPE = "rerun";

export const compareSeqId = (a: string, b: string): number => {
  if (a === b) return 0;
  const aDigits = /^\d+$/.test(a);
  const bDigits = /^\d+$/.test(b);
  if (aDigits && bDigits) {
    if (a.length !== b.length) return a.length > b.length ? 1 : -1;
    return a.localeCompare(b);
  }
  if (aDigits !== bDigits) return aDigits ? 1 : -1;
  return a.localeCompare(b);
};

export const resolveWeaponPoolType = (poolId: string): string => {
  const value = String(poolId || "").toLowerCase();
  if (value.includes(WEAPON_CONSTANT_POOL_TYPE)) return WEAPON_CONSTANT_POOL_TYPE;
  if (value.startsWith("rerun") || value.includes("rerun_")) return WEAPON_RERUN_POOL_TYPE;
  return WEAPON_LIMITED_POOL_TYPE;
};

export const isGiftKind = (kind: unknown): boolean =>
  typeof kind === "string" && kind.startsWith("gift");

export const filterStatisticalRecords = <T extends { kind?: string }>(data: T[]): T[] =>
  data.filter((item) => !isGiftKind(item.kind));

export const getPoolUp6Ids = (info?: PoolInfoEntry): string[] => {
  if (!info) return [];
  const list = Array.isArray(info.up6_ids) ? info.up6_ids : [];
  const merged = [...list, info.up6_id]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  return Array.from(new Set(merged));
};

const computeMetrics = (history6: HistoryRecord[]): { avgPity6: number | null; upWinRate: number | null } => {
  const paid6 = history6.filter((h) => !h.isFree && h.pity > 0);
  const avgPity6 =
    paid6.length > 0 ? paid6.reduce((sum, h) => sum + h.pity, 0) / paid6.length : null;

  const upChecks = history6.filter((h) => h.hasUpInfo);
  const upWinRate =
    upChecks.length > 0
      ? (upChecks.filter((h) => h.isUp).length / upChecks.length) * 100
      : null;

  return { avgPity6, upWinRate };
};

export const analyzeSimpleCharPool = (
  poolKey: string,
  rawData: CharRecord[],
): GachaStatistics => {
  const data = filterStatisticalRecords(rawData).slice().reverse();
  let count6 = 0;
  let count5 = 0;
  let count4 = 0;
  let paidPulls = 0;
  let freePulls = 0;
  let pullsSinceLast6 = 0;
  const history6: HistoryRecord[] = [];

  for (const item of data) {
    const isFree = !!item.isFree;
    if (isFree) freePulls++;
    else {
      paidPulls++;
      pullsSinceLast6++;
    }

    if (item.rarity === 6) {
      count6++;
      history6.push({
        name: item.charName,
        itemId: item.charId,
        pity: isFree ? 0 : pullsSinceLast6,
        isNew: item.isNew,
        isFree,
        gachaTs: item.gachaTs,
        seqId: item.seqId,
        poolId: item.poolId,
        poolName: item.poolName,
      });
      if (!isFree) pullsSinceLast6 = 0;
    } else if (item.rarity === 5) {
      count5++;
    } else if (item.rarity === 4) {
      count4++;
    }
  }

  history6.reverse();
  const { avgPity6, upWinRate } = computeMetrics(history6);

  return {
    poolType: poolKey,
    poolName: POOL_NAME_MAP[poolKey] || poolKey,
    totalPulls: data.length,
    paidPulls,
    freePulls,
    pityCount: pullsSinceLast6,
    smallPityMax: CHAR_SMALL_PITY_MAX,
    count6,
    count5,
    count4,
    avgPity6,
    upWinRate,
    history6,
  };
};

export const analyzeSpecialPoolData = (
  rawData: CharRecord[],
  poolInfoById: Record<string, PoolInfoEntry> = {},
): GachaStatistics[] => {
  const data = filterStatisticalRecords(rawData).slice().reverse();
  let globalSmallPity = 0;
  const results: GachaStatistics[] = [];
  let current: GachaStatistics | null = null;
  let currentPoolId = "";

  const finalizeCurrent = () => {
    if (!current) return;
    current.pityCount = globalSmallPity;
    current.bigPityMax = SPECIAL_BIG_PITY_MAX;
    current.bigPityCount = current.paidPulls;
    current.bigPityRemaining = current.gotUp6
      ? 0
      : Math.max(0, SPECIAL_BIG_PITY_MAX - current.paidPulls);
    current.history6.reverse();
    const metrics = computeMetrics(current.history6);
    current.avgPity6 = metrics.avgPity6;
    current.upWinRate = metrics.upWinRate;
  };

  for (const item of data) {
    if (item.poolId !== currentPoolId) {
      finalizeCurrent();
      currentPoolId = item.poolId;
      const info = poolInfoById[item.poolId];
      const up6Ids = getPoolUp6Ids(info);
      current = {
        poolType: SPECIAL_POOL_KEY,
        poolId: item.poolId,
        poolName: item.poolName || info?.pool_name || item.poolId || POOL_NAME_MAP[SPECIAL_POOL_KEY],
        isCurrentPool: false,
        totalPulls: 0,
        paidPulls: 0,
        freePulls: 0,
        pityCount: 0,
        smallPityMax: CHAR_SMALL_PITY_MAX,
        bigPityMax: SPECIAL_BIG_PITY_MAX,
        bigPityCount: 0,
        bigPityRemaining: SPECIAL_BIG_PITY_MAX,
        up6Ids: up6Ids.length > 0 ? up6Ids : undefined,
        gotUp6: false,
        count6: 0,
        count5: 0,
        count4: 0,
        avgPity6: null,
        upWinRate: null,
        history6: [],
      };
      results.push(current);
    }

    if (!current) continue;
    if (item.poolName) current.poolName = item.poolName;
    current.totalPulls++;

    const isFree = !!item.isFree;
    if (isFree) current.freePulls++;
    else {
      current.paidPulls++;
      globalSmallPity++;
    }

    if (item.rarity === 6) {
      const up6Ids = current.up6Ids || [];
      const up6Name = poolInfoById[item.poolId]?.up6_name;
      const hasUpInfo = up6Ids.length > 0 || !!up6Name;
      const isUp =
        (up6Ids.length > 0 && up6Ids.includes(item.charId)) ||
        (!!up6Name && item.charName === up6Name);
      current.count6++;
      current.history6.push({
        name: item.charName,
        itemId: item.charId,
        pity: isFree ? 0 : globalSmallPity,
        isNew: item.isNew,
        isFree,
        hasUpInfo,
        isUp,
        poolId: current.poolId,
        poolName: current.poolName,
        gachaTs: item.gachaTs,
        seqId: item.seqId,
      });
      if (isUp) current.gotUp6 = true;
      if (!isFree) globalSmallPity = 0;
    } else if (item.rarity === 5) {
      current.count5++;
    } else if (item.rarity === 4) {
      current.count4++;
    }
  }

  finalizeCurrent();
  if (results.length > 0) results[results.length - 1]!.isCurrentPool = true;
  return results.reverse();
};

export const analyzeRerunPoolData = (
  rawData: CharRecord[],
  poolInfoById: Record<string, PoolInfoEntry> = {},
  rerunCounts: RerunCountMap = {},
): GachaStatistics[] => {
  const data = filterStatisticalRecords(rawData).slice().reverse();
  let globalSmallPity = 0;
  const byPoolName = new Map<string, GachaStatistics>();
  const results: GachaStatistics[] = [];
  let latestPoolName = "";

  for (const item of data) {
    const poolName =
      String(item.poolName || "").trim() ||
      String(poolInfoById[item.poolId]?.pool_name || "").trim() ||
      String(item.poolId || "").trim() ||
      POOL_NAME_MAP[RERUN_POOL_KEY];

    let current = byPoolName.get(poolName);
    if (!current) {
      const info = poolInfoById[item.poolId];
      const up6Ids = getPoolUp6Ids(info);
      current = {
        poolType: RERUN_POOL_KEY,
        poolId: item.poolId,
        poolName,
        isCurrentPool: false,
        totalPulls: 0,
        paidPulls: 0,
        freePulls: 0,
        pityCount: 0,
        smallPityMax: CHAR_SMALL_PITY_MAX,
        bigPityMax: SPECIAL_BIG_PITY_MAX,
        bigPityCount: 0,
        bigPityRemaining: SPECIAL_BIG_PITY_MAX,
        up6Ids: up6Ids.length > 0 ? up6Ids : undefined,
        gotUp6: false,
        count6: 0,
        count5: 0,
        count4: 0,
        avgPity6: null,
        upWinRate: null,
        history6: [],
      };
      byPoolName.set(poolName, current);
      results.push(current);
    }

    latestPoolName = poolName;
    if (item.poolId) current.poolId = item.poolId;
    current.totalPulls++;

    const isFree = !!item.isFree;
    if (isFree) current.freePulls++;
    else {
      current.paidPulls++;
      globalSmallPity++;
    }

    if (item.rarity === 6) {
      const up6Ids = current.up6Ids || [];
      const up6Name = poolInfoById[item.poolId]?.up6_name;
      const hasUpInfo = up6Ids.length > 0 || !!up6Name;
      const isUp =
        (up6Ids.length > 0 && up6Ids.includes(item.charId)) ||
        (!!up6Name && item.charName === up6Name);
      current.count6++;
      current.history6.push({
        name: item.charName,
        itemId: item.charId,
        pity: isFree ? 0 : globalSmallPity,
        isNew: item.isNew,
        isFree,
        hasUpInfo,
        isUp,
        poolId: item.poolId,
        poolName,
        gachaTs: item.gachaTs,
        seqId: item.seqId,
      });
      if (isUp) current.gotUp6 = true;
      if (!isFree) globalSmallPity = 0;
    } else if (item.rarity === 5) {
      current.count5++;
    } else if (item.rarity === 4) {
      current.count4++;
    }
  }

  for (const stat of results) {
    stat.pityCount = globalSmallPity;
    stat.officialTotalCount = stat.poolId ? rerunCounts[stat.poolId] : undefined;
    const bigCount = Math.min(stat.officialTotalCount ?? stat.paidPulls, SPECIAL_BIG_PITY_MAX);
    stat.bigPityCount = stat.gotUp6 ? 0 : bigCount;
    stat.bigPityRemaining = stat.gotUp6 ? 0 : Math.max(0, SPECIAL_BIG_PITY_MAX - bigCount);
    if (stat.poolName === latestPoolName) stat.isCurrentPool = true;
    stat.history6.reverse();
    const metrics = computeMetrics(stat.history6);
    stat.avgPity6 = metrics.avgPity6;
    stat.upWinRate = metrics.upWinRate;
  }

  return results.reverse();
};

export const analyzeJointPoolData = (
  rawData: CharRecord[],
  poolInfoById: Record<string, PoolInfoEntry> = {},
): GachaStatistics[] => {
  const data = filterStatisticalRecords(rawData).slice().reverse();
  const results: GachaStatistics[] = [];
  let current: GachaStatistics | null = null;
  let currentPoolId = "";
  let paidPity = 0;

  const finalizeCurrent = () => {
    if (!current) return;
    current.pityCount = paidPity;
    current.history6.reverse();
    const metrics = computeMetrics(current.history6);
    current.avgPity6 = metrics.avgPity6;
    current.upWinRate = metrics.upWinRate;
  };

  for (const item of data) {
    if (item.poolId !== currentPoolId) {
      finalizeCurrent();
      currentPoolId = item.poolId;
      paidPity = 0;
      const info = poolInfoById[item.poolId];
      const up6Ids = getPoolUp6Ids(info);
      current = {
        poolType: JOINT_POOL_KEY,
        poolId: item.poolId,
        poolName: item.poolName || info?.pool_name || item.poolId || POOL_NAME_MAP[JOINT_POOL_KEY],
        isCurrentPool: false,
        totalPulls: 0,
        paidPulls: 0,
        freePulls: 0,
        pityCount: 0,
        smallPityMax: CHAR_SMALL_PITY_MAX,
        up6Ids: up6Ids.length > 0 ? up6Ids : undefined,
        gotUp6: false,
        count6: 0,
        count5: 0,
        count4: 0,
        avgPity6: null,
        upWinRate: null,
        history6: [],
      };
      results.push(current);
    }

    if (!current) continue;
    if (item.poolName) current.poolName = item.poolName;
    current.totalPulls++;

    const isFree = !!item.isFree;
    if (isFree) current.freePulls++;
    else {
      current.paidPulls++;
      paidPity++;
    }

    if (item.rarity === 6) {
      const up6Ids = current.up6Ids || [];
      const up6Name = poolInfoById[item.poolId]?.up6_name;
      const hasUpInfo = up6Ids.length > 0 || !!up6Name;
      const isUp =
        (up6Ids.length > 0 && up6Ids.includes(item.charId)) ||
        (!!up6Name && item.charName === up6Name);
      current.count6++;
      current.history6.push({
        name: item.charName,
        itemId: item.charId,
        pity: isFree ? 0 : paidPity,
        isNew: item.isNew,
        isFree,
        hasUpInfo,
        isUp,
        poolId: current.poolId,
        poolName: current.poolName,
        gachaTs: item.gachaTs,
        seqId: item.seqId,
      });
      if (isUp) current.gotUp6 = true;
      if (!isFree) paidPity = 0;
    } else if (item.rarity === 5) {
      current.count5++;
    } else if (item.rarity === 4) {
      current.count4++;
    }
  }

  finalizeCurrent();
  if (results.length > 0) results[results.length - 1]!.isCurrentPool = true;
  return results.reverse();
};

export const analyzeWeaponPoolData = (
  poolKey: string,
  rawData: WeaponRecord[],
  up6Id?: string,
  rerunCounts: RerunCountMap = {},
): GachaStatistics => {
  const data = filterStatisticalRecords(rawData).slice().reverse();
  const poolType = resolveWeaponPoolType(poolKey);
  const isRerun = poolType === WEAPON_RERUN_POOL_TYPE;

  let count6 = 0;
  let count5 = 0;
  let count4 = 0;
  let pullsSinceLast6 = 0;
  let gotUp6 = false;
  let currentVersion: number | null = null;
  const history6: HistoryRecord[] = [];

  for (const item of data) {
    if (isRerun && typeof item.poolVersion === "number" && Number.isFinite(item.poolVersion)) {
      if (currentVersion !== null && item.poolVersion !== currentVersion) {
        pullsSinceLast6 = 0;
      }
      currentVersion = item.poolVersion;
    }
    pullsSinceLast6++;

    if (item.rarity === 6) {
      count6++;
      const hasUpInfo = !!up6Id;
      const isUp = hasUpInfo && item.weaponId === up6Id;
      history6.push({
        name: item.weaponName,
        itemId: item.weaponId,
        pity: pullsSinceLast6,
        isNew: item.isNew,
        hasUpInfo,
        isUp,
        poolId: poolKey,
        poolName: item.poolName || poolKey,
        gachaTs: item.gachaTs,
        seqId: item.seqId,
      });
      if (isUp) gotUp6 = true;
      pullsSinceLast6 = 0;
    } else if (item.rarity === 5) {
      count5++;
    } else if (item.rarity === 4) {
      count4++;
    }
  }

  history6.reverse();
  const { avgPity6, upWinRate } = computeMetrics(history6);
  const displayPoolName =
    data.length > 0 && data[data.length - 1]!.poolName
      ? data[data.length - 1]!.poolName
      : poolKey;

  const officialTotalCount = isRerun ? rerunCounts[poolKey] : undefined;
  const bigCount = Math.min(officialTotalCount ?? data.length, WEAPON_BIG_PITY_MAX);

  return {
    poolId: poolKey,
    poolName: displayPoolName,
    poolType,
    totalPulls: data.length,
    paidPulls: data.length,
    freePulls: 0,
    pityCount: pullsSinceLast6,
    smallPityMax: WEAPON_SMALL_PITY_MAX,
    bigPityMax: WEAPON_BIG_PITY_MAX,
    bigPityCount: gotUp6 ? 0 : bigCount,
    bigPityRemaining: gotUp6 ? 0 : Math.max(0, WEAPON_BIG_PITY_MAX - bigCount),
    officialTotalCount,
    up6Ids: up6Id ? [up6Id] : undefined,
    gotUp6,
    count6,
    count5,
    count4,
    avgPity6,
    upWinRate,
    history6,
  };
};

export const mergeAllPoolStats = (
  title: string,
  poolType: string,
  stats: GachaStatistics[],
): GachaStatistics => {
  const history6 = stats
    .flatMap((s) => s.history6)
    .sort((a, b) => compareSeqId(String(b.seqId || ""), String(a.seqId || "")));

  const totalPulls = stats.reduce((sum, s) => sum + s.totalPulls, 0);
  const paidPulls = stats.reduce((sum, s) => sum + s.paidPulls, 0);
  const freePulls = stats.reduce((sum, s) => sum + s.freePulls, 0);
  const count6 = stats.reduce((sum, s) => sum + s.count6, 0);
  const count5 = stats.reduce((sum, s) => sum + s.count5, 0);
  const count4 = stats.reduce((sum, s) => sum + s.count4, 0);
  const latest = stats[0];
  const { avgPity6, upWinRate } = computeMetrics(history6);

  return {
    poolName: title,
    poolType,
    totalPulls,
    paidPulls,
    freePulls,
    pityCount: latest?.pityCount ?? 0,
    smallPityMax: latest?.smallPityMax ?? CHAR_SMALL_PITY_MAX,
    bigPityMax: latest?.bigPityMax,
    bigPityCount: latest?.bigPityCount,
    bigPityRemaining: latest?.bigPityRemaining,
    gotUp6: latest?.gotUp6,
    count6,
    count5,
    count4,
    avgPity6,
    upWinRate,
    history6,
  };
};

export const renderAsciiBar = (current: number, max: number, width = 20): string => {
  if (max <= 0) return `[${"░".repeat(width)}]`;
  const ratio = Math.max(0, Math.min(1, current / max));
  const filled = Math.round(ratio * width);
  return `[${"█".repeat(filled)}${"░".repeat(width - filled)}]`;
};

export interface WeaponGiftMilestone {
  pulls: number;
  prog: number;
  span: number;
  nextTarget: number;
  remaining: number;
  nextLabel: "補充武庫箱" | "UP 武器";
  boxesEarned: number;
  weaponsEarned: number;
}

export const computeWeaponGiftMilestone = (pulls: number): WeaponGiftMilestone => {
  const safePulls = Math.max(0, Math.floor(pulls));
  const boxesEarned = safePulls >= 100 ? 1 + Math.floor((safePulls - 100) / 160) : 0;
  const weaponsEarned = safePulls >= 180 ? 1 + Math.floor((safePulls - 180) / 160) : 0;

  if (safePulls < 100) {
    return {
      pulls: safePulls,
      prog: safePulls,
      span: 100,
      nextTarget: 100,
      remaining: 100 - safePulls,
      nextLabel: "補充武庫箱",
      boxesEarned,
      weaponsEarned,
    };
  }

  const stepIndex = Math.floor((safePulls - 100) / 80);
  const prevMilestone = 100 + stepIndex * 80;
  const nextTarget = prevMilestone + 80;
  const nextIsWeapon = stepIndex % 2 === 0;

  return {
    pulls: safePulls,
    prog: safePulls - prevMilestone,
    span: 80,
    nextTarget,
    remaining: nextTarget - safePulls,
    nextLabel: nextIsWeapon ? "UP 武器" : "補充武庫箱",
    boxesEarned,
    weaponsEarned,
  };
};

const STANDARD_6_CHAR_IDS = new Set([
  "chr_0009_azrila", // 餘燼
  "chr_0015_lifeng", // 黎風
  "chr_0025_ardelia", // 艾爾黛拉
  "chr_0026_lastrite", // 別禮
  "chr_0029_pograni", // 駿衛
]);

export const isLimited6Star = (
  record: { itemId?: string; isUp?: boolean },
  poolInfoById: Record<string, PoolInfoEntry>,
): boolean => {
  if (record.isUp) return true;
  const id = String(record.itemId || "").trim();
  if (!id) return false;
  if (STANDARD_6_CHAR_IDS.has(id)) return false;
  for (const info of Object.values(poolInfoById)) {
    if (info.pool_type === "special" || info.pool_type === "rerun") {
      if (info.up6_id === id || info.up6_ids?.includes(id)) return true;
    }
  }
  return false;
};
