import { type INestApplicationContext, Logger } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import type { Server, ServerOptions } from "socket.io";
import { getRedisUrl } from "./redis-url";

/**
 * Socket.io adapter backed by Redis pub/sub so broadcasts (task events, presence
 * snapshots, user notifications) reach clients connected to any Nest instance.
 *
 * A dedicated pub client and sub client are created — they must not be shared
 * with the cache or the BullMQ connection. When `REDIS_URL` is empty the default
 * in-memory adapter is kept and nothing is connected.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  private readonly redisLogger = new Logger(RedisIoAdapter.name);

  constructor(app: INestApplicationContext) {
    super(app);
  }

  /** Creates the Redis clients and the adapter factory. Safe to call once, at boot. */
  connectToRedis(): void {
    const url = getRedisUrl();
    if (!url) {
      this.redisLogger.log("REDIS_URL 未配置，Socket.io 使用内存适配器");
      return;
    }

    this.pubClient = new Redis(url, { maxRetriesPerRequest: null });
    this.subClient = this.pubClient.duplicate();

    this.pubClient.on("error", (error: Error) => {
      this.redisLogger.warn(`Socket.io Redis pub 连接异常：${error.message}`);
    });
    this.subClient.on("error", (error: Error) => {
      this.redisLogger.warn(`Socket.io Redis sub 连接异常：${error.message}`);
    });

    this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
    this.redisLogger.log("Socket.io Redis 适配器已启用（独立 pub / sub 连接）");
  }

  override createIOServer(port: number | undefined, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }

  override async close(server: Server): Promise<void> {
    await super.close(server);
    await this.closeRedisClients();
  }

  private async closeRedisClients(): Promise<void> {
    const clients = [this.pubClient, this.subClient].filter(
      (client): client is Redis => client !== null,
    );

    this.pubClient = null;
    this.subClient = null;
    this.adapterConstructor = null;

    await Promise.all(
      clients.map(async (client) => {
        try {
          await client.quit();
        } catch (error) {
          this.redisLogger.warn(`关闭 Socket.io Redis 连接失败：${(error as Error).message}`);
          client.disconnect();
        }
      }),
    );
  }
}
