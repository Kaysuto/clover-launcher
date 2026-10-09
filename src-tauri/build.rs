fn main() {
    // Rebuild the executable's Windows resources when its icon changes.
    println!("cargo:rerun-if-changed=icons/icon.ico");
    tauri_build::build()
}
