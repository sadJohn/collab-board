# 项目开发规范：实时协作型任务与项目看板（Linear/Trello 精简版）

## 1. 项目概述与目标

在一个 TypeScript Monorepo 架构下，构建一个全栈、支持多人实时协作的任务管理 SaaS 应用。核心目标是实现清晰的架构分层、端到端（End-to-End）的严格类型安全，以及现代化前后端技术栈的地道实践。

## 2. 技术栈与严格约束

### Monorepo 与工程化工具

- **包管理器**：`pnpm`（使用 `pnpm-workspace.yaml`）
- **构建系统**：`Turborepo`
- **编程语言**：TypeScript（所有子包均开启 `strict` 严格模式）
- **代码规范与格式化**：`@biomejs/biome`（全仓统一配置，替代 ESLint + Prettier）
- **测试框架**：`Vitest`（前后端及共享包统一测试框架）
- **数据校验**：`Zod`（前后端共享同一套校验 Schema）

### 前端 (`apps/web`)

- **核心框架**：React 19 + Vite
- **路由管理**：`@tanstack/react-router`（基于文件的路由 File-based routing，使用类型安全的 Search Params 同步筛选状态，使用 `beforeLoad` 实现路由守卫）
- **服务端状态**：`@tanstack/react-query`（任务状态拖拽/排序变更必须使用乐观更新 Optimistic Updates）
- **数据表格**：`@tanstack/react-table`（用于任务列表视图 List View，支持多列排序、过滤、分页和批量行选择）
- **客户端状态**：`zustand`（仅管理纯前端 UI 状态：侧边栏折叠、当前打开的任务详情抽屉 ID、全局命令面板状态）
- **UI 与样式**：`Tailwind CSS` + `shadcn/ui`
- **表单处理**：`react-hook-form` + `@hookform/resolvers/zod`
- **动画效果**：`motion`（使用 `motion/react` 实现看板卡片拖拽过渡、基于 `layoutId` 的布局动画，以及抽屉/弹窗过渡动画）
- **实时通信客户端**：`socket.io-client`

### 后端与数据库 (`apps/server` & `packages/db`)

- **后端框架**：`NestJS`
- **数据库**：**Neon (Serverless PostgreSQL)**
- **ORM 框架**：`Prisma`（Schema 及生成的 Client 独立封装在 `packages/db` 中）
- **身份认证**：`better-auth`（挂载在 NestJS 中，支持邮箱密码登录 + GitHub/Google OAuth + **Organization 组织插件**以实现多租户工作区）
- **实时通信服务端**：`@nestjs/websockets` + `socket.io`（基于项目/工作区房间 Room 的事件广播）

---

## 3. Monorepo 目录结构规范

