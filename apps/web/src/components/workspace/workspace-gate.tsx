import { Button } from "@repo/ui";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { authClient, useListOrganizations, useSession } from "@/lib/auth-client";
import { CreateOrganizationForm } from "./create-organization-form";

interface ActivationError {
  sessionId: string;
  message: string;
}

export function useWorkspaceActivation() {
  const { t } = useTranslation();
  const session = useSession();
  const organizations = useListOrganizations();
  const attemptedActivation = useRef<string | null>(null);
  const activationInFlight = useRef(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const [isActivating, setIsActivating] = useState(false);
  const [activationError, setActivationError] = useState<ActivationError | null>(null);

  const sessionData = session.data;
  const organizationData = organizations.data;
  const sessionId = sessionData?.session.id;
  const activeOrganizationId = sessionData?.session.activeOrganizationId;
  const firstOrganizationId = organizationData?.[0]?.id;
  const refetchSession = session.refetch;
  const refetchOrganizations = organizations.refetch;
  const canEvaluate = Boolean(
    sessionData &&
      organizationData &&
      !session.isPending &&
      !session.isRefetching &&
      !session.error &&
      !organizations.isPending &&
      !organizations.isRefetching &&
      !organizations.error,
  );
  const shouldActivate = canEvaluate && !activeOrganizationId && Boolean(firstOrganizationId);

  useEffect(() => {
    if (!shouldActivate || !sessionId || !firstOrganizationId) {
      return;
    }

    const attemptKey = `${sessionId}:${firstOrganizationId}:${retryVersion}`;
    if (attemptedActivation.current === attemptKey || activationInFlight.current) {
      return;
    }
    attemptedActivation.current = attemptKey;
    activationInFlight.current = true;
    setIsActivating(true);

    async function activate(organizationId: string, currentSessionId: string) {
      try {
        const { error } = await authClient.organization.setActive({ organizationId });
        if (error) {
          setActivationError({
            sessionId: currentSessionId,
            message: error.message || t("workspace.activationFailed"),
          });
          return;
        }

        await refetchSession();
      } catch (error) {
        setActivationError({
          sessionId: currentSessionId,
          message:
            error instanceof Error && error.message
              ? error.message
              : t("workspace.activationFailed"),
        });
      } finally {
        activationInFlight.current = false;
        setIsActivating(false);
      }
    }

    void activate(firstOrganizationId, sessionId);
  }, [firstOrganizationId, refetchSession, retryVersion, sessionId, shouldActivate, t]);

  const visibleActivationError =
    canEvaluate &&
    activationError &&
    activationError.sessionId === sessionId &&
    !activeOrganizationId &&
    organizationData &&
    organizationData.length > 0
      ? activationError.message
      : null;

  function retryActivation() {
    if (!activationInFlight.current) {
      setRetryVersion((version) => version + 1);
    }
  }

  async function refreshWorkspace() {
    await Promise.all([refetchSession(), refetchOrganizations()]);
  }

  return {
    needsOrganization: Boolean(canEvaluate && organizationData?.length === 0),
    activationError: visibleActivationError,
    isActivating,
    retryActivation,
    refreshWorkspace,
  };
}

interface WorkspaceGateProps {
  children?: ReactNode;
}

export function WorkspaceGate({ children }: WorkspaceGateProps) {
  const { t } = useTranslation();
  const { needsOrganization, activationError, isActivating, retryActivation, refreshWorkspace } =
    useWorkspaceActivation();

  if (needsOrganization) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <CreateOrganizationForm onCreated={refreshWorkspace} />
      </div>
    );
  }

  if (activationError) {
    return (
      <section className="flex max-w-xl flex-col items-start gap-3 rounded-xl border bg-card p-5">
        <p className="text-destructive text-sm" role="alert">
          {activationError}
        </p>
        <Button disabled={isActivating} onClick={retryActivation} size="sm" variant="outline">
          {t("workspace.retry")}
        </Button>
      </section>
    );
  }

  return children;
}
