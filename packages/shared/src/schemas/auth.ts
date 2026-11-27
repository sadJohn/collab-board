import { z } from "zod";
import { USER_NAME_MAX_LENGTH, USER_NAME_MIN_LENGTH } from "../constants.js";

export const emailSchema = z.email("Enter a valid email address");

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(USER_NAME_MIN_LENGTH, `显示名称至少 ${USER_NAME_MIN_LENGTH} 个字符`)
    .max(USER_NAME_MAX_LENGTH, `显示名称最多 ${USER_NAME_MAX_LENGTH} 个字符`),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
