import { describe, expect, it, vi } from "vitest";

import { ApiError, api, mapErrorResponse, toApiError } from "./api-client";

describe("mapErrorResponse", () => {
  it("keeps the field-level messages of a 400 validation error", () => {
    const error = mapErrorResponse(400, {
      statusCode: 400,
      message: "请求参数校验失败",
      errors: [
        { field: "name", message: "Too short" },
        { field: "key", message: "Invalid key" },
      ],
    });

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.fieldErrors).toHaveLength(2);
    expect(error.fieldError("name")).toBe("Too short");
    expect(error.fieldError("unknown")).toBeUndefined();
  });

  it("flags 401 and 403 responses", () => {
    expect(mapErrorResponse(401, undefined).isUnauthorized).toBe(true);
    expect(mapErrorResponse(401, undefined).message).toBe("Unauthorized");
    expect(mapErrorResponse(403, undefined).isForbidden).toBe(true);
    expect(mapErrorResponse(403, undefined).message).toBe("Forbidden");
  });

  it("prefers the server message and falls back for unknown statuses", () => {
    expect(mapErrorResponse(500, { message: "boom" }).message).toBe("boom");
    expect(mapErrorResponse(418, undefined).message).toBe("Request failed with status 418");
  });

  it("joins array messages and ignores malformed field errors", () => {
    const error = mapErrorResponse(400, {
      message: ["first", "second"],
      errors: [{ field: "name", message: "Too short" }, "garbage", { field: 1 }],
    });

    expect(error.message).toBe("first; second");
    expect(error.fieldErrors).toEqual([{ field: "name", message: "Too short" }]);
  });
});

describe("toApiError", () => {
  it("passes ApiError through unchanged", () => {
    const original = new ApiError(409, "conflict");

    expect(toApiError(original)).toBe(original);
  });

  it("maps network failures to status 0", () => {
    const error = toApiError(new TypeError("Failed to fetch"));

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.message).toBe("Failed to fetch");
  });
});

describe("api instance", () => {
  it("joins paths onto the API prefix and surfaces ApiError", async () => {
    const fetchMock = vi.fn(
      async (_request: Request) =>
        new Response(JSON.stringify({ message: "Unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const error = await api.get("projects").then(
        () => null,
        (cause: unknown) => cause,
      );

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(401);
      expect((error as ApiError).message).toBe("Unauthorized");

      const request = fetchMock.mock.calls[0]?.[0];
      expect(request).toBeInstanceOf(Request);
      expect(request?.url).toBe("http://localhost:3000/projects");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps the HTTP status and server message for conflicts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_request: Request) =>
          new Response(JSON.stringify({ message: "该项目标识在工作区内已被使用" }), {
            status: 409,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    try {
      const error = await api.post("projects", { json: {} }).then(
        () => null,
        (cause: unknown) => cause,
      );

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(409);
      expect((error as ApiError).message).toBe("该项目标识在工作区内已被使用");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
