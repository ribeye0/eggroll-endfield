import type { AccountInfo, GachaStatistics, PoolInfoEntry } from "./types";
import {
  computeWeaponGiftMilestone,
  isLimited6Star,
  renderAsciiBar,
  RERUN_POOL_KEY,
  SPECIAL_POOL_KEY,
  WEAPON_LIMITED_POOL_TYPE,
  WEAPON_RERUN_POOL_TYPE,
} from "./gachaCalc";
import { TRANSLATIONS, type Locale } from "./i18n";
import { localizeItemName, localizePoolName } from "./itemI18n";

export type ImageFormat = "png" | "jpeg" | "webp";
export type UpscaleFactor = 1 | 2 | 3;
export type ImageWidth = 900 | 1080 | 1280 | 1440;
export type FontScale = 0.9 | 1 | 1.15 | 1.3;

interface Palette {
  bg: string;
  panel: string;
  elevated: string;
  border: string;
  fg: string;
  muted: string;
  gold: string;
  green: string;
  red: string;
  cyan: string;
}

const DARK_PALETTE: Palette = {
  bg: "#0a0e13",
  panel: "#0f141b",
  elevated: "#151c26",
  border: "#2a3647",
  fg: "#dce4ee",
  muted: "#7c8b9e",
  gold: "#f5b942",
  green: "#3ddc84",
  red: "#ff6b6b",
  cyan: "#58c7f3",
};

const LIGHT_PALETTE: Palette = {
  bg: "#f1f5f9",
  panel: "#ffffff",
  elevated: "#f8fafc",
  border: "#cbd5e1",
  fg: "#0f172a",
  muted: "#475569",
  gold: "#b45309",
  green: "#047857",
  red: "#dc2626",
  cyan: "#0369a1",
};

function pityColor(pity: number, max: number, pal: Palette): string {
  if (pity <= 0) return pal.cyan;
  const r = pity / max;
  if (r <= 0.45) return pal.green;
  if (r <= 0.78) return pal.gold;
  return pal.red;
}

