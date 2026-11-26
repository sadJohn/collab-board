import { describe, expect, it } from "vitest";

import en from "./en.json";
import zh from "./zh.json";

function collectKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    collectKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("translation resources", () => {
  it("keeps zh.json and en.json structurally identical", () => {
    expect(collectKeys(en).sort()).toEqual(collectKeys(zh).sort());
  });
});
