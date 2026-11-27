import {
  AVATAR_ALLOWED_CONTENT_TYPES,
  AVATAR_MAX_FILE_SIZE,
  type ChangePasswordInput,
  changePasswordSchema,
  type UpdateProfileInput,
  updateProfileSchema,
} from "@repo/shared";
import { Button, cn } from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { type ChangeEvent, type DragEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { FormTextField } from "../../../components/form/form-text-field";
import { useZodForm } from "../../../components/form/use-zod-form";
import { UserAvatar } from "../../../components/user-avatar";
import { uploadAvatar } from "../../../lib/api/uploads";
import { authClient, useSession } from "../../../lib/auth-client";
import { queryKeys } from "../../../lib/query-keys";

export const Route = createFileRoute("/_app/settings/profile")({
  component: ProfileSettingsPage,
});

const ALLOWED_AVATAR_TYPES: readonly string[] = AVATAR_ALLOWED_CONTENT_TYPES;

function ProfileSettingsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSession();
  const user = session.data?.user;

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [securitySaving, setSecuritySaving] = useState(false);
  const [securitySaved, setSecuritySaved] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const form = useZodForm<UpdateProfileInput>(updateProfileSchema, {
    defaultValues: { name: user?.name ?? "" },
  });

  const securityForm = useZodForm<ChangePasswordInput>(changePasswordSchema, {
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
      revokeOtherSessions: true,
    },
  });

  useEffect(() => {
    if (user?.name) {
      form.reset({ name: user.name });
    }
  }, [user?.name, form]);

  // Object URLs must be released once the preview is replaced or unmounted.
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function selectFile(file: File) {
    if (uploading) {
      return;
    }

    setSaved(false);
    setSaveError(null);

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setAvatarError(t("settings.profile.avatar.invalidType"));
      return;
    }

    if (file.size > AVATAR_MAX_FILE_SIZE) {
      setAvatarError(t("settings.profile.avatar.tooLarge"));
      return;
    }

    setAvatarError(null);
    setSelectedName(file.name);
    setPreviewUrl(URL.createObjectURL(file));
    void uploadFile(file);
  }

  async function uploadFile(file: File) {
    setUploading(true);

    try {
      const publicUrl = await uploadAvatar(file, user?.name);

      // Replace the local blob with the hosted image so it survives a reload.
      setPreviewUrl(publicUrl);
      setSelectedName(null);
      await router.invalidate();
    } catch {
      setPreviewUrl(null);
      setSelectedName(null);
      setAvatarError(t("settings.profile.avatar.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file) {
      selectFile(file);
    }

    // Allow picking the same file again after an error.
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);

    const file = event.dataTransfer.files?.[0];

    if (file) {
      selectFile(file);
    }
  }

  async function onSubmit(values: UpdateProfileInput) {
    setSaving(true);
    setSaved(false);
    setSaveError(null);

    try {
      const { error } = await authClient.updateUser({ name: values.name });

      if (error) {
        throw new Error(error.message || error.statusText);
      }

      await queryClient.invalidateQueries({ queryKey: queryKeys.session });
      await router.invalidate();
      setSaved(true);
    } catch {
      setSaveError(t("settings.profile.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function onChangePassword(values: ChangePasswordInput) {
    setSecuritySaving(true);
    setSecuritySaved(false);
    setSecurityError(null);

    const { error } = await authClient.changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      revokeOtherSessions: values.revokeOtherSessions,
    });

    setSecuritySaving(false);

    if (error) {
      // BetterAuth reports a wrong current password as 400/401; keep other
      // failures generic so the form never leaks internal details.
      setSecurityError(
        error.status === 400 || error.status === 401
          ? t("settings.security.invalidCurrent")
          : t("settings.security.failed"),
      );
      return;
    }

    securityForm.reset({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
      revokeOtherSessions: values.revokeOtherSessions,
    });
    setSecuritySaved(true);
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-xl">{t("settings.profile.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("settings.profile.subtitle")}</p>
      </header>

      <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
        <h2 className="font-medium text-sm">{t("settings.profile.avatar.label")}</h2>

        <button
          aria-busy={uploading}
          className={cn(
            "flex w-full cursor-pointer items-center gap-4 rounded-lg border border-dashed p-4 text-left transition-colors",
            dragging ? "border-ring bg-accent/60" : "hover:bg-accent/40",
            uploading && "cursor-progress opacity-70",
          )}
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          onDragLeave={() => setDragging(false)}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDrop={handleDrop}
          type="button"
        >
          <UserAvatar
            className="size-16 text-lg"
            size="lg"
            user={{ ...user, image: previewUrl ?? user?.image }}
          />

          <div className="flex flex-col gap-1">
            <p className="font-medium text-sm">
              {uploading
                ? t("settings.profile.avatar.uploading")
                : t("settings.profile.avatar.drop")}
            </p>
            <p className="text-muted-foreground text-xs">{t("settings.profile.avatar.hint")}</p>
            {selectedName ? (
              <p className="text-muted-foreground text-xs">
                {t("settings.profile.avatar.selected", { name: selectedName })}
              </p>
            ) : null}
            {avatarError ? (
              <p className="text-destructive text-xs" role="alert">
                {avatarError}
              </p>
            ) : null}
          </div>
        </button>

        <input
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleInputChange}
          ref={inputRef}
          type="file"
        />
      </section>

      <form
        className="flex flex-col gap-4 rounded-xl border bg-card p-5"
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <h2 className="font-medium text-sm">{t("settings.profile.details")}</h2>
        <FormTextField form={form} label={t("settings.profile.name")} name="name" />

        {saveError ? (
          <p className="text-destructive text-sm" role="alert">
            {saveError}
          </p>
        ) : null}
        {saved ? (
          <p className="text-muted-foreground text-sm" role="status">
            {t("settings.profile.saved")}
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button disabled={saving} type="submit">
            {saving ? t("settings.profile.saving") : t("settings.profile.save")}
          </Button>
        </div>
      </form>

      <form
        className="flex flex-col gap-4 rounded-xl border bg-card p-5"
        noValidate
        onSubmit={securityForm.handleSubmit(onChangePassword)}
      >
        <div className="flex flex-col gap-1">
          <h2 className="font-medium text-sm">{t("settings.security.title")}</h2>
          <p className="text-muted-foreground text-xs">{t("settings.security.subtitle")}</p>
        </div>

        <FormTextField
          autoComplete="current-password"
          form={securityForm}
          label={t("settings.security.currentPassword")}
          name="currentPassword"
          type="password"
        />
        <FormTextField
          autoComplete="new-password"
          form={securityForm}
          label={t("settings.security.newPassword")}
          name="newPassword"
          type="password"
        />
        <FormTextField
          autoComplete="new-password"
          form={securityForm}
          label={t("settings.security.confirmPassword")}
          name="confirmPassword"
          type="password"
        />

        <label className="flex items-center gap-2 text-sm" htmlFor="revokeOtherSessions">
          <input
            className="size-4 accent-foreground"
            id="revokeOtherSessions"
            type="checkbox"
            {...securityForm.register("revokeOtherSessions")}
          />
          {t("settings.security.revokeOtherSessions")}
        </label>

        {securityError ? (
          <p className="text-destructive text-sm" role="alert">
            {securityError}
          </p>
        ) : null}
        {securitySaved ? (
          <p className="text-muted-foreground text-sm" role="status">
            {t("settings.security.saved")}
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button disabled={securitySaving} type="submit">
            {securitySaving ? t("settings.security.submitting") : t("settings.security.submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}
