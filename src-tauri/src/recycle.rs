//! Recycle-only Windows deletion. A progress sink vetoes permanent deletion.
use crate::{file_io::issue, model::Result};
#[cfg(windows)]
mod native {
    use windows::{
        Win32::{Foundation::E_ABORT, System::Com::*, UI::Shell::*},
        core::{PCWSTR, implement},
    };
    #[implement(IFileOperationProgressSink)]
    struct RecycleOnly;
    #[allow(non_snake_case, unused_variables, clippy::too_many_arguments)]
    impl IFileOperationProgressSink_Impl for RecycleOnly_Impl {
        fn StartOperations(&self) -> windows::core::Result<()> {
            Ok(())
        }
        fn FinishOperations(&self, hrresult: windows::core::HRESULT) -> windows::core::Result<()> {
            hrresult.ok()
        }
        fn PreRenameItem(
            &self,
            dwflags: u32,
            psiitem: windows::core::Ref<IShellItem>,
            psznewname: &windows::core::PCWSTR,
        ) -> windows::core::Result<()> {
            Ok(())
        }
        fn PostRenameItem(
            &self,
            dwflags: u32,
            psiitem: windows::core::Ref<IShellItem>,
            psznewname: &windows::core::PCWSTR,
            hrrename: windows::core::HRESULT,
            psinewlycreated: windows::core::Ref<IShellItem>,
        ) -> windows::core::Result<()> {
            Ok(())
        }
        fn PreMoveItem(
            &self,
            dwflags: u32,
            psiitem: windows::core::Ref<IShellItem>,
            psidestinationfolder: windows::core::Ref<IShellItem>,
            psznewname: &windows::core::PCWSTR,
        ) -> windows::core::Result<()> {
            Ok(())
        }
        fn PostMoveItem(
            &self,
            dwflags: u32,
            psiitem: windows::core::Ref<IShellItem>,
            psidestinationfolder: windows::core::Ref<IShellItem>,
            psznewname: &windows::core::PCWSTR,
            hrmove: windows::core::HRESULT,
            psinewlycreated: windows::core::Ref<IShellItem>,
        ) -> windows::core::Result<()> {
            Ok(())
        }
        fn PreCopyItem(
            &self,
            dwflags: u32,
            psiitem: windows::core::Ref<IShellItem>,
            psidestinationfolder: windows::core::Ref<IShellItem>,
            psznewname: &windows::core::PCWSTR,
        ) -> windows::core::Result<()> {
            Ok(())
        }
        fn PostCopyItem(
            &self,
            dwflags: u32,
            psiitem: windows::core::Ref<IShellItem>,
            psidestinationfolder: windows::core::Ref<IShellItem>,
            psznewname: &windows::core::PCWSTR,
            hrcopy: windows::core::HRESULT,
            psinewlycreated: windows::core::Ref<IShellItem>,
        ) -> windows::core::Result<()> {
            Ok(())
        }
        fn PreDeleteItem(
            &self,
            dwflags: u32,
            psiitem: windows::core::Ref<IShellItem>,
        ) -> windows::core::Result<()> {
            if dwflags & 0x80 == 0 {
                Err(windows::core::Error::from_hresult(E_ABORT))
            } else {
                Ok(())
            }
        }
        fn PostDeleteItem(
            &self,
            dwflags: u32,
            psiitem: windows::core::Ref<IShellItem>,
            hrdelete: windows::core::HRESULT,
            psinewlycreated: windows::core::Ref<IShellItem>,
        ) -> windows::core::Result<()> {
            hrdelete.ok()
        }
        fn PreNewItem(
            &self,
            dwflags: u32,
            psidestinationfolder: windows::core::Ref<IShellItem>,
            psznewname: &windows::core::PCWSTR,
        ) -> windows::core::Result<()> {
            Ok(())
        }
        fn PostNewItem(
            &self,
            dwflags: u32,
            psidestinationfolder: windows::core::Ref<IShellItem>,
            psznewname: &windows::core::PCWSTR,
            psztemplatename: &windows::core::PCWSTR,
            dwfileattributes: u32,
            hrnew: windows::core::HRESULT,
            psinewitem: windows::core::Ref<IShellItem>,
        ) -> windows::core::Result<()> {
            Ok(())
        }
        fn UpdateProgress(&self, iworktotal: u32, iworksofar: u32) -> windows::core::Result<()> {
            Ok(())
        }
        fn ResetTimer(&self) -> windows::core::Result<()> {
            Ok(())
        }
        fn PauseTimer(&self) -> windows::core::Result<()> {
            Ok(())
        }
        fn ResumeTimer(&self) -> windows::core::Result<()> {
            Ok(())
        }
    }
    pub fn recycle(path: &std::path::Path) -> windows::core::Result<()> {
        use std::os::windows::ffi::OsStrExt;
        unsafe {
            CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok()?;
            struct Com;
            impl Drop for Com {
                fn drop(&mut self) {
                    unsafe {
                        CoUninitialize();
                    }
                }
            }
            let _com = Com;
            let operation: IFileOperation =
                CoCreateInstance(&FileOperation, None, CLSCTX_INPROC_SERVER)?;
            operation.SetOperationFlags(
                FOF_SILENT
                    | FOF_NOCONFIRMATION
                    | FOF_NOERRORUI
                    | FOF_NOCONFIRMMKDIR
                    | FOF_ALLOWUNDO
                    | FOFX_ADDUNDORECORD
                    | FOFX_RECYCLEONDELETE
                    | FOFX_EARLYFAILURE,
            )?;
            let name: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
            let item: IShellItem = SHCreateItemFromParsingName(PCWSTR(name.as_ptr()), None)?;
            let sink: IFileOperationProgressSink = RecycleOnly.into();
            operation.DeleteItem(&item, &sink)?;
            operation.PerformOperations()?;
            if operation.GetAnyOperationsAborted()?.as_bool() {
                return Err(windows::core::Error::from_hresult(E_ABORT));
            }
            Ok(())
        }
    }
}

#[cfg(all(test, windows))]
mod tests {
    #[test]
    fn deletion_creates_a_recoverable_recycle_bin_item() {
        let temp = tempfile::tempdir().unwrap();
        let name = format!("pocket-lens-recycle-check-{}.txt", uuid::Uuid::new_v4());
        let path = temp.path().join(&name);
        std::fs::write(&path, b"recoverable fixture").unwrap();
        super::recycle(path.clone()).unwrap();
        assert!(!path.exists());
        let parent = temp.path().canonicalize().unwrap();
        let mut item = trash::os_limited::list()
            .unwrap()
            .into_iter()
            .find(|item| item.original_parent.canonicalize().ok().as_ref() == Some(&parent))
            .expect("File must be recoverable, never permanently removed");
        // Shell display names may hide .txt; restore using the fixture's known full filename.
        item.name = name.into();
        trash::os_limited::restore_all([item]).unwrap();
        assert_eq!(std::fs::read(path).unwrap(), b"recoverable fixture");
    }
}
pub fn recycle(path: std::path::PathBuf) -> Result<()> {
    #[cfg(windows)]
    {
        native::recycle(&path).map_err(|_| issue("file_trash"))
    }
    #[cfg(not(windows))]
    {
        trash::delete(path).map_err(|_| issue("file_trash"))
    }
}
