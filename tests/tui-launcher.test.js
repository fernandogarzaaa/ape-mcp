import test from "node:test";
import assert from "node:assert";
// Launcher resolution: prebuilt wins, else verified download, else cargo.
// Localhost fixtures + injected seams; cargo is never invoked here.
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureTui, tuiPlatform } from "../bin/tui-bin.js";
import { ensurePrebuilt } from "../scripts/tui-fetch.mjs";

const BYTES = Buffer.from("fake-launcher-binary");
const HASH = createHash("sha256").update(BYTES).digest("hex");
const EXE = process.platform === "win32" ? "ape-tui.exe" : "ape-tui";

function serve(opts = {}) {
  const { sums = `${HASH}  ${ASSET}`, asset = BYTES, sumsCode = 200, assetCode = 200 } = opts;
  return import("node:http").then(
    (http) =>
      new Promise((resolve) => {
        const server = http.createServer((req, res) => {
          const url = new URL(req.url, "http://x");
          if (url.pathname === "/SHA256SUMS") {
            res.writeHead(sumsCode, { "Content-Type": "text/plain" });
            res.end(sumsCode === 200 ? sums : "missing");
          } else if (url.pathname === `/${ASSET}`) {
            res.writeHead(assetCode, { "Content-Type": "application/octet-stream" });
            res.end(assetCode === 200 ? asset : "missing");
          } else {
            res.writeHead(404);
            res.end("nope");
          }
        });
        server.listen(0, "127.0.0.1", () => {
          resolve({ server, base: `http://127.0.0.1:${server.address().port}` });
        });
      })
  );
}
const ASSET = `ape-tui-${tuiPlatform()}${process.platform === "win32" ? ".exe" : ""}`;

function fakeRoot() {
  const dir = mkdtempSync(join(tmpdir(), "ape-tui-launch-"));
  mkdirSync(join(dir, "vendors", "ape-tui", tuiPlatform()), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", version: "9.9.9" }));
  return dir;
}
function destFor(dir) {
  return join(dir, "vendors", "ape-tui", tuiPlatform(), EXE);
}

test("launcher: prebuilt present wins without network", async () => {
  const dir = fakeRoot();
  const dest = destFor(dir);
  writeFileSync(dest, "existing");
  let fetched = false;
  const got = await ensureTui({
    fromRoot: dir,
    fetchImpl: async () => { fetched = true; throw new Error("must not fetch"); },
    buildFn: () => { throw new Error("must not build"); },
    log: () => {},
  });
  assert.equal(got, dest);
  assert.equal(fetched, false, "no network when prebuilt exists");
});

test("launcher: missing prebuilt downloads verified bytes", async (t) => {
  const { server, base } = await serve();
  t.after(() => server.close());
  const dir = fakeRoot();
  const logs = [];
  const got = await ensureTui({
    fromRoot: dir,
    fetchBase: base,
    buildFn: () => { throw new Error("must not build"); },
    log: (m) => logs.push(m),
  });
  assert.equal(got, destFor(dir));
  assert.deepEqual(readFileSync(destFor(dir)), BYTES);
  assert.ok(logs.some((m) => /fetching|ready/.test(m)), "progress line emitted");
});

test("launcher: offline fetch falls back to cargo path", async () => {
  const dir = fakeRoot();
  const logs = [];
  const got = await ensureTui({
    fromRoot: dir,
    fetchImpl: async () => { throw new Error("offline"); },
    buildFn: () => "/fake/built-ape-tui",
    log: (m) => logs.push(m),
  });
  assert.equal(got, "/fake/built-ape-tui");
  assert.ok(logs.some((m) => /offline/.test(m)), "failure reason surfaced");
});

test("launcher: mismatch falls back and leaves nothing", async (t) => {
  const { server, base } = await serve({ asset: Buffer.from("tampered") });
  t.after(() => server.close());
  const dir = fakeRoot();
  const got = await ensureTui({
    fromRoot: dir,
    fetchBase: base,
    buildFn: () => "/fake/built-ape-tui",
    log: () => {},
  });
  assert.equal(got, "/fake/built-ape-tui");
  assert.ok(!existsSync(destFor(dir)), "mismatched bytes never land");
});

test("ensurePrebuilt never throws: missing version, dead fetch", async () => {
  const dir = fakeRoot();
  const a = await ensurePrebuilt({ version: null, platform: "win-x64", isWindows: true, dest: join(dir, "x.exe") });
  assert.equal(a.status, "skipped");
  const b = await ensurePrebuilt({
    version: "9.9.9", platform: "win-x64", isWindows: true, dest: join(dir, "y.exe"),
    fetchImpl: async () => { throw new Error("offline"); },
  });
  assert.equal(b.status, "failed");
});
