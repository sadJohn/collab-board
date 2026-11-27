import { describe, expect, it } from "vitest";

import {
  changePasswordSchema,
  forgotPasswordSchema,
  passwordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  USER_NAME_MAX_LENGTH,
  updateProfileSchema,
} from "../src/index.js";

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

describe("updateProfileSchema", () => {
  it("trims the display name", () => {
    expect(updateProfileSchema.parse({ name: "  Ada Lovelace  " })).toEqual({
      name: "Ada Lovelace",
    });
  });

  it("rejects a blank display name", () => {
    expect(updateProfileSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects a display name over the maximum length", () => {
    expect(
      updateProfileSchema.safeParse({ name: "a".repeat(USER_NAME_MAX_LENGTH + 1) }).success,
    ).toBe(false);
  });
});

describe("passwordSchema", () => {
  it("accepts the lower and upper length bounds", () => {
    expect(passwordSchema.safeParse("a".repeat(8)).success).toBe(true);
    expect(passwordSchema.safeParse("a".repeat(128)).success).toBe(true);
  });

  it("rejects 7 and 129 characters", () => {
    expect(passwordSchema.safeParse("a".repeat(7)).success).toBe(false);
    expect(passwordSchema.safeParse("a".repeat(129)).success).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  const valid = {
    currentPassword: "old-password",
    newPassword: "new-password",
    confirmPassword: "new-password",
    revokeOtherSessions: true,
  };

  it("accepts matching new passwords", () => {
    expect(changePasswordSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a missing current password", () => {
    const result = changePasswordSchema.safeParse({ ...valid, currentPassword: "" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Current password is required");
  });

  it("reports mismatched confirmation on the confirmPassword field", () => {
    const result = changePasswordSchema.safeParse({ ...valid, confirmPassword: "different" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["confirmPassword"]);
    expect(result.error?.issues[0]?.message).toBe("Passwords do not match");
  });

  it("applies passwordSchema to the new password", () => {
    expect(
      changePasswordSchema.safeParse({
        ...valid,
        newPassword: "short",
        confirmPassword: "short",
      }).success,
    ).toBe(false);
  });
});

describe("forgotPasswordSchema", () => {
  it("accepts a valid email and rejects an invalid one", () => {
    expect(forgotPasswordSchema.safeParse({ email: "ada@example.com" }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("accepts matching new passwords", () => {
    expect(
      resetPasswordSchema.safeParse({
        newPassword: "new-password",
        confirmPassword: "new-password",
      }).success,
    ).toBe(true);
  });

  it("rejects mismatched confirmation", () => {
    expect(
      resetPasswordSchema.safeParse({
        newPassword: "new-password",
        confirmPassword: "different",
      }).success,
    ).toBe(false);
  });
});
