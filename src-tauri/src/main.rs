#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

fn restore_main_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let mut builder = WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::App("index.html".into()),
            )
            .title("Tournyx Esports")
            .inner_size(1280.0, 820.0)
            .min_inner_size(960.0, 640.0)
            .resizable(true)
            .center()
            .visible(false);

            // macOS: Native Apple Liquid Glass (Transparent Vibrancy + Overlay Traffic Lights)
            #[cfg(target_os = "macos")]
            {
                builder = builder
                    .transparent(true)
                    .title_bar_style(tauri::TitleBarStyle::Overlay)
                    .hidden_title(true);
            }

            // Windows & Linux: Solid Obsidian #050508 Zero-Flash Surface
            #[cfg(not(target_os = "macos"))]
            {
                builder = builder.background_color(tauri::window::Color(5, 5, 8, 255));
            }

            let window = builder.build()?;

            #[cfg(target_os = "macos")]
            {
                use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
                let _ = apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None);
            }

            #[cfg(target_os = "windows")]
            {
                use window_vibrancy::apply_mica;
                let _ = apply_mica(&window, Some(true));
            }

            // Show window only after OS dark/vibrancy styling is locked (zero white boot flash)
            let _ = window.show();

            // Low-Memory System Tray (Keep Room ID Alerts Alive While Gaming)
            let open_item = MenuItem::with_id(app, "open", "Open Tournyx Esports", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit Tournyx", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&open_item, &quit_item])?;

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&tray_menu)
                .tooltip("Tournyx Esports")
                .show_menu_on_left_click(false)
                .on_menu_event(|app_handle, event| match event.id.as_ref() {
                    "open" => restore_main_window(app_handle),
                    "quit" => app_handle.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        restore_main_window(tray.app_handle());
                    }
                });

            if let Some(icon) = app.default_window_icon().cloned() {
                tray_builder = tray_builder.icon(icon);
            }
            let _ = tray_builder.build(app);

            // Minimize to tray on close instead of killing active squad voice / alerts
            let win_clone = window.clone();
            window.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = win_clone.hide();
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Tournyx Esports desktop app");
}
