import { z } from "zod";

export const organizationNameSchema = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(50, "Name must be at most 50 characters");

export const organizationSlugSchema = z
  .string()
  .trim()
  .min(2, "Slug must be at least 2 characters")
  .max(48, "Slug must be at most 48 characters")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens");

export const createOrganizationSchema = z.object({
  name: organizationNameSchema,
  slug: organizationSlugSchema,
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = z
  .object({
    name: organizationNameSchema.optional(),
    slug: organizationSlugSchema.optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.slug !== undefined, {
    message: "Provide name or slug",
  });
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export const deleteOrganizationConfirmationSchema = z.object({
  confirmationSlug: organizationSlugSchema,
});
export type DeleteOrganizationConfirmationInput = z.infer<
  typeof deleteOrganizationConfirmationSchema
>;

export const inviteMemberSchema = z.object({
  email: z.email("Enter a valid email address"),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
