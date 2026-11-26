import { describe, expect, it } from "vitest";
import { INITIAL_TASK_POSITION, TASK_POSITION_STEP } from "../src/index.js";
import { computePosition, MIN_POSITION_GAP } from "../src/position.js";

describe("computePosition", () => {
  it("uses the initial position for an empty column", () => {
    expect(computePosition(null, null)).toEqual({
      position: INITIAL_TASK_POSITION,
      rebalanceRequired: false,
    });
  });

  it("appends after the last task when there is no next neighbour", () => {
    expect(computePosition(1000, null)).toEqual({
      position: 1000 + TASK_POSITION_STEP,
      rebalanceRequired: false,
    });
  });

  it("prepends before the first task when there is no previous neighbour", () => {
    expect(computePosition(null, 3000)).toEqual({
      position: 3000 - TASK_POSITION_STEP,
      rebalanceRequired: false,
    });
  });

  it("returns the midpoint between two neighbours", () => {
    expect(computePosition(1000, 3000)).toEqual({ position: 2000, rebalanceRequired: false });
  });

  it("keeps the midpoint when the neighbours are far enough apart", () => {
    const previous = 1000;
    const next = previous + MIN_POSITION_GAP * 2;

    const result = computePosition(previous, next);

    expect(result.rebalanceRequired).toBe(false);
    expect(result.position).toBeGreaterThan(previous);
    expect(result.position).toBeLessThan(next);
  });

  it("flags a rebalance when the neighbours are too close together", () => {
    const result = computePosition(1000, 1000 + MIN_POSITION_GAP / 2);

    expect(result.rebalanceRequired).toBe(true);
  });

  it("flags a rebalance once repeated halving exhausts float precision", () => {
    const previous = 1000;

    expect(computePosition(previous, previous + MIN_POSITION_GAP * 2).rebalanceRequired).toBe(
      false,
    );

    // Simulate the worst case: the gap is already smaller than the threshold.
    const exhausted = computePosition(previous, previous + MIN_POSITION_GAP / 1000);
    expect(exhausted.rebalanceRequired).toBe(true);
  });
});
