import { INITIAL_TASK_POSITION, TASK_POSITION_STEP } from "./constants.js";

/**
 * Positions shrink by half on every insert between two neighbours. Once the gap
 * drops below this value a column rebalance is triggered instead, keeping
 * float precision from silently collapsing two tasks onto the same position.
 */
export const MIN_POSITION_GAP = 0.01;

export interface ComputedPosition {
  position: number;
  /** True when the neighbours are too close; the caller must renumber the column. */
  rebalanceRequired: boolean;
}

/**
 * Computes the fractional index for a task dropped between two neighbours.
 *
 * `null` means "no neighbour on that side", e.g. dropping at the top or the
 * bottom of a column. This is shared by the server (authoritative write) and the
 * web board (optimistic cache update) so both compute identical midpoints.
 */
export function computePosition(previous: number | null, next: number | null): ComputedPosition {
  if (previous !== null && next !== null) {
    const gap = next - previous;
    return { position: previous + gap / 2, rebalanceRequired: gap < MIN_POSITION_GAP };
  }

  if (previous !== null) {
    return { position: previous + TASK_POSITION_STEP, rebalanceRequired: false };
  }

  if (next !== null) {
    return { position: next - TASK_POSITION_STEP, rebalanceRequired: false };
  }

  return { position: INITIAL_TASK_POSITION, rebalanceRequired: false };
}
