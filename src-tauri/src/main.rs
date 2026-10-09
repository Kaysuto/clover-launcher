// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if !clover_launcher_lib::run_game_window_helper() {
        clover_launcher_lib::run()
    }
}
