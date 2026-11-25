import { describe, expect, it } from "vitest";
import {
  createProjectSchema,
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_KEY_MAX_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
  projectKeySchema,
  updateProjectSchema,
} from "../src/index";

describe("projectKeySchema", () => {
  it.each(["ENG", "A1", "PLATFORM"])("accepts %s", (key) => {
    expect(projectKeySchema.parse(key)).toBe(key);
  });

  it("trims surrounding whitespace", () => {
    expect(projectKeySchema.parse("  ENG  ")).toBe("ENG");
  });

  it.each(["eng", "1ENG", "EN-G", "E", ""])("rejects %j", (key) => {
    expect(projectKeySchema.safeParse(key).success).toBe(false);
  });

  it("rejects keys longer than the limit", () => {
    expect(projectKeySchema.safeParse("A".repeat(PROJECT_KEY_MAX_LENGTH + 1)).success).toBe(false);
  });
});

describe("createProjectSchema", () => {
  it("accepts a minimal project and strips unknown fields", () => {
    const parsed = createProjectSchema.parse({
      name: "Collab Board",
      key: "CB",
      injected: true,
    });

    expect(parsed).toEqual({ name: "Collab Board", key: "CB" });
  });

  it("accepts a description and null description", () => {
    expect(
      createProjectSchema.parse({ name: "Platform", key: "PLT", description: " Core work " })
        .description,
    ).toBe("Core work");
    expect(
      createProjectSchema.parse({ name: "Platform", key: "PLT", description: null }).description,
    ).toBeNull();
  });

  it("rejects a too short name", () => {
    expect(createProjectSchema.safeParse({ name: "A", key: "PLT" }).success).toBe(false);
  });

  it("rejects a too long name", () => {
    expect(
      createProjectSchema.safeParse({
        name: "a".repeat(PROJECT_NAME_MAX_LENGTH + 1),
        key: "PLT",
      }).success,
    ).toBe(false);
  });

  it("rejects a too long description", () => {
    expect(
      createProjectSchema.safeParse({
        name: "Platform",
        key: "PLT",
        description: "a".repeat(PROJECT_DESCRIPTION_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("requires a valid key", () => {
    expect(createProjectSchema.safeParse({ name: "Platform", key: "platform" }).success).toBe(
      false,
    );
  });
});

describe("updateProjectSchema", () => {
  it("rejects an empty update", () => {
    expect(updateProjectSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a single field update", () => {
    expect(updateProjectSchema.parse({ name: "Renamed" })).toEqual({ name: "Renamed" });
  });

  it("allows clearing the description", () => {
    expect(updateProjectSchema.parse({ description: null })).toEqual({ description: null });
  });
});
