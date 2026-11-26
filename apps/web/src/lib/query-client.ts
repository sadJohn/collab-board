import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "./api-client";

function shouldRetry(failureCount: number, error: Error): boolean {
  // 4xx responses are deterministic, retrying them only delays the error UI.
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    return false;
  }

  return failureCount < 2;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
