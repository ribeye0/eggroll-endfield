# EggRoll // Endfield Pull Tracker

極簡、純文字 TUI 風格的《明日方舟：終末地》本地抽卡分析工具（支援繁體中文、简体中文、日本語、English、한국어 五語系切換）。

![EggRoll // Endfield Pull Tracker 介面預覽](docs/screenshot.webp)

## 特色

- **純文字 TUI 介面**：無多餘角色圖片與圓餅圖，內嵌 `Hack` 與 `Noto Sans TC / SC / JP / KR` 等寬與五語系字體，以 ASCII 進度條與表格呈現。
- **聚焦 6★ 核心統計**：
  - 總抽數（實際／加急招募）、6★ 出貨與機率、6★ 平均抽數（不計入加急）、UP 不歪率、UP 6★ 出貨、限定 6★ 出貨。
  - **角色尋訪**：完整支援特許尋訪（80 小保底 / 120 大保底 / 240 信物進度）、重構尋訪（獨立水位）、特殊卡池（輝光慶典等）、基礎尋訪與啟程尋訪，並提供「全部限定尋訪」總覽。
  - **武器申領**：支援 40 抽保底 / 80 抽 UP 與 100/180 抽申領贈禮里程碑（補充武庫箱 / 當期 UP 武器）。
- **五語系即時轉換**：內建角色、6★ 武器與卡池名稱對照表（資料來源：[akedata.wiki](https://www.akedata.wiki/)），切換介面語言時歷史紀錄會同步轉換，同時保留 `store.json` 與 AKEGF 匯出原始資料。
- **對照表熱更新 + 離線快取**：啟動時會於背景檢查遠端靜態對照表（`data/eggroll-i18n.json`）並快取於本機，離線時自動使用內建對照表。
- **完全本地執行與 AKEGF v0.4 相容**：支援自動讀取 `HGWebview.log` 或手動貼上抽卡連結／`u8_token`，並支援 [AKEGF v0.4](https://www.akedata.wiki/?plugin=akegf&id=home) 標準匯入與匯出。
- **高解析度圖片分享匯出**：支援輸出 `PNG` / `JPG` / `WebP`，可自訂畫面寬度（`680px` / `780px` / `900px`）、字體大小、顯示卡池數量與 `1x`–`3x` 上採樣率，截圖自動隱藏遊戲 ID。
- **主題與縮放**：支援 `DARK`（預設）／`LIGHT` 主題切換與 `80%`–`150%` 介面縮放。

## 下載與安裝

- Windows 使用者可直接前往 GitHub **Releases** 頁面下載最新版本的 `EggRoll` 執行檔（`.exe`）。

## 設定檔路徑

應用程式的設定與抽卡紀錄（`store.json`）儲存於以下路徑：

| 作業系統 | 路徑 |
| --- | --- |
| Linux | `~/.config/eggroll/` |
| Windows | `%APPDATA%\eggroll\` |

## 開發與建置

```bash
pnpm install
pnpm test
pnpm build
pnpm tauri dev
pnpm tauri build
```
