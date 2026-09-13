# Baseball Nerd — AdSense "Low Value Content" Fixes (Sept 2026)

This documents everything changed in this pass, mapped to the fix numbers from
the diagnosis. Verified against real `ng build --configuration production`
runs throughout — not just written and hoped for.

## Before you deploy

This pass added real dependencies (`@angular/ssr`, `@angular/platform-server`,
`express`, `@types/express`) and changed `angular.json`'s build config. **Run
`npm install` before your next `npm run build`.** This is a bigger delivery
than the usual src-only zip for exactly that reason — the build tooling
itself changed, not just app code.

The build now also runs a **prerendering step** that visits every route in a
headless Node environment and bakes the resulting HTML to disk. For
data-driven pages (Scores, Standings, Stats) to prerender with real games/
stats already in the HTML — not just empty states — the machine running
`npm run build` needs real network access to `statsapi.mlb.com` at build
time. Your own machine will have this; a locked-down CI runner might not.

## Fix 1 — Cloaking artifacts: DELETED

- Removed `scripts/generate-route-shells.js` and `scripts/route-content.js`
  entirely, and the `postbuild` hook in `package.json` that ran them.
- Removed the hand-written fallback block and the literal comment about
  what AdSense's crawler reads, from `src/index.html`. `<app-root>` is now
  empty in source — real SSR output fills it at build time.

## Fix 2 — Real SSR/prerendering: DONE (this was the big one)

Ran `ng add @angular/ssr` and adapted it to your NgModule-based app. All 14
routes below now prerender to real, self-contained HTML files — no more gap
between what a crawler sees and what a user sees.

Getting there required fixing bugs that don't show up in normal browser use
but break the moment code runs in Node instead of a browser:
- `localStorage`/`window` reads in `app.component.ts` and the stadium map's
  `ngOnInit` — guarded with `isPlatformBrowser`.
- Leaflet touches `window` the instant it's imported, before you even call
  it — switched `stadium-map.component.ts` to load it via a browser-only
  dynamic `import()` instead of a top-level import.
- The Scores page's live-polling `timer(0, interval)` subscription never
  gets torn down during prerendering (nothing calls `ngOnDestroy` until
  *after* the render is captured), which deadlocked the entire build, not
  just that one route. Server-side now does a single fetch instead of
  starting the poll; browser behavior is unchanged.
- `SeoService` now updates `<link rel="canonical">` per-route on every
  navigation. Without this, every prerendered page would have inherited
  `index.html`'s hardcoded homepage canonical — which would have told
  Google every other page was a duplicate of "/". Found this by checking my
  own output, not because anything crashed.

## Fix 3 — Real 404s: DONE

- `wrangler.jsonc`: `not_found_handling` changed from
  `"single-page-application"` to `"404-page"`.
- Added `src/404.html`, a real styled 404 page with working nav links.
- **Important placement fix:** `_redirects` was sitting at the project root,
  which Cloudflare Workers static assets never reads from — it only reads
  `_redirects` from *inside* the deployed assets directory. As positioned,
  it was almost certainly inert this whole time. Moved it to `src/_redirects`
  and added it to `angular.json`'s asset list so it actually ships. Its
  catch-all `/* / 200` rule (the actual cause of the soft-404s) is gone,
  replaced with three narrow, explicit redirects for legacy URLs (below).

## Fix 4 — URL de-duplication: DONE

- Deleted the standalone `src/about.html` and `src/privacy.html`. `/about`
  and `/privacy` are now real prerendered output from the actual Angular
  components — one source of truth instead of two hand-maintained copies.
- `_redirects` sends `/about.html` → `/about` and `/privacy.html` →
  `/privacy` (301) so old links/bookmarks still land somewhere real.
- Every internal link — sidebar, homepage, all 8 blog articles — now uses
  extensionless blog URLs instead of `.html`.

## Fix 5 — Value proposition: REWRITTEN

Replaced the "same data MLB.com uses / no scraping, no delays" framing on
the homepage and About page with copy that leads with what the site adds
(speed, clean UI, plain-English stat context) instead of what it mirrors.
Left the one-line factual FAQ mention of the MLB Stats API alone — that's
reasonable disclosure, not the problem; the repeated marketing framing was.

