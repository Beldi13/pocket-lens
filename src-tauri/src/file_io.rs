use crate::{adb::Adb, engine::Engine, model::*};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    path::{Path, PathBuf},
    process::Stdio,
    sync::Arc,
    time::Duration,
};
use tokio::{
    io::{AsyncBufRead, AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    process::Child,
    sync::watch,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub kind: String,
    pub size: u64,
    pub modified: u64,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryListing {
    pub path: String,
    pub parent: Option<String>,
    pub entries: Vec<FileEntry>,
}
pub fn issue(code: &str) -> AppError {
    AppError::new(code, code)
}
pub fn cancelled(cancel: &watch::Receiver<bool>) -> Result<()> {
    if *cancel.borrow() {
        Err(issue("file_cancelled"))
    } else {
        Ok(())
    }
}
pub async fn guarded<T>(
    cancel: &watch::Receiver<bool>,
    future: impl std::future::Future<Output = Result<T>>,
) -> Result<T> {
    cancelled(cancel)?;
    let mut stop = cancel.clone();
    tokio::select! {
        result = tokio::time::timeout(Duration::from_secs(60), future) => result.map_err(|_| issue("file_stalled"))?,
        _ = async { while !*stop.borrow_and_update() { if stop.changed().await.is_err() { std::future::pending::<()>().await; } } } => Err(issue("file_cancelled")),
    }
}
pub async fn read_json(reader: &mut (impl AsyncBufRead + Unpin)) -> Result<Value> {
    let mut bytes = Vec::new();
    loop {
        let buf = reader.fill_buf().await?;
        if buf.is_empty() {
            return Err(issue("file_incomplete"));
        }
        let end = buf.iter().position(|b| *b == b'\n');
        let count = end.map_or(buf.len(), |n| n + 1);
        if bytes.len() + count > 16 * 1024 * 1024 {
            return Err(issue("file_too_many"));
        }
        bytes.extend_from_slice(&buf[..count]);
        reader.consume(count);
        if end.is_some() {
            break;
        }
    }
    let value: Value = serde_json::from_slice(&bytes).map_err(|_| issue("file_protocol"))?;
    if value["ok"] != true {
        return Err(issue(
            value["code"]
                .as_str()
                .filter(|v| v.starts_with("file_"))
                .unwrap_or("file_io"),
        ));
    }
    Ok(value)
}
pub fn valid_name(name: &str, windows: bool) -> Result<()> {
    if name.is_empty()
        || [".", ".."].contains(&name)
        || name.contains(['/', '\0'])
        || name.len() > 255
    {
        return Err(issue("file_name"));
    }
    if windows {
        let stem = name.split('.').next().unwrap_or("").to_uppercase();
        if name.ends_with([' ', '.'])
            || name
                .chars()
                .any(|c| c.is_control() || "<>:\"\\|?*".contains(c))
            || ["CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$"].contains(&stem.as_str())
            || (stem.len() == 4
                && (stem.starts_with("COM") || stem.starts_with("LPT"))
                && stem.as_bytes()[3].is_ascii_digit())
        {
            return Err(issue("file_name"));
        }
    }
    Ok(())
}
fn is_link(meta: &std::fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        meta.file_type().is_symlink() || meta.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        meta.file_type().is_symlink()
    }
}
pub fn local_path(path: &str, mutation: bool) -> Result<PathBuf> {
    let path = PathBuf::from(path);
    if !path.is_absolute()
        || path.components().any(|p| {
            matches!(
                p,
                std::path::Component::ParentDir | std::path::Component::CurDir
            )
        })
    {
        return Err(issue("file_path"));
    }
    for part in path.ancestors() {
        match std::fs::symlink_metadata(part) {
            Ok(meta) if is_link(&meta) => return Err(issue("file_link")),
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.into()),
        }
    }
    if mutation && path.parent().is_none() {
        return Err(issue("file_root"));
    }
    Ok(path)
}
fn local_entry(path: &Path) -> Result<FileEntry> {
    let meta = std::fs::symlink_metadata(path)?;
    Ok(FileEntry {
        name: path
            .file_name()
            .unwrap_or(path.as_os_str())
            .to_string_lossy()
            .into(),
        path: path.to_string_lossy().into(),
        kind: if is_link(&meta) {
            "link"
        } else if meta.is_dir() {
            "directory"
        } else if meta.is_file() {
            "file"
        } else {
            "other"
        }
        .into(),
        size: if meta.is_file() { meta.len() } else { 0 },
        modified: meta
            .modified()
            .ok()
            .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
            .map_or(0, |d| d.as_millis() as u64),
    })
}
pub struct Remote {
    adb: Adb,
    serial: String,
    identity: Option<String>,
    jar: String,
}
impl Remote {
    pub async fn connect(engine: &Engine, id: &str, confirmed: Option<String>) -> Result<Self> {
        let device = engine.verified_target(id, confirmed).await?;
        let jar = format!(
            "/data/local/tmp/pocket-lens-files-{}.jar",
            uuid::Uuid::new_v4()
        );
        let adb = engine.adb.clone();
        let helper = adb.directory.join("pocket-lens-files.jar");
        if let Err(error) = adb
            .run(&[
                "-s",
                &device.serial,
                "push",
                &helper.to_string_lossy(),
                &jar,
            ])
            .await
        {
            let _ = adb
                .run(&["-s", &device.serial, "shell", "rm", "-f", &jar])
                .await;
            return Err(error);
        }
        Ok(Self {
            adb,
            serial: device.serial,
            identity: device.identity,
            jar,
        })
    }
    pub async fn cleanup(&self) {
        let _ = self
            .adb
            .run(&["-s", &self.serial, "shell", "rm", "-f", &self.jar])
            .await;
    }
    async fn verify(&self) -> Result<()> {
        let fresh = self.adb.device(&self.serial).await?;
        if fresh.identity != self.identity {
            return Err(issue("identity_mismatch"));
        }
        Ok(())
    }
    pub async fn spawn(&self, request: &Value) -> Result<Child> {
        self.verify().await?;
        let mut cmd = self.adb.command("adb.exe");
        cmd.args([
            "-s",
            &self.serial,
            "exec-out",
            "env",
            &format!("CLASSPATH={}", self.jar),
            "app_process",
            "/",
            "dev.beldi.pocketlens.Files",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
        let mut child = cmd.spawn()?;
        let mut bytes = serde_json::to_vec(request).map_err(|_| issue("file_protocol"))?;
        bytes.push(b'\n');
        child
            .stdin
            .as_mut()
            .ok_or_else(|| issue("file_protocol"))?
            .write_all(&bytes)
            .await?;
        Ok(child)
    }
    async fn rpc(&self, request: Value, cancel: &watch::Receiver<bool>) -> Result<Value> {
        guarded(cancel, async {
            let mut child = self.spawn(&request).await?;
            child.stdin.take();
            let mut reader =
                BufReader::new(child.stdout.take().ok_or_else(|| issue("file_protocol"))?);
            let reply = read_json(&mut reader).await?;
            if !child.wait().await?.success() {
                return Err(issue("file_io"));
            }
            Ok(reply)
        })
        .await
    }
}
#[derive(Clone)]
pub enum FileSystem {
    Local,
    Phone(Arc<Remote>),
}
impl FileSystem {
    pub fn join(&self, parent: &str, name: &str) -> Result<String> {
        valid_name(name, matches!(self, Self::Local))?;
        Ok(match self {
            Self::Local => local_path(parent, false)?
                .join(name)
                .to_string_lossy()
                .into(),
            Self::Phone(_) => format!("{}/{}", parent.trim_end_matches('/'), name),
        })
    }
    pub async fn stat(
        &self,
        path: &str,
        cancel: &watch::Receiver<bool>,
    ) -> Result<Option<FileEntry>> {
        cancelled(cancel)?;
        match self {
            Self::Local => {
                let p = local_path(path, false)?;
                match local_entry(&p) {
                    Ok(v) => Ok(Some(v)),
                    Err(_) if !p.exists() => Ok(None),
                    Err(e) => Err(e),
                }
            }
            Self::Phone(remote) => {
                let reply = remote
                    .rpc(json!({"action":"stat","path":path}), cancel)
                    .await?;
                serde_json::from_value(reply["entry"].clone()).map_err(|_| issue("file_protocol"))
            }
        }
    }
    pub async fn list(
        &self,
        path: &str,
        cancel: &watch::Receiver<bool>,
    ) -> Result<DirectoryListing> {
        cancelled(cancel)?;
        match self {
            Self::Local if path.is_empty() => {
                let entries = ('A'..='Z')
                    .map(|c| PathBuf::from(format!("{c}:\\")))
                    .filter(|p| p.exists())
                    .map(|p| local_entry(&p))
                    .collect::<Result<_>>()?;
                Ok(DirectoryListing {
                    path: "".into(),
                    parent: None,
                    entries,
                })
            }
            Self::Local => {
                let root = local_path(path, false)?;
                let entries = std::fs::read_dir(&root)?
                    .map(|e| {
                        e.map_err(AppError::from)
                            .and_then(|e| local_entry(&e.path()))
                    })
                    .collect::<Result<Vec<_>>>()?;
                Ok(DirectoryListing {
                    path: root.to_string_lossy().into(),
                    parent: Some(
                        root.parent()
                            .map(|p| p.to_string_lossy().into())
                            .unwrap_or_default(),
                    ),
                    entries,
                })
            }
            Self::Phone(remote) => {
                let reply = remote
                    .rpc(json!({"action":"list","path":path}), cancel)
                    .await?;
                let entries = serde_json::from_value(reply["entries"].clone())
                    .map_err(|_| issue("file_protocol"))?;
                let path = path.trim_end_matches('/').to_string();
                let parent = if path == "/sdcard" {
                    None
                } else {
                    path.rsplit_once('/').map(|(p, _)| p.to_string())
                };
                Ok(DirectoryListing {
                    path,
                    parent,
                    entries,
                })
            }
        }
    }
    pub async fn mkdir(&self, path: &str, cancel: &watch::Receiver<bool>) -> Result<()> {
        cancelled(cancel)?;
        match self {
            Self::Local => {
                std::fs::create_dir(local_path(path, true)?)?;
            }
            Self::Phone(r) => {
                r.rpc(json!({"action":"mkdir","path":path}), cancel).await?;
            }
        };
        Ok(())
    }
    pub async fn rename(
        &self,
        source: &str,
        target: &str,
        replace: bool,
        cancel: &watch::Receiver<bool>,
    ) -> Result<()> {
        cancelled(cancel)?;
        if !replace && self.stat(target, cancel).await?.is_some() {
            return Err(issue("file_exists"));
        }
        match self {
            Self::Local => {
                std::fs::rename(local_path(source, true)?, local_path(target, true)?)?;
            }
            Self::Phone(r) => {
                r.rpc(
                    json!({"action":"rename","path":source,"target":target,"replace":replace}),
                    cancel,
                )
                .await?;
            }
        };
        Ok(())
    }
    pub async fn remove_one(&self, path: &str, cancel: &watch::Receiver<bool>) -> Result<()> {
        cancelled(cancel)?;
        match self {
            Self::Local => {
                let p = local_path(path, true)?;
                if p.is_dir() {
                    std::fs::remove_dir(p)?;
                } else {
                    std::fs::remove_file(p)?;
                }
            }
            Self::Phone(r) => {
                r.rpc(json!({"action":"delete","path":path}), cancel)
                    .await?;
            }
        };
        Ok(())
    }
    pub async fn hash(&self, path: &str, cancel: &watch::Receiver<bool>) -> Result<String> {
        match self {
            Self::Local => {
                let mut f = tokio::fs::File::open(local_path(path, false)?).await?;
                let mut digest = Sha256::new();
                let mut buf = vec![0; 65536];
                loop {
                    let n = guarded(cancel, async { Ok(f.read(&mut buf).await?) }).await?;
                    if n == 0 {
                        break;
                    }
                    digest.update(&buf[..n]);
                }
                Ok(format!("{:x}", digest.finalize()))
            }
            Self::Phone(r) => r.rpc(json!({"action":"hash","path":path}), cancel).await?["hash"]
                .as_str()
                .map(str::to_string)
                .ok_or_else(|| issue("file_protocol")),
        }
    }
    /// Streams a file to a new temporary destination; caller verifies and commits the name.
    pub async fn stream_to(
        &self,
        source: &str,
        destination: &Self,
        stage: &str,
        expected: u64,
        cancel: &watch::Receiver<bool>,
        progress: impl Fn(u64),
    ) -> Result<String> {
        enum Reader {
            Local(tokio::fs::File),
            Remote(Child, BufReader<tokio::process::ChildStdout>),
        }
        enum Writer {
            Local(tokio::fs::File),
            Remote(Child, BufReader<tokio::process::ChildStdout>),
        }
        let mut input = match self {
            Self::Local => Reader::Local(tokio::fs::File::open(local_path(source, false)?).await?),
            Self::Phone(r) => {
                let mut child = r.spawn(&json!({"action":"get","path":source})).await?;
                child.stdin.take();
                let mut stdout =
                    BufReader::new(child.stdout.take().ok_or_else(|| issue("file_protocol"))?);
                let header = guarded(cancel, read_json(&mut stdout)).await?;
                if header["size"].as_u64() != Some(expected) {
                    return Err(issue("file_changed"));
                }
                Reader::Remote(child, stdout)
            }
        };
        let mut output = match destination {
            Self::Local => Writer::Local(
                tokio::fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(local_path(stage, true)?)
                    .await?,
            ),
            Self::Phone(r) => {
                let mut child = r
                    .spawn(&json!({"action":"put","path":stage,"size":expected}))
                    .await?;
                let mut stdout =
                    BufReader::new(child.stdout.take().ok_or_else(|| issue("file_protocol"))?);
                guarded(cancel, read_json(&mut stdout)).await?;
                Writer::Remote(child, stdout)
            }
        };
        let mut remaining = expected;
        let mut buffer = vec![0; 65536];
        let mut digest = Sha256::new();
        while remaining > 0 {
            let amount = remaining.min(buffer.len() as u64) as usize;
            let n = guarded(cancel, async {
                Ok(match &mut input {
                    Reader::Local(f) => f.read(&mut buffer[..amount]).await?,
                    Reader::Remote(_, r) => r.read(&mut buffer[..amount]).await?,
                })
            })
            .await?;
            if n == 0 {
                return Err(issue("file_changed"));
            }
            guarded(cancel, async {
                match &mut output {
                    Writer::Local(f) => f.write_all(&buffer[..n]).await?,
                    Writer::Remote(c, _) => {
                        c.stdin
                            .as_mut()
                            .ok_or_else(|| issue("file_protocol"))?
                            .write_all(&buffer[..n])
                            .await?
                    }
                };
                Ok(())
            })
            .await?;
            digest.update(&buffer[..n]);
            remaining -= n as u64;
            progress(n as u64);
        }
        let hash = format!("{:x}", digest.finalize());
        match &mut input {
            Reader::Remote(c, r) => {
                let result = guarded(cancel, read_json(r)).await?;
                if result["hash"] != hash
                    || !guarded(cancel, async { Ok(c.wait().await?) })
                        .await?
                        .success()
                {
                    return Err(issue("file_changed"));
                }
            }
            Reader::Local(f) => {
                let mut extra = [0];
                if f.read(&mut extra).await? != 0 {
                    return Err(issue("file_changed"));
                }
            }
        }
        match &mut output {
            Writer::Local(f) => {
                f.sync_all().await?;
            }
            Writer::Remote(c, r) => {
                c.stdin.take();
                let result = guarded(cancel, read_json(r)).await?;
                if result["hash"] != hash
                    || result["size"].as_u64() != Some(expected)
                    || !guarded(cancel, async { Ok(c.wait().await?) })
                        .await?
                        .success()
                {
                    return Err(issue("file_checksum"));
                }
            }
        }
        Ok(hash)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn names_cannot_escape_or_become_windows_devices() {
        for name in [
            "..", "a/b", "CON", "nul.txt", "a:b", "trail.", "LPT1.txt", "a\nb",
        ] {
            assert!(valid_name(name, true).is_err(), "{name}");
        }
        assert!(valid_name("foto Ñ_日本.jpg", true).is_ok());
        assert!(valid_name("quote'$(test).txt", true).is_ok());
    }
    #[tokio::test]
    async fn local_stream_verifies_content_and_rejects_cancelled_operations() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source.txt");
        let stage = temp.path().join(".pocket-lens-test.part");
        std::fs::write(&source, b"hello world").unwrap();
        let (tx, cancel) = watch::channel(false);
        let hash = FileSystem::Local
            .stream_to(
                &source.to_string_lossy(),
                &FileSystem::Local,
                &stage.to_string_lossy(),
                11,
                &cancel,
                |_| {},
            )
            .await
            .unwrap();
        assert_eq!(
            hash,
            FileSystem::Local
                .hash(&stage.to_string_lossy(), &cancel)
                .await
                .unwrap()
        );
        tx.send(true).unwrap();
        assert_eq!(
            FileSystem::Local
                .list(&temp.path().to_string_lossy(), &cancel)
                .await
                .unwrap_err()
                .code,
            "file_cancelled"
        );
    }
}
