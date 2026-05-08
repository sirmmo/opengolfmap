# opengolfmap

A field-guide–style web atlas of European golf courses, sourced from OpenStreetMap. Angular 18 SPA + MapLibre GL. Per-country GeoJSON files lazy-loaded on selection. Pages-deployed at http://ingmmo.com/opengolfmap/.

For the full design brief and principles, see [`.impeccable.md`](.impeccable.md).

## TL;DR for future Claude sessions

- **Audience:** OSM/data nerds. They appreciate that this is OSM-derived. Surface tags, ISO codes, and fetch dates as small typeset details — never hide the data heritage.
- **Voice:** earthy · pastoral · slow. Field guide, not SaaS dashboard, not sports app.
- **Type:** Vollkorn for everything; Cutive Mono ONLY for OSM/data captions. Two faces, total. No Inter, Plex, DM, Fraunces, Newsreader, Cormorant, Crimson, or Playfair.
- **Color:** cream parchment + pressed-leaf greens + warm sandstone + faded watercolour blue. Never vivid sport-app green. Never pure black or white.
- **Surfaces:** paper, not chrome. Hairline rules. No drop shadows, no glassmorphism, no border-left accent stripes (banned), no rounded SaaS cards.
- **Motion:** unhurried (400–700 ms ease-out-quart). No bounces, no springs.
- **Theme:** default light (cream parchment); dark (midnight forest) via toggle; persists.

## Stack

- **Frontend:** Angular 18 standalone components + signals; MapLibre GL JS
- **Data pipeline:** `data/fetch-courses.mjs` (Overpass per ISO with retries) → `data/compact.mjs` (prune tags, round coords, DP-simplify big polygons)
- **Dev:** Docker (`docker compose up web` → http://localhost:4200)
- **Deploy:** GitHub Actions → Pages on push to main; weekly Overpass refresh on Mondays 04:17 UTC

## Repo layout

```
data/                   ← extraction + compaction scripts
  countries.json          47 European ISO codes
  fetch-courses.mjs       Overpass per-country fetch
  compact.mjs             prune + round + DP simplify
web/
  public/data/            committed GeoJSON (per-country features + Europe-wide centroids)
  src/app/
    app.component.*       shell layout + masthead + theme toggle
    courses/              CourseService, list, detail (with tabbed Course / Scorecard)
    scorecard/            ScorecardComponent + ScorecardStore (localStorage)
    map/                  MapComponent (basemap tint + golf layers)
    theme/                ThemeService (light/dark)
.github/workflows/
  deploy.yml              ng build → Pages
  refresh-data.yml        Overpass + compact, weekly cron
```

## Design Context

### Users

People who appreciate that this is **OSM-derived**, not the millionth golf-app: cartographers, OSM editors, data-curious developers, and golfers who happen to love maps. They can read raw tags, value provenance, and will spend ten minutes panning across a country looking at fairway shapes for fun.

Primary context: desktop, deliberate browsing — not "I need the next tee time in 5 minutes."

### Brand Personality

**earthy · pastoral · slow.** Physical reference: a 1970s hardback nature atlas, a letterpress trail manual, a pressed-leaf scrapbook with hand-set captions.

### Aesthetic Direction

- Theme: default light (cream parchment), togglable dark (midnight forest)
- Palette: pressed-leaf greens, warm naturals (cream, oat), terracotta and burnt sienna as RARE accents, faded watercolour blue for water hazards, warm sandstone for bunkers
- Type: Vollkorn (everything) + Cutive Mono (data captions only)
- Surfaces: paper, hairline rules, no chrome
- Layout: asymmetric, generous margins, hierarchy through space and weight
- Map: basemap tinted to read as aged paper; golf layers in botanical colors

### Anti-References

NOT generic dashboard SaaS, NOT generic Mapbox/Maplibre demo, NOT country-club kitsch, NOT golf-app cliché.

### Design Principles

1. **OSM transparency, pastoral form.** Surface tags as typeset details, not as "developer aesthetic."
2. **Paper, not chrome.** Hairline rules; no shadows, glassmorphism, or accent stripes.
3. **Slow, deliberate motion.** 400–700 ms ease-out-quart; no springs.
4. **One typographic voice.** Vollkorn everywhere; Cutive Mono only for data.
5. **The map is the artifact, not a widget.** Treat the basemap; render golf as botanical illustration.