## Fix 6 — Players page empty state: FIXED

The blank "start typing" box before any search is gone. It now shows a real
"This Season's Leaders" panel (OPS and ERA leaders, pulled from the same
stats endpoint the Stats page already uses) by default, plus an expanded
~300-word explainer on how to actually read Season/Career/Game Log/vs.
Opponents splits — including a small-sample-size caution, so it's not just
selling the numbers as gospel.

## Fix 7 — Author identity (E-E-A-T): BUILT

New page at `/author/henri-evjen`: background, an honest "why I write about
these numbers" section grounded in the fact that you built the actual stats
pipeline (not overclaiming credentials you don't have), a contact section,
and links to every article. Linked from the About page (trimmed to a teaser
there to avoid duplicating the bio) and from the byline on all 8 articles.
Added to the sitemap. **You should add a real photo** — I used a plain
initial-avatar placeholder since I have no image to put there; swap it into
`src/app/author/author/author.component.html` and `.scss` whenever you have
one.

## Fix 8 — Ad units on an unapproved site: REMOVED

Pulled the one live `<ins class="adsbygoogle">` slot (the persistent
right-rail ad in `app.component.html`) and the CSS gutter reserved for it
— the loader script tag stays, so re-adding the `<ins>` block after
approval is the only step needed to bring ads back.

## Fix 9 — More articles: STARTED, not finished

Added 3 new ~1,000-1,300 word articles, wired into the blog index, the
homepage guides section, the sitemap, and cross-linked from the app pages
they're most relevant to:

- **Why Coors Field Breaks Every Pitcher's Stat Line** — linked from
  Stadium Weather
- **How to Evaluate a Starting Pitcher: The Stats That Actually Matter** —
  linked from Stats and the Players page
- **Reading a Depth Chart: What Organizational Depth Actually Tells You** —
  linked from Depth Chart

That brings the count to **8 articles against 8 data pages** — better, but
still short of the ~30 the diagnosis targets. I wrote 3 rather than all ~25
deliberately: churning out that many in one pass risked exactly the
templated, low-substance writing that caused this problem in the first
place. The diagnosis's own Series A–E ideas (team season outlooks, more
ballpark deep dives, positional guides, recurring waiver-wire/trade-deadline
pieces) are all still there as a roadmap — happy to keep writing more of
these with you whenever you want to pick it back up.

Also expanded the existing explainer sections on Scores, Standings, Stats,
and Stadium Weather with more genuine baseball content (not just page
descriptions) and cross-links to the guides above.

## What I did not touch

- The 5 pre-existing blog articles' content (already good, per the
  diagnosis).
- `robots.txt`, `ads.txt` (already correct).
- Fix 9's full 30-article target — see above.

## Verified, not assumed

Every fix above was checked against actual `ng build --configuration
production` output — prerendered word counts, `<title>` and canonical tags
per route, and the presence of `_redirects`/`404.html` in the built
`dist/baseball-nerd/browser/` folder — not just written and assumed to work.

---

# Round 2 (same week): Content pullback + a real Stadium Weather bug

## Stadium Weather — found and fixed a real bug, not a false alarm

You asked me to check this specifically, and it was worth checking: the
Leaflet dynamic-import change from Round 1 was broken. Leaflet is a
CommonJS package, and under a dynamic `import()`, esbuild resolves its
exports onto `.default` instead of the namespace directly — `L.map` was
`undefined`, so the map would never have initialized for a real user.
`protomaps-leaflet` (real ESM) doesn't have this problem, only Leaflet did.

