import { writeFile, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

const ENDPOINT = process.env.OVERPASS_ENDPOINT ?? 'https://overpass-api.de/api/interpreter';
const OUT_DIR = process.env.OUT_DIR ?? '/work/output';
const COUNTRIES_FILE = process.env.COUNTRIES_FILE ?? '/work/data/countries.json';
const SLEEP_MS = Number(process.env.SLEEP_MS ?? 4000);
const COUNTRIES_OVERRIDE = process.env.COUNTRIES; // optional CSV override
const FEATURES_DIR = `${OUT_DIR}/features`;
const POLYGON_GOLF_VALUES = new Set([
  'fairway', 'green', 'tee', 'bunker', 'rough', 'water_hazard',
  'lateral_water_hazard', 'driving_range', 'clubhouse', 'out_of_bounds',
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildQuery(iso) {
  return `
[out:json][timeout:600];
area["ISO3166-1"="${iso}"][admin_level=2]->.country;
(
  way["leisure"="golf_course"](area.country);
  relation["leisure"="golf_course"](area.country);
  way["golf"](area.country);
  node["golf"](area.country);
  relation["golf"](area.country);
);
out geom tags;
`;
}

async function callOverpass(iso, attempt = 1) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'User-Agent': 'opengolfmap-data-fetcher/0.3 (+https://github.com/sirmmo/opengolfmap)',
    },
    body: new URLSearchParams({ data: buildQuery(iso) }),
  });

  if (res.status === 429 || res.status === 504) {
    if (attempt >= 3) throw new Error(`Overpass ${res.status} after ${attempt} attempts for ${iso}`);
    const wait = 30_000 * attempt;
    console.warn(`  ${iso}: HTTP ${res.status}, retrying in ${wait / 1000}s (attempt ${attempt + 1})`);
    await sleep(wait);
    return callOverpass(iso, attempt + 1);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Overpass returned ${res.status} for ${iso}: ${body.slice(0, 300)}`);
  }

  return res.json();
}

function ringIsClosed(coords) {
  if (coords.length < 4) return false;
  const a = coords[0], b = coords[coords.length - 1];
  return a[0] === b[0] && a[1] === b[1];
}

function elementToFeatures(el) {
  const tags = el.tags ?? {};

  if (el.type === 'node') {
    return [{
      type: 'Feature',
      id: `node/${el.id}`,
      geometry: { type: 'Point', coordinates: [el.lon, el.lat] },
      properties: { osm_type: 'node', osm_id: el.id, ...tags },
    }];
  }

  if (el.type === 'way' && Array.isArray(el.geometry)) {
    const coords = el.geometry.map((p) => [p.lon, p.lat]);
    const closed = ringIsClosed(coords);
    const golfTag = tags.golf;
    const wantPolygon =
      tags.leisure === 'golf_course' ||
      tags.building != null ||
      (golfTag && POLYGON_GOLF_VALUES.has(golfTag));
    const geom = closed && wantPolygon
      ? { type: 'Polygon', coordinates: [coords] }
      : { type: 'LineString', coordinates: coords };
    return [{
      type: 'Feature',
      id: `way/${el.id}`,
      geometry: geom,
      properties: { osm_type: 'way', osm_id: el.id, ...tags },
    }];
  }

  if (el.type === 'relation' && Array.isArray(el.members)) {
    const outers = [];
    const inners = [];
    for (const m of el.members) {
      if (m.type !== 'way' || !Array.isArray(m.geometry)) continue;
      const coords = m.geometry.map((p) => [p.lon, p.lat]);
      if (!ringIsClosed(coords)) continue;
      (m.role === 'inner' ? inners : outers).push(coords);
    }
    if (outers.length === 0) return [];
    const polygons = outers.map((outer) => [outer, ...inners]);
    const geom = polygons.length === 1
      ? { type: 'Polygon', coordinates: polygons[0] }
      : { type: 'MultiPolygon', coordinates: polygons };
    return [{
      type: 'Feature',
      id: `relation/${el.id}`,
      geometry: geom,
      properties: { osm_type: 'relation', osm_id: el.id, ...tags },
    }];
  }

  return [];
}

function centroidOf(geom) {
  if (geom.type === 'Point') return geom.coordinates;
  if (geom.type === 'LineString' || geom.type === 'Polygon') {
    const ring = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates;
    let sx = 0, sy = 0, n = 0;
    for (const [x, y] of ring) { sx += x; sy += y; n++; }
    return n ? [sx / n, sy / n] : null;
  }
  if (geom.type === 'MultiPolygon') {
    return centroidOf({ type: 'Polygon', coordinates: geom.coordinates[0] });
  }
  return null;
}

function bboxOf(geom) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  function visit(coords) {
    if (typeof coords[0] === 'number') {
      const [x, y] = coords;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    } else {
      for (const c of coords) visit(c);
    }
  }
  visit(geom.coordinates);
  if (!isFinite(minX)) return null;
  return [minX, minY, maxX, maxY];
}

async function fetchCountry(iso, name) {
  const t0 = Date.now();
  process.stdout.write(`[${iso}] ${name}: querying...`);
  const json = await callOverpass(iso);
  const elements = json.elements ?? [];
  const features = elements.flatMap(elementToFeatures);

  const courseFeatures = features.filter((f) => f.properties.leisure === 'golf_course');
  const courseSummaries = courseFeatures.map((f) => {
    const c = centroidOf(f.geometry);
    const bb = bboxOf(f.geometry);
    return {
      type: 'Feature',
      id: f.id,
      geometry: c ? { type: 'Point', coordinates: c } : f.geometry,
      properties: {
        osm_type: f.properties.osm_type,
        osm_id: f.properties.osm_id,
        iso_country: iso,
        country_name: name,
        name: f.properties.name ?? null,
        name_local: f.properties[`name:${iso.toLowerCase()}`] ?? null,
        holes: f.properties.holes ? Number(f.properties.holes) : null,
        par: f.properties.par ? Number(f.properties.par) : null,
        website: f.properties.website ?? null,
        phone: f.properties.phone ?? null,
        email: f.properties.email ?? null,
        operator: f.properties.operator ?? null,
        access: f.properties.access ?? null,
        addr_city: f.properties['addr:city'] ?? null,
        addr_street: f.properties['addr:street'] ?? null,
        addr_postcode: f.properties['addr:postcode'] ?? null,
        bbox: bb,
      },
    };
  });

  // Tag every feature with its iso for downstream filtering on the map.
  for (const f of features) {
    f.properties.iso_country = iso;
  }

  const featuresFC = {
    type: 'FeatureCollection',
    metadata: {
      source: 'OpenStreetMap contributors via Overpass API',
      license: 'ODbL',
      country: iso,
      fetched_at: new Date().toISOString(),
      feature_count: features.length,
    },
    features,
  };

  await mkdir(FEATURES_DIR, { recursive: true });
  await writeFile(`${FEATURES_DIR}/${iso}.geojson`, JSON.stringify(featuresFC));

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(` ${features.length} features, ${courseSummaries.length} courses (${dt}s)`);

  return { iso, name, courseSummaries, featureCount: features.length };
}

// --- main ---

const countriesData = JSON.parse(await readFile(COUNTRIES_FILE, 'utf8'));
let countries = countriesData.countries ?? [];
if (COUNTRIES_OVERRIDE) {
  const allowed = new Set(COUNTRIES_OVERRIDE.split(',').map((s) => s.trim().toUpperCase()));
  countries = countries.filter((c) => allowed.has(c.iso));
}

console.log(`Fetching golf data for ${countries.length} countries...`);
console.log('');

const allCourses = [];
const manifest = {
  fetched_at: new Date().toISOString(),
  source: 'OpenStreetMap contributors via Overpass API',
  license: 'ODbL',
  countries: [],
};

const failures = [];

for (let i = 0; i < countries.length; i++) {
  const c = countries[i];
  try {
    const result = await fetchCountry(c.iso, c.name);
    allCourses.push(...result.courseSummaries);
    manifest.countries.push({
      iso: result.iso,
      name: result.name,
      course_count: result.courseSummaries.length,
      feature_count: result.featureCount,
      features_url: `data/features/${result.iso}.geojson`,
    });
  } catch (err) {
    console.error(`  ${c.iso} FAILED: ${err.message}`);
    failures.push({ iso: c.iso, name: c.name, error: err.message });
  }
  if (i < countries.length - 1) await sleep(SLEEP_MS);
}

const courseSummaryFC = {
  type: 'FeatureCollection',
  metadata: {
    source: 'OpenStreetMap contributors via Overpass API',
    license: 'ODbL',
    fetched_at: new Date().toISOString(),
    feature_count: allCourses.length,
  },
  features: allCourses,
};

await mkdir(OUT_DIR, { recursive: true });
await writeFile(`${OUT_DIR}/golf-courses-europe.geojson`, JSON.stringify(courseSummaryFC));
await writeFile(`${OUT_DIR}/manifest.json`, JSON.stringify(manifest, null, 2));

// Remove the legacy single-country files if they exist.
for (const legacy of ['golf-courses-it.geojson', 'golf-features-it.geojson']) {
  try {
    await rm(`${OUT_DIR}/${legacy}`, { force: true });
  } catch {}
}

console.log('');
console.log(`Total: ${allCourses.length} courses across ${manifest.countries.length} countries`);
if (failures.length) {
  console.log(`Failures: ${failures.length}`);
  for (const f of failures) console.log(`  ${f.iso}: ${f.error}`);
}
