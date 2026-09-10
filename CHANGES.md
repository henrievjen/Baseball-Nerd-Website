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
