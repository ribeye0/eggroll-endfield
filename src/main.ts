import "@fontsource/noto-sans-tc/400.css";
import "@fontsource/noto-sans-tc/700.css";
import "@fontsource/noto-sans-sc/400.css";
import "@fontsource/noto-sans-sc/700.css";
import "@fontsource/noto-sans-jp/400.css";
import "@fontsource/noto-sans-jp/700.css";
import "@fontsource/noto-sans-kr/400.css";
import "@fontsource/noto-sans-kr/700.css";
import "./style.css";
import type {
  AccountInfo,
  AccountRecords,
  AppStore,
  GachaStatistics,
  Provider,
} from "./types";
import {
  analyzeJointPoolData,
  analyzeRerunPoolData,
  analyzeSimpleCharPool,
  analyzeSpecialPoolData,
  analyzeWeaponPoolData,
  BEGINNER_POOL_KEY,
  computeWeaponGiftMilestone,
  isLimited6Star,
  JOINT_POOL_KEY,
  mergeAllPoolStats,
  POOL_NAME_MAP,
  renderAsciiBar,
  RERUN_POOL_KEY,
  SPECIAL_POOL_KEY,
  STANDARD_POOL_KEY,
  WEAPON_LIMITED_POOL_TYPE,
  WEAPON_RERUN_POOL_TYPE,
} from "./gachaCalc";
import {
  detectGachaLog,
  exchangeLoginTokenToAccounts,
  exportBinaryToFile,
  exportJsonToFile,
  loadAppStore,
  openOfficialLoginWindow,
  parseGachaUrlOrToken,
  queryAccountFromToken,
  refreshU8TokenFromLoginToken,
  saveAppStore,
  syncAccountGacha,
} from "./api";
import {
  renderStatsToImageBytes,
  type FontScale,
  type ImageFormat,
  type ImageWidth,
  type UpscaleFactor,
} from "./imageExport";
import {
  AKEGF_HOME_URL,
  AKEGF_VERSION,
  exportAccountToAkegf,
  importFromAkegf,
  isAkegfDocument,
} from "./akegf";
import {
  getApiLang,
  getHtmlLang,
  LOCALE_LABELS,
  TRANSLATIONS,
  type Locale,
} from "./i18n";
import { localizeItemName, localizePoolName } from "./itemI18n";
import { applyCachedCatalog, refreshRemoteCatalog } from "./remoteCatalog";
import { DEMO_ACCOUNT, DEMO_POOL_INFO, DEMO_RECORDS } from "./demoData";

type MainTab = "char" | "weapon" | "import";
type SortField = "time" | "pity";
type SortDir = "desc" | "asc";
type HistoryFilter = "all" | "offbanner";

interface PoolEntry {
  id: string;
  group: string;
  label: string;
  stat: GachaStatistics;
}

const state = {
  store: {
    accounts: [],
    records: {},
    poolInfo: {},
    theme: "dark",
  } as AppStore,
  tab: "char" as MainTab,
  selectedPoolId: "",
  sortField: "time" as SortField,
  sortDir: "desc" as SortDir,
  historyFilter: "all" as HistoryFilter,
  historyPage: 1,
  busy: false,
  statusText: "就緒",
  statusError: false,
  logProvider: "gryphline" as Provider,
  loginProvider: "gryphline" as Provider,
  customLogPath: "",
  urlInput: "",
  manualProvider: "gryphline" as Provider,
  manualServerId: "auto",
  imgModalOpen: false,
  imgFormat: "png" as ImageFormat,
  imgScale: 2 as UpscaleFactor,
  imgWidth: 780 as ImageWidth,
  imgFontScale: 1 as FontScale,
  imgHistoryLimit: 10 as number | "all",
  imgGroupByPool: true,
  imgPoolLimit: 3 as number | "all",
};

const MIN_ZOOM = 0.8;
const MAX_ZOOM = 1.5;
const ZOOM_STEP = 0.1;

function clampZoom(z: number): number {
  return Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z)) * 10) / 10;
}

function getTr() {
  return TRANSLATIONS[state.store.locale || "zh-TW"];
}

function applyThemeAndZoom(): void {
  const locale = state.store.locale || "zh-TW";
  document.documentElement.setAttribute("data-theme", state.store.theme);
  document.documentElement.setAttribute("lang", getHtmlLang(locale));
  const z = clampZoom(state.store.zoom ?? 1);
  state.store.zoom = z;
  document.documentElement.style.setProperty("--ui-zoom", String(z));
}

