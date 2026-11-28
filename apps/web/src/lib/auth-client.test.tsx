import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { FormTextField } from "@/components/form/form-text-field";
import { useZodForm } from "@/components/form/use-zod-form";
import { authClient, useSession } from "./auth-client";

const { fetchMock, restoreFetch } = vi.hoisted(() => {
  const originalFetch = globalThis.fetch;
  const payload = {
    session: {
      id: "session-1",
      token: "token-1",
      userId: "user-1",
      expiresAt: "2030-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    user: {
      id: "user-1",
      email: "ada@example.com",
      name: "Ada",
      emailVerified: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  };

  const fetchMock = vi.fn(
    async (_input: URL | RequestInfo) =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );

  // The auth client captures `fetch` when the module is evaluated, so the stub
  // has to be installed before the static imports run.
  globalThis.fetch = fetchMock;

  return { fetchMock, restoreFetch: () => (globalThis.fetch = originalFetch) };
});

afterAll(() => {
  restoreFetch();
});

describe("auth-client", () => {
  it("reads the session from /api/auth/get-session", async () => {
    const { data } = await authClient.getSession();

    expect(data?.user.email).toBe("ada@example.com");

    const request = fetchMock.mock.calls[0]?.[0];
    expect(String(request)).toContain("/api/auth/get-session");
  });

  it("exposes the session through the useSession hook", async () => {
    const { result } = renderHook(() => useSession());

    await waitFor(() => {
      expect(result.current.data?.user.email).toBe("ada@example.com");
    });
  });
});

const formSchema = z.object({
  email: z.email("Enter a valid email"),
});

function TestForm() {
  const form = useZodForm(formSchema, { mode: "onTouched" });

  return (
    <form>
      <FormTextField form={form} name="email" label="Email" />
      <p data-testid="error">{form.formState.errors.email?.message ?? ""}</p>
    </form>
  );
}

describe("useZodForm", () => {
  it("produces the field-level message declared in the schema", async () => {
    render(<TestForm />);

    const input = screen.getByLabelText("Email");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "not-an-email" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(screen.getByTestId("error").textContent).toBe("Enter a valid email");
    });
  });
});
