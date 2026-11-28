function hasWorkspaceRole(role: string | undefined, allowedRoles: readonly string[]): boolean {
  if (!role) return false;
  const roles = role.split(",").map((item) => item.trim());
  return allowedRoles.some((allowedRole) => roles.includes(allowedRole));
}

export function canUpdateWorkspace(role: string | undefined): boolean {
  return hasWorkspaceRole(role, ["owner", "admin"]);
}

export function canDeleteWorkspace(role: string | undefined): boolean {
  return hasWorkspaceRole(role, ["owner"]);
}

export function canManageProjects(role: string | undefined): boolean {
  return hasWorkspaceRole(role, ["owner", "admin"]);
}
