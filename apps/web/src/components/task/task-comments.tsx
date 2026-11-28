import type { CommentDto } from "@repo/shared";
import { Button, Textarea } from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { createComment, deleteComment, listComments } from "../../lib/api/comments";
import { listMembers } from "../../lib/api/members";
import { useSession } from "../../lib/auth-client";
import { MEMBERS_STALE_TIME_MS, queryKeys } from "../../lib/query-keys";
import { useActiveWorkspace } from "../../lib/use-active-workspace";
import { UserAvatar } from "../user-avatar";

interface TaskCommentsProps {
  taskId: string;
}

export function TaskComments({ taskId }: TaskCommentsProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const session = useSession();
  const { data, isSwitching } = useActiveWorkspace();
  const organizationId = data?.id ?? "";
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const commentsQuery = useQuery({
    queryKey: queryKeys.tasks.comments(taskId),
    queryFn: () => listComments(taskId),
  });

  const membersQuery = useQuery({
    queryKey: queryKeys.members.list(organizationId),
    queryFn: () => listMembers(organizationId),
    enabled: Boolean(organizationId) && !isSwitching,
    staleTime: MEMBERS_STALE_TIME_MS,
  });

  const membersById = useMemo(
    () => new Map((membersQuery.data ?? []).map((member) => [member.userId, member])),
    [membersQuery.data],
  );

  const currentUserId = session.data?.user.id;
  const currentRole = currentUserId ? membersById.get(currentUserId)?.role : undefined;
  const isAdmin = currentRole === "owner" || currentRole === "admin";

  const timeFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: "short", timeStyle: "short" }),
    [i18n.language],
  );

  async function refreshComments() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.comments(taskId) });
  }

  const createMutation = useMutation({
    mutationFn: (value: string) => createComment({ taskId, content: value }),
    onSuccess: async () => {
      setContent("");
      setError(null);
      await refreshComments();
    },
    onError: () => setError(t("task.commentFailed")),
  });

  const deleteMutation = useMutation({
    mutationFn: (commentId: string) => deleteComment(commentId),
    onSuccess: async () => {
      setError(null);
      await refreshComments();
    },
    onError: () => setError(t("task.commentDeleteFailed")),
  });

  const comments = commentsQuery.data ?? [];

  return (
    <section className="flex flex-col gap-3 px-5 py-4">
      <h3 className="font-medium text-sm">{t("task.comments")}</h3>

      {commentsQuery.isPending ? (
        <p className="text-muted-foreground text-sm">{t("task.commentsLoading")}</p>
      ) : null}

      {commentsQuery.isSuccess && comments.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("task.commentsEmpty")}</p>
      ) : null}

      {comments.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {comments.map((comment: CommentDto) => {
            const canDelete = isAdmin || comment.authorId === currentUserId;
            const author = membersById.get(comment.authorId);

            return (
              <li className="rounded-lg border p-3" key={comment.id}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <UserAvatar
                      size="sm"
                      user={author ?? { id: comment.authorId, name: comment.authorId }}
                    />
                    <span className="truncate font-medium text-xs">
                      {author?.name ?? comment.authorId}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <time className="text-muted-foreground text-xs">
                      {timeFormatter.format(new Date(comment.createdAt))}
                    </time>
                    {canDelete ? (
                      <button
                        className="text-destructive text-xs hover:underline"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(comment.id)}
                        type="button"
                      >
                        {t("task.commentDelete")}
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{comment.content}</p>
              </li>
            );
          })}
        </ul>
      ) : null}

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (content.trim()) {
            createMutation.mutate(content.trim());
          }
        }}
      >
        <Textarea
          aria-label={t("task.commentPlaceholder")}
          onChange={(event) => setContent(event.target.value)}
          placeholder={t("task.commentPlaceholder")}
          rows={3}
          value={content}
        />
        <div className="flex justify-end">
          <Button disabled={!content.trim() || createMutation.isPending} size="sm" type="submit">
            {createMutation.isPending ? t("task.commentSubmitting") : t("task.commentSubmit")}
          </Button>
        </div>
      </form>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
