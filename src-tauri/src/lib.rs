use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::cmp::Ordering;
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread;
use std::time::Duration;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const GITHUB_RELEASES_LATEST_URL: &str =
    "https://api.github.com/repos/ribeye0/eggroll-endfield/releases/latest";
const GITHUB_RELEASES_PAGE_URL: &str =
    "https://github.com/ribeye0/eggroll-endfield/releases";

fn get_store_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = dirs::config_dir()
        .or_else(|| app.path().app_config_dir().ok())
        .ok_or_else(|| "無法取得設定目錄".to_string())?;
    let dir = base.join("eggroll");
    fs::create_dir_all(&dir).map_err(|e| format!("無法建立設定目錄: {e}"))?;
    Ok(dir)
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

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub current_version: String,
    pub latest_version: String,
    pub has_update: bool,
    pub release_notes: String,
    pub release_url: String,
    pub asset_name: Option<String>,
    pub download_url: Option<String>,
    pub checksum_url: Option<String>,
    pub asset_size: Option<u64>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct UpdateDownloadProgress {
    downloaded: u64,
    total: Option<u64>,
    percent: Option<u8>,
}

#[derive(Debug, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    body: Option<String>,
    html_url: Option<String>,
    assets: Option<Vec<GithubAsset>>,
}

fn parse_semver_parts(ver: &str) -> (u64, u64, u64) {
    let clean = ver.trim().trim_start_matches(|c| c == 'v' || c == 'V');
    let mut parts = clean.split('.').map(|s| {
        s.split('-')
            .next()
            .unwrap_or("0")
            .parse::<u64>()
            .unwrap_or(0)
    });
    (
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
    )
}

fn compare_semver(a: &str, b: &str) -> Ordering {
    parse_semver_parts(a).cmp(&parse_semver_parts(b))
}

fn select_release_asset_for_os<'a>(
    assets: &'a [GithubAsset],
    target_os: &str,
) -> Option<&'a GithubAsset> {
    match target_os {
        "windows" => assets
            .iter()
            .find(|a| {
                let n = a.name.to_ascii_lowercase();
                n.ends_with(".exe") && !n.contains("setup")
            })
            .or_else(|| {
                assets
                    .iter()
                    .find(|a| a.name.to_ascii_lowercase().ends_with(".exe"))
            }),
        "linux" => assets
            .iter()
            .find(|a| a.name.to_ascii_lowercase().ends_with(".appimage")),
        "macos" => assets
            .iter()
            .find(|a| a.name.to_ascii_lowercase().ends_with(".dmg")),
        _ => None,
    }
}

fn select_checksum_asset<'a>(
    assets: &'a [GithubAsset],
    asset_name: &str,
) -> Option<&'a GithubAsset> {
    let expected_sidecar = format!("{}.sha256", asset_name.to_ascii_lowercase());
    assets
        .iter()
        .find(|a| a.name.to_ascii_lowercase() == expected_sidecar)
        .or_else(|| {
            assets.iter().find(|a| {
                let n = a.name.to_ascii_lowercase();
                n == "sha256sums.txt" || n == "sha256sums"
            })
        })
}

fn is_hex_sha256(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit())
}

fn parse_sha256_for_asset(content: &str, asset_name: &str) -> Option<String> {
    let target = asset_name.trim().to_ascii_lowercase();
    let lines: Vec<&str> = content
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .collect();

    for line in &lines {
        let mut parts = line.split_whitespace();
        let Some(hash_part) = parts.next() else {
            continue;
        };
        if !is_hex_sha256(hash_part) {
            continue;
        }
        if let Some(file_part) = parts.next() {
            let clean_file = file_part
                .trim_start_matches('*')
                .rsplit('/')
                .next()
                .unwrap_or(file_part)
                .to_ascii_lowercase();
            if clean_file == target {
                return Some(hash_part.to_ascii_lowercase());
            }
        }
    }

    if lines.len() == 1 {
        let single = lines[0].split_whitespace().next().unwrap_or("");
        if is_hex_sha256(single) {
            return Some(single.to_ascii_lowercase());
        }
    }
    None
}

fn to_hex_lower(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for &b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0f) as usize] as char);
    }
    out
}

