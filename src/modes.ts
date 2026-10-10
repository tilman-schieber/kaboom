// How sharp the CPU bombers are. Arcade keeps its own high score table for each.
export type LevelId = 'easy' | 'normal' | 'hard';

export interface Level {
  id: LevelId;
  name: string;
  /** Bot skill 0..1 in the first match; it rises with every match won in arcade. */
  skill: number;
}

export const LEVELS: Level[] = [
  { id: 'easy', name: 'EASY', skill: 0.15 },
  { id: 'normal', name: 'NORMAL', skill: 0.5 },
  { id: 'hard', name: 'HARD', skill: 0.85 },
];

export type TableId = LevelId;
export const TABLES: TableId[] = LEVELS.map((l) => l.id);
