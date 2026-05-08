import { readFile, writeFile, readdir } from 'node:fs/promises';

const IN_DIR = process.env.IN_DIR ?? '/work/output/features';
const SUMMARY_FILE = process.env.SUMMARY_FILE ?? '/work/output/golf-courses-europe.geojson';
const COORD_DECIMALS = Number(process.env.COORD_DECIMALS ?? 5);
// Simplification tolerance in degrees. ~0.00006° ≈ 6 m at the equator.
// Tuned so GB.geojson lands under GitHub's 100 MB per-file hard limit.
const SIMPLIFY_EPS = Number(process.env.SIMPLIFY_EPS ?? 0.00006);
// Only simplify rings/lines longer than this point count.
const SIMPLIFY_MIN_POINTS = Number(process.env.SIMPLIFY_MIN_POINTS ?? 15);

// Tags that drive map layers or are surfaced in the UI. Everything else is dropped.
const KEEP_PROP_KEYS = new Set([
  'osm_type', 'osm_id', 'iso_country',
  'leisure', 'golf', 'building', 'name',
]);

const KEEP_GOLF_VALUES = new Set([
  'fairway', 'green', 'tee', 'bunker', 'rough',
  'water_hazard', 'lateral_water_hazard', 'driving_range',
  'cartpath', 'path', 'hole', 'clubhouse', 'pin', 'out_of_bounds',
]);

function keepFeature(props) {
  if (props.leisure === 'golf_course') return true;
  if (props.golf && KEEP_GOLF_VALUES.has(props.golf)) return true;
  if (props.building === 'clubhouse') return true;
  return false;
}

function pruneProps(props) {
  const out = {};
  for (const k of KEEP_PROP_KEYS) {
    if (props[k] != null) out[k] = props[k];
  }
  return out;
}

const round = (n) => Math.round(n * 10 ** COORD_DECIMALS) / 10 ** COORD_DECIMALS;

// Iterative Douglas-Peucker on an array of [x, y] points.
function dpSimplify(points, eps) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0;
    let maxI = -1;
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const denom = dx * dx + dy * dy || 1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      // Perpendicular distance from p to segment a-b.
      const t = ((px - ax) * dx + (py - ay) * dy) / denom;
      const cx = ax + t * dx;
      const cy = ay + t * dy;
      const ex = px - cx;
      const ey = py - cy;
      const d = ex * ex + ey * ey;
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxI >= 0 && maxD > eps * eps) {
      keep[maxI] = 1;
      stack.push([a, maxI]);
      stack.push([maxI, b]);
    }
  }
  const out = [];
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) out.push(points[i]);
  }
  return out;
}

function compactCoords(coords) {
  if (typeof coords[0] === 'number') {
    return [round(coords[0]), round(coords[1])];
  }
  return coords.map(compactCoords);
}

function maybeSimplifyRing(ring) {
  if (ring.length < SIMPLIFY_MIN_POINTS) return ring;
  const simplified = dpSimplify(ring, SIMPLIFY_EPS);
  // A polygon ring needs at least 4 points (3 distinct + closing).
  if (simplified.length < 4) return ring;
  // Preserve closure for polygon rings.
  const first = ring[0];
  const last = ring[ring.length - 1];
  const isRing = first[0] === last[0] && first[1] === last[1];
  if (isRing && (
    simplified[0][0] !== simplified[simplified.length - 1][0] ||
    simplified[0][1] !== simplified[simplified.length - 1][1]
  )) {
    simplified.push(simplified[0]);
  }
  return simplified;
}

function maybeSimplifyLine(line) {
  if (line.length < SIMPLIFY_MIN_POINTS) return line;
  const simplified = dpSimplify(line, SIMPLIFY_EPS);
  return simplified.length >= 2 ? simplified : line;
}

function compactGeometry(geom) {
  if (!geom) return geom;
  switch (geom.type) {
    case 'Point':
      return { type: 'Point', coordinates: compactCoords(geom.coordinates) };
    case 'LineString':
      return {
        type: 'LineString',
        coordinates: maybeSimplifyLine(geom.coordinates).map(compactCoords),
      };
    case 'Polygon':
      return {
        type: 'Polygon',
        coordinates: geom.coordinates.map((ring) => maybeSimplifyRing(ring).map(compactCoords)),
      };
    case 'MultiPolygon':
      return {
        type: 'MultiPolygon',
        coordinates: geom.coordinates.map((poly) =>
          poly.map((ring) => maybeSimplifyRing(ring).map(compactCoords)),
        ),
      };
    case 'MultiLineString':
      return {
        type: 'MultiLineString',
        coordinates: geom.coordinates.map((line) =>
          maybeSimplifyLine(line).map(compactCoords),
        ),
      };
    default:
      return geom;
  }
}

async function compactCountryFile(path) {
  const raw = await readFile(path, 'utf8');
  const fc = JSON.parse(raw);
  const before = raw.length;
  const beforeCount = fc.features.length;

  const features = [];
  for (const f of fc.features) {
    if (!keepFeature(f.properties)) continue;
    features.push({
      type: 'Feature',
      id: f.id,
      geometry: compactGeometry(f.geometry),
      properties: pruneProps(f.properties),
    });
  }

  const compactFC = {
    type: 'FeatureCollection',
    metadata: { ...(fc.metadata ?? {}), feature_count: features.length },
    features,
  };
  const out = JSON.stringify(compactFC);
  await writeFile(path, out);
  return { before, after: out.length, beforeCount, afterCount: features.length };
}

async function compactSummary(path) {
  const raw = await readFile(path, 'utf8');
  const fc = JSON.parse(raw);
  const before = raw.length;
  for (const f of fc.features) {
    f.geometry = compactGeometry(f.geometry);
    if (f.properties.bbox) {
      f.properties.bbox = f.properties.bbox.map(round);
    }
  }
  const out = JSON.stringify(fc);
  await writeFile(path, out);
  return { before, after: out.length };
}

const fmt = (n) => {
  if (n > 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
  if (n > 1024) return (n / 1024).toFixed(1) + ' KB';
  return n + ' B';
};

const files = (await readdir(IN_DIR))
  .filter((f) => f.endsWith('.geojson'))
  .sort();

let totalBefore = 0;
let totalAfter = 0;

for (const file of files) {
  const path = `${IN_DIR}/${file}`;
  try {
    const r = await compactCountryFile(path);
    totalBefore += r.before;
    totalAfter += r.after;
    const pct = ((1 - r.after / r.before) * 100).toFixed(0);
    console.log(`  ${file.padEnd(14)} ${fmt(r.before).padStart(10)} → ${fmt(r.after).padStart(10)}  (-${pct}%)  ${r.beforeCount} → ${r.afterCount} features`);
  } catch (err) {
    console.error(`  ${file}: FAILED — ${err.message}`);
  }
}

const summary = await compactSummary(SUMMARY_FILE);
totalBefore += summary.before;
totalAfter += summary.after;
console.log(`  ${'(summary)'.padEnd(14)} ${fmt(summary.before).padStart(10)} → ${fmt(summary.after).padStart(10)}`);

console.log('');
console.log(`Total: ${fmt(totalBefore)} → ${fmt(totalAfter)}  (-${((1 - totalAfter / totalBefore) * 100).toFixed(0)}%)`);
