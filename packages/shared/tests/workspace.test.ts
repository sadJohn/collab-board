import { describe, expect, it } from "vitest";

import {
  createOrganizationSchema,
  deleteOrganizationConfirmationSchema,
  inviteMemberSchema,
  updateOrganizationSchema,
} from "../src/index.js";

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

describe("updateOrganizationSchema", () => {
  it.each([{ name: "Acme" }, { slug: "acme-team" }])("accepts a partial update %o", (input) => {
    const result = updateOrganizationSchema.safeParse(input);

    expect(result.success).toBe(true);
  });

  it("rejects an empty update", () => {
    expect(updateOrganizationSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an invalid slug", () => {
    expect(updateOrganizationSchema.safeParse({ slug: "Acme Team" }).success).toBe(false);
  });

  it.each([{ logo: "https://example.com/logo.png" }, { metadata: { theme: "dark" } }])(
    "rejects unsupported organization field %o",
    (field) => {
      const result = updateOrganizationSchema.safeParse({
        name: "Acme",
        ...field,
      });

      expect(result.success).toBe(false);
    },
  );
});

describe("deleteOrganizationConfirmationSchema", () => {
  it("trims a valid confirmation slug", () => {
    const result = deleteOrganizationConfirmationSchema.safeParse({
      confirmationSlug: "  acme-team  ",
    });

    expect(result.success).toBe(true);
    expect(result.data?.confirmationSlug).toBe("acme-team");
  });

  it("rejects an invalid confirmation slug", () => {
    expect(
      deleteOrganizationConfirmationSchema.safeParse({
        confirmationSlug: "Acme Team",
      }).success,
    ).toBe(false);
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
