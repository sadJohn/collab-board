import { Button } from "@repo/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { authClient } from "../../lib/auth-client";

/**
 * GitHub mark (16×16). lucide-react 1.x removed brand icons, so the official
 * path is inlined instead of pulling in another icon dependency.
 */
function GithubIcon() {
  return (
    <svg aria-hidden="true" fill="currentColor" viewBox="0 0 16 16">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

interface GithubSignInButtonProps {
  onError: (message: string) => void;
}

/**
 * Starts BetterAuth's GitHub OAuth flow. On success the browser leaves the page
 * for GitHub, so the pending state only matters when the request itself fails.
 */
export function GithubSignInButton({ onError }: GithubSignInButtonProps) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);

    const { error } = await authClient.signIn.social({
      provider: "github",
      callbackURL: `${window.location.origin}/home`,
    });

    if (error) {
      setPending(false);
      onError(error.message || t("auth.github.failed"));
    }
  }

  return (
    <Button disabled={pending} onClick={() => void handleClick()} type="button" variant="outline">
      <GithubIcon />
      {t("auth.github.continue")}
    </Button>
  );
}
