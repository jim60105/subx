use crate::dto::VersionInfoDto;

pub fn git_hash() -> Option<&'static str> {
    match env!("SUBX_GIT_HASH") {
        "" => None,
        hash => Some(hash),
    }
}

pub fn format_version_string(version: &str, hash: Option<&str>, debug: bool) -> String {
    match hash {
        Some(hash) if debug => format!("{version} ({hash}, debug)"),
        Some(hash) => format!("{version} ({hash})"),
        None => version.to_owned(),
    }
}

pub fn startup_log_line(version: &str, hash: Option<&str>, debug: bool) -> String {
    format!(
        "SubX {} starting",
        format_version_string(version, hash, debug)
    )
}

pub fn to_dto() -> VersionInfoDto {
    VersionInfoDto {
        version: env!("CARGO_PKG_VERSION").to_owned(),
        git_hash: git_hash().map(str::to_owned),
        debug: cfg!(debug_assertions),
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;
    use std::process::Command;

    use super::*;

    // @covers build-identity/startup-log-line-names-the-running-build#launch-logs-the-build-identity
    #[test]
    fn formats_the_running_build_and_startup_line() {
        let version = format_version_string("0.2.0", Some("8e92039"), true);

        assert_eq!(version, "0.2.0 (8e92039, debug)");
        assert_eq!(
            startup_log_line("0.2.0", Some("8e92039"), true),
            "SubX 0.2.0 (8e92039, debug) starting"
        );
    }

    // @covers build-identity/build-identity-embedded-at-compile-time#git-less-build-degrades-to-version-only
    #[test]
    fn a_missing_hash_keeps_the_package_version_alone() {
        assert_eq!(format_version_string("0.2.0", None, true), "0.2.0");
        assert_eq!(startup_log_line("0.2.0", None, true), "SubX 0.2.0 starting");
    }

    // @covers build-identity/build-identity-embedded-at-compile-time#git-backed-build-embeds-the-hash
    #[test]
    fn embeds_the_current_git_head_as_a_short_hash() {
        let embedded = git_hash().expect("SUBX_GIT_HASH must be embedded from a git checkout");
        assert!(
            (7..=40).contains(&embedded.len()),
            "the embedded git hash must be a short object id: {embedded}"
        );
        assert!(
            embedded
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase()),
            "the embedded git hash must use lowercase hexadecimal: {embedded}"
        );

        let output = Command::new("git")
            .args(["rev-parse", "--short", "HEAD"])
            .current_dir(env!("CARGO_MANIFEST_DIR"))
            .output()
            .expect("git must be available in the source checkout");
        assert!(output.status.success(), "git must resolve HEAD");
        let expected = String::from_utf8(output.stdout).expect("git hash must be UTF-8");

        assert_eq!(embedded, expected.trim());
    }

    #[test]
    fn cargo_and_package_versions_stay_in_sync() {
        let package_json = Path::new(env!("CARGO_MANIFEST_DIR")).join("../package.json");
        let contents = fs::read_to_string(package_json).expect("package.json must be readable");
        let package: serde_json::Value =
            serde_json::from_str(&contents).expect("package.json must be valid JSON");
        let package_version = package["version"]
            .as_str()
            .expect("package.json must declare a version");

        assert_eq!(env!("CARGO_PKG_VERSION"), package_version);
    }
}
