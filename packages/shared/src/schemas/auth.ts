import { z } from "zod";
import { USER_NAME_MAX_LENGTH, USER_NAME_MIN_LENGTH } from "../constants.js";

export const emailSchema = z.email("Enter a valid email address");

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});
export type SignInInput = z.infer<typeof signInSchema>;

/** Single source of truth for every password field (sign-up, change, reset). */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters");

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});
export type SignUpInput = z.infer<typeof signUpSchema>;

const PASSWORD_MISMATCH_MESSAGE = "Passwords do not match";

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
    revokeOtherSessions: z.boolean(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: PASSWORD_MISMATCH_MESSAGE,
    path: ["confirmPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: PASSWORD_MISMATCH_MESSAGE,
    path: ["confirmPassword"],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(USER_NAME_MIN_LENGTH, `显示名称至少 ${USER_NAME_MIN_LENGTH} 个字符`)
    .max(USER_NAME_MAX_LENGTH, `显示名称最多 ${USER_NAME_MAX_LENGTH} 个字符`),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
