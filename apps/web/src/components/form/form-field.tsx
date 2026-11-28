import { cn } from "@repo/ui";
import type { ReactNode } from "react";

interface FormFieldProps {
  id: string;
  label: string;
  error?: string;
  description?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Layout wrapper shared by every form control.
 *
 * The `<label>` both wraps the control and points at it via `htmlFor`, so the
 * association is structural as well as declarative — every label always has an
 * input to describe.
 */
export function FormField({ id, label, error, description, className, children }: FormFieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label className="flex flex-col gap-1.5" htmlFor={id}>
        <span className="font-medium text-sm leading-none">{label}</span>
        {children}
      </label>
      {error ? (
        <p className="text-destructive text-xs" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : (
        description && (
          <p className="text-muted-foreground text-xs" id={`${id}-description`}>
            {description}
          </p>
        )
      )}
    </div>
  );
}
