import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { OrganizationRequest } from "./organization.guard";

/** Injects the active workspace role resolved by `OrganizationGuard`. */
export const CurrentMemberRole = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string =>
    context.switchToHttp().getRequest<OrganizationRequest>().memberRole,
);
