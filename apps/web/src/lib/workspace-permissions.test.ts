import { describe, expect, it } from "vitest";
import { canDeleteWorkspace, canManageProjects, canUpdateWorkspace } from "./workspace-permissions";

describe("workspace permissions", () => {
  it("grants update only to owner and admin roles", () => {
    expect([
      canUpdateWorkspace("owner"),
      canUpdateWorkspace("admin"),
      canUpdateWorkspace("member, admin"),
      canUpdateWorkspace("member"),
      canUpdateWorkspace("unknown"),
      canUpdateWorkspace(undefined),
    ]).toEqual([true, true, true, false, false, false]);
  });

  it("grants delete only to owner", () => {
    expect([
      canDeleteWorkspace("owner"),
      canDeleteWorkspace("member, owner"),
      canDeleteWorkspace("admin"),
      canDeleteWorkspace("member"),
      canDeleteWorkspace(undefined),
    ]).toEqual([true, true, false, false, false]);
  });

  it("grants project management only to owner and admin", () => {
    expect([
      canManageProjects("owner"),
      canManageProjects("admin"),
      canManageProjects("member,admin"),
      canManageProjects(" member , owner "),
      canManageProjects("member"),
      canManageProjects("unknown"),
      canManageProjects(""),
      canManageProjects(undefined),
    ]).toEqual([true, true, true, true, false, false, false, false]);
  });
});
