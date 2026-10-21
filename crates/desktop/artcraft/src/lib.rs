pub mod core;
pub mod services;
pub mod version;

#[cfg(test)]
mod no_cloud_tests;

use log::error;

use crate::core::commands::app_preferences::get_app_preferences_command::get_app_preferences_command;
use crate::core::commands::app_preferences::update_app_preference_command::update_app_preferences_command;
use crate::core::commands::cost_estimate::estimate_audio_cost_command::estimate_audio_cost_command;
use crate::core::commands::cost_estimate::estimate_image_cost_command::estimate_image_cost_command;
use crate::core::commands::cost_estimate::estimate_mesh_cost_command::estimate_mesh_cost_command;
use crate::core::commands::cost_estimate::estimate_splat_cost_command::estimate_splat_cost_command;
use crate::core::commands::cost_estimate::estimate_video_cost_command::estimate_video_cost_command;
use crate::core::commands::download::download_directory_reveal_command::download_directory_reveal_command;
use crate::core::commands::download::download_media_file_command::download_media_file_command;
use crate::core::commands::download::download_url_command::download_url_command;
use crate::core::commands::download::get_download_path_command::get_download_path_command;
use crate::core::commands::enqueue::image_bg_removal::enqueue_image_bg_removal_command::enqueue_image_bg_removal_command;
use crate::core::commands::enqueue::image_to_gaussian::enqueue_image_to_gaussian_command::enqueue_image_to_gaussian_command;
use crate::core::commands::enqueue::image_to_object::enqueue_image_to_3d_object_command::enqueue_image_to_3d_object_command;
use crate::core::commands::flip_image::flip_image;
use crate::core::commands::generate::generate_audio_command::generate_audio_command;
use crate::core::commands::generate::generate_image::generate_image_command::generate_image_command;
use crate::core::commands::generate::generate_mesh_command::generate_mesh_command;
use crate::core::commands::generate::generate_splat_command::generate_splat_command;
use crate::core::commands::generate::generate_video::generate_video_command::generate_video_command;
use crate::core::commands::generate::models::image::list_image_models_command::list_image_models_command;
use crate::core::commands::generate::models::video::list_video_models_command::list_video_models_command;
use crate::core::commands::get_app_info_command::get_app_info_command;
use crate::core::commands::load_without_cors_command::load_without_cors_command;
use crate::core::commands::media_files::media_file_delete_command::media_file_delete_command;
use crate::core::commands::platform_info_command::platform_info_command;
use crate::core::commands::providers::deprecated::get_provider_order_command::get_provider_order_command;
use crate::core::commands::providers::deprecated::set_provider_order_command::set_provider_order_command;
use crate::core::commands::providers::provider_clear_command::provider_clear_command;
use crate::core::commands::providers::provider_list_command::provider_list_command;
use crate::core::commands::providers::provider_set_api_key_command::provider_set_api_key_command;
use crate::core::commands::task_queue::get_task_queue_command::get_task_queue_command;
use crate::core::commands::task_queue::mark_task_as_dismissed_command::mark_task_as_dismissed_command;
use crate::core::commands::task_queue::tasks_nuke_all_command::tasks_nuke_all_command;
use crate::core::commands::unavailable::check_sora_session_command::check_sora_session_command;
use crate::core::commands::unavailable::grok_clear_credentials_command::grok_clear_credentials_command;
use crate::core::commands::unavailable::grok_get_credential_info_command::grok_get_credential_info_command;
use crate::core::commands::unavailable::grok_open_login_command::grok_open_login_command;
use crate::core::commands::unavailable::midjourney_clear_credentials_command::midjourney_clear_credentials_command;
use crate::core::commands::unavailable::midjourney_get_credential_info_command::midjourney_get_credential_info_command;
use crate::core::commands::unavailable::midjourney_open_login_command::midjourney_open_login_command;
use crate::core::commands::unavailable::open_sora_login_command::open_sora_login_command;
use crate::core::commands::unavailable::sora_get_credential_info_command::sora_get_credential_info_command;
use crate::core::commands::unavailable::sora_logout_command::sora_logout_command;
use crate::core::commands::unavailable::worldlabs_clear_credentials_command::worldlabs_clear_credentials_command;
use crate::core::commands::unavailable::worldlabs_get_credential_info_command::worldlabs_get_credential_info_command;
use crate::core::commands::unavailable::worldlabs_open_login_command::worldlabs_open_login_command;
use crate::core::commands::unavailable::worldlabs_receive_bearer_command::worldlabs_receive_bearer_command;
use crate::core::lifecycle::startup::handle_tauri_startup::handle_tauri_startup;
use crate::core::lifecycle::startup::setup_main_window::setup_main_window;
use crate::core::providers::credentials::provider_credential_loading_cache::ProviderCredentialLoadingCache;
use crate::core::state::app_preferences::app_preferences_manager::load_app_preferences_or_default;
use crate::core::state::artcraft_platform_info::ArtcraftPlatformInfo;
use crate::core::state::data_dir::app_data_root::AppDataRoot;
use crate::core::state::data_dir::trait_data_subdir::DataSubdir;
use crate::services::publik::commands::publik_close_setup_command::publik_close_setup_command;
use crate::services::publik::commands::publik_dismiss_notice_command::publik_dismiss_notice_command;
use crate::services::publik::commands::publik_forget_key_command::publik_forget_key_command;
use crate::services::publik::commands::publik_get_status_command::publik_get_status_command;
use crate::services::publik::commands::publik_import_image_command::publik_import_image_command;
use crate::services::publik::commands::publik_improve_prompt_command::publik_improve_prompt_command;
use crate::services::publik::commands::publik_link_computer_command::publik_link_computer_command;
use crate::services::publik::commands::publik_list_results_command::publik_list_results_command;
use crate::services::publik::commands::publik_mark_first_card_shown_command::publik_mark_first_card_shown_command;
use crate::services::publik::commands::publik_set_own_key_command::publik_set_own_key_command;
use crate::services::publik::commands::publik_speech_command::publik_speech_command;
use crate::services::publik::commands::publik_transcribe_command::publik_transcribe_command;
use crate::services::publik::state::publik_ai_state::PublikAiState;
use crate::services::publik::state::publik_app_info::publik_app_info;
use crate::services::publik::state::publik_local_store::PublikLocalStore;

