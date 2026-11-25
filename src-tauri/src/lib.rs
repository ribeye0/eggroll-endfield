use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::thread;
use std::time::Duration;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

#[derive(Debug, Serialize, Deserialize)]
pub struct LogDetectionResult {
    pub url: String,
    pub provider: String,
    pub path: String,
}

fn get_store_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = dirs::config_dir()
        .or_else(|| app.path().app_config_dir().ok())
        .ok_or_else(|| "無法取得設定目錄".to_string())?;
    let dir = base.join("eggroll");
    fs::create_dir_all(&dir).map_err(|e| format!("無法建立設定目錄: {e}"))?;
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

fn is_token_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || matches!(b, b'+' | b'/' | b'=' | b'_' | b'-')
}

fn percent_encode_token(token: &str) -> String {
    let mut out = String::with_capacity(token.len());
    for ch in token.chars() {
        match ch {
            '+' => out.push_str("%2B"),
            '/' => out.push_str("%2F"),
            '=' => out.push_str("%3D"),
            _ => out.push(ch),
        }
    }
    out
}

fn extract_u8_token_from_session_bytes(
    data: &[u8],
    provider_hint: Option<&str>,
) -> Option<(String, String)> {
    let needle_prefix = b"map-";
    let needle_suffix = b"-u8_token";
    let mut last_match: Option<(String, String)> = None;

    let mut i = 0;
    while i + needle_prefix.len() + needle_suffix.len() < data.len() {
        if &data[i..i + needle_prefix.len()] == needle_prefix {
            let mut j = i + needle_prefix.len();
            while j < data.len() && data[j].is_ascii_digit() {
                j += 1;
            }
            if j > i + needle_prefix.len()
                && j + needle_suffix.len() <= data.len()
                && &data[j..j + needle_suffix.len()] == needle_suffix
            {
                let val_start_search = j + needle_suffix.len();
                let search_end = (val_start_search + 6).min(data.len());
                let mut k = val_start_search;
                while k + 1 < search_end {
                    if is_token_byte(data[k]) && data[k + 1] == 0 {
                        break;
                    }
                    k += 1;
                }
                if k + 1 < search_end && is_token_byte(data[k]) && data[k + 1] == 0 {
                    let mut token = String::new();
                    let mut p = k;
                    while p + 1 < data.len() && is_token_byte(data[p]) && data[p + 1] == 0 {
                        token.push(data[p] as char);
                        p += 2;
                    }
                    if token.len() >= 32 {
                        let ctx_start = i.saturating_sub(512);
                        let ctx = String::from_utf8_lossy(&data[ctx_start..i]);
                        let prov = if ctx.contains("hypergryph.com") {
                            "hypergryph"
                        } else if ctx.contains("gryphline.com") {
                            "gryphline"
                        } else {
                            provider_hint.unwrap_or("gryphline")
                        };
                        let url = format!(
                            "https://ef-webview.{prov}.com/page/gacha_char?u8_token={}",
                            percent_encode_token(&token)
                        );
                        last_match = Some((url, prov.to_string()));
                    }
                    i = p;
                    continue;
                }
            }
        }
        i += 1;
    }

    last_match
}

fn find_session_storage_dir_from_path(path: &std::path::Path) -> Option<PathBuf> {
    if path.is_dir() && path.file_name().and_then(|n| n.to_str()) == Some("Session Storage") {
        return Some(path.to_path_buf());
    }
    let mut cur = if path.is_dir() {
        Some(path)
    } else {
        path.parent()
    };
    for _ in 0..6 {
        let Some(dir) = cur else { break };
        if dir.file_name().and_then(|n| n.to_str()) == Some("Session Storage") {
            return Some(dir.to_path_buf());
        }
        let candidate = dir.join("Local/PlatformProcess/QtWebEngine/Default/Session Storage");
        if candidate.is_dir() {
            return Some(candidate);
        }
        let candidate_appdata =
            dir.join("AppData/Local/PlatformProcess/QtWebEngine/Default/Session Storage");
        if candidate_appdata.is_dir() {
            return Some(candidate_appdata);
        }
        cur = dir.parent();
    }
    None
}

