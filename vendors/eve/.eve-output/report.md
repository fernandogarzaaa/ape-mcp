# Experience Report — mock:

> Persona: **curious-explorer** · Seed: `7` · Generated: 2026-09-17T04:37:45.212Z

## Executive Summary

A simulated "curious-explorer" spent 1.3 simulated minutes (60 interactions) with mock:. This looks like an app about "Settings" (titled "Settings — Acme Notes"). The experience was poor (overall score 45/100), with 0 critical and 8 major issue(s). The operator ran out of time/steps without completing their goal. They ended the session with 2% confidence, 59% frustration and 21% trust in the product.

## Experience Score: 45/100

| Dimension | Score | Evidence |
|---|---:|---|
| Usability | 0 | 33/60 actions violated the operator's expectation. 24 interactions produced no visible response ("dead clicks"). |
| Learnability | 20 | Expectation-violation rate went from 33% (first half) to 77% (second half). Peak confusion reached 96%. |
| Accessibility | 65 | "SYNC EVERYTHING VIA THE WEBHOOK API TOKEN" is rendered at 9px "SYNC EVERYTHING VIA THE WEBHOOK API TOKEN" has a contrast ratio of 1.69:1 (#c7c7c7 on #ff |
| Efficiency | 0 | 71% of screens were revisited repeatedly — the operator wandered. Session lasted 79.1s over 60 steps. |
| Consistency | 90 | No behavioral or visual inconsistencies were perceived. |
| Visual Design | 92 | No visual defects (contrast, clipping, overflow, misalignment) were perceived. |
| Navigation | 59 | 7 distinct locations reached across 60 screens. |
| Workflow Quality | 83 | Discovered 5 workflow(s): dashboard, edit, export, settings, signup. Completed end-to-end: edit, export, settings, signup. |
| Information Architecture | 85 | 0% of steps were spent hunting (scrolling/backtracking) rather than acting. |
| Onboarding | 60 | Peak confusion during the opening minutes: 45%. |
| Error Recovery | 85 | No visible errors occurred during the session. |
| Responsiveness | 93 | Average perceived wait after actions: 212ms. |
| User Confidence | 30 | Mean confidence across the session: 30%. Final confidence: 2%. |
| Cognitive Load | 56 | Mean confusion 64%, fatigue 33%, stress 10%. |
| Trust | 47 | Mean trust across the session: 47%. No trust-damaging events (errors, broken promises) occurred. |
| Overall | 45 | Weighted composite of 11 dimensions. No critical findings. |

## Critical Findings (0)

_None._
## Major UX Issues (8)

### F-001 — "SYNC EVERYTHING VIA THE WEBHOOK API TOKEN" is rendered at 9px

**Category:** accessibility · **Where:** mock://acme-notes/pricing

"SYNC EVERYTHING VIA THE WEBHOOK API TOKEN" is rendered at 9px — below this user's comfortable minimum of 11px.

Evidence:
- Screen: Pricing — Acme Notes
- Check: tiny-text

### F-002 — "SYNC EVERYTHING VIA THE WEBHOOK API TOKEN" has a contrast ratio of 1.69:1 (#c7c7c7 on #ff

**Category:** accessibility · **Where:** mock://acme-notes/pricing

"SYNC EVERYTHING VIA THE WEBHOOK API TOKEN" has a contrast ratio of 1.69:1 (#c7c7c7 on #ffffff) — below the WCAG AA minimum of 4.5:1.

Evidence:
- Screen: Pricing — Acme Notes
- Check: low-contrast

### F-003 — No visible response to: click "Search notes (filled)"

**Category:** usability · **Where:** mock://acme-notes/dashboard

The operator acted and nothing perceivably changed. Dead controls destroy confidence — users click again, then blame themselves, then leave.

Evidence:
- Expected: Clicking "Search notes (filled)" should do what the label says and show me the result.

### F-004 — No visible response to: click "Dark mode"

**Category:** usability · **Where:** mock://acme-notes/settings

The operator acted and nothing perceivably changed. Dead controls destroy confidence — users click again, then blame themselves, then leave.

Evidence:
- Expected: Clicking "Dark mode" should do what the label says and show me the result.

### F-005 — No visible response to: click "Save changes"

**Category:** usability · **Where:** mock://acme-notes/settings

The operator acted and nothing perceivably changed. Dead controls destroy confidence — users click again, then blame themselves, then leave.

Evidence:
- Expected: Clicking "Save changes" should do what the label says and show me the result.

### F-006 — No visible response to: click "Email notifications"

**Category:** usability · **Where:** mock://acme-notes/settings

The operator acted and nothing perceivably changed. Dead controls destroy confidence — users click again, then blame themselves, then leave.

Evidence:
- Expected: Clicking "Email notifications" should do what the label says and show me the result.

### F-007 — No visible response to: click "Write something… (filled)"

**Category:** usability · **Where:** mock://acme-notes/editor

The operator acted and nothing perceivably changed. Dead controls destroy confidence — users click again, then blame themselves, then leave.

Evidence:
- Expected: Clicking "Write something… (filled)" should do what the label says and show me the result.

### F-008 — No visible response to: click "Title (filled)"

**Category:** usability · **Where:** mock://acme-notes/editor

The operator acted and nothing perceivably changed. Dead controls destroy confidence — users click again, then blame themselves, then leave.

Evidence:
- Expected: Clicking "Title (filled)" should do what the label says and show me the result.

## Minor UX Issues (0)

_None._
## Workflow Analysis

| Workflow | Screens | Completed | Errors |
|---|---:|:---:|---:|
| dashboard | 1 | ❌ | 0 |
| edit | 1 | ✅ | 0 |
| export | 1 | ✅ | 0 |
| settings | 1 | ✅ | 0 |
| signup | 1 | ✅ | 0 |

## Navigation Analysis

- 7 distinct screens discovered; 7 unique locations.
- 9 navigation paths traversed.
- The operator backtracked 0 time(s).

| From | To | Via | Times |
|---|---|---|---:|
| null/landing | null/pricing | click "Pricing" | 1 |
| null/pricing | null/signup | click "Get started" | 1 |
| null/signup | null/dashboard | click "Create account" | 1 |
| null/dashboard | null/editor | click "New note" | 5 |
| null/editor | null/dashboard | click "Save" | 4 |
| null/dashboard | null/export | click "Export all" | 2 |
| null/export | null/dashboard | click "Back" | 2 |
| null/dashboard | null/settings | click "Settings" | 3 |
| null/settings | null/dashboard | click "Back to notes" | 3 |

## Expectation Violations

- **Step 3** — click "Get started": expected "Clicking "Get started" should do what the label says and show me the result." but got an unrelated screen (surprise 65%).
- **Step 8** — click "Create account": expected "Clicking "Create account" should do what the label says and show me the result." but got an unrelated screen (surprise 65%).
- **Step 11** — click "Search notes (filled)": expected "Clicking "Search notes (filled)" should do what the label says and show me the result." but got no response (surprise 85%).
- **Step 16** — click "Save": expected "Clicking "Save" should do what the label says and show me the result." but got an unrelated screen (surprise 65%).
- **Step 19** — click "Back": expected "Clicking "Back" should take me to a screen about back." but got an unrelated screen (surprise 65%).
- **Step 22** — click "Dark mode": expected "Clicking "Dark mode" should do what the label says and show me the result." but got no response (surprise 85%).
- **Step 23** — click "Save changes": expected "Clicking "Save changes" should do what the label says and show me the result." but got no response (surprise 85%).
- **Step 24** — click "Email notifications": expected "Clicking "Email notifications" should do what the label says and show me the result." but got no response (surprise 85%).
- **Step 25** — click "Email notifications": expected "Clicking "Email notifications" should do what the label says and show me the result." but got no response (surprise 85%).
- **Step 28** — click "Download .zip": expected "Clicking "Download .zip" should do what the label says and show me the result." but got an unrelated screen (surprise 65%).
- **Step 30** — click "Delete": expected "Clicking "Delete" will probably ask me to confirm before destroying anything." but got an unrelated screen (surprise 65%).
- **Step 31** — click "Search notes (filled)": expected "Clicking "Search notes (filled)" should do what the label says and show me the result." but got no response (surprise 85%).
- **Step 33** — click "Write something… (filled)": expected "Clicking "Write something… (filled)" should do what the label says and show me the result." but got no response (surprise 85%).
- **Step 34** — click "Back": expected "Clicking "Back" should take me to a screen about back." but got an unrelated screen (surprise 65%).
- **Step 35** — click "Search notes (filled)": expected "Clicking "Search notes (filled)" should do what the label says and show me the result." but got no response (surprise 85%).
- **Step 37** — click "Save changes": expected "Clicking "Save changes" should do what the label says and show me the result." but got no response (surprise 85%).
- **Step 38** — click "Dark mode": expected "Clicking "Dark mode" should do what the label says and show me the result." but got no response (surprise 85%).
- **Step 39** — click "Email notifications": expected "Clicking "Email notifications" should do what the label says and show me the result." but got no response (surprise 85%).
- **Step 40** — click "Save changes": expected "Clicking "Save changes" should do what the label says and show me the result." but got no response (surprise 85%).
- **Step 41** — click "Dark mode": expected "Clicking "Dark mode" should do what the label says and show me the result." but got no response (surprise 85%).

## Emotional Timeline

| Step | Confidence | Frustration | Confusion | Trust | Fatigue |
|---:|---:|---:|---:|---:|---:|
| 0 | 59% | 5% | 2% | 62% | 6% |
| 3 | 62% | 0% | 24% | 61% | 9% |
| 6 | 71% | 1% | 1% | 66% | 12% |
| 9 | 69% | 1% | 16% | 65% | 16% |
| 12 | 60% | 3% | 35% | 63% | 18% |
| 15 | 70% | 4% | 10% | 68% | 22% |
| 18 | 68% | 1% | 16% | 67% | 25% |
| 21 | 67% | 1% | 21% | 66% | 28% |
| 24 | 12% | 20% | 95% | 53% | 30% |
| 27 | 23% | 16% | 72% | 54% | 32% |
| 30 | 15% | 10% | 95% | 51% | 34% |
| 33 | 3% | 18% | 95% | 47% | 37% |
| 36 | 14% | 18% | 83% | 44% | 39% |
| 39 | 3% | 35% | 95% | 36% | 41% |
| 42 | 3% | 50% | 96% | 29% | 43% |
| 45 | 7% | 43% | 96% | 33% | 45% |
| 48 | 3% | 50% | 96% | 27% | 48% |
| 51 | 3% | 53% | 96% | 26% | 50% |
| 54 | 12% | 55% | 84% | 25% | 52% |
| 57 | 3% | 57% | 96% | 24% | 54% |

## Session Journal

- **#0** `read the screen` — _New screen — let me look around and figure out what this is._ (frustration 5%)
- **#1** `click "Pricing"` — _I haven't tried "Pricing" yet — curious what it does._ (frustration 1%)
- **#2** `read the screen` — _New screen — let me look around and figure out what this is._ (frustration 1%)
- **#3** `click "Get started"` — _I haven't tried "Get started" yet — curious what it does._ (frustration 0%)
- **#4** `read the screen` — _New screen — let me look around and figure out what this is._ (frustration 1%)
- **#5** `type "Alex Rivera" into "Full name"` — _This form wants "Full name" — filling it in._ (frustration 1%)
- **#6** `type "curious.explorer@example.com" into "Email address"` — _This form wants "Email address" — filling it in._ (frustration 1%)
- **#7** `type "CorrectHorse!42" into "Password"` — _This form wants "Password" — filling it in._ (frustration 1%)
- **#8** `click "Create account"` — _The form is filled in — "Create account" should submit it._ (frustration 0%)
- **#9** `read the screen` — _New screen — let me look around and figure out what this is._ (frustration 1%)
- **#10** `type "settings" into "Search notes"` — _This form wants "Search notes" — filling it in._ (frustration 1%)
- **#11** `click "Search notes (filled)"` — _I haven't tried "Search notes (filled)" yet — curious what it does._ (frustration 8%)
- **#12** `click "New note"` — _I haven't tried "New note" yet — curious what it does._ (frustration 3%)
- **#13** `read the screen` — _New screen — let me look around and figure out what this is._ (frustration 3%)
- **#14** `type "A quick test" into "Title"` — _This form wants "Title" — filling it in._ (frustration 4%)
- **#15** `type "test input" into "Write something…"` — _This form wants "Write something…" — filling it in._ (frustration 4%)
- **#16** `click "Save"` — _The form is filled in — "Save" should submit it._ (frustration 4%)
- **#17** `click "Export all"` — _The form is filled in — "Export all" should submit it._ (frustration 0%)
- **#18** `read the screen` — _New screen — let me look around and figure out what this is._ (frustration 1%)
- **#19** `click "Back"` — _I haven't tried "Back" yet — curious what it does._ (frustration 1%)
- **#20** `click "Settings"` — _I haven't tried "Settings" yet — curious what it does._ (frustration 0%)
- **#21** `read the screen` — _New screen — let me look around and figure out what this is._ (frustration 1%)
- **#22** `click "Dark mode"` — _I haven't tried "Dark mode" yet — curious what it does._ (frustration 7%)
- **#23** `click "Save changes"` — _I haven't tried "Save changes" yet — curious what it does._ (frustration 14%)
- **#24** `click "Email notifications"` — _I haven't tried "Email notifications" yet — curious what it does._ (frustration 20%)
- **#25** `click "Email notifications"` — _"Email notifications" is the most promising thing on screen._ (frustration 26%)
- **#26** `click "Back to notes"` — _I haven't tried "Back to notes" yet — curious what it does._ (frustration 21%)
- **#27** `click "Export all"` — _"Export all" is the most promising thing on screen._ (frustration 16%)
- **#28** `click "Download .zip"` — _I haven't tried "Download .zip" yet — curious what it does._ (frustration 15%)
- **#29** `click "New note"` — _"New note" is the most promising thing on screen._ (frustration 10%)
- **#30** `click "Delete"` — _The form is filled in — "Delete" should submit it._ (frustration 10%)
- **#31** `click "Search notes (filled)"` — _"Search notes (filled)" is the most promising thing on screen._ (frustration 16%)
- **#32** `click "New note"` — _"New note" is the most promising thing on screen._ (frustration 12%)
- **#33** `click "Write something… (filled)"` — _I haven't tried "Write something… (filled)" yet — curious what it does._ (frustration 18%)
- **#34** `click "Back"` — _I haven't tried "Back" yet — curious what it does._ (frustration 17%)
- **#35** `click "Search notes (filled)"` — _"Search notes (filled)" is the most promising thing on screen._ (frustration 23%)
- **#36** `click "Settings"` — _"Settings" is the most promising thing on screen._ (frustration 18%)
- **#37** `click "Save changes"` — _"Save changes" is the most promising thing on screen._ (frustration 24%)
- **#38** `click "Dark mode"` — _"Dark mode" is the most promising thing on screen._ (frustration 30%)
- **#39** `click "Email notifications"` — _"Email notifications" is the most promising thing on screen._ (frustration 35%)
- **#40** `click "Save changes"` — _"Save changes" is the most promising thing on screen._ (frustration 40%)
- **#41** `click "Dark mode"` — _"Dark mode" is the most promising thing on screen._ (frustration 45%)
- **#42** `click "Email notifications"` — _"Email notifications" is the most promising thing on screen._ (frustration 50%)
- **#43** `click "Back to notes"` — _"Back to notes" is the most promising thing on screen._ (frustration 44%)
- **#44** `click "New note"` — _"New note" is the most promising thing on screen._ (frustration 38%)
- **#45** `click "Write something… (filled)"` — _"Write something… (filled)" is the most promising thing on screen._ (frustration 43%)
- **#46** `click "Title (filled)"` — _I haven't tried "Title (filled)" yet — curious what it does._ (frustration 47%)
- **#47** `click "Write something… (filled)"` — _"Write something… (filled)" is the most promising thing on screen._ (frustration 52%)
- **#48** `click "Save"` — _"Save" is the most promising thing on screen._ (frustration 50%)
- **#49** `click "Settings"` — _"Settings" is the most promising thing on screen._ (frustration 43%)
- **#50** `click "Save changes"` — _"Save changes" is the most promising thing on screen._ (frustration 48%)
- **#51** `click "Dark mode"` — _"Dark mode" is the most promising thing on screen._ (frustration 53%)
- **#52** `click "Save changes"` — _"Save changes" is the most promising thing on screen._ (frustration 57%)
- **#53** `click "Save changes"` — _"Save changes" is the most promising thing on screen._ (frustration 62%)
- **#54** `click "Back to notes"` — _"Back to notes" is the most promising thing on screen._ (frustration 55%)
- **#55** `click "New note"` — _"New note" is the most promising thing on screen._ (frustration 48%)
- **#56** `click "Write something… (filled)"` — _"Write something… (filled)" is the most promising thing on screen._ (frustration 53%)
- **#57** `click "Write something… (filled)"` — _"Write something… (filled)" is the most promising thing on screen._ (frustration 57%)
- **#58** `click "Write something… (filled)"` — _"Write something… (filled)" is the most promising thing on screen._ (frustration 62%)
- **#59** `click "Save"` — _"Save" is the most promising thing on screen._ (frustration 59%)

## Discovered Journey

Goal: _explore the application and understand what it offers_

Path: `Acme Notes — Simple note taking` → `Pricing — Acme Notes` → `Sign up — Acme Notes` → `Your notes — Acme Notes` → `New note — Acme Notes` → `Your notes — Acme Notes` → `Export — Acme Notes` → `Your notes — Acme Notes` → `Settings — Acme Notes` → `Your notes — Acme Notes` → `Export — Acme Notes` → `Your notes — Acme Notes` → `New note — Acme Notes` → `Your notes — Acme Notes` → `New note — Acme Notes` → `Your notes — Acme Notes` → `Settings — Acme Notes` → `Your notes — Acme Notes` → `New note — Acme Notes` → `Your notes — Acme Notes` → `Settings — Acme Notes` → `Your notes — Acme Notes` → `New note — Acme Notes`
- Reached a completion state: ❌
- Wasted steps (friction/backtracking): 24

Friction points:
- **New note — Acme Notes** — the result was surprising; the action produced no visible response (frustration 62%)
- **Settings — Acme Notes** — the action produced no visible response; the result was surprising (frustration 62%)
- **Your notes — Acme Notes** — the action produced no visible response; the result was surprising (frustration 23%)
- **Export — Acme Notes** — the result was surprising (frustration 15%)
- **Pricing — Acme Notes** — the result was surprising (frustration 0%)

## Recommendations

### Quick Wins

- "SYNC EVERYTHING VIA THE WEBHOOK API TOKEN" is rendered at 9px — "SYNC EVERYTHING VIA THE WEBHOOK API TOKEN" is rendered at 9px — below this user's comfortable minimum of 11px.
- "SYNC EVERYTHING VIA THE WEBHOOK API TOKEN" has a contrast ratio of 1.69:1 (#c7c7c7 on #ff — "SYNC EVERYTHING VIA THE WEBHOOK API TOKEN" has a contrast ratio of 1.
- No visible response to: click "Search notes (filled)" — The operator acted and nothing perceivably changed.
- No visible response to: click "Dark mode" — The operator acted and nothing perceivably changed.
- No visible response to: click "Save changes" — The operator acted and nothing perceivably changed.
- No visible response to: click "Email notifications" — The operator acted and nothing perceivably changed.

### Long-Term Improvements

- Invest in learnability: the operator's mental model never converged — align labels, layouts and outcomes with common conventions so behavior becomes predictable.
- Rework the information architecture: the operator spent significant time hunting and backtracking. Card-sort the navigation and flatten deep or ambiguous paths.
- Rebuild trust signals: broken promises (errors, dead controls, surprises) eroded the operator's trust. Consistency and honest feedback are the fix, not visual polish.

---
_Generated by [Experience Validation Engine](https://github.com/fernandogarzaaa/experience-validation-engine) — AI that experiences software like a human._