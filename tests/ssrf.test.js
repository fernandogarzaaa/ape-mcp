import test from "node:test";
import assert from "node:assert/strict";
// M6: parser-aware SSRF validation. Unit matrix over every representation on
// the blocklist (no network: literals + special-cased localhost only), plus
// live redirect-chain behavior against loopback fixtures (harness flag) and a
// cross-origin body—isolation proof.
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";
process.env.APE_DATA_DIR = mkdtempSync(join(tmpdir(), "ape-ssrf-"));
import { normalizeIP, ipBlocked, ssrfCheck } from "../src/connectors.js";
import { dispatchCall } from "../src/server.js";
// NOTE: APE_ALLOW_PRIVATE_EGRESS is toggled per test below. The unit matrix
// runs with the net ENGAGED (flag off); loopback fixtures need it ON.
const FLAG = "APE_ALLOW_PRIVATE_EGRESS";
function flagOn() { process.env[FLAG] = "1"; }
function flagOff() { delete process.env[FLAG]; }

test("ssrf: every listed representation is recognized and blocked", async () => {
  flagOff();
  const blocked = [
    "127.0.0.1", "localhost", "::1", "::",
    "::ffff:7f00:1", "::ffff:127.0.0.1", "0:0:0:0:0:ffff:7f00:1",
    "169.254.169.254", "10.0.0.5", "172.16.9.9", "172.31.255.255", "192.168.1.1",
    "fc00::1", "fd00::1", "fe80::1", "fe80::1%eth0",
    "127.1", "10.1", "127.0.0.1".replace("127", "0177"),
    "0x7f000001", "0x7f.0.0.1", "2130706433",
  ];
  for (const h of blocked) {
    const lit = normalizeIP(h);
    const viaIp = lit ? ipBlocked(lit) : ipBlocked(h);
    const verdict = await ssrfCheck(h);
    assert.ok(viaIp === true || (typeof verdict === "string" && verdict.length > 0), `${h}: blocked (lit=${lit}, verdict=${verdict})`);
  }
});

test("ssrf: public literals pass, normalization is exact", () => {
  flagOff();
  assert.equal(normalizeIP("8.8.8.8"), "8.8.8.8");
  assert.equal(normalizeIP("127.1"), "127.0.0.1", "short form expands");
  assert.equal(normalizeIP("0x7f000001"), "127.0.0.1", "hex single-number expands");
  assert.equal(normalizeIP("2130706433"), "127.0.0.1", "decimal single-number expands");
  assert.equal(normalizeIP("10.1"), "10.0.0.1", "two-part expands");
  assert.equal(normalizeIP("8.8.8.8"), "8.8.8.8");
  assert.equal(ipBlocked("8.8.8.8"), false, "public passes");
  assert.equal(ipBlocked("1.1.1.1"), false, "public passes");
  assert.equal(normalizeIP("999.999.999.999.999"), null, "garbage stays null");
});

function fixture(routes) {
  return new Promise((resolve) => {
    const seen = [];
    const srv = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", () => {
        seen.push({ url: req.url, method: req.method, body });
        const r = routes[req.url];
        if (r?.redirect) {
          res.writeHead(302, { location: r.redirect });
          return res.end();
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    srv.listen(0, "127.0.0.1", () => resolve({ srv, port: srv.address().port, seen }));
  });
}

function writeConn(name, yaml) {
  const dir = join(process.env.APE_DATA_DIR, "connectors");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.yaml`), yaml);
}

test("ssrf: hop to non-allowlisted host is egress_denied_redirect", async () => {
  flagOn();
  try {
  const target = await fixture({});
  await new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      if (req.url === "/start") {
        res.writeHead(302, { location: `http://127.0.0.2:${target.port}/x` });
        return res.end();
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
    });
    srv.listen(0, "127.0.0.1", () => resolve({ srv, port: srv.address().port }));
  }).then(async ({ srv, port }) => {
    try {
      writeConn("tmp-redir2", [
        "name: tmp-redir2",
        `base_url: http://127.0.0.1:${port}`,
        `egress_allow: [127.0.0.1]`,
        "operations:",
        "  - name: go",
        "    method: GET",
        "    path: /start",
        "    annotations: { readOnly: true }",
        "",
      ].join("\n"));
      const out = await dispatchCall("ape_connector_call", { connector: "tmp-redir2", operation: "go", input: {} });
      const flat = JSON.stringify(out);
      // 127.0.0.2 is a different hostname than allowlisted 127.0.0.1, and the
      // safety net blocks loopback spellings: either gate must fire first.
      assert.ok(/egress_denied_redirect|ssrf_denied/.test(flat), `redirect contained: ${flat.slice(0, 200)}`);
    } finally {
      srv.close();
      target.srv.close();
    }
  });
  } finally { flagOff(); }
});

test("ssrf: cross-origin redirect carries no body", async () => {
  flagOn();
  const b = await fixture({});
  const a = await new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      if (req.url === "/post") {
        res.writeHead(302, { location: `http://127.0.0.1:${b.port}/sink` });
        req.resume();
        return res.end();
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
    });
    srv.listen(0, "127.0.0.1", () => resolve({ srv, port: srv.address().port }));
  });
  try {
    writeConn("tmp-xorigin", [
      "name: tmp-xorigin",
      `base_url: http://127.0.0.1:${a.port}`,
      `egress_allow: [127.0.0.1]`,
      "allow_cross_origin_redirects: true",
      "operations:",
      "  - name: send",
      "    method: POST",
      "    path: /post",
      "    body:",
      "      secret: { const: TOP-SECRET-BODY-VALUE }",
      "    annotations: { readOnly: true }",
      "",
    ].join("\n"));
    const out = await dispatchCall("ape_connector_call", { connector: "tmp-xorigin", operation: "send", input: {} });
    assert.ok(JSON.stringify(out).includes('"ok":true'), `chain completes: ${JSON.stringify(out).slice(0, 160)}`);
    const sink = b.seen.find((s) => s.url === "/sink");
    assert.ok(sink, "redirect reached the sink");
    assert.ok(!sink.body.includes("TOP-SECRET-BODY-VALUE"), `body stripped cross-origin, got: ${sink.body.slice(0, 120)}`);
  } finally {
    a.srv.close();
    b.srv.close();
    flagOff();
  }
});
