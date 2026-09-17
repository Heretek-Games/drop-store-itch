import type {
  ClientPlugin,
  ClientPluginContext,
  ScannedGame,
  StoreScanner,
} from "@droposs/plugin-sdk";

export interface StoreCandidate {
  externalId: string;
  title: string;
  installPath: string;
  executablePath?: string;
}

/**
 * Storage keys the desktop host (or a host-side collector) is expected to
 * populate. Locating and reading itch's `butler.db` (SQLite) is a host
 * responsibility: this plugin has no arbitrary filesystem access and never
 * probes the OS.
 *
 * - `dbPath`: resolved `butler.db` location (host reports where it read)
 * - `caveRows`: parsed `caves` rows, e.g. `sqlite3 -json butler.db` output
 * - `library`: optional pre-normalized candidate array (legacy fallback)
 */
export const ITCH_STORAGE_KEYS = {
  dbPath: "dbPath",
  caveRows: "caveRows",
  library: "library",
} as const;

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function isAbsolutePath(value: string): boolean {
  return (
    value.startsWith("/") ||
    value.startsWith("\\") ||
    /^[a-zA-Z]:[\\/]/.test(value)
  );
}

function joinWith(separator: string, ...parts: string[]): string {
  const filtered = parts.filter((part) => part.length > 0);
  return filtered
    .map((part, index) => {
      let segment = part;
      if (index > 0) segment = segment.replace(/^[\\/]+/, "");
      if (index < filtered.length - 1) segment = segment.replace(/[\\/]+$/, "");
      return segment;
    })
    .join(separator);
}

function joinPath(...parts: string[]): string {
  const separator = parts.some((part) => part.includes("\\")) ? "\\" : "/";
  return joinWith(separator, ...parts);
}

function resolveExecutable(
  executable: string,
  installPath: string,
): string {
  if (isAbsolutePath(executable) || installPath.length === 0) return executable;
  return joinPath(installPath, executable);
}

/**
 * Resolve itch's `butler.db` path for an explicitly supplied platform and
 * environment map. The host owns OS detection and passes its own platform/env
 * values; this function never reads `process.platform` itself and returns
 * `null` for unknown platforms or missing environment variables.
 */
export function resolveItchDbPath(
  platform: string,
  env: Record<string, string | undefined>,
): string | null {
  switch (platform) {
    case "win32": {
      const appData = env["APPDATA"];
      return appData ? joinWith("\\", appData, "itch", "db", "butler.db") : null;
    }
    case "darwin": {
      const home = env["HOME"];
      return home
        ? joinWith("/", home, "Library", "Application Support", "itch", "db", "butler.db")
        : null;
    }
    case "linux": {
      const home = env["HOME"];
      const configHome =
        env["XDG_CONFIG_HOME"] ||
        (home ? joinWith("/", home, ".config") : undefined);
      return configHome
        ? joinWith("/", configHome, "itch", "db", "butler.db")
        : null;
    }
    default:
      return null;
  }
}

interface ItchGameRecord {
  id?: unknown;
  title?: unknown;
  [key: string]: unknown;
}

function parseItchGame(value: unknown): ItchGameRecord | null {
  let record: unknown = value;
  if (typeof value === "string") {
    try {
      record = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof record !== "object" || record === null || Array.isArray(record)) {
    return null;
  }
  return record as ItchGameRecord;
}

function extractCaveRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (typeof payload === "object" && payload !== null) {
    const caves = (payload as Record<string, unknown>)["caves"];
    if (Array.isArray(caves)) return caves;
  }
  return [];
}

/**
 * Map parsed itch `caves` rows (or a `{ caves: [...] }` export) to candidates.
 * The `game` column may be a JSON string or an object; `game_id` may be null
 * when the game record is embedded. Rows without an id are skipped.
 */
