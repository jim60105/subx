//! System-level commands; `ping` is the end-to-end pattern reference for the
//! `Result<T, ErrorDto>` command convention.

use crate::dto::PingResponse;
use crate::error::ErrorDto;

#[tauri::command]
pub fn ping() -> Result<PingResponse, ErrorDto> {
    Ok(PingResponse {
        message: "pong".to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    })
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
