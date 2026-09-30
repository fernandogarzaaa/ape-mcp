// CI/local fixture: serves a TUI binary + matching SHA256SUMS exactly like
// a GitHub Release (flat paths: /SHA256SUMS, /<asset>), logging every
// request path. Usage:
//   node scripts/ci-tui-fixture.mjs <binary-path> <asset-name> <port> <request-log>
// Used by the tui-pack-install CI job and runnable locally for the same proof.
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFileSync, appendFileSync } from "node:fs";

const [bin, asset, port, log] = process.argv.slice(2);
if (!bin || !asset || !port || !log) {
  console.error("usage: ci-tui-fixture.mjs <binary> <asset-name> <port> <request-log>");
  process.exit(2);
}
const bytes = readFileSync(bin);
const hash = createHash("sha256").update(bytes).digest("hex");
const sums = `${hash}  ${asset}\n`;
createServer((req, res) => {
  try { appendFileSync(log, (req.url ?? "/") + "\n"); } catch { /* log best-effort */ }
  if (req.url === "/SHA256SUMS") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(sums);
  } else if (req.url === `/${asset}`) {
    res.writeHead(200, { "Content-Type": "application/octet-stream" });
    res.end(bytes);
  } else {
    res.writeHead(404);
    res.end("nope");
  }
}).listen(Number(port), "127.0.0.1", () => console.log(`fixture: serving ${asset} (${bytes.length} bytes) on 127.0.0.1:${port}`));
