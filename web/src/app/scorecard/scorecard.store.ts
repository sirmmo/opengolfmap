import { Injectable, signal } from '@angular/core';
import { CourseScorecard, ScorecardStore as StoreShape } from './scorecard.types';

const STORAGE_KEY = 'opengolfmap.scorecard';

const DEFAULT_PAR = 4;

function emptyCard(holes: number): CourseScorecard {
  const h = Math.max(1, Math.min(36, holes || 18));
  return {
    holes: h,
    pars: Array.from({ length: h }, () => DEFAULT_PAR),
    players: [{ name: 'You', scores: Array.from({ length: h }, () => null) }],
  };
}

@Injectable({ providedIn: 'root' })
export class ScorecardStore {
  private readonly _all = signal<StoreShape>(this.load());

  ensure(courseId: string, holes: number): CourseScorecard {
    const existing = this._all()[courseId];
    if (existing && existing.holes === holes) return existing;
    if (existing) {
      // Course holes count changed (rare). Resize while preserving overlapping data.
      const resized: CourseScorecard = {
        holes,
        pars: Array.from({ length: holes }, (_, i) => existing.pars[i] ?? DEFAULT_PAR),
        players: existing.players.map((p) => ({
          name: p.name,
          scores: Array.from({ length: holes }, (_, i) => p.scores[i] ?? null),
        })),
      };
      this.write(courseId, resized);
      return resized;
    }
    const fresh = emptyCard(holes);
    this.write(courseId, fresh);
    return fresh;
  }

  get(courseId: string): CourseScorecard | null {
    return this._all()[courseId] ?? null;
  }

  setPar(courseId: string, holeIndex: number, par: number): void {
    const card = this._all()[courseId];
    if (!card) return;
    const next: CourseScorecard = { ...card, pars: [...card.pars] };
    next.pars[holeIndex] = clamp(par, 2, 7);
    this.write(courseId, next);
  }

  setScore(courseId: string, playerIndex: number, holeIndex: number, score: number | null): void {
    const card = this._all()[courseId];
    if (!card) return;
    const next: CourseScorecard = {
      ...card,
      players: card.players.map((p, idx) => {
        if (idx !== playerIndex) return p;
        const scores = [...p.scores];
        scores[holeIndex] = score == null ? null : clamp(score, 1, 15);
        return { ...p, scores };
      }),
    };
    this.write(courseId, next);
  }

  renamePlayer(courseId: string, playerIndex: number, name: string): void {
    const card = this._all()[courseId];
    if (!card) return;
    const next: CourseScorecard = {
      ...card,
      players: card.players.map((p, idx) =>
        idx === playerIndex ? { ...p, name: name.slice(0, 24) || `P${idx + 1}` } : p,
      ),
    };
    this.write(courseId, next);
  }

  addPlayer(courseId: string): void {
    const card = this._all()[courseId];
    if (!card || card.players.length >= 6) return;
    const next: CourseScorecard = {
      ...card,
      players: [
        ...card.players,
        { name: `P${card.players.length + 1}`, scores: Array.from({ length: card.holes }, () => null) },
      ],
    };
    this.write(courseId, next);
  }

  removePlayer(courseId: string, playerIndex: number): void {
    const card = this._all()[courseId];
    if (!card || card.players.length <= 1) return;
    const next: CourseScorecard = {
      ...card,
      players: card.players.filter((_, idx) => idx !== playerIndex),
    };
    this.write(courseId, next);
  }

  reset(courseId: string): void {
    const card = this._all()[courseId];
    if (!card) return;
    const next = emptyCard(card.holes);
    this.write(courseId, next);
  }

  private write(courseId: string, card: CourseScorecard): void {
    const next = { ...this._all(), [courseId]: card };
    this._all.set(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  }

  private load(): StoreShape {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as StoreShape;
    } catch {}
    return {};
  }

  /** Reactive signal so components can re-render on store changes. */
  readonly all = this._all.asReadonly();
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}
