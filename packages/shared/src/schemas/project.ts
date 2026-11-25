import { z } from "zod";
import {
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_KEY_MAX_LENGTH,
  PROJECT_KEY_MIN_LENGTH,
  PROJECT_KEY_PATTERN,
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_NAME_MIN_LENGTH,
} from "../constants";

export const projectNameSchema = z
  .string()
  .trim()
  .min(PROJECT_NAME_MIN_LENGTH, `项目名称至少 ${PROJECT_NAME_MIN_LENGTH} 个字符`)
  .max(PROJECT_NAME_MAX_LENGTH, `项目名称最多 ${PROJECT_NAME_MAX_LENGTH} 个字符`);

export const projectKeySchema = z
  .string()
  .trim()
  .min(PROJECT_KEY_MIN_LENGTH, `项目标识至少 ${PROJECT_KEY_MIN_LENGTH} 个字符`)
  .max(PROJECT_KEY_MAX_LENGTH, `项目标识最多 ${PROJECT_KEY_MAX_LENGTH} 个字符`)
  .regex(PROJECT_KEY_PATTERN, "项目标识必须以大写字母开头，且只能包含大写字母与数字");

export const projectDescriptionSchema = z
  .string()
  .trim()
  .max(PROJECT_DESCRIPTION_MAX_LENGTH, `项目描述最多 ${PROJECT_DESCRIPTION_MAX_LENGTH} 个字符`);

export const createProjectSchema = z.object({
  name: projectNameSchema,
  key: projectKeySchema,
  description: projectDescriptionSchema.nullish(),
});
export type CreateProjectData = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    name: projectNameSchema,
    key: projectKeySchema,
    description: projectDescriptionSchema.nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "至少需要提供一个待更新字段");
export type UpdateProjectData = z.infer<typeof updateProjectSchema>;
