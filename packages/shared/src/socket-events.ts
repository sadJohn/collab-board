import { z } from "zod";
import { taskStatusSchema } from "./enums.js";
import { commentDtoSchema, taskDtoSchema } from "./schemas/entity.js";

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

/** Runtime validation map, mainly used by the gateway and tests. */
export const socketPayloadSchemas = {
  [SOCKET_EVENTS.TASK_CREATED]: taskCreatedPayloadSchema,
  [SOCKET_EVENTS.TASK_UPDATED]: taskUpdatedPayloadSchema,
  [SOCKET_EVENTS.TASK_MOVED]: taskMovedPayloadSchema,
  [SOCKET_EVENTS.TASK_DELETED]: taskDeletedPayloadSchema,
  [SOCKET_EVENTS.COMMENT_ADDED]: commentAddedPayloadSchema,
} as const;

export type SocketPayloadMap = {
  [K in keyof typeof socketPayloadSchemas]: z.infer<(typeof socketPayloadSchemas)[K]>;
};
export type SocketEventPayload<K extends keyof SocketPayloadMap> = SocketPayloadMap[K];

export interface RoomAck {
  room: string;
}

export interface ServerToClientEvents {
  [SOCKET_EVENTS.TASK_CREATED]: (payload: TaskCreatedPayload) => void;
  [SOCKET_EVENTS.TASK_UPDATED]: (payload: TaskUpdatedPayload) => void;
  [SOCKET_EVENTS.TASK_MOVED]: (payload: TaskMovedPayload) => void;
  [SOCKET_EVENTS.TASK_DELETED]: (payload: TaskDeletedPayload) => void;
  [SOCKET_EVENTS.COMMENT_ADDED]: (payload: CommentAddedPayload) => void;
}

export interface ClientToServerEvents {
  [SOCKET_EVENTS.JOIN_PROJECT_ROOM]: (
    payload: JoinProjectRoomPayload,
    ack?: (response: RoomAck) => void,
  ) => void;
  [SOCKET_EVENTS.LEAVE_PROJECT_ROOM]: (payload: JoinProjectRoomPayload) => void;
}
