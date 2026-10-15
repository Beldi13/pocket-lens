use crate::{file_io::issue, model::*};
use serde::Serialize;
use std::sync::Mutex;
use tauri::Emitter;
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub state: String,
    pub version: Option<String>,
    pub notes: String,
    pub downloaded: u64,
    pub total: Option<u64>,
    pub error: Option<AppError>,
}
pub struct Updates {
    status: Mutex<UpdateStatus>,
    update: Mutex<Option<Update>>,
    bytes: Mutex<Option<Vec<u8>>>,
    gate: tokio::sync::Mutex<()>,
}
impl Default for Updates {
    fn default() -> Self {
        Self {
            status: Mutex::new(UpdateStatus {
                state: "idle".into(),
                ..Default::default()
            }),
            update: Mutex::default(),
            bytes: Mutex::default(),
            gate: tokio::sync::Mutex::new(()),
        }
    }
}
impl Updates {
    pub fn status(&self) -> UpdateStatus {
        self.status.lock().unwrap().clone()
    }
    fn change(&self, app: &tauri::AppHandle, change: impl FnOnce(&mut UpdateStatus)) {
        let next = {
            let mut status = self.status.lock().unwrap();
            change(&mut status);
            status.clone()
        };
        let _ = app.emit("updater://changed", next);
    }
    pub async fn check(&self, app: &tauri::AppHandle) -> Result<UpdateStatus> {
        let _gate = self.gate.try_lock().map_err(|_| issue("update_busy"))?;
        if ["downloaded", "installing"].contains(&self.status().state.as_str()) {
            return Ok(self.status());
        }
        self.change(app, |s| {
            s.state = "checking".into();
            s.error = None;
        });
        let result: Result<Option<()>> = async {
            let updater = app
                .updater_builder()
                .timeout(std::time::Duration::from_secs(20))
                .build()
                .map_err(|_| issue("update_network"))?;
            let update = updater.check().await.map_err(|error| {
                let text = error.to_string();
                if text.contains("404") {
                    issue("update_no_stable")
                } else {
                    issue("update_network")
                }
            })?;
            if let Some(update) = update {
                if !stable_newer(&app.package_info().version.to_string(), &update.version) {
                    return Ok(None);
                }
                self.change(app, |s| {
                    s.version = Some(update.version.clone());
                    s.notes = update.body.clone().unwrap_or_default();
                    s.state = "available".into();
                    s.downloaded = 0;
                    s.total = None;
                });
                *self.update.lock().unwrap() = Some(update);
                Ok(Some(()))
            } else {
                Ok(None)
            }
        }
        .await;
        match result {
            Ok(Some(())) => {}
            Ok(None) => {
                *self.update.lock().unwrap() = None;
                self.change(app, |s| {
                    s.state = "current".into();
                    s.version = None;
                    s.notes.clear();
                });
            }
            Err(error) if error.code == "update_no_stable" => self.change(app, |s| {
                s.state = "noStable".into();
                s.version = None;
                s.notes.clear();
            }),
            Err(error) => {
                self.change(app, |s| {
                    s.state = "error".into();
                    s.error = Some(error.clone());
                });
                return Err(error);
            }
        }
        Ok(self.status())
    }
    pub async fn download(&self, app: &tauri::AppHandle) -> Result<UpdateStatus> {
        let _gate = self.gate.try_lock().map_err(|_| issue("update_busy"))?;
        let update = self
            .update
            .lock()
            .unwrap()
            .clone()
            .ok_or_else(|| issue("update_missing"))?;
        if self.status().state == "downloaded" {
            return Ok(self.status());
        }
        self.change(app, |s| {
            s.state = "downloading".into();
            s.error = None;
            s.downloaded = 0;
        });
        let result = update
            .download(
                |length, total| {
                    self.change(app, |s| {
                        s.downloaded += length as u64;
                        s.total = total;
                    })
                },
                || {},
            )
            .await;
        match result {
            Ok(bytes) => {
                *self.bytes.lock().unwrap() = Some(bytes);
                self.change(app, |s| s.state = "downloaded".into());
                Ok(self.status())
            }
            Err(cause) => {
                *self.bytes.lock().unwrap() = None;
                let text = cause.to_string().to_lowercase();
                let error = issue(if text.contains("version") {
                    "update_version"
                } else if text.contains("signature") || text.contains("minisign") {
                    "update_signature"
                } else {
                    "update_download"
                });
                self.change(app, |s| {
                    s.state = "available".into();
                    s.error = Some(error.clone());
                });
                Err(error)
            }
        }
    }
    pub fn install(&self, app: &tauri::AppHandle) -> Result<()> {
        let _gate = self.gate.try_lock().map_err(|_| issue("update_busy"))?;
        let update = self
            .update
            .lock()
            .unwrap()
            .clone()
            .ok_or_else(|| issue("update_missing"))?;
        let bytes = self
            .bytes
            .lock()
            .unwrap()
            .take()
            .ok_or_else(|| issue("update_missing"))?;
        self.change(app, |s| s.state = "installing".into());
        update.install(bytes).map_err(|_| {
            let error = issue("update_install");
            self.change(app, |s| {
                s.state = "available".into();
                s.error = Some(error.clone());
            });
            error
        })
    }
}
pub fn stable_newer(current: &str, candidate: &str) -> bool {
    match (
        semver::Version::parse(current),
        semver::Version::parse(candidate),
    ) {
        (Ok(a), Ok(b)) => b.pre.is_empty() && b > a,
        _ => false,
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_newer_stable_versions_are_offered() {
        assert!(stable_newer("0.3.0", "0.3.1"));
        for version in ["0.2.0", "0.3.0", "0.4.0-beta.1", "invalid"] {
            assert!(!stable_newer("0.3.0", version));
        }
    }
}
