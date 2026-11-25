import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { prisma } from "@repo/db";
import type { AuthenticatedRequest } from "./auth.guard";

/** Request shape after `OrganizationGuard` has resolved the active workspace. */
export interface OrganizationRequest extends AuthenticatedRequest {
  organizationId: string;
  memberRole: string;
}

@Injectable()
export class OrganizationGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OrganizationRequest>();
    const organizationId = request.session.activeOrganizationId;

    if (!organizationId) {
      throw new ForbiddenException("请先选择一个工作区");
    }

    const member = await prisma.member.findUnique({
      where: {
        organizationId_userId: { organizationId, userId: request.user.id },
      },
      select: { role: true },
    });

    if (!member) {
      throw new ForbiddenException("无权访问该工作区");
    }

    request.organizationId = organizationId;
    request.memberRole = member.role;
    return true;
  }
}
