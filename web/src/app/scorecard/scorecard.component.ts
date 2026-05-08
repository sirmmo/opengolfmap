import { Component, computed, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CourseService } from '../courses/course.service';
import { ScorecardStore } from './scorecard.store';
import { CourseScorecard } from './scorecard.types';

@Component({
  selector: 'app-scorecard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './scorecard.component.html',
  styleUrl: './scorecard.component.scss',
})
export class ScorecardComponent {
  private readonly courseService = inject(CourseService);
  readonly store = inject(ScorecardStore);

  readonly course = computed(() => this.courseService.selected());

  readonly card = computed<CourseScorecard | null>(() => {
    const c = this.course();
    if (!c) return null;
    const holes = c.properties.holes ?? 18;
    return this.store.all()[c.id] ?? this.store.ensure(c.id, holes);
  });

  readonly totals = computed(() => {
    const k = this.card();
    if (!k) return null;
    const totalPar = k.pars.reduce((a, b) => a + (b ?? 0), 0);
    const playerTotals = k.players.map((p) =>
      p.scores.reduce<number>((a, b) => a + (b ?? 0), 0),
    );
    const playerThru = k.players.map((p) =>
      p.scores.filter((s) => s != null).length,
    );
    const playerVsPar = k.players.map((p, idx) => {
      const filled = p.scores
        .map((s, i) => (s == null ? null : (s as number) - (k.pars[i] ?? 0)))
        .filter((d): d is number => d != null);
      return filled.reduce((a, b) => a + b, 0);
    });
    return { totalPar, playerTotals, playerThru, playerVsPar };
  });

  constructor() {
    effect(() => {
      const c = this.course();
      if (!c) return;
      this.store.ensure(c.id, c.properties.holes ?? 18);
    });
  }

  setPar(holeIdx: number, value: string): void {
    const id = this.course()?.id;
    if (!id) return;
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    this.store.setPar(id, holeIdx, n);
  }

  setScore(playerIdx: number, holeIdx: number, value: string): void {
    const id = this.course()?.id;
    if (!id) return;
    if (value === '' || value == null) {
      this.store.setScore(id, playerIdx, holeIdx, null);
      return;
    }
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    this.store.setScore(id, playerIdx, holeIdx, n);
  }

  renamePlayer(playerIdx: number, value: string): void {
    const id = this.course()?.id;
    if (!id) return;
    this.store.renamePlayer(id, playerIdx, value);
  }

  addPlayer(): void {
    const id = this.course()?.id;
    if (!id) return;
    this.store.addPlayer(id);
  }

  removePlayer(playerIdx: number): void {
    const id = this.course()?.id;
    if (!id) return;
    this.store.removePlayer(id, playerIdx);
  }

  reset(): void {
    const id = this.course()?.id;
    if (!id) return;
    this.store.reset(id);
  }

  formatVsPar(n: number): string {
    if (n === 0) return 'E';
    return n > 0 ? `+${n}` : `${n}`;
  }
}