#[tauri::command]
async fn check_app_update() -> Result<UpdateCheckResult, String> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("建立 HTTP 連線失敗: {e}"))?;

    let resp = client
        .get(GITHUB_RELEASES_LATEST_URL)
        .header("User-Agent", "EggRoll-Updater")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("檢查更新連線失敗: {e}"))?;

    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(UpdateCheckResult {
            current_version: current_version.clone(),
            latest_version: current_version,
            has_update: false,
            release_notes: String::new(),
            release_url: GITHUB_RELEASES_PAGE_URL.to_string(),
            asset_name: None,
            download_url: None,
            checksum_url: None,
            asset_size: None,
        });
    }

    if !resp.status().is_success() {
        return Err(format!("GitHub Releases API 回應錯誤: HTTP {}", resp.status()));
    }

    let release = resp
        .json::<GithubRelease>()
        .await
        .map_err(|e| format!("解析更新資訊失敗: {e}"))?;

    let latest_version = release
        .tag_name
        .trim()
        .trim_start_matches(|c| c == 'v' || c == 'V')
        .to_string();
    let has_update = compare_semver(&latest_version, &current_version) == Ordering::Greater;
    let assets = release.assets.unwrap_or_default();
    let picked = select_release_asset_for_os(&assets, std::env::consts::OS);
    let checksum = picked.and_then(|a| select_checksum_asset(&assets, &a.name));

    Ok(UpdateCheckResult {
        current_version,
        latest_version,
        has_update,
        release_notes: release.body.unwrap_or_default(),
        release_url: release
            .html_url
            .unwrap_or_else(|| GITHUB_RELEASES_PAGE_URL.to_string()),
        asset_name: picked.map(|a| a.name.clone()),
        download_url: picked.map(|a| a.browser_download_url.clone()),
        checksum_url: checksum.map(|a| a.browser_download_url.clone()),
        asset_size: picked.map(|a| a.size),
    })
}

#[tauri::command]
async fn download_app_update(
    app: tauri::AppHandle,
    url: String,
    asset_name: String,
    checksum_url: Option<String>,
) -> Result<String, String> {
    if !url.starts_with("https://") {
        return Err("更新下載連結必須使用 HTTPS".to_string());
    }
    let checksum_url = checksum_url
        .filter(|u| u.starts_with("https://"))
        .ok_or_else(|| "此版本未提供 SHA-256 校驗檔，已基於安全性中止自動下載，請前往 Releases 頁面確認".to_string())?;

    let dir = get_store_dir(&app)?;
    let updates_dir = dir.join("updates");
    fs::create_dir_all(&updates_dir).map_err(|e| format!("無法建立更新暫存目錄: {e}"))?;

    let safe_name = sanitize_filename(&asset_name);
    let final_path = updates_dir.join(&safe_name);
    let part_path = updates_dir.join(format!("{safe_name}.part"));

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| format!("建立下載連線失敗: {e}"))?;

    let checksum_resp = client
        .get(&checksum_url)
        .header("User-Agent", "EggRoll-Updater")
        .send()
        .await
        .map_err(|e| format!("下載 SHA-256 校驗檔失敗: {e}"))?;
    if !checksum_resp.status().is_success() {
        return Err(format!("下載 SHA-256 校驗檔失敗: HTTP {}", checksum_resp.status()));
    }
    let checksum_text = checksum_resp
        .text()
        .await
        .map_err(|e| format!("讀取 SHA-256 校驗檔失敗: {e}"))?;
    let expected_sha256 = parse_sha256_for_asset(&checksum_text, &asset_name)
        .ok_or_else(|| format!("校驗檔中找不到 {asset_name} 的 SHA-256 雜湊值"))?;

    let mut resp = client
        .get(&url)
        .header("User-Agent", "EggRoll-Updater")
        .send()
        .await
        .map_err(|e| format!("下載更新失敗: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("下載更新失敗: HTTP {}", resp.status()));
    }

    let total = resp.content_length();
    let mut file = fs::File::create(&part_path).map_err(|e| format!("建立暫存檔失敗: {e}"))?;
    let mut hasher = Sha256::new();
    let mut downloaded: u64 = 0;
    let mut last_emit: u64 = 0;

    let _ = app.emit(
        "update-download-progress",
        UpdateDownloadProgress {
            downloaded: 0,
            total,
            percent: total.map(|_| 0),
        },
    );

    while let Some(chunk) = resp
        .chunk()
        .await
        .map_err(|e| format!("讀取更新檔案失敗: {e}"))?
    {
        hasher.update(&chunk);
        file.write_all(&chunk)
            .map_err(|e| format!("寫入更新檔案失敗: {e}"))?;
        downloaded += chunk.len() as u64;
        if downloaded - last_emit >= 131_072 {
            last_emit = downloaded;
            let percent = total.and_then(|t| {
                if t > 0 {
                    Some(((downloaded * 100) / t).min(100) as u8)
                } else {
                    None
                }
            });
            let _ = app.emit(
                "update-download-progress",
                UpdateDownloadProgress {
                    downloaded,
                    total,
                    percent,
                },
            );
        }
    }

    file.flush().map_err(|e| format!("刷新更新檔案失敗: {e}"))?;
    drop(file);

    let actual_sha256 = to_hex_lower(&hasher.finalize());
    if actual_sha256 != expected_sha256 {
        let _ = fs::remove_file(&part_path);
        return Err(format!(
            "更新檔 SHA-256 校驗失敗（預期 {}，實際 {}），已中止並刪除可疑檔案",
            &expected_sha256[..12],
            &actual_sha256[..12]
        ));
    }

    if final_path.exists() {
        let _ = fs::remove_file(&final_path);
    }
    fs::rename(&part_path, &final_path).map_err(|e| format!("儲存更新檔案失敗: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&final_path)
            .map_err(|e| format!("讀取檔案權限失敗: {e}"))?
            .permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&final_path, perms)
            .map_err(|e| format!("設定執行權限失敗: {e}"))?;
    }

    let _ = app.emit(
        "update-download-progress",
        UpdateDownloadProgress {
            downloaded,
            total: total.or(Some(downloaded)),
            percent: Some(100),
        },
    );

    Ok(final_path.to_string_lossy().to_string())
}

