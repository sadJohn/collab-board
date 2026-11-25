import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthenticatedRequest, AuthSession, AuthUser } from "./auth.guard";

/** Injects the user resolved by `AuthGuard`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);

/** Injects the BetterAuth session resolved by `AuthGuard`. */
export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthSession =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().session,
);
