import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const ENDPOINT = process.env.OVERPASS_ENDPOINT ?? 'https://overpass-api.de/api/interpreter';
const OUT_DIR = process.env.OUT_DIR ?? '/work/output';
const COUNTRY_ISO = process.env.COUNTRY_ISO ?? 'IT';

const QUERY = `
[out:json][timeout:600];
area["ISO3166-1"="${COUNTRY_ISO}"][admin_level=2]->.country;
(
  way["leisure"="golf_course"](area.country);
  relation["leisure"="golf_course"](area.country);
  way["golf"](area.country);
  node["golf"](area.country);
  relation["golf"](area.country);
);
out geom tags;
`;

console.log(`Querying Overpass for golf data in ${COUNTRY_ISO}...`);
const t0 = Date.now();

const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json',
    'User-Agent': 'opengolfmap-data-fetcher/0.2 (+https://github.com/opengolfmap)',
  },
  body: new URLSearchParams({ data: QUERY }),
});

if (!res.ok) {
  const body = await res.text();
  throw new Error(`Overpass returned ${res.status}: ${body.slice(0, 500)}`);
}

const json = await res.json();
console.log(`Got ${json.elements?.length ?? 0} elements in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const POLYGON_GOLF_VALUES = new Set([
  'fairway', 'green', 'tee', 'bunker', 'rough', 'water_hazard',
  'lateral_water_hazard', 'driving_range', 'clubhouse', 'out_of_bounds',
]);

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

const features = (json.elements ?? []).flatMap(elementToFeatures);
console.log(`Converted to ${features.length} GeoJSON features`);

const courseFeatures = features.filter((f) => f.properties.leisure === 'golf_course');
const courses = courseFeatures.map((f) => {
  const c = centroidOf(f.geometry);
  const bb = bboxOf(f.geometry);
  return {
    type: 'Feature',
    id: f.id,
    geometry: c ? { type: 'Point', coordinates: c } : f.geometry,
    properties: {
      osm_type: f.properties.osm_type,
      osm_id: f.properties.osm_id,
      name: f.properties.name ?? null,
      name_it: f.properties['name:it'] ?? null,
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

const featuresCollection = {
  type: 'FeatureCollection',
  metadata: {
    source: 'OpenStreetMap contributors via Overpass API',
    license: 'ODbL',
    country: COUNTRY_ISO,
    fetched_at: new Date().toISOString(),
    feature_count: features.length,
  },
  features,
};

const coursesCollection = {
  type: 'FeatureCollection',
  metadata: {
    source: 'OpenStreetMap contributors via Overpass API',
    license: 'ODbL',
    country: COUNTRY_ISO,
    fetched_at: new Date().toISOString(),
    feature_count: courses.length,
  },
  features: courses,
};

await mkdir(OUT_DIR, { recursive: true });
await writeFile(`${OUT_DIR}/golf-features-it.geojson`, JSON.stringify(featuresCollection));
await writeFile(`${OUT_DIR}/golf-courses-it.geojson`, JSON.stringify(coursesCollection));
console.log(`Wrote ${features.length} features + ${courses.length} courses to ${OUT_DIR}`);
