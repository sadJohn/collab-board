import { Injectable } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { AppController } from "./app.controller";

@Injectable()
class GreetingService {
  greet(): string {
    return "hello";
  }
}

@Injectable()
class GreetingController {
  constructor(private readonly greetingService: GreetingService) {}

  greet(): string {
    return this.greetingService.greet();
  }
}

describe("Vitest + SWC pipeline", () => {
  it("injects constructor dependencies by type", async () => {
    // Type-based injection only works when `design:paramtypes` metadata is
    // emitted, which is why the Vitest pipeline runs SWC instead of esbuild.
    const moduleRef = await Test.createTestingModule({
      providers: [GreetingService],
      controllers: [GreetingController],
    }).compile();

    expect(moduleRef.get(GreetingController).greet()).toBe("hello");
  });
});

describe("AppController", () => {
  it("resolves through the Nest DI container", async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    expect(moduleRef.get(AppController)).toBeInstanceOf(AppController);
  });

  it("returns ok from the health endpoint", async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    expect(moduleRef.get(AppController).health()).toEqual({ status: "ok" });
  });
});
