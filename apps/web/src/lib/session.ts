import { queryOptions } from "@tanstack/react-query";

import { authClient } from "./auth-client";
import { queryKeys } from "./query-keys";

/**
 * Shared session query. Route guards and hooks read through this cache so a
 * navigation does not trigger another /get-session round trip.
 */
export const sessionQueryOptions = queryOptions({
  queryKey: queryKeys.session,
  queryFn: async () => {
    const { data } = await authClient.getSession();
    return data;
  },
  staleTime: 60_000,
});
