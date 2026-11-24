# Simple Endfield Pull Tracker (SEPT)

極簡、純文字 TUI 風格但支援滑鼠操作的《明日方舟：終末地》本地抽卡分析工具（國際服 Gryphline）。

## 特色

- **純文字 TUI 介面 + 滑鼠控制**：無多餘角色圖片與圓餅圖，以等寬字體（內嵌 `Hack` + `Noto Sans TC / SC / JP`）、ASCII 進度條與表格呈現。
- **聚焦 6★ 核心統計**：顯示總抽數（實際／加急）、6★ 出貨與機率、6★ 平均抽數（不計入加急）、UP 不歪率、UP 6★ 出貨、限定 6★ 出貨，以及小保底／大保底水位。
- **完全本地執行**：支援自動讀取 `HGWebview.log` 或手動貼上抽卡連結／`u8_token`，所有資料皆保存在本機。
- **AKEGF v0.4 標準相容**：支援 [AKEGF v0.4](https://www.akedata.wiki/?plugin=akegf&id=home) 格式匯入與匯出（可透過系統檔案對話框選擇儲存位置，檔名自動帶入時間戳）。
- **高解析度圖片分享匯出**：支援輸出 `PNG` / `JPG` / `WebP`，可自訂畫面寬度（`900px`–`1440px`）、字體大小與 `1x`–`3x` 上採樣率，且截圖自動隱藏遊戲 ID。
- **主題與縮放**：支援 `DARK`（預設）／`LIGHT` 主題切換與 `80%`–`150%` 介面縮放。

## 開發與建置

```bash
# 安裝依賴
pnpm install

# 執行單元測試
pnpm test

# 啟動桌面端開發模式
pnpm tauri dev

# 建置發行版本
pnpm tauri build
```
