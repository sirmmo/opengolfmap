export interface PlayerCard {
  name: string;
  scores: (number | null)[];
}

export interface CourseScorecard {
  holes: number;
  pars: number[];
  players: PlayerCard[];
}

export type ScorecardStore = Record<string, CourseScorecard>;
