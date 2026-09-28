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
                watch_reference(&git_dir, &common_dir, reference);
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

fn watch_reference(git_dir: &Path, common_dir: &Path, reference: &str) {
    let git_ref = git_dir.join(reference);
    let mut has_loose_ref = watch_existing_file(&git_ref);
    if common_dir != git_dir {
        has_loose_ref |= watch_existing_file(&common_dir.join(reference));
    }

    if !has_loose_ref {
        // An unborn symbolic HEAD has no loose ref yet; watch its nearest
        // existing parent so creating the first commit reruns this script.
        watch_nearest_existing_directory(&git_ref);
        if common_dir != git_dir {
            watch_nearest_existing_directory(&common_dir.join(reference));
        }
    }
}

fn watch_existing_file(path: &Path) -> bool {
    if path.is_file() {
        watch_file(path);
        true
    } else {
        false
    }
}

fn watch_nearest_existing_directory(path: &Path) {
    let mut directory = path.parent();
    while let Some(candidate) = directory {
        if candidate.is_dir() {
            println!("cargo:rerun-if-changed={}", candidate.display());
            return;
        }
        directory = candidate.parent();
    }
}
