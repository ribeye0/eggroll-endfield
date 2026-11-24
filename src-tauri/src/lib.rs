use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

#[derive(Debug, Serialize, Deserialize)]
pub struct LogDetectionResult {
    pub url: String,
    pub provider: String,
    pub path: String,
}

fn get_store_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("無法取得資料目錄: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("無法建立資料目錄: {e}"))?;
    Ok(dir.join("store.json"))
}

fn extract_gacha_url_from_content(content: &str, provider_hint: Option<&str>) -> Option<(String, String)> {
    let providers: Vec<&str> = match provider_hint {
        Some("hypergryph") => vec!["hypergryph"],
        Some("gryphline") => vec!["gryphline"],
        _ => vec!["hypergryph", "gryphline"],
    };

    for line in content.lines().rev() {
        for &prov in &providers {
            let prefix = format!("https://ef-webview.{prov}.com/page/gacha_");
            if let Some(start) = line.find(&prefix) {
                let rest = &line[start..];
                let end = rest
                    .find(|c: char| c.is_whitespace() || c == '"' || c == '\'' || c == '>' || c == ')')
                    .unwrap_or(rest.len());
                let url = rest[..end].trim().to_string();
                if !url.is_empty() {
                    return Some((url, prov.to_string()));
                }
            }
        }
    }
    None
}

fn candidate_log_paths(provider_hint: Option<&str>) -> Vec<(String, PathBuf)> {
    let mut paths = Vec::new();
    let Some(home) = dirs::home_dir() else {
        return paths;
    };

    let include_cn = provider_hint.is_none() || provider_hint == Some("hypergryph");
    let include_global = provider_hint.is_none() || provider_hint == Some("gryphline");

    if include_cn {
        paths.push((
            "hypergryph".to_string(),
            home.join("AppData/LocalLow/Hypergryph/Endfield/sdklogs/HGWebview.log"),
        ));
    }
    if include_global {
        paths.push((
            "gryphline".to_string(),
            home.join("AppData/LocalLow/Gryphline/Endfield/sdklogs/HGWebview.log"),
        ));
    }
    paths
}

#[tauri::command]
fn detect_gacha_log(
    provider: Option<String>,
    custom_path: Option<String>,
) -> Result<LogDetectionResult, String> {
    if let Some(raw_path) = custom_path {
        let trimmed = raw_path.trim();
        if !trimmed.is_empty() {
            let path = PathBuf::from(trimmed);
            let content = fs::read_to_string(&path)
                .map_err(|e| format!("讀取指定日誌失敗 ({}): {e}", path.display()))?;
            if let Some((url, prov)) = extract_gacha_url_from_content(&content, provider.as_deref()) {
                return Ok(LogDetectionResult {
                    url,
                    provider: prov,
                    path: path.display().to_string(),
                });
            }
            return Err("指定日誌中未找到抽卡連結，請先在遊戲內打開一次尋訪紀錄頁面。".to_string());
        }
    }

    let candidates = candidate_log_paths(provider.as_deref());
    for (prov, path) in &candidates {
        if path.exists() {
            if let Ok(content) = fs::read_to_string(path) {
                if let Some((url, detected_prov)) = extract_gacha_url_from_content(&content, Some(prov)) {
                    return Ok(LogDetectionResult {
                        url,
                        provider: detected_prov,
                        path: path.display().to_string(),
                    });
                }
            }
        }
    }

    Err("未在預設遊戲日誌路徑找到抽卡連結。若使用非 Windows 系統或自訂路徑，請手動指定 HGWebview.log 路徑，或直接貼上抽卡連結 / Token。".to_string())
}

#[tauri::command]
async fn http_get_json(url: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| format!("建立 HTTP 客戶端失敗: {e}"))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("網路請求失敗: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(format!("HTTP 狀態碼錯誤: {status}"));
    }

    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| format!("JSON 解析失敗: {e}"))
}

#[tauri::command]
async fn http_post_json(
    url: String,
    body: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| format!("建立 HTTP 客戶端失敗: {e}"))?;

    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("網路請求失敗: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(format!("HTTP 狀態碼錯誤: {status}"));
    }

    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| format!("JSON 解析失敗: {e}"))
}

#[tauri::command]
fn load_store(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let path = get_store_path(&app)?;
    if !path.exists() {
        return Ok(serde_json::json!(null));
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("讀取本機資料失敗: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("解析本機資料失敗: {e}"))
}

#[tauri::command]
fn save_store(app: tauri::AppHandle, data: serde_json::Value) -> Result<(), String> {
    let path = get_store_path(&app)?;
    let tmp_path = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(&data).map_err(|e| format!("序列化失敗: {e}"))?;
    fs::write(&tmp_path, json).map_err(|e| format!("寫入暫存檔失敗: {e}"))?;
    fs::rename(&tmp_path, &path).map_err(|e| format!("更新本機資料失敗: {e}"))?;
    Ok(())
}

fn sanitize_filename(filename: &str) -> String {
    filename
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

#[tauri::command]
fn export_json_file(
    filename: String,
    content: String,
) -> Result<Option<String>, String> {
    let safe_name = sanitize_filename(&filename);
    let mut dialog = rfd::FileDialog::new()
        .set_file_name(&safe_name)
        .add_filter("JSON", &["json"]);
    if let Some(dir) = dirs::download_dir() {
        dialog = dialog.set_directory(dir);
    }
    let Some(path) = dialog.save_file() else {
        return Ok(None);
    };
    fs::write(&path, content).map_err(|e| format!("寫入匯出檔案失敗: {e}"))?;
    Ok(Some(path.display().to_string()))
}

#[tauri::command]
fn export_binary_file(
    filename: String,
    bytes: Vec<u8>,
) -> Result<Option<String>, String> {
    let safe_name = sanitize_filename(&filename);
    let ext = std::path::Path::new(&safe_name)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("png");
    let mut dialog = rfd::FileDialog::new()
        .set_file_name(&safe_name)
        .add_filter("Image", &[ext]);
    if let Some(dir) = dirs::download_dir() {
        dialog = dialog.set_directory(dir);
    }
    let Some(path) = dialog.save_file() else {
        return Ok(None);
    };
    fs::write(&path, bytes).map_err(|e| format!("寫入匯出檔案失敗: {e}"))?;
    Ok(Some(path.display().to_string()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            detect_gacha_log,
            http_get_json,
            http_post_json,
            load_store,
            save_store,
            export_json_file,
            export_binary_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