#[tauri::command]
fn install_app_update(app: tauri::AppHandle, downloaded_path: String) -> Result<(), String> {
    let src = Path::new(&downloaded_path);
    if !src.exists() {
        return Err("找不到已下載的更新檔案，請重新下載".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let name = src
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();

        if name.contains("setup") {
            Command::new("cmd")
                .args(["/C", "start", "", &downloaded_path])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|e| format!("啟動安裝程式失敗: {e}"))?;
        } else {
            let current_exe =
                std::env::current_exe().map_err(|e| format!("無法取得目前執行檔路徑: {e}"))?;
            let dst = current_exe.to_string_lossy().to_string();
            let script = format!(
                "ping 127.0.0.1 -n 2 > nul & move /Y \"{}\" \"{}\" & start \"\" \"{}\"",
                downloaded_path.replace('"', ""),
                dst.replace('"', ""),
                dst.replace('"', "")
            );
            Command::new("cmd")
                .args(["/C", &script])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|e| format!("啟動更新程序失敗: {e}"))?;
        }

        app.exit(0);
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        let target = std::env::var_os("APPIMAGE")
            .map(PathBuf::from)
            .unwrap_or_else(|| std::env::current_exe().unwrap_or_else(|_| src.to_path_buf()));
        let target_str = target.to_string_lossy().to_string();

        Command::new("sh")
            .args([
                "-c",
                "sleep 1; if cp -f \"$1\" \"$2.new\" 2>/dev/null && chmod +x \"$2.new\" && mv -f \"$2.new\" \"$2\"; then rm -f \"$1\"; nohup \"$2\" >/dev/null 2>&1 & else chmod +x \"$1\" && nohup \"$1\" >/dev/null 2>&1 & fi",
                "_",
                &downloaded_path,
                &target_str,
            ])
            .spawn()
            .map_err(|e| format!("啟動更新程序失敗: {e}"))?;

        app.exit(0);
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("目前作業系統不支援自動套用更新，請手動開啟下載檔案".to_string())
}

const KEYRING_SERVICE: &str = "eggroll-endfield";
const KEYRING_USER: &str = "master-key";

#[derive(Debug, Serialize, Deserialize, Default, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct AccountTokens {
    #[serde(skip_serializing_if = "Option::is_none")]
    u8_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    login_token: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct SecretEnvelope {
    v: u8,
    n: String,
    c: String,
}

