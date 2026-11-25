import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

/**
 * NestJS relies on `emitDecoratorMetadata` for constructor injection, which
 * esbuild (Vitest's default transformer) does not emit. SWC does.
 */
export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        target: "es2022",
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        keepClassNames: true,
      },
      module: { type: "es6" },
    }),
  ],
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
  },
});
