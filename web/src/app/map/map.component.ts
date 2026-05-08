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

const ITALY_CENTER: LngLatLike = [12.5, 42.5];
const SOURCE = 'golf';
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
      const features = this.courseService.features();
      if (!features || !this.styleLoaded || !this.map) return;
      const source = this.map.getSource(SOURCE) as GeoJSONSource | undefined;
      if (source) source.setData(features as any);
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
      if (selected) this.flyToCourse(selected);
    });
  }

  ngAfterViewInit(): void {
    this.map = new MapLibreMap({
      container: this.mapEl.nativeElement,
      style: TILE_STYLE_URL,
      center: ITALY_CENTER,
      zoom: 5.4,
      attributionControl: { compact: true },
    });

    this.map.on('load', () => {
      this.styleLoaded = true;
      this.installGolfLayers();
      this.layersInstalled = true;
      const features = untracked(() => this.courseService.features());
      if (features) {
        const src = this.map!.getSource(SOURCE) as GeoJSONSource;
        src.setData(features as any);
      }
    });
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  private installGolfLayers(): void {
    const map = this.map!;

    map.addSource(SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    // Course boundary fill — bottom layer, sets the "course" backdrop.
    map.addLayer({
      id: 'course-fill',
      type: 'fill',
      source: SOURCE,
      filter: ['==', ['get', 'leisure'], 'golf_course'],
      paint: {
        'fill-color': '#cfe3bf',
        'fill-opacity': 0.55,
      },
    });

    map.addLayer({
      id: 'rough-fill',
      type: 'fill',
      source: SOURCE,
      filter: ['==', ['get', 'golf'], 'rough'],
      paint: { 'fill-color': '#7a9e5a', 'fill-opacity': 0.7 },
    });

    map.addLayer({
      id: 'driving-range-fill',
      type: 'fill',
      source: SOURCE,
      filter: ['==', ['get', 'golf'], 'driving_range'],
      paint: { 'fill-color': '#bcd99a', 'fill-opacity': 0.8 },
    });

    map.addLayer({
      id: 'fairway-fill',
      type: 'fill',
      source: SOURCE,
      filter: ['==', ['get', 'golf'], 'fairway'],
      paint: { 'fill-color': '#9ec97e', 'fill-opacity': 0.9 },
    });

    map.addLayer({
      id: 'water-fill',
      type: 'fill',
      source: SOURCE,
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
      source: SOURCE,
      filter: ['==', ['get', 'golf'], 'bunker'],
      paint: { 'fill-color': '#f1e3b3', 'fill-opacity': 0.95 },
    });

    map.addLayer({
      id: 'bunker-outline',
      type: 'line',
      source: SOURCE,
      filter: ['==', ['get', 'golf'], 'bunker'],
      paint: { 'line-color': '#d8c378', 'line-width': 0.6 },
    });

    map.addLayer({
      id: 'green-fill',
      type: 'fill',
      source: SOURCE,
      filter: ['==', ['get', 'golf'], 'green'],
      paint: { 'fill-color': '#5fb04a', 'fill-opacity': 0.95 },
    });

    map.addLayer({
      id: 'green-outline',
      type: 'line',
      source: SOURCE,
      filter: ['==', ['get', 'golf'], 'green'],
      paint: { 'line-color': '#3d7a30', 'line-width': 0.7 },
    });

    map.addLayer({
      id: 'tee-fill',
      type: 'fill',
      source: SOURCE,
      filter: ['==', ['get', 'golf'], 'tee'],
      paint: { 'fill-color': '#7ab85f', 'fill-opacity': 0.95 },
    });

    map.addLayer({
      id: 'cartpath-line',
      type: 'line',
      source: SOURCE,
      filter: ['==', ['get', 'golf'], 'cartpath'],
      paint: {
        'line-color': '#b59b73',
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 17, 1.5],
      },
    });

    map.addLayer({
      id: 'path-line',
      type: 'line',
      source: SOURCE,
      filter: ['==', ['get', 'golf'], 'path'],
      paint: {
        'line-color': '#9a9a8a',
        'line-width': 0.8,
        'line-dasharray': [2, 2],
      },
    });

    map.addLayer({
      id: 'hole-line',
      type: 'line',
      source: SOURCE,
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
      source: SOURCE,
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
      source: SOURCE,
      filter: ['==', ['get', 'golf'], 'pin'],
      paint: {
        'circle-radius': 3,
        'circle-color': '#cc3030',
        'circle-stroke-width': 1,
        'circle-stroke-color': '#fff',
      },
    });

    // Course outline — drawn on top of inner features.
    map.addLayer({
      id: 'course-outline',
      type: 'line',
      source: SOURCE,
      filter: ['==', ['get', 'leisure'], 'golf_course'],
      paint: {
        'line-color': '#4a8f3e',
        'line-width': 1.2,
        'line-opacity': 0.9,
      },
    });

    map.addLayer({
      id: 'course-selected-outline',
      type: 'line',
      source: SOURCE,
      filter: ['==', ['get', 'osm_id'], -1],
      paint: {
        'line-color': '#234f1e',
        'line-width': 3,
        'line-opacity': 1,
      },
    });

    // At low zoom, show a course pin so courses are findable on the country map.
    map.addLayer({
      id: 'course-low-zoom-pin',
      type: 'circle',
      source: SOURCE,
      filter: [
        'all',
        ['==', ['get', 'leisure'], 'golf_course'],
        ['==', ['geometry-type'], 'Point'],
      ],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2.5, 9, 5],
        'circle-color': '#4a8f3e',
        'circle-stroke-width': 1.2,
        'circle-stroke-color': '#fff',
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 11, 1, 13, 0],
      },
    });

    map.addLayer({
      id: 'course-label',
      type: 'symbol',
      source: SOURCE,
      filter: ['==', ['get', 'leisure'], 'golf_course'],
      minzoom: 11,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 11, 11, 16, 14],
        'text-anchor': 'center',
        'symbol-placement': 'point',
      },
      paint: {
        'text-color': '#234f1e',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.4,
      },
    });

    // Clicking a course boundary selects it.
    const courseClickLayers = ['course-fill', 'course-low-zoom-pin'];
    for (const layer of courseClickLayers) {
      map.on('click', layer, (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const id = `${f.properties?.['osm_type']}/${f.properties?.['osm_id']}`;
        this.courseService.select(id);
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
      const bounds: LngLatBoundsLike = [
        [bb[0], bb[1]],
        [bb[2], bb[3]],
      ];
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