export function parseItchCaveRows(payload: unknown): StoreCandidate[] {
  const candidates: StoreCandidate[] = [];
  for (const row of extractCaveRows(payload)) {
    if (typeof row !== "object" || row === null) continue;
    const record = row as Record<string, unknown>;
    const game = parseItchGame(record["game"]);
    const externalId = String(
      record["gameId"] ?? record["game_id"] ?? record["gameID"] ?? game?.["id"] ?? "",
    );
    if (externalId.length === 0) continue;
    const title = String(
      record["title"] ?? record["name"] ?? game?.["title"] ?? "Unknown",
    );
    const installPath = String(
      record["path"] ?? record["installPath"] ?? record["install_path"] ?? "",
    );
    const executable = firstString(
      record["executablePath"],
      record["executable_path"],
      record["executable"],
    );
    candidates.push({
      externalId,
      title,
      installPath,
      executablePath:
        executable === undefined
          ? undefined
          : resolveExecutable(executable, installPath),
    });
  }
  return candidates;
}

/**
 * Normalize a pre-scanned candidate array (legacy/fallback source). Only
 * values explicitly present are copied; executable paths are never guessed.
 */
export function parseLibraryEntries(payload: unknown): StoreCandidate[] {
  const entries = (Array.isArray(payload) ? payload : []) as Array<
    Record<string, unknown>
  >;
  return entries
    .map((entry) => ({
      externalId: String(entry.appid ?? entry.id ?? entry.externalId ?? ""),
      title: String(entry.name ?? entry.title ?? "Unknown"),
      installPath: String(entry.installdir ?? entry.installPath ?? ""),
      executablePath: entry.executablePath
        ? String(entry.executablePath)
        : undefined,
    }))
    .filter((entry) => entry.externalId.length > 0);
}

export interface ItchSnapshot {
  caveRows?: unknown;
  entries?: unknown;
}

/**
 * Combine raw itch artifacts into candidates. Returns an empty array when the
 * host supplied nothing: locating and reading `butler.db` requires host-side
 * SQLite access (see README "Host requirements").
 */
export function collectItchCandidates(snapshot: ItchSnapshot): StoreCandidate[] {
  const candidates = parseItchCaveRows(snapshot.caveRows);
  if (candidates.length === 0) {
    candidates.push(...parseLibraryEntries(snapshot.entries));
  }
  return candidates;
}

/**
 * itch.io library scanner. Detection is injected so it can be unit-tested
 * without touching the filesystem; the desktop host resolves `butler.db`,
 * reads the SQLite rows, and exposes them via plugin storage. `scan()` returns
 * `[]` when the host has not populated that data.
 */
export class ItchScanner implements StoreScanner {
  id = "itch";
  name = "itch.io";
  store = "itch";

  constructor(
    private readonly detect: () => Promise<StoreCandidate[]>,
  ) {}

  async scan(): Promise<ScannedGame[]> {
    const candidates = await this.detect();
    return candidates.map((candidate) => ({
      externalId: candidate.externalId,
      store: "itch",
      title: candidate.title,
      installPath: candidate.installPath,
      executablePath: candidate.executablePath,
    }));
  }
}

export async function detectFromStorage(
  ctx: ClientPluginContext,
): Promise<StoreCandidate[]> {
  const [caveRows, entries] = await Promise.all([
    ctx.storage.get<unknown>(ITCH_STORAGE_KEYS.caveRows),
    ctx.storage.get<unknown>(ITCH_STORAGE_KEYS.library),
  ]);
  return collectItchCandidates({ caveRows, entries });
}

export default class ItchPlugin implements ClientPlugin {
  metadata = {
    apiVersion: 2,
    id: "drop-store-itch",
    name: "itch.io",
    version: "0.1.0",
  };

  async init(ctx: ClientPluginContext): Promise<void> {
    const scanner = new ItchScanner(() => detectFromStorage(ctx));
    ctx.registerStoreScanner(scanner);
    ctx.logger.info("itch.io store scanner registered");
  }
}
