//! Transient Windows tray surface. Menu actions and availability remain owned by `TrayMenu`.
use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder, WindowEvent};

const WIDTH: f64 = 276.0;
const HEIGHT: f64 = 188.0;

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let window = WebviewWindowBuilder::new(app, "tray-menu", WebviewUrl::App("index.html".into()))
        .title("Menu Clover Launcher")
        .inner_size(WIDTH, HEIGHT)
        .decorations(false)
        .transparent(true)
        .background_color(tauri::utils::config::Color(0, 0, 0, 0))
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .focused(false)
        .build()?;
    let target = window.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Focused(false) => { let _ = target.hide(); }
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            let _ = target.hide();
        }
        _ => {}
    });
    Ok(())
}

pub fn show(app: &AppHandle, position: PhysicalPosition<f64>) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window("tray-menu") else { return Ok(()); };
    let monitor = app.monitor_from_point(position.x, position.y)?;
    let scale = monitor.as_ref().map_or(1.0, |monitor| monitor.scale_factor());
    let (mut x, mut y) = (position.x, position.y - HEIGHT * scale);
    if let Some(monitor) = monitor {
        let origin = monitor.position();
        let size = monitor.size();
        x = x.clamp(f64::from(origin.x), (f64::from(origin.x) + f64::from(size.width) - WIDTH * scale).max(f64::from(origin.x)));
        y = y.clamp(f64::from(origin.y), (f64::from(origin.y) + f64::from(size.height) - HEIGHT * scale).max(f64::from(origin.y)));
    }
    window.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32))?;
    window.set_size(LogicalSize::new(WIDTH, HEIGHT))?;
    window.show()?;
    window.set_focus()?;
    window.emit("tray-open", ())?;
    Ok(())
}
