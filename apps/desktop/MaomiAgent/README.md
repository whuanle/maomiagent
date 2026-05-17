# MaomiAgent Electrobun Desktop

Minimal desktop shell scaffolded from the Electrobun hello-world and React/Vite templates.

## Commands

```bash
bun install
bun run brand:generate
bun run dev
bun run dev:stable
bun run dev:hmr
bun run build
bun run test
```

## Structure

- `src/bun/index.ts`: Electrobun main process entry.
- `src/bun/desktop-host.ts`: Bun-side composition root. It creates runtime context, loads the root shell module, starts the IOC module host, and installs process handlers.
- `src/bun/shared/*`: Bun-host shared adapters and source-level bridges, including the local IOC re-export used while the kernel package is consumed from source.
- `src/bun/modules/*`: Bun-host feature modules. Each module owns its abstraction, implementation, composition, and tests instead of placing all files in one flat folder.
- `src/bun/tests/*`: Bun-host integration and infrastructure tests that are not owned by one feature module.
- `src/mainview/*`: React renderer.
- `docs/frontend-architecture.md`: renderer layering, migration constraints, and route cutover checklist for future desktop page moves.
- `src/mainview/public/branding/*`: desktop logo, favicon and source icon assets.
- `electrobun.config.ts`: app metadata and packaged view copy rules.

Module directory convention:

```text
src/bun/modules/<module>/
	abstraction/
		enums/        # stable enum values and literal unions
		models/       # DTOs, records, options and value types
		ports/        # interfaces consumed across modules
		tokens/       # IOC tokens for ports and shared contracts
	implementation/
		services/     # concrete services
		stores/       # persistence implementations
		adapters/     # host or vendor adapters when needed
	composition/    # DependencyModule wiring and aliases
	tests/          # focused module tests
	index.ts        # public module barrel
```

Current Bun-side modules:

- `foundation`: app info, startup trace and desktop runtime context tokens.
- `configuration`: merged desktop configuration from runtime defaults, JSON files, environment variables and bootstrap overrides.
- `database`: database connection and entity metadata ports. It owns concrete SQLite connections; upper modules use database ports instead of importing `bun:sqlite` directly. Configured connections are loaded from `database.connections.*`.
- `window`: main window model, port, service implementation and IOC wiring.
- `logs`: runtime log models, writer/query/logger ports, SQL-backed store, logger factory and IOC wiring.
- `observability`: OpenTelemetry tracing configuration, health checks and host observability wiring.
- `workspace`: project directory record ports, SQL-backed store and logging.
- `shell`: top-level desktop shell lifecycle module that depends on window, observability and workspace capabilities.

## Notes

- `bun run dev` now starts a script-managed Vite HMR server on a local ephemeral port and points the desktop shell to that exact server, so frontend edits appear without restarting the app.
- `bun run dev:stable` keeps the bundled non-watch launch path on Windows.
- In the stable dev path, the titlebar refresh button rebuilds the bundled renderer before reloading the main view, so renderer edits can still be checked without restarting the app.
- Desktop startup now enforces single-instance activation per app channel. Launching the same desktop shell twice restores and focuses the existing main window instead of starting a duplicate process.
- Desktop dev startup checks for an already running dev instance before launching a duplicate shell, so a second launch activates the existing app instead of failing on the locked `build/dev-win-x64` directory.
- `bun run brand:generate` renders PNG app icons from the project SVG logo so the renderer favicon and desktop icon stay in sync.
- Bun main process now boots through `kernel/src/ioc` service collection and module host, so future desktop capabilities can land as dependency modules instead of growing directly inside `src/bun/index.ts`.
- Desktop configuration is now an IOC module (`desktop.configuration`). It merges runtime defaults, `~/.maomiagent/desktop/config.json`, local `desktop.config*.json`, `MAOMI_DESKTOP_CONFIG_FILE`, `MAOMI_DESKTOP_CONFIG_JSON`, environment variables and bootstrap overrides; modules read typed values from `DESKTOP_CONFIGURATION_PORT` instead of loading configuration themselves.
- Desktop database access is now an IOC module (`desktop.database`). It exposes connection/query/transaction ports and entity metadata registration, while concrete Bun SQLite ownership stays inside the database module.
- Desktop database configuration can declare multiple connections under `database.connections`. Defaults include `runtimeLogs` and `workspace`; set `MAOMI_DESKTOP_LOG_DB_PATH` or `MAOMI_DESKTOP_WORKSPACE_DB_PATH` for local overrides.
- Desktop logging is now an IOC module (`desktop.logs`) with writer/query/logger-factory ports. By default it stores logs under `~/.maomiagent/desktop/logs/logs.sqlite`; set `MAOMI_DESKTOP_LOG_DB_PATH` to override it through configuration.
- Desktop observability is now an IOC module (`desktop.observability`) with tracing and health ports. Configure OTLP traces with `MAOMI_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` or `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`; set `MAOMI_OTEL_CONSOLE_EXPORTER=1` to mirror spans to the console during local debugging.
- Desktop workspace management is now an IOC module (`desktop.workspace`) with query/command ports. The first slice only manages project directory records: create by directory path, list/search, update metadata/path and remove records through the database port. It does not activate, restore, stop, inspect Git, create empty workspaces, or mutate project directories.
- The desktop renderer is now self-contained under `src/mainview/*`. Do not import renderer code or shared runtime helpers from the legacy `app/` project into this package.
- Routes that are not feature-complete yet still stay inside the desktop shell as native placeholders; do not fall back to the legacy app route tree.
- Before claiming a desktop page migration is complete, follow `docs/frontend-architecture.md`: keep the route on a mainview-native page, carry over the shipped UI design, and do not treat the page as migrated until the Bun module, desktop RPC, renderer bridge, and rewritten page logic are all wired.