import { BadRequestException } from "@nestjs/common";
import { createProjectSchema, createTaskSchema } from "@repo/shared";
import { describe, expect, it } from "vitest";
import type { ZodFieldError } from "./zod-validation.pipe";
import { ZodValidationPipe } from "./zod-validation.pipe";

interface BadRequestBody {
  statusCode: number;
  message: string;
  errors: ZodFieldError[];
}

function catchBadRequest(fn: () => unknown): BadRequestException {
  try {
    fn();
  } catch (error) {
    if (error instanceof BadRequestException) {
      return error;
    }
    throw error;
  }
  throw new Error("expected BadRequestException to be thrown");
}

describe("ZodValidationPipe", () => {
  it("returns parsed data with schema defaults applied", () => {
    const pipe = new ZodValidationPipe(createTaskSchema);

    const parsed = pipe.transform({ title: "写周报", projectId: "project_1" });

    expect(parsed.status).toBe("BACKLOG");
    expect(parsed.priority).toBe("MEDIUM");
  });

  it("throws a 400 with field-level messages for invalid payloads", () => {
    const pipe = new ZodValidationPipe(createProjectSchema);

    const exception = catchBadRequest(() => pipe.transform({ name: "x", key: "bad key" }));
    const body = exception.getResponse() as BadRequestBody;

    expect(exception.getStatus()).toBe(400);
    expect(body.statusCode).toBe(400);
    expect(body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "name" }),
        expect.objectContaining({ field: "key" }),
      ]),
    );
  });

  it("reports missing root fields with their own path", () => {
    const pipe = new ZodValidationPipe(createProjectSchema);

    const exception = catchBadRequest(() => pipe.transform({}));
    const body = exception.getResponse() as BadRequestBody;

    expect(body.errors.map((error) => error.field)).toEqual(
      expect.arrayContaining(["name", "key"]),
    );
  });
});
