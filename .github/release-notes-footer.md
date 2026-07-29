## Installation Notes & Security Caveats

This release is distributed without Apple Developer or Windows Authenticode code-signing signatures.

### Linux Compatibility Floor
- Built against **glibc 2.39** (Ubuntu 24.04+, Debian 13+, Fedora 40+). Prebuilt binaries require glibc 2.39 or newer on Linux systems.

### macOS Security Gatekeeper
- Unsigned binaries trigger macOS Gatekeeper ("SubX is damaged and can't be opened"). Remove the quarantine attribute after installation:
  ```bash
  xattr -dr com.apple.quarantine /Applications/SubX.app
  ```

### Windows SmartScreen
- Windows Defender SmartScreen may show an untrusted publisher warning on launch. Click **More info**, then select **Run anyway**.

### Verifying Build Provenance
- Verify the authentic build provenance of any released asset using the GitHub CLI:
  ```bash
  gh attestation verify <file> --repo jim60105/subx
  ```