fn write_owner_only_file(path: &Path, content: &[u8]) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        let mut f = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(path)?;
        f.write_all(content)?;
        f.sync_all()?;
        Ok(())
    }
    #[cfg(not(unix))]
    {
        fs::write(path, content)
    }
}

fn decode_key_32(b64: &str) -> Option<[u8; 32]> {
    let bytes = BASE64.decode(b64.trim()).ok()?;
    if bytes.len() != 32 {
        return None;
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&bytes);
    Some(key)
}

fn get_or_create_master_key(dir: &Path) -> Result<[u8; 32], String> {
    let fallback_path = dir.join(".key");

    // 若先前已建立本機備援金鑰，優先沿用以確保可解密既有 secrets.enc
    if fallback_path.exists() {
        if let Ok(raw) = fs::read_to_string(&fallback_path) {
            if let Some(key) = decode_key_32(&raw) {
                return Ok(key);
            }
        }
    }

    // 優先使用作業系統憑證庫（Windows Credential Manager / Linux Secret Service）
    if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER) {
        if let Ok(existing) = entry.get_password() {
            if let Some(key) = decode_key_32(&existing) {
                return Ok(key);
            }
        }
        let mut new_key = [0u8; 32];
        OsRng.fill_bytes(&mut new_key);
        let b64 = BASE64.encode(new_key);
        if entry.set_password(&b64).is_ok() {
            return Ok(new_key);
        }
    }

    // 備援：無可用系統憑證庫時，以 0600 權限寫入隨機金鑰檔
    let mut new_key = [0u8; 32];
    OsRng.fill_bytes(&mut new_key);
    let b64 = BASE64.encode(new_key);
    write_owner_only_file(&fallback_path, b64.as_bytes())
        .map_err(|e| format!("寫入備援金鑰失敗: {e}"))?;
    Ok(new_key)
}

fn encrypt_secrets(
    key: &[u8; 32],
    tokens: &HashMap<String, AccountTokens>,
) -> Result<String, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("初始化加密器失敗: {e}"))?;
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = serde_json::to_vec(tokens).map_err(|e| format!("序列化憑證失敗: {e}"))?;
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_ref())
        .map_err(|e| format!("加密憑證失敗: {e}"))?;
    let env = SecretEnvelope {
        v: 1,
        n: BASE64.encode(nonce_bytes),
        c: BASE64.encode(ciphertext),
    };
    serde_json::to_string(&env).map_err(|e| format!("封裝密文失敗: {e}"))
}

fn decrypt_secrets(key: &[u8; 32], raw: &str) -> Result<HashMap<String, AccountTokens>, String> {
    let env: SecretEnvelope =
        serde_json::from_str(raw).map_err(|e| format!("解析加密憑證格式失敗: {e}"))?;
    if env.v != 1 {
        return Err(format!("不支援的憑證加密版本: {}", env.v));
    }
    let nonce_bytes = BASE64
        .decode(env.n.trim())
        .map_err(|e| format!("解碼 nonce 失敗: {e}"))?;
    if nonce_bytes.len() != 12 {
        return Err("憑證 nonce 長度錯誤".to_string());
    }
    let ciphertext = BASE64
        .decode(env.c.trim())
        .map_err(|e| format!("解碼密文失敗: {e}"))?;
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("初始化解密器失敗: {e}"))?;
    let plaintext = cipher
        .decrypt(Nonce::from_slice(&nonce_bytes), ciphertext.as_ref())
        .map_err(|_| "解密憑證失敗（金鑰不符或資料已損毀）".to_string())?;
    serde_json::from_slice(&plaintext).map_err(|e| format!("反序列化憑證失敗: {e}"))
}

fn extract_and_strip_tokens(data: &mut serde_json::Value) -> HashMap<String, AccountTokens> {
    let mut map = HashMap::new();
    let Some(accounts) = data.get_mut("accounts").and_then(|v| v.as_array_mut()) else {
        return map;
    };
    for acc in accounts {
        let Some(obj) = acc.as_object_mut() else {
            continue;
        };
        let key = obj
            .get("key")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let u8_token = obj
            .remove("u8Token")
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .filter(|s| !s.is_empty());
        let login_token = obj
            .remove("loginToken")
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .filter(|s| !s.is_empty());
        if !key.is_empty() && (u8_token.is_some() || login_token.is_some()) {
            map.insert(
                key,
                AccountTokens {
                    u8_token,
                    login_token,
                },
            );
        }
    }
    map
}