fn extract_from_session_storage_dir(
    dir: &std::path::Path,
    provider_hint: Option<&str>,
) -> Option<LogDetectionResult> {
    let entries = fs::read_dir(dir).ok()?;
    let mut files: Vec<(std::time::SystemTime, PathBuf)> = Vec::new();
    for entry in entries.flatten() {
        let p = entry.path();
        let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("");
        if ext == "log" || ext == "ldb" {
            let mtime = entry
                .metadata()
                .and_then(|m| m.modified())
                .unwrap_or(std::time::UNIX_EPOCH);
            files.push((mtime, p));
        }
    }
    files.sort_by(|a, b| b.0.cmp(&a.0));

    for (_, p) in files {
        if let Ok(bytes) = fs::read(&p) {
            if let Some((url, prov)) = extract_u8_token_from_session_bytes(&bytes, provider_hint) {
                return Some(LogDetectionResult {
                    url,
                    provider: prov,
                    path: p.display().to_string(),
                });
            }
        }
    }
    None
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
            if path.is_file() {
                let bytes = fs::read(&path)
                    .map_err(|e| format!("讀取指定日誌失敗 ({}): {e}", path.display()))?;
                let content = String::from_utf8_lossy(&bytes);
                if let Some((url, prov)) =
                    extract_gacha_url_from_content(&content, provider.as_deref())
                {
                    return Ok(LogDetectionResult {
                        url,
                        provider: prov,
                        path: path.display().to_string(),
                    });
                }
                if let Some((url, prov)) =
                    extract_u8_token_from_session_bytes(&bytes, provider.as_deref())
                {
                    return Ok(LogDetectionResult {
                        url,
                        provider: prov,
                        path: path.display().to_string(),
                    });
                }
            }
            if path.is_dir() {
                if let Some(res) = extract_from_session_storage_dir(&path, provider.as_deref()) {
                    return Ok(res);
                }
            }
            if let Some(ss_dir) = find_session_storage_dir_from_path(&path) {
                if let Some(res) = extract_from_session_storage_dir(&ss_dir, provider.as_deref()) {
                    return Ok(res);
                }
            }
            return Err(
                "指定日誌與鄰近 QtWebEngine Session Storage 中未找到抽卡連結或 u8_token，請先在遊戲內打開一次尋訪紀錄頁面。"
                    .to_string(),
            );
        }
    }

    let candidates = candidate_log_paths(provider.as_deref());
    for (prov, path) in &candidates {
        if path.exists() {
            if let Ok(bytes) = fs::read(path) {
                let content = String::from_utf8_lossy(&bytes);
                if let Some((url, detected_prov)) =
                    extract_gacha_url_from_content(&content, Some(prov))
                {
                    return Ok(LogDetectionResult {
                        url,
                        provider: detected_prov,
                        path: path.display().to_string(),
                    });
                }
            }
        }
    }

    if let Some(home) = dirs::home_dir() {
        let ss_dir = home.join("AppData/Local/PlatformProcess/QtWebEngine/Default/Session Storage");
        if ss_dir.is_dir() {
            if let Some(res) = extract_from_session_storage_dir(&ss_dir, provider.as_deref()) {
                return Ok(res);
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
        if let Ok(legacy_dir) = app.path().app_data_dir() {
            let legacy_path = legacy_dir.join("store.json");
            if legacy_path.exists() {
                let _ = fs::copy(&legacy_path, &path);
            }
        }
    }
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

#[tauri::command]
async fn open_login_window(app: tauri::AppHandle, provider: Option<String>) -> Result<(), String> {
    let provider = provider.unwrap_or_else(|| "gryphline".to_string());
    let label = format!("hg-login-{}", provider);
    let (login_url, auth_url_match, poll_url, title) = match provider.as_str() {
        "hypergryph" => (
            "https://user.hypergryph.com/",
            "as.hypergryph.com/user/auth",
            "https://web-api.hypergryph.com/account/info/hg",
            "EggRoll - Hypergryph Login",
        ),
        _ => (
            "https://user.gryphline.com/",
            "as.gryphline.com/user/auth",
            "https://web-api.gryphline.com/cookie_store/account_token",
            "EggRoll - Gryphline Login",
        ),
    };

    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.set_focus();
        return Ok(());
    }

    let script = r#"
      (function() {
        var hasSent = false;
        function sendToken(token) {
          if (hasSent || !token) return;
          hasSent = true;
          window.location.replace("http://tauri.localhost/login_success?token=" + encodeURIComponent(token));
        }

        var originalOpen = XMLHttpRequest.prototype.open;
        var originalSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function(method, url) {
          this._url = url;
          return originalOpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function() {
          this.addEventListener('load', function() {
            try {
              if (this._url && this._url.includes('__AUTH_URL_MATCH__')) {
                var res = JSON.parse(this.responseText);
                if (res.status === 0 && res.data && res.data.token) {
                  sendToken(res.data.token);
                }
              }
            } catch (e) {}
          });
          return originalSend.apply(this, arguments);
        };

        var originalFetch = window.fetch;
        window.fetch = async function(...args) {
          const response = await originalFetch(...args);
          try {
            const url = response.url;
            if (url && url.includes('__AUTH_URL_MATCH__')) {
              const clone = response.clone();
              clone.json().then(data => {
                if (data.status === 0 && data.data && data.data.token) {
                  sendToken(data.data.token);
                }
              }).catch(function() {});
            }
          } catch (e) {}
          return response;
        };

        var timer = setInterval(function() {
          if (hasSent) { clearInterval(timer); return; }
          fetch("__POLL_URL__", {
            method: "GET",
            credentials: "include"
          })
          .then(function(res) { return res.json(); })
          .then(function(data) {
            if (data && data.code === 0 && data.data && data.data.content) {
              sendToken(data.data.content);
              clearInterval(timer);
            }
          })
          .catch(function() {});
        }, 1500);
      })();
    "#
    .replace("__AUTH_URL_MATCH__", auth_url_match)
    .replace("__POLL_URL__", poll_url);

    let app_handle_for_nav = app.clone();
    let app_handle_for_event = app.clone();
    let label_for_close = label.clone();

    let parsed_url: tauri::Url = login_url
        .parse()
        .map_err(|e| format!("無效的登入網址: {e}"))?;

    let win_builder = WebviewWindowBuilder::new(&app, label.clone(), WebviewUrl::External(parsed_url))
        .title(title)
        .inner_size(500.0, 720.0)
        .resizable(true)
        .initialization_script(script)
        .on_navigation(move |url| {
            let url_str = url.as_str();
            if url_str.starts_with("http://tauri.localhost/login_success") {
                if let Some(token) = url
                    .query_pairs()
                    .find(|(k, _)| k == "token")
                    .map(|(_, v)| v.into_owned())
                {
                    let _ = app_handle_for_nav.emit("hg-login-success", token);
                    let app_clone = app_handle_for_nav.clone();
                    let label_clone = label_for_close.clone();
                    thread::spawn(move || {
                        thread::sleep(Duration::from_millis(350));
                        if let Some(win) = app_clone.get_webview_window(&label_clone) {
                            let _ = win.close();
                        }
                    });
                }
                return false;
            }
            true
        });

    let win = win_builder
        .build()
        .map_err(|e| format!("無法開啟官方登入視窗: {e}"))?;
    let _ = win.clear_all_browsing_data();
    win.on_window_event(move |event| {
        if let WindowEvent::Destroyed = event {
            let _ = app_handle_for_event.emit("hg-login-closed", ());
        }
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            detect_gacha_log,
            open_login_window,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_latest_u8_token_from_session_storage_bytes() {
        let mut buf = Vec::new();
        buf.extend_from_slice(b"namespace-abc-https://ef-webview.gryphline.com/\x00");
        buf.extend_from_slice(b"map-13-u8_token\xd0\t");
        let fake_token = "AbCdEf0123456789+GhIjKlMnOpQrStUvWxYz/==";
        for b in fake_token.bytes() {
            buf.push(b);
            buf.push(0);
        }
        buf.extend_from_slice(b"\x00\x05map-13-u8_token\x00'map-13-version");

        let (url, prov) =
            extract_u8_token_from_session_bytes(&buf, Some("gryphline")).expect("should extract");
        assert_eq!(prov, "gryphline");
        assert_eq!(
            url,
            "https://ef-webview.gryphline.com/page/gacha_char?u8_token=AbCdEf0123456789%2BGhIjKlMnOpQrStUvWxYz%2F%3D%3D"
        );
    }
}
