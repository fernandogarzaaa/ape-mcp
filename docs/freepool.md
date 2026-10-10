# freepool — stacked free LLM tiers (and cost-aware routing)

`freepool` is a virtual model provider: one name in front of every free
OpenAI-compatible tier you hold a key for. Each model call picks the best
healthy `(provider, model, key)` that is under its rate limits, calls it
through the same OpenAI-compatible path every other provider uses (tool calls
keep working), and fails over on 429 / 5xx / timeout to the next candidate.
The upstream that actually answered is recorded as `served_by` in the run
result and receipt.

It is a clean-room JavaScript port of the core ideas of
[FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi) (MIT) — see
[Credits](#credits). It has no runtime or catalog dependency on that project:
APE ships and maintains its own catalog.

> **Personal use only.** Free tiers are offered to individual developers for
> experimentation. Do not put a freepool-backed APE behind a public endpoint,
> resell it, or share keys. Pooling several accounts on one provider to dodge
> its limits can violate that provider's terms — use one account per
> provider (several keys of *your own* account are fine where the provider
> allows them).

## Quick start

```bash
export GROQ_API_KEY=gsk_...          # any subset of the keys below
export CEREBRAS_API_KEY=csk-...
ape-mcp doctor                       # lists freepool members + egress hosts
```

Use it explicitly in a profile or `ape.config.yaml`:

```yaml
model:
  provider: freepool
  id: auto        # auto | fast | smart | cost | <provider>/<model-prefix>
```

or per run: `ape_agent_run { provider: "freepool", model: "fast", ... }`.

With **`provider: auto`** (the default) and at least one freepool member
available, APE now uses **cost routing** automatically (see below).

## Members and environment variables

| Member | Env var(s) | Endpoint | ToS |
|---|---|---|---|
| Groq | `GROQ_API_KEY` | api.groq.com | ok |
| Cerebras | `CEREBRAS_API_KEY` | api.cerebras.ai | ok |
| Google Gemini (OpenAI-compat) | `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) | generativelanguage.googleapis.com | **caution** |
| Mistral (Experiment plan) | `MISTRAL_API_KEY` | api.mistral.ai | ok (training opt-out) |
| OpenRouter (`:free` models only) | `OPENROUTER_API_KEY` | openrouter.ai | ok |
| NVIDIA NIM | `NVIDIA_API_KEY` (or `NVIDIA_NIM_API_KEY`) | integrate.api.nvidia.com | **caution** |
| Cloudflare Workers AI | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` | api.cloudflare.com | ok |
| Hugging Face router | `HF_TOKEN` (or `HUGGINGFACE_API_KEY`) | router.huggingface.co | ok |
| OpenCode Zen (free models) | `OPENCODE_API_KEY` | opencode.ai | ok |
| Local endpoint | `APE_FREEPOOL_LOCAL_MODEL` (+ `APE_LOCAL_BASE_URL`) | your machine | — |

- **Several keys per provider:** comma-separate them
  (`GROQ_API_KEY=gsk_a,gsk_b`). Traffic rotates to the key with the most
  headroom; a 429 on one key fails over to the next.
- **No key, no attempt:** members without a key are skipped silently and are
  never contacted. Cloudflare also requires a well-formed 32-hex account id.
- **Local:** set `APE_FREEPOOL_LOCAL_MODEL=qwen2.5:7b` (optional
  `APE_FREEPOOL_LOCAL_TIER=1..4`, `APE_FREEPOOL_LOCAL_CONTEXT`,
  `APE_FREEPOOL_LOCAL_TOOLS=0`). Under cost routing a detected local model
  joins automatically.
- **Excluded: Cohere.** Its trial-key terms do not allow this kind of
  personal/production use, so it is not a member even if `COHERE_API_KEY` is set.
- **GitHub Models: dropped.** GitHub retired GitHub Models on 2026-07-30
  ([changelog](https://github.blog/changelog/2026-07-30-github-models-is-now-retired/));
  its old endpoint now answers `200 text/plain "OK"`. It is no longer a
  member, and `GITHUB_TOKEN` / `GITHUB_MODELS_TOKEN` put nothing in the pool.
- **Broken upstreams:** a `2xx` whose content-type is not JSON, or whose body
  does not parse, is classed `upstream_invalid` ("non-JSON 2xx from <host>"),
  not a network error; that provider key is benched for 15 minutes and the
  pool fails over.

### ToS caveats per provider

- **Gemini (caution):** free-tier prompts and outputs may be used by Google to
  improve its products and may be reviewed by humans; the free tier is not
  offered in some regions (e.g. EEA/UK/CH restrictions). Don't send sensitive data.
- **NVIDIA NIM (caution):** build.nvidia.com access is a developer trial for
  prototyping and evaluation, not production; ~40 RPM account-wide.
- **Mistral:** the free Experiment plan may use your requests for training
  unless you opt out in the console.
- **OpenRouter:** only `:free` ids are pooled; ~50 requests/day account-wide
  (1000/day after a one-time credit purchase). Some free upstreams log prompts.
- **Cloudflare / Hugging Face:** small free allocations (daily neurons /
  monthly credits); calls simply fail once spent on a free plan.
- **OpenCode Zen:** free models can be time-limited and may collect data.

Terms change — read each provider's current terms before relying on them.

## Strategies

| `id` | Picks |
|---|---|
| `auto` | balanced score: reliability 0.35, speed 0.2, capability 0.3, headroom 0.15 |
| `fast` | speed-heavy (Groq/Cerebras first) |
| `smart` | capability-heavy (frontier-tier models first) |
| `cost` | cheapest *sufficient* candidate: local → free tiers → paid (below) |
| `groq/llama` | pin: only candidates whose `provider/model` starts with the prefix |

Scores are deterministic (no random exploration) so routing is reproducible
from the ledger. Reliability and latency are pooled per model; headroom is per
key, so keys of the same model rotate. A key near its ceiling is demoted, not
excluded, until it actually hits a limit.

Calls that carry tools only go to models marked tool-capable. Prompts larger
than a model's context window skip that model.

## Cost routing (`cost`, default for `provider: auto`)

For each model call the router sets a **required capability tier**
(1 small · 2 medium · 3 large · 4 frontier) and takes the cheapest candidate
that meets it:

1. **Tier from the task:** `classifyObjective` (router.js) maps
   trivial → 1, general → 2, coding → 3, reasoning → 3.
2. **Request signals:** tools required → at least 2; ~32k+ prompt tokens →
   at least 3; two or more quality failures earlier in the same run → +1.
3. **Ladder:** local (free) → freepool free tiers ($0) → paid providers you
   already have configured (Anthropic, OpenAI, OpenRouter paid, Nebius…), in
   ascending estimated cost. Among free candidates the lowest sufficient tier
   goes first, saving bigger models' quotas.
4. **Escalation:** a quality failure (4xx, empty/invalid output, tool-call
   arguments that are not valid JSON, unknown tool) bumps the tier by one.
   Availability failures (429, 5xx, timeout) fail over at the same tier and
   only escalate once that tier is exhausted. Paid is reached only when no
   free candidate can serve the tier.
5. **Budget:** a paid candidate is skipped when its estimated call cost
   (input estimate + 1024 output tokens at catalog/`COST_PER_MTok` rates)
   exceeds what is left of `limits.max_usd` or of
   `policy.credential_policy.max_spend_usd[<provider>]`. Spend is attributed
   to the provider that served, so per-provider caps keep working behind the
   pool. Free tiers cost $0 in the ledger.
6. **Record:** every turn's decision (strategy, category, required/final
   tier, chosen candidate, estimated cost, escalations, attempts, budget
   blocks, why paid was used) lands in the run result and in
   `receipt.freepool`.

Opt out with `policy.routing: false`, `APE_COST_ROUTING=0`, an explicit
provider/model, or a pinned provider (`APE_PROVIDER` / TUI pin). A
`credential_policy.allow` list must include `freepool` for cost routing to
apply, and paid providers inside the ladder are filtered by the same list.

### Pluggable learned router

The tier rules are a deliberate baseline. A learned classifier can replace
them without adding ML dependencies to APE:

```js
import { registerTierClassifier } from "ape-mcp/src/agent/freepool/costroute.js";
registerTierClassifier(async ({ objective, messages, tools, estTokens, priorFailures }) => {
  // return { tier: 1..4, category?, reason? } or null to defer to the rules
});
```

A throwing or null-returning hook falls back to the rules. The idea follows
[costroute](https://github.com/fernandogarzaaa/costroute) — a small LoRA-tuned
MiniLM that predicts the cheapest sufficient model tier — which can be served
locally and plugged in here.

## Rate ledger, cooldowns, learning

State lives in `.ape/freepool.db` (node:sqlite), per `(provider, model,
key-hash)`:

- **Counters:** RPM/TPM over a sliding 60s, RPD/TPD since **UTC midnight**
  (daily windows reset at 00:00 UTC, matching provider resets).
- **Ceilings:** start from the catalog; learned values from
  `x-ratelimit-*` headers (`-day`/`-minute` suffixes; Groq's unsuffixed
  `limit-requests` = per day) and from 429 bodies (`RPD: Limit 1000`) win.
  A request that would exceed a ceiling is refused locally, never sent.
- **Cooldowns:** `Retry-After` is honoured (max 24h); 429 without it climbs a
  ladder of 1 min → 10 min → 1 h → until next UTC midnight; a daily-quota 429
  benches until midnight; 5xx/timeout bench 30s; 401/403 bench the whole key
  for 1h; 404 benches the model for 24h; local endpoints bench 5s.
- **Bounds:** at most `APE_FREEPOOL_MAX_ATTEMPTS` (default 6) attempts per
  call, each capped by `APE_FREEPOOL_ATTEMPT_TIMEOUT_MS` (default 60s), all
  inside the call's wall budget (the run's remaining `max_wall_seconds`).
- **Secrets:** raw keys never reach the DB — rows carry a truncated SHA-256
  of the key; stored error text is passed through `redactSecrets`. Status
  surfaces show key presence as booleans and key *slots*, never keys or hashes.

## Catalog (maintained by APE)

`catalog/freepool.json` lists models per provider with capability tier,
speed, context, tool support, and limits, plus paid-provider rates used by
cost routing. **Base URLs are not in the catalog** — egress hosts are fixed
in `src/agent/freepool/members.js`, so a catalog change can never add a
network destination.

`scripts/refresh-catalog.mjs` queries each provider's own `/models` listing
(Cloudflare uses its model search) with whatever keys are
present and merges: curated fields win; new ids are added with a name-based
tier guess, `tools: false` and unknown limits; ids no longer listed are
marked `retired` (never deleted); OpenRouter keeps only `:free`; empty or
failed listings change nothing.

`.github/workflows/refresh-catalog.yml` runs it nightly (and on demand) with
repo secrets and opens/updates a single PR (`bot/refresh-freepool-catalog`).
It never auto-merges. Setup: add any subset of the provider secrets and enable *Settings → Actions → Allow GitHub Actions to
create pull requests*. PRs opened with the workflow token do not trigger CI
on their own; re-run CI from the PR or push an empty commit before merging.

## MCP / CLI surface

- `ape_freepool_status` — members, key presence, per-model/per-key-slot
  usage, limits, headroom, cooldowns, last (redacted) errors, egress hosts.
- `ape_freepool_models { provider?, tools? }` — catalog view with availability.
- `ape-mcp doctor` — lists members (key present or not, ToS caution flags)
  and every egress host including the pool's.
- `ape_test_provider { provider: "freepool", model: "fast" }` — one live call.

## Limits of this implementation

- Limits in the catalog are a best-effort snapshot; real ceilings are learned
  at runtime. Provider free tiers change often.
- Concurrency: counters are written after each call, so many parallel runs
  can overshoot a ceiling slightly before the first 429 teaches it.
- Live provider calls were verified with mocked HTTP only in the test suite;
  run `ape_test_provider` with your keys to verify each member.

## Credits

The design — `(platform, model, key)` routing with health, per-window rate
accounting reset at UTC midnight, learned ceilings, escalating cooldowns, and
failover — is inspired by **FreeLLMAPI** by Tashfeen Ahmed
(<https://github.com/tashfeenahmed/freellmapi>, MIT License). APE's code is an
independent JavaScript implementation; no source was copied. See `NOTICE.md`.
