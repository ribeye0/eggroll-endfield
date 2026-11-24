import "@fontsource/noto-sans-tc/400.css";
import "@fontsource/noto-sans-tc/700.css";
import "@fontsource/noto-sans-sc/400.css";
import "@fontsource/noto-sans-sc/700.css";
import "@fontsource/noto-sans-jp/400.css";
import "@fontsource/noto-sans-jp/700.css";
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
  isLimited6Star,
  JOINT_POOL_KEY,
  mergeAllPoolStats,
  POOL_NAME_MAP,
  renderAsciiBar,
  RERUN_POOL_KEY,
  SPECIAL_POOL_KEY,
  STANDARD_POOL_KEY,
} from "./gachaCalc";
import {
  detectGachaLog,
  exportBinaryToFile,
  exportJsonToFile,
  loadAppStore,
  parseGachaUrlOrToken,
  queryAccountFromToken,
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
  statusText: "就緒 // 純文字 TUI 模式 (國際服 Gryphline)",
  statusError: false,
  logProvider: "gryphline" as Provider,
  customLogPath: "",
  urlInput: "",
  manualProvider: "gryphline" as Provider,
  manualServerId: "auto",
  imgModalOpen: false,
  imgFormat: "png" as ImageFormat,
  imgScale: 2 as UpscaleFactor,
  imgWidth: 1080 as ImageWidth,
  imgFontScale: 1 as FontScale,
  imgHistoryLimit: 10 as number | "all",
};

const MIN_ZOOM = 0.8;
const MAX_ZOOM = 1.5;
const ZOOM_STEP = 0.1;

function clampZoom(z: number): number {
  return Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z)) * 10) / 10;
}

function applyThemeAndZoom(): void {
  document.documentElement.setAttribute("data-theme", state.store.theme);
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
  if (specialStats.length > 0) {
    entries.push({
      id: "char:special:all",
      group: "特許尋訪 (限定)",
      label: "全部特許尋訪",
      stat: mergeAllPoolStats("特許尋訪 // 總覽", SPECIAL_POOL_KEY, specialStats),
    });
    for (const s of specialStats) {
      entries.push({
        id: `char:special:${s.poolId || s.poolName}`,
        group: "特許尋訪 (限定)",
        label: s.poolName,
        stat: s,
      });
    }
  }

  const rerunRaw = records.char[RERUN_POOL_KEY] || [];
  const rerunStats = analyzeRerunPoolData(rerunRaw, poolInfo, records.charRerunCounts);
  if (rerunStats.length > 0) {
    entries.push({
      id: "char:rerun:all",
      group: "重構尋訪",
      label: "全部重構尋訪",
      stat: mergeAllPoolStats("重構尋訪 // 總覽", RERUN_POOL_KEY, rerunStats),
    });
    for (const s of rerunStats) {
      entries.push({
        id: `char:rerun:${s.poolName}`,
        group: "重構尋訪",
        label: s.poolName,
        stat: s,
      });
    }
  }

  const jointRaw = records.char[JOINT_POOL_KEY] || [];
  const jointStats = analyzeJointPoolData(jointRaw, poolInfo);
  for (const s of jointStats) {
    entries.push({
      id: `char:joint:${s.poolId || s.poolName}`,
      group: "輝光慶典",
      label: s.poolName,
      stat: s,
    });
  }

  for (const key of [STANDARD_POOL_KEY, BEGINNER_POOL_KEY]) {
    const raw = records.char[key] || [];
    if (raw.length > 0 || entries.length === 0) {
      entries.push({
        id: `char:simple:${key}`,
        group: "常駐 / 新手",
        label: POOL_NAME_MAP[key] || key,
        stat: analyzeSimpleCharPool(key, raw),
      });
    }
  }

  return entries;
}

