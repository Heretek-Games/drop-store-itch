# AGENTS.md — drop-store-itch

itch.io local library scanner client plugin for Drop (#21).

## Toolchain

- Node >= 22, npm 10+
- `npm ci`, `npm run build`, `npm test`, `npm run typecheck`

## Contract

Built on [`@droposs/plugin-sdk`](https://www.npmjs.com/package/@droposs/plugin-sdk)
(plugin API v2, `^0.4.0` from the npm registry).

## Boundaries

- Pure parsing only: cave rows in, `StoreCandidate[]` out.
- `butler.db` is SQLite; the host reads it and supplies parsed rows. The
  plugin only maps rows.
- `resolveItchDbPath` receives platform/env from the host and never probes the
  OS itself.
- The plugin never touches the filesystem and returns `[]` when the host has
  not supplied a snapshot.
- Host-side file access (`game:scan`) is documented in `README.md`.