async function changeZoom(delta: number | "reset"): Promise<void> {
  const next = delta === "reset" ? 1 : clampZoom((state.store.zoom ?? 1) + delta);
  if (next === state.store.zoom) return;
  state.store.zoom = next;
  applyThemeAndZoom();
  await saveAppStore(state.store);
  render();
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatFileTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function formatTs(ts?: string): string {
  if (!ts) return "-";
  const num = Number(ts);
  if (!Number.isFinite(num) || num <= 0) return ts;
  const d = new Date(num);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getActiveAccount(): AccountInfo | undefined {
  return (
    state.store.accounts.find((a) => a.key === state.store.activeAccountKey) ||
    state.store.accounts[0]
  );
}

function getActiveRecords(): AccountRecords {
  const acc = getActiveAccount();
  if (!acc) return { char: {}, weapon: {} };
  return state.store.records[acc.key] || { char: {}, weapon: {} };
}

function setStatus(msg: string, isError = false): void {
  state.statusText = msg;
  state.statusError = isError;
  const el = document.querySelector(".statusbar-msg");
  if (el) {
    el.textContent = msg;
    el.classList.toggle("is-error", isError);
  }
}

function buildCharPoolEntries(records: AccountRecords): PoolEntry[] {
  const entries: PoolEntry[] = [];
  const poolInfo = state.store.poolInfo;

  const specialRaw = records.char[SPECIAL_POOL_KEY] || [];
  const specialStats = analyzeSpecialPoolData(specialRaw, poolInfo);

  const rerunRaw = records.char[RERUN_POOL_KEY] || [];
  const rerunStats = analyzeRerunPoolData(rerunRaw, poolInfo, records.charRerunCounts);

  const knownCharPoolKeys = new Set([
    SPECIAL_POOL_KEY,
    RERUN_POOL_KEY,
    STANDARD_POOL_KEY,
    BEGINNER_POOL_KEY,
  ]);
  const jointRaw = Object.entries(records.char || {})
    .filter(([k]) => !knownCharPoolKeys.has(k))
    .flatMap(([, list]) => list || []);
  const jointStats = analyzeJointPoolData(jointRaw, poolInfo);

  const tr = getTr();
  const locale = state.store.locale || "zh-TW";
  const combinedLimited = [...specialStats, ...rerunStats, ...jointStats];
  if (combinedLimited.length > 0) {
    const mergedLimited = mergeAllPoolStats(
      tr.allLimitedTitle,
      "limited_all",
      combinedLimited,
    );
    const subPities: Array<{ label: string; pity: number; max: number }> = [];
    if (specialStats.length > 0) {
      subPities.push({
        label: tr.subSpecial,
        pity: specialStats[0]!.pityCount,
        max: specialStats[0]!.smallPityMax,
      });
    }
    if (rerunStats.length > 0) {
      subPities.push({
        label: tr.subRerun,
        pity: rerunStats[0]!.pityCount,
        max: rerunStats[0]!.smallPityMax,
      });
    }
    mergedLimited.subPities = subPities;
    mergedLimited.bigPityMax = undefined;
    entries.push({
      id: "char:limited:all",
      group: tr.groupLimitedAll,
      label: tr.allLimitedLabel,
      stat: mergedLimited,
    });
  }

  if (specialStats.length > 0) {
    entries.push({
      id: "char:special:all",
      group: tr.groupSpecial,
      label: tr.allSpecialLabel,
      stat: mergeAllPoolStats(tr.allSpecialTitle, SPECIAL_POOL_KEY, specialStats),
    });
    for (const s of specialStats) {
      entries.push({
        id: `char:special:${s.poolId || s.poolName}`,
        group: tr.groupSpecial,
        label: localizePoolName(s.poolId, s.poolName, locale),
        stat: s,
      });
    }
  }

  if (rerunStats.length > 0) {
    entries.push({
      id: "char:rerun:all",
      group: tr.groupRerun,
      label: tr.allRerunLabel,
      stat: mergeAllPoolStats(tr.allRerunTitle, RERUN_POOL_KEY, rerunStats),
    });
    for (const s of rerunStats) {
      entries.push({
        id: `char:rerun:${s.poolName}`,
        group: tr.groupRerun,
        label: localizePoolName(s.poolId, s.poolName, locale),
        stat: s,
      });
    }
  }

  if (jointStats.length > 0) {
    entries.push({
      id: "char:joint:all",
      group: tr.groupJoint,
      label: tr.allJointLabel,
      stat: mergeAllPoolStats(tr.allJointTitle, JOINT_POOL_KEY, jointStats),
    });
    for (const s of jointStats) {
      entries.push({
        id: `char:joint:${s.poolId || s.poolName}`,
        group: tr.groupJoint,
        label: localizePoolName(s.poolId, s.poolName, locale),
        stat: s,
      });
    }
  }

  const simpleStats: Array<{ key: string; stat: GachaStatistics }> = [];
  for (const key of [STANDARD_POOL_KEY, BEGINNER_POOL_KEY]) {
    const raw = records.char[key] || [];
    if (raw.length > 0 || entries.length === 0) {
      simpleStats.push({ key, stat: analyzeSimpleCharPool(key, raw) });
    }
  }
  if (simpleStats.length > 0) {
    if (simpleStats.length > 1) {
      entries.push({
        id: "char:simple:all",
        group: tr.groupStandard,
        label: tr.allStandardLabel,
        stat: mergeAllPoolStats(
          tr.allStandardTitle,
          "standard_all",
          simpleStats.map((x) => x.stat),
        ),
      });
    }
    for (const { key, stat } of simpleStats) {
      entries.push({
        id: `char:simple:${key}`,
        group: tr.groupStandard,
        label: localizePoolName(key, POOL_NAME_MAP[key] || key, locale),
        stat,
      });
    }
  }

  return entries;
}

function buildWeaponPoolEntries(records: AccountRecords): PoolEntry[] {
  const entries: PoolEntry[] = [];
  const tr = getTr();
  const locale = state.store.locale || "zh-TW";
  const poolInfo = state.store.poolInfo;
  const allStats: GachaStatistics[] = [];

  for (const [poolId, raw] of Object.entries(records.weapon || {})) {
    if (!raw || raw.length === 0) continue;
    const up6Id = poolInfo[poolId]?.up6_id;
    const stat = analyzeWeaponPoolData(poolId, raw, up6Id, records.weaponRerunCounts);
    allStats.push(stat);
  }

  if (allStats.length > 0) {
    entries.push({
      id: "weapon:all",
      group: tr.groupWeapon,
      label: tr.allWeaponLabel,
      stat: mergeAllPoolStats(tr.allWeaponTitle, "weapon", allStats),
    });
    for (const s of allStats) {
      entries.push({
        id: `weapon:${s.poolId}`,
        group: tr.groupWeapon,
        label: localizePoolName(s.poolId, s.poolName, locale),
        stat: s,
      });
    }
  }
  return entries;
}

function pityColorClass(pity: number, max: number): string {
  if (pity <= 0) return "c-cyan";
  const ratio = pity / max;
  if (ratio <= 0.45) return "c-green";
  if (ratio <= 0.78) return "c-gold";
  return "c-red";
}

function renderTopBar(): string {
  const tr = getTr();
  const locale = state.store.locale || "zh-TW";
  const accounts = state.store.accounts;
  const active = getActiveAccount();
  const accountOptions =
    accounts.length === 0
      ? `<option value="">${escapeHtml(tr.noAccount)}</option>`
      : accounts
          .map(
            (a) =>
              `<option value="${escapeHtml(a.key)}" ${a.key === active?.key ? "selected" : ""}>${escapeHtml(a.nickName)} (${escapeHtml(a.roleId || a.uid)} / ${escapeHtml(a.serverName)})</option>`,
          )
          .join("");

  const localeOptions = (Object.keys(LOCALE_LABELS) as Locale[])
    .map(
      (loc) =>
        `<option value="${loc}" ${loc === locale ? "selected" : ""}>${LOCALE_LABELS[loc]}</option>`,
    )
    .join("");

  return `
    <header class="topbar">
      <div class="brand">
        <span>EggRoll // Endfield Pull Tracker</span>
      </div>
      <div class="topbar-controls">
        <span class="c-muted">${escapeHtml(tr.accountLabel)}</span>
        <select id="account-select">${accountOptions}</select>
        <button id="btn-sync" class="btn-sync" ${state.busy || (!active?.u8Token && !active?.loginToken) ? "disabled" : ""}>${escapeHtml(tr.syncBtn)}</button>
        <button id="btn-export-img" class="btn-export-img" ${!active || state.tab === "import" ? "disabled" : ""}>${escapeHtml(tr.exportImgBtn)}</button>
        <button id="btn-export" ${!active ? "disabled" : ""}>${escapeHtml(tr.exportJsonBtn)}</button>
        <button id="btn-zoom-out" title="Zoom out (-)">[-]</button>
        <button id="btn-zoom-reset" title="Reset zoom (0)">${Math.round((state.store.zoom ?? 1) * 100)}%</button>
        <button id="btn-zoom-in" title="Zoom in (+)">[+]</button>
        <button id="btn-theme">${escapeHtml(tr.themeBtn(state.store.theme === "dark" ? "DARK" : "LIGHT"))}</button>
        <select id="locale-select" title="Language / 語言">${localeOptions}</select>
      </div>
    </header>
  `;
}

function renderTabBar(): string {
  const tr = getTr();
  const active = getActiveAccount();
  const records = getActiveRecords();
  const syncMeta = tr.lastSync(active ? records.lastSyncAt : undefined);
  return `
    <nav class="tabbar">
      <div class="tabs-left">
        <button class="${state.tab === "char" ? "active" : ""}" data-tab="char">${escapeHtml(tr.tabChar)}</button>
        <button class="${state.tab === "weapon" ? "active" : ""}" data-tab="weapon">${escapeHtml(tr.tabWeapon)}</button>
        <button class="${state.tab === "import" ? "active" : ""}" data-tab="import">${escapeHtml(tr.tabImport)}</button>
      </div>
      <div class="sync-meta">${escapeHtml(syncMeta)}</div>
    </nav>
  `;
}

function renderStatsView(entries: PoolEntry[]): string {
  const tr = getTr();
  const locale = state.store.locale || "zh-TW";
  if (entries.length === 0) {
    return `
      <fieldset class="tui-panel">
        <legend class="tui-legend">${escapeHtml(tr.noRecordsTitle)}</legend>
        <div class="empty-state">
          <p>${escapeHtml(tr.noRecordsDesc)}</p>
          <div class="row" style="justify-content:center; margin-top: 12px;">
            <button id="btn-go-import">${escapeHtml(tr.goImportBtn)}</button>
            <button id="btn-load-demo">${escapeHtml(tr.loadDemoBtn)}</button>
          </div>
        </div>
      </fieldset>
    `;
  }

  const selected = entries.find((e) => e.id === state.selectedPoolId) || entries[0]!;
  state.selectedPoolId = selected.id;
  const s = selected.stat;

  const groups = new Map<string, PoolEntry[]>();
  for (const e of entries) {
    if (!groups.has(e.group)) groups.set(e.group, []);
    groups.get(e.group)!.push(e);
  }

  const sidebarHtml = Array.from(groups.entries())
    .map(
      ([groupName, items]) => `
        <div class="pool-group-label">${escapeHtml(groupName)}</div>
        ${items
          .map((it) => {
            const st = it.stat;
            const badge = st.isCurrentPool ? `<span class="c-green">${escapeHtml(tr.currentBadge)}</span> ` : "";
            return `
              <button class="pool-item ${it.id === selected.id ? "active" : ""}" data-pool-id="${escapeHtml(it.id)}">
                <div class="pool-item-top">
                  <span class="pool-item-name">${badge}${escapeHtml(it.label)}</span>
                  <span class="pool-item-pulls c-muted">${st.totalPulls}${escapeHtml(tr.pullsUnit)}</span>
                </div>
                <div class="pool-item-sub">
                  <span class="c-gold">6★: ${st.count6}</span>
                  <span>${st.subPities ? escapeHtml(tr.mergedLabel) : escapeHtml(tr.pityLabel(st.pityCount, st.smallPityMax))}</span>
                </div>
              </button>
            `;
          })
          .join("")}
      `,
    )
    .join("");

  const rate6 = s.totalPulls > 0 ? ((s.count6 / s.totalPulls) * 100).toFixed(2) : "0.00";
  const avgText = s.avgPity6 !== null ? `${s.avgPity6.toFixed(1)} ${tr.pullsUnit}` : "-";
  const upRateText = s.upWinRate !== null ? `${s.upWinRate.toFixed(1)}%` : "-";
  const upChecksCount = s.history6.filter((h) => h.hasUpInfo).length;
  const up6Count = s.history6.filter((h) => h.hasUpInfo && h.isUp).length;
  const up6Text = upChecksCount > 0 ? `${up6Count}` : "-";
  const limited6Count = s.history6.filter((h) => isLimited6Star(h, state.store.poolInfo)).length;
  const smallRem = Math.max(0, s.smallPityMax - s.pityCount);
  const smallBar = renderAsciiBar(s.pityCount, s.smallPityMax, 22);

  let bigPityHtml = "";
  if (s.bigPityMax && s.bigPityMax > 0) {
    if (s.gotUp6) {
      bigPityHtml = `
        <div class="pity-row">
          <span class="pity-label">${escapeHtml(tr.bigPityStatus)}</span>
          <span class="c-green">${escapeHtml(tr.bigPityGot)}</span>
          <span class="c-muted">${escapeHtml(tr.bigPityGotSub)}</span>
        </div>
      `;
    } else {
      const bc = s.bigPityCount ?? 0;
      const bmax = s.bigPityMax;
      const brem = s.bigPityRemaining ?? Math.max(0, bmax - bc);
      bigPityHtml = `
        <div class="pity-row">
          <span class="pity-label">${escapeHtml(tr.bigPityProg)}</span>
          <span class="ascii-bar c-gold">${renderAsciiBar(bc, bmax, 22)}</span>
          <span class="pity-text">${bc} / ${bmax} <span class="c-muted">${escapeHtml(tr.bigPityRem(brem))}</span></span>
        </div>
      `;
    }
  }

  let tokenHtml = "";
  if ((s.poolType === SPECIAL_POOL_KEY || s.poolType === RERUN_POOL_KEY) && s.poolId) {
    const tokenStep = 240;
    const validPulls =
      s.poolType === RERUN_POOL_KEY
        ? (s.officialTotalCount ?? s.paidPulls)
        : s.paidPulls;
    const tokenEarned = Math.floor(validPulls / tokenStep);
    const tokenProg = validPulls % tokenStep;
    const tokenRem = tokenStep - tokenProg;
    const earnedHtml =
      tokenEarned > 0
        ? `<strong class="c-gold">${escapeHtml(tr.tokenEarnedText(tokenEarned))}</strong>`
        : `<span class="c-muted">${escapeHtml(tr.tokenEarnedText(tokenEarned))}</span>`;
    tokenHtml = `
      <div class="pity-row">
        <span class="pity-label">${escapeHtml(tr.tokenProg)}</span>
        <span class="ascii-bar ${tokenEarned > 0 ? "c-green" : "c-cyan"}">${renderAsciiBar(tokenProg, tokenStep, 22)}</span>
        <span class="pity-text">${tokenProg} / ${tokenStep} <span class="c-muted">(${escapeHtml(tr.tokenRemText(tokenRem))} | </span>${earnedHtml}<span class="c-muted">)</span></span>
      </div>
    `;
  } else if (
    (s.poolType === WEAPON_LIMITED_POOL_TYPE || s.poolType === WEAPON_RERUN_POOL_TYPE) &&
    s.poolId
  ) {
    const validPulls =
      s.poolType === WEAPON_RERUN_POOL_TYPE
        ? (s.officialTotalCount ?? s.totalPulls)
        : s.totalPulls;
    const wg = computeWeaponGiftMilestone(validPulls);
    const giftTargetLabel = wg.nextLabel === "補充武庫箱" ? tr.boxLabel : tr.upWeaponLabel;
    tokenHtml = `
      <div class="pity-row">
        <span class="pity-label">${escapeHtml(tr.weaponGift)}</span>
        <span class="ascii-bar ${wg.weaponsEarned > 0 ? "c-green" : "c-cyan"}">${renderAsciiBar(wg.prog, wg.span, 22)}</span>
        <span class="pity-text">${wg.pulls} / ${wg.nextTarget} <span class="c-muted">${escapeHtml(tr.weaponGiftDesc(giftTargetLabel, wg.remaining, wg.boxesEarned, wg.weaponsEarned))}</span></span>
      </div>
    `;
  }

  const pitySectionHtml = s.subPities
    ? `
      <div class="pity-section">
        <div class="pity-row">
          <span class="pity-label">${escapeHtml(tr.subPities)}</span>
          <span class="c-cyan" style="grid-column: 2 / -1;">${s.subPities.map((sp) => `${escapeHtml(sp.label)} ${sp.pity}/${sp.max}`).join(" &nbsp;|&nbsp; ")}</span>
        </div>
      </div>
    `
    : `
      <div class="pity-section">
        <div class="pity-row">
          <span class="pity-label">${escapeHtml(tr.smallPity)}</span>
          <span class="ascii-bar ${pityColorClass(s.pityCount, s.smallPityMax)}">${smallBar}</span>
          <span class="pity-text">${s.pityCount} / ${s.smallPityMax} <span class="c-muted">${escapeHtml(tr.smallPityRem(smallRem))}</span></span>
        </div>
        ${bigPityHtml}
        ${tokenHtml}
      </div>
    `;

  const filteredHistory = s.history6.filter((h) => {
    if (state.historyFilter === "offbanner") {
      return h.hasUpInfo && !h.isUp;
    }
    return true;
  });

  const sortedHistory = filteredHistory.slice().sort((a, b) => {
    const mul = state.sortDir === "desc" ? -1 : 1;
    if (state.sortField === "pity") {
      return (a.pity - b.pity) * mul;
    }
    return (
      String(a.seqId || "").localeCompare(String(b.seqId || ""), undefined, {
        numeric: true,
      }) * mul
    );
  });

  const limit = state.store.historyLimit ?? 20;
  const totalItems = sortedHistory.length;
  const pageSize = limit === "all" ? Math.max(1, totalItems) : Math.max(1, limit);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (state.historyPage > totalPages) state.historyPage = totalPages;
  if (state.historyPage < 1) state.historyPage = 1;
  const startIdx = (state.historyPage - 1) * pageSize;
  const displayedHistory =
    limit === "all" ? sortedHistory : sortedHistory.slice(startIdx, startIdx + pageSize);

  const isOverview = isOverviewStat(s);

  const renderHistoryRow = (h: (typeof displayedHistory)[number], rowNum: number, showPool: boolean) => {
    const pCls = pityColorClass(h.pity, s.smallPityMax);
    const bar = h.isFree ? "[FREE_PULL]" : renderAsciiBar(h.pity, s.smallPityMax, 12);
    const tags: string[] = [];
    if (h.hasUpInfo) {
      tags.push(
        h.isUp
          ? `<span class="tag c-green">UP</span>`
          : `<span class="tag c-red">${escapeHtml(tr.tagOff)}</span>`,
      );
    }
    if (h.isNew) tags.push(`<span class="tag c-gold">NEW</span>`);
    if (h.isFree) tags.push(`<span class="tag c-cyan">${escapeHtml(tr.tagFree)}</span>`);
    const poolAndTime = showPool
      ? `${localizePoolName(h.poolId, h.poolName, locale) || "-"} // ${formatTs(h.gachaTs)}`
      : formatTs(h.gachaTs);

    return `
      <tr>
        <td class="c-muted">${rowNum}</td>
        <td class="c-gold"><strong>${escapeHtml(localizeItemName(h.itemId, h.name, locale))}</strong></td>
        <td class="${pCls}">${h.isFree ? escapeHtml(tr.freeText) : `${h.pity} ${escapeHtml(tr.pullsUnit)}`}</td>
        <td class="ascii-bar ${pCls}">${bar}</td>
        <td>${tags.join("") || `<span class="c-muted">-</span>`}</td>
        <td class="c-muted">${escapeHtml(poolAndTime)}</td>
      </tr>
    `;
  };

  const sortArrow = (field: SortField) =>
    state.sortField === field ? (state.sortDir === "desc" ? " ▼" : " ▲") : "";

  let historyContentHtml = "";
  if (displayedHistory.length === 0) {
    historyContentHtml = `
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>${escapeHtml(tr.colName)}</th>
            <th class="sortable" data-sort="pity">${escapeHtml(tr.colPulls)}${sortArrow("pity")}</th>
            <th>${escapeHtml(tr.colBar)}</th>
            <th>${escapeHtml(tr.colTags)}</th>
            <th class="sortable" data-sort="time">${escapeHtml(tr.colPoolTime)}${sortArrow("time")}</th>
          </tr>
        </thead>
        <tbody>
          <tr><td colspan="6" class="c-muted" style="text-align:center; padding: 18px;">${escapeHtml(tr.noHistoryMatch)}</td></tr>
        </tbody>
      </table>
    `;
  } else if (isOverview) {
    const poolGroups = new Map<
      string,
      { title: string; items: Array<{ item: (typeof displayedHistory)[number]; num: number }> }
    >();
    displayedHistory.forEach((h, idx) => {
      const key = h.poolId || h.poolName || "-";
      const title = localizePoolName(h.poolId, h.poolName, locale) || "-";
      if (!poolGroups.has(key)) poolGroups.set(key, { title, items: [] });
      poolGroups.get(key)!.items.push({ item: h, num: startIdx + idx + 1 });
    });

    historyContentHtml = `
      <div class="pool-history-groups">
        ${Array.from(poolGroups.values())
          .map(
            (g) => `
              <fieldset class="tui-panel pool-history-box">
                <legend class="tui-legend">${escapeHtml(g.title)} (${g.items.length})</legend>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>${escapeHtml(tr.colName)}</th>
                      <th class="sortable" data-sort="pity">${escapeHtml(tr.colPulls)}${sortArrow("pity")}</th>
                      <th>${escapeHtml(tr.colBar)}</th>
                      <th>${escapeHtml(tr.colTags)}</th>
                      <th class="sortable" data-sort="time">${escapeHtml(tr.sortTime)}${sortArrow("time")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${g.items.map(({ item, num }) => renderHistoryRow(item, num, false)).join("")}
                  </tbody>
                </table>
              </fieldset>
            `,
          )
          .join("")}
      </div>
    `;
  } else {
    historyContentHtml = `
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>${escapeHtml(tr.colName)}</th>
            <th class="sortable" data-sort="pity">${escapeHtml(tr.colPulls)}${sortArrow("pity")}</th>
            <th>${escapeHtml(tr.colBar)}</th>
            <th>${escapeHtml(tr.colTags)}</th>
            <th class="sortable" data-sort="time">${escapeHtml(tr.colPoolTime)}${sortArrow("time")}</th>
          </tr>
        </thead>
        <tbody>
          ${displayedHistory.map((h, idx) => renderHistoryRow(h, startIdx + idx + 1, true)).join("")}
        </tbody>
      </table>
    `;
  }

  const historyTitle = tr.historyTitle(displayedHistory.length, sortedHistory.length);
  const customLimitVal = limit === "all" ? "" : String(limit);

  return `
    <div class="workspace">
      <fieldset class="tui-panel">
        <legend class="tui-legend">${escapeHtml(tr.poolListTitle(entries.length))}</legend>
        <div class="tui-panel-scroll sidebar-list">
          ${sidebarHtml}
        </div>
      </fieldset>

      <div class="main-pane">
        <fieldset class="tui-panel">
          <legend class="tui-legend">${escapeHtml(localizePoolName(s.poolId, s.poolName, locale))}</legend>
          <div class="kpi-grid">
            <div class="kpi-cell">
              <span class="kpi-label">${escapeHtml(tr.kpiTotalPulls)}</span>
              <span class="kpi-value">${s.totalPulls}</span>
              <span class="kpi-sub">${escapeHtml(tr.kpiTotalSub(s.paidPulls, s.freePulls))}</span>
            </div>
            <div class="kpi-cell">
              <span class="kpi-label">${escapeHtml(tr.kpiCount6)}</span>
              <span class="kpi-value c-gold">${s.count6}</span>
              <span class="kpi-sub">${escapeHtml(tr.kpiRate6(rate6))}</span>
            </div>
            <div class="kpi-cell">
              <span class="kpi-label">${escapeHtml(tr.kpiAvg6)}</span>
              <span class="kpi-value c-cyan">${avgText}</span>
              <span class="kpi-sub">${escapeHtml(tr.kpiAvgSub)}</span>
            </div>
            <div class="kpi-cell">
              <span class="kpi-label">${escapeHtml(tr.kpiUpRate)}</span>
              <span class="kpi-value c-green">${upRateText}</span>
              <span class="kpi-sub">${escapeHtml(tr.kpiUpRateSub)}</span>
            </div>
            <div class="kpi-cell">
              <span class="kpi-label">${escapeHtml(tr.kpiUp6)}</span>
              <span class="kpi-value c-green">${up6Text}</span>
              <span class="kpi-sub">${upChecksCount > 0 ? escapeHtml(tr.kpiOffSub(upChecksCount - up6Count)) : escapeHtml(tr.kpiNoUpPool)}</span>
            </div>
            <div class="kpi-cell">
              <span class="kpi-label">${escapeHtml(tr.kpiLimited6)}</span>
              <span class="kpi-value c-gold">${limited6Count}</span>
              <span class="kpi-sub">${s.count6 > 0 ? escapeHtml(tr.kpiLimitedSub(((limited6Count / s.count6) * 100).toFixed(0))) : escapeHtml(tr.kpiNo6)}</span>
            </div>
          </div>

          ${pitySectionHtml}
        </fieldset>

        <fieldset class="tui-panel">
          <legend class="tui-legend">${escapeHtml(historyTitle)}</legend>
          <div class="table-toolbar">
            <div class="table-toolbar-group">
              <button class="${state.historyFilter === "all" ? "active" : ""}" data-filter="all">${escapeHtml(tr.filterAll)}</button>
              <button class="${state.historyFilter === "offbanner" ? "active" : ""}" data-filter="offbanner">${escapeHtml(tr.filterOff)}</button>
            </div>
            <div class="table-toolbar-group">
              <span class="c-muted">${escapeHtml(tr.showLabel)}</span>
              <button class="${limit === 10 ? "active" : ""}" data-limit="10">10</button>
              <button class="${limit === 20 ? "active" : ""}" data-limit="20">20</button>
              <button class="${limit === 50 ? "active" : ""}" data-limit="50">50</button>
              <button class="${limit === "all" ? "active" : ""}" data-limit="all">${escapeHtml(tr.allOpt)}</button>
              <input id="custom-limit-input" type="number" min="1" placeholder="${escapeHtml(tr.customPlaceholder)}" value="${escapeHtml(customLimitVal)}" style="width:64px; padding:3px 6px;" />
            </div>
            <div class="table-toolbar-group">
              <button id="btn-page-prev" ${state.historyPage <= 1 ? "disabled" : ""}>${escapeHtml(tr.prevPage)}</button>
              <span class="c-muted">${escapeHtml(tr.pageInfo(state.historyPage, totalPages))}</span>
              <button id="btn-page-next" ${state.historyPage >= totalPages ? "disabled" : ""}>${escapeHtml(tr.nextPage)}</button>
            </div>
            <div class="table-toolbar-group">
              <button class="${state.sortField === "time" ? "active" : ""}" data-sort="time">[${escapeHtml(tr.sortTime)}${sortArrow("time")}]</button>
              <button class="${state.sortField === "pity" ? "active" : ""}" data-sort="pity">[${escapeHtml(tr.sortPity)}${sortArrow("pity")}]</button>
            </div>
          </div>
          <div class="tui-panel-scroll">
            ${historyContentHtml}
          </div>
        </fieldset>
      </div>
    </div>
  `;
}

function renderImportView(): string {
  const tr = getTr();
  const accountsHtml =
    state.store.accounts.length === 0
      ? `<div class="c-muted">${escapeHtml(tr.noAccounts)}</div>`
      : state.store.accounts
          .map(
            (a) => `
              <div class="account-row">
                <div class="account-info">
                  <div class="account-name"><strong>${escapeHtml(a.nickName)}</strong></div>
                  <div class="account-meta c-muted">${escapeHtml(a.roleId || a.uid)} / ${escapeHtml(a.serverName)}</div>
                </div>
                <div class="row">
                  <button data-use-account="${escapeHtml(a.key)}">${escapeHtml(tr.switchBtn)}</button>
                  <button class="c-red" data-del-account="${escapeHtml(a.key)}">${escapeHtml(tr.deleteBtn)}</button>
                </div>
              </div>
            `,
          )
          .join("");

  return `
    <div class="import-pane">
      <fieldset class="tui-panel">
        <legend class="tui-legend">${escapeHtml(tr.importLoginTitle)}</legend>
        <div class="form-stack">
          <div class="c-muted">${escapeHtml(tr.importLoginDesc)}</div>
          <div class="login-region-row">
            <span class="c-muted">${escapeHtml(tr.regionLabel)}</span>
            <select id="login-provider-select" class="grow" ${state.busy ? "disabled" : ""}>
              <option value="gryphline" ${state.loginProvider === "gryphline" ? "selected" : ""}>${escapeHtml(tr.importLoginServerGlobal)}</option>
              <option value="hypergryph" ${state.loginProvider === "hypergryph" ? "selected" : ""}>${escapeHtml(tr.importLoginServerCn)}</option>
            </select>
          </div>
          <button id="btn-official-login" class="btn-sync btn-block" ${state.busy ? "disabled" : ""}>${escapeHtml(tr.importLoginBtn)}</button>
        </div>
      </fieldset>

      <fieldset class="tui-panel">
        <legend class="tui-legend">${escapeHtml(tr.importLogTitle)}</legend>
        <div class="form-stack">
          <div class="c-muted">${escapeHtml(tr.importLogDesc)}</div>
          <div class="row">
            <input id="custom-log-path" class="grow" placeholder="${escapeHtml(tr.importLogPathPlaceholder)}" value="${escapeHtml(state.customLogPath)}" />
          </div>
          <div class="row">
            <button id="btn-read-log" ${state.busy ? "disabled" : ""}>${escapeHtml(tr.importLogBtn)}</button>
          </div>
        </div>
      </fieldset>

      <fieldset class="tui-panel">
        <legend class="tui-legend">${escapeHtml(tr.importUrlTitle)}</legend>
        <div class="form-stack">
          <div class="c-muted">${escapeHtml(tr.importUrlDesc)}</div>
          <textarea id="url-token-input" rows="3" placeholder="${escapeHtml(tr.importUrlPlaceholder)}">${escapeHtml(state.urlInput)}</textarea>
          <div class="row">
            <span class="c-muted">${escapeHtml(tr.serverLabel)}</span>
            <input id="manual-server-id" style="width:110px;" placeholder="${escapeHtml(tr.manualServerPlaceholder)}" value="${escapeHtml(state.manualServerId)}" />
            <button id="btn-sync-url" ${state.busy ? "disabled" : ""}>${escapeHtml(tr.syncUrlBtn)}</button>
          </div>
        </div>
      </fieldset>

      <fieldset class="tui-panel">
        <legend class="tui-legend">${escapeHtml(tr.importFileTitle(AKEGF_VERSION))}</legend>
        <div class="form-stack">
          <div class="c-muted">
            <a href="${AKEGF_HOME_URL}" target="_blank" rel="noreferrer" class="c-cyan">AKEGF ${AKEGF_VERSION}</a> — ${escapeHtml(tr.importFileDesc(AKEGF_VERSION))}
          </div>
          <div class="row">
            <input id="file-import-json" type="file" accept=".json" style="display:none;" />
            <button id="btn-trigger-import" type="button">${escapeHtml(tr.importFileBtn)}</button>
            <button id="btn-load-demo-2" type="button">${escapeHtml(tr.demoBtn)}</button>
          </div>
        </div>
      </fieldset>

      <fieldset class="tui-panel">
        <legend class="tui-legend">${escapeHtml(tr.accountMgmtTitle)}</legend>
        <div class="form-stack">
          ${accountsHtml}
        </div>
      </fieldset>
    </div>
  `;
}

function renderStatusBar(): string {
  const tr = getTr();
  return `
    <footer class="statusbar">
      <span class="statusbar-msg ${state.statusError ? "is-error" : ""}">${escapeHtml(state.statusText)}</span>
      <span class="statusbar-hints">${escapeHtml(tr.statusHints)}</span>
    </footer>
  `;
}

function isOverviewStat(s: GachaStatistics): boolean {
  return !!s.subPities || !s.poolId;
}

function renderImageModal(): string {
  if (!state.imgModalOpen) return "";
  const tr = getTr();
  const entries =
    state.tab === "weapon"
      ? buildWeaponPoolEntries(getActiveRecords())
      : buildCharPoolEntries(getActiveRecords());
  const selected = entries.find((e) => e.id === state.selectedPoolId) || entries[0];
  const isOverview = selected ? isOverviewStat(selected.stat) : false;
  const showPoolLimit = isOverview && state.imgGroupByPool;

  return `
    <div class="modal-backdrop" id="img-modal-backdrop">
      <fieldset class="tui-panel modal-box">
        <legend class="tui-legend">${escapeHtml(tr.imgModalTitle)}</legend>
        <div class="form-stack">
          <div class="row">
            <span class="c-muted" style="min-width:76px;">${escapeHtml(tr.imgFmt)}</span>
            <button class="${state.imgFormat === "png" ? "active" : ""}" data-img-fmt="png">${escapeHtml(tr.imgFmtPng)}</button>
            <button class="${state.imgFormat === "jpeg" ? "active" : ""}" data-img-fmt="jpeg">JPG</button>
            <button class="${state.imgFormat === "webp" ? "active" : ""}" data-img-fmt="webp">WebP</button>
          </div>
          <div class="row">
            <span class="c-muted" style="min-width:76px;">${escapeHtml(tr.imgWidth)}</span>
            <button class="${state.imgWidth === 680 ? "active" : ""}" data-img-width="680" title="680px">${escapeHtml(tr.imgWidthNarrow)}</button>
            <button class="${state.imgWidth === 780 ? "active" : ""}" data-img-width="780" title="780px">${escapeHtml(tr.imgWidthMedium)}</button>
            <button class="${state.imgWidth === 900 ? "active" : ""}" data-img-width="900" title="900px">${escapeHtml(tr.imgWidthWide)}</button>
          </div>
          <div class="row">
            <span class="c-muted" style="min-width:76px;">${escapeHtml(tr.imgFont)}</span>
            <button class="${state.imgFontScale === 0.9 ? "active" : ""}" data-img-font="0.9">${escapeHtml(tr.imgFontSmall)}</button>
            <button class="${state.imgFontScale === 1 ? "active" : ""}" data-img-font="1">${escapeHtml(tr.imgFontNormal)}</button>
            <button class="${state.imgFontScale === 1.15 ? "active" : ""}" data-img-font="1.15">${escapeHtml(tr.imgFontLarge)}</button>
            <button class="${state.imgFontScale === 1.3 ? "active" : ""}" data-img-font="1.3">${escapeHtml(tr.imgFontXL)}</button>
          </div>
          <div class="row">
            <span class="c-muted" style="min-width:76px;">${escapeHtml(tr.imgScale)}</span>
            <button class="${state.imgScale === 1 ? "active" : ""}" data-img-scale="1">1x</button>
            <button class="${state.imgScale === 2 ? "active" : ""}" data-img-scale="2">${escapeHtml(tr.imgScaleRec)}</button>
            <button class="${state.imgScale === 3 ? "active" : ""}" data-img-scale="3">3x</button>
            <span class="c-muted">${escapeHtml(tr.imgOutWidth(state.imgWidth * state.imgScale))}</span>
          </div>
          ${
            isOverview
              ? `
          <div class="row">
            <span class="c-muted" style="min-width:76px;">${escapeHtml(tr.imgGroupMode)}</span>
            <button class="${state.imgGroupByPool ? "active" : ""}" data-img-group="grouped">${escapeHtml(tr.imgGroupByPool)}</button>
            <button class="${!state.imgGroupByPool ? "active" : ""}" data-img-group="flat">${escapeHtml(tr.imgFlatList)}</button>
          </div>
          `
              : ""
          }
          ${
            showPoolLimit
              ? `
          <div class="row">
            <span class="c-muted" style="min-width:76px;">${escapeHtml(tr.imgPoolCount)}</span>
            <button class="${state.imgPoolLimit === 1 ? "active" : ""}" data-img-pool-limit="1">1</button>
            <button class="${state.imgPoolLimit === 2 ? "active" : ""}" data-img-pool-limit="2">2</button>
            <button class="${state.imgPoolLimit === 3 ? "active" : ""}" data-img-pool-limit="3">3</button>
            <button class="${state.imgPoolLimit === 4 ? "active" : ""}" data-img-pool-limit="4">4</button>
            <button class="${state.imgPoolLimit === 5 ? "active" : ""}" data-img-pool-limit="5">5</button>
            <button class="${state.imgPoolLimit === "all" ? "active" : ""}" data-img-pool-limit="all">${escapeHtml(tr.allOpt)}</button>
          </div>
          `
              : `
          <div class="row">
            <span class="c-muted" style="min-width:76px;">${escapeHtml(tr.imgCount)}</span>
            <button class="${state.imgHistoryLimit === 10 ? "active" : ""}" data-img-limit="10">10</button>
            <button class="${state.imgHistoryLimit === 20 ? "active" : ""}" data-img-limit="20">20</button>
            <button class="${state.imgHistoryLimit === 50 ? "active" : ""}" data-img-limit="50">50</button>
            <button class="${state.imgHistoryLimit === "all" ? "active" : ""}" data-img-limit="all">${escapeHtml(tr.allOpt)}</button>
          </div>
          `
          }
          <div class="row" style="justify-content:flex-end; margin-top:6px;">
            <button id="btn-img-cancel">${escapeHtml(tr.cancelBtn)}</button>
            <button id="btn-img-confirm" class="active">${escapeHtml(tr.confirmExportBtn)}</button>
          </div>
        </div>
      </fieldset>
    </div>
  `;
}

function render(): void {
  applyThemeAndZoom();
  const app = document.getElementById("app");
  if (!app) return;

  const records = getActiveRecords();
  let bodyHtml = "";
  if (state.tab === "char") {
    bodyHtml = renderStatsView(buildCharPoolEntries(records));
  } else if (state.tab === "weapon") {
    bodyHtml = renderStatsView(buildWeaponPoolEntries(records));
  } else {
    bodyHtml = renderImportView();
  }

  app.innerHTML = `
    ${renderTopBar()}
    ${renderTabBar()}
    ${bodyHtml}
    ${renderStatusBar()}
    ${renderImageModal()}
  `;

  bindEvents();
}

async function runSyncWithInput(rawInput: string, fallbackProv: Provider, fallbackSid: string) {
  const tr = getTr();
  const locale = state.store.locale || "zh-TW";
  state.busy = true;
  setStatus(tr.statusParsing);
  render();

  try {
    const parsed = parseGachaUrlOrToken(rawInput, fallbackProv, fallbackSid, locale);
    const acc = await queryAccountFromToken(parsed, locale);
    const idx = state.store.accounts.findIndex((a) => a.key === acc.key);
    if (idx >= 0) state.store.accounts[idx] = acc;
    else state.store.accounts.push(acc);
    state.store.activeAccountKey = acc.key;

    const existing = state.store.records[acc.key] || { char: {}, weapon: {} };
    const result = await syncAccountGacha(
      acc,
      existing,
      state.store.poolInfo,
      (msg) => {
        setStatus(msg);
      },
      getApiLang(locale),
      locale,
    );

    state.store.records[acc.key] = result.records;
    state.store.poolInfo = result.poolInfo;
    await saveAppStore(state.store);

    state.tab = "char";
    state.selectedPoolId = "";
    setStatus(tr.statusSyncDone(result.addedChar, result.addedWeapon));
  } catch (err: any) {
    setStatus(tr.statusError(err?.message || String(err)), true);
  } finally {
    state.busy = false;
    render();
  }
}

async function loadDemoData() {
  const idx = state.store.accounts.findIndex((a) => a.key === DEMO_ACCOUNT.key);
  if (idx >= 0) state.store.accounts[idx] = DEMO_ACCOUNT;
  else state.store.accounts.push(DEMO_ACCOUNT);
  state.store.activeAccountKey = DEMO_ACCOUNT.key;
  state.store.records[DEMO_ACCOUNT.key] = DEMO_RECORDS;
  state.store.poolInfo = { ...state.store.poolInfo, ...DEMO_POOL_INFO };
  await saveAppStore(state.store);
  state.tab = "char";
  state.selectedPoolId = "";
  setStatus(getTr().statusDemoLoaded);
  render();
}

async function exportActiveJson() {
  const acc = getActiveAccount();
  if (!acc) return;
  const tr = getTr();
  const filename = `eggroll-akegf-${formatFileTimestamp()}.json`;
  const payload = exportAccountToAkegf(acc, getActiveRecords());
  try {
    const savedPath = await exportJsonToFile(filename, JSON.stringify(payload, null, 2));
    if (savedPath) {
      setStatus(tr.statusExportJsonOk(AKEGF_VERSION, savedPath));
    } else {
      setStatus(tr.statusExportJsonCancel);
    }
  } catch (err: any) {
    setStatus(tr.statusExportFail(err?.message || String(err)), true);
  }
}

function bindEvents(): void {
  document.getElementById("account-select")?.addEventListener("change", async (e) => {
    state.store.activeAccountKey = (e.target as HTMLSelectElement).value;
    state.selectedPoolId = "";
    await saveAppStore(state.store);
    render();
  });

  document.getElementById("locale-select")?.addEventListener("change", async (e) => {
    state.store.locale = (e.target as HTMLSelectElement).value as Locale;
    setStatus(getTr().statusReady);
    await saveAppStore(state.store);
    render();
  });

  document.getElementById("btn-theme")?.addEventListener("click", async () => {
    state.store.theme = state.store.theme === "dark" ? "light" : "dark";
    await saveAppStore(state.store);
    render();
  });

  document.getElementById("btn-zoom-in")?.addEventListener("click", () => changeZoom(ZOOM_STEP));
  document.getElementById("btn-zoom-out")?.addEventListener("click", () => changeZoom(-ZOOM_STEP));
  document.getElementById("btn-zoom-reset")?.addEventListener("click", () => changeZoom("reset"));

  document.getElementById("btn-sync")?.addEventListener("click", async () => {
    const acc = getActiveAccount();
    if (!acc) return;
    let token = acc.u8Token || "";
    if (acc.loginToken) {
      const refreshed = await refreshU8TokenFromLoginToken(acc.loginToken, acc.uid, acc.provider).catch(() => null);
      if (refreshed) {
        token = refreshed;
        acc.u8Token = refreshed;
        await saveAppStore(state.store);
      }
    }
    if (!token) return;
    await runSyncWithInput(token, acc.provider, acc.serverId);
  });

  document.getElementById("login-provider-select")?.addEventListener("change", (e) => {
    state.loginProvider = (e.target as HTMLSelectElement).value as Provider;
  });

  document.getElementById("btn-official-login")?.addEventListener("click", async () => {
    const tr = getTr();
    const locale = state.store.locale || "zh-TW";
    state.busy = true;
    setStatus(tr.statusWaitingLogin);
    render();
    try {
      const loginToken = await openOfficialLoginWindow(state.loginProvider, locale);
      if (!loginToken) {
        setStatus(tr.statusLoginCancelled);
        return;
      }
      setStatus(tr.statusExchangingToken);
      render();
      const accounts = await exchangeLoginTokenToAccounts(loginToken, state.loginProvider, locale);
      let totalAddedChar = 0;
      let totalAddedWeapon = 0;
      for (const acc of accounts) {
        const idx = state.store.accounts.findIndex((a) => a.key === acc.key);
        if (idx >= 0) state.store.accounts[idx] = { ...state.store.accounts[idx], ...acc };
        else state.store.accounts.push(acc);
        state.store.activeAccountKey = acc.key;

        const existing = state.store.records[acc.key] || { char: {}, weapon: {} };
        const result = await syncAccountGacha(
          acc,
          existing,
          state.store.poolInfo,
          (msg) => setStatus(msg),
          getApiLang(locale),
          locale,
        );
        state.store.records[acc.key] = result.records;
        state.store.poolInfo = result.poolInfo;
        totalAddedChar += result.addedChar;
        totalAddedWeapon += result.addedWeapon;
      }
      await saveAppStore(state.store);
      state.tab = "char";
      state.selectedPoolId = "";
      setStatus(tr.statusSyncDone(totalAddedChar, totalAddedWeapon));
    } catch (err: any) {
      setStatus(tr.statusError(err?.message || String(err)), true);
    } finally {
      state.busy = false;
      render();
    }
  });

  document.getElementById("btn-export")?.addEventListener("click", exportActiveJson);

  document.getElementById("btn-export-img")?.addEventListener("click", () => {
    state.imgModalOpen = true;
    render();
  });

  document.getElementById("btn-img-cancel")?.addEventListener("click", () => {
    state.imgModalOpen = false;
    render();
  });

  document.querySelectorAll<HTMLElement>("[data-img-fmt]").forEach((el) => {
    el.addEventListener("click", () => {
      state.imgFormat = el.dataset.imgFmt as ImageFormat;
      render();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-img-scale]").forEach((el) => {
    el.addEventListener("click", () => {
      state.imgScale = Number(el.dataset.imgScale) as UpscaleFactor;
      render();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-img-width]").forEach((el) => {
    el.addEventListener("click", () => {
      state.imgWidth = Number(el.dataset.imgWidth) as ImageWidth;
      render();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-img-font]").forEach((el) => {
    el.addEventListener("click", () => {
      state.imgFontScale = Number(el.dataset.imgFont) as FontScale;
      render();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-img-limit]").forEach((el) => {
    el.addEventListener("click", () => {
      const val = el.dataset.imgLimit;
      state.imgHistoryLimit = val === "all" ? "all" : Math.max(1, Number(val) || 10);
      render();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-img-group]").forEach((el) => {
    el.addEventListener("click", () => {
      state.imgGroupByPool = el.dataset.imgGroup !== "flat";
      render();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-img-pool-limit]").forEach((el) => {
    el.addEventListener("click", () => {
      const val = el.dataset.imgPoolLimit;
      state.imgPoolLimit = val === "all" ? "all" : Math.max(1, Number(val) || 3);
      render();
    });
  });

  document.getElementById("btn-img-confirm")?.addEventListener("click", async () => {
    const acc = getActiveAccount();
    if (!acc) return;
    const entries =
      state.tab === "weapon"
        ? buildWeaponPoolEntries(getActiveRecords())
        : buildCharPoolEntries(getActiveRecords());
    const selected = entries.find((e) => e.id === state.selectedPoolId) || entries[0];
    const tr = getTr();
    if (!selected) {
      setStatus(tr.statusNoExportData, true);
      state.imgModalOpen = false;
      render();
      return;
    }

    state.imgModalOpen = false;
    setStatus(tr.statusGeneratingImg);
    render();

    try {
      const { bytes, mimeType, width, height } = await renderStatsToImageBytes({
        account: acc,
        stat: selected.stat,
        poolInfo: state.store.poolInfo,
        theme: state.store.theme,
        locale: state.store.locale || "zh-TW",
        format: state.imgFormat,
        scale: state.imgScale,
        logicalWidth: state.imgWidth,
        fontScale: state.imgFontScale,
        historyLimit: state.imgHistoryLimit,
        groupByPool: state.imgGroupByPool,
        poolLimit: state.imgPoolLimit,
      });
      const ext = state.imgFormat === "jpeg" ? "jpg" : state.imgFormat;
      const filename = `eggroll-${state.tab}-${state.imgScale}x-${formatFileTimestamp()}.${ext}`;
      const savedPath = await exportBinaryToFile(filename, bytes, mimeType);
      if (savedPath) {
        setStatus(tr.statusExportImgOk(width, height, savedPath));
      } else {
        setStatus(tr.statusExportImgCancel);
      }
    } catch (err: any) {
      setStatus(tr.statusExportImgFail(err?.message || String(err)), true);
    }
  });

  document.querySelectorAll<HTMLElement>("[data-tab]").forEach((el) => {
    el.addEventListener("click", () => {
      state.tab = el.dataset.tab as MainTab;
      state.selectedPoolId = "";
      state.historyPage = 1;
      render();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-pool-id]").forEach((el) => {
    el.addEventListener("click", () => {
      state.selectedPoolId = el.dataset.poolId || "";
      state.historyPage = 1;
      render();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-filter]").forEach((el) => {
    el.addEventListener("click", () => {
      state.historyFilter = (el.dataset.filter as HistoryFilter) || "all";
      state.historyPage = 1;
      render();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-limit]").forEach((el) => {
    el.addEventListener("click", async () => {
      const val = el.dataset.limit;
      state.store.historyLimit = val === "all" ? "all" : Math.max(1, Number(val) || 10);
      state.historyPage = 1;
      await saveAppStore(state.store);
      render();
    });
  });

  document.getElementById("custom-limit-input")?.addEventListener("change", async (e) => {
    const num = Math.floor(Number((e.target as HTMLInputElement).value));
    if (Number.isFinite(num) && num >= 1) {
      state.store.historyLimit = num;
      state.historyPage = 1;
      await saveAppStore(state.store);
      render();
    }
  });

  document.getElementById("btn-page-prev")?.addEventListener("click", () => {
    if (state.historyPage > 1) {
      state.historyPage--;
      render();
    }
  });

  document.getElementById("btn-page-next")?.addEventListener("click", () => {
    state.historyPage++;
    render();
  });

  document.querySelectorAll<HTMLElement>("[data-sort]").forEach((el) => {
    el.addEventListener("click", () => {
      const field = el.dataset.sort as SortField;
      if (state.sortField === field) {
        state.sortDir = state.sortDir === "desc" ? "asc" : "desc";
      } else {
        state.sortField = field;
        state.sortDir = "desc";
      }
      render();
    });
  });

  document.getElementById("btn-go-import")?.addEventListener("click", () => {
    state.tab = "import";
    render();
  });

  document.getElementById("btn-load-demo")?.addEventListener("click", loadDemoData);
  document.getElementById("btn-load-demo-2")?.addEventListener("click", loadDemoData);

  document.getElementById("custom-log-path")?.addEventListener("input", (e) => {
    state.customLogPath = (e.target as HTMLInputElement).value;
  });

  document.getElementById("url-token-input")?.addEventListener("input", (e) => {
    state.urlInput = (e.target as HTMLTextAreaElement).value;
  });

  document.getElementById("manual-server-id")?.addEventListener("input", (e) => {
    state.manualServerId = (e.target as HTMLInputElement).value;
  });

  document.getElementById("btn-read-log")?.addEventListener("click", async () => {
    const tr = getTr();
    state.busy = true;
    setStatus(tr.statusReadingLog);
    render();
    try {
      const res = await detectGachaLog("gryphline", state.customLogPath, state.store.locale || "zh-TW");
      state.urlInput = res.url;
      await runSyncWithInput(res.url, res.provider, "auto");
    } catch (err: any) {
      state.busy = false;
      setStatus(tr.statusLogFail(err?.message || String(err)), true);
      render();
    }
  });

  document.getElementById("btn-sync-url")?.addEventListener("click", async () => {
    await runSyncWithInput(state.urlInput, state.manualProvider, state.manualServerId);
  });

  document.getElementById("btn-trigger-import")?.addEventListener("click", () => {
    document.getElementById("file-import-json")?.click();
  });

  document.getElementById("file-import-json")?.addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const tr = getTr();
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (isAkegfDocument(parsed)) {
        const bundles = importFromAkegf(parsed, state.store.locale || "zh-TW");
        for (const { account, records } of bundles) {
          const idx = state.store.accounts.findIndex((a) => a.key === account.key);
          if (idx >= 0) state.store.accounts[idx] = { ...state.store.accounts[idx], ...account };
          else state.store.accounts.push(account);
          state.store.records[account.key] = records;
          state.store.activeAccountKey = account.key;
        }
        await saveAppStore(state.store);
        state.tab = "char";
        state.selectedPoolId = "";
        setStatus(tr.statusImportAkegfOk(parsed.info.version, bundles.length));
      } else if (parsed?.account?.key && parsed?.records) {
        const acc = parsed.account as AccountInfo;
        const idx = state.store.accounts.findIndex((a) => a.key === acc.key);
        if (idx >= 0) state.store.accounts[idx] = acc;
        else state.store.accounts.push(acc);
        state.store.activeAccountKey = acc.key;
        state.store.records[acc.key] = parsed.records;
        if (parsed.poolInfo) {
          state.store.poolInfo = { ...state.store.poolInfo, ...parsed.poolInfo };
        }
        await saveAppStore(state.store);
        state.tab = "char";
        state.selectedPoolId = "";
        setStatus(tr.statusImportAccountOk(file.name, acc.nickName));
      } else {
        throw new Error(tr.statusUnsupportedJson);
      }
    } catch (err: any) {
      setStatus(tr.statusImportFail(err?.message || String(err)), true);
    }
    render();
  });

  document.querySelectorAll<HTMLElement>("[data-use-account]").forEach((el) => {
    el.addEventListener("click", async () => {
      state.store.activeAccountKey = el.dataset.useAccount;
      state.tab = "char";
      state.selectedPoolId = "";
      await saveAppStore(state.store);
      render();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-del-account]").forEach((el) => {
    el.addEventListener("click", async () => {
      const key = el.dataset.delAccount;
      if (!key) return;
      state.store.accounts = state.store.accounts.filter((a) => a.key !== key);
      delete state.store.records[key];
      if (state.store.activeAccountKey === key) {
        state.store.activeAccountKey = state.store.accounts[0]?.key;
      }
      await saveAppStore(state.store);
      setStatus(getTr().statusAccountDeleted);
      render();
    });
  });
}

document.addEventListener("copy", (e) => {
  const active = document.activeElement;
  if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
    return;
  }
  const text = window.getSelection()?.toString();
  if (!text) return;
  if (e.clipboardData) {
    e.clipboardData.setData("text/plain", text);
    e.preventDefault();
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.imgModalOpen) {
    state.imgModalOpen = false;
    render();
    return;
  }
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (e.key === "1") {
    state.tab = "char";
    state.selectedPoolId = "";
    render();
  } else if (e.key === "2") {
    state.tab = "weapon";
    state.selectedPoolId = "";
    render();
  } else if (e.key === "3") {
    state.tab = "import";
    render();
  } else if (e.key.toLowerCase() === "t") {
    state.store.theme = state.store.theme === "dark" ? "light" : "dark";
    saveAppStore(state.store);
    render();
  } else if (e.key === "+" || e.key === "=") {
    e.preventDefault();
    void changeZoom(ZOOM_STEP);
  } else if (e.key === "-" || e.key === "_") {
    e.preventDefault();
    void changeZoom(-ZOOM_STEP);
  } else if (e.key === "0") {
    e.preventDefault();
    void changeZoom("reset");
  } else if (!state.imgModalOpen && (state.tab === "char" || state.tab === "weapon")) {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const entries =
        state.tab === "weapon"
          ? buildWeaponPoolEntries(getActiveRecords())
          : buildCharPoolEntries(getActiveRecords());
      if (entries.length === 0) return;
      e.preventDefault();
      const idx = entries.findIndex((item) => item.id === state.selectedPoolId);
      const cur = idx >= 0 ? idx : 0;
      const nextIdx =
        e.key === "ArrowUp"
          ? (cur - 1 + entries.length) % entries.length
          : (cur + 1) % entries.length;
      state.selectedPoolId = entries[nextIdx]!.id;
      state.historyPage = 1;
      render();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      if (e.key === "ArrowLeft" && state.historyPage > 1) {
        state.historyPage--;
        render();
      } else if (e.key === "ArrowRight") {
        state.historyPage++;
        render();
      }
    }
  }
});

async function bootstrap() {
  state.store = await loadAppStore();
  applyCachedCatalog(state.store);
  setStatus(getTr().statusReady);
  render();

  void refreshRemoteCatalog(state.store).then(async (updated) => {
    if (updated) {
      await saveAppStore(state.store);
      render();
    }
  });
}

bootstrap();
