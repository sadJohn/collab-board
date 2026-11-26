import ky, { HTTPError } from "ky";

export interface FieldError {
  field: string;
  message: string;
}

const STATUS_FALLBACK_MESSAGES: Record<number, string> = {
  400: "Validation failed",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not found",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFieldError(value: unknown): value is FieldError {
  return isRecord(value) && typeof value.field === "string" && typeof value.message === "string";
}

function parseFieldErrors(data: unknown): FieldError[] {
  if (!isRecord(data) || !Array.isArray(data.errors)) {
    return [];
  }

  return data.errors.filter(isFieldError);
}

function parseMessage(data: unknown): string | undefined {
  if (!isRecord(data) || data.message === undefined) {
    return undefined;
  }

  const { message } = data;

  if (typeof message === "string" && message.trim()) {
    return message;
  }

  // Nest may report several messages for a single error.
  if (Array.isArray(message)) {
    const joined = message.filter((item) => typeof item === "string").join("; ");
    return joined || undefined;
  }

  return undefined;
}

/**
 * Normalized error for every failed API call.
 *
 * `status` is the HTTP status, or 0 when no response was received (network
 * failure). `fieldErrors` carries the field-level messages produced by the
 * server's Zod validation pipe so forms can attach them to inputs.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: FieldError[];

  constructor(status: number, message: string, fieldErrors: FieldError[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  fieldError(field: string): string | undefined {
    return this.fieldErrors.find((error) => error.field === field)?.message;
  }
}

/** Maps an HTTP status plus a parsed response body onto an `ApiError`. */
export function mapErrorResponse(status: number, data: unknown): ApiError {
  const message =
    parseMessage(data) ??
    STATUS_FALLBACK_MESSAGES[status] ??
    `Request failed with status ${status}`;

  return new ApiError(status, message, parseFieldErrors(data));
}

/** Converts anything thrown by ky into an `ApiError`. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof HTTPError) {
    return mapErrorResponse(error.response.status, error.data);
  }

  if (error instanceof Error) {
    return new ApiError(0, error.message);
  }

  return new ApiError(0, "Network request failed");
}

const baseUrl = (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/+$/, "");

/**
 * Shared ky instance.
 *
 * Paths are relative to the API origin, e.g. `api.get("projects")`, which
 * resolves against `prefix`.
 */
export const api = ky.create({
  prefix: baseUrl,
  credentials: "include",
  hooks: {
    /**
     * ky v2 passes a state object (not the raw error) to `beforeError`, and the
     * returned Error replaces the one ky would throw.
     */
    beforeError: [({ error }) => toApiError(error)],
  },
});
