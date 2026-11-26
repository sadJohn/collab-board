import { Textarea } from "@repo/ui";
import type { ComponentProps } from "react";
import type { FieldPath, FieldValues, UseFormReturn } from "react-hook-form";

import { FormField } from "./form-field";

interface FormTextareaFieldProps<TFieldValues extends FieldValues> {
  form: UseFormReturn<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  placeholder?: string;
  description?: string;
  rows?: ComponentProps<"textarea">["rows"];
}

/** Multiline counterpart of `FormTextField`, bound to the same Zod schema. */
export function FormTextareaField<TFieldValues extends FieldValues>({
  form,
  name,
  label,
  placeholder,
  description,
  rows = 3,
}: FormTextareaFieldProps<TFieldValues>) {
  const id = String(name);
  const fieldError = form.formState.errors[name];
  const error = typeof fieldError?.message === "string" ? fieldError.message : undefined;

  return (
    <FormField id={id} label={label} error={error} description={description}>
      <Textarea
        id={id}
        placeholder={placeholder}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...form.register(name)}
      />
    </FormField>
  );
}
