import { describe, expect, it } from "vitest";

import { createOrganizationSchema, inviteMemberSchema } from "../src/index.js";

describe("createOrganizationSchema", () => {
  it("accepts a name and a kebab-case slug", () => {
    const result = createOrganizationSchema.safeParse({ name: "Acme", slug: "acme-team" });

    expect(result.success).toBe(true);
  });

  it("rejects slugs with uppercase letters or spaces", () => {
    const result = createOrganizationSchema.safeParse({ name: "Acme", slug: "Acme Team" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "Use lowercase letters, numbers and single hyphens",
    );
  });

  it("rejects a too short name", () => {
    const result = createOrganizationSchema.safeParse({ name: "A", slug: "acme" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Name must be at least 2 characters");
  });
});

describe("inviteMemberSchema", () => {
  it("rejects an invalid email", () => {
    const result = inviteMemberSchema.safeParse({ email: "nope" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Enter a valid email address");
  });

  it("accepts a valid email", () => {
    expect(inviteMemberSchema.safeParse({ email: "ada@example.com" }).success).toBe(true);
  });
});
