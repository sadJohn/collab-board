import Redis from "ioredis";
import { getRedisUrl } from "./redis-url";

/** Options shape understood by both ioredis and BullMQ's connection factory. */
export interface BullConnectionOptions {
  url: string;
  maxRetriesPerRequest: null;
  enableReadyCheck: boolean;
}

/**
 * Connection *options* (not a live client) for the Nest BullModule.
 *
 * Letting BullMQ own the connection means it also closes it on shutdown.
 * `maxRetriesPerRequest: null` is mandatory for blocking worker connections.
 */
export function bullConnectionOptions(): BullConnectionOptions {
  const url = getRedisUrl();
  if (!url) {
    throw new Error("REDIS_URL 未配置，无法创建 BullMQ 连接");
  }

  return { url, maxRetriesPerRequest: null, enableReadyCheck: false };
}

/**
 * Builds an ioredis connection for BullMQ.
 *
 * BullMQ requires `maxRetriesPerRequest: null` on the (blocking) worker
 * connection, otherwise jobs fail with "maxRetriesPerRequest must be null".
 * The queue producer and the Nest worker deliberately share this factory so
 * both sides connect with the same TLS / Upstash-compatible options.
 */
export function createBullConnection(): Redis {
  const { url, ...options } = bullConnectionOptions();
  return new Redis(url, options);
}
