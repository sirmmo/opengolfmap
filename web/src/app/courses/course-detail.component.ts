import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CourseService } from './course.service';
import { ScorecardComponent } from '../scorecard/scorecard.component';

type Tab = 'course' | 'scorecard';

@Component({
  selector: 'app-course-detail',
  standalone: true,
  imports: [CommonModule, ScorecardComponent],
  templateUrl: './course-detail.component.html',
  styleUrl: './course-detail.component.scss',
})
export class CourseDetailComponent {
  readonly courseService = inject(CourseService);
  readonly tab = signal<Tab>('course');

  readonly course = computed(() => this.courseService.selected());

  constructor() {
    // When course changes, reset to "Course" tab.
    effect(() => {
      const c = this.course();
      if (c) this.tab.set('course');
    });
  }

  setTab(t: Tab): void {
    this.tab.set(t);
  }

  close(): void {
    this.courseService.select(null);
  }

  osmUrl(course: { properties: { osm_type: string; osm_id: number } }): string {
    return `https://www.openstreetmap.org/${course.properties.osm_type}/${course.properties.osm_id}`;
  }
}
