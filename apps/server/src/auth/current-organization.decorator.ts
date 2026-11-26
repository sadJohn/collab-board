import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { OrganizationRequest } from "./organization.guard";

/** Injects the active workspace id resolved by `OrganizationGuard`. */
export const CurrentOrganization = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string =>
    context.switchToHttp().getRequest<OrganizationRequest>().organizationId,
);
