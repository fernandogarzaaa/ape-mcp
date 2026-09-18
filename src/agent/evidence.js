// Evidence correlation — combine verification outputs across engines into one
// grounding judgment, instead of treating each tool's result in isolation.
// A Genesis SOUND plus an EVE 40/100 must not both quietly "pass"; the gate
// needs agree / conflict / insufficient, with reasons.
//
// Normalized verdicts per source:
//   positive — supports the claim (genesis SOUND, EVE score >= threshold, eval ok)
//   negative — refutes it (genesis EXPLOITABLE, EVE score < threshold, eval failed)
//   neutral  — inconclusive (UNTESTED, compare deltas, missing fields)
// Correlation:
//   agree        — >=1 positive, zero negatives
//   conflict     — >=1 positive AND >=1 negative, or a lone negative
//   insufficient — zero sources, or neutrals only
export function extractVerdict(tool, resultSummary) {
  const text = String(resultSummary ?? "");
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* truncated or plain text; fall through to regex */ }
  const hay = text;

  if (tool === "genesis.audit_claim") {
    const v = parsed?.verdict ?? (/VERDICT:\s*(SOUND|EXPLOITABLE|UNTESTED|UNRELIABLE)/.exec(hay)?.[1] ?? null);
    if (v === "SOUND") return { verdict: "positive", detail: "genesis SOUND" };
    if (v === "EXPLOITABLE") return { verdict: "negative", detail: "genesis EXPLOITABLE" };
    return { verdict: "neutral", detail: `genesis ${v ?? "inconclusive"}` };
  }
  if (tool === "eve.validate_experience") {
    const m = /Overall experience score\s*:\s*(\d+)/.exec(hay);
    const score = m ? Number(m[1]) : (typeof parsed?.score === "number" ? parsed.score : null);
    if (score === null) {
      if (parsed && !parsed.error) return { verdict: "neutral", detail: "eve ran, no score parsed" };
      return { verdict: "neutral", detail: "eve inconclusive" };
    }
    return { verdict: "__SCORE__", score, detail: `eve score ${score}/100` };
  }
  if (tool === "eve.mcp_eval") {
    if (parsed && parsed.ok === true) return { verdict: "positive", detail: "mcp-eval ok" };
    if (parsed && parsed.ok === false) return { verdict: "negative", detail: "mcp-eval failed" };
    return { verdict: "neutral", detail: "mcp-eval inconclusive" };
  }
  if (tool === "genesis.compare") {
    if (parsed && !parsed.error) return { verdict: "neutral", detail: "compare delta (informational)" };
    return { verdict: "neutral", detail: "compare inconclusive" };
  }
  return { verdict: "neutral", detail: `${tool} (not a verification source)` };
}

export function correlateEvidence(steps, { verifyTools = [], eveThreshold = 50 } = {}) {
  const sources = [];
  for (const s of steps ?? []) {
    if (s.kind !== "tool" || !verifyTools.includes(s.tool)) continue;
    // Skip failed calls — an error is not evidence for or against the claim.
    if (String(s.resultSummary ?? "").includes('"error"')) continue;
    const v = extractVerdict(s.tool, s.resultSummary);
    let verdict = v.verdict;
    if (verdict === "__SCORE__") verdict = (v.score ?? 0) >= eveThreshold ? "positive" : "negative";
    sources.push({ tool: s.tool, verdict, detail: v.detail, score: v.score ?? null });
  }
  if (!sources.length) return { status: "insufficient", sources, reasons: ["no successful verification steps"] };
  const positives = sources.filter((s) => s.verdict === "positive");
  const negatives = sources.filter((s) => s.verdict === "negative");
  if (positives.length && !negatives.length) {
    return {
      status: "agree",
      sources,
      reasons: positives.map((s) => s.detail),
      singleSource: sources.length === 1,
    };
  }
  return {
    status: "conflict",
    sources,
    reasons: [
      ...positives.map((s) => "supports: " + s.detail),
      ...negatives.map((s) => "refutes: " + s.detail),
    ],
  };
}