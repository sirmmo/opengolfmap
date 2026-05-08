import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  CourseCollection,
  CourseFeature,
  GolfFeatureCollection,
  Manifest,
} from './course.types';

@Injectable({ providedIn: 'root' })
export class CourseService {
  private readonly _courses = signal<CourseCollection | null>(null);
  private readonly _manifest = signal<Manifest | null>(null);
  private readonly _selectedId = signal<string | null>(null);
  private readonly _query = signal<string>('');
  private readonly _country = signal<string | null>(null);
  private readonly _countryCache = signal<Map<string, GolfFeatureCollection>>(new Map());
  private readonly _loadingCountry = signal<string | null>(null);

  readonly collection = this._courses.asReadonly();
  readonly manifest = this._manifest.asReadonly();
  readonly selectedId = this._selectedId.asReadonly();
  readonly query = this._query.asReadonly();
  readonly activeCountry = this._country.asReadonly();
  readonly loadingCountry = this._loadingCountry.asReadonly();

  readonly activeCountryFeatures = computed<GolfFeatureCollection | null>(() => {
    const iso = this._country();
    if (!iso) return null;
    return this._countryCache().get(iso) ?? null;
  });

  readonly countryFilter = signal<string | null>(null);

  readonly courses = computed<CourseFeature[]>(() => {
    const c = this._courses();
    if (!c) return [];
    const q = this._query().trim().toLowerCase();
    const countryFilter = this.countryFilter();
    let list = c.features;
    if (countryFilter) {
      list = list.filter((f) => f.properties.iso_country === countryFilter);
    }
    const sorted = [...list].sort((a, b) => {
      const an = a.properties.name ?? '';
      const bn = b.properties.name ?? '';
      if (!an && bn) return 1;
      if (an && !bn) return -1;
      return an.localeCompare(bn, undefined, { sensitivity: 'base' });
    });
    if (!q) return sorted;
    return sorted.filter((f) => {
      const p = f.properties;
      return (
        (p.name ?? '').toLowerCase().includes(q) ||
        (p.addr_city ?? '').toLowerCase().includes(q) ||
        (p.operator ?? '').toLowerCase().includes(q) ||
        (p.country_name ?? '').toLowerCase().includes(q)
      );
    });
  });

  readonly selected = computed<CourseFeature | null>(() => {
    const id = this._selectedId();
    if (!id) return null;
    return this._courses()?.features.find((f) => f.id === id) ?? null;
  });

  constructor(private readonly http: HttpClient) {}

  async load(): Promise<void> {
    if (this._courses() && this._manifest()) return;
    const [courses, manifest] = await Promise.all([
      firstValueFrom(this.http.get<CourseCollection>('data/golf-courses-europe.geojson')),
      firstValueFrom(this.http.get<Manifest>('data/manifest.json')),
    ]);
    this._courses.set(courses);
    this._manifest.set(manifest);
  }

  async loadCountry(iso: string): Promise<void> {
    if (this._countryCache().has(iso)) return;
    if (this._loadingCountry() === iso) return;
    const entry = this._manifest()?.countries.find((c) => c.iso === iso);
    if (!entry) return;
    this._loadingCountry.set(iso);
    try {
      const data = await firstValueFrom(
        this.http.get<GolfFeatureCollection>(entry.features_url),
      );
      const next = new Map(this._countryCache());
      next.set(iso, data);
      this._countryCache.set(next);
    } finally {
      if (this._loadingCountry() === iso) this._loadingCountry.set(null);
    }
  }

  async select(id: string | null): Promise<void> {
    this._selectedId.set(id);
    if (!id) return;
    const course = this._courses()?.features.find((f) => f.id === id);
    const iso = course?.properties.iso_country;
    if (iso) {
      this._country.set(iso);
      await this.loadCountry(iso);
    }
  }

  setQuery(q: string): void {
    this._query.set(q);
  }

  setCountryFilter(iso: string | null): void {
    this.countryFilter.set(iso);
  }
}
