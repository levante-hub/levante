# Levante - Personal, Secure, Free, Local AI


Levante is a cross‑platform desktop app (Windows, macOS, Linux) + MCP Support that brings AI tools closer to everyone, not just technical users. It focuses on privacy, clarity, and ease of use.

## Key Features
- **Local and cloud provider model:** choose local (when available) or cloud models per session.
- **Model Context Protocol Store (MCP Store):** browse, add, manage, and invoke tools with explicit, one‑click consent.
- **Privacy by default:** all data (sessions, messages, settings) is stored locally; only calls to cloud AI providers leave your device.

## Download

| Platform | Download Link |
|----------|---------------|
| Windows  | [Download (.exe)](https://github.com/levante-app/releases/latest/download/Levante-Setup.exe) |
| macOS    | [Download (.dmg)](https://github.com/levante-app/releases/latest/download/Levante.dmg) |
| Linux    | [Download (.AppImage)](https://github.com/levante-app/releases/latest/download/Levante.AppImage) |



## Roadmap (high‑level)
1) Foundations: Electron + React, local DB, sessions/messages
2) Multi‑model + streaming (AI SDK)
3) MCP basic (consent + audit)
4) Packaging + auto‑update

## Links
- [Documentation](./docs/)
- [Changelog](./docs/changelog.md)
- Discord
- Bugs Github
- [Contact](https://levante.app/contact)


## Tech Stack
- Electron (Main/Preload/Renderer)
- React + TypeScript (Renderer)
- AI SDK (multi‑provider models)
- SQLite (Turso‑compatible) for local storage
- MCP (Model Context Protocol)

## Getting Started

Expected commands (subject to change):
```bash
pnpm install
pnpm dev      # run app in development
pnpm build    # production build
pnpm package  # create installers per OS
```

## Next Roadmap

1) Upload Files
2) RAG (Long term memory)
3) Voice: Mic & Speak

## How to Contribute

We welcome contributions from the community! Here's how to get started:

### Reporting Issues
- Search existing issues before opening a new one
- Include steps to reproduce, expected vs actual behavior
- Attach relevant logs/screenshots if possible
- Use the appropriate issue template (bug/feature request)

### Development Workflow
1. Fork the repository
2. Create a feature branch (`git checkout -b feat/your-feature`)
3. Commit your changes (`git commit -m 'feat: add new feature'`)
4. Push to the branch (`git push origin feat/your-feature`)
5. Open a Pull Request

### Code Guidelines
- Follow existing code style and patterns
- Include tests for new features
- Keep commits atomic and well-described
- Reference related issues in PR description

### Getting Help
- Join our [Discord](https://discord.gg/levante) for discussions
- Check the [documentation](./docs/) for architecture and ADRs
- Comment on issues if you need clarification



## License

Apache 2.0 with Commons Clause (no right to Sell). For any commercial use, request permission at `support@levante.app`. See `LICENSE`, `COMMERCIAL-LICENSE.md`, and `docs/LEGAL/LICENSING.md`.

