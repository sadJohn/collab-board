import { describe, expect, it } from "vitest";

import { flattenMember } from "./members";

describe("flattenMember", () => {
  it("lifts the nested user into the flat assignee shape", () => {
    expect(
      flattenMember({
        id: "member_1",
        userId: "user_1",
        role: "owner",
        user: {
          name: "Ada Lovelace",
          email: "ada@example.com",
          image: "https://example.com/ada.png",
        },
      }),
    ).toEqual({
      id: "member_1",
      userId: "user_1",
      name: "Ada Lovelace",
      email: "ada@example.com",
      image: "https://example.com/ada.png",
      role: "owner",
    });
  });

  it("normalizes a missing avatar to null", () => {
    const member = flattenMember({
      id: "member_2",
      userId: "user_2",
      role: "member",
      user: { name: "Grace Hopper", email: "grace@example.com" },
    });

    expect(member.image).toBeNull();
    expect(member.role).toBe("member");
  });
});
