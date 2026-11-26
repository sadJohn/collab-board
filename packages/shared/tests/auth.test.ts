import { describe, expect, it } from "vitest";

import { signInSchema, signUpSchema } from "../src/index.js";

describe("signInSchema", () => {
  it("accepts an email and a non-empty password", () => {
    const result = signInSchema.safeParse({ email: "ada@example.com", password: "secret" });

    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = signInSchema.safeParse({ email: "not-an-email", password: "secret" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Enter a valid email address");
  });

  it("rejects an empty password", () => {
    const result = signInSchema.safeParse({ email: "ada@example.com", password: "" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Password is required");
  });
});

describe("signUpSchema", () => {
  it("accepts a password of at least 8 characters", () => {
    const result = signUpSchema.safeParse({ email: "ada@example.com", password: "12345678" });

    expect(result.success).toBe(true);
  });

  it("rejects a short password", () => {
    const result = signUpSchema.safeParse({ email: "ada@example.com", password: "short" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Password must be at least 8 characters");
  });
});
