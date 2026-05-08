import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  effect,
  inject,
  untracked,
} from '@angular/core';
import {
  Map as MapLibreMap,
  GeoJSONSource,
  LngLatLike,
  LngLatBoundsLike,
} from 'maplibre-gl';
import { CourseService } from '../courses/course.service';
import { CourseFeature } from '../courses/course.types';

const EUROPE_CENTER: LngLatLike = [10, 50];
const SOURCE_COURSES = 'courses';
const SOURCE_GOLF = 'golf';
const TILE_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

@Component({
  selector: 'app-map',
  standalone: true,
  template: `<div #mapEl class="map"></div>`,
  styleUrl: './map.component.scss',
})
export class MapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;

  private readonly courseService = inject(CourseService);
  private map?: MapLibreMap;
  private styleLoaded = false;
  private layersInstalled = false;

  constructor() {
    effect(() => {
      const courses = this.courseService.collection();
      if (!courses || !this.styleLoaded || !this.map) return;
      const src = this.map.getSource(SOURCE_COURSES) as GeoJSONSource | undefined;
      if (src) src.setData(courses as any);
    });

    effect(() => {
      const features = this.courseService.activeCountryFeatures();
      if (!this.styleLoaded || !this.map) return;
      const src = this.map.getSource(SOURCE_GOLF) as GeoJSONSource | undefined;
      if (!src) return;
      src.setData(features ?? { type: 'FeatureCollection', features: [] } as any);
    });

    effect(() => {
      const selected = this.courseService.selected();
      if (!this.map || !this.layersInstalled) return;
      const selectedOsmId = selected?.properties.osm_id ?? -1;
      this.map.setFilter('course-selected-outline', [
        'all',
        ['==', ['get', 'leisure'], 'golf_course'],
        ['==', ['get', 'osm_id'], selectedOsmId],
      ]);
      this.map.setFilter('course-pin-selected', [
        'all',
        ['==', ['get', 'osm_id'], selectedOsmId],
      ]);
      if (selected) this.flyToCourse(selected);
    });
  }

  ngAfterViewInit(): void {
    this.map = new MapLibreMap({
      container: this.mapEl.nativeElement,
      style: TILE_STYLE_URL,
      center: EUROPE_CENTER,
      zoom: 4,
      attributionControl: { compact: true },
    });

    this.map.on('load', () => {
      this.styleLoaded = true;
      this.installLayers();
      this.layersInstalled = true;
      const courses = untracked(() => this.courseService.collection());
      if (courses) (this.map!.getSource(SOURCE_COURSES) as GeoJSONSource).setData(courses as any);
      const features = untracked(() => this.courseService.activeCountryFeatures());
      if (features) (this.map!.getSource(SOURCE_GOLF) as GeoJSONSource).setData(features as any);
    });
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  private installLayers(): void {
    const map = this.map!;

    map.addSource(SOURCE_COURSES, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    map.addSource(SOURCE_GOLF, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    // --- Active country: golf-course backdrop and inner features ---

    map.addLayer({
      id: 'course-fill',
      type: 'fill',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'leisure'], 'golf_course'],
      paint: { 'fill-color': '#cfe3bf', 'fill-opacity': 0.55 },
    });

    map.addLayer({
      id: 'rough-fill',
      type: 'fill',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'golf'], 'rough'],
      paint: { 'fill-color': '#7a9e5a', 'fill-opacity': 0.7 },
    });

    map.addLayer({
      id: 'driving-range-fill',
      type: 'fill',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'golf'], 'driving_range'],
      paint: { 'fill-color': '#bcd99a', 'fill-opacity': 0.8 },
    });

    map.addLayer({
      id: 'fairway-fill',
      type: 'fill',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'golf'], 'fairway'],
      paint: { 'fill-color': '#9ec97e', 'fill-opacity': 0.9 },
    });

    map.addLayer({
      id: 'water-fill',
      type: 'fill',
      source: SOURCE_GOLF,
      filter: [
        'any',
        ['==', ['get', 'golf'], 'water_hazard'],
        ['==', ['get', 'golf'], 'lateral_water_hazard'],
      ],
      paint: { 'fill-color': '#7eb5db', 'fill-opacity': 0.85 },
    });

    map.addLayer({
      id: 'bunker-fill',
      type: 'fill',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'golf'], 'bunker'],
      paint: { 'fill-color': '#f1e3b3', 'fill-opacity': 0.95 },
    });
    map.addLayer({
      id: 'bunker-outline',
      type: 'line',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'golf'], 'bunker'],
      paint: { 'line-color': '#d8c378', 'line-width': 0.6 },
    });

    map.addLayer({
      id: 'green-fill',
      type: 'fill',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'golf'], 'green'],
      paint: { 'fill-color': '#5fb04a', 'fill-opacity': 0.95 },
    });
    map.addLayer({
      id: 'green-outline',
      type: 'line',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'golf'], 'green'],
      paint: { 'line-color': '#3d7a30', 'line-width': 0.7 },
    });

    map.addLayer({
      id: 'tee-fill',
      type: 'fill',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'golf'], 'tee'],
      paint: { 'fill-color': '#7ab85f', 'fill-opacity': 0.95 },
    });

    map.addLayer({
      id: 'cartpath-line',
      type: 'line',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'golf'], 'cartpath'],
      paint: {
        'line-color': '#b59b73',
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 17, 1.5],
      },
    });

    map.addLayer({
      id: 'path-line',
      type: 'line',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'golf'], 'path'],
      paint: { 'line-color': '#9a9a8a', 'line-width': 0.8, 'line-dasharray': [2, 2] },
    });

    map.addLayer({
      id: 'hole-line',
      type: 'line',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'golf'], 'hole'],
      paint: {
        'line-color': '#3d3d36',
        'line-width': 1,
        'line-dasharray': [3, 3],
        'line-opacity': 0.6,
      },
    });

    map.addLayer({
      id: 'clubhouse-fill',
      type: 'fill',
      source: SOURCE_GOLF,
      filter: [
        'any',
        ['==', ['get', 'golf'], 'clubhouse'],
        ['==', ['get', 'building'], 'clubhouse'],
      ],
      paint: { 'fill-color': '#a37b56', 'fill-opacity': 0.9 },
    });

    map.addLayer({
      id: 'pin-circle',
      type: 'circle',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'golf'], 'pin'],
      paint: {
        'circle-radius': 3,
        'circle-color': '#cc3030',
        'circle-stroke-width': 1,
        'circle-stroke-color': '#fff',
      },
    });

    map.addLayer({
      id: 'course-outline',
      type: 'line',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'leisure'], 'golf_course'],
      paint: { 'line-color': '#4a8f3e', 'line-width': 1.2, 'line-opacity': 0.9 },
    });

    map.addLayer({
      id: 'course-selected-outline',
      type: 'line',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'osm_id'], -1],
      paint: { 'line-color': '#234f1e', 'line-width': 3, 'line-opacity': 1 },
    });

    map.addLayer({
      id: 'course-label',
      type: 'symbol',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'leisure'], 'golf_course'],
      minzoom: 11,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 11, 11, 16, 14],
        'text-anchor': 'center',
      },
      paint: {
        'text-color': '#234f1e',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.4,
      },
    });

    // --- Europe-wide course pins (from courses summary) ---

    map.addLayer({
      id: 'course-pin',
      type: 'circle',
      source: SOURCE_COURSES,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 2, 6, 3.5, 10, 5.5],
        'circle-color': '#4a8f3e',
        'circle-stroke-width': 1.2,
        'circle-stroke-color': '#fff',
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 11, 1, 13, 0],
        'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 11, 1, 13, 0],
      },
    });

    map.addLayer({
      id: 'course-pin-selected',
      type: 'circle',
      source: SOURCE_COURSES,
      filter: ['==', ['get', 'osm_id'], -1],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 4, 10, 8],
        'circle-color': '#234f1e',
        'circle-stroke-width': 2.2,
        'circle-stroke-color': '#fff',
      },
    });

    // --- Click handlers ---

    const selectFromFeature = (f: any) => {
      const id = `${f.properties?.['osm_type']}/${f.properties?.['osm_id']}`;
      this.courseService.select(id);
    };

    for (const layer of ['course-pin', 'course-pin-selected', 'course-fill']) {
      map.on('click', layer, (e) => {
        const f = e.features?.[0];
        if (f) selectFromFeature(f);
      });
      map.on('mouseenter', layer, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', layer, () => {
        map.getCanvas().style.cursor = '';
      });
    }
  }

  private flyToCourse(course: CourseFeature): void {
    if (!this.map) return;
    const bb = course.properties.bbox;
    if (bb) {
      const bounds: LngLatBoundsLike = [[bb[0], bb[1]], [bb[2], bb[3]]];
      this.map.fitBounds(bounds, { padding: 60, maxZoom: 17, duration: 900 });
      return;
    }
    if (course.geometry.type === 'Point') {
      this.map.flyTo({
        center: course.geometry.coordinates as LngLatLike,
        zoom: Math.max(this.map.getZoom(), 14),
        speed: 1.4,
        essential: true,
      });
    }
  }
}
