#!/usr/bin/env node
/**
 * generate-route-shells.js
 *
 * Runs automatically after `ng build` (wired up as an npm "postbuild" hook).
 *
 * Problem this solves:
 *   Baseball Nerd is a client-side-rendered Angular SPA. Cloudflare's
 *   `not_found_handling: "single-page-application"` setting means every
 *   route that isn't a literal static file (`/scores`, `/standings`, ...)
 *   falls back to the SAME dist/index.html. A crawler that doesn't execute
 *   JavaScript — which is how Google's AdSense crawler has been behaving
 *   against this site — sees byte-identical "generic homepage" content on
 *   every single indexed URL. That looks like thin / replicated content.
 *
 * What this script does:
 *   Takes the already-built dist/baseball-nerd/browser/index.html (which has
 *   the correct content-hashed <script>/<link> tags injected by the Angular
 *   build) and, for each route in route-content.js, writes a REAL static
 *   file at dist/baseball-nerd/browser/<slug>/index.html. Each copy keeps
 *   the same JS bundle references and <base href="/"> (so the Angular app
 *   still boots and takes over normally for real visitors) but gets its own
 *   <title>, meta description, canonical tag, and static fallback content
 *   describing that specific page.
 *
 *   Because Cloudflare serves any file that actually exists in the assets
 *   directory before falling back to the SPA catch-all, requests to
 *   /scores, /standings, etc. will now hit these dedicated files instead of
 *   the homepage fallback.
 *
 * This does NOT change anything for real users with JavaScript enabled —
 * Angular still boots, the router still renders the live component, and
 * this fallback markup is replaced within milliseconds like it already is
 * on the homepage today.
 */

const fs = require('fs');
const path = require('path');
const routes = require('./route-content');

const BROWSER_DIR = path.join(__dirname, '..', 'dist', 'baseball-nerd', 'browser');
const BASE_INDEX = path.join(BROWSER_DIR, 'index.html');
const SITE_ORIGIN = 'https://baseballnerdsite.com';

function replaceOnce(html, pattern, replacement, label) {
  if (!pattern.test(html)) {
    throw new Error(`generate-route-shells: could not find ${label} in base index.html — template may have changed. Aborting so a bad build isn't deployed.`);
  }
  return html.replace(pattern, replacement);
}

function buildShell(baseHtml, route) {
  let html = baseHtml;

  html = replaceOnce(
    html,
    /<title>[\s\S]*?<\/title>/,
    `<title>${route.title}</title>`,
    '<title>'
  );

  html = replaceOnce(
    html,
    /<meta name="description" content="[^"]*">/,
    `<meta name="description" content="${route.description}">`,
    'meta description'
  );

  html = replaceOnce(
    html,
    /<meta property="og:title" content="[^"]*">/,
    `<meta property="og:title" content="${route.title}">`,
    'og:title'
  );

  html = replaceOnce(
    html,
    /<meta property="og:description" content="[^"]*">/,
    `<meta property="og:description" content="${route.description}">`,
    'og:description'
  );

  html = replaceOnce(
    html,
    /<link rel="canonical" href="[^"]*">/,
    `<link rel="canonical" href="${SITE_ORIGIN}/${route.slug}">`,
    'canonical link'
  );

  const fallback = `
  <div style="font-family: Georgia, serif; max-width: 860px; margin: 40px auto; padding: 20px; color: #222; line-height: 1.7;">
    <h1 style="font-size: 2rem; margin-bottom: 0.5rem;">${route.h1}</h1>
    <p style="font-size: 1rem; color: #555; margin-bottom: 1.5rem;">${route.subhead}</p>
    ${route.bodyHtml}
    <nav style="margin-top: 2rem; font-size: 0.95rem;">
      <a href="/" style="color: #c0392b; margin-right: 12px;">Home</a>
      <a href="/scores" style="color: #c0392b; margin-right: 12px;">Scores</a>
      <a href="/standings" style="color: #c0392b; margin-right: 12px;">Standings</a>
      <a href="/stats" style="color: #c0392b; margin-right: 12px;">Stats</a>
      <a href="/players" style="color: #c0392b; margin-right: 12px;">Players</a>
      <a href="/team-schedule" style="color: #c0392b; margin-right: 12px;">Schedules</a>
      <a href="/depth-chart" style="color: #c0392b; margin-right: 12px;">Depth Charts</a>
      <a href="/stadium-weather" style="color: #c0392b; margin-right: 12px;">Stadium Weather</a>
      <a href="/about" style="color: #c0392b; margin-right: 12px;">About</a>
      <a href="/privacy" style="color: #c0392b; margin-right: 12px;">Privacy Policy</a>
      <a href="/feedback" style="color: #c0392b;">Feedback</a>
    </nav>
  </div>
`;

  html = replaceOnce(
    html,
    /<app-root>[\s\S]*?<\/app-root>/,
    `<app-root>\n  <!-- Static fallback for route "${route.slug}" — see scripts/generate-route-shells.js -->\n${fallback}</app-root>`,
    '<app-root> block'
  );

  return html;
}

function main() {
  if (!fs.existsSync(BASE_INDEX)) {
    console.error(`generate-route-shells: ${BASE_INDEX} not found. Run "ng build" first.`);
    process.exit(1);
  }

  const baseHtml = fs.readFileSync(BASE_INDEX, 'utf8');
  const slugsSeen = new Set();
  let written = 0;

  for (const route of routes) {
    if (slugsSeen.has(route.slug)) {
      throw new Error(`generate-route-shells: duplicate slug "${route.slug}" in route-content.js`);
    }
    slugsSeen.add(route.slug);

    const outDir = path.join(BROWSER_DIR, route.slug);
    const outFile = path.join(outDir, 'index.html');
    const html = buildShell(baseHtml, route);

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, html, 'utf8');
    written++;
    console.log(`  ✔ ${route.slug.padEnd(16)} -> dist/baseball-nerd/browser/${route.slug}/index.html`);
  }

  console.log(`generate-route-shells: wrote ${written} route-specific static shells.`);
}

main();
