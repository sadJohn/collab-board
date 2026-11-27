import { z } from "zod";
import { taskStatusSchema } from "./enums.js";
import { commentDtoSchema, taskDtoSchema } from "./schemas/dto.js";

/**
 * Socket.IO contract shared by `apps/server` (gateway) and `apps/web` (client).
 */
export const SOCKET_EVENTS = {
  JOIN_PROJECT_ROOM: "project:join",
  LEAVE_PROJECT_ROOM: "project:leave",
  TASK_CREATED: "task:created",
  TASK_UPDATED: "task:updated",
  TASK_MOVED: "task:moved",
  TASK_DELETED: "task:deleted",
  COMMENT_ADDED: "comment:added",
  COMMENT_DELETED: "comment:deleted",
  ROOM_PRESENCE_UPDATED: "presence:updated",
  GET_ROOM_PRESENCE: "presence:get",
} as const;

export type SocketEventKey = keyof typeof SOCKET_EVENTS;
export type SocketEventName = (typeof SOCKET_EVENTS)[SocketEventKey];

/** Every project gets its own Socket.IO room. */
export const projectRoomName = (projectId: string): string => `project:${projectId}`;

export const joinProjectRoomSchema = z.object({
  projectId: z.string().min(1, "projectId 不能为空"),
});
export type JoinProjectRoomPayload = z.infer<typeof joinProjectRoomSchema>;

const actorIdSchema = z.string().min(1, "actorId 不能为空");

export const taskCreatedPayloadSchema = z.object({
  task: taskDtoSchema,
  actorId: actorIdSchema,
});
export type TaskCreatedPayload = z.infer<typeof taskCreatedPayloadSchema>;

export const taskUpdatedPayloadSchema = z.object({
  task: taskDtoSchema,
  actorId: actorIdSchema,
});
export type TaskUpdatedPayload = z.infer<typeof taskUpdatedPayloadSchema>;

export const taskMovedPayloadSchema = z.object({
  task: taskDtoSchema,
  actorId: actorIdSchema,
  fromStatus: taskStatusSchema,
});
export type TaskMovedPayload = z.infer<typeof taskMovedPayloadSchema>;

export const taskDeletedPayloadSchema = z.object({
  taskId: z.string().min(1),
  projectId: z.string().min(1),
  actorId: actorIdSchema,
});
export type TaskDeletedPayload = z.infer<typeof taskDeletedPayloadSchema>;

export const commentAddedPayloadSchema = z.object({
  comment: commentDtoSchema,
  projectId: z.string().min(1),
  actorId: actorIdSchema,
});
export type CommentAddedPayload = z.infer<typeof commentAddedPayloadSchema>;

export const commentDeletedPayloadSchema = z.object({
  commentId: z.string().min(1),
  taskId: z.string().min(1),
  projectId: z.string().min(1),
  actorId: actorIdSchema,
});
export type CommentDeletedPayload = z.infer<typeof commentDeletedPayloadSchema>;

/**
 * Presence: lightweight snapshot of a user currently in a project room.
 * Only public-facing fields — never expose passwords / session secrets.
 */
export const presenceUserSchema = z.object({
  id: z.string().min(1, "presence user id 不能为空"),
  name: z.string().min(1, "presence user name 不能为空"),
  email: z.string().min(1, "presence user email 不能为空"),
  image: z.string().nullable(),
});
export type PresenceUser = z.infer<typeof presenceUserSchema>;

export const roomPresenceUpdatedPayloadSchema = z.object({
  projectId: z.string().min(1, "projectId 不能为空"),
  users: z.array(presenceUserSchema),
});
export type RoomPresenceUpdatedPayload = z.infer<typeof roomPresenceUpdatedPayloadSchema>;

export const getRoomPresencePayloadSchema = z.object({
  projectId: z.string().min(1, "projectId 不能为空"),
});
export type GetRoomPresencePayload = z.infer<typeof getRoomPresencePayloadSchema>;

/** Runtime validation map, mainly used by the gateway and tests. */
export const socketPayloadSchemas = {
  [SOCKET_EVENTS.TASK_CREATED]: taskCreatedPayloadSchema,
  [SOCKET_EVENTS.TASK_UPDATED]: taskUpdatedPayloadSchema,
  [SOCKET_EVENTS.TASK_MOVED]: taskMovedPayloadSchema,
  [SOCKET_EVENTS.TASK_DELETED]: taskDeletedPayloadSchema,
  [SOCKET_EVENTS.COMMENT_ADDED]: commentAddedPayloadSchema,
  [SOCKET_EVENTS.COMMENT_DELETED]: commentDeletedPayloadSchema,
  [SOCKET_EVENTS.ROOM_PRESENCE_UPDATED]: roomPresenceUpdatedPayloadSchema,
  [SOCKET_EVENTS.GET_ROOM_PRESENCE]: getRoomPresencePayloadSchema,
} as const;

export type SocketPayloadMap = {
  [K in keyof typeof socketPayloadSchemas]: z.infer<(typeof socketPayloadSchemas)[K]>;
};
export type SocketEventPayload<K extends keyof SocketPayloadMap> = SocketPayloadMap[K];

/** Ack for room join/leave: the joined room, or a machine-readable error code. */
export type RoomAck = { ok: true; room: string } | { ok: false; error: string };

export interface ServerToClientEvents {
  [SOCKET_EVENTS.TASK_CREATED]: (payload: TaskCreatedPayload) => void;
  [SOCKET_EVENTS.TASK_UPDATED]: (payload: TaskUpdatedPayload) => void;
  [SOCKET_EVENTS.TASK_MOVED]: (payload: TaskMovedPayload) => void;
  [SOCKET_EVENTS.TASK_DELETED]: (payload: TaskDeletedPayload) => void;
  [SOCKET_EVENTS.COMMENT_ADDED]: (payload: CommentAddedPayload) => void;
  [SOCKET_EVENTS.COMMENT_DELETED]: (payload: CommentDeletedPayload) => void;
  [SOCKET_EVENTS.ROOM_PRESENCE_UPDATED]: (payload: RoomPresenceUpdatedPayload) => void;
}

export interface ClientToServerEvents {
  [SOCKET_EVENTS.JOIN_PROJECT_ROOM]: (
    payload: JoinProjectRoomPayload,
    ack?: (response: RoomAck) => void,
  ) => void;
  [SOCKET_EVENTS.LEAVE_PROJECT_ROOM]: (
    payload: JoinProjectRoomPayload,
    ack?: (response: RoomAck) => void,
  ) => void;
  [SOCKET_EVENTS.GET_ROOM_PRESENCE]: (
    payload: GetRoomPresencePayload,
    ack?: (response: RoomPresenceUpdatedPayload | { ok: false; error: string }) => void,
  ) => void;
}
