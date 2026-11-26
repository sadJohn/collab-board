/**
 * Single source of truth for TanStack Query cache keys.
 *
 * Every key is scoped by organization so switching workspaces never leaks
 * data from another tenant's cache.
 */
export const queryKeys = {
  session: ["session"] as const,
  organizations: {
    all: ["organizations"] as const,
    active: ["organizations", "active"] as const,
  },
  projects: {
    all: (organizationId: string) => ["organizations", organizationId, "projects"] as const,
    detail: (organizationId: string, projectId: string) =>
      ["organizations", organizationId, "projects", projectId] as const,
  },
  tasks: {
    list: (organizationId: string, projectId: string) =>
      ["organizations", organizationId, "projects", projectId, "tasks"] as const,
    detail: (taskId: string) => ["tasks", taskId] as const,
    comments: (taskId: string) => ["tasks", taskId, "comments"] as const,
  },
} as const;
