//! Sign in with publik, in a Tauri window: the gate every publik app opens with
//! (publikhq.com/sdk/publik.rs.md; the screens and their words come from `craft-publik`).
//!
//! `run_gate` opens a small window on the `publik-gate` custom protocol and runs
//! `craft_publik::gate::ensure_signed_in` on a worker thread. The worker parks each screen in a
//! shared slot; the protocol handler serves it as HTML (`craft_publik::gate::html`) and records
//! the button the person pressed (`/press/<id>`); the page polls `/seq` and reloads when the
//! screen changes. Once the gate passed, `on_pass` runs on the main thread, then the gate window
//! closes. At start-up `on_pass` creates the main window (so the app never has zero windows);
//! after a sign-out it does nothing, because the main window is up already.
//!
//! The gate window never talks to Tauri's IPC: plain links and one `fetch` to its own origin.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use craft_publik::gate::{self, GateUi, Screen};
use log::{error, info};
use tauri::http::{header, Request, Response, StatusCode};
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};

use crate::core::state::data_dir::app_data_root::AppDataRoot;
use crate::core::state::data_dir::trait_data_subdir::DataSubdir;
use crate::services::publik::state::publik_app_info::publik_app_info;

pub const GATE_WINDOW_LABEL: &str = "publik-gate";
/// The custom protocol the gate page lives on: `publik-gate://localhost/` (macOS, Linux) or
/// `http://publik-gate.localhost/` (Windows). Tauri maps it.
pub const GATE_SCHEME: &str = "publik-gate";
const PRESS_PATH: &str = "/press/";
const SEQ_PATH: &str = "/seq";
/// How long `/press` waits for the next screen before it answers, so that the page it returns
/// is the one after the press.
const PRESS_SETTLE: Duration = Duration::from_millis(300);
const WINDOW_WIDTH: f64 = 520.0;
const WINDOW_HEIGHT: f64 = 400.0;

#[derive(Default)]
struct GateSlot {
  /// The screen on display; None before the first one (the page says "Connecting to publik…").
  maybe_screen: Option<Screen>,
  /// Counts the screens; the page reloads when it changes.
  seq: u64,
  /// The button the person pressed, until the worker takes it.
  maybe_pressed: Option<&'static str>,
}

/// The shared slot, as Tauri state: the protocol handler and every gate run see the same one.
#[derive(Clone, Default)]
pub struct PublikGate {
  slot: Arc<Mutex<GateSlot>>,
  running: Arc<AtomicBool>,
}

impl PublikGate {
  fn lock(&self) -> MutexGuard<'_, GateSlot> {
    self.slot.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
  }
}

/// `craft_publik::gate::GateUi` over the slot: the worker thread's side.
struct WindowGateUi {
  gate: PublikGate,
}

impl GateUi for WindowGateUi {
  fn show(&mut self, screen: &Screen, done: Arc<AtomicBool>) -> Option<&'static str> {
    {
      let mut slot = self.gate.lock();
      slot.maybe_screen = Some(screen.clone());
      slot.seq = slot.seq.wrapping_add(1);
      slot.maybe_pressed = None;
    }
    loop {
      if let Some(id) = self.gate.lock().maybe_pressed.take() {
        return Some(id);
      }
      if done.load(Ordering::SeqCst) {
        return None;
      }
      std::thread::sleep(Duration::from_millis(50));
    }
  }

  fn open_url(&mut self, url: &str) {
    gate::open_in_browser(url);
  }
}

/// The `publik-gate` protocol: `/seq` (the screen counter), `/press/<id>` (a button), and the
/// page itself for anything else.
pub fn handle_gate_request(gate: &PublikGate, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
  let path = request.uri().path().to_string();
  if path == SEQ_PATH {
    let seq = gate.lock().seq;
    return respond("text/plain; charset=utf-8", seq.to_string().into_bytes());
  }
  if let Some(id) = path.strip_prefix(PRESS_PATH) {
    let before = {
      let mut slot = gate.lock();
      // Only a button of the screen on display counts; the id becomes that screen's own str.
      let maybe_button = slot.maybe_screen.as_ref().and_then(|screen| screen.buttons.iter().find(|(button, _)| *button == id).map(|(button, _)| *button));
      if let Some(button) = maybe_button {
        slot.maybe_pressed = Some(button);
      }
      slot.seq
    };
    let start = Instant::now();
    while start.elapsed() < PRESS_SETTLE && gate.lock().seq == before {
      std::thread::sleep(Duration::from_millis(25));
    }
  }
  let (seq, body) = {
    let slot = gate.lock();
    let body = match &slot.maybe_screen {
      Some(screen) => gate::html(screen, PRESS_PATH),
      None => connecting_html(),
    };
    (slot.seq, body)
  };
  respond("text/html; charset=utf-8", page_with_poll(&body, seq).into_bytes())
}

fn respond(content_type: &str, body: Vec<u8>) -> Response<Vec<u8>> {
  Response::builder().status(StatusCode::OK).header(header::CONTENT_TYPE, content_type).header(header::CACHE_CONTROL, "no-store").body(body).unwrap_or_else(|_| Response::new(Vec::new()))
}

/// Before the first screen: the worker is provisioning this computer.
fn connecting_html() -> String {
  let screen = Screen { id: "connecting", title: "Sign in with publik", body: "Connecting to publik…".to_string(), note: None, buttons: Vec::new() };
  gate::html(&screen, PRESS_PATH)
}

