export interface CourseProperties {
  osm_type: 'node' | 'way' | 'relation';
  osm_id: number;
  iso_country: string;
  country_name: string;
  name: string | null;
  name_local: string | null;
  holes: number | null;
  par: number | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  operator: string | null;
  access: string | null;
  addr_city: string | null;
  addr_street: string | null;
  addr_postcode: string | null;
  bbox: [number, number, number, number] | null;
}

export interface CourseFeature {
  type: 'Feature';
  id: string;
  geometry:
    | { type: 'Point'; coordinates: [number, number] }
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] };
  properties: CourseProperties;
}

export interface CourseCollection {
  type: 'FeatureCollection';
  metadata?: {
    source: string;
    license: string;
    fetched_at: string;
    feature_count: number;
  };
  features: CourseFeature[];
}

export interface GolfFeatureProperties {
  osm_type: 'node' | 'way' | 'relation';
  osm_id: number;
  iso_country: string;
  name?: string;
  golf?: string;
  leisure?: string;
  building?: string;
  [key: string]: unknown;
}

export interface GolfFeature {
  type: 'Feature';
  id: string;
  geometry: GeoJSON.Geometry;
  properties: GolfFeatureProperties;
}

export interface GolfFeatureCollection {
  type: 'FeatureCollection';
  metadata?: {
    source: string;
    license: string;
    country: string;
    fetched_at: string;
    feature_count: number;
  };
  features: GolfFeature[];
}

export interface CountryEntry {
  iso: string;
  name: string;
  course_count: number;
  feature_count: number;
  features_url: string;
}

export interface Manifest {
  fetched_at: string;
  source: string;
  license: string;
  countries: CountryEntry[];
}
