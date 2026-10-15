use crate::{engine::Engine, file_io::*, model::*};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Instant,
};
use tauri::Emitter;
use tokio::sync::{Mutex as AsyncMutex, oneshot, watch};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileRequest {
    pub profile_id: String,
    pub operation: String,
    pub source_side: String,
    pub paths: Vec<String>,
    pub target_side: String,
    pub target_directory: String,
    pub confirmed_serial: Option<String>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileConflict {
    pub source: String,
    pub target: String,
    pub kind: String,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileJob {
    pub id: String,
    pub profile_id: String,
    pub operation: String,
    pub state: String,
    pub bytes_done: u64,
    pub bytes_total: u64,
    pub files_done: u64,
    pub files_total: u64,
    pub current: String,
    pub skipped: u64,
    pub conflict: Option<FileConflict>,
    pub error: Option<AppError>,
    pub created: i64,
}
struct Decision {
    choice: String,
    all: bool,
}
struct Job {
    status: Mutex<FileJob>,
    cancel: watch::Sender<bool>,
    decision: Mutex<Option<oneshot::Sender<Decision>>>,
    choices: Mutex<HashMap<String, String>>,
    last_emit: Mutex<Instant>,
}
pub struct FileManager {
    engine: Arc<Engine>,
    app: Option<tauri::AppHandle>,
    jobs: Mutex<HashMap<String, Arc<Job>>>,
    gates: Mutex<HashMap<String, Arc<AsyncMutex<()>>>>,
    blocked: AtomicBool,
    local_default: String,
}
struct Context {
    local: FileSystem,
    phone: Option<Arc<Remote>>,
}
impl Context {
    fn fs(&self, side: &str) -> Result<FileSystem> {
        match side {
            "local" => Ok(self.local.clone()),
            "phone" => self
                .phone
                .as_ref()
                .map(|r| FileSystem::Phone(r.clone()))
                .ok_or_else(|| issue("file_connection")),
            _ => Err(issue("file_side")),
        }
    }
    async fn cleanup(&self) {
        if let Some(r) = &self.phone {
            r.cleanup().await;
        }
    }
}
#[derive(Clone)]
struct Node {
    entry: FileEntry,
    parent: Option<String>,
}
impl FileManager {
    pub fn new(engine: Arc<Engine>, app: Option<tauri::AppHandle>, local_default: String) -> Self {
        Self {
            engine,
            app,
            jobs: Mutex::default(),
            gates: Mutex::default(),
            blocked: AtomicBool::new(false),
            local_default,
        }
    }
    fn gate(&self, id: &str) -> Arc<AsyncMutex<()>> {
        self.gates
            .lock()
            .unwrap()
            .entry(id.into())
            .or_insert_with(|| Arc::new(AsyncMutex::new(())))
            .clone()
    }
    pub fn has_active(&self, id: Option<&str>) -> bool {
        self.jobs.lock().unwrap().values().any(|j| {
            let s = j.status.lock().unwrap();
            id.is_none_or(|id| s.profile_id == id)
                && !["completed", "cancelled", "error"].contains(&s.state.as_str())
        })
    }
    pub fn jobs(&self) -> Vec<FileJob> {
        let mut jobs: Vec<_> = self
            .jobs
            .lock()
            .unwrap()
            .values()
            .map(|j| j.status.lock().unwrap().clone())
            .collect();
        jobs.sort_by_key(|j| j.created);
        jobs
    }
    fn ready(&self) -> Result<()> {
        if self.blocked.load(Ordering::SeqCst) {
            Err(issue("app_closing"))
        } else {
            Ok(())
        }
    }
    pub fn defaults(&self, id: &str) -> (String, String) {
        let p = self.engine.settings().preferences.file_directories;
        (
            p.get(&format!("{id}:local"))
                .cloned()
                .unwrap_or_else(|| self.local_default.clone()),
            p.get(&format!("{id}:phone"))
                .cloned()
                .unwrap_or_else(|| "/sdcard/Download".into()),
        )
    }
    async fn context(&self, id: &str, phone: bool, confirmed: Option<String>) -> Result<Context> {
        if !self.engine.settings().profiles.iter().any(|p| p.id == id) {
            return Err(issue("not_found"));
        }
        Ok(Context {
            local: FileSystem::Local,
            phone: if phone {
                Some(Arc::new(
                    Remote::connect(&self.engine, id, confirmed).await?,
                ))
            } else {
                None
            },
        })
    }
    pub async fn list(
        &self,
        id: &str,
        side: &str,
        path: &str,
        confirmed: Option<String>,
    ) -> Result<DirectoryListing> {
        self.ready()?;
        let context = self.context(id, side == "phone", confirmed).await?;
        let (_tx, cancel) = watch::channel(false);
        let result = context.fs(side)?.list(path, &cancel).await;
        context.cleanup().await;
        if result.is_ok() {
            let _ = self.engine.remember_directory(id, side, path);
        }
        result
    }
    pub async fn edit(
        &self,
        id: &str,
        side: &str,
        directory: &str,
        name: &str,
        source: Option<String>,
        confirmed: Option<String>,
    ) -> Result<()> {
        self.ready()?;
        let gate = self.gate(id);
        let _guard = gate.try_lock().map_err(|_| issue("file_busy"))?;
        let context = self.context(id, side == "phone", confirmed).await?;
        let (_tx, cancel) = watch::channel(false);
        let result =
            async {
                let fs = context.fs(side)?;
                let target = fs.join(directory, name)?;
                if let Some(source) = source {
                    let listing = fs.list(directory, &cancel).await?;
                    if !listing.entries.iter().any(|e| {
                        e.path == source && ["directory", "file"].contains(&e.kind.as_str())
                    }) {
                        return Err(issue("file_path"));
                    }
                    fs.rename(&source, &target, false, &cancel).await
                } else {
                    fs.mkdir(&target, &cancel).await
                }
            }
            .await;
        context.cleanup().await;
        if result.is_ok() {
            self.changed(id);
        }
        result
    }
    fn changed(&self, id: &str) {
        if let Some(app) = &self.app {
            let _ = app.emit("files://changed", id);
        }
    }
    fn update(&self, job: &Arc<Job>, change: impl FnOnce(&mut FileJob), force: bool) {
        let status = {
            let mut status = job.status.lock().unwrap();
            change(&mut status);
            status.clone()
        };
        let mut last = job.last_emit.lock().unwrap();
        if force || last.elapsed().as_millis() > 120 {
            if let Some(app) = &self.app {
                let _ = app.emit("transfer://changed", status);
            }
            *last = Instant::now();
        }
    }
    pub fn enqueue(self: &Arc<Self>, request: FileRequest) -> Result<FileJob> {
        self.ready()?;
        if !["copy", "move", "delete"].contains(&request.operation.as_str())
            || !["local", "phone"].contains(&request.source_side.as_str())
            || !["local", "phone"].contains(&request.target_side.as_str())
            || request.paths.is_empty()
            || request.paths.len() > 10000
        {
            return Err(issue("file_request"));
        }
        if !self
            .engine
            .settings()
            .profiles
            .iter()
            .any(|p| p.id == request.profile_id)
        {
            return Err(issue("not_found"));
        }
        let status = FileJob {
            id: uuid::Uuid::new_v4().to_string(),
            profile_id: request.profile_id.clone(),
            operation: request.operation.clone(),
            state: "queued".into(),
            bytes_done: 0,
            bytes_total: 0,
            files_done: 0,
            files_total: 0,
            current: "".into(),
            skipped: 0,
            conflict: None,
            error: None,
            created: chrono::Utc::now().timestamp_millis(),
        };
        let (cancel, _) = watch::channel(false);
        let job = Arc::new(Job {
            status: Mutex::new(status.clone()),
            cancel,
            decision: Mutex::default(),
            choices: Mutex::default(),
            last_emit: Mutex::new(Instant::now()),
        });
        self.jobs
            .lock()
            .unwrap()
            .insert(status.id.clone(), job.clone());
        self.update(&job, |_| {}, true);
        let manager = self.clone();
        tokio::spawn(async move {
            let gate = manager.gate(&request.profile_id);
            let _guard = gate.lock().await;
            let result = manager.run(&job, &request).await;
            manager.update(
                &job,
                |s| {
                    s.conflict = None;
                    s.state = match &result {
                        Ok(_) => "completed",
                        Err(e) if e.code == "file_cancelled" => "cancelled",
                        Err(_) => "error",
                    }
                    .into();
                    s.error = result.err();
                },
                true,
            );
            manager.changed(&request.profile_id);
        });
        Ok(status)
    }
    pub fn cancel(&self, id: &str) -> Result<()> {
        let jobs = self.jobs.lock().unwrap();
        let job = jobs.get(id).ok_or_else(|| issue("not_found"))?;
        if job.status.lock().unwrap().state == "committing" {
            return Err(issue("file_committing"));
        }
        job.cancel.send_replace(true);
        Ok(())
    }
    pub fn resolve(&self, id: &str, choice: String, all: bool) -> Result<()> {
        if !["keep", "replace", "skip", "merge"].contains(&choice.as_str()) {
            return Err(issue("file_request"));
        }
        let jobs = self.jobs.lock().unwrap();
        let job = jobs.get(id).ok_or_else(|| issue("not_found"))?;
        let sender = job
            .decision
            .lock()
            .unwrap()
            .take()
            .ok_or_else(|| issue("file_conflict_expired"))?;
        sender
            .send(Decision { choice, all })
            .map_err(|_| issue("file_conflict_expired"))
    }
    async fn conflict(
        &self,
        job: &Arc<Job>,
        source: &str,
        target: &str,
        kind: &str,
        cancel: &watch::Receiver<bool>,
    ) -> Result<String> {
        if let Some(choice) = job.choices.lock().unwrap().get(kind).cloned() {
            return Ok(choice);
        }
        let (sender, receiver) = oneshot::channel();
        *job.decision.lock().unwrap() = Some(sender);
        self.update(
            job,
            |s| {
                s.state = "conflict".into();
                s.conflict = Some(FileConflict {
                    source: source.into(),
                    target: target.into(),
                    kind: kind.into(),
                });
            },
            true,
        );
        let mut stop = cancel.clone();
        cancelled(&stop)?;
        let decision = tokio::select! { result = receiver => result.map_err(|_| issue("file_conflict_expired"))?, _ = stop.changed() => return Err(issue("file_cancelled")) };
        let valid = decision.choice == "keep"
            || decision.choice == "skip"
            || (kind == "file" && decision.choice == "replace")
            || (kind == "directory" && decision.choice == "merge");
        if !valid {
            return Err(issue("file_request"));
        }
        if decision.all {
            job.choices
                .lock()
                .unwrap()
                .insert(kind.into(), decision.choice.clone());
        }
        self.update(
            job,
            |s| {
                s.state = "running".into();
                s.conflict = None;
            },
            true,
        );
        Ok(decision.choice)
    }
    async fn inventory(
        fs: &FileSystem,
        paths: &[String],
        cancel: &watch::Receiver<bool>,
    ) -> Result<Vec<Node>> {
        let mut nodes = vec![];
        let mut stack: Vec<_> = paths.iter().rev().map(|p| (p.clone(), None)).collect();
        while let Some((path, parent)) = stack.pop() {
            cancelled(cancel)?;
            let entry = fs
                .stat(&path, cancel)
                .await?
                .ok_or_else(|| issue("file_missing"))?;
            if !["directory", "file"].contains(&entry.kind.as_str()) {
                return Err(issue("file_link"));
            }
            if entry.kind == "directory" {
                let listing = fs.list(&path, cancel).await?;
                for child in listing.entries.into_iter().rev() {
                    stack.push((child.path, Some(path.clone())));
                }
            }
            nodes.push(Node { entry, parent });
            if nodes.len() > 200_000 {
                return Err(issue("file_too_many"));
            }
        }
        Ok(nodes)
    }
    async fn unique(
        fs: &FileSystem,
        parent: &str,
        name: &str,
        directory: bool,
        cancel: &watch::Receiver<bool>,
    ) -> Result<String> {
        let (stem, suffix) = if directory {
            (name, String::new())
        } else {
            name.rsplit_once('.')
                .filter(|(s, _)| !s.is_empty())
                .map_or((name, String::new()), |(s, e)| (s, format!(".{e}")))
        };
        for i in 1..10000 {
            let p = fs.join(parent, &format!("{stem} ({i}){suffix}"))?;
            if fs.stat(&p, cancel).await?.is_none() {
                return Ok(p);
            }
        }
        Err(issue("file_exists"))
    }
    async fn run(&self, job: &Arc<Job>, request: &FileRequest) -> Result<()> {
        let cancel = job.cancel.subscribe();
        cancelled(&cancel)?;
        self.update(job, |s| s.state = "scanning".into(), true);
        let context = self
            .context(
                &request.profile_id,
                request.source_side == "phone"
                    || (request.operation != "delete" && request.target_side == "phone"),
                request.confirmed_serial.clone(),
            )
            .await?;
        let mut stages: Vec<(FileSystem, String)> = vec![];
        let result = async {
            let source = context.fs(&request.source_side)?;
            let paths = deduplicate(&request.paths, request.source_side == "local")?;
            let nodes = Self::inventory(&source, &paths, &cancel).await?;
            self.update(
                job,
                |s| {
                    s.bytes_total = nodes.iter().map(|n| n.entry.size).sum();
                    s.files_total = nodes.iter().filter(|n| n.entry.kind == "file").count() as u64;
                },
                true,
            );
            if request.operation == "delete" {
                if request.source_side == "local" {
                    for path in paths {
                        cancelled(&cancel)?;
                        let p = local_path(&path, true)?;
                        self.update(job, |s| s.current = path.clone(), true);
                        tokio::task::spawn_blocking(move || trash::delete(p))
                            .await
                            .map_err(|_| issue("file_trash"))?
                            .map_err(|_| issue("file_trash"))?;
                    }
                } else {
                    for node in nodes.iter().rev() {
                        source.remove_one(&node.entry.path, &cancel).await?;
                        self.update(
                            job,
                            |s| {
                                s.current = node.entry.path.clone();
                                if node.entry.kind == "file" {
                                    s.files_done += 1;
                                    s.bytes_done += node.entry.size;
                                }
                            },
                            true,
                        );
                    }
                }
                self.update(
                    job,
                    |s| {
                        s.files_done = s.files_total;
                        s.bytes_done = s.bytes_total;
                    },
                    true,
                );
                return Ok(());
            }
            let target = context.fs(&request.target_side)?;
            let target_entry = target
                .stat(&request.target_directory, &cancel)
                .await?
                .ok_or_else(|| issue("file_missing"))?;
            if target_entry.kind != "directory" {
                return Err(issue("file_type"));
            }
            if request.source_side == request.target_side {
                for node in nodes
                    .iter()
                    .filter(|n| n.parent.is_none() && n.entry.kind == "directory")
                {
                    if descendant(
                        &request.target_directory,
                        &node.entry.path,
                        request.source_side == "local",
                    ) {
                        return Err(issue("file_recursive"));
                    }
                }
            }
            let mut mapping: HashMap<String, String> = HashMap::new();
            let mut copied = vec![];
            for node in &nodes {
                cancelled(&cancel)?;
                let parent = match &node.parent {
                    Some(parent) => match mapping.get(parent) {
                        Some(p) => p.clone(),
                        None => {
                            self.update(job, |s| s.skipped += 1, false);
                            continue;
                        }
                    },
                    None => request.target_directory.clone(),
                };
                let mut destination = target.join(&parent, &node.entry.name)?;
                let existing = target.stat(&destination, &cancel).await?;
                let mut replace = false;
                if let Some(existing) = existing {
                    let kind = if existing.kind == node.entry.kind && existing.kind == "directory" {
                        "directory"
                    } else if existing.kind == "file" && node.entry.kind == "file" {
                        "file"
                    } else {
                        "type"
                    };
                    match self
                        .conflict(job, &node.entry.path, &destination, kind, &cancel)
                        .await?
                        .as_str()
                    {
                        "skip" => {
                            self.update(job, |s| s.skipped += 1, false);
                            continue;
                        }
                        "keep" => {
                            destination = Self::unique(
                                &target,
                                &parent,
                                &node.entry.name,
                                node.entry.kind == "directory",
                                &cancel,
                            )
                            .await?
                        }
                        "replace" => {
                            if request.source_side == request.target_side
                                && equivalent(
                                    &node.entry.path,
                                    &destination,
                                    request.source_side == "local",
                                )
                            {
                                return Err(issue("file_recursive"));
                            }
                            replace = true;
                        }
                        "merge" => {}
                        _ => return Err(issue("file_request")),
                    }
                }
                self.update(
                    job,
                    |s| {
                        s.current = node.entry.path.clone();
                        s.state = "running".into();
                    },
                    true,
                );
                if node.entry.kind == "directory" {
                    if target.stat(&destination, &cancel).await?.is_none() {
                        target.mkdir(&destination, &cancel).await?;
                    }
                    mapping.insert(node.entry.path.clone(), destination);
                    continue;
                }
                let stage = target.join(
                    &parent,
                    &format!(".pocket-lens-{}.part", uuid::Uuid::new_v4()),
                )?;
                stages.push((target.clone(), stage.clone()));
                let hash = source
                    .stream_to(
                        &node.entry.path,
                        &target,
                        &stage,
                        node.entry.size,
                        &cancel,
                        |n| self.update(job, |s| s.bytes_done += n, false),
                    )
                    .await?;
                self.update(job, |s| s.state = "verifying".into(), true);
                if source.hash(&node.entry.path, &cancel).await? != hash
                    || target.hash(&stage, &cancel).await? != hash
                {
                    return Err(issue("file_checksum"));
                }
                target
                    .rename(&stage, &destination, replace, &cancel)
                    .await?;
                stages.pop();
                copied.push((node.entry.path.clone(), destination, hash));
                self.update(
                    job,
                    |s| {
                        s.files_done += 1;
                        s.state = "running".into();
                    },
                    true,
                );
            }
            if request.operation == "move" && job.status.lock().unwrap().skipped == 0 {
                self.update(job, |s| s.state = "verifying".into(), true);
                // Reinventory prevents deleting a file added or changed while a folder was copying.
                let final_nodes = Self::inventory(&source, &paths, &cancel).await?;
                if fingerprint(&final_nodes) != fingerprint(&nodes) {
                    return Err(issue("file_changed"));
                }
                for (original, destination, hash) in &copied {
                    if source.hash(original, &cancel).await? != *hash
                        || target.hash(destination, &cancel).await? != *hash
                    {
                        return Err(issue("file_checksum"));
                    }
                }
                cancelled(&cancel)?;
                self.update(job, |s| s.state = "committing".into(), true);
                let (_tx, commit) = watch::channel(false);
                for node in nodes.iter().rev() {
                    source.remove_one(&node.entry.path, &commit).await?;
                }
            }
            Ok(())
        }
        .await;
        let (_tx, cleanup) = watch::channel(false);
        for (fs, path) in stages {
            let _ = fs.remove_one(&path, &cleanup).await;
        }
        context.cleanup().await;
        result
    }
    pub async fn block_and_cancel(&self, cancel_jobs: bool) -> Result<()> {
        self.blocked.store(true, Ordering::SeqCst);
        if self.has_active(None) && !cancel_jobs {
            self.blocked.store(false, Ordering::SeqCst);
            return Err(issue("file_busy"));
        }
        for job in self.jobs.lock().unwrap().values() {
            if job.status.lock().unwrap().state != "committing" {
                job.cancel.send_replace(true);
            }
        }
        for _ in 0..150 {
            if !self.has_active(None) {
                return Ok(());
            }
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        }
        self.blocked.store(false, Ordering::SeqCst);
        Err(issue("file_busy"))
    }
    pub fn unblock(&self) {
        self.blocked.store(false, Ordering::SeqCst);
    }
}
fn normalized(path: &str, windows: bool) -> String {
    if windows {
        path.replace('\\', "/").trim_end_matches('/').to_lowercase()
    } else {
        path.trim_end_matches('/').into()
    }
}
fn equivalent(a: &str, b: &str, windows: bool) -> bool {
    normalized(a, windows) == normalized(b, windows)
}
fn descendant(path: &str, parent: &str, windows: bool) -> bool {
    let path = normalized(path, windows);
    let parent = normalized(parent, windows);
    path == parent || path.starts_with(&(parent + "/"))
}
fn deduplicate(paths: &[String], windows: bool) -> Result<Vec<String>> {
    let mut result = vec![];
    let mut sorted = paths.to_vec();
    sorted.sort_by_key(|p| p.len());
    for path in sorted {
        if !result
            .iter()
            .any(|parent: &String| descendant(&path, parent, windows))
        {
            result.push(path);
        }
    }
    if result.is_empty() {
        Err(issue("file_request"))
    } else {
        Ok(result)
    }
}
fn fingerprint(nodes: &[Node]) -> Vec<(String, String, u64, u64)> {
    let mut result: Vec<_> = nodes
        .iter()
        .map(|n| {
            (
                n.entry.path.clone(),
                n.entry.kind.clone(),
                n.entry.size,
                n.entry.modified,
            )
        })
        .collect();
    result.sort();
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn selection_and_subdirectory_checks_use_boundaries() {
        assert!(descendant("C:\\photos\\new", "c:\\Photos", true));
        assert!(!descendant("/sdcard/photos-old", "/sdcard/photos", false));
        assert_eq!(
            deduplicate(&["/sdcard/a/b".into(), "/sdcard/a".into()], false).unwrap(),
            ["/sdcard/a"]
        );
    }
    #[tokio::test]
    async fn keep_both_preserves_extensions_and_directories() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().to_string_lossy();
        let (_tx, cancel) = watch::channel(false);
        std::fs::write(temp.path().join("photo (1).jpg"), b"a").unwrap();
        let unique = FileManager::unique(&FileSystem::Local, &path, "photo.jpg", false, &cancel)
            .await
            .unwrap();
        assert!(unique.ends_with("photo (2).jpg"));
    }
}
