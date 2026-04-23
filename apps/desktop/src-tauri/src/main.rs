// Prevents the cmd.exe window from appearing on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    solarlayout_desktop_lib::run()
}