```text
collab-board/
├── apps/
│   ├── web/                    # Vite + React 前端应用
│   │   ├── src/
│   │   │   ├── routes/         # TanStack Router 文件路由
│   │   │   ├── components/     # 业务组件 (kanban, table, auth, layout)
│   │   │   ├── hooks/          # 自定义 Hooks (useSocket, useOptimisticTask)
│   │   │   ├── stores/         # Zustand 状态库 (ui-store.ts)
│   │   │   └── lib/            # API 客户端、BetterAuth 客户端、QueryClient 配置
│   └── server/                    # NestJS 后端应用
│       ├── src/
│       │   ├── auth/           # BetterAuth 集成模块与 AuthGuard 守卫
│       │   ├── workspaces/     # 工作区/组织相关接口
│       │   ├── projects/       # 项目 CRUD 接口
│       │   ├── tasks/          # 任务 CRUD 与排序逻辑接口
│       │   └── events/         # Socket.io 网关 (Gateway)
├── packages/
│   ├── db/                     # Prisma Schema、数据库迁移及导出的单例 PrismaClient
│   ├── shared/                 # 共享的 Zod Schemas、DTO 类型、Socket 事件枚举、全局常量
│   └── ui/                     # 共享的 shadcn/ui 组件与 Tailwind 基础配置
├── .env.example
├── biome.json
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

---

## 4. 数据库配置规范（Neon PostgreSQL + Prisma）

**版本锁定**：必须安装 Prisma 7 稳定版（`prisma@^7.10.0`、`@prisma/client@^7.10.0`）以及 Neon 官方驱动适配器（`@prisma/adapter-neon`、`@neondatabase/serverless`）

由于 Prisma 7 移除了 `schema.prisma` 中的 `url` 与 `directUrl` 属性，Agent 需按以下核心步骤配置 Neon 连接：

1. **`schema.prisma`**（仅保留 provider，不写 URL）：配置 `postgresql` 提供者与客户端生成路径。
2. **`prisma.config.ts`**（供 CLI 使用直连 `DIRECT_URL`）：引入 `dotenv/config` 并通过 `defineConfig` 指定迁移直连地址 `env("DIRECT_URL")` [12.1.1, 12.1.6]。
3. **运行时连接池**：在应用初始化时，通过 `@prisma/adapter-neon` 的 `PrismaNeon` 传入 `DATABASE_URL` 实例化 `PrismaClient` [12.3.1, 12.1.6]。

### 核心数据模型 (`packages/db/prisma/schema.prisma`)

Agent 必须在保留 BetterAuth 所需基础表（`User`, `Session`, `Account`, `Verification`, `Organization`, `Member`, `Invitation`）的同时，实现以下核心业务模型：

1. **Workspace（工作区）**：直接映射到 BetterAuth 的 `Organization` 模型（或通过 `organizationId` 1:1 关联）。
2. **Project（项目）**：
   - `id` (String, `@id @default(cuid())`)
   - `name` (String)
   - `description` (String?)
   - `key` (String，例如 "ENG")
   - `organizationId` (String，关联 BetterAuth 的 `Organization`)
   - `createdAt`, `updatedAt`
3. **Task（任务）**：
   - `id` (String, `@id @default(cuid())`)
   - `title` (String)
   - `description` (String?)
   - `status` (枚举 Enum: `BACKLOG`, `TODO`, `IN_PROGRESS`, `DONE`, `CANCELED`)
   - `priority` (枚举 Enum: `LOW`, `MEDIUM`, `HIGH`, `URGENT`)
   - `position` (Float，用于分数索引 Fractional Indexing，实现拖拽排序)
   - `projectId` (String，关联 `Project`)
   - `assigneeId` (String?，关联 `User` 指派人)
   - `creatorId` (String，关联 `User` 创建人)
   - `dueDate` (DateTime?)
   - `createdAt`, `updatedAt`
4. **Comment（评论）**：
   - `id` (String, `@id @default(cuid())`)
   - `content` (String)
   - `taskId` (String，关联 `Task`)
   - `authorId` (String，关联 `User`)
   - `createdAt`

---

## 5. 核心功能与架构细节

### A. 身份认证与多租户 (`BetterAuth`)

- 在 `apps/server` 中配置 `better-auth`，接入 Prisma 适配器并启用 `organization()` 插件。
- 在 NestJS 中将认证路由挂载到 `/api/auth/*`。**关键注意**：确保 NestJS 的全局 Body Parser 不会破坏 BetterAuth 对原始请求体的解析（需在全局 JSON 解析中间件之前挂载 BetterAuth 处理器，或将 `/api/auth` 排除出默认 Body Parser）。
- 编写自定义的 NestJS `AuthGuard`，通过 `auth.api.getSession({ headers })` 校验请求头中的会话并保护业务接口。
- 前端使用 `better-auth/react` 客户端（启用 `organizationClient()` 插件），并在 TanStack Router 的 `beforeLoad` 钩子中拦截未登录用户重定向至 `/login`。

### B. 视图与前端核心交互

1. **工作区切换器（Workspace Switcher）**：支持在不同 BetterAuth 组织间切换，并支持通过邮箱邀请新成员。
2. **项目看板视图（Kanban View）**：
   - 按 `TaskStatus` 分列展示任务卡片。
   - 支持跨列拖拽改变状态，以及同列上下拖拽排序（基于 `Float` 类型的 `position` 计算中值）。
   - **核心要求**：必须使用 `TanStack Query` 的 `onMutate` 实现无延迟的乐观更新（Optimistic UI Updates），接口报错时自动回滚。
   - 使用 `motion` 的 `layout` 和 `layoutId` 属性实现卡片移动的平滑过渡动画。
3. **项目列表视图（List View）**：
   - 基于 `TanStack Table` 构建。
   - 功能要求：支持按优先级和截止日期排序、关键词搜索过滤、状态多选过滤（过滤条件必须通过 TanStack Router 的 `validateSearch` 双向绑定到 URL 参数中），以及多选批量删除/批量修改状态。
4. **任务详情抽屉（Task Detail Drawer）**：
   - 由 `Zustand`（`activeTaskId`）控制抽屉的开关与当前展示的任务。
   - 使用 `React Hook Form` + `@repo/shared` 中的 Zod Schema 编辑任务字段。
   - 抽屉底部包含实时任务评论区。

### C. 多人实时同步 (`Socket.io`)

- 在 `@repo/shared` 中严格定义 Socket 事件名称及载荷类型（如 `TASK_CREATED`、`TASK_UPDATED`、`TASK_MOVED`、`COMMENT_ADDED`）。
- 当用户进入某个项目页面时，前端向服务端发送 `JOIN_PROJECT_ROOM`（加入 `project:\${projectId}` 房间）。
- 当 NestJS 后端完成任务或评论的增删改后，向对应项目房间广播事件；前端收到事件后，直接操作 `TanStack Query` 缓存（`queryClient.setQueryData` 或 `invalidateQueries`）实现页面无刷新同步。

---

## 6. Agent 分阶段执行计划（Strict Step-by-Step）

请采用渐进式开发方式。**严禁一次性生成所有代码。** 必须严格按以下阶段推进，每完成一个阶段并验证通过后，再进入下一阶段：

- **第一阶段（Phase 1）：Monorepo 骨架与共享包初始化**
  - 初始化 `pnpm` 工作区、`turbo.json`、基础 `tsconfig.json`、根目录 `biome.json` 以及 `.env.example`（包含 `DATABASE_URL`、`DIRECT_URL`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`）。
  - 配置 `packages/db`，编写针对 Neon PostgreSQL 的 Prisma Schema 并导出单例 `PrismaClient`。
  - 配置 `packages/shared`，编写 Task、Project、Comment 和 Socket 事件的共享 Zod Schemas 及 TypeScript 类型，并配置 Vitest 单元测试。
- **第二阶段（Phase 2）：NestJS 后端与 BetterAuth 集成**
  - 初始化 `apps/server`（NestJS），并将默认测试框架替换为 `Vitest`。
  - 集成 `better-auth`（Prisma 适配器 + Organization 插件），生成认证相关数据表并推送到 Neon 数据库（执行 `prisma db push`）。
  - 实现 `AuthGuard` 守卫，以及 Projects、Tasks（含分数排序逻辑及 Vitest 单元测试）和 Comments 的基础 CRUD 接口。
- **第三阶段（Phase 3）：前端基础架构与认证界面**
  - 初始化 `apps/web`（Vite + React + Tailwind CSS + shadcn/ui）。
  - 配置 `TanStack Router`（文件路由）和 `TanStack Query`。
  - 开发登录、注册以及工作区创建/切换页面，并与 BetterAuth 联调打通。
- **第四阶段（Phase 4）：核心业务视图（数据表格与看板）**
  - 实现 `Zustand` 全局 UI 状态管理（附带 Vitest 基础测试）。
  - 开发项目列表视图（集成 `TanStack Table` 与 URL Search Params 同步）。
  - 开发项目看板视图（集成拖拽排序、`Motion` 动画以及 `TanStack Query` 乐观更新）。
  - 开发任务详情抽屉（集成 `React Hook Form` 表单校验）。
- **第五阶段（Phase 5）：WebSocket 实时协作**
  - 实现 NestJS WebSocket Gateway（`Socket.io`）及项目房间管理逻辑。
  - 在 `apps/web` 中接入 `socket.io-client`，监听房间广播并实时更新 `TanStack Query` 缓存。

---

## 7. Agent 编码铁律（Coding Rules）

1. **严禁使用 `any` 类型**：所有类型必须从 Prisma 生成的类型或 Zod Schema（`z.infer<typeof ...>`）中推导。
2. **单一数据源（Single Source of Truth）**：所有字段校验规则（如任务标题的最小/最大长度）必须统一定义在 `packages/shared` 中，供 NestJS 校验管道和前端 React Hook Form 共同复用。
3. **严格的关注点分离**：业务逻辑全部封装在 NestJS Service 中；前端请求封装在独立的 API 层函数中；Zustand 中绝对禁止存放服务端异步数据。

---

## 8. 测试规范（Vitest）

- **统一测试框架**：整个 Monorepo（包括 `apps/web`、`apps/server` 及 `packages/shared`）统一使用 `Vitest`（替换掉 NestJS 默认的 Jest），并在根目录 `turbo.json` 中配置 `test` 任务流水线。
- **测试优先级（不追求盲目覆盖，只测核心逻辑）**：
  1. `packages/shared`：必须为所有 Zod Schema 编写单元测试，验证正常与边界异常输入。
  2. `apps/server`：必须为 `TasksService` 中的拖拽位置计算（Fractional Indexing）及核心 CRUD 编写单元测试（Mock PrismaClient）。
  3. `apps/web`：为 `Zustand` store 和核心表单校验编写基础测试。
- **Agent 自检要求**：每完成一个 Phase 的业务逻辑编写，Agent 必须主动运行 `pnpm test` 确保所有测试通过后，才能进入下一阶段。

---

## 9. 代码规范与格式化（Biome）

- **统一工具链**：整个 Monorepo 根目录统一使用 `@biomejs/biome`（彻底替代 ESLint 和 Prettier），并在根目录配置单一 `biome.json` 及 `turbo.json` 的 `lint` / `format` 任务。
- **NestJS 装饰器兼容**：`biome.json` 中必须开启 `javascript.parser.unsafeParameterDecoratorsEnabled: true`，以支持 NestJS 控制器的参数装饰器（如 `@Body()`、`@Param()`）。
- **排除生成文件**：在 `biome.json` 的 `files.ignore` 中排除 `**/routeTree.gen.ts`（TanStack Router 自动生成）、`**/generated/**`（Prisma 生成）以及 `dist/` 目录。
- **Agent 提交自检**：Agent 每完成一个模块或阶段的代码生成后，必须运行 `pnpm biome check --write .` 自动修复格式与导入排序，确保零 Lint 报错。
