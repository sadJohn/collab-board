import { Button, buttonVariants } from "@repo/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { authClient, useSession } from "@/lib/auth-client";

export const Route = createFileRoute("/accept-invitation/$invitationId")({
  component: AcceptInvitationPage,
});

type PendingAction = "accept" | "reject" | null;

function AcceptInvitationPage() {
  const { t, i18n } = useTranslation();
  const { invitationId } = Route.useParams();
  const session = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [rejected, setRejected] = useState(false);

  const invitationQuery = useQuery({
    queryKey: ["invitations", "detail", invitationId],
    queryFn: async () => {
      const { data, error } = await authClient.organization.getInvitation({
        query: { id: invitationId },
      });

      if (error) {
        throw new Error(error.message || t("invitation.loadFailed"));
      }

      return data;
    },
    enabled: Boolean(session.data),
    retry: false,
  });

  const invitation = invitationQuery.data;

  async function handleAccept() {
    setPendingAction("accept");

    const { data, error } = await authClient.organization.acceptInvitation({ invitationId });

    if (error) {
      toast.error(error.message || t("invitation.acceptFailed"));
      setPendingAction(null);
      return;
    }

    const organizationId = data?.invitation.organizationId ?? invitation?.organizationId;

    if (organizationId) {
      await authClient.organization.setActive({ organizationId });
    }

    // Everything cached is scoped per organization, so drop it all.
    queryClient.clear();
    await router.invalidate();
    await navigate({ to: "/home" });
  }

  async function handleReject() {
    setPendingAction("reject");

    const { error } = await authClient.organization.rejectInvitation({ invitationId });

    if (error) {
      toast.error(error.message || t("invitation.rejectFailed"));
      setPendingAction(null);
      return;
    }

    setRejected(true);
    setPendingAction(null);
  }

  function renderBody() {
    if (session.isPending) {
      return <p className="text-muted-foreground text-sm">{t("invitation.loading")}</p>;
    }

    if (!session.data) {
      return (
        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">{t("invitation.loginRequired")}</p>
          <div className="flex gap-2">
            <Link
              className={buttonVariants()}
              search={{ redirect: `/accept-invitation/${invitationId}` }}
              to="/login"
            >
              {t("invitation.login")}
            </Link>
            <Link className={buttonVariants({ variant: "outline" })} to="/register">
              {t("invitation.register")}
            </Link>
          </div>
        </div>
      );
    }

    if (invitationQuery.isPending) {
      return <p className="text-muted-foreground text-sm">{t("invitation.loading")}</p>;
    }

    if (invitationQuery.isError || !invitation) {
      return (
        <div className="flex flex-col gap-4">
          <p className="text-destructive text-sm" role="alert">
            {t("invitation.invalid")}
          </p>
          <Link className="text-primary text-sm underline-offset-4 hover:underline" to="/home">
            {t("invitation.backHome")}
          </Link>
        </div>
      );
    }

    if (rejected) {
      return (
        <div className="flex flex-col gap-4">
          <p className="text-sm" role="status">
            {t("invitation.rejected")}
          </p>
          <Link className="text-primary text-sm underline-offset-4 hover:underline" to="/home">
            {t("invitation.backHome")}
          </Link>
        </div>
      );
    }

    if (invitation.status !== "pending") {
      return (
        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">{t("invitation.notPending")}</p>
          <Link className="text-primary text-sm underline-offset-4 hover:underline" to="/home">
            {t("invitation.backHome")}
          </Link>
        </div>
      );
    }

    const expiresAt = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(
      new Date(invitation.expiresAt),
    );

    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="font-medium text-sm">
            {t("invitation.invitedTo", {
              inviter: invitation.inviterEmail,
              organization: invitation.organizationName,
            })}
          </p>
          <p className="text-muted-foreground text-xs">
            {t("invitation.role", { role: t(`invitation.roles.${invitation.role}`) })}
          </p>
          <p className="text-muted-foreground text-xs">
            {t("invitation.expiresAt", { date: expiresAt })}
          </p>
        </div>

        <div className="flex gap-2">
          <Button disabled={pendingAction !== null} onClick={() => void handleAccept()}>
            {pendingAction === "accept" ? t("invitation.accepting") : t("invitation.accept")}
          </Button>
          <Button
            disabled={pendingAction !== null}
            onClick={() => void handleReject()}
            variant="outline"
          >
            {pendingAction === "reject" ? t("invitation.rejecting") : t("invitation.reject")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6">
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-6 shadow-xs">
        <h1 className="font-semibold text-lg">{t("invitation.title")}</h1>
        {renderBody()}
      </div>
    </main>
  );
}
