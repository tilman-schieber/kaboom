// High scores, one table per level, in this browser and worldwide (a Val Town val:
// tilmanschieber/kaboom-scores). The tables themselves are arcade-kit's.
import { createScores } from 'arcade-kit/scores';
import { TABLES, TableId } from './modes';

export { load, save } from 'arcade-kit/storage';

export interface ScoreEntry {
  name: string;
  score: number;
  /** Matches won before the one that was lost. */
  matches: number;
  kills: number;
}

export type Tables = Record<TableId, ScoreEntry[]>;

export const { MAX_SCORES, loadTables, saveTables, rankFor, fetchGlobal, submitGlobal, flushPending } = createScores<
  TableId,
  ScoreEntry
>({
  game: 'kaboom',
  tables: TABLES,
  url: 'https://tilmanschieber--01a124e4c1a67218b73082c9349449b1.web.val.run',
  normalize: (e) => ({
    name: e.name,
    score: e.score,
    matches: Number(e.matches) || 0,
    kills: Number(e.kills) || 0,
  }),
});
