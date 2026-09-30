import test from "node:test";
import assert from "node:assert";
// Checksum-verified TUI fetch: happy path, mismatch (no file left behind),
// missing sums, asset absent from sums. Localhost fixtures, no network.
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchTui, parseSums, assetName } from "../scripts/tui-fetch.mjs";

const BYTES = Buffer.from("fake-ape-tui-binary");
const HASH = createHash("sha256").update(BYTES).digest("hex");

function serve({ sums = `${HASH}  ape-tui-win-x64.exe\n`, asset = BYTES, sumsCode = 200, assetCode = 200 } = {}) {
  return import("node:http").then(
    (http) =>
      new Promise((resolve) => {
        const server = http.createServer((req, res) => {
          if (req.url === "/SHA256SUMS") {
            res.writeHead(sumsCode, { "Content-Type": "text/plain" });
            res.end(sumsCode === 200 ? sums : "missing");
          } else if (req.url === "/ape-tui-win-x64.exe") {
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

test("tui-fetch: asset names + sums parsing", () => {
  assert.equal(assetName("win-x64", true), "ape-tui-win-x64.exe");
  assert.equal(assetName("linux-x64", false), "ape-tui-linux-x64");
  assert.equal(parseSums(`${HASH}  ape-tui-win-x64.exe\nabcdef  other\n`, "ape-tui-win-x64.exe"), HASH);
  assert.equal(parseSums("garbage\n", "ape-tui-win-x64.exe"), null);
});

test("tui-fetch: happy path writes verified bytes", async (t) => {
  const { server, base } = await serve();
  t.after(() => server.close());
  const dir = mkdtempSync(join(tmpdir(), "ape-tui-fetch-"));
  const dest = join(dir, "ape-tui.exe");
  const r = await fetchTui({ tag: "v9.9.9", platform: "win-x64", isWindows: true, dest, fetchBase: base });
  assert.equal(r.ok, true);
  assert.equal(r.bytes, BYTES.length);
  assert.deepEqual(readFileSync(dest), BYTES);
});

test("tui-fetch: mismatch deletes and leaves nothing behind", async (t) => {
  const { server, base } = await serve({ asset: Buffer.from("tampered-by-mitm") });
  t.after(() => server.close());
  const dir = mkdtempSync(join(tmpdir(), "ape-tui-fetch-"));
  const dest = join(dir, "ape-tui.exe");
  const r = await fetchTui({ tag: "v9.9.9", platform: "win-x64", isWindows: true, dest, fetchBase: base });
  assert.equal(r.ok, false);
  assert.match(r.reason, /checksum mismatch/);
  assert.ok(!existsSync(dest), "no partial or mismatched file left behind");
});

test("tui-fetch: missing sums or asset never writes", async (t) => {
  const noSums = await serve({ sumsCode: 404 });
  t.after(() => noSums.server.close());
  const dir = mkdtempSync(join(tmpdir(), "ape-tui-fetch-"));
  const d1 = join(dir, "a.exe");
  const r1 = await fetchTui({ tag: "v9.9.9", platform: "win-x64", isWindows: true, dest: d1, fetchBase: noSums.base });
  assert.equal(r1.ok, false);
  assert.match(r1.reason, /checksums unavailable/);
  assert.ok(!existsSync(d1));
  const noAsset = await serve({ assetCode: 404 });
  t.after(() => noAsset.server.close());
  const d2 = join(dir, "b.exe");
  const r2 = await fetchTui({ tag: "v9.9.9", platform: "win-x64", isWindows: true, dest: d2, fetchBase: noAsset.base });
  assert.equal(r2.ok, false);
  assert.match(r2.reason, /download failed/);
  assert.ok(!existsSync(d2));
});
