# Claude Desktop Pro — Engineering Context

## Project
Tauri 2.0 macOS app. Rust backend + React frontend.
Claude-only models + MCP protocol + Super Agent.
Course companion for AI Boundless Academy. Target: Chinese market.

## Tech Stack
- Frontend: React 18 + TypeScript 5 + Vite 6 + Tailwind CSS 4 + shadcn/ui + Zustand 5
- Backend: Rust (tokio, reqwest, rusqlite, keyring-rs)
- Database: SQLite with WAL mode + FTS5
- MCP: rmcp crate (added later)

## Directory Structure
| Directory | Purpose |
|-----------|---------|
| src/app/ | Page-level React components |
| src/components/ui/ | shadcn/ui components |
| src/components/atoms/ | Custom atomic components |
| src/components/molecules/ | Composite components |
| src/components/organisms/ | Complex organisms (Sidebar, Topbar) |
| src/hooks/ | Custom React hooks |
| src/stores/ | Zustand state stores |
| src/types/ | TypeScript type definitions |
| src/lib/ | Utility functions |
| src-tauri/src/core/ | Core engine (adapter, network, stream, tokens) |
| src-tauri/src/agent/ | Agent runtime, tools, security |
| src-tauri/src/mcp/ | MCP protocol host |
| src-tauri/src/bridge/ | Tauri IPC command handlers |
| src-tauri/src/data/ | Database schema, repos, keychain |
| src-tauri/src/system/ | macOS integration (tray, shortcuts, notifications) |

## Security Rules
- API keys → macOS Keychain ONLY (service: com.ai-boundless.claude-desktop-pro)
- Never log/serialize API keys or proxy credentials
- All user input sanitized before WebView
- Agent tools: three-tier permission (auto/approval/deny)
- MCP Server tools: same permission gate as Agent tools
- SQLite file permissions: 600
- Markdown: rehype-sanitize, no script/iframe/object

## Rust Standards
- Edition 2021, zero unwrap() in non-test code
- Errors: thiserror typed variants
- Async: tokio, cancellation-safe
- Clippy: zero warnings
- Doc comments on all pub items
- UUID v7 for all IDs

## TypeScript Standards
- Strict mode, no any
- React: functional + hooks
- State: Zustand, no prop drilling >2 levels
- Styling: Tailwind only (no inline styles)
- All IPC returns typed via src/types/

## Verification Commands
```bash
source "$HOME/.cargo/env"
cd src-tauri && cargo clippy --all-targets -- -D warnings
cd src-tauri && cargo test
npm run lint
npm run build
```
