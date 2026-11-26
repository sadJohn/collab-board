import { Input } from "@repo/ui";
import type { ComponentProps } from "react";
import type { FieldPath, FieldValues, UseFormReturn } from "react-hook-form";

import { FormField } from "./form-field";

interface FormTextFieldProps<TFieldValues extends FieldValues> {
  form: UseFormReturn<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  type?: ComponentProps<"input">["type"];
  placeholder?: string;
  description?: string;
  autoComplete?: string;
}

/**
 * Text input bound to React Hook Form. Validation comes from the Zod schema
 * passed to `useZodForm`, so the message shown here is the one defined once in
 * `@repo/shared` (or the page-level schema).
 */
export function FormTextField<TFieldValues extends FieldValues>({
  form,
  name,
  label,
  type = "text",
  placeholder,
  description,
  autoComplete,
}: FormTextFieldProps<TFieldValues>) {
  const id = String(name);
  const fieldError = form.formState.errors[name];
  const error = typeof fieldError?.message === "string" ? fieldError.message : undefined;

  return (
    <FormField id={id} label={label} error={error} description={description}>
      <Input
        id={id}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...form.register(name)}
      />
    </FormField>
  );
}