function buildWeaponPoolEntries(records: AccountRecords): PoolEntry[] {
  const entries: PoolEntry[] = [];
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
      group: "武器申領",
      label: "全部武器池",
      stat: mergeAllPoolStats("武器申領 // 總覽", "weapon", allStats),
    });
    for (const s of allStats) {
      entries.push({
        id: `weapon:${s.poolId}`,
        group: "武器申領",
        label: s.poolName,
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
  const accounts = state.store.accounts;
  const active = getActiveAccount();
  const accountOptions =
    accounts.length === 0
      ? `<option value="">-- 尚無帳號 --</option>`
      : accounts
          .map(
            (a) =>
              `<option value="${escapeHtml(a.key)}" ${a.key === active?.key ? "selected" : ""}>${escapeHtml(a.nickName)} (${escapeHtml(a.roleId || a.uid)} / ${escapeHtml(a.serverName)})</option>`,
          )
          .join("");

  return `
    <header class="topbar">
      <div class="brand">
        <span>Simple Endfield Pull Tracker</span>
      </div>
      <div class="topbar-controls">
        <span class="c-muted">帳號:</span>
        <select id="account-select">${accountOptions}</select>
        <button id="btn-sync" ${state.busy || !active?.u8Token ? "disabled" : ""} title="使用目前帳號的 Token 同步最新抽卡紀錄">[↻ 同步]</button>
        <button id="btn-export-img" class="btn-export-img" ${!active || state.tab === "import" ? "disabled" : ""} title="將目前卡池統計匯出為圖片 (PNG/JPG/WebP)">[匯出圖片]</button>
        <button id="btn-export" ${!active ? "disabled" : ""} title="匯出目前帳號的紀錄為 AKEGF JSON">[匯出 JSON]</button>
        <button id="btn-zoom-out" title="縮小介面 (-)">[-]</button>
        <button id="btn-zoom-reset" title="重設縮放 (0)">${Math.round((state.store.zoom ?? 1) * 100)}%</button>
        <button id="btn-zoom-in" title="放大介面 (+)">[+]</button>
        <button id="btn-theme">[主題: ${state.store.theme === "dark" ? "DARK" : "LIGHT"}]</button>
      </div>
    </header>
  `;
}

function renderTabBar(): string {
  const active = getActiveAccount();
  const records = getActiveRecords();
  const syncMeta = active && records.lastSyncAt ? `最後同步: ${records.lastSyncAt}` : "尚未同步";
  return `
    <nav class="tabbar">
      <div class="tabs-left">
        <button class="${state.tab === "char" ? "active" : ""}" data-tab="char">[1] 角色尋訪</button>
        <button class="${state.tab === "weapon" ? "active" : ""}" data-tab="weapon">[2] 武器申領</button>
        <button class="${state.tab === "import" ? "active" : ""}" data-tab="import">[3] 匯入 / 同步 / 帳號</button>
      </div>
      <div class="sync-meta">${escapeHtml(syncMeta)}</div>
    </nav>
  `;
}

function renderStatsView(entries: PoolEntry[]): string {
  if (entries.length === 0) {
    return `
      <fieldset class="tui-panel">
        <legend class="tui-legend">無紀錄</legend>
        <div class="empty-state">
          <p>目前沒有抽卡紀錄。請先從遊戲日誌讀取、貼上抽卡連結，或載入示範資料預覽介面。</p>
          <div class="row" style="justify-content:center; margin-top: 12px;">
            <button id="btn-go-import">[前往匯入 / 讀取日誌]</button>
            <button id="btn-load-demo">[載入示範資料預覽]</button>
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
            const badge = st.isCurrentPool ? `<span class="c-green">[當期]</span> ` : "";
            return `
              <button class="pool-item ${it.id === selected.id ? "active" : ""}" data-pool-id="${escapeHtml(it.id)}">
                <div class="pool-item-top">
                  <span class="pool-item-name">${badge}${escapeHtml(it.label)}</span>
                  <span class="c-muted">${st.totalPulls}抽</span>
                </div>
                <div class="pool-item-sub">
                  <span class="c-gold">6★: ${st.count6}</span>
                  <span>水位: ${st.pityCount}/${st.smallPityMax}</span>
                </div>
              </button>
            `;
          })
          .join("")}
      `,
    )
    .join("");

  const rate6 = s.totalPulls > 0 ? ((s.count6 / s.totalPulls) * 100).toFixed(2) : "0.00";
  const avgText = s.avgPity6 !== null ? `${s.avgPity6.toFixed(1)} 抽` : "-";
  const upRateText = s.upWinRate !== null ? `${s.upWinRate.toFixed(1)}%` : "-";
  const upChecksCount = s.history6.filter((h) => h.hasUpInfo).length;
  const up6Count = s.history6.filter((h) => h.hasUpInfo && h.isUp).length;
  const up6Text = upChecksCount > 0 ? `${up6Count}` : "-";
  const up6Sub = upChecksCount > 0 ? `歪 ${upChecksCount - up6Count} 次` : "無 UP 池設定";
  const limited6Count = s.history6.filter((h) => isLimited6Star(h, state.store.poolInfo)).length;
  const limited6Sub =
    s.count6 > 0 ? `占 6★ ${((limited6Count / s.count6) * 100).toFixed(0)}%` : "無 6★";
  const smallRem = Math.max(0, s.smallPityMax - s.pityCount);
  const smallBar = renderAsciiBar(s.pityCount, s.smallPityMax, 22);

  let bigPityHtml = "";
  if (s.bigPityMax && s.bigPityMax > 0) {
    if (s.gotUp6) {
      bigPityHtml = `
        <div class="pity-row">
          <span class="pity-label">大保底狀態</span>
          <span class="c-green">[✓ 已取得當期 UP 6★]</span>
          <span class="c-muted">本池大保底已觸發或提前出貨</span>
        </div>
      `;
    } else {
      const bc = s.bigPityCount ?? 0;
      const bmax = s.bigPityMax;
      const brem = s.bigPityRemaining ?? Math.max(0, bmax - bc);
      bigPityHtml = `
        <div class="pity-row">
          <span class="pity-label">大保底進度</span>
          <span class="ascii-bar c-gold">${renderAsciiBar(bc, bmax, 22)}</span>
          <span class="pity-text">${bc} / ${bmax} <span class="c-muted">(距大保底 ${brem} 抽)</span></span>
        </div>
      `;
    }
  }

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

  const rowsHtml =
    displayedHistory.length === 0
      ? `<tr><td colspan="6" class="c-muted" style="text-align:center; padding: 18px;">無符合條件的 6★ 出貨紀錄</td></tr>`
      : displayedHistory
          .map((h, idx) => {
            const pCls = pityColorClass(h.pity, s.smallPityMax);
            const bar = h.isFree ? "[FREE_PULL]" : renderAsciiBar(h.pity, s.smallPityMax, 12);
            const tags: string[] = [];
            if (h.hasUpInfo) {
              tags.push(
                h.isUp
                  ? `<span class="tag c-green">UP</span>`
                  : `<span class="tag c-red">歪</span>`,
              );
            }
            if (h.isNew) tags.push(`<span class="tag c-gold">NEW</span>`);
            if (h.isFree) tags.push(`<span class="tag c-cyan">免費</span>`);

            return `
              <tr>
                <td class="c-muted">${startIdx + idx + 1}</td>
                <td class="c-gold"><strong>${escapeHtml(h.name)}</strong></td>
                <td class="${pCls}">${h.isFree ? "免費" : `${h.pity} 抽`}</td>
                <td class="ascii-bar ${pCls}">${bar}</td>
                <td>${tags.join("") || `<span class="c-muted">-</span>`}</td>
                <td class="c-muted">${escapeHtml(h.poolName || "-")} // ${escapeHtml(formatTs(h.gachaTs))}</td>
              </tr>
            `;
          })
          .join("");

  const sortArrow = (field: SortField) =>
    state.sortField === field ? (state.sortDir === "desc" ? " ▼" : " ▲") : "";

  const historyTitle =
    displayedHistory.length < sortedHistory.length
      ? `6★ 出貨紀錄 (顯示 ${displayedHistory.length} / 共 ${sortedHistory.length} 筆)`
      : `6★ 出貨紀錄 (${sortedHistory.length})`;
  const customLimitVal = limit === "all" ? "" : String(limit);

  return `
    <div class="workspace">
      <fieldset class="tui-panel">
        <legend class="tui-legend">卡池列表 (${entries.length})</legend>
        <div class="tui-panel-scroll sidebar-list">
          ${sidebarHtml}
        </div>
      </fieldset>

      <div class="main-pane">
        <fieldset class="tui-panel">
          <legend class="tui-legend">${escapeHtml(s.poolName)}</legend>
          <div class="kpi-grid">
            <div class="kpi-cell">
              <span class="kpi-label">總抽數</span>
              <span class="kpi-value">${s.totalPulls}</span>
              <span class="kpi-sub">實際 ${s.paidPulls} / 加急 ${s.freePulls}</span>
            </div>
            <div class="kpi-cell">
              <span class="kpi-label">6★ 出貨</span>
              <span class="kpi-value c-gold">${s.count6}</span>
              <span class="kpi-sub">出貨率 ${rate6}%</span>
            </div>
            <div class="kpi-cell">
              <span class="kpi-label">6★ 平均抽數</span>
              <span class="kpi-value c-cyan">${avgText}</span>
              <span class="kpi-sub">不計入加急招募抽數</span>
            </div>
            <div class="kpi-cell">
              <span class="kpi-label">UP 不歪率</span>
              <span class="kpi-value c-green">${upRateText}</span>
              <span class="kpi-sub">依 UP 池統計</span>
            </div>
            <div class="kpi-cell">
              <span class="kpi-label">UP 6★ 出貨</span>
              <span class="kpi-value c-green">${up6Text}</span>
              <span class="kpi-sub">${up6Sub}</span>
            </div>
            <div class="kpi-cell">
              <span class="kpi-label">限定 6★ 出貨</span>
              <span class="kpi-value c-gold">${limited6Count}</span>
              <span class="kpi-sub">${limited6Sub}</span>
            </div>
          </div>

          <div class="pity-section">
            <div class="pity-row">
              <span class="pity-label">小保底水位</span>
              <span class="ascii-bar ${pityColorClass(s.pityCount, s.smallPityMax)}">${smallBar}</span>
              <span class="pity-text">${s.pityCount} / ${s.smallPityMax} <span class="c-muted">(距小保底 ${smallRem} 抽)</span></span>
            </div>
            ${bigPityHtml}
          </div>
        </fieldset>

        <fieldset class="tui-panel">
          <legend class="tui-legend">${historyTitle}</legend>
          <div class="table-toolbar">
            <div class="table-toolbar-group">
              <button class="${state.historyFilter === "all" ? "active" : ""}" data-filter="all">[全部 6★]</button>
              <button class="${state.historyFilter === "offbanner" ? "active" : ""}" data-filter="offbanner">[僅看歪]</button>
            </div>
            <div class="table-toolbar-group">
              <span class="c-muted">顯示:</span>
              <button class="${limit === 10 ? "active" : ""}" data-limit="10">10</button>
              <button class="${limit === 20 ? "active" : ""}" data-limit="20">20</button>
              <button class="${limit === 50 ? "active" : ""}" data-limit="50">50</button>
              <button class="${limit === "all" ? "active" : ""}" data-limit="all">全部</button>
              <input id="custom-limit-input" type="number" min="1" placeholder="自訂" value="${escapeHtml(customLimitVal)}" style="width:64px; padding:3px 6px;" title="輸入要顯示的 6★ 筆數後按 Enter 或移開焦點" />
            </div>
            <div class="table-toolbar-group">
              <button id="btn-page-prev" ${state.historyPage <= 1 ? "disabled" : ""}>[&lt; 上一頁]</button>
              <span class="c-muted">第 ${state.historyPage} / ${totalPages} 頁</span>
              <button id="btn-page-next" ${state.historyPage >= totalPages ? "disabled" : ""}>[下一頁 &gt;]</button>
            </div>
            <div class="table-toolbar-group">
              <button class="${state.sortField === "time" ? "active" : ""}" data-sort="time">[時間${sortArrow("time")}]</button>
              <button class="${state.sortField === "pity" ? "active" : ""}" data-sort="pity">[抽數${sortArrow("pity")}]</button>
            </div>
          </div>
          <div class="tui-panel-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>名稱</th>
                  <th class="sortable" data-sort="pity">抽數${sortArrow("pity")}</th>
                  <th>水位條</th>
                  <th>標記</th>
                  <th class="sortable" data-sort="time">卡池 // 時間${sortArrow("time")}</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        </fieldset>
      </div>
    </div>
  `;
}

function renderImportView(): string {
  const accountsHtml =
    state.store.accounts.length === 0
      ? `<div class="c-muted">尚無已儲存帳號</div>`
      : state.store.accounts
          .map(
            (a) => `
              <div class="account-row">
                <span>
                  <strong>${escapeHtml(a.nickName)}</strong>
                  <span class="c-muted">(${escapeHtml(a.roleId || a.uid)} / ${escapeHtml(a.serverName)})</span>
                </span>
                <div class="row">
                  <button data-use-account="${escapeHtml(a.key)}">[切換]</button>
                  <button class="c-red" data-del-account="${escapeHtml(a.key)}">[刪除]</button>
                </div>
              </div>
            `,
          )
          .join("");

  return `
    <div class="import-pane">
      <fieldset class="tui-panel">
        <legend class="tui-legend">1. 自動讀取本機遊戲日誌 (HGWebview.log)</legend>
        <div class="form-stack">
          <div class="c-muted">請先在遊戲內打開一次「尋訪紀錄」，再點擊下方讀取（預設偵測國際服 Gryphline 日誌）。</div>
          <div class="row">
            <input id="custom-log-path" class="grow" placeholder="選填: 自訂 HGWebview.log 完整路徑 (Linux/Wine 用戶可填)" value="${escapeHtml(state.customLogPath)}" />
          </div>
          <div class="row">
            <button id="btn-read-log" ${state.busy ? "disabled" : ""}>[讀取日誌並同步]</button>
          </div>
        </div>
      </fieldset>

      <fieldset class="tui-panel">
        <legend class="tui-legend">2. 貼上抽卡連結 / u8_token (國際服 / Skport)</legend>
        <div class="form-stack">
          <div class="c-muted">支援貼上完整 https://ef-webview.gryphline.com... 連結或從 Skport 複製的純 u8_token（自動偵測區服）。</div>
          <textarea id="url-token-input" rows="3" placeholder="貼上抽卡連結或 u8_token...">${escapeHtml(state.urlInput)}</textarea>
          <div class="row">
            <span class="c-muted">區服:</span>
            <input id="manual-server-id" style="width:110px;" placeholder="auto (自動)" value="${escapeHtml(state.manualServerId)}" title="保留 auto 會自動偵測區服" />
            <button id="btn-sync-url" ${state.busy ? "disabled" : ""}>[解析並同步]</button>
          </div>
        </div>
      </fieldset>

      <fieldset class="tui-panel">
        <legend class="tui-legend">3. AKEGF (${AKEGF_VERSION}) 標準匯入 / 示範資料</legend>
        <div class="form-stack">
          <div class="c-muted">
            本工具支援 <a href="${AKEGF_HOME_URL}" target="_blank" rel="noreferrer" class="c-cyan">AKEGF ${AKEGF_VERSION}</a> 抽卡紀錄格式標準匯入／匯出，所有資料僅儲存在本機。
          </div>
          <div class="row">
            <input id="file-import-json" type="file" accept=".json" style="display:none;" />
            <button id="btn-trigger-import" type="button">[匯入 AKEGF / JSON]</button>
            <button id="btn-load-demo-2" type="button">[載入示範資料]</button>
          </div>
        </div>
      </fieldset>

      <fieldset class="tui-panel">
        <legend class="tui-legend">4. 已儲存帳號管理</legend>
        <div class="form-stack">
          ${accountsHtml}
        </div>
      </fieldset>
    </div>
  `;
}

function renderStatusBar(): string {
  return `
    <footer class="statusbar">
      <span class="statusbar-msg ${state.statusError ? "is-error" : ""}">${escapeHtml(state.statusText)}</span>
      <span class="statusbar-hints">[1-3] 分頁  [+/-] 縮放  [0] 重設  [T] 主題</span>
    </footer>
  `;
}

function renderImageModal(): string {
  if (!state.imgModalOpen) return "";
  return `
    <div class="modal-backdrop" id="img-modal-backdrop">
      <fieldset class="tui-panel modal-box">
        <legend class="tui-legend">匯出抽卡紀錄圖片</legend>
        <div class="form-stack">
          <div class="row">
            <span class="c-muted" style="min-width:76px;">圖片格式:</span>
            <button class="${state.imgFormat === "png" ? "active" : ""}" data-img-fmt="png">PNG (無損)</button>
            <button class="${state.imgFormat === "jpeg" ? "active" : ""}" data-img-fmt="jpeg">JPG</button>
            <button class="${state.imgFormat === "webp" ? "active" : ""}" data-img-fmt="webp">WebP</button>
          </div>
          <div class="row">
            <span class="c-muted" style="min-width:76px;">畫面寬度:</span>
            <button class="${state.imgWidth === 900 ? "active" : ""}" data-img-width="900">900px</button>
            <button class="${state.imgWidth === 1080 ? "active" : ""}" data-img-width="1080">1080px</button>
            <button class="${state.imgWidth === 1280 ? "active" : ""}" data-img-width="1280">1280px</button>
            <button class="${state.imgWidth === 1440 ? "active" : ""}" data-img-width="1440">1440px</button>
          </div>
          <div class="row">
            <span class="c-muted" style="min-width:76px;">字體大小:</span>
            <button class="${state.imgFontScale === 0.9 ? "active" : ""}" data-img-font="0.9">小 (90%)</button>
            <button class="${state.imgFontScale === 1 ? "active" : ""}" data-img-font="1">標準 (100%)</button>
            <button class="${state.imgFontScale === 1.15 ? "active" : ""}" data-img-font="1.15">大 (115%)</button>
            <button class="${state.imgFontScale === 1.3 ? "active" : ""}" data-img-font="1.3">特大 (130%)</button>
          </div>
          <div class="row">
            <span class="c-muted" style="min-width:76px;">上採樣率:</span>
            <button class="${state.imgScale === 1 ? "active" : ""}" data-img-scale="1">1x</button>
            <button class="${state.imgScale === 2 ? "active" : ""}" data-img-scale="2">2x (推薦)</button>
            <button class="${state.imgScale === 3 ? "active" : ""}" data-img-scale="3">3x</button>
            <span class="c-muted">→ 輸出寬度 ${state.imgWidth * state.imgScale}px</span>
          </div>
          <div class="row">
            <span class="c-muted" style="min-width:76px;">6★ 筆數:</span>
            <button class="${state.imgHistoryLimit === 10 ? "active" : ""}" data-img-limit="10">10</button>
            <button class="${state.imgHistoryLimit === 20 ? "active" : ""}" data-img-limit="20">20</button>
            <button class="${state.imgHistoryLimit === 50 ? "active" : ""}" data-img-limit="50">50</button>
            <button class="${state.imgHistoryLimit === "all" ? "active" : ""}" data-img-limit="all">全部</button>
          </div>
          <div class="row" style="justify-content:flex-end; margin-top:6px;">
            <button id="btn-img-cancel">[取消]</button>
            <button id="btn-img-confirm" class="active">[選擇儲存位置並匯出]</button>
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
  state.busy = true;
  setStatus("正在解析帳號資訊...");
  render();

  try {
    const parsed = parseGachaUrlOrToken(rawInput, fallbackProv, fallbackSid);
    const acc = await queryAccountFromToken(parsed);
    const idx = state.store.accounts.findIndex((a) => a.key === acc.key);
    if (idx >= 0) state.store.accounts[idx] = acc;
    else state.store.accounts.push(acc);
    state.store.activeAccountKey = acc.key;

    const existing = state.store.records[acc.key] || { char: {}, weapon: {} };
    const result = await syncAccountGacha(acc, existing, state.store.poolInfo, (msg) => {
      setStatus(msg);
    });

    state.store.records[acc.key] = result.records;
    state.store.poolInfo = result.poolInfo;
    await saveAppStore(state.store);

    state.tab = "char";
    state.selectedPoolId = "";
    setStatus(`同步完成 // 新增角色 ${result.addedChar} 筆、武器 ${result.addedWeapon} 筆`);
  } catch (err: any) {
    setStatus(`錯誤: ${err?.message || String(err)}`, true);
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
  setStatus("已載入示範資料 (管理員老先生)");
  render();
}

async function exportActiveJson() {
  const acc = getActiveAccount();
  if (!acc) return;
  const filename = `sept-akegf-${formatFileTimestamp()}.json`;
  const payload = exportAccountToAkegf(acc, getActiveRecords());
  try {
    const savedPath = await exportJsonToFile(filename, JSON.stringify(payload, null, 2));
    if (savedPath) {
      setStatus(`已匯出 AKEGF ${AKEGF_VERSION} 至: ${savedPath}`);
    } else {
      setStatus("已取消匯出 AKEGF JSON");
    }
  } catch (err: any) {
    setStatus(`匯出失敗: ${err?.message || String(err)}`, true);
  }
}

function bindEvents(): void {
  document.getElementById("account-select")?.addEventListener("change", async (e) => {
    state.store.activeAccountKey = (e.target as HTMLSelectElement).value;
    state.selectedPoolId = "";
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
    if (!acc?.u8Token) return;
    await runSyncWithInput(acc.u8Token, acc.provider, acc.serverId);
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

  document.getElementById("btn-img-confirm")?.addEventListener("click", async () => {
    const acc = getActiveAccount();
    if (!acc) return;
    const entries =
      state.tab === "weapon"
        ? buildWeaponPoolEntries(getActiveRecords())
        : buildCharPoolEntries(getActiveRecords());
    const selected = entries.find((e) => e.id === state.selectedPoolId) || entries[0];
    if (!selected) {
      setStatus("目前沒有可匯出的卡池資料", true);
      state.imgModalOpen = false;
      render();
      return;
    }

    state.imgModalOpen = false;
    setStatus("正在產生高解析度圖片...");
    render();

    try {
      const { bytes, mimeType, width, height } = await renderStatsToImageBytes({
        account: acc,
        stat: selected.stat,
        poolInfo: state.store.poolInfo,
        theme: state.store.theme,
        format: state.imgFormat,
        scale: state.imgScale,
        logicalWidth: state.imgWidth,
        fontScale: state.imgFontScale,
        historyLimit: state.imgHistoryLimit,
      });
      const ext = state.imgFormat === "jpeg" ? "jpg" : state.imgFormat;
      const filename = `sept-${state.tab}-${state.imgScale}x-${formatFileTimestamp()}.${ext}`;
      const savedPath = await exportBinaryToFile(filename, bytes, mimeType);
      if (savedPath) {
        setStatus(`已匯出圖片 (${width}×${height}): ${savedPath}`);
      } else {
        setStatus("已取消匯出圖片");
      }
    } catch (err: any) {
      setStatus(`圖片匯出失敗: ${err?.message || String(err)}`, true);
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
    state.busy = true;
    setStatus("正在讀取遊戲日誌...");
    render();
    try {
      const res = await detectGachaLog("gryphline", state.customLogPath);
      state.urlInput = res.url;
      await runSyncWithInput(res.url, res.provider, "auto");
    } catch (err: any) {
      state.busy = false;
      setStatus(`日誌讀取失敗: ${err?.message || String(err)}`, true);
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
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (isAkegfDocument(parsed)) {
        const bundles = importFromAkegf(parsed);
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
        setStatus(`已匯入 AKEGF ${parsed.info.version} (${bundles.length} 個帳號)`);
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
        setStatus(`已從 ${file.name} 匯入帳號 ${acc.nickName}`);
      } else {
        throw new Error("不支援的 JSON 格式（需為 AKEGF v0.4 或本工具舊版備份）");
      }
    } catch (err: any) {
      setStatus(`匯入失敗: ${err?.message || String(err)}`, true);
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
      setStatus("已刪除帳號資料");
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
  }
});

async function bootstrap() {
  state.store = await loadAppStore();
  render();
}

bootstrap();