/// The crate's page plus a poll of `/seq`: the page reloads when the screen changes. A refresh
/// every 20 s is the fallback for a webview that cannot `fetch` its own protocol.
fn page_with_poll(html: &str, seq: u64) -> String {
  let script = format!("<script>(function(){{var seq=\"{seq}\";function tick(){{fetch(\"/seq?t=\"+Date.now(),{{cache:\"no-store\"}}).then(function(r){{return r.text()}}).then(function(t){{if(t.trim()!==seq){{location.replace(\"/\")}}}}).catch(function(){{}}).then(function(){{setTimeout(tick,700)}})}}setTimeout(tick,700)}})();</script>");
  let with_refresh = html.replacen("<head>", "<head><meta http-equiv=\"refresh\" content=\"20\">", 1);
  match with_refresh.rfind("</body>") {
    Some(at) => format!("{}{script}{}", &with_refresh[..at], &with_refresh[at..]),
    None => format!("{with_refresh}{script}"),
  }
}

/// Opens the gate window and runs the gate on a worker thread. `on_pass` runs on the main
/// thread once the person is signed in (and, the first time, has chosen how the app pays for
/// AI); then the gate window closes. A second call while a gate runs does nothing.
pub fn run_gate(app: &AppHandle, on_pass: impl FnOnce(&AppHandle) + Send + 'static) {
  let gate = app.state::<PublikGate>().inner().clone();
  if gate.running.swap(true, Ordering::SeqCst) {
    return;
  }
  if app.get_webview_window(GATE_WINDOW_LABEL).is_none() {
    if let Err(err) = open_gate_window(app) {
      error!("publik: the sign-in window could not open: {:?}", err);
      gate.running.store(false, Ordering::SeqCst);
      return;
    }
  }
  let config_dir = app.state::<AppDataRoot>().settings_dir().path().to_path_buf();
  let info = publik_app_info(Some(config_dir));
  let worker_app = app.clone();
  std::thread::spawn(move || {
    let mut ui = WindowGateUi { gate: gate.clone() };
    let passed = gate::ensure_signed_in(&info, &mut ui);
    info!("publik: signed in{}", passed.handle().map(|handle| format!(" as @{handle}")).unwrap_or_default());
    gate.running.store(false, Ordering::SeqCst);
    let app = worker_app.clone();
    let result = worker_app.run_on_main_thread(move || {
      on_pass(&app);
      if let Some(window) = app.get_webview_window(GATE_WINDOW_LABEL) {
        if let Err(err) = window.close() {
          error!("publik: the sign-in window did not close: {:?}", err);
        }
      }
    });
    if let Err(err) = result {
      error!("publik: could not continue on the main thread after the sign-in: {:?}", err);
    }
  });
}

fn open_gate_window(app: &AppHandle) -> tauri::Result<()> {
  let url: Url = format!("{GATE_SCHEME}://localhost/").parse().map_err(tauri::Error::InvalidUrl)?;
  WebviewWindowBuilder::new(app, GATE_WINDOW_LABEL, WebviewUrl::CustomProtocol(url)).title("Sign in with publik").inner_size(WINDOW_WIDTH, WINDOW_HEIGHT).resizable(false).center().always_on_top(true).focused(true).build()?;
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  fn request(path: &str) -> Request<Vec<u8>> {
    Request::builder().uri(format!("publik-gate://localhost{path}")).body(Vec::new()).unwrap()
  }

  #[test]
  fn the_page_shows_the_screen_and_takes_a_press() {
    let gate = PublikGate::default();
    let first = handle_gate_request(&gate, &request("/"));
    assert!(String::from_utf8_lossy(first.body()).contains("Connecting to publik"));

    let screen = gate::gate_screen("sign_in", None, None, None);
    {
      let mut slot = gate.lock();
      slot.maybe_screen = Some(screen);
      slot.seq = 1;
    }
    let page = String::from_utf8_lossy(handle_gate_request(&gate, &request("/")).body()).to_string();
    assert!(page.contains("<h1>Sign in with publik</h1>"));
    assert!(page.contains("href=\"/press/sign_in\""));
    assert!(page.contains("fetch(\"/seq?t=\""));
    assert!(page.contains("http-equiv=\"refresh\""));
    assert_eq!(String::from_utf8_lossy(handle_gate_request(&gate, &request("/seq")).body()), "1");

    handle_gate_request(&gate, &request("/press/not_a_button"));
    assert_eq!(gate.lock().maybe_pressed, None);
    handle_gate_request(&gate, &request("/press/sign_in"));
    assert_eq!(gate.lock().maybe_pressed, Some("sign_in"));
  }

  #[test]
  fn the_worker_gets_the_press_and_stops_when_done() {
    let gate = PublikGate::default();
    let mut ui = WindowGateUi { gate: gate.clone() };
    let screen = gate::gate_screen("unreachable", None, None, None);
    let presser = gate.clone();
    std::thread::spawn(move || {
      std::thread::sleep(Duration::from_millis(80));
      handle_gate_request(&presser, &request("/press/retry"));
    });
    assert_eq!(ui.show(&screen, Arc::new(AtomicBool::new(false))), Some("retry"));

    let done = Arc::new(AtomicBool::new(true));
    assert_eq!(ui.show(&screen, done), None);
    assert_eq!(gate.lock().seq, 2);
  }
}
