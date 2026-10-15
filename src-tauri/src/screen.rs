use crate::model::{AppError, Result};

#[cfg(windows)]
pub fn power(pid: u32, on: bool) -> Result<()> {
    use windows_sys::Win32::{
        Foundation::{HWND, LPARAM},
        UI::{
            Input::KeyboardAndMouse::{
                GetAsyncKeyState, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
                SendInput, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT,
            },
            WindowsAndMessaging::{
                EnumWindows, GetForegroundWindow, GetWindowThreadProcessId, IsIconic,
                IsWindowVisible, SW_RESTORE, SetForegroundWindow, ShowWindow,
            },
        },
    };
    use windows_sys::core::BOOL;
    struct Search {
        pid: u32,
        windows: Vec<HWND>,
    }
    unsafe extern "system" fn visit(window: HWND, value: LPARAM) -> BOOL {
        let search = unsafe { &mut *(value as *mut Search) };
        let mut owner = 0;
        unsafe {
            GetWindowThreadProcessId(window, &mut owner);
            if owner == search.pid && IsWindowVisible(window) != 0 {
                search.windows.push(window);
            }
        }
        1
    }
    fn key(code: u16, up: bool) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: code,
                    wScan: 0,
                    dwFlags: if up { KEYEVENTF_KEYUP } else { 0 },
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }
    let unavailable = || {
        AppError::new(
            "screen_focus",
            "Could not safely focus this session's window. Release modifier keys and try again.",
        )
    };
    unsafe {
        for code in [VK_CONTROL, VK_MENU, VK_SHIFT, VK_LWIN, VK_RWIN] {
            if GetAsyncKeyState(code as i32) < 0 {
                return Err(unavailable());
            }
        }
        let mut search = Search {
            pid,
            windows: vec![],
        };
        EnumWindows(Some(visit), &mut search as *mut Search as LPARAM);
        if search.windows.len() != 1 {
            return Err(unavailable());
        }
        let window = search.windows[0];
        let previous = GetForegroundWindow();
        if IsIconic(window) != 0 {
            ShowWindow(window, SW_RESTORE);
        }
        if SetForegroundWindow(window) == 0 {
            return Err(unavailable());
        }
        std::thread::sleep(std::time::Duration::from_millis(80));
        let mut owner = 0;
        GetWindowThreadProcessId(window, &mut owner);
        if owner != pid || GetForegroundWindow() != window {
            return Err(unavailable());
        }
        for code in [VK_CONTROL, VK_MENU, VK_SHIFT, VK_LWIN, VK_RWIN] {
            if GetAsyncKeyState(code as i32) < 0 {
                return Err(unavailable());
            }
        }
        let mut inputs = vec![key(0xA4, false)]; // Left Alt, matching --shortcut-mod=lalt.
        if on {
            inputs.push(key(0xA0, false));
        }
        inputs.push(key(0x4F, false));
        inputs.push(key(0x4F, true));
        if on {
            inputs.push(key(0xA0, true));
        }
        inputs.push(key(0xA4, true));
        let sent = SendInput(
            inputs.len() as u32,
            inputs.as_ptr(),
            std::mem::size_of::<INPUT>() as i32,
        );
        if sent != inputs.len() as u32 {
            // Release only modifiers this operation injected; never send an action to another window.
            let mut releases = vec![key(0x4F, true)];
            if on {
                releases.push(key(0xA0, true));
            }
            releases.push(key(0xA4, true));
            SendInput(
                releases.len() as u32,
                releases.as_ptr(),
                std::mem::size_of::<INPUT>() as i32,
            );
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
        if GetForegroundWindow() == window && !previous.is_null() {
            SetForegroundWindow(previous);
        }
        if sent != inputs.len() as u32 {
            return Err(unavailable());
        }
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn power(_pid: u32, _on: bool) -> Result<()> {
    Err(AppError::new(
        "screen_focus",
        "Screen controls require Windows",
    ))
}
