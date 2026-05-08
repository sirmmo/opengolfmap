import { Component, OnInit, inject } from '@angular/core';
import { CourseListComponent } from './courses/course-list.component';
import { CourseDetailComponent } from './courses/course-detail.component';
import { MapComponent } from './map/map.component';
import { CourseService } from './courses/course.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CourseListComponent, CourseDetailComponent, MapComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  private readonly courseService = inject(CourseService);

  async ngOnInit(): Promise<void> {
    await this.courseService.load();
  }
}