fn inject_tokens(data: &mut serde_json::Value, tokens: &HashMap<String, AccountTokens>) {
    let Some(accounts) = data.get_mut("accounts").and_then(|v| v.as_array_mut()) else {
        return;
    };
    for acc in accounts {
        let Some(obj) = acc.as_object_mut() else {
            continue;
        };
        let Some(key) = obj.get("key").and_then(|v| v.as_str()).map(|s| s.to_string()) else {
            continue;
        };
        if let Some(tok) = tokens.get(&key) {
            if let Some(u8t) = &tok.u8_token {
                obj.insert("u8Token".to_string(), serde_json::Value::String(u8t.clone()));
            }
            if let Some(lt) = &tok.login_token {
                obj.insert(
                    "loginToken".to_string(),
                    serde_json::Value::String(lt.clone()),
                );
            }
        }
    }
}

fn save_encrypted_tokens(dir: &Path, tokens: &HashMap<String, AccountTokens>) -> Result<(), String> {
    let secrets_path = dir.join("secrets.enc");
    if tokens.is_empty() {
        if secrets_path.exists() {
            let _ = fs::remove_file(&secrets_path);
        }
        return Ok(());
    }
    let key = get_or_create_master_key(dir)?;
    let encrypted = encrypt_secrets(&key, tokens)?;
    let tmp_path = dir.join("secrets.enc.tmp");
    write_owner_only_file(&tmp_path, encrypted.as_bytes())
        .map_err(|e| format!("寫入加密憑證暫存檔失敗: {e}"))?;
    fs::rename(&tmp_path, &secrets_path).map_err(|e| format!("更新加密憑證失敗: {e}"))?;
    Ok(())
}

fn load_encrypted_tokens(dir: &Path) -> HashMap<String, AccountTokens> {
    let secrets_path = dir.join("secrets.enc");
    if !secrets_path.exists() {
        return HashMap::new();
    }
    let Ok(raw) = fs::read_to_string(&secrets_path) else {
        return HashMap::new();
    };
    let Ok(key) = get_or_create_master_key(dir) else {
        return HashMap::new();
    };
    decrypt_secrets(&key, &raw).unwrap_or_default()
}

fn write_store_json_atomic(path: &Path, data: &serde_json::Value) -> Result<(), String> {
    let tmp_path = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(data).map_err(|e| format!("序列化失敗: {e}"))?;
    fs::write(&tmp_path, json).map_err(|e| format!("寫入暫存檔失敗: {e}"))?;
    fs::rename(&tmp_path, path).map_err(|e| format!("更新本機資料失敗: {e}"))?;
    Ok(())
}

#[tauri::command]
fn load_store(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let dir = get_store_dir(&app)?;
    let path = dir.join("store.json");
    let mut migrated_from_legacy = false;
    if !path.exists() {
        if let Ok(legacy_dir) = app.path().app_data_dir() {
            let legacy_path = legacy_dir.join("store.json");
            if legacy_path.exists() {
                if fs::copy(&legacy_path, &path).is_ok() {
                    migrated_from_legacy = true;
                }
            }
        }
    }
    if !path.exists() {
        return Ok(serde_json::json!(null));
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("讀取本機資料失敗: {e}"))?;
    let mut data: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("解析本機資料失敗: {e}"))?;

    let mut tokens = load_encrypted_tokens(&dir);
    let legacy_tokens = extract_and_strip_tokens(&mut data);
    if !legacy_tokens.is_empty() {
        for (k, v) in legacy_tokens {
            let entry = tokens.entry(k).or_default();
            if entry.u8_token.is_none() {
                entry.u8_token = v.u8_token;
            }
            if entry.login_token.is_none() {
                entry.login_token = v.login_token;
            }
        }
        // 遷移至加密檔案並從 store.json 抹除舊版明文憑證
        save_encrypted_tokens(&dir, &tokens)?;
        write_store_json_atomic(&path, &data)?;
    }

    // 若是由舊版 app_data_dir 遷移而來，確保舊路徑不殘留明文 Token
    if migrated_from_legacy {
        if let Ok(legacy_dir) = app.path().app_data_dir() {
            let legacy_path = legacy_dir.join("store.json");
            if legacy_path.exists() {
                let _ = write_store_json_atomic(&legacy_path, &data);
            }
        }
    }

    inject_tokens(&mut data, &tokens);
    Ok(data)
}

