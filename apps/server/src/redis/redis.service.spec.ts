import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RedisService } from "./redis.service";

const mocks = vi.hoisted(() => {
  const get = vi.fn();
  const set = vi.fn();
  const del = vi.fn();
  const incr = vi.fn();
  const quit = vi.fn();
  const disconnect = vi.fn();
  const on = vi.fn();
  const client = { get, set, del, incr, quit, disconnect, on };
  const Redis = vi.fn(function MockRedis() {
    return client;
  });

  return { get, set, del, incr, quit, disconnect, on, client, Redis };
});

vi.mock("ioredis", () => ({ default: mocks.Redis }));

const originalRedisUrl = process.env.REDIS_URL;
const redisUrl = "rediss://default:secret@example.upstash.io:6379";

let logSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.get.mockReset();
  mocks.set.mockReset();
  mocks.del.mockReset();
  mocks.incr.mockReset();
  mocks.quit.mockReset();
  mocks.disconnect.mockReset();
  mocks.on.mockReset();
  mocks.Redis.mockClear();

  logSpy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  warnSpy = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  logSpy.mockRestore();
  warnSpy.mockRestore();
  process.env.REDIS_URL = originalRedisUrl;
});

describe("RedisService without REDIS_URL", () => {
  it("never creates a client and degrades every operation safely", async () => {
    delete process.env.REDIS_URL;
    const service = new RedisService();

    expect(service.enabled).toBe(false);
    expect(mocks.Redis).not.toHaveBeenCalled();

    await expect(service.getJson("missing")).resolves.toBeNull();
    await expect(service.setJson("key", { value: 1 }, 60)).resolves.toBeUndefined();
    await expect(service.del("key")).resolves.toBeUndefined();
    await expect(service.incr("key")).resolves.toBe(0);
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });
});

describe("RedisService with REDIS_URL", () => {
  beforeEach(() => {
    process.env.REDIS_URL = redisUrl;
  });

  it("connects with fail-fast options and logs errors instead of throwing", () => {
    new RedisService();

    expect(mocks.Redis).toHaveBeenCalledWith(redisUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    expect(mocks.on).toHaveBeenCalledWith("error", expect.any(Function));
    expect(mocks.on).toHaveBeenCalledWith("ready", expect.any(Function));
  });

  it("serializes writes with a TTL and deserializes reads", async () => {
    mocks.set.mockResolvedValue("OK");
    mocks.get.mockResolvedValue('{"total":3}');
    const service = new RedisService();

    await service.setJson("dashboard:org:v0:user", { total: 3 }, 60);
    expect(mocks.set).toHaveBeenCalledWith("dashboard:org:v0:user", '{"total":3}', "EX", 60);

    await expect(service.getJson<{ total: number }>("dashboard:org:v0:user")).resolves.toEqual({
      total: 3,
    });
    expect(mocks.get).toHaveBeenCalledWith("dashboard:org:v0:user");
  });

  it("returns null for a missing key", async () => {
    mocks.get.mockResolvedValue(null);
    const service = new RedisService();

    await expect(service.getJson("missing")).resolves.toBeNull();
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it("deletes and ignores malformed JSON values", async () => {
    mocks.get.mockResolvedValue("{not-json");
    mocks.del.mockResolvedValue(1);
    const service = new RedisService();

    await expect(service.getJson("dirty")).resolves.toBeNull();
    expect(mocks.del).toHaveBeenCalledWith("dirty");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("dirty"));
  });

  it("degrades to null / no-op when Redis commands fail", async () => {
    mocks.get.mockRejectedValue(new Error("connection refused"));
    mocks.set.mockRejectedValue(new Error("connection refused"));
    mocks.del.mockRejectedValue(new Error("connection refused"));
    mocks.incr.mockRejectedValue(new Error("connection refused"));
    const service = new RedisService();

    await expect(service.getJson("key")).resolves.toBeNull();
    await expect(service.setJson("key", { value: 1 }, 60)).resolves.toBeUndefined();
    await expect(service.del("key")).resolves.toBeUndefined();
    await expect(service.incr("key")).resolves.toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("connection refused"));
  });

  it("increments counters atomically", async () => {
    mocks.incr.mockResolvedValue(4);
    const service = new RedisService();

    await expect(service.incr("dashboard:ver:org_1")).resolves.toBe(4);
    expect(mocks.incr).toHaveBeenCalledWith("dashboard:ver:org_1");
  });

  it("quits gracefully and falls back to disconnect if quit fails", async () => {
    const service = new RedisService();

    mocks.quit.mockResolvedValue("OK");
    await service.onModuleDestroy();
    expect(mocks.quit).toHaveBeenCalledTimes(1);

    mocks.quit.mockRejectedValue(new Error("quit failed"));
    await service.onModuleDestroy();
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
  });
});
