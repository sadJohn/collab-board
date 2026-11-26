import { zodResolver } from "@hookform/resolvers/zod";
import { type FieldValues, type UseFormProps, type UseFormReturn, useForm } from "react-hook-form";
import type { ZodType } from "zod";

/**
 * `useForm` pre-wired with a Zod resolver so every form shares the same
 * validation source as the API and gets field-level errors for free.
 */
export function useZodForm<TFieldValues extends FieldValues>(
  schema: ZodType<TFieldValues, TFieldValues>,
  options?: Omit<UseFormProps<TFieldValues>, "resolver">,
): UseFormReturn<TFieldValues> {
  return useForm<TFieldValues>({
    ...options,
    resolver: zodResolver(schema),
  });
}
