import test from "node:test";
import assert from "node:assert/strict";
import { MockClientPluginContext } from "@droposs/plugin-sdk";
import Plugin, {
  ItchScanner,
  collectItchCandidates,
  parseItchCaveRows,
  parseLibraryEntries,
  resolveItchDbPath,
} from "../src/index.js";
import {
  absoluteExecutableCaveRows,
  caveDbExport,
  caveRows,
} from "./fixtures/itch.js";

test("drop-store-itch registers a store scanner", async () => {
  const ctx = new MockClientPluginContext("drop-store-itch", ["client:library-scan"]);
  await new Plugin().init(ctx);
  assert.equal(ctx.storeScanners.length, 1);
  assert.equal(ctx.storeScanners[0].store, "itch");
});

test("drop-store-itch parses library entries", () => {
  const entries = parseLibraryEntries([{ appid: 570, name: "Dota 2", installdir: "/games/dota" }]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].externalId, "570");
});

test("drop-store-itch scanner maps candidates", async () => {
  const scanner = new ItchScanner(async () => [
    { externalId: "1", title: "Game", installPath: "/games/game" },
  ]);
  const games = await scanner.scan();
  assert.equal(games.length, 1);
  assert.equal(games[0].store, "itch");
});

test("resolveItchDbPath resolves the Windows APPDATA path", () => {
  assert.equal(
    resolveItchDbPath("win32", { APPDATA: "C:\\Users\\john\\AppData\\Roaming" }),
    "C:\\Users\\john\\AppData\\Roaming\\itch\\db\\butler.db",
  );
  assert.equal(resolveItchDbPath("win32", {}), null);
});

test("resolveItchDbPath resolves the macOS path", () => {
  assert.equal(
    resolveItchDbPath("darwin", { HOME: "/Users/john" }),
    "/Users/john/Library/Application Support/itch/db/butler.db",
  );
  assert.equal(resolveItchDbPath("darwin", {}), null);
});

test("resolveItchDbPath resolves the Linux path with XDG override", () => {
  assert.equal(
    resolveItchDbPath("linux", { HOME: "/home/john" }),
    "/home/john/.config/itch/db/butler.db",
  );
  assert.equal(
    resolveItchDbPath("linux", { HOME: "/home/john", XDG_CONFIG_HOME: "/home/john/.config-custom" }),
    "/home/john/.config-custom/itch/db/butler.db",
  );
  assert.equal(resolveItchDbPath("linux", {}), null);
});

test("resolveItchDbPath returns null for unknown platforms", () => {
  assert.equal(resolveItchDbPath("freebsd", { HOME: "/home/john" }), null);
});

test("parseItchCaveRows maps cave rows and parses embedded game JSON", () => {
  const candidates = parseItchCaveRows(caveRows);
  assert.equal(candidates.length, 2);
  assert.deepEqual(candidates[0], {
    externalId: "267856",
    title: "Celeste",
    installPath: "C:\\Games\\itch\\celeste",
    executablePath: undefined,
  });
  assert.deepEqual(candidates[1], {
    externalId: "408527",
    title: "A Short Hike",
    installPath: "/home/john/Games/itch/a-short-hike",
    executablePath: "/home/john/Games/itch/a-short-hike/bin/a-short-hike",
  });
});

test("parseItchCaveRows accepts a { caves } export", () => {
  assert.equal(parseItchCaveRows(caveDbExport).length, 2);
});

test("parseItchCaveRows preserves absolute executables", () => {
  const candidates = parseItchCaveRows(absoluteExecutableCaveRows);
  assert.equal(candidates[0].executablePath, "/opt/games/absolute/run.sh");
});

test("collectItchCandidates falls back to pre-scanned entries", () => {
  const candidates = collectItchCandidates({
    entries: [{ appid: 570, name: "Dota 2", installdir: "/games/dota" }],
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].externalId, "570");
});

test("collectItchCandidates returns empty when host supplied nothing", () => {
  assert.deepEqual(collectItchCandidates({}), []);
  assert.deepEqual(collectItchCandidates({ caveRows: [null, {}] }), []);
});

test("scan returns empty until the host populates cave rows", async () => {
  const ctx = new MockClientPluginContext("drop-store-itch", ["client:library-scan"]);
  await new Plugin().init(ctx);
  const games = await ctx.storeScanners[0].scan();
  assert.deepEqual(games, []);
});

test("scanner consumes host-provided storage snapshot", async () => {
  const ctx = new MockClientPluginContext("drop-store-itch", ["client:library-scan"]);
  await ctx.storage.set("caveRows", caveRows);
  await new Plugin().init(ctx);
  const games = await ctx.storeScanners[0].scan();
  assert.equal(games.length, 2);
  assert.equal(games[0].externalId, "267856");
  assert.equal(games[0].title, "Celeste");
});