/// Every AI request goes through publik API (the person's publik balance) or the person's own
/// key, through `craft-publik`. There is no ArtCraft account and no other cloud provider: the
/// commands that needed one keep their names and answer "<Feature> is not available in this
/// build." (see `core::commands::unavailable`).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // NB: Tauri wants to install the logger itself, so we can't rely on the logger crate
  // until the tauri runtime begins.
  println!("Loading config...");
  let app_data_root = AppDataRoot::create_default().expect("data directory should be created");
  let app_data_root_2 = app_data_root.clone();

  println!("Getting platform info...");
  let artcraft_platform_info = ArtcraftPlatformInfo::get();

  println!("Platform info: {:?}", artcraft_platform_info);

  println!("Loading app preferences...");
  let app_preferences = load_app_preferences_or_default(&app_data_root);

  let provider_credential_cache = ProviderCredentialLoadingCache::new(app_data_root.clone());

  // publik API (or the person's own key) for images, "Improve prompt", speech and transcription.
  // ai.json lives with ArtCraft's other settings; publik's key lives in publik's own credential
  // file.
  let publik_ai_state = PublikAiState::new(publik_app_info(Some(app_data_root.settings_dir().path().to_path_buf())));

  // Everything publik makes or receives stays in `~/Artcraft/publik`.
  let publik_local_store = PublikLocalStore::new(app_data_root.path());

  println!("Initializing backend runtime...");

  let builder = tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_upload::init())
    .setup(move |app| {
      let app = app.handle().clone();
      let handle = app.clone();
      let root = app_data_root_2.clone();

      tauri::async_runtime::block_on(async move {
        if let Err(err) = setup_main_window(&app).await {
          error!("Failed to set up the main window: {:?}", err);
        }

        let result = handle_tauri_startup(handle, root).await;

        if let Err(err) = result {
          error!("Failed to handle Tauri startup: {:?}", err);
          panic!("Failed to handle Tauri startup: {:?}", err);
        }
      });

      Ok(())
    })
    .manage(app_data_root)
    .manage(app_preferences)
    .manage(artcraft_platform_info)
    .manage(provider_credential_cache)
    .manage(publik_ai_state)
    .manage(publik_local_store);

  // TODO: Break this out into another module, because RustRover/IntelliJ lags with these macros.
  //  My first attempt at naively doing this didn't work because the macros can't find their codegen'd targets.
  let builder = builder.invoke_handler(tauri::generate_handler![
    // publik API: the only AI provider.
    generate_image_command,
    publik_close_setup_command,
    publik_dismiss_notice_command,
    publik_forget_key_command,
    publik_get_status_command,
    publik_import_image_command,
    publik_improve_prompt_command,
    publik_link_computer_command,
    publik_list_results_command,
    publik_mark_first_card_shown_command,
    publik_set_own_key_command,
    publik_speech_command,
    publik_transcribe_command,
    // Local files, settings, tasks and windows.
    download_directory_reveal_command,
    download_media_file_command,
    download_url_command,
    flip_image,
    get_app_info_command,
    get_app_preferences_command,
    get_download_path_command,
    get_provider_order_command,
    get_task_queue_command,
    load_without_cors_command,
    mark_task_as_dismissed_command,
    media_file_delete_command,
    platform_info_command,
    provider_clear_command,
    provider_list_command,
    provider_set_api_key_command,
    set_provider_order_command,
    tasks_nuke_all_command,
    update_app_preferences_command,
    // Zero or empty, with no network.
    estimate_audio_cost_command,
    estimate_image_cost_command,
    estimate_mesh_cost_command,
    estimate_splat_cost_command,
    estimate_video_cost_command,
    list_image_models_command,
    list_video_models_command,
    // "<Feature> is not available in this build.", with no network.
    check_sora_session_command,
    enqueue_image_bg_removal_command,
    enqueue_image_to_3d_object_command,
    enqueue_image_to_gaussian_command,
    generate_audio_command,
    generate_mesh_command,
    generate_splat_command,
    generate_video_command,
    grok_clear_credentials_command,
    grok_get_credential_info_command,
    grok_open_login_command,
    midjourney_clear_credentials_command,
    midjourney_get_credential_info_command,
    midjourney_open_login_command,
    open_sora_login_command,
    sora_get_credential_info_command,
    sora_logout_command,
    worldlabs_clear_credentials_command,
    worldlabs_get_credential_info_command,
    worldlabs_open_login_command,
    worldlabs_receive_bearer_command,
  ]);

  builder.run(tauri::generate_context!("tauri.conf.json"))
    .expect("error while running tauri application");
}
