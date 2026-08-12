// Route-specific SEO/AdSense fallback content.
//
// WHY THIS FILE EXISTS:
// Baseball Nerd is a client-side-rendered Angular SPA. Every route (/scores,
// /standings, etc.) is served the same dist/index.html by Cloudflare's SPA
// fallback, so crawlers that don't execute JavaScript (including Google's
// AdSense crawler) were seeing byte-identical "generic homepage" content on
// every single indexed URL. That pattern reads as thin/replicated content.
//
// generate-route-shells.js uses this data to produce a REAL, separate
// index.html per route (dist/baseball-nerd/browser/<slug>/index.html) with
// its own <title>, meta description, canonical tag, and static fallback
// content describing that specific page. The Angular bundle still boots
// normally and replaces this content for real visitors with JS enabled —
// this only changes what's in the very first HTML response.
//
// Keep entries honest and specific to what the feature actually does. Don't
// pad with generic filler just to hit a word count.

module.exports = [
  {
    slug: 'scores',
    title: 'Live MLB Scores — Baseball Nerd',
    description: 'Live MLB scores for every game today, with inning-by-inning detail, starting pitcher matchups, and final results for all 30 teams.',
    h1: 'Live MLB Scores',
    subhead: 'Every game, every inning, updated straight from the official MLB Stats API.',
    bodyHtml: `
      <p>
        The Scores page shows every Major League Baseball game for the day in one view —
        scheduled matchups before first pitch, live inning-by-inning score tracking once a
        game starts, and final results once it wraps up. Each game card includes the starting
        pitching matchup, the current inning and score state, and a link into a full box score.
      </p>
      <p>
        Data comes directly from the <strong>official MLB Stats API</strong> (statsapi.mlb.com),
        the same source MLB.com itself uses, so there's no scraping and no artificial delay
        between what happens on the field and what shows up on the page.
      </p>
      <p>
        Looking for more context on a game? Check the <a href="/standings" style="color:#c0392b;">standings</a>
        to see how a result moves the division and wild card races, or head to
        <a href="/stats" style="color:#c0392b;">league leaders</a> to see how the players involved
        stack up this season. New to reading a line score or a box score line-by-line? The guide on
        <a href="/blog/how-to-read-box-scores.html" style="color:#c0392b;">how to read a baseball box score</a>
        breaks down every column and abbreviation.
      </p>
    `
  },
  {
    slug: 'standings',
    title: 'MLB Standings — AL & NL Division and Wild Card Races | Baseball Nerd',
    description: 'Full American League and National League standings — wins, losses, win percentage, games behind, run differential, and the wild card race, updated daily.',
    h1: 'MLB Standings',
    subhead: 'American League and National League, all three divisions each, updated daily.',
    bodyHtml: `
      <p>
        The Standings page covers all six MLB divisions — AL East, AL Central, AL West, NL East,
        NL Central, and NL West — with wins, losses, winning percentage, games behind the division
        leader, run differential, and home/away splits for every team.
      </p>
      <p>
        Since 2022, MLB's postseason field expands to 12 teams: the three division winners in each
        league plus three wild card teams, seeded into a Wild Card round ahead of the Division
        Series and League Championship Series. The wild card section of this page tracks exactly
        which teams are in that picture and by how many games, updated daily as results come in.
        For the full breakdown of how the bracket plays out, see
        <a href="/blog/mlb-playoff-format.html" style="color:#c0392b;">how the MLB playoffs work</a>.
      </p>
      <p>
        Pair the standings with <a href="/scores" style="color:#c0392b;">today's scores</a> to see
        results move the race in real time, or check a specific team's
        <a href="/team-schedule" style="color:#c0392b;">schedule</a> for what's coming up next.
      </p>
    `
  },
  {
    slug: 'stats',
    title: 'MLB Stat Leaders — Batting & Pitching Leaderboards | Baseball Nerd',
    description: 'MLB league leaders in batting (AVG, OBP, SLG, OPS, HR, RBI, SB) and pitching (ERA, WHIP, K/9, IP), filterable by team and season.',
    h1: 'League Leaders',
    subhead: 'Batting and pitching leaderboards, filterable by team and season.',
    bodyHtml: `
      <p>
        The Stats page ranks MLB players across the core batting and pitching categories:
        batting average, on-base percentage, slugging, OPS, home runs, RBI, and stolen bases on
        the hitting side; ERA, WHIP, strikeouts, and innings pitched on the mound. Filter by a
        specific team or view leaders across all of MLB, and switch between seasons to compare
        this year's leaders against past years.
      </p>
      <p>
        All figures come straight from the official MLB Stats API and are corrected automatically
        if MLB issues an official stat adjustment after the fact. If a stat abbreviation like WHIP
        or OPS isn't familiar, the
        <a href="/blog/baseball-statistics-guide.html" style="color:#c0392b;">complete guide to baseball statistics</a>
        explains what each one measures and why it matters, in plain English.
      </p>
      <p>
        Stat leaders are also a good starting point for
        <a href="/players" style="color:#c0392b;">player search</a> — find a name on the
        leaderboard, then pull up their full career page.
      </p>
    `
  },
  {
    slug: 'players',
    title: 'MLB Player Search — Profiles, Stats & Game Logs | Baseball Nerd',
    description: 'Search any current or historical MLB player by name to view their full profile, career and season stats, and game log.',
    h1: 'Player Search',
    subhead: 'Search any current or historical MLB player by name.',
    bodyHtml: `
      <p>
        Search the complete MLB player database by name to pull up a full profile: career and
        season batting or pitching statistics, a game-by-game log, current team and roster status,
        and a player headshot sourced from MLB's official content delivery network.
      </p>
      <p>
        The search covers both current major leaguers and historical players, so it works whether
        you're looking up tonight's starting pitcher or a Hall of Famer from decades ago. Every
        stat line is pulled from the official MLB Stats API rather than a third-party scrape.
      </p>
      <p>
        Not sure which stats matter most for a given player? The
        <a href="/blog/baseball-statistics-guide.html" style="color:#c0392b;">baseball statistics guide</a>
        walks through what each batting and pitching stat measures, and
        <a href="/stats" style="color:#c0392b;">league leaders</a> shows how a player ranks against
        the rest of MLB this season.
      </p>
    `
  },
  {
    slug: 'team-schedule',
    title: 'MLB Team Schedules — All 30 Teams, Past & Upcoming Games | Baseball Nerd',
    description: 'Full season schedule for any of the 30 MLB teams, with starting pitcher matchups, past results, and upcoming games by season.',
    h1: 'Team Schedules',
    subhead: 'Full season schedule for any MLB team, past or upcoming.',
    bodyHtml: `
      <p>
        Pick any of the 30 MLB franchises to see their full schedule for a given season — past
        results with final scores, and upcoming games with the probable starting pitcher matchup
        when it's been announced. A record summary at the top shows how the team is doing overall,
        including recent form.
      </p>
      <p>
        Switch seasons to look back at a previous year's schedule and results, which is useful for
        comparing a team's pace against last year or checking how a particular stretch of the
        season played out. Schedule and result data comes from the official MLB Stats API.
      </p>
      <p>
        Following a team closely? Pair the schedule with
        <a href="/standings" style="color:#c0392b;">standings</a> to see how each result affects
        the division and wild card race, or check the
        <a href="/depth-chart" style="color:#c0392b;">depth chart</a> to see who's actually been
        taking the field.
      </p>
    `
  },
  {
    slug: 'depth-chart',
    title: 'MLB Depth Charts — Games Started by Position | Baseball Nerd',
    description: 'MLB organizational depth charts by games started at each position, from the major league roster through minor league affiliates, by team and season.',
    h1: 'Depth Chart',
    subhead: 'Games started by position, for any MLB team and season.',
    bodyHtml: `
      <p>
        The Depth Chart page ranks players at each position by games started for a chosen team and
        season — the player with the most starts at a position is the primary starter, and everyone
        below has picked up starts as a backup, part of a platoon, or an injury replacement.
      </p>
      <p>
        Coverage runs from the major league roster down through each organization's minor league
        affiliates, which makes it useful for tracking prospects as well as the active 26-man
        roster. Switch teams or seasons to compare depth year over year.
      </p>
      <p>
        This kind of playing-time breakdown is especially useful for fantasy baseball managers
        trying to spot an everyday player before a breakout — the
        <a href="/blog/fantasy-baseball-stats.html" style="color:#c0392b;">fantasy baseball statistics guide</a>
        covers which categories and signals are worth targeting on draft day.
      </p>
    `
  },
  {
    slug: 'stadium-weather',
    title: 'MLB Stadium Weather — Live Conditions at All 30 Ballparks | Baseball Nerd',
    description: 'Live weather conditions at all 30 MLB ballparks — temperature, wind speed and direction, and precipitation chance — for gameday planning.',
    h1: 'Stadium Weather',
    subhead: 'Live conditions at all 30 MLB ballparks.',
    bodyHtml: `
      <p>
        The Stadium Weather page shows live conditions — temperature, wind speed and direction,
        and precipitation chance — at all 30 MLB ballparks, plotted on a map so you can check
        tonight's home park at a glance or scan the whole league at once.
      </p>
      <p>
        Weather matters more in baseball than most sports: wind blowing out can turn a warning-track
        fly ball into a home run, wind blowing in can knock down what looked like a sure homer, and
        an approaching storm cell can mean a rain delay before the first pitch. Open-air parks in
        particular can play very differently night to night depending on conditions.
      </p>
      <p>
        Curious how each park's dimensions and quirks shape the game on top of the weather? The
        <a href="/blog/mlb-stadiums-guide.html" style="color:#c0392b;">all 30 MLB stadiums guide</a>
        goes park by park through capacity, dimensions, and what makes each one unique.
      </p>
    `
  },
  {
    slug: 'feedback',
    title: 'Feedback & Contact — Baseball Nerd',
    description: 'Report a bug, request a feature, or get in touch with the developer of Baseball Nerd directly.',
    h1: 'Feedback',
    subhead: "We'd love to hear from you.",
    bodyHtml: `
      <p>
        Baseball Nerd is built and maintained by one person, and feedback directly shapes what gets
        built next. Use this page to report a bug, request a feature, or just say hello — the form
        opens your email client with your message pre-filled, and there's no account or sign-up
        required to send it.
      </p>
      <p>
        Found something that looks wrong — a stat that doesn't match, a page that isn't loading, a
        team missing something another team has? That's exactly the kind of report that's most
        useful. Feature requests and general suggestions are just as welcome.
      </p>
      <p>
        You can also reach out directly at
        <a href="mailto:baseballnerdmlb@gmail.com" style="color:#c0392b;">baseballnerdmlb@gmail.com</a>.
      </p>
    `
  },
];

// NOTE: 'about' and 'privacy' are intentionally NOT generated here.
// src/about.html and src/privacy.html already exist as static files with
// real content, and Cloudflare's html_handling config serves them at the
// clean /about and /privacy URLs automatically (redirecting the .html
// version to the extensionless one). A generated about/index.html or
// privacy/index.html would just be shadowed/unreachable dead output —
// confirmed with `wrangler dev` before removing these entries.
