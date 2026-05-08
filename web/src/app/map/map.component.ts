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
import { ThemeService } from '../theme/theme.service';

const EUROPE_CENTER: LngLatLike = [10, 50];
const SOURCE_COURSES = 'courses';
const SOURCE_GOLF = 'golf';
const TILE_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

// Field-guide palette — botanical, not sport-app.
const C = {
  paper:        '#f1ead6',
  paperDeep:    '#e8e0c8',
  water:        '#cfdce6',
  park:         '#dee3c5',
  building:     '#d8caaa',
  landuse:      '#ece4cd',
  roadMajor:    '#bca988',
  roadMinor:    '#cfc2a4',
  boundary:     '#a09681',
  label:        '#5d5340',
  labelHalo:    '#f1ead6',

  courseFill:   '#e2dac0',  // soft oat
  rough:        '#9aa881',  // muted moss
  drivingRange: '#b6c19e',  // pressed leaf
  fairway:      '#a3b58a',  // fairway green
  waterHazard:  '#9bb9d0',  // faded watercolour
  bunker:       '#e3d3a8',  // warm sandstone
  bunkerEdge:   '#a88758',
  green:        '#6e8b50',  // deep moss
  greenEdge:    '#3f5530',
  tee:          '#84a06d',  // mossy green
  cartpath:     '#8a7864',  // brown
  pathLine:     '#88795f',
  holeLine:     '#564a3a',  // sepia dark
  clubhouse:    '#8e7159',  // taupe
  pin:          '#b15a3c',  // red-orange
  courseEdge:   '#4f5c40',  // dark moss line
  selectedEdge: '#b46a4f',  // terracotta — RARE accent
};

