# subx

Desktop GUI for [`subx-cli`](https://crates.io/crates/subx-cli) — AI-powered
subtitle matching. Built with Tauri 2, React and TypeScript.

## Development

```bash
npm install          # install frontend dependencies
npm run tauri dev    # run the app
```

Before pushing, run the full verification suite:

```bash
npm run verify
```

This type-checks the frontend, runs both test suites with coverage floors, checks
that every specification scenario traces to a test, and confirms the committed
IPC bindings still match the Rust definitions they are generated from. This
project has no pull-request flow, so `npm run verify` is the primary defence and
CI is the backstop — see [`docs/verification.md`](docs/verification.md) for what
each gate does, how to write a `// @covers` annotation, and when a waiver is
acceptable.
