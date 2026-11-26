import { ApiError } from "../api-client";
import { authClient } from "../auth-client";

/**
 * Flattened member row for assignee pickers.
 *
 * BetterAuth nests the user under `member.user`; the UI only needs one level.
 */
export interface OrganizationMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
}

/** Lists the members of a workspace through the BetterAuth organization plugin. */
export async function listMembers(organizationId: string): Promise<OrganizationMember[]> {
  const { data, error } = await authClient.organization.listMembers({
    query: { organizationId, limit: 100 },
  });

  if (error) {
    throw new ApiError(error.status, error.message || error.statusText);
  }

  return (data?.members ?? []).map((member) => ({
    id: member.id,
    userId: member.userId,
    name: member.user.name,
    email: member.user.email,
    image: member.user.image ?? null,
    role: member.role,
  }));
}
