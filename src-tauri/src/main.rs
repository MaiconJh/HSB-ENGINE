#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;
use tauri::State;

const STORE_CAP: usize = 1000;

#[derive(Debug, Deserialize)]
struct IpcMeta {
    source: String,
}

#[derive(Debug, Deserialize)]
struct IpcRequest {
    id: String,
    cmd: String,
    payload: Value,
    meta: IpcMeta,
}

#[derive(Debug, Serialize)]
struct IpcError {
    code: String,
    message: String,
}

#[derive(Debug, Serialize)]
struct IpcResponse {
    id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<IpcError>,
}

struct HostStore {
    map: HashMap<String, String>,
    order: VecDeque<String>,
    cap: usize,
}

impl HostStore {
    fn new(cap: usize) -> Self {
        Self {
            map: HashMap::new(),
            order: VecDeque::new(),
            cap,
        }
    }

    fn get(&self, key: &str) -> Option<String> {
        self.map.get(key).cloned()
    }

    fn set(&mut self, key: String, value: String) {
        let is_new = !self.map.contains_key(&key);
        if is_new && self.map.len() >= self.cap {
            while let Some(oldest) = self.order.pop_front() {
                if self.map.remove(&oldest).is_some() {
                    break;
                }
            }
        }
        if is_new {
            self.order.push_back(key.clone());
        }
        self.map.insert(key, value);
    }
}

struct HostState {
    store: Mutex<HostStore>,
}

impl HostState {
    fn new() -> Self {
        Self {
            store: Mutex::new(HostStore::new(STORE_CAP)),
        }
    }
}

#[tauri::command]
fn hsb_ipc(request: IpcRequest, state: State<'_, HostState>) -> IpcResponse {
    if request.id.trim().is_empty()
        || request.cmd.trim().is_empty()
        || request.meta.source.trim().is_empty()
    {
        return invalid_request(&request.id, "missing required fields");
    }

    match request.cmd.as_str() {
        "host.fs.exists" => handle_fs_exists(&request, &state),
        "host.fs.readTextFile" => handle_fs_read_text(&request),
        "host.fs.listDir" => handle_fs_list_dir(&request),
        "host.store.get" => handle_store_get(&request, &state),
        "host.store.set" => handle_store_set(&request, &state),
        _ => unsupported(&request.id, "unsupported command"),
    }
}

fn handle_fs_exists(request: &IpcRequest, _state: &State<'_, HostState>) -> IpcResponse {
    let path = match get_payload_str(&request.payload, "path") {
        Ok(value) => value,
        Err(message) => return invalid_request(&request.id, &message),
    };
    let exists = match std::fs::metadata(&path) {
        Ok(_) => true,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => false,
        Err(_) => return fs_error(&request.id, "fs error"),
    };
    ok_response(&request.id, json!({ "exists": exists }))
}

fn handle_fs_read_text(request: &IpcRequest) -> IpcResponse {
    let path = match get_payload_str(&request.payload, "path") {
        Ok(value) => value,
        Err(message) => return invalid_request(&request.id, &message),
    };
    match std::fs::read_to_string(&path) {
        Ok(text) => ok_response(&request.id, json!({ "text": text })),
        Err(_) => fs_error(&request.id, "fs error"),
    }
}

fn handle_fs_list_dir(request: &IpcRequest) -> IpcResponse {
    let path = match get_payload_str(&request.payload, "path") {
        Ok(value) => value,
        Err(message) => return invalid_request(&request.id, &message),
    };
    let mut entries = Vec::new();
    let read_dir = match std::fs::read_dir(&path) {
        Ok(handle) => handle,
        Err(_) => return fs_error(&request.id, "fs error"),
    };
    for entry in read_dir {
        if let Ok(entry) = entry {
            let name = entry.file_name();
            entries.push(name.to_string_lossy().to_string());
        }
    }
    entries.sort();
    ok_response(&request.id, json!({ "entries": entries }))
}

fn handle_store_get(request: &IpcRequest, state: &State<'_, HostState>) -> IpcResponse {
    let key = match get_payload_str(&request.payload, "key") {
        Ok(value) => value,
        Err(message) => return invalid_request(&request.id, &message),
    };
    let store = match state.store.lock() {
        Ok(store) => store,
        Err(_) => return invalid_request(&request.id, "store unavailable"),
    };
    let value = store.get(&key);
    ok_response(&request.id, json!({ "value": value }))
}

fn handle_store_set(request: &IpcRequest, state: &State<'_, HostState>) -> IpcResponse {
    let key = match get_payload_str(&request.payload, "key") {
        Ok(value) => value,
        Err(message) => return invalid_request(&request.id, &message),
    };
    let value = match get_payload_str(&request.payload, "value") {
        Ok(value) => value,
        Err(message) => return invalid_request(&request.id, &message),
    };
    let mut store = match state.store.lock() {
        Ok(store) => store,
        Err(_) => return invalid_request(&request.id, "store unavailable"),
    };
    store.set(key, value);
    ok_response(&request.id, json!({ "ok": true }))
}

fn get_payload_str(payload: &Value, key: &str) -> Result<String, String> {
    payload
        .get(key)
        .and_then(Value::as_str)
        .map(|value| value.to_string())
        .ok_or_else(|| format!("missing or invalid field: {}", key))
}

fn invalid_request(id: &str, message: &str) -> IpcResponse {
    IpcResponse {
        id: id.to_string(),
        ok: false,
        data: None,
        error: Some(IpcError {
            code: "INVALID_REQUEST".to_string(),
            message: message.to_string(),
        }),
    }
}

fn fs_error(id: &str, message: &str) -> IpcResponse {
    IpcResponse {
        id: id.to_string(),
        ok: false,
        data: None,
        error: Some(IpcError {
            code: "FS_ERROR".to_string(),
            message: message.to_string(),
        }),
    }
}

fn unsupported(id: &str, message: &str) -> IpcResponse {
    IpcResponse {
        id: id.to_string(),
        ok: false,
        data: None,
        error: Some(IpcError {
            code: "UNSUPPORTED".to_string(),
            message: message.to_string(),
        }),
    }
}

fn ok_response(id: &str, data: Value) -> IpcResponse {
    IpcResponse {
        id: id.to_string(),
        ok: true,
        data: Some(data),
        error: None,
    }
}

fn main() {
    tauri::Builder::default()
        .manage(HostState::new())
        .invoke_handler(tauri::generate_handler![hsb_ipc])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn store_eviction_is_deterministic() {
        let mut store = HostStore::new(2);
        store.set("a".to_string(), "1".to_string());
        store.set("b".to_string(), "2".to_string());
        store.set("c".to_string(), "3".to_string());
        assert!(store.get("a").is_none());
        assert_eq!(store.get("b"), Some("2".to_string()));
        assert_eq!(store.get("c"), Some("3".to_string()));
    }

    #[test]
    fn list_dir_sorting_is_deterministic() {
        let mut entries = vec!["beta".to_string(), "alpha".to_string()];
        entries.sort();
        assert_eq!(entries, vec!["alpha".to_string(), "beta".to_string()]);
    }
}