function formatDate(ts?: string): string {
  if (!ts) return "-";
  const num = Number(ts);
  if (!Number.isFinite(num) || num <= 0) return ts;
  const d = new Date(num);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export async function renderStatsToImageBytes(params: {
  account: AccountInfo;
  stat: GachaStatistics;
  poolInfo: Record<string, PoolInfoEntry>;
  theme: "dark" | "light";
  locale?: Locale;
  format: ImageFormat;
  scale: UpscaleFactor;
  logicalWidth?: ImageWidth;
  fontScale?: FontScale;
  historyLimit?: number | "all";
}): Promise<{ bytes: Uint8Array; mimeType: string; width: number; height: number }> {
  const {
    account,
    stat,
    poolInfo,
    theme,
    locale = "zh-TW",
    format,
    scale,
    logicalWidth = 1080,
    fontScale = 1,
    historyLimit = 10,
  } = params;
  const tr = TRANSLATIONS[locale];
  const pal = theme === "light" ? LIGHT_PALETTE : DARK_PALETTE;

  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const fs = (px: number) => Math.round(px * fontScale);
  const padX = 28;
  const padY = 24;
  const rowH = Math.round(34 * fontScale);
  const allHistory = stat.history6;
  const history =
    historyLimit === "all" ? allHistory : allHistory.slice(0, Math.max(1, historyLimit));
  const hasSubPities = !!(stat.subPities && stat.subPities.length > 0);
  const hasBigPity = !hasSubPities && !!(stat.bigPityMax && stat.bigPityMax > 0);
  const hasTokenProgress =
    (stat.poolType === SPECIAL_POOL_KEY || stat.poolType === RERUN_POOL_KEY) &&
    !!stat.poolId;
  const hasWeaponGiftProgress =
    (stat.poolType === WEAPON_LIMITED_POOL_TYPE || stat.poolType === WEAPON_RERUN_POOL_TYPE) &&
    !!stat.poolId;

  const headerH = Math.round(52 * fontScale);
  const kpiH = Math.round(74 * fontScale);
  const pityLines =
    1 + (hasBigPity ? 1 : 0) + (hasTokenProgress || hasWeaponGiftProgress ? 1 : 0);
  const pityBlockH = Math.round((12 + pityLines * 28) * fontScale);
  const summaryH = Math.round(42 * fontScale) + kpiH + pityBlockH + 16;
  const tableTitleH = Math.round(40 * fontScale);
  const thH = Math.round(30 * fontScale);
  const tableHeaderH = tableTitleH + thH + 4;
  const tableBodyH = Math.max(1, history.length) * rowH + 16;
  const footerH = Math.round(32 * fontScale);
  const logicalH =
    padY * 2 + headerH + 14 + summaryH + 14 + tableHeaderH + tableBodyH + 14 + footerH;

  const canvas = document.createElement("canvas");
  canvas.width = logicalWidth * scale;
  canvas.height = logicalH * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("無法建立 Canvas 2D 繪圖環境");

  ctx.scale(scale, scale);
  ctx.textBaseline = "middle";

  const fontMono = `"Hack", "Noto Sans TC", "Noto Sans SC", "Noto Sans JP", "Noto Sans KR", monospace`;

  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, logicalWidth, logicalH);

  let y = padY;
  const innerW = logicalWidth - padX * 2;

  // Header Box
  ctx.fillStyle = pal.panel;
  ctx.fillRect(padX, y, innerW, headerH);
  ctx.strokeStyle = pal.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(padX + 0.5, y + 0.5, innerW - 1, headerH - 1);

  ctx.font = `700 ${fs(17)}px ${fontMono}`;
  ctx.fillStyle = pal.gold;
  ctx.fillText("EggRoll // Endfield Pull Tracker", padX + 16, y + headerH / 2);

  const hasCustomNick =
    account.nickName &&
    account.nickName !== account.roleId &&
    account.nickName !== account.uid;
  const accText = hasCustomNick
    ? `${account.nickName} (${account.serverName})`
    : `${account.serverName}`;
  ctx.font = `400 ${fs(13)}px ${fontMono}`;
  ctx.fillStyle = pal.muted;
  const accW = ctx.measureText(accText).width;
  ctx.fillText(accText, padX + innerW - 16 - accW, y + headerH / 2);

  y += headerH + 14;

  // Summary Box
  ctx.fillStyle = pal.panel;
  ctx.fillRect(padX, y, innerW, summaryH);
  ctx.strokeStyle = pal.border;
  ctx.strokeRect(padX + 0.5, y + 0.5, innerW - 1, summaryH - 1);

  ctx.font = `700 ${fs(14)}px ${fontMono}`;
  ctx.fillStyle = pal.cyan;
  ctx.fillText(
    `┌─ ${localizePoolName(stat.poolId, stat.poolName, locale)}`,
    padX + 14,
    y + Math.round(20 * fontScale),
  );

  const kpiY = y + Math.round(38 * fontScale);
  const kpiGap = 8;
  const kpiW = (innerW - 28 - kpiGap * 5) / 6;
  const rate6 = stat.totalPulls > 0 ? ((stat.count6 / stat.totalPulls) * 100).toFixed(2) : "0.00";
  const avgText = stat.avgPity6 !== null ? `${stat.avgPity6.toFixed(1)} ${tr.pullsUnit}` : "-";
  const upRateText = stat.upWinRate !== null ? `${stat.upWinRate.toFixed(1)}%` : "-";
  const upChecksCount = stat.history6.filter((h) => h.hasUpInfo).length;
  const up6Count = stat.history6.filter((h) => h.hasUpInfo && h.isUp).length;
  const up6Text = upChecksCount > 0 ? `${up6Count}` : "-";
  const up6Sub = upChecksCount > 0 ? tr.kpiOffSub(upChecksCount - up6Count) : tr.kpiNoUpPool;
  const limited6Count = stat.history6.filter((h) => isLimited6Star(h, poolInfo)).length;
  const limited6Sub =
    stat.count6 > 0 ? tr.kpiLimitedSub(((limited6Count / stat.count6) * 100).toFixed(0)) : tr.kpiNo6;

  const kpis = [
    { label: tr.kpiTotalPulls, value: `${stat.totalPulls}`, sub: tr.kpiTotalSub(stat.paidPulls, stat.freePulls), color: pal.fg },
    { label: tr.kpiCount6, value: `${stat.count6}`, sub: tr.kpiRate6(rate6), color: pal.gold },
    { label: tr.kpiAvg6, value: avgText, sub: tr.kpiAvgSub, color: pal.cyan },
    { label: tr.kpiUpRate, value: upRateText, sub: tr.kpiUpRateSub, color: pal.green },
    { label: tr.kpiUp6, value: up6Text, sub: up6Sub, color: pal.green },
    { label: tr.kpiLimited6, value: `${limited6Count}`, sub: limited6Sub, color: pal.gold },
  ];

  kpis.forEach((k, i) => {
    const kx = padX + 14 + i * (kpiW + kpiGap);
    ctx.fillStyle = pal.elevated;
    ctx.fillRect(kx, kpiY, kpiW, kpiH);
    ctx.strokeStyle = pal.border;
    ctx.strokeRect(kx + 0.5, kpiY + 0.5, kpiW - 1, kpiH - 1);

    ctx.font = `400 ${fs(12)}px ${fontMono}`;
    ctx.fillStyle = pal.muted;
    ctx.fillText(k.label, kx + 10, kpiY + kpiH * 0.23);

    ctx.font = `700 ${fs(18)}px ${fontMono}`;
    ctx.fillStyle = k.color;
    ctx.fillText(k.value, kx + 10, kpiY + kpiH * 0.54);

    ctx.font = `400 ${fs(11)}px ${fontMono}`;
    ctx.fillStyle = pal.muted;
    ctx.fillText(k.sub, kx + 10, kpiY + kpiH * 0.81);
  });

  // Pity bars
  const pityY = kpiY + kpiH + Math.round(22 * fontScale);
  const barX = padX + Math.round(114 * fontScale);
  const barWidth = logicalWidth >= 1200 ? 28 : 22;
  const smallRem = Math.max(0, stat.smallPityMax - stat.pityCount);
  const smallBar = renderAsciiBar(stat.pityCount, stat.smallPityMax, barWidth);

  if (hasSubPities) {
    ctx.font = `400 ${fs(13)}px ${fontMono}`;
    ctx.fillStyle = pal.muted;
    ctx.fillText(tr.subPities, padX + 16, pityY);

    const summaryLine = stat
      .subPities!.map((sp) => `${sp.label} ${sp.pity}/${sp.max}`)
      .join("   |   ");
    ctx.font = `700 ${fs(13)}px ${fontMono}`;
    ctx.fillStyle = pal.cyan;
    ctx.fillText(summaryLine, barX, pityY);
  } else {
    ctx.font = `400 ${fs(13)}px ${fontMono}`;
    ctx.fillStyle = pal.muted;
    ctx.fillText(tr.smallPity, padX + 16, pityY);

    ctx.font = `700 ${fs(13)}px ${fontMono}`;
    ctx.fillStyle = pityColor(stat.pityCount, stat.smallPityMax, pal);
    ctx.fillText(smallBar, barX, pityY);
    const barMeasuredW = ctx.measureText(smallBar).width;

    ctx.font = `400 ${fs(13)}px ${fontMono}`;
    ctx.fillStyle = pal.fg;
    ctx.fillText(`${stat.pityCount} / ${stat.smallPityMax} ${tr.smallPityRem(smallRem)}`, barX + barMeasuredW + 14, pityY);

    if (hasBigPity) {
      const bpY = pityY + Math.round(28 * fontScale);
      ctx.font = `400 ${fs(13)}px ${fontMono}`;
      ctx.fillStyle = pal.muted;
      ctx.fillText(tr.bigPityProg, padX + 16, bpY);
      if (stat.gotUp6) {
        ctx.font = `700 ${fs(13)}px ${fontMono}`;
        ctx.fillStyle = pal.green;
        ctx.fillText(tr.bigPityGot, barX, bpY);
      } else {
        const bc = stat.bigPityCount ?? 0;
        const bmax = stat.bigPityMax!;
        const brem = stat.bigPityRemaining ?? Math.max(0, bmax - bc);
        const bigBar = renderAsciiBar(bc, bmax, barWidth);
        ctx.font = `700 ${fs(13)}px ${fontMono}`;
        ctx.fillStyle = pal.gold;
        ctx.fillText(bigBar, barX, bpY);
        ctx.font = `400 ${fs(13)}px ${fontMono}`;
        ctx.fillStyle = pal.fg;
        ctx.fillText(`${bc} / ${bmax} ${tr.bigPityRem(brem)}`, barX + barMeasuredW + 14, bpY);
      }
    }

    if (hasTokenProgress) {
      const tkY = pityY + Math.round((hasBigPity ? 56 : 28) * fontScale);
      const tokenStep = 240;
      const validPulls =
        stat.poolType === RERUN_POOL_KEY
          ? (stat.officialTotalCount ?? stat.paidPulls)
          : stat.paidPulls;
      const tokenEarned = Math.floor(validPulls / tokenStep);
      const tokenProg = validPulls % tokenStep;
      const tokenRem = tokenStep - tokenProg;
      const tokenBar = renderAsciiBar(tokenProg, tokenStep, barWidth);

      ctx.font = `400 ${fs(13)}px ${fontMono}`;
      ctx.fillStyle = pal.muted;
      ctx.fillText(tr.tokenProg, padX + 16, tkY);

      ctx.font = `700 ${fs(13)}px ${fontMono}`;
      ctx.fillStyle = tokenEarned > 0 ? pal.green : pal.cyan;
      ctx.fillText(tokenBar, barX, tkY);

      let tx = barX + barMeasuredW + 14;
      const prefixStr = `${tokenProg} / ${tokenStep} `;
      const remPart = `(${tr.tokenRemText(tokenRem)} | `;
      const earnedPart = tr.tokenEarnedText(tokenEarned);

      ctx.font = `400 ${fs(13)}px ${fontMono}`;
      ctx.fillStyle = pal.fg;
      ctx.fillText(prefixStr, tx, tkY);
      tx += ctx.measureText(prefixStr).width;

      ctx.fillStyle = pal.muted;
      ctx.fillText(remPart, tx, tkY);
      tx += ctx.measureText(remPart).width;

      ctx.font = `${tokenEarned > 0 ? "700" : "400"} ${fs(13)}px ${fontMono}`;
      ctx.fillStyle = tokenEarned > 0 ? pal.gold : pal.muted;
      ctx.fillText(earnedPart, tx, tkY);
      tx += ctx.measureText(earnedPart).width;

      ctx.font = `400 ${fs(13)}px ${fontMono}`;
      ctx.fillStyle = pal.muted;
      ctx.fillText(")", tx, tkY);
    } else if (hasWeaponGiftProgress) {
      const wgY = pityY + Math.round((hasBigPity ? 56 : 28) * fontScale);
      const validPulls =
        stat.poolType === WEAPON_RERUN_POOL_TYPE
          ? (stat.officialTotalCount ?? stat.totalPulls)
          : stat.totalPulls;
      const wg = computeWeaponGiftMilestone(validPulls);
      const wgBar = renderAsciiBar(wg.prog, wg.span, barWidth);
      const giftTargetLabel = wg.nextLabel === "補充武庫箱" ? tr.boxLabel : tr.upWeaponLabel;

      ctx.font = `400 ${fs(13)}px ${fontMono}`;
      ctx.fillStyle = pal.muted;
      ctx.fillText(tr.weaponGift, padX + 16, wgY);

      ctx.font = `700 ${fs(13)}px ${fontMono}`;
      ctx.fillStyle = wg.weaponsEarned > 0 ? pal.green : pal.cyan;
      ctx.fillText(wgBar, barX, wgY);

      ctx.font = `400 ${fs(13)}px ${fontMono}`;
      ctx.fillStyle = pal.fg;
      ctx.fillText(
        `${wg.pulls} / ${wg.nextTarget} ${tr.weaponGiftDesc(giftTargetLabel, wg.remaining, wg.boxesEarned, wg.weaponsEarned)}`,
        barX + barMeasuredW + 14,
        wgY,
      );
    }
  }

  y += summaryH + 14;

  // 6★ History Table Box
  const tableBoxH = tableHeaderH + tableBodyH;
  ctx.fillStyle = pal.panel;
  ctx.fillRect(padX, y, innerW, tableBoxH);
  ctx.strokeStyle = pal.border;
  ctx.strokeRect(padX + 0.5, y + 0.5, innerW - 1, tableBoxH - 1);

  ctx.font = `700 ${fs(14)}px ${fontMono}`;
  ctx.fillStyle = pal.cyan;
  const historyTitle = `┌─ ${tr.historyTitle(history.length, allHistory.length)}`;
  ctx.fillText(historyTitle, padX + 14, y + Math.round(20 * fontScale));

  const thY = y + tableTitleH;
  ctx.fillStyle = pal.elevated;
  ctx.fillRect(padX + 14, thY, innerW - 28, thH);
  ctx.strokeStyle = pal.border;
  ctx.strokeRect(padX + 14.5, thY + 0.5, innerW - 29, thH - 1);

  const tableLeft = padX + 24;
  const usableW = innerW - 48;
  const cols = {
    idx: tableLeft,
    name: tableLeft + usableW * 0.05,
    pity: tableLeft + usableW * 0.22,
    bar: tableLeft + usableW * 0.31,
    tags: tableLeft + usableW * 0.49,
    poolTime: tableLeft + usableW * 0.62,
  };

  ctx.font = `700 ${fs(12)}px ${fontMono}`;
  ctx.fillStyle = pal.muted;
  ctx.fillText("#", cols.idx, thY + thH / 2);
  ctx.fillText(tr.colName, cols.name, thY + thH / 2);
  ctx.fillText(tr.colPulls, cols.pity, thY + thH / 2);
  ctx.fillText(tr.colBar, cols.bar, thY + thH / 2);
  ctx.fillText(tr.colTags, cols.tags, thY + thH / 2);
  ctx.fillText(tr.colPoolTime, cols.poolTime, thY + thH / 2);

  let rowY = thY + thH + 4;
  if (history.length === 0) {
    ctx.font = `400 ${fs(13)}px ${fontMono}`;
    ctx.fillStyle = pal.muted;
    ctx.fillText(tr.noHistoryMatch, cols.idx, rowY + rowH / 2);
  } else {
    history.forEach((h, idx) => {
      const cy = rowY + rowH / 2;
      if (idx % 2 === 1) {
        ctx.fillStyle = pal.elevated;
        ctx.fillRect(padX + 14, rowY, innerW - 28, rowH);
      }

      ctx.font = `400 ${fs(12)}px ${fontMono}`;
      ctx.fillStyle = pal.muted;
      ctx.fillText(String(idx + 1), cols.idx, cy);

      ctx.font = `700 ${fs(13)}px ${fontMono}`;
      ctx.fillStyle = pal.gold;
      ctx.fillText(localizeItemName(h.itemId, h.name, locale), cols.name, cy);

      const pColor = pityColor(h.pity, stat.smallPityMax, pal);
      ctx.font = `400 ${fs(13)}px ${fontMono}`;
      ctx.fillStyle = pColor;
      ctx.fillText(h.isFree ? tr.freeText : `${h.pity} ${tr.pullsUnit}`, cols.pity, cy);

      ctx.font = `700 ${fs(12)}px ${fontMono}`;
      ctx.fillText(h.isFree ? "[FREE_PULL]" : renderAsciiBar(h.pity, stat.smallPityMax, 12), cols.bar, cy);

      let tx = cols.tags;
      const drawTag = (text: string, color: string) => {
        ctx.font = `700 ${fs(11)}px ${fontMono}`;
        const tw = ctx.measureText(text).width + 10;
        const th = Math.round(19 * fontScale);
        ctx.strokeStyle = color;
        ctx.strokeRect(tx + 0.5, cy - th / 2 + 0.5, tw, th);
        ctx.fillStyle = color;
        ctx.fillText(text, tx + 5, cy);
        tx += tw + 6;
      };
      if (h.hasUpInfo) drawTag(h.isUp ? "UP" : tr.tagOff, h.isUp ? pal.green : pal.red);
      if (h.isNew) drawTag("NEW", pal.gold);
      if (h.isFree) drawTag(tr.tagFree, pal.cyan);

      ctx.font = `400 ${fs(12)}px ${fontMono}`;
      ctx.fillStyle = pal.muted;
      ctx.fillText(
        `${localizePoolName(h.poolId, h.poolName, locale) || "-"} // ${formatDate(h.gachaTs)}`,
        cols.poolTime,
        cy,
      );

      rowY += rowH;
    });
  }

  y += tableBoxH + 14;

  // Footer
  ctx.fillStyle = pal.elevated;
  ctx.fillRect(padX, y, innerW, footerH);
  ctx.strokeStyle = pal.border;
  ctx.strokeRect(padX + 0.5, y + 0.5, innerW - 1, footerH - 1);

  ctx.font = `400 ${fs(11)}px ${fontMono}`;
  ctx.fillStyle = pal.muted;
  const nowStr = new Date().toLocaleString(locale, { hour12: false });
  ctx.fillText(
    tr.imgFooter(nowStr, logicalWidth, Math.round(fontScale * 100), canvas.width, canvas.height, scale),
    padX + 14,
    y + footerH / 2,
  );

  const mimeType = `image/${format}`;
  // JPG 需較高品質 (0.92) 避免等寬文字與細框線產生振鈴雜訊；WebP 在 0.90 即可兼顧銳利度與極小體積
  const quality = format === "png" ? undefined : format === "jpeg" ? 0.92 : 0.9;
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error(`不支援匯出 ${format.toUpperCase()} 格式`))),
      mimeType,
      quality,
    );
  });

  const arrayBuffer = await blob.arrayBuffer();
  return {
    bytes: new Uint8Array(arrayBuffer),
    mimeType,
    width: canvas.width,
    height: canvas.height,
  };
}
