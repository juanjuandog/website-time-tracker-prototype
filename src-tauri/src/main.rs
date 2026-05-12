use std::{
    env,
    path::PathBuf,
    process::{Child, Command},
    sync::Mutex,
    thread,
    time::Duration,
};

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, PhysicalPosition, Position,
};

#[cfg(not(debug_assertions))]
use tauri::path::BaseDirectory;
#[cfg(not(debug_assertions))]
use std::process::Stdio;

struct TrackerServer(Mutex<Option<Child>>);

fn toggle_tracking() {
    let _ = Command::new("curl")
        .args(["-s", "-X", "POST", "http://127.0.0.1:4174/api/toggle"])
        .output();
}

fn open_dashboard() {
    let _ = Command::new("open")
        .arg("http://localhost:4174")
        .output();
}

fn position_prompt_window(window: &tauri::WebviewWindow) {
    if let Ok(Some(monitor)) = window.current_monitor() {
        if let Ok(size) = window.outer_size() {
            let monitor_position = monitor.position();
            let monitor_size = monitor.size();
            let x = monitor_position.x + monitor_size.width as i32 - size.width as i32 - 28;
            let y = monitor_position.y + 64;
            let _ = window.set_position(Position::Physical(PhysicalPosition { x, y }));
        }
    }
}

fn start_prompt_monitor(app: tauri::AppHandle) {
    thread::spawn(move || {
        let mut visible = false;
        loop {
            thread::sleep(Duration::from_millis(1200));
            let Ok(output) = Command::new("curl")
                .args(["-s", "--max-time", "2", "http://127.0.0.1:4174/api/category-target"])
                .output()
            else {
                if visible {
                    if let Some(window) = app.get_webview_window("categoryPrompt") {
                        let _ = window.hide();
                    }
                    visible = false;
                }
                continue;
            };
            if !output.status.success() {
                if visible {
                    if let Some(window) = app.get_webview_window("categoryPrompt") {
                        let _ = window.hide();
                    }
                    visible = false;
                }
                continue;
            }
            let body = String::from_utf8_lossy(&output.stdout);
            let should_show = body.contains("\"target\":{");
            if should_show == visible {
                continue;
            }
            if let Some(window) = app.get_webview_window("categoryPrompt") {
                if should_show {
                    position_prompt_window(&window);
                    let _ = window.show();
                    let _ = window.set_focus();
                } else {
                    let _ = window.hide();
                }
                visible = should_show;
            }
        }
    });
}

fn launch_agent_path() -> Option<PathBuf> {
    let home = env::var_os("HOME")?;
    Some(PathBuf::from(home).join("Library/LaunchAgents/com.local.webtimetracker.plist"))
}

fn current_app_bundle() -> Option<PathBuf> {
    let exe = env::current_exe().ok()?;
    exe.ancestors()
        .find(|path| path.extension().map(|ext| ext == "app").unwrap_or(false))
        .map(PathBuf::from)
}

fn toggle_autostart() {
    let Some(agent_path) = launch_agent_path() else {
        return;
    };

    if agent_path.exists() {
        let _ = std::fs::remove_file(agent_path);
        return;
    }

    let Some(app_bundle) = current_app_bundle() else {
        return;
    };
    if let Some(parent) = agent_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let plist = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.local.webtimetracker</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/open</string>
    <string>{}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
"#,
        app_bundle.display()
    );
    let _ = std::fs::write(agent_path, plist);
}

fn spawn_server(app: &tauri::App) -> Option<Child> {
    #[cfg(debug_assertions)]
    {
        let _ = app;
        None
    }

    #[cfg(not(debug_assertions))]
    {
        let server_path = ["server.js", "_up_/server.js", "../server.js"]
            .iter()
            .find_map(|candidate| {
                let resolved = app.path().resolve(candidate, BaseDirectory::Resource).ok()?;
                resolved.exists().then_some(resolved)
            })?;
        let data_dir = app.path().app_data_dir().ok()?;
        let _ = std::fs::create_dir_all(&data_dir);
        let node = node_command();

        let child = Command::new(node)
            .arg(server_path)
            .env("PORT", "4174")
            .env("TRACKER_DATA_DIR", data_dir)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .ok()?;

        thread::sleep(Duration::from_millis(1200));
        Some(child)
    }
}

#[cfg(not(debug_assertions))]
fn node_command() -> &'static str {
    for candidate in ["/opt/homebrew/bin/node", "/usr/local/bin/node", "node"] {
        if candidate == "node" || std::path::Path::new(candidate).exists() {
            return candidate;
        }
    }
    "node"
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            app.manage(TrackerServer(Mutex::new(spawn_server(app))));
            start_prompt_monitor(app.handle().clone());

            let show = MenuItem::with_id(app, "show", "打开网页版", true, None::<&str>)?;
            let pause = MenuItem::with_id(app, "pause", "暂停 / 继续记录", true, None::<&str>)?;
            let autostart = MenuItem::with_id(app, "autostart", "切换开机自启", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &pause, &autostart, &quit])?;

            TrayIconBuilder::new()
                .tooltip("网页时间监控")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => open_dashboard(),
                    "pause" => toggle_tracking(),
                    "autostart" => toggle_autostart(),
                    "quit" => {
                        let state = app.state::<TrackerServer>();
                        if let Some(mut child) = state.0.lock().ok().and_then(|mut guard| guard.take()) {
                            let _ = child.kill();
                        }
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running web time tracker");
}
