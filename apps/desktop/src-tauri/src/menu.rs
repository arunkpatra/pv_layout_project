//! Native app menu — minimal but real, per S6 deliverables.
//!
//! Populates File / Edit / View / Help with the common items. Items that
//! need wiring to the frontend (Open KMZ, Save, Export, toggles) use the
//! `app://menu/<id>` event pattern — the React side listens via
//! `listen("menu:<id>", ...)`. Wiring lands progressively: S8 hooks Open
//! KMZ, S9 hooks Save/Export, S13.5 hooks View toggles.

use tauri::{
    menu::{
        AboutMetadataBuilder, Menu, MenuBuilder, MenuItem, MenuItemBuilder, PredefinedMenuItem,
        Submenu, SubmenuBuilder,
    },
    AppHandle, Emitter, Runtime,
};

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let app_name = "SolarLayout";

    // ---- App submenu (macOS only; other platforms ignore) ------------------
    let app_submenu: Submenu<R> = SubmenuBuilder::new(app, app_name)
        .about(Some(
            AboutMetadataBuilder::new()
                .name(Some(app_name))
                .copyright(Some("© SolarLayout"))
                .build(),
        ))
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    // ---- File --------------------------------------------------------------
    let open_kmz: MenuItem<R> = MenuItemBuilder::with_id("file.open_kmz", "Open KMZ…")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let save_project: MenuItem<R> = MenuItemBuilder::with_id("file.save_project", "Save project")
        .accelerator("CmdOrCtrl+S")
        .build(app)?;
    let export: MenuItem<R> = MenuItemBuilder::with_id("file.export", "Export…")
        .accelerator("CmdOrCtrl+E")
        .build(app)?;

    let file_menu: Submenu<R> = SubmenuBuilder::new(app, "File")
        .item(&open_kmz)
        .separator()
        .item(&save_project)
        .item(&export)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, Some("Close window"))?)
        .build()?;

    // ---- Edit --------------------------------------------------------------
    let edit_menu: Submenu<R> = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    // ---- View --------------------------------------------------------------
    let toggle_tool_rail: MenuItem<R> =
        MenuItemBuilder::with_id("view.toggle_tool_rail", "Toggle Tool Rail")
            .accelerator("CmdOrCtrl+Alt+L")
            .build(app)?;
    let toggle_inspector: MenuItem<R> =
        MenuItemBuilder::with_id("view.toggle_inspector", "Toggle Inspector")
            .accelerator("CmdOrCtrl+Alt+R")
            .build(app)?;
    let toggle_theme: MenuItem<R> =
        MenuItemBuilder::with_id("view.toggle_theme", "Toggle Theme")
            .build(app)?;
    let command_palette: MenuItem<R> =
        MenuItemBuilder::with_id("view.command_palette", "Command Palette")
            .accelerator("CmdOrCtrl+K")
            .build(app)?;

    let view_menu: Submenu<R> = SubmenuBuilder::new(app, "View")
        .item(&command_palette)
        .separator()
        .item(&toggle_tool_rail)
        .item(&toggle_inspector)
        .separator()
        .item(&toggle_theme)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(app, Some("Enter Full Screen"))?)
        .build()?;

    // ---- Help --------------------------------------------------------------
    let documentation: MenuItem<R> =
        MenuItemBuilder::with_id("help.documentation", "Documentation").build(app)?;
    let report_issue: MenuItem<R> =
        MenuItemBuilder::with_id("help.report_issue", "Report an issue…").build(app)?;
    let help_menu: Submenu<R> = SubmenuBuilder::new(app, "Help")
        .item(&documentation)
        .item(&report_issue)
        .build()?;

    MenuBuilder::new(app)
        .item(&app_submenu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&help_menu)
        .build()
}

/// Attach the menu event handler. Forwards all custom item IDs to the
/// frontend as `menu:<category>/<name>` events; the React shell listens
/// and dispatches.
///
/// NOTE: Tauri 2's event-name validator bans `.` (only alphanumerics,
/// `-`, `/`, `:`, `_` are allowed). The menu item IDs themselves use
/// dotted namespaces (`file.open_kmz`) for readability; we translate
/// to `/` at the emit boundary so the event name passes validation.
pub fn wire_events<R: Runtime>(app: &AppHandle<R>) {
    let handle = app.clone();
    app.on_menu_event(move |_window, event| {
        let id = event.id().0.as_str().to_string();
        if id.starts_with("file.") || id.starts_with("view.") || id.starts_with("help.") {
            let name = format!("menu:{}", id.replace('.', "/"));
            let _ = handle.emit(&name, ());
        }
    });
}
