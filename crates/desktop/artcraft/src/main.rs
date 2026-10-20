// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  // Builder check (publikhq.com/skills/setup.md): the built app provisions publik API for real,
  // prints one line and exits before any window, state or log setup. The builder who runs it is
  // the consent.
  if std::env::var_os("PUBLIK_SELF_TEST").is_some() {
    println!("{}", artcraft_app_lib::services::publik::state::publik_app_info::publik_self_test());
    return;
  }
  artcraft_app_lib::run();
}