#[tauri::command]
fn save_store(app: tauri::AppHandle, mut data: serde_json::Value) -> Result<(), String> {
    let dir = get_store_dir(&app)?;
    let path = dir.join("store.json");
    let tokens = extract_and_strip_tokens(&mut data);
    save_encrypted_tokens(&dir, &tokens)?;
    write_store_json_atomic(&path, &data)
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
            open_login_window,
            http_get_json,
            http_post_json,
            load_store,
            save_store,
            export_json_file,
            export_binary_file,
            check_app_update,
            download_app_update,
            install_app_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_semver_versions_correctly() {
        assert_eq!(compare_semver("0.2.0", "0.1.0"), Ordering::Greater);
        assert_eq!(compare_semver("v1.0.0", "0.9.9"), Ordering::Greater);
        assert_eq!(compare_semver("0.1.0", "0.1.0"), Ordering::Equal);
        assert_eq!(compare_semver("0.1.0", "0.1.1"), Ordering::Less);
    }

    #[test]
    fn selects_expected_release_asset_per_os() {
        let assets = vec![
            GithubAsset {
                name: "EggRoll_0.2.0_amd64.AppImage".to_string(),
                browser_download_url: "https://example.com/appimage".to_string(),
                size: 100,
            },
            GithubAsset {
                name: "EggRoll-0.2.0-windows-x64.exe".to_string(),
                browser_download_url: "https://example.com/win.exe".to_string(),
                size: 200,
            },
        ];
        assert_eq!(
            select_release_asset_for_os(&assets, "linux").map(|a| a.name.as_str()),
            Some("EggRoll_0.2.0_amd64.AppImage")
        );
        assert_eq!(
            select_release_asset_for_os(&assets, "windows").map(|a| a.name.as_str()),
            Some("EggRoll-0.2.0-windows-x64.exe")
        );
    }

    #[test]
    fn encrypt_and_decrypt_secrets_roundtrip() {
        let mut key = [0u8; 32];
        OsRng.fill_bytes(&mut key);
        let mut map = HashMap::new();
        map.insert(
            "global_2_123".to_string(),
            AccountTokens {
                u8_token: Some("u8-secret-abc".to_string()),
                login_token: Some("login-secret-xyz".to_string()),
            },
        );
        let enc = encrypt_secrets(&key, &map).expect("encrypt ok");
        assert!(!enc.contains("u8-secret-abc"));
        assert!(!enc.contains("login-secret-xyz"));
        let dec = decrypt_secrets(&key, &enc).expect("decrypt ok");
        assert_eq!(dec, map);

        let wrong_key = [1u8; 32];
        assert!(decrypt_secrets(&wrong_key, &enc).is_err());
    }

    #[test]
    fn parses_sha256_for_asset_in_both_formats() {
        let h1 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let h2 = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
        let sums = format!("{h1}  EggRoll_0.1.3_amd64.AppImage\n{h2} *EggRoll_0.1.3_x64.exe\n");
        assert_eq!(
            parse_sha256_for_asset(&sums, "EggRoll_0.1.3_x64.exe").as_deref(),
            Some(h2)
        );
        assert_eq!(
            parse_sha256_for_asset(h1, "EggRoll_0.1.3_amd64.AppImage").as_deref(),
            Some(h1)
        );
        assert!(parse_sha256_for_asset(&sums, "other.exe").is_none());
    }

    #[test]
    fn strips_and_restores_tokens_in_store_json() {
        let mut store = serde_json::json!({
            "accounts": [
                {
                    "key": "global_2_123",
                    "nickName": "Tester",
                    "u8Token": "u8-tok",
                    "loginToken": "login-tok"
                }
            ]
        });
        let extracted = extract_and_strip_tokens(&mut store);
        assert_eq!(extracted.len(), 1);
        assert!(store["accounts"][0].get("u8Token").is_none());
        assert!(store["accounts"][0].get("loginToken").is_none());

        inject_tokens(&mut store, &extracted);
        assert_eq!(store["accounts"][0]["u8Token"], "u8-tok");
        assert_eq!(store["accounts"][0]["loginToken"], "login-tok");
    }
}
