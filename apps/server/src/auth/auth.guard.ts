import type { IncomingHttpHeaders } from "node:http";
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth";

type AuthResult = Awaited<ReturnType<typeof auth.api.getSession>>;

export type AuthUser = NonNullable<AuthResult>["user"];
export type AuthSession = NonNullable<AuthResult>["session"];

/** Request shape after `AuthGuard` has attached the session. */
export interface AuthenticatedRequest {
  headers: IncomingHttpHeaders;
  user: AuthUser;
  session: AuthSession;
}

@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const result = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });

    if (!result) {
      throw new UnauthorizedException("未登录或登录已过期");
    }

    request.user = result.user;
    request.session = result.session;
    return true;
  }
}