This wasn't caught by the build because prerendering skips this code
entirely (it's browser-only) — a clean build was never proof it worked. I
confirmed the actual bug and the actual fix by bundling the real code with
esbuild and running it under a stubbed browser environment, then checked
the fix compiled correctly into your real production bundle. `stadium-map.component.ts`
now does `leafletModule.default ?? leafletModule`, matching what the
compiled output actually contains. Also hardened `flyToStadium()`, which
could throw if the stadium list was clicked before the map finished
loading — narrow, but the async import made the window slightly wider.

## Landing page: Scores replaces Home

- Deleted `src/app/home/` entirely — it's not just unrouted, it's gone.
- `/` now loads Scores directly. `/scores` 301-redirects to `/` rather than
  serving the same content at two URLs (would've recreated the
  duplicate-content problem from Round 1).
- Fixed a bug this would have caused on its own: the sidebar's "is this
  page active" check used to be `startsWith(route)`, which works fine for
  `/standings` etc. but matches *every* route once Scores' path becomes
  `/`. Scores would have stayed permanently highlighted regardless of what
  page was actually open. Special-cased the root path.
- Sitemap updated to match (no more separate `/scores` entry).

## Guides tab and all articles: removed

Deleted `src/blog/` entirely, the nav item, the sitemap entries, and the
noscript fallback content. Updated the Author page (kept — wasn't asked to
remove it) to drop the now-dead "Articles by Henri" list and reworded the
sections that assumed guides existed, since leaving those references in
would've just meant new dead links.

## Page descriptions removed, exactly as listed

Removed the description/explainer text from Scores, Standings, Stats,
Players, Schedule, Depth Chart, and Stadium Weather. Two judgment calls
where the request didn't map onto a clean single block:

- **Scores** — only listed the short intro paragraph, not the separate
  "Reading a Game Card" section. Removed just the intro; trimmed the one
  paragraph in "Reading a Game Card" that pointed to now-deleted guides,
  left the rest of that section as-is since it wasn't asked to go.
- **Stats** — only listed the intro, not the stat-abbreviation glossary.
  Removed the intro and the one sentence in the glossary that linked to
  guides; kept the glossary itself.

Everything else on the list (Standings' full explainer, Players' full
profile-reading section, Schedule's, Depth Chart's, and Stadium Weather's)
was removed in full, including any guide links inside them — those were
going away regardless once the guides were deleted.

Kept, since neither was mentioned: the Players page's "This Season's
Leaders" panel, and the Stats glossary itself.

---

# Round 3: Scores page analysis

You asked me to verify every game shows correctly on the Scores page. I
traced through the actual status/rendering logic in `scores.component.ts`,
`score-card.component.ts`, and `game-detail.component.ts` rather than just
reading it over, and checked assumptions against MLB's real API docs where
it mattered. Two real issues, fixed:

- **Hardcoded `/scores` in a deep-link cleanup.** When someone opens a
  direct link to a specific game (`?gamePk=...`), the code cleans the
  query param from the address bar afterward — but it hardcoded the old
  `/scores` path from before this session's landing-page change. Since
  `/scores` now just redirects back to `/`, this would've left the address
  bar showing a URL that immediately bounces if reloaded or shared. Now
  reads the actual current path instead of hardcoding one.
- **No way to tell doubleheader games apart.** Confirmed against MLB's API
  docs that games carry a `doubleHeader` flag (`Y`/`S`/`N`) and a
  `gameNumber` (1 or 2) specifically for this, and the app wasn't using
  either — two doubleheader cards for the same two teams would render
  identically apart from start time. Added a "Game 1"/"Game 2" badge next
  to the series label, shown only when a game is actually part of a
  doubleheader.

Also specifically checked and confirmed **correct as-is** (not bugs):
postponed/makeup game de-duplication holds up even when a postponed game's
makeup lands on a day that's *also* a doubleheader; suspended-game handling
matches MLB's actual state model (there's no separate "suspended"
top-level state in their API — a suspended game stays `Live` until it's
actually resumed and completed, which is what the code already assumes);
the no-hitter/perfect-game detection logic; the pitcher win-loss record
caching; and that the hydrate parameters requested from the API line up
with every field the templates actually read. Team colors/abbreviations
are already current (e.g., the Athletics correctly show as "ATH" /
"Athletics," not the old Oakland branding).

One thing I noticed but didn't change: `score-card.component.ts` and
`game-detail.component.ts` each have their own copy of the exact same
game-state logic. They agree right now, but it's duplicated rather than
shared, which is a real risk if one gets edited later without the other.
Flagging it rather than refactoring it, since that's a structural change
beyond what was asked.


---

# Round 4: Removed the "Reading a Game Card" section

Removed the section entirely from the Scores page (the intro paragraph was
already removed in Round 2 — this was the "Reading a Game Card" explainer
that Round 2 had deliberately left in place since it wasn't on that list).
Also cleaned up the now-fully-unused `.page-intro` / `.page-explainer` CSS
in `scores.component.scss`, since nothing in this component references
either class anymore.

---

# Round 5: Wild Card ordering fix + new Postseason Bracket tab

## Wild Card tab: division leaders now ordered by win percentage

Found the actual bug: `alDivisionLeaders`/`nlDivisionLeaders` were built by
mapping over divisions in a fixed East → Central → West order and never
sorted against each other afterward, so the three leaders always displayed
in division order regardless of record. Added a sort by winning percentage
(descending) after they're collected. This wasn't just a display quirk —
the same three teams, in the same order, are exactly what determines seeds
1-3 in the new bracket below, so this fix is load-bearing for that too.

## New tab: Postseason Bracket

Before building anything, I verified the actual current rules rather than
work from memory — and it's a good thing I did: **the format changed for
2026.** From 2022-2025 only the #1 seed got a bye; starting this season the
top TWO seeds in each league bye into the Division Series, with only seeds
3-6 playing the Wild Card Series. Also confirmed MLB does not reseed after
the Wild Card round — the bracket is fixed in advance (1 always faces the
4/5 winner, 2 always faces the 3/6 winner), regardless of which seed
actually wins.

What it shows, per league:
- **Wild Card Series** (best-of-3, higher seed hosts every game): seeds 1
  and 2 shown with a BYE tag; seeds 3-6 shown as the two actual matchups,
  (3) vs (6) and (4) vs (5), pulling real teams and records from the
  current standings.
- **Division Series preview**: who seed 1 and seed 2 will face, stated as
  "winner of (4)/(5)" and "winner of (3)/(6)" — not guessed further ahead,
  since anything past the Wild Card round is genuinely undecided until
  it's played.

This is explicitly framed as a projection ("if the season ended today"),
not a final bracket, since it's built live from current-standings — it
will keep shifting as the season plays out. I did not attempt to model
every historical postseason format (the field has changed shape several
times since 1901 — no LCS at all before 1969, no wild card before 1995,
a one-game Wild Card playoff 2012-2021, etc.). The bracket only renders
for 2026-and-later seasons; earlier seasons in the season picker show a
brief explanatory note instead of a bracket built on rules that didn't
apply to them.

Verified the seeding algorithm against a hand-built test case before
shipping it — including the subtle rule that a division winner always
outranks a wild card team even when the wild card team has the better raw
record (this happens in real seasons and is easy to get wrong if you
naively sort all six teams by percentage instead of seeding division
winners 1-3 and wild cards 4-6 separately).

---

# Round 6: Postseason Bracket — verified against MLB's own rules, expanded to a full bracket

You linked MLB.com's official format explainer, so I fetched it directly
and checked it line by line against what I'd built. Good news: the seeding
rules, the top-2 byes, the (3)v(6)/(4)v(5) matchups, the no-reseeding rule,
and the "division winner always outranks a wild card team" rule all matched
exactly — nothing there needed correcting.

What was missing was completeness: the tab stopped after the Wild Card
round and a one-line text hint about the Division Series. That's a
matchup list, not a bracket. Rebuilt it as an actual 4-round bracket per
league:

- **Wild Card Series** — unchanged, seeds 1-2 as byes, (3)v(6) and (4)v(5)
  as real matchups with actual teams and records.
- **Division Series** — now a proper matchup card: seed 1 alongside a
  "Winner of (4) / (5)" slot, seed 2 alongside "Winner of (3) / (6)."
- **ALCS / NLCS** — new: "Winner of (1) Series" vs "Winner of (2) Series."
- **World Series** — new: "AL Champion" vs "NL Champion," with a note that
  home field goes to the better regular-season record, not a fixed seed.

Everything from the Division Series on is a labeled placeholder rather than
a guess — nothing past the Wild Card round is actually decided yet, so the
bracket says so instead of pretending otherwise. Also linked MLB's format
page directly in the projection note, since that's a better source of
truth than my own explanation if a reader wants the full rules.
