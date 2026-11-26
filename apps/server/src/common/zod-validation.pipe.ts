import { BadRequestException, HttpStatus, Injectable, type PipeTransform } from "@nestjs/common";
import type { output, ZodError, ZodType } from "zod";

export interface ZodFieldError {
  field: string;
  message: string;
}

function toFieldErrors(error: ZodError): ZodFieldError[] {
  return error.issues.map((issue) => ({
    field: issue.path.map((segment) => String(segment)).join(".") || "(root)",
    message: issue.message,
  }));
}

/**
 * Validates a request payload against a `@repo/shared` Zod schema.
 *
 * On failure it throws a 400 whose body carries both a summary message and the
 * field-level messages, so the web app can map errors onto form fields.
 */
@Injectable()
export class ZodValidationPipe<TSchema extends ZodType>
  implements PipeTransform<unknown, output<TSchema>>
{
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): output<TSchema> {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: "请求参数校验失败",
        errors: toFieldErrors(result.error),
      });
    }

    return result.data;
  }
}
