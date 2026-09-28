use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

fn main() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let hash = git_hash(&manifest_dir);

    println!("cargo:rustc-env=SUBX_GIT_HASH={hash}");
    watch_git_metadata(&manifest_dir);
    tauri_build::build();
}

fn git_hash(manifest_dir: &Path) -> String {
    Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .current_dir(manifest_dir)
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|stdout| stdout.trim().to_owned())
        .unwrap_or_default()
}

fn watch_git_metadata(manifest_dir: &Path) {
    let Some((git_dir, common_dir)) = git_directories(manifest_dir) else {
        return;
    };

    let head = git_dir.join("HEAD");
    watch_file(&head);

    if let Ok(contents) = fs::read_to_string(&head) {
        if let Some(reference) = contents.trim().strip_prefix("ref:").map(str::trim) {
            if !reference.is_empty() {
                watch_file(&git_dir.join(reference));
                if common_dir != git_dir {
                    watch_file(&common_dir.join(reference));
                }
            }
        }
    }

    watch_file(&git_dir.join("packed-refs"));
    if common_dir != git_dir {
        watch_file(&common_dir.join("packed-refs"));
    }
}

fn git_directories(manifest_dir: &Path) -> Option<(PathBuf, PathBuf)> {
    let checkout_root = manifest_dir.parent()?;
    let git_marker = checkout_root.join(".git");
    let git_dir = if git_marker.is_dir() {
        git_marker
    } else {
        let pointer = fs::read_to_string(&git_marker).ok()?;
        let target = pointer.trim().strip_prefix("gitdir:")?.trim();
        if target.is_empty() {
            return None;
        }
        resolve_path(checkout_root, Path::new(target))
    };
    let git_dir = resolve_path(checkout_root, &git_dir);

    let common_dir = fs::read_to_string(git_dir.join("commondir"))
        .ok()
        .map(|path| resolve_path(&git_dir, Path::new(path.trim())))
        .unwrap_or_else(|| git_dir.clone());

    Some((git_dir, common_dir))
}

fn resolve_path(base: &Path, path: &Path) -> PathBuf {
    let path = if path.is_absolute() {
        path.to_path_buf()
    } else {
        base.join(path)
    };
    fs::canonicalize(&path).unwrap_or(path)
}

fn watch_file(path: &Path) {
    if path.is_file() {
        println!("cargo:rerun-if-changed={}", path.display());
    }
}
