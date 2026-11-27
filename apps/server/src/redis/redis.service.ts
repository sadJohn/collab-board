import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { getRedisUrl } from "./redis-url";

/**
 * Thin, type-safe cache facade over ioredis.
 *
 * Two hard rules from the Phase 11 spec:
 * 1. When `REDIS_URL` is empty the service is a safe no-op — no connection is
 *    created and every read returns `null` so callers fall back to the database.
 * 2. Every Redis failure (connection refused, timeout, malformed JSON) is
 *    logged and turned into a degraded return value; Redis must never break a
 *    business request. The client also uses `enableOfflineQueue: false` so a
 *    dead Redis fails fast instead of stacking requests in a queue.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis | null;

  constructor() {
    const url = getRedisUrl();
    if (!url) {
      this.client = null;
      this.logger.log("REDIS_URL 未配置，Redis 缓存已禁用（旁路缓存直接回源数据库）");
      return;
    }

    this.client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });

    this.client.on("error", (error: Error) => {
      this.logger.warn(`Redis 连接异常：${error.message}`);
    });
    this.client.on("ready", () => {
      this.logger.log("Redis 连接已就绪");
    });
  }

  /** Whether a Redis client was created for this process. */
  get enabled(): boolean {
    return this.client !== null;
  }

  /** Reads and JSON-deserializes a key. Returns `null` when missing or degraded. */
  async getJson<T>(key: string): Promise<T | null> {
    if (!this.client) return null;

    try {
      const raw = await this.client.get(key);
      if (raw === null) return null;

      try {
        return JSON.parse(raw) as T;
      } catch {
        this.logger.warn(`Redis 键 ${key} 的 JSON 无法解析，删除脏数据`);
        await this.del(key);
        return null;
      }
    } catch (error) {
      this.logger.warn(`Redis GET ${key} 失败：${(error as Error).message}`);
      return null;
    }
  }

  /** JSON-serializes and writes a key with a TTL (seconds). */
  async setJson<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!this.client) return;

    try {
      await this.client.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch (error) {
      this.logger.warn(`Redis SET ${key} 失败：${(error as Error).message}`);
    }
  }

  /** Deletes a key. Missing keys are ignored. */
  async del(key: string): Promise<void> {
    if (!this.client) return;

    try {
      await this.client.del(key);
    } catch (error) {
      this.logger.warn(`Redis DEL ${key} 失败：${(error as Error).message}`);
    }
  }

  /**
   * Atomically increments a counter. Returns `0` when Redis is disabled or
   * unavailable, which callers can treat as "cache disabled".
   */
  async incr(key: string): Promise<number> {
    if (!this.client) return 0;

    try {
      return await this.client.incr(key);
    } catch (error) {
      this.logger.warn(`Redis INCR ${key} 失败：${(error as Error).message}`);
      return 0;
    }
  }

  /** Gracefully closes the connection so `app.close()` does not hang. */
  async onModuleDestroy(): Promise<void> {
    const client = this.client;
    if (!client) return;

    try {
      await client.quit();
    } catch (error) {
      this.logger.warn(`Redis 连接关闭失败，执行强制断开：${(error as Error).message}`);
      client.disconnect();
    }
  }
}