@Component({
  selector: 'app-map',
  standalone: true,
  template: `<div #mapEl class="map"></div>`,
  styleUrl: './map.component.scss',
})
export class MapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;

  private readonly courseService = inject(CourseService);
  private readonly themeService = inject(ThemeService);
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

    // Re-tint basemap when theme changes (cream parchment in both themes
    // — the chrome handles dark, the paper map stays warm so the grain
    // and golf rendering keep their character).
    effect(() => {
      this.themeService.theme();
      if (this.styleLoaded && this.map) this.tintBasemap();
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
      this.tintBasemap();
      this.installGolfLayers();
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

  /** Override stock Positron palette layer-by-layer to look like aged paper. */
  private tintBasemap(): void {
    const map = this.map!;
    const layers = map.getStyle().layers ?? [];
    const set = (id: string, prop: string, value: any) => {
      try { map.setPaintProperty(id, prop as any, value); } catch {}
    };
    for (const layer of layers) {
      const id = layer.id;
      const type = (layer as any).type;
      if (id === 'background') {
        set(id, 'background-color', C.paper);
        continue;
      }
      if (type === 'fill') {
        if (/water|sea|ocean|lake|river|reservoir/.test(id)) {
          set(id, 'fill-color', C.water);
        } else if (/park|grass|meadow|wood|forest|nature|cemetery|wetland|scrub/.test(id)) {
          set(id, 'fill-color', C.park);
        } else if (/building/.test(id)) {
          set(id, 'fill-color', C.building);
          set(id, 'fill-opacity', 0.55);
        } else if (/landcover|landuse|residential|industrial|commercial|aeroway|pedestrian/.test(id)) {
          set(id, 'fill-color', C.landuse);
        }
        continue;
      }
      if (type === 'line') {
        if (/water|river|stream/.test(id)) {
          set(id, 'line-color', C.water);
        } else if (/road|highway|street|tunnel|bridge/.test(id) && !/label/.test(id)) {
          if (/motorway|trunk|primary/.test(id)) {
            set(id, 'line-color', C.roadMajor);
          } else {
            set(id, 'line-color', C.roadMinor);
          }
        } else if (/boundary|admin/.test(id)) {
          set(id, 'line-color', C.boundary);
          set(id, 'line-opacity', 0.5);
        } else if (/park|building/.test(id)) {
          set(id, 'line-color', C.boundary);
          set(id, 'line-opacity', 0.4);
        }
        continue;
      }
      if (type === 'symbol') {
        set(id, 'text-color', C.label);
        set(id, 'text-halo-color', C.labelHalo);
        set(id, 'text-halo-width', 1.4);
        continue;
      }
    }
  }

  private installGolfLayers(): void {
    const map = this.map!;

    map.addSource(SOURCE_COURSES, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    map.addSource(SOURCE_GOLF, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    map.addLayer({
      id: 'course-fill',
      type: 'fill',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'leisure'], 'golf_course'],
      paint: { 'fill-color': C.courseFill, 'fill-opacity': 0.65 },
    });

    map.addLayer({
      id: 'rough-fill',
      type: 'fill',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'golf'], 'rough'],
      paint: { 'fill-color': C.rough, 'fill-opacity': 0.78 },
    });

    map.addLayer({
      id: 'driving-range-fill',
      type: 'fill',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'golf'], 'driving_range'],
      paint: { 'fill-color': C.drivingRange, 'fill-opacity': 0.85 },
    });

    map.addLayer({
      id: 'fairway-fill',
      type: 'fill',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'golf'], 'fairway'],
      paint: { 'fill-color': C.fairway, 'fill-opacity': 0.9 },
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
      paint: { 'fill-color': C.waterHazard, 'fill-opacity': 0.85 },
    });

    map.addLayer({
      id: 'bunker-fill',
      type: 'fill',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'golf'], 'bunker'],
      paint: { 'fill-color': C.bunker, 'fill-opacity': 0.95 },
    });
    map.addLayer({
      id: 'bunker-outline',
      type: 'line',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'golf'], 'bunker'],
      paint: { 'line-color': C.bunkerEdge, 'line-width': 0.6, 'line-opacity': 0.7 },
    });

    map.addLayer({
      id: 'green-fill',
      type: 'fill',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'golf'], 'green'],
      paint: { 'fill-color': C.green, 'fill-opacity': 0.95 },
    });
    map.addLayer({
      id: 'green-outline',
      type: 'line',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'golf'], 'green'],
      paint: { 'line-color': C.greenEdge, 'line-width': 0.7 },
    });

    map.addLayer({
      id: 'tee-fill',
      type: 'fill',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'golf'], 'tee'],
      paint: { 'fill-color': C.tee, 'fill-opacity': 0.95 },
    });

    map.addLayer({
      id: 'cartpath-line',
      type: 'line',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'golf'], 'cartpath'],
      paint: {
        'line-color': C.cartpath,
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.4, 17, 1.4],
        'line-opacity': 0.7,
      },
    });

    map.addLayer({
      id: 'path-line',
      type: 'line',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'golf'], 'path'],
      paint: { 'line-color': C.pathLine, 'line-width': 0.7, 'line-dasharray': [2, 2], 'line-opacity': 0.65 },
    });

    map.addLayer({
      id: 'hole-line',
      type: 'line',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'golf'], 'hole'],
      paint: {
        'line-color': C.holeLine,
        'line-width': 1,
        'line-dasharray': [4, 3],
        'line-opacity': 0.55,
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
      paint: { 'fill-color': C.clubhouse, 'fill-opacity': 0.9 },
    });

    map.addLayer({
      id: 'pin-circle',
      type: 'circle',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'golf'], 'pin'],
      paint: {
        'circle-radius': 2.6,
        'circle-color': C.pin,
        'circle-stroke-width': 0.8,
        'circle-stroke-color': C.paper,
      },
    });

    map.addLayer({
      id: 'course-outline',
      type: 'line',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'leisure'], 'golf_course'],
      paint: { 'line-color': C.courseEdge, 'line-width': 1.1, 'line-opacity': 0.85 },
    });

    map.addLayer({
      id: 'course-selected-outline',
      type: 'line',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'osm_id'], -1],
      paint: { 'line-color': C.selectedEdge, 'line-width': 2.2, 'line-opacity': 1 },
    });

    map.addLayer({
      id: 'course-label',
      type: 'symbol',
      source: SOURCE_GOLF,
      filter: ['==', ['get', 'leisure'], 'golf_course'],
      minzoom: 11,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Italic'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 11, 11, 16, 14],
        'text-anchor': 'center',
        'text-letter-spacing': 0.02,
      },
      paint: {
        'text-color': C.courseEdge,
        'text-halo-color': C.paper,
        'text-halo-width': 1.6,
      },
    });

    // Europe-wide low-zoom course markers (terracotta crosshair).
    map.addLayer({
      id: 'course-pin',
      type: 'circle',
      source: SOURCE_COURSES,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 1.8, 6, 3.2, 10, 5],
        'circle-color': C.courseEdge,
        'circle-stroke-width': 1.2,
        'circle-stroke-color': C.paper,
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
        'circle-color': C.selectedEdge,
        'circle-stroke-width': 2,
        'circle-stroke-color': C.paper,
      },
    });

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
      this.map.fitBounds(bounds, { padding: 70, maxZoom: 16.5, duration: 1100 });
      return;
    }
    if (course.geometry.type === 'Point') {
      this.map.flyTo({
        center: course.geometry.coordinates as LngLatLike,
        zoom: Math.max(this.map.getZoom(), 14),
        speed: 0.9,
        essential: true,
      });
    }
  }
}
