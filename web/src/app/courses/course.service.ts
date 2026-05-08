import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  CourseCollection,
  CourseFeature,
  GolfFeatureCollection,
} from './course.types';

@Injectable({ providedIn: 'root' })
export class CourseService {
  private readonly _courses = signal<CourseCollection | null>(null);
  private readonly _features = signal<GolfFeatureCollection | null>(null);
  private readonly _selectedId = signal<string | null>(null);
  private readonly _query = signal<string>('');

  readonly collection = this._courses.asReadonly();
  readonly features = this._features.asReadonly();
  readonly selectedId = this._selectedId.asReadonly();
  readonly query = this._query.asReadonly();

  readonly courses = computed<CourseFeature[]>(() => {
    const c = this._courses();
    if (!c) return [];
    const q = this._query().trim().toLowerCase();
    const sorted = [...c.features].sort((a, b) => {
      const an = a.properties.name ?? '';
      const bn = b.properties.name ?? '';
      if (!an && bn) return 1;
      if (an && !bn) return -1;
      return an.localeCompare(bn, 'it');
    });
    if (!q) return sorted;
    return sorted.filter((f) => {
      const p = f.properties;
      return (
        (p.name ?? '').toLowerCase().includes(q) ||
        (p.addr_city ?? '').toLowerCase().includes(q) ||
        (p.operator ?? '').toLowerCase().includes(q)
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
    if (this._courses() && this._features()) return;
    const [courses, features] = await Promise.all([
      firstValueFrom(this.http.get<CourseCollection>('data/golf-courses-it.geojson')),
      firstValueFrom(this.http.get<GolfFeatureCollection>('data/golf-features-it.geojson')),
    ]);
    this._courses.set(courses);
    this._features.set(features);
  }

  select(id: string | null): void {
    this._selectedId.set(id);
  }

  setQuery(q: string): void {
    this._query.set(q);
  }
}
