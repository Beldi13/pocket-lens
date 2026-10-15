use crate::model::*;
use std::path::Path;

pub fn load(path: &Path) -> Result<Settings> {
    if !path.exists() {
        return Ok(Settings::default());
    }
    let settings: Settings = serde_json::from_slice(&std::fs::read(path)?)
        .map_err(|e| AppError::new("settings", format!("Cannot read settings: {e}")))?;
    if settings.version != 1 {
        return Err(AppError::new(
            "settings_version",
            "Settings were created by a different version. File has been preserved.",
        ));
    }
    Ok(settings)
}
pub fn save(path: &Path, settings: &Settings) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let temp = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(settings)
        .map_err(|e| AppError::new("settings", e.to_string()))?;
    use std::io::Write;
    let mut file = std::fs::File::create(&temp)?;
    file.write_all(&bytes)?;
    file.sync_all()?;
    drop(file);
    std::fs::rename(temp, path)?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn settings_survive_replace_and_unknown_versions_are_preserved() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let mut settings = load(&path).unwrap();
        save(&path, &settings).unwrap();
        settings.preferences.language = "en".into();
        save(&path, &settings).unwrap();
        assert_eq!(load(&path).unwrap().preferences.language, "en");
        let unknown = br#"{"version":99,"profiles":[],"preferences":{}}"#;
        std::fs::write(&path, unknown).unwrap();
        assert_eq!(load(&path).unwrap_err().code, "settings_version");
        assert_eq!(std::fs::read(&path).unwrap(), unknown);
    }
}
