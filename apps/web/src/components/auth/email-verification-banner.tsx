import { Button } from "@repo/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { authClient, useSession } from "../../lib/auth-client";

const PENDING_KEY = "collab-board.email-verification-pending";
const COOLDOWN_SECONDS = 60;
const TOAST_DURATION_MS = 5000;

/**
 * Reminds password accounts to verify their email.
 *
 * BetterAuth's verification link redirects back with a full page load, so the
 * "was unverified" fact is kept in localStorage: it both survives the redirect
 * and lets this layout show a one-off success toast when the session flips to
 * `emailVerified === true`.
 */
export function EmailVerificationBanner() {
  const { t } = useTranslation();
  const session = useSession();
  const user = session.data?.user;
  const emailVerified = user?.emailVerified;

  const [secondsLeft, setSecondsLeft] = useState(0);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showVerifiedToast, setShowVerifiedToast] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }

    if (emailVerified === false) {
      window.localStorage.setItem(PENDING_KEY, "1");
      return;
    }

    if (window.localStorage.getItem(PENDING_KEY)) {
      window.localStorage.removeItem(PENDING_KEY);
      setShowVerifiedToast(true);
    }
  }, [user, emailVerified]);

  useEffect(() => {
    if (!showVerifiedToast) {
      return;
    }

    const timer = window.setTimeout(() => setShowVerifiedToast(false), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [showVerifiedToast]);

  useEffect(() => {
    if (secondsLeft <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setSecondsLeft((value) => (value <= 1 ? 0 : value - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [secondsLeft]);

  async function handleResend() {
    if (!user || sending || secondsLeft > 0) {
      return;
    }

    setSending(true);
    setSent(false);
    setError(null);

    const { error: resendError } = await authClient.sendVerificationEmail({
      email: user.email,
      callbackURL: `${window.location.origin}/home`,
    });

    setSending(false);

    if (resendError) {
      setError(t("auth.verification.failed"));
      return;
    }

    setSent(true);
    setSecondsLeft(COOLDOWN_SECONDS);
  }

  if (!user || emailVerified !== false) {
    return showVerifiedToast ? (
      <div
        className="fixed right-6 bottom-6 z-50 rounded-lg border bg-card px-4 py-3 text-sm shadow-lg"
        role="status"
      >
        {t("auth.verification.success")}
      </div>
    ) : null;
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p>{t("auth.verification.banner")}</p>
        {sent ? (
          <p className="text-muted-foreground text-xs" role="status">
            {t("auth.verification.sent")}
          </p>
        ) : null}
        {error ? (
          <p className="text-destructive text-xs" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <Button
        disabled={sending || secondsLeft > 0}
        onClick={() => void handleResend()}
        size="sm"
        type="button"
        variant="outline"
      >
        {sending
          ? t("auth.verification.resending")
          : secondsLeft > 0
            ? t("auth.verification.resendIn", { seconds: secondsLeft })
            : t("auth.verification.resend")}
      </Button>
    </div>
  );
}
