import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CourseService } from './course.service';
import { CourseFeature } from './course.types';

@Component({
  selector: 'app-course-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './course-list.component.html',
  styleUrl: './course-list.component.scss',
})
export class CourseListComponent {
  readonly courseService = inject(CourseService);

  readonly availableCountries = computed(() => {
    return this.courseService.manifest()?.countries ?? [];
  });

  trackById(_index: number, course: CourseFeature): string {
    return course.id;
  }

  onQueryInput(value: string): void {
    this.courseService.setQuery(value);
  }

  onCountryChange(value: string): void {
    this.courseService.setCountryFilter(value === '' ? null : value);
  }
}
