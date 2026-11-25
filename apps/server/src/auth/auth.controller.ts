import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard, type AuthSession, type AuthUser } from "./auth.guard";
import { CurrentSession, CurrentUser } from "./current-user.decorator";

@Controller("auth")
export class AuthController {
  @Get("me")
  @UseGuards(AuthGuard)
  me(
    @CurrentUser() user: AuthUser,
    @CurrentSession() session: AuthSession,
  ): { user: AuthUser; session: AuthSession } {
    return { user, session };
  }
}
