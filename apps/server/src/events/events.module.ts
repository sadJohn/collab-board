import { Global, Module } from "@nestjs/common";
import { EventsService } from "./events.service";

/**
 * Global so business modules (tasks, comments) can inject `EventsService`
 * without importing it explicitly, mirroring `PrismaModule`.
 */
@Global()
@Module({
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
