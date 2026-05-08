import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CourseService } from './course.service';

@Component({
  selector: 'app-course-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './course-detail.component.html',
  styleUrl: './course-detail.component.scss',
})
export class CourseDetailComponent {
  readonly courseService = inject(CourseService);

  close(): void {
    this.courseService.select(null);
  }

  osmUrl(course: { properties: { osm_type: string; osm_id: number } }): string {
    return `https://www.openstreetmap.org/${course.properties.osm_type}/${course.properties.osm_id}`;
  }
}
