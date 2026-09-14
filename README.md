# itch.io

itch.io local library scanner client plugin for Drop (#21).

## Build

```sh
npm ci
npm run build
npm test
npm run typecheck
```

## Host requirements

The Drop plugin API exposes no arbitrary filesystem access, and reading itch's
`butler.db` needs SQLite, so nothing in this plugin touches the filesystem or
probes the OS. Library discovery is a host responsibility: the desktop host's
`game:scan` service resolves the database path, queries it, and hands the rows
to the plugin through plugin storage.

| Method | Requires host `game:scan`? | Input |
| :--- | :--- | :--- |
| `resolveItchDbPath` | No (caller supplies platform + env) | Explicit platform string and env map |
| `parseItchCaveRows` | No (host reads SQLite) | Parsed `caves` rows or `{ caves }` export |
| `collectItchCandidates`, `parseLibraryEntries` | No | Host-supplied snapshot / pre-scanned arrays |
| `detectFromStorage` | No (reads `ctx.storage` only) | Host-populated storage keys |
| `ItchScanner.scan` | Indirectly | Whatever the host supplied; `[]` otherwise |

Storage keys the host populates:

- `dbPath`: resolved `butler.db` path the host read (informational)
- `caveRows`: parsed `caves` rows, e.g. `sqlite3 -json butler.db "select ..."`
- `library`: optional pre-normalized candidate array (legacy fallback)

`resolveItchDbPath` takes `platform` and an env map as arguments; it never reads
`process.platform`/`process.env` itself, so the host stays in charge of OS
detection and `scan()` returns `[]` until the host supplies a snapshot.
