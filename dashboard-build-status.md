# Job Dashboard — Build Status / Handoff

**Last updated:** 2026-07-13 (end of day)  
**Repo:** https://github.com/siant279/job-dashboard (public)  
**Branch:** `main` @ `5f9be80`  
**Deploy:** Vercel (auto-deploy from `main`)  
**Local path:** `dev/job search agent`

**Session closed here.** Next chat: start from this file + `feedback-loop-context.md`.

---

## What this project is

A Next.js 14 (pages router) job search dashboard for Sian Crespo. It reads scored jobs from Airtable, lets her triage status/reasons, triggers Make via webhook, and feeds the preference-learning feedback loop described in:

- `feedback-loop-context.md` — as-built Make/Airtable feedback loop
- `feedback-loop-build-guide.md` — full design + implementation guide

Dashboard code lives almost entirely in:

- `pages/index.jsx` — UI + Airtable client PATCH logic
- `pages/_app.jsx` — thin App wrapper
- `package.json` — Next 14 / React 18
- `.env.local` — secrets (gitignored); `.env.local.example` committed

---

## Current live capabilities (working)

### Job list & display
- Fit score + label, title with apply URL + **Apply →** button
- Meta chips: **Source**, **Salary**, **Remote**, **Location**, **Found** (`first_seen`)
- Tags, expandable “why”, posted_days on the side
- Duplicate jobs dimmed

### Status triage (Airtable-aligned, lowercase)
Statuses (saved values & UI labels):

| Value | Notes |
|---|---|
| `new` | default |
| `saved` | shortlist — not a feedback loop signal |
| `applied` | **positive** loop signal |
| `duplicate` | excluded from learning |
| `not interested` | **negative** loop signal — reasons required |
| `didn't apply` | legacy kept on purpose |

PATCH field name is detected as `status` or `Status` from live records.

### Not interested reasons
Forced flow: choosing **not interested** opens a prompt; at least one reason required before save.

Lowercase reason options (must match Airtable multi-select):

- `too junior`, `too senior`, `wrong function`, `not remote`
- `comp/stage`, `industry mismatch`, `revenue-primary`, `other`

Reason field name candidates tried in order:

1. `not_interested_reason` (preferred / default)
2. `not interested reason`
3. `Not Interested Reason`

If a candidate works, the app caches that field name. If none work, status still saves and a banner lists tried names.

### Filters & sort
- Clickable status count tiles → filter
- Search (title/company), status, remote, industry, **source**, **reason**, min score
- Sort: fit score (default) | salary high/low | found newest/oldest (`first_seen`) | company A–Z / Z–A
- Salary filter: **at least $X** + **less than $Y** (combine for between); also salary known. Uses `salary_min` or parses the salary string.

### Bulk actions
- Multi-select + select all shown
- Bulk status change for all statuses including **not interested**
- When bulk status is **not interested**, reason chips appear and at least one reason is required before Apply
- Changing status away from not interested clears reasons on those records

### Ops
- Run Now → Make webhook
- Refresh → reload Airtable
- Save errors shown in a red banner with Airtable message text

---

## Env vars (Vercel + local)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_AIRTABLE_API_KEY` | Airtable token (currently **client-exposed**) |
| `NEXT_PUBLIC_AIRTABLE_BASE_ID` | `appJ15xEs9F7e3qQY` |
| `NEXT_PUBLIC_AIRTABLE_TABLE_ID` | `tblI3lyLBCyw09s96` |
| `NEXT_PUBLIC_MAKE_WEBHOOK_URL` | Run Now webhook |

Local `.env.local` may still have placeholders; production should have real keys in Vercel env settings.

---

## Feedback loop (Make / Airtable) — status as of 2026-07-13

Already built (see context docs):

- Distillation scenario → `job_prefs` Data Store (`applied_profile`, `avoid_profile`, `reason_counts`, `updated_at`)
- Scoring scenarios read prefs and apply ±15 calibration

Open Make items (from context):

- [ ] Turn weekly distillation schedule ON (was left off for seeding)
- [ ] Confirm second scoring scenario has its own Get-a-record + prompt block

Dashboard remaining loop work: **done enough for triage** (status + reasons writing into Airtable so Make can distill).

---

## Gotchas learned this session (do not re-break)

1. **Airtable select options are lowercase** for status and reasons. Title case values cause `"Insufficient permissions to create new select option..."`.
2. **Field names for reasons are snake_case-ish**, not the title-case name in the original build guide. Hardcoding `Not Interested Reason` caused `"Unknown field name"`.
3. Empty multi-select fields are **omitted** from Airtable GET responses — can’t detect field existence only from empty records; meta API or candidate retry is required.
4. Apply URLs may arrive as Airtable URL objects `{ url }` — normalize via `getApplyUrl`.
5. `first_seen` is the agent “found” date (Make writes `YYYY-MM-DD`).
6. Pushing to `main` may require Smart Mode / explicit approval for protected branch.

---

## Commits this session (oldest → newest highlights)

```
434103c  Initial Next.js dashboard + GitHub repo
…        didn't apply, bulk select, meta chips, apply links, source filter
0b02044  Feedback-loop status + reason UI
…        PATCH/casing fixes, required reasons, reason filter
7fffdae  Lowercase reasons
4d8319b  Found date display + sort by first_seen
c1d1572  Sort by company (A–Z / Z–A)
e4aff47  Status handoff doc
4883951  Handoff note for company sort
5f9be80  End-of-day status finalize   ← HEAD

## Session closed 2026-07-13

Dashboard is live on Vercel from `main`. Stopped after adding company sort. No unfinished code changes pending.
```

---

## Not committed locally (still untracked)

```
feedback-loop-build-guide.md
feedback-loop-context.md
job_search_agent_slideshow*.pptx
slideshow*.zip / slideshowimages/
```

Consider committing the two `feedback-loop-*.md` files next time so Make/Airtable context lives with the repo. Leave slideshow binaries out unless needed.

---

## Suggested next picks (when resuming)

1. **Confirm exact Airtable field name** for reasons in base UI (field header) and lock dashboard to that single name if retries are noisy.
2. **Move Airtable token server-side** (`pages/api/...`) — key is currently `NEXT_PUBLIC_*`.
3. Commit + push `feedback-loop-*.md` + this status file.
4. Optional: hide/migrate legacy `didn't apply` once records are triaged.
5. Optional: toast successes; stricter permission messaging when PAT lacks schema.bases:read for meta API.
6. Make open items above (schedule ON, second scoring scenario check).

---

## How to resume coding

```bash
cd "…/dev/job search agent"
npm install
# ensure .env.local has real Airtable + Make values
npm run dev
```

Deploy path: edit `pages/index.jsx` → commit → `git push origin main` → Vercel redeploys.

Primary touch file: **`pages/index.jsx`**.
