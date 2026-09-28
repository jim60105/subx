//! System-level commands; `ping` is the end-to-end pattern reference for the
//! `Result<T, ErrorDto>` command convention.

use crate::build_info;
use crate::dto::{PingResponse, VersionInfoDto};
use crate::error::ErrorDto;

#[tauri::command]
#[specta::specta]
pub fn ping() -> Result<PingResponse, ErrorDto> {
    Ok(PingResponse {
        message: "pong".to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

#[tauri::command]
#[specta::specta]
pub fn get_build_info() -> Result<VersionInfoDto, ErrorDto> {
    Ok(build_info::to_dto())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ping_returns_pong_and_version() {
        let response = ping().expect("ping must succeed");
        assert_eq!(response.message, "pong");
        assert_eq!(response.app_version, env!("CARGO_PKG_VERSION"));
    }
}
