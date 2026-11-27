import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authClient } from "../../lib/auth-client";
import { queryKeys } from "../../lib/query-keys";
import i18n from "../../locales/i18n";
import { LoginForm } from "./login-form";
import { RegisterForm } from "./register-form";

vi.mock("../../lib/auth-client", () => ({
  authClient: {
    signIn: { email: vi.fn() },
    signUp: { email: vi.fn() },
  },
}));

type SignInResult = Awaited<ReturnType<typeof authClient.signIn.email>>;
type SignUpResult = Awaited<ReturnType<typeof authClient.signUp.email>>;

const signInEmail = vi.mocked(authClient.signIn.email);
const signUpEmail = vi.mocked(authClient.signUp.email);

function fillCredentials(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
}

let queryClient: QueryClient;

/**
 * The guard caches an anonymous session, so successful auth must drop that
 * entry before the caller navigates or the guard bounces back to /login.
 */
function renderWithSessionCache(ui: ReactNode) {
  queryClient.setQueryData(queryKeys.session, null);

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeAll(async () => {
  await i18n.changeLanguage("en-US");
});

beforeEach(() => {
  queryClient = new QueryClient();
  signInEmail.mockReset();
  signUpEmail.mockReset();
});

describe("LoginForm", () => {
  it("shows the field error without calling the API when the email is invalid", async () => {
    renderWithSessionCache(<LoginForm onSuccess={vi.fn()} />);

    fillCredentials("not-an-email", "secret");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByText("Enter a valid email address")).toBeTruthy();
    });
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it("submits valid credentials and notifies the caller", async () => {
    signInEmail.mockResolvedValue({ data: null, error: null } as unknown as SignInResult);
    const onSuccess = vi.fn();
    renderWithSessionCache(<LoginForm onSuccess={onSuccess} />);

    fillCredentials("ada@example.com", "secret");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    expect(signInEmail).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "secret",
    });
    expect(queryClient.getQueryData(queryKeys.session)).toBeUndefined();
  });

  it("renders the server error message", async () => {
    signInEmail.mockResolvedValue({
      data: null,
      error: { message: "Invalid email or password", status: 401, statusText: "Unauthorized" },
    } as unknown as SignInResult);
    const onSuccess = vi.fn();
    renderWithSessionCache(<LoginForm onSuccess={onSuccess} />);

    fillCredentials("ada@example.com", "wrong-password");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("Invalid email or password");
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

describe("RegisterForm", () => {
  it("derives a display name and signs the user up", async () => {
    signUpEmail.mockResolvedValue({ data: null, error: null } as unknown as SignUpResult);
    const onSuccess = vi.fn();
    renderWithSessionCache(<RegisterForm onSuccess={onSuccess} />);

    fillCredentials("ada@example.com", "12345678");
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    expect(signUpEmail).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "12345678",
      name: "ada",
    });
    expect(queryClient.getQueryData(queryKeys.session)).toBeUndefined();
  });

  it("rejects a password shorter than 8 characters", async () => {
    renderWithSessionCache(<RegisterForm onSuccess={vi.fn()} />);

    fillCredentials("ada@example.com", "short");
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => {
      expect(screen.getByText("Password must be at least 8 characters")).toBeTruthy();
    });
    expect(signUpEmail).not.toHaveBeenCalled();
  });
});
