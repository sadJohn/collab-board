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
- **国际化 (i18n)**：`i18next` + `react-i18next` + `i18next-browser-languagedetector`（支持 `zh-CN` 与 `en-US` 无刷新切换，必须配置 TypeScript 类型安全校验，防止拼写错误）
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
│   │   │   ├── locales/        # i18n 语言包 (en.json, zh.json) 与 i18n.ts 配置
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
2. **`prisma.config.ts`**（供 CLI 使用直连 `DATABASE_URL`）：引入 `dotenv/config` 并通过 `defineConfig` 指定迁移直连地址 `env("DATABASE_URL")` [12.1.1, 12.1.6]。
3. **运行时连接池**：在应用初始化时，通过 `@prisma/adapter-neon` 的 `PrismaNeon` 传入 `DATABASE_URL_POOLED` 实例化 `PrismaClient` [12.3.1, 12.1.6]。

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

### B. 视图、国际化与前端核心交互
1. **中英文双语切换（i18n）**：
   * 在 `apps/web/src/locales/` 下维护 `zh.json` 和 `en.json` 两份结构完全一致的语言包，并通过 TypeScript 类型声明实现 `t('...')` 翻译 Key 的严格类型检查（不存在的 Key 编译报错）。
   * 顶部导航栏提供语言切换下拉按钮（中文 / English），切换状态同步至 `Zustand`（持久化到 `localStorage`）并即时更新界面所有文案（包括看板状态列名称、表格表头、弹窗按钮及表单提示）。
   * `@repo/shared` 中的 Zod Schema 校验错误信息优先使用英文或错误码标识，前端在表单展示时映射为对应的 i18n 本地化提示。
2. **工作区切换器（Workspace Switcher）**：支持在不同 BetterAuth 组织间切换，并支持通过邮箱邀请新成员。
3. **项目看板视图（Kanban View）**：
   * 按 `TaskStatus` 分列展示任务卡片。
   * 支持跨列拖拽改变状态，以及同列上下拖拽排序（基于 `Float` 类型的 `position` 计算中值）。
   * **核心要求**：必须使用 `TanStack Query` 的 `onMutate` 实现无延迟的乐观更新（Optimistic UI Updates），接口报错时自动回滚。
   * 使用 `motion` 的 `layout` 和 `layoutId` 属性实现卡片移动的平滑过渡动画。
4. **项目列表视图（List View）**：
   * 基于 `TanStack Table` 构建。
   * 功能要求：支持按优先级和截止日期排序、关键词搜索过滤、状态多选过滤（过滤条件必须通过 TanStack Router 的 `validateSearch` 双向绑定到 URL 参数中），以及多选批量删除/批量修改状态。
5. **任务详情抽屉（Task Detail Drawer）**：
   * 由 `Zustand`（`activeTaskId`）控制抽屉的开关与当前展示的任务。
   * 使用 `React Hook Form` + `@repo/shared` 中的 Zod Schema 编辑任务字段。
   * 抽屉底部包含实时任务评论区。

### C. 多人实时同步 (`Socket.io`)

- 在 `@repo/shared` 中严格定义 Socket 事件名称及载荷类型（如 `TASK_CREATED`、`TASK_UPDATED`、`TASK_MOVED`、`COMMENT_ADDED`）。
- 当用户进入某个项目页面时，前端向服务端发送 `JOIN_PROJECT_ROOM`（加入 `project:\${projectId}` 房间）。
- 当 NestJS 后端完成任务或评论的增删改后，向对应项目房间广播事件；前端收到事件后，直接操作 `TanStack Query` 缓存（`queryClient.setQueryData` 或 `invalidateQueries`）实现页面无刷新同步。

---

## 6. Agent 分阶段执行计划（Strict Step-by-Step）

请采用渐进式开发方式。**严禁一次性生成所有代码。** 必须严格按以下阶段推进，每完成一个阶段并验证通过后，再进入下一阶段：

- **第一阶段（Phase 1）：Monorepo 骨架与共享包初始化**
  - 初始化 `pnpm` 工作区、`turbo.json`、基础 `tsconfig.json`、根目录 `biome.json` 以及 `.env.example`（包含 `DATABASE_URL`、`DATABASE_URL_POOLED`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`）。
  - 配置 `packages/db`，编写针对 Neon PostgreSQL 的 Prisma Schema 并导出单例 `PrismaClient`。
  - 配置 `packages/shared`，编写 Task、Project、Comment 和 Socket 事件的共享 Zod Schemas 及 TypeScript 类型，并配置 Vitest 单元测试。
- **第二阶段（Phase 2）：NestJS 后端与 BetterAuth 集成**
  - 初始化 `apps/server`（NestJS），并将默认测试框架替换为 `Vitest`。
  - 集成 `better-auth`（Prisma 适配器 + Organization 插件），生成认证相关数据表并推送到 Neon 数据库（执行 `prisma db push`）。
  - 实现 `AuthGuard` 守卫，以及 Projects、Tasks（含分数排序逻辑及 Vitest 单元测试）和 Comments 的基础 CRUD 接口。
  - **子任务拆解（2.1 – 2.14）：严格按序执行，每个任务完成并自检通过后再进入下一个**
    - **2A 服务端骨架**
      - **2.1 初始化 NestJS 应用**：新建 `apps/server` 的 `package.json`、`tsconfig.json`、`nest-cli.json`、`src/main.ts`、`src/app.module.ts`；依赖 `@repo/db`、`@repo/shared`（`workspace:*`）及 `@nestjs/common|core|config`。验收：`pnpm --filter @repo/server dev` 可启动，`GET /health` 返回 200。
      - **2.2 替换 Jest 为 Vitest**：移除 Jest 相关依赖，安装 `vitest` + `@swc/core` + `unplugin-swc`；`vitest.config.ts` 必须开启 `decoratorMetadata: true`（否则 Nest DI 测试失败）。验收：一个控制器冒烟测试通过。
      - **2.3 环境变量与入口配置**：`main.ts` 加载根目录 `.env`，端口读 `SERVER_PORT`，CORS 读 `CORS_ORIGIN`。验收：启动日志打印正确端口，跨域预检通过。
    - **2B BetterAuth 集成**
      - **2.4 创建 BetterAuth 实例**：`src/auth/auth.ts` 使用 `prismaAdapter(prisma, { provider: "postgresql" })`，启用 `emailAndPassword`、GitHub/Google OAuth、`organization()` 插件，`basePath: "/api/auth"`，`baseURL` 与 `trustedOrigins` 读环境变量。验收：`tsc --noEmit` 通过且无 `any`。
      - **2.5 挂载认证路由（关键）**：以 `bodyParser: false` 创建应用，先 `app.use("/api/auth", toNodeHandler(auth))`，再对剩余路径应用 `express.json()` / `urlencoded`，避免破坏 BetterAuth 对原始请求体的解析。验收：`GET /api/auth/ok` 正常，`POST /api/auth/sign-up/email` 可注册。
      - **2.6 推送认证表到 Neon**：执行 `pnpm db:push`。验收：数据库中可见 `user`、`session`、`account`、`verification`、`organization`、`member`、`invitation` 表。
      - **2.7 AuthGuard 与参数装饰器**：通过 `auth.api.getSession({ headers: fromNodeHeaders(req.headers) })` 校验会话，未登录抛 401；提供 `@CurrentUser()`、`@CurrentSession()`。验收：无 Cookie 访问受保护接口返回 401，携带有效会话返回 200。
      - **2.8 OrganizationGuard**：校验 `activeOrganizationId` 且当前用户存在于 `member` 表中。验收：非成员访问工作区资源返回 403。
      - **2.9 AuthGuard 单元测试**：Mock `auth.api.getSession`，覆盖缺少请求头、会话无效、会话有效三种情况。验收：测试通过。
    - **2C 业务模块**
      - **2.10 公共基础设施**：`PrismaModule` 提供 `@repo/db` 单例；`ZodValidationPipe` 复用 `@repo/shared` 的 Schema，将 `ZodError` 映射为 400 并返回字段级 message。验收：非法请求体返回 400。
      - **2.11 Projects 模块**：按 `organizationId` 隔离的 list/get/create/update/delete，复用 `createProjectSchema` / `updateProjectSchema`，`@@unique([organizationId, key])` 冲突映射为 409。验收：单元测试（Mock Prisma）覆盖 key 冲突与跨组织越权。
      - **2.12 分数排序工具（纯函数）**：`computePosition` 覆盖空列（`INITIAL_TASK_POSITION`）、仅有前一项（`prev + STEP`）、仅有后一项（`next - STEP`）、前后均有（取中值）、间距过小需触发 rebalance 兜底五种情况。验收：Vitest 逐条用例通过。
      - **2.13 Tasks 模块**：create（置于目标状态列末尾）、list（基于 `taskQuerySchema` 过滤/排序/分页）、update、move（事务内校验任务同属一个项目后计算 position）、delete。验收：`TasksService` 单测覆盖 create/move/delete 及跨项目越权拒绝。
      - **2.14 Comments 模块与收尾自检**：create/list/delete（仅作者或管理员可删除），接入 `AppModule` 后运行 `pnpm test`、`pnpm typecheck`、`pnpm biome check --write .`。验收：三条命令全绿且零 Biome 报错。
  - **阶段二完成标准**：Neon 认证表齐全；`/api/auth/*` 可用；受保护接口 401/403 行为正确；`pnpm test` 全部通过。
- **第三阶段（Phase 3）：前端基础架构与认证界面**
  - 初始化 `apps/web`（Vite + React + Tailwind CSS + shadcn/ui）。
  - 配置 `TanStack Router`（文件路由）和 `TanStack Query`。
  - 开发登录、注册以及工作区创建/切换页面，并与 BetterAuth 联调打通。
  - **子任务拆解（3.1 – 3.11）：严格按序执行，每个任务完成并自检通过后再进入下一个**
    - **3A 前端工程骨架**
      - **3.1 初始化 `apps/web` 与 `packages/ui`**：Vite + React 19 + TypeScript（strict）；接入 Tailwind CSS 与 shadcn/ui（`components.json`、基础主题变量）；`packages/ui` 提供 Tailwind 预设与 `cn` 工具；声明 `@repo/shared`（`workspace:*`）依赖；`.env.example` 增加 `VITE_API_URL`。验收：`pnpm --filter @repo/web dev` 启动并渲染占位首页，`build` / `typecheck` 通过。
      - **3.2 前端测试基座**：为 `apps/web` 配置 `vitest.config.ts`（jsdom + SWC/React 插件）与 `@testing-library/react`，并纳入根 `turbo.json` 的 `test` 流水线。验收：一个组件或工具函数冒烟测试通过，`pnpm test` 能跑到 web 包。
    - **3B 国际化与全局 UI 状态**
      - **3.3 i18n 基础设施**：`src/locales/zh.json` 与 `en.json` 结构完全一致；`src/locales/i18n.ts` 接入 `i18next`、`react-i18next`、`i18next-browser-languagedetector`，并通过 `CustomTypeOptions` 以 `zh.json` 推导翻译 Key 类型。验收：调用不存在的 Key 时 `tsc --noEmit` 报错。
      - **3.4 语言切换（Zustand）**：`src/stores/ui-store.ts` 提供 `language` 状态，使用 `persist` 中间件写入 `localStorage`，并与 i18next 双向同步；封装独立的 `<LanguageSwitcher />` 下拉组件并在占位首页挂载验证。验收：切换后所有文案即时更新且刷新后保持；store 单元测试（Vitest）通过。
    - **3C 路由与服务端状态**
      - **3.5 TanStack Router（文件路由）**：配置 Vite 插件生成 `routeTree.gen.ts`（Biome 忽略该文件）；`__root.tsx` 作为根布局并挂载 `QueryClientProvider`、i18n Provider 与 404 / 错误边界；`/` 重定向到默认入口。验收：文件路由自动生成，直接访问与客户端跳转均正常。
      - **3.6 API 客户端与 Query 基建**：`src/lib/api-client.ts` 封装 `fetch`（`VITE_API_URL`、`credentials: "include"`、统一解析 400 字段级错误与 401/403）、`src/lib/query-client.ts` 配置默认重试与 `staleTime`、`src/lib/query-keys.ts` 集中管理 query key。验收：错误映射单元测试通过，`pnpm --filter @repo/web typecheck` 无 `any`。
    - **3D 认证与工作区**
      - **3.7 BetterAuth 客户端与表单基座**：`src/lib/auth-client.ts` 使用 `better-auth/react` 并启用 `organizationClient()`，导出 `authClient`、`useSession`、`useListOrganizations`、`useActiveOrganization`；封装 React Hook Form + `zodResolver` 的通用表单字段组件。验收：`typecheck` 通过，session hook 可获取当前会话。
      - **3.8 登录 / 注册页面**：`/login`、`/register` 两个路由，使用 React Hook Form + Zod 校验邮箱与密码，展示字段级错误与提交态，成功后跳转工作区。验收：与本地 server 联调可完成注册、登录、退出。
      - **3.9 路由守卫（`beforeLoad`）**：受保护路由在 `beforeLoad` 中通过异步非 Hook 方法（`authClient.getSession()` 结合 `queryClient.ensureQueryData`）校验会话，未登录重定向 `/login` 并携带 `redirect` 参数；已登录用户访问 `/login`、`/register` 时重定向至工作区。验收：未登录访问受保护路由被拦截，登录后回到原目标地址。
      - **3.10 工作区页面与应用外壳**：支持创建组织、列出并切换组织（`setActive`）、按邮箱邀请成员；实现受保护布局：顶部导航（工作区切换器、语言切换、用户菜单/退出）与侧边栏占位。验收：切换工作区后 `activeOrganizationId` 生效，受保护接口返回 200；邀请接口调用成功。
      - **3.11 收尾自检**：补齐 web 单元测试（ui-store、登录表单校验），运行 `pnpm test`、`pnpm typecheck`、`pnpm biome check --write .`、`pnpm build`。验收：四条命令全绿且零 Biome 报错。
  - **阶段三完成标准**：注册/登录/退出可用；工作区可创建、切换并邀请成员；未登录访问受保护路由正确重定向；中英文切换即时生效且刷新后保持；`pnpm test` 全部通过。
- **第四阶段（Phase 4）：核心业务视图（数据表格与看板）**
  - 实现 `Zustand` 全局 UI 状态管理（附带 Vitest 基础测试）。
  - 开发项目列表视图（集成 `TanStack Table` 与 URL Search Params 同步）。
  - 开发项目看板视图（集成拖拽排序、`Motion` 动画以及 `TanStack Query` 乐观更新）。
  - 开发任务详情抽屉（集成 `React Hook Form` 表单校验）。
  - **技术决策与前置约定**
    - **DTO 层**：Web 不得依赖 `@repo/db`（Prisma Client 会进入浏览器包），且接口日期为 JSON 字符串。在 `@repo/shared` 新增 `ProjectDto`、`TaskDto`、`TaskPageDto`、`CommentDto` 的 Zod Schema，类型由 `z.infer` 推导，前端 API 层在边界 `parse`。
    - **位置算法**：`computePosition` 上移到 `@repo/shared`（纯函数，含精度阈值保护与重排信号），服务端改为引用同一实现，前端看板乐观更新复用，避免两套中值逻辑。
    - **拖拽引擎与动画隔离**：`@dnd-kit/core` + `@dnd-kit/sortable`（纯 Pointer 事件与无障碍能力）搭配 `DragOverlay`；外层容器绑定 `dnd-kit` 的 `transform`，内层 `motion.div` 仅在非拖拽态且非落位冷却期负责卡片 `layout="position"` 过渡与抽屉动画，避免双动画引擎打架导致抖动与闪烁。
    - **任务详情取数与缓存联动**：服务端新增 `GET /tasks/:id`（组织隔离），抽屉不依赖列表分页缓存；抽屉更新任务后需同步局部更新或失效列表/看板缓存，保持视图一致性。
    - **看板数据与新建顺序**：以 `pageSize = MAX_PAGE_SIZE(100)` 一次取全量后前端分组；超出时顶部显眼提示「仅显示前 100 条」，后续再做分列接口；新建任务默认置于列首（最小 `position` 之前），确保高优/新任务在截断边界下依然立即可见。
    - **新增依赖**：`@tanstack/react-table`、`@dnd-kit/core`、`@dnd-kit/sortable`、`@dnd-kit/modifiers`、`motion`、`@radix-ui/react-dialog`、`@radix-ui/react-select`、`@radix-ui/react-checkbox`、`@radix-ui/react-dropdown-menu`（如已统一使用 `radix-ui` 聚合包则直接复用）。
  - **路由结构**
    ```text
    _app/projects/index.tsx                 /projects                    项目列表 + 新建项目
    _app/projects/projectId/route.tsx /projects/projectId         项目布局（头部、Board/List Tab、任务抽屉）
    _app/projects/\$projectId/index.tsx      → 重定向到 board
    _app/projects/projectId/board.tsx /projects/projectId/board   看板视图
    _app/projects/projectId/list.tsx /projects/projectId/list    列表视图
    ```
  - **子任务拆解（4.1 – 4.8）：严格按序执行，每个任务完成并自检通过后再进入下一个**
    - **4A 共享基础设施**
      - **4.1 DTO、位置算法与 API 层**：`packages/shared` 新增 `dto.ts`（4 个 DTO Schema）与 `position.ts`（迁移 `computePosition` 并补充浮点数精度耗尽检测/重排标识）；`apps/server` 改为引用共享实现（精度不足时触发重排），原测试同步调整。`apps/web/src/lib/api/{projects,tasks,comments,members}.ts` 封装列表（q/statuses/priorities/sortBy/sortOrder/page/pageSize）、详情、创建、更新、move、删除及组织成员扁平化映射；`query-keys` 增加任务筛选维度（`statuses` 排序归一化）与成员列表 key（设置长 `staleTime`）。验收：shared 新增 DTO/position 单测通过；server 既有测试全绿；web `typecheck` 通过。
    - **4B UI 状态与项目入口**
      - **4.2 Zustand UI 状态**：`ui-store` 增加 `sidebarCollapsed`（持久化）、`activeTaskId`（开关抽屉）、`commandPaletteOpen`（快捷键需避让拖拽中与表单输入焦点，Esc 优先关闭顶层交互）；侧边栏折叠接入布局。验收：store 单测（初始值、setter、持久化）通过，侧边栏可折叠且刷新保持。
      - **4.3 项目列表页**：`/projects` 展示项目卡片（名称/key/描述），新建项目弹窗使用 `createProjectSchema`，`409` 映射为「项目标识已存在」，空态引导创建。验收：创建后列表即时刷新；单测覆盖提交与 409 错误映射。
      - **4.4 项目布局**：项目详情查询（404 提示 + 返回入口），头部展示 key/名称，Board/List Tab 使用类型安全 `Link`，挂载任务抽屉容器（切换 `projectId` 或离开路由时自动清空 `activeTaskId` 防止跨项目残留）。验收：子路由直达、刷新、Tab 切换及路由切换清理均正常。
    - **4C 列表视图**
      - **4.5 任务列表（TanStack Table + URL 同步）**：`validateSearch` 定义 `q`、`statuses`（写入 URL 前字典序排序稳定缓存命中）、`sortBy`（priority/dueDate/updatedAt）、`sortOrder`、`page`、`pageSize`；搜索防抖或筛选变更写回 URL 时同步将 `page` 重置为 `1`，服务端排序/过滤/分页；列为标题、状态、优先级、指派人、截止日期、更新时间；行多选支持批量删除与批量改状态（使用 `Promise.allSettled` 调接口，`onSettled` invalidate，精准统计并提示「成功 N 条，失败 M 条」）。验收：URL 与表格双向同步、直接访问 URL 可还原状态、筛选变更页码归 1；单测覆盖 search schema 与批量结果统计。
    - **4D 看板与任务详情**
      - **4.6 看板视图**：按 `TASK_STATUSES` 渲染 5 列，支持同列排序与跨列移动（空列可放置）；拖放结束计算 `previousTaskId`/`nextTaskId` 调用 `POST /tasks/:id/move`；`onMutate` 取消查询 → 快照 → 用共享 `computePosition` 更新缓存中的 `status/position`，`onError` 回滚，`onSettled` invalidate（兜底后端重排结果）；列头「＋」快速创建任务（`createTaskSchema`，默认插入列首）。验收：乐观更新纯函数单测（跨列/列首/列尾/精度阈值/回滚快照）通过；浏览器拖拽后刷新顺序保持且无闪烁抖动。
      - **4.7 任务详情抽屉**：服务端新增 `GET /tasks/:id`（`TasksService.findOne` + 组织隔离 + 单测）；抽屉由 `activeTaskId` 控制，使用 RHF + `updateTaskSchema` 编辑标题/描述/状态/优先级/指派人/截止日期，保存走乐观更新与回滚，并同步更新或失效后台列表/看板对应缓存；指派人选项复用 `4.1` 封装的扁平化组织成员列表；底部评论区支持列表、发布、删除（作者或管理员）。验收：新增接口单测通过；抽屉编辑（含关闭后背后列表/看板即时同步）与评论在浏览器实测生效。
    - **4E 收尾**
      - **4.8 收尾自检**：补齐中英文案（看板列名、截断提示、表头、抽屉、评论、批量操作成败统计提示），补齐单测（ui-store、search schema、乐观更新、指派人映射、批量结果处理），依次运行 `pnpm test`、`pnpm typecheck`、`pnpm biome check --write .`、`pnpm build`。验收：四条命令全绿且零 Biome 报错；端到端流程「创建项目 → 看板建任务 → 跨列拖拽 → 列表筛选/排序（校验 URL 与页码重置）→ 批量改状态 → 抽屉编辑（校验看板同步）+ 评论」通过。
  - **阶段四完成标准**：项目可创建并进入 Board/List 两种视图；看板拖拽持久化、无动画冲突且失败可回滚；列表筛选/排序与 URL 双向同步、批量操作成败可感知；任务抽屉可编辑并实时同步外层视图与评论；全部测试与构建命令通过。

- **第五阶段（Phase 5）：WebSocket 实时协作**
  - 实现 NestJS WebSocket Gateway（`Socket.io`）及项目房间管理逻辑。
  - 在 `apps/web` 中接入 `socket.io-client`，监听房间广播并实时更新 `TanStack Query` 缓存。
  - **技术决策与前置约定**
    - **握手鉴权**：连接建立时从握手的 Cookie 解析会话（`auth.api.getSession`，复用 BetterAuth），未认证直接拒绝；`JOIN_PROJECT_ROOM` 时再校验项目属于当前活动组织且用户存在于 `member` 表，绝不信任客户端传入的身份。
    - **房间命名**：统一使用 `@repo/shared` 的 `projectRoomName(projectId)`（`project:${projectId}`）；进入项目布局即 join，切换项目或离开路由时 leave，避免跨项目串台。
    - **契约现状**：`packages/shared/src/socket-events.ts` 已定义 `SOCKET_EVENTS`、载荷 Zod Schema、`socketPayloadSchemas` 与双端事件类型；本阶段补齐 `COMMENT_DELETED`，并在服务端广播前、客户端接收后均 `parse` 校验。
    - **广播触发点**：业务 Service 成功写库后经 `EventsService` 广播；Gateway 只负责连接鉴权与房间进出，禁止反向依赖业务 Service，避免循环依赖。载荷统一携带 `actorId` 便于前端识别本地操作。
    - **乐观更新与广播并存**：广播不直接覆盖未确认的乐观状态，列表/看板以 `invalidateQueries` 收敛到服务端权威数据；任务详情与评论列表用 `setQueryData` 精准更新；重连成功后统一 invalidate 兜底。
    - **客户端连接**：`socket.io-client` 单例（`withCredentials: true`、地址取 `VITE_API_URL`、按需 connect），断线自动重连后重新 join 当前房间。
    - **单实例假设**：暂不引入 Redis adapter，房间状态保存在单个 NestJS 实例内；多实例扩展作为后续演进点。
  - **子任务拆解（5.1 – 5.10）：严格按序执行，每个任务完成并自检通过后再进入下一个**
    - **5A 契约与网关**
      - **5.1 补齐事件契约**：在 `@repo/shared` 新增 `COMMENT_DELETED`（`commentId`/`taskId`/`projectId`/`actorId`）及对应 `socketPayloadSchemas`、`ServerToClientEvents` 条目；单测覆盖合法载荷与缺字段拒绝。验收：`pnpm --filter @repo/shared test` 通过，`typecheck` 无 `any`。
      - **5.2 EventsService**：新增 `EventsModule`，对外提供 `emitToProject(projectId, event, payload)`，广播前用共享 Schema `parse`（校验失败抛错且不广播）；`TasksModule`/`CommentsModule` 可注入。验收：单测覆盖“合法广播一次 / 非法载荷不广播”。
      - **5.3 Socket 握手鉴权**：在 Gateway 的 `afterInit` 中注册 `server.use` 连接中间件，通过 `fromNodeHeaders(socket.handshake.headers)` 调用 `auth.api.getSession`，失败调用 `next(new Error('Unauthorized'))` 拒绝连接，成功则将用户信息存入 `socket.data.user`；单测 mock 会话覆盖无 Cookie、会话无效、会话有效三种情况。验收：无会话客户端连接被拒。
      - **5.4 ProjectsGateway 房间管理**：`@WebSocketGateway` 开启 CORS（`origin` 取 `CORS_ORIGIN`、`credentials: true`）；`JOIN_PROJECT_ROOM` 从 `socket.data.user` 获取身份，校验项目归属与成员身份后 `socket.join(projectRoomName(...))` 并通过 ack 返回房间名；`LEAVE_PROJECT_ROOM` 离开；非成员/跨组织返回错误且不入房。验收：单测覆盖 join/leave/越权拒绝；两个客户端加入同一房间可互收广播。
    - **5B 服务端广播接入**
      - **5.5 Tasks 广播接入**：`create` → `TASK_CREATED`、`update` → `TASK_UPDATED`、`move` → `TASK_MOVED`（附带 `fromStatus`）、`delete` → `TASK_DELETED`；`actorId` 取当前会话用户，仅在写库成功后广播。验收：`TasksService` 单测断言每类操作 emit 一次且失败路径不广播。
      - **5.6 Comments 广播接入**：`create` → `COMMENT_ADDED`、`delete` → `COMMENT_DELETED`（含 `taskId`/`projectId`）；删除权限仍由“作者或管理员”服务端校验。验收：`CommentsService` 单测覆盖广播与越权不广播。
    - **5C 前端实时层**
      - **5.7 Socket 客户端与连接 Hook**：`src/lib/socket.ts` 创建单例连接（`withCredentials`、`autoConnect: false`）；`useProjectRoom(projectId)` 负责 connect → join、`connect` 事件重连后自动重新 join、切换项目先 leave 旧房间、卸载时清理监听。验收：`typecheck` 通过；浏览器 Network 面板可见握手成功与 join ack。
      - **5.8 缓存同步**：`useProjectRealtime(projectId)` 监听事件并在边界 `parse`：若 `payload.actorId === currentUserId` 且为 `TASK_MOVED` 则跳过冗余失效避免拖拽闪烁；`TASK_CREATED`/`TASK_UPDATED` 更新详情缓存并失效列表/看板，`TASK_MOVED` 失效看板缓存，`TASK_DELETED` 移除详情缓存并失效列表，`COMMENT_ADDED`/`COMMENT_DELETED` 精准更新评论列表缓存；重连成功统一 invalidate。验收：事件到缓存更新的纯函数/映射单测通过，`typecheck` 无 `any`。
      - **5.9 布局接入与清理**：项目布局挂载 `useProjectRoom` 与 `useProjectRealtime`；切换 `projectId` 或离开路由时 leave + 解绑；收到 `TASK_DELETED` 且与 `activeTaskId` 一致时自动关闭抽屉。验收：路由切换后旧房间不再收到事件（浏览器实测）。
    - **5D 收尾**
      - **5.10 双端联调与收尾自检**：两个浏览器上下文登录同一工作区并打开同一项目，验证任务创建、跨列拖拽、编辑、删除与评论增删在另一端实时生效；模拟断网恢复后自动重连并补齐数据。依次运行 `pnpm test`、`pnpm typecheck`、`pnpm biome check --write .`、`pnpm build`。验收：四条命令全绿且零 Biome 报错；双端实测全部通过。
  - **阶段五完成标准**：未认证或非工作区成员无法加入项目房间；同一项目内任一端对任务与评论的增删改移都会实时同步到另一端且无需刷新；断线重连后数据自动收敛；全部测试、类型检查、规范与构建命令通过。

- **第六阶段（Phase 6）：用户资料设置与 Supabase Storage（S3 协议）头像上传**
  - 支持在个人设置页上传头像（对象存储预签名直传）并修改显示名称。
  - 头像在顶部导航、任务卡片、任务详情抽屉与评论列表中统一展示。
  - **技术决策与前置约定**
    - **标准 S3 兼容架构**：后端统一使用 `@aws-sdk/client-s3` 与 `@aws-sdk/s3-request-presigner`，连接 Supabase Storage 的 S3 兼容端点（必须开启 `forcePathStyle: true`），保持标准 S3 协议的通用性与可迁移性。
    - **预签名直传（Presigned URL）**：图片二进制流严禁经过 NestJS 服务端。前端向 NestJS 申请预签名上传 URL → 前端使用独立无凭证的 `ky.put` 直传 Supabase Storage → 上传成功后调用 BetterAuth 的 `authClient.updateUser({ name, image })` 更新用户表。
    - **安全边界**：在 `@repo/shared` 定义上传请求 Zod Schema，严格限制 `contentType` 仅允许 `image/jpeg`、`image/png`、`image/webp`，限制文件大小 `size <= 2 * 1024 * 1024`（2MB），服务端按 `avatars/${userId}/${Date.now()}-${randomUUID()}.${ext}` 生成隔离存储 Key，防止路径穿越与覆盖他人文件。
  - **子任务拆解（6.1 – 6.6）：严格按序执行，每个任务完成并自检通过后再进入下一个**
    - **6A 环境变量与共享契约**
      - **6.1 环境变量与共享契约**：`.env.example` 补充 Supabase Storage S3 兼容环境变量（`S3_ENDPOINT`、`S3_REGION`、`S3_BUCKET`、`S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY`、`S3_PUBLIC_URL`）及注释示例；在 `@repo/shared` 新增 `presignUploadSchema`（校验 `contentType` 白名单与 `size <= 2MB`）及响应类型 `{ uploadUrl: string; publicUrl: string; key: string }`，并补充边界值 Vitest 单元测试。验收：`pnpm --filter @repo/shared test` 通过，`typecheck` 无 `any`。
    - **6B 后端上传模块**
      - **6.2 后端 UploadsModule（`apps/server`）**：安装 `@aws-sdk/client-s3`、`@aws-sdk/s3-request-presigner`；实现 `UploadsService` 与 `UploadsController`（`POST /uploads/presign`，受 `AuthGuard` 保护）：校验请求体，初始化 `S3Client`（`forcePathStyle: true`），生成有效期 300 秒的 `PutObjectCommand` 预签名 URL，并拼接 `${S3_PUBLIC_URL}/${key}` 返回最终可公开访问的图片地址。验收：`UploadsService` 单元测试覆盖「合法请求返回签名 URL / 非法 MIME 或超大小拒绝 / 缺失环境变量报错」。
    - **6C 前端头像与资料设置**
      - **6.3 通用头像组件 `<UserAvatar />`（`apps/web`）**：基于 shadcn `Avatar` 封装 `<UserAvatar user={{ name, email, image }} size="sm" | "md" | "lg" />`：优先展示 `user.image`；加载失败或为空时展示用户名首字母 `AvatarFallback`（并基于邮箱/ID 生成稳定背景色）；全局替换顶部导航用户菜单、任务卡片指派人、任务详情抽屉指派人、评论列表中的用户头像展示。验收：`typecheck` 通过，无头像用户展示统一样式的首字母头像。
      - **6.4 个人资料设置页面（`/settings/profile`）**：在受保护路由下新增 `/settings/profile`，并在顶部导航用户下拉菜单中添加「个人设置 / Profile Settings」入口（补齐 `zh.json` 与 `en.json` 对应翻译 Key）；页面包含头像预览与上传区（支持点击或拖拽选择本地图片，前端前置校验格式与 2MB 限制，展示上传 Loading 状态）、显示名称（`name`）输入框（React Hook Form + Zod）。验收：i18n 类型检查通过，表单校验报错文案支持中英文切换。
      - **6.5 上传直传与会话刷新联调**：封装 `uploadAvatar(file: File)` 工具函数：调用 `apiClient.post('uploads/presign')` 获取签名 → 使用独立干净的 `ky.put(uploadUrl, { body: file, headers: { 'Content-Type': file.type } })` 直传 Supabase（**严禁复用带 `prefixUrl` 和 `credentials: 'include'` 的 `apiClient`**，避免签名校验或跨域预检失败）→ 调用 `authClient.updateUser({ name, image: publicUrl })` 并刷新 BetterAuth session 缓存。验收：在 `.env` 填入 Supabase Storage 参数并创建公开桶 `collab-avatars` 后，实测上传头像成功，刷新页面后顶部导航、任务卡片和评论区的头像全部同步更新为云端图片。
    - **6D 收尾**
      - **6.6 收尾自检**：依次运行 `pnpm test`、`pnpm typecheck`、`pnpm biome check --write .`、`pnpm build`。验收：四条命令全绿且零 Biome 报错。
  - **阶段六完成标准**：上传接口受认证保护且仅接受白名单 MIME 与 ≤2MB 文件；Supabase Storage 下可完成头像直传并刷新会话，导航、任务卡片、抽屉与评论头像同步更新；无头像用户统一展示首字母头像；全部测试、类型检查、规范与构建命令通过。

- **第七阶段（Phase 7）：全局命令面板（Cmd + K）与实时在线成员（Online Presence）**
  - 支持通过全局快捷键呼出命令面板，仅用键盘完成高频操作与跨视图跳转。
  - 在项目顶部导航实时展示当前正在查看该项目的在线成员头像组。
  - **技术决策与前置约定**
    - **命令面板状态归属**：面板开关属于纯 UI 状态，放入 `Zustand`（`ui-store.ts`）的 `commandPaletteOpen`，绑定全局快捷键 `Cmd + K`（macOS）与 `Ctrl + K`（Windows/Linux），并在顶部导航提供可点击触发按钮（显示 `⌘K` 提示徽标）；组件基于 `shadcn/ui` 的 `Command`（底层 `cmdk`）实现，所有分组标题、操作指令与搜索占位符必须接入 `react-i18next`。
    - **在线状态数据来源**：复用现有 `Socket.io` 房间机制（`project:${projectId}`），在单个 NestJS 实例的内存中通过房间 Socket 列表聚合在线用户，**不引入额外数据库写操作或 Redis**；按 `userId` 去重，同一用户多个标签页只展示一个头像，全部断开或离开房间后移除；在线成员属于服务端推送数据，只保存在 Hook 层，严禁写入 `Zustand`。
    - **组件复用**：在线头像复用第六阶段的 `<UserAvatar size="sm" />`，超过 5 人折叠为 `+N`。
  - **子任务拆解（7.1 – 7.6）：严格按序执行，每个任务完成并自检通过后再进入下一个**
    - **7A 共享契约与服务端在线状态**
      - **7.1 共享 Socket 在线状态契约（`packages/shared`）**：在 `socket-events.ts` 新增服务端广播事件 `ROOM_PRESENCE_UPDATED`（载荷 `{ projectId: string; users: Array<{ id: string; name: string; email: string; image: string | null }> }`）及可选的客户端查询事件 `GET_ROOM_PRESENCE`（防止极端时序下错过首次广播），补齐 `SOCKET_EVENTS`、`socketPayloadSchemas` 与双端事件类型；单测覆盖合法载荷与缺字段拒绝。验收：`pnpm --filter @repo/shared test` 通过，`typecheck` 无 `any`。
      - **7.2 服务端房间在线成员聚合与广播（`apps/server`）**：扩展 `ProjectsGateway`，连接鉴权通过后确保 `socket.data.user` 含 `{ id, name, email, image }`；新增辅助方法 `broadcastRoomPresence(projectId)`，通过 `server.in(projectRoomName(projectId)).fetchSockets()` 获取房间内活跃 Socket，按 `user.id` 去重后向该房间广播 `ROOM_PRESENCE_UPDATED`（广播前经共享 Schema `parse` 校验）；在 `JOIN_PROJECT_ROOM` 成功后、`LEAVE_PROJECT_ROOM` 后、`disconnecting`（离开所有房间前）三个时机触发。验收：`ProjectsGateway` 单测覆盖「单人进出房间广播、同用户多标签页去重、断开连接自动移除」。
    - **7B 前端在线成员**
      - **7.3 在线成员 Hook 与头像栏组件（`apps/web`）**：`useProjectRealtime(projectId)` 监听 `ROOM_PRESENCE_UPDATED`（边界 `parse` 校验）维护当前项目在线成员列表状态，切换项目或离开路由时自动清空（可选：join 后发送 `GET_ROOM_PRESENCE` 兜底）；封装 `<OnlinePresenceAvatars users currentUserId />`，复用 `<UserAvatar size="sm" />`，Tooltip 悬停展示成员姓名与「在线 / Online」状态徽标（当前用户标注「我 / You」），超过 5 人显示 `+N` 计数徽标；挂载到项目布局顶部导航栏右侧。验收：开两个不同账号的浏览器窗口进入同一项目，双方顶部实时显示彼此头像；关闭其中一个窗口后另一端头像自动消失。
    - **7C 全局命令面板**
      - **7.4 命令面板状态与组件（`apps/web`）**：通过 `npx shadcn@latest add command` 引入 `Command` 组件；`ui-store.ts` 增加 `commandPaletteOpen` 状态及 `setCommandPaletteOpen`、`toggleCommandPalette` 动作；封装 `<CommandPalette />` 并挂载到受保护根布局，绑定全局 `keydown` 监听（`e.key === "k" && (e.metaKey || e.ctrlKey)`，命中时 `e.preventDefault()`）；补齐 `zh.json` 与 `en.json` 中命令面板的所有分组与指令翻译 Key。验收：在任意受保护页面按下 `Cmd + K` / `Ctrl + K` 可流畅呼出或关闭命令面板，i18n 类型检查通过。
      - **7.5 命令面板核心指令集联调（`apps/web`）**：在 `<CommandPalette />` 中实现四类高频指令（执行后自动关闭面板）：(1) **快速操作**：新建任务（打开新建任务弹窗）、切换中英文（联动 `ui-store` 与 `i18next`）、前往个人资料设置（跳转 `/settings/profile`）；(2) **视图切换**（项目路由下显示）：切换到看板视图（Board）、切换到列表视图（List）；(3) **当前项目任务快搜**（项目路由下显示）：直接读取 `TanStack Query` 已缓存的当前项目任务列表，按标题 / Key 秒搜，回车打开对应任务详情抽屉（`setActiveTaskId`）；(4) **切换工作区**：列出当前用户所属组织，选中后调用 BetterAuth `setActive` 切换工作区。验收：仅用键盘上下方向键与回车即可完成切换视图、搜索任务开抽屉、切换语言与跳转设置。
    - **7D 收尾**
      - **7.6 收尾自检**：补充 `ui-store` 命令面板开关测试与在线成员去重 / 折叠格式化纯函数单测；依次运行 `pnpm test`、`pnpm typecheck`、`pnpm biome check --write .`、`pnpm build`。验收：四条命令全绿且零 Biome 报错。
  - **阶段七完成标准**：命令面板可通过全局快捷键呼出并仅用键盘完成高频操作与跨视图跳转；同一项目内在线成员头像实时增减、按用户去重且多标签页不重复；全部测试、类型检查、规范与构建命令通过。

- **第八阶段（Phase 8）：工作区邀请完整闭环（邮件发送 + 链接邀请 + 站内通知收件箱）**
  - 通过 Resend（本地开发模式降级为控制台日志）发送邀请邮件，包含工作区名称、邀请人信息与接受按钮的 HTML 邮件。
  - 提供链接邀请 / 邮件邀请 / 站内铃铛通知三条路径，邀请接受后自动切换工作区并跳转。
  - **技术决策与前置约定**
    - **BetterAuth Organization 邮件钩子**：在 `apps/server` 的 `better-auth` 配置中，为 `organization()` 插件实现 `sendInvitationEmail` 回调，生成包含 `invitation.id` 的前端落地页链接（`` `${FRONTEND_URL}/accept-invitation/${data.id}` ``）。
    - **双模式发信（Resend + 本地控制台兜底）**：集成 `resend` SDK；当 `.env` 配置了 `RESEND_API_KEY` 时，通过 Resend 发送包含工作区名称、邀请人信息与接受按钮的 HTML 邮件；未配置 Key（本地开发模式）时不报错阻塞，在 NestJS `Logger` 中醒目输出完整邀请 URL。
    - **站内闭环（无需邮件也能秒通）**：邀请成员弹窗支持「复制邀请链接」快捷操作；顶部导航栏新增站内通知收件箱，调用 BetterAuth 原生接口列出当前登录用户邮箱名下的所有 `pending` 邀请，支持一键接受或拒绝。
    - **通知类型可扩展**：`AppNotification` 采用联合类型（当前仅 `WORKSPACE_INVITATION`），通过 `type` 字段分发渲染对应卡片，后续新增业务通知零破坏。
  - **子任务拆解（8.1 – 8.6）：严格按序执行，每个任务完成并自检通过后再进入下一个**
    - **8A 邮件服务封装**
      - **8.1 环境变量与邮件服务封装（`apps/server`）**：`.env.example` 补充 `FRONTEND_URL="http://localhost:5173"`、`RESEND_API_KEY=""`、`EMAIL_FROM="Collab Board <onboarding@resend.dev>"`；安装 `resend` 包，封装 `MailService`（`sendWorkspaceInvitationEmail`），有 Key 时调用 Resend 发送双语/清晰排版邀请邮件，无 Key 时通过 NestJS `Logger` 打印格式化邀请链接；**验收**：`MailService` 单元测试覆盖「有 API Key 调用 Resend / 无 API Key 降级日志输出」。
      - **8.2 挂载 BetterAuth `sendInvitationEmail` 钩子（`apps/server`）**：在 BetterAuth 初始化配置中，为 `organization({ sendInvitationEmail: async (data) => ... })` 接入 `MailService`，传入 `email`、`inviter.user.name`、`organization.name` 与拼接好的 `` `${FRONTEND_URL}/accept-invitation/${data.id}` ``；**验收**：调用邀请接口后，控制台成功打印出带真实 `invitationId` 的邀请链接（配置 Key 后邮箱能收到邮件）。
    - **8B 邀请接受落地页**
      - **8.3 邀请接受落地页 `/accept-invitation/$invitationId`（`apps/web`）**：新增路由 `/accept-invitation/$invitationId`（补齐 `zh.json` 与 `en.json` 翻译 Key）；未登录用户提示需先登录/注册（跳转 `` `/login?redirect=/accept-invitation/${invitationId}` ``），已登录用户展示邀请信息卡片并提供「接受邀请 / 拒绝」按钮（分别调用 `authClient.organization.acceptInvitation` 与 `rejectInvitation`），接受成功后自动 `setActive({ organizationId })` 并跳转至该工作区首页；**验收**：双浏览器窗口测试——账号 A 发出邀请，账号 B 打开落地页点击接受，成功加入工作区并自动切换过去。
    - **8C 管理与通知**
      - **8.4 工作区设置页：待处理邀请列表与复制链接（`apps/web`）**：在工作区成员管理/邀请区域，通过 `authClient.organization.listInvitations()` 展示当前工作区已发出的 `pending` 邀请列表；为每条 `pending` 邀请提供「复制邀请链接」按钮（一键复制 `` `${window.location.origin}/accept-invitation/${inv.id}` `` 并提示已复制）和「撤销邀请」按钮（`cancelInvitation`）；**验收**：管理员发出邀请后可直接复制链接发给协作者，也能随时撤销未接受的邀请。
      - **8.5 顶部导航栏：可扩展的站内通知中心（`apps/web`）**：定义可扩展的 `AppNotification` 联合类型（当前包含 `WORKSPACE_INVITATION`，预留业务通知扩展位），封装 `useNotifications()` 聚合 Hook，将 `authClient.organization.listUserInvitations()` 的结果映射为统一通知项并计算未读总数；封装 `<NotificationCenter />`（基于 shadcn `Popover` + 未读红点角标）挂载到顶部导航栏，内部按 `notification.type` 分发渲染对应卡片，邀请卡片支持直接接受/拒绝并自动刷新；**验收**：账号 A 发送邀请后，账号 B 右上角铃铛实时显示未读角标并可一键接受加入；类型结构支持后续零破坏新增其他通知类型。
    - **8D 收尾**
      - **8.6 收尾自检**：依次运行 `pnpm test`、`pnpm typecheck`、`pnpm biome check --write .`、`pnpm build`；**验收**：四条命令全绿且零 Biome 报错。
  - **阶段八完成标准**：邮件邀请 / 链接邀请 / 站内铃铛通知三条路径全部打通，邀请接受后自动切换工作区并跳转；类型结构预留后续业务通知扩展位；全部测试、类型检查、规范与构建命令通过。

- **第九阶段（Phase 9）：任务指派与评论实时推送通知（User Room + 持久化收件箱）**
  - 任务被指派给他人、或任务下出现新评论时，通过用户私有房间实时推送通知，并写入持久化收件箱。
  - 顶部导航铃铛合并展示业务通知与工作区邀请，支持未读红点、一键已读与点击通知跳转任务详情抽屉。
  - **技术决策与前置约定**
    - **用户私有房间（User Room）**：在 `@repo/shared` 新增 `userRoomName(userId)`（`user:${userId}`）。在 `ProjectsGateway` 的 `handleConnection` 生命周期中，鉴权通过的用户自动 `client.join(userRoomName(user.id))`（无需前端额外发送 join 事件）。
    - **通知触发与防自扰规则**（`actorId === recipientId` 时严禁生成通知）：
      1. **任务指派（`TASK_ASSIGNED`）**：创建任务时指定了 `assigneeId`（且非创建人自己），或更新任务时 `assigneeId` 变更为新的非空用户时，向新指派人发送通知。
      2. **任务新评论（`COMMENT_ADDED`）**：某人在任务下发表评论时，向该任务的**创建人（`creatorId`）**和**当前指派人（`assigneeId`）**发送通知（去重后排除评论作者 `authorId` 本人）。
    - **单一通知表设计（`packages/db`）**：在 Prisma Schema 新增 `Notification` 模型，使用 `Json` 字段存储不同类型通知的结构化上下文，保持表结构简洁且易于未来扩展。
  - **子任务拆解（9.1 – 9.6）：严格按序执行，每个任务完成并自检通过后再进入下一个**
    - **9A 数据模型与共享契约**
      - **9.1 数据库模型并推送至 Neon（`packages/db`）**：在 `packages/db/prisma/schema.prisma` 新增 `NotificationType` 枚举（`TASK_ASSIGNED`, `COMMENT_ADDED`）与 `Notification` 模型：`id` (String, `@id @default(cuid())`)；`userId` (String, 关联 `User`，建立索引 `@@index([userId, readAt, createdAt])`)；`type` (`NotificationType`)；`payload` (`Json`，存储 `{ taskId, taskTitle, projectId, organizationId, actorName, commentSnippet? }`)；`readAt` (`DateTime?`，为 `null` 表示未读)；`createdAt` (`DateTime`, `@default(now())`)。执行 `pnpm --filter @repo/db db:push`（或 `migrate dev`）同步表结构至 Neon 并重新生成 Prisma Client；**验收**：Prisma Client 包含 `Notification` 模型及 `NotificationType` 枚举，`typecheck` 通过。
      - **9.2 共享通知契约与 Socket 推送事件（`packages/shared`）**：定义严格的 `NotificationPayload` Zod Schema（确保读写 `Json` 字段时的端到端类型安全）以及通知 DTO 类型；在 `socket-events.ts` 新增 `userRoomName(userId)` 辅助函数与服务端推送事件 `NOTIFICATION_RECEIVED`（载荷为单条 `NotificationDto`），补齐 `SOCKET_EVENTS`、`socketPayloadSchemas` 与双端事件类型；单测覆盖合法载荷与缺字段拒绝；**验收**：`pnpm --filter @repo/shared test` 通过，`typecheck` 无 `any`。
    - **9B 后端通知模块与业务触发**
      - **9.3 NotificationsModule 与 Socket 推送（`apps/server`）**：扩展 `EventsService` 新增 `emitToUser(userId, event, payload)`（校验载荷后向 `user:${userId}` 广播）；在 `ProjectsGateway` 的 `handleConnection` 中自动将已鉴权 Socket 加入其 `userRoomName`；新增 `NotificationsModule`（`NotificationsService` + `NotificationsController`，受 `AuthGuard` 保护）：`GET /notifications` 返回最近 30 条当前用户通知（按 `createdAt desc` 排序）及未读总数，`PATCH /notifications/:id/read` 标记单条通知为已读（校验归属权），`POST /notifications/read-all` 一键将当前用户所有未读通知标为已读，并提供内部方法 `createAndPush({ userId, type, payload })` 写库后立即调用 `eventsService.emitToUser` 实时推送；**验收**：`NotificationsService` 单元测试覆盖「写库并触发 Socket 推送、标记已读、越权操作拒绝」。
      - **9.4 业务触发接入（`TasksService` & `CommentsService`）**：在 `TasksService`（`create` 与 `update` 分派人变更时）和 `CommentsService`（`create` 时）注入 `NotificationsService`；严格执行防自扰（排除操作者本人）与接收人去重（同一人既是创建人又是指派人时只发一条）；查询补齐 `organizationId`、`taskTitle` 与 `actorName` 后调用 `createAndPush`；**验收**：单元测试断言「指派他人触发通知、指派自己不触发、评论者同时为指派人时不重复通知」。
    - **9C 前端实时通知**
      - **9.5 实时接收与通知中心联动（`apps/web`）**：在全局 Socket 连接管理（或受保护根布局 Hook）中监听 `NOTIFICATION_RECEIVED`（经共享 Schema `parse` 校验），收到新通知时立即更新 `TanStack Query` 的通知列表缓存（或 `invalidateQueries`）并联动右上角铃铛未读红点；扩展第八阶段的 `useNotifications()` 聚合 Hook，将 `GET /notifications` 的持久化业务通知与 BetterAuth 待处理工作区邀请合并、按时间倒序展示，并提供顶部「全部已读 / Mark all as read」按钮（补齐 `zh.json` 与 `en.json` 文案）；点击 `TASK_ASSIGNED` / `COMMENT_ADDED` 卡片时先调用标记已读接口，再跳转至对应工作区与项目路由，并调用 `Zustand` 的 `setActiveTaskId(taskId)` 自动弹出任务详情抽屉；**验收**：双浏览器窗口实测——A 指派任务给 B 或在 B 的任务下评论，B 无需刷新即亮起未读红点，点击通知自动跳进对应项目并打开任务详情抽屉，红点消退。
    - **9D 收尾**
      - **9.6 收尾自检**：依次运行 `pnpm test`、`pnpm typecheck`、`pnpm biome check --write .`、`pnpm build`；**验收**：四条命令全绿且零 Biome 报错。
  - **阶段九完成标准**：任务指派与新评论可实时推送到接收人，铃铛未读角标即时更新，点击通知可标记已读并跳转打开对应任务抽屉；业务通知与工作区邀请在同一收件箱合并展示并按时间倒序；全部测试、类型检查、规范与构建命令通过。

- **第十阶段（Phase 10）：首页升级为个人工作台（Workspace Dashboard）**
  - 将登录后的占位首页重构为个人工作台；未登录访问 `/` 展示产品欢迎页。
  - 工作台聚合当前工作区的统计概览、我的任务、项目进度与最近动态，并展示任务状态分布与近 7 天趋势图表。
  - **技术决策与前置约定**
    - **入口路由**：`/` 为公开入口，`beforeLoad` 仅读取 session（不挂 `_app`）；已登录重定向至 `/_app/dashboard`，`/home` 重定向至 `/dashboard`。
    - **工作区来源**：`GET /dashboard` 不接收 `:organizationId`，统一取自 `session.activeOrganizationId`；无 activeOrganization 时返回 `400`。
    - **统计口径（互不重叠，均限当前登录用户在当前工作区）**：`assignedCount` = `BACKLOG` + `TODO`；`inProgressCount` = `IN_PROGRESS`；`overdueCount` = `dueDate < now` 且状态非 `DONE`/`CANCELED`；`completedCount` = `DONE`。
    - **图表组件归属**：`recharts` 由 `packages/ui` 声明依赖，图表组件位于 `packages/ui/src/components/chart.tsx`；`--chart-1` ~ `--chart-5` 变量在 `apps/web/src/index.css` 与 `packages/ui` 的 Tailwind 预设中定义。
    - **完成时间基准**：`Task` 新增 `completedAt DateTime?` 作为「每日完成数」的唯一来源；按天分桶统一使用 `Asia/Shanghai`。
  - **子任务拆解（10.1 – 10.8）：严格按序执行，每个任务完成并自检通过后再进入下一个**
    - **10A 路由与后端聚合**
      - **10.1 路由分流（`apps/web`）**：`src/routes/index.tsx` 改为公开入口——未登录渲染精简欢迎页（「开始使用」→ `/register`、「登录」→ `/login`），已登录 `redirect` 至 `/dashboard`；新增 `src/routes/_app/dashboard.tsx`；`src/routes/_app/home.tsx` 改为 `redirect({ to: "/dashboard" })`；**验收**：匿名访问 `/` 见欢迎页且两个按钮跳转正确，已登录访问 `/` 直达工作台，访问 `/home` 自动重定向至 `/dashboard`。
      - **10.2 Dashboard 聚合接口（`apps/server`）**：新增 `DashboardModule`（`DashboardService` + `DashboardController`，`@UseGuards(AuthGuard, OrganizationGuard)`），`GET /dashboard` 单次返回：`stats`（四项口径见上）；`myTasks`（指派给当前用户且状态非 `DONE`/`CANCELED`，`orderBy: [{ priority: "desc" }, { dueDate: "asc", nulls: "last" }]`，附带 `project: { id, name, key }`，上限 20 条）；`projects`（项目列表 + 任务总数/已完成数，使用 `_count` 或分组聚合避免 N+1）；DTO 与校验规则统一定义在 `packages/shared`；**验收**：`DashboardService` 单测覆盖四项统计口径、排序、空工作区与无 activeOrganization 场景。
    - **10B 前端工作台**
      - **10.3 工作台 UI（`apps/web`）**：新增 `src/lib/api/dashboard.ts` 与 `queryKeys.dashboard`；将 `src/components/home-page.tsx` 重写为工作台并彻底移除静态占位代码，补齐 `zh.json` 与 `en.json` 的工作台翻译 Key：顶部欢迎区展示问候语、当前工作区徽标、「新建项目」与「打开命令面板（⌘K）」（「新建任务」先选择项目再跳转对应看板创建）；指标概览区为 4 列响应式卡片（待处理、进行中、逾期、已完成），使用图标与数字高亮；双栏主体区（左 2/3 + 右 1/3）左侧「我的任务」展示项目 Key 徽标、优先级图标、任务标题、状态 Badge 与截止日期，点击跳转对应项目并调用 `setActiveTaskId` 打开任务抽屉，右侧「项目列表」以完成度进度条展示并可点击进入看板，下方复用 `useNotifications()` 展示最近 5 条动态；使用 `motion` 添加卡片入场微交互；**验收**：四项指标与接口一致，点击我的任务准确跳转并自动打开抽屉，中英文文案完整，`pnpm --filter @repo/web typecheck` 通过。
      - **10.4 实时刷新（`apps/web`）**：在既有 socket 事件处理（`TASK_CREATED` / `TASK_UPDATED` / `TASK_MOVED` / `TASK_DELETED` / `COMMENT_ADDED`）中同步 `invalidateQueries` 工作台查询键，使指标、我的任务、项目进度与图表随协作实时更新；**验收**：双浏览器窗口下 A 创建/移动/删除任务或发表评论，B 的工作台无需刷新即更新。
    - **10C 数据可视化**
      - **10.5 图表组件与主题变量（`packages/ui` & `apps/web`）**：在 `packages/ui` 新增 `src/components/chart.tsx`（shadcn chart 源码）并在 `packages/ui/package.json` 声明 `recharts` 依赖；在 `apps/web/src/index.css` 与 `packages/ui` 的 Tailwind 预设中补齐 `--chart-1` ~ `--chart-5` 明暗主题变量；从 `packages/ui/src/index.ts` 导出 Chart 组件；**验收**：`pnpm --filter @repo/ui typecheck` 通过，明暗主题下变量均生效。
      - **10.6 完成时间与图表数据（`packages/db` & `apps/server`）**：`packages/db/prisma/schema.prisma` 为 `Task` 新增 `completedAt DateTime?`，执行 `pnpm --filter @repo/db db:push` 同步并重新生成 Prisma Client；`TasksService` 在状态流转到 `DONE` 时写入 `completedAt`、离开 `DONE` 时清空；`GET /dashboard` 增加 `statusDistribution`（`prisma.task.groupBy({ by: ['status'], _count: true })`）与 `weeklyTrend: Array<{ date: string; created: number; completed: number }>`（近 7 天按天分桶，使用 `$queryRaw` 或取出后在 JS 聚合，边界按 `Asia/Shanghai` 计算）；`completed` 以 `completedAt` 为准，存量数据以 `updatedAt` 近似回填并在注释说明；**验收**：单测覆盖 `DONE` 写入与离开清空、7 天分桶边界与空工作区。
      - **10.7 图表渲染（`apps/web`）**：左右双列响应式布局渲染两个图表——任务状态分布环形图（圆环中心显示工作区总任务数，悬停展示本地化状态名称与数量占比）与近 7 天任务趋势柱状图（对比每日新增与已完成，X 轴随中英文日期格式自适应）；总任务数为 0 时展示空状态引导卡片；**验收**：中英文与明暗主题下图表与 Tooltip 正常，空工作区不出现空坐标系。
    - **10D 收尾**
      - **10.8 收尾自检**：依次运行 `pnpm test`、`pnpm typecheck`、`pnpm biome check --write .`、`pnpm build`；**验收**：四条命令全绿且零 Biome 报错。
  - **阶段十完成标准**：未登录访问 `/` 展示欢迎页，已登录访问 `/` 直达个人工作台；工作台指标、我的任务、项目进度、最近动态与两个图表均由 `GET /dashboard` 驱动，并在协作事件下实时刷新；点击我的任务可跳转对应项目并自动打开任务详情抽屉；全部测试、类型检查、规范与构建命令通过。

- **第十一阶段（Phase 11）：Redis 缓存、BullMQ 消息队列与 Socket.io 横向扩展**
  - 为工作台聚合接口增加 Redis 旁路缓存，将工作区邀请邮件改为 BullMQ 异步消费，并通过 Redis Adapter 让 Socket.io 支持多实例广播。
  - 所有 Redis 能力均可缺省：未配置 `REDIS_URL` 时应用照常启动，缓存旁路、邮件直发、Socket.io 使用内存适配器。
  - **技术决策与前置约定**
    - **Serverless Redis 接入（Upstash 兼容）**：统一使用 `ioredis` 连接 `REDIS_URL`（支持 `rediss://` TLS 连接，兼容 Upstash 云端 Redis 与本地 Redis）。**连接职责分离**：缓存客户端设置 `maxRetriesPerRequest: 1` 与 `enableOfflineQueue: false`，确保 Redis 不可用时立即降级而不是挂起请求；BullMQ 专用连接必须设置 `maxRetriesPerRequest: null`；Socket.io 的 pub / sub 使用两个独立客户端，不能与缓存或队列复用同一实例。
    - **优雅降级原则**：`.env` 未配置（空字符串）`REDIS_URL` 时，`RedisModule` 不建立连接、`MailQueueModule` 不注册（避免 BullMQ 强制连库导致启动失败）、Socket.io 保留默认内存适配器；缓存读写异常只记录日志并回源数据库，绝不影响业务请求。
    - **核心三大落地场景**：
      1. **Cache-Aside（旁路缓存）**：按「工作区 + 用户」缓存工作台聚合结果（`dashboard:{organizationId}:v{version}:{userId}`，TTL 60 秒）；任务 / 项目写操作通过递增工作区版本号批量失效，禁止使用 `SCAN` 或通配 `DEL`。
      2. **BullMQ 异步任务队列**：将工作区邀请邮件发送拆分为 Producer（入队）与 Consumer（后台 Worker 消费 + 指数退避重试 3 次）。
      3. **Socket.io Redis Adapter**：使用 `@socket.io/redis-adapter` 打通多实例房间广播与跨实例在线成员聚合。
  - **子任务拆解（11.1 – 11.6）：严格按序执行，每个任务完成并自检通过后再进入下一个**
    - **11A Redis 基础设施**
      - **11.1 Redis 基础设施与全局模块（`apps/server`）**：安装 `ioredis`、`@nestjs/bullmq@^12`（兼容当前 Nest 12）、`bullmq@^6`、`@socket.io/redis-adapter`；`.env.example` 增加 `REDIS_URL=""`（留空即关闭全部 Redis 能力，并附 Upstash `rediss://` 示例注释）；新增全局 `RedisModule` 与 `RedisService`：仅在 `REDIS_URL` 非空时创建客户端，封装类型安全的 `getJson<T>(key)`、`setJson<T>(key, value, ttlSeconds)`、`del(key)`、`incr(key)`，`JSON.parse` 失败时删除脏键并返回 `null`，所有 Redis 异常记录日志后向上返回降级结果，并在 `onModuleDestroy` 中优雅关闭连接。**验收**：`RedisService` 单元测试（mock `ioredis`，不依赖真实 Redis）覆盖序列化读写、TTL、脏数据清理、Redis 异常降级与无 `REDIS_URL` 时的安全空实现。
    - **11B 工作台缓存**
      - **11.2 工作台统计接口接入 Redis 旁路缓存（`apps/server`）**：在 `DashboardService.getDashboard(organizationId, userId)`（`apps/server/src/dashboard/dashboard.service.ts`）中接入 `RedisService`：缓存键为 `dashboard:{organizationId}:v{version}:{userId}`，其中 `version` 读取 `dashboard:ver:{organizationId}`（不存在视为 `0`），TTL 60 秒；命中直接返回，未命中查询 Prisma 后写缓存；在 `TasksService` 的 `create`、`update`、`move`、`delete` 与 `ProjectsService` 的项目创建 / 更新 / 删除成功后调用 `incr("dashboard:ver:{organizationId}")` 使该工作区所有用户缓存立即失效（覆盖指标、我的任务、项目进度与图表），避免数据延迟。**验收**：单元测试验证「首次请求查库并写缓存、二次请求命中缓存不查库、任务或项目变更后版本号递增导致缓存失效、Redis 不可用时回源数据库且请求成功」。
    - **11C 异步队列与横向扩展**
      - **11.3 BullMQ 异步邮件队列（`apps/server`）**：在 `AppModule` 中仅当 `REDIS_URL` 非空时注册 `BullModule.forRootAsync`（`maxRetriesPerRequest: null`）与 `MailQueueModule`；注册 `mail` 队列，定义严格类型的任务载荷 `SendInvitationJobData`，默认重试策略 `attempts: 3`、`backoff: { type: "exponential", delay: 2000 }`；新增 `MailProcessor`（`@Processor("mail")`）调用 `MailService.sendWorkspaceInvitationEmail`，失败时抛错触发重试，并在日志中打印 Job ID、`job.attemptsMade` 与执行结果。**注意 DI 边界**：`apps/server/src/auth/auth.ts` 在模块加载时直接构造 `MailService`（不在 Nest 容器内），因此改造 `sendInvitationEmail` 钩子时使用不依赖 DI 的 `MailQueueProducer` 单例（惰性创建 BullMQ `Queue`，与 Worker 共用同一连接工厂）；未配置 `REDIS_URL` 时 Producer 直接调用 `MailService`，保持现有行为；Producer 需暴露 `close()` 并由 `MailQueueModule` 的关闭钩子调用，避免进程退出时连接悬挂。邮件为「至少一次」投递，重复发送可接受，如后续需要严格幂等再引入 Job 去重键。**验收**：`MailProcessor` 单元测试验证正常消费与失败抛错重试；Producer 在无 `REDIS_URL` 时直发；本地联调可见入队 / 消费日志。
      - **11.4 Socket.io 接入 Redis Pub/Sub 适配器（`apps/server`）**：创建 `RedisIoAdapter`（继承 `@nestjs/platform-socket.io` 的 `IoAdapter`）：存在 `REDIS_URL` 时创建独立 `pubClient` 与 `subClient`（`ioredis`）并 `createAdapter(pubClient, subClient)`，为两个客户端绑定 `error` 日志，关闭应用时统一 `quit()`；否则沿用默认内存适配器。在 `apps/server/src/main.ts` 的 `app.listen` 之前调用 `app.useWebSocketAdapter(redisIoAdapter)`。**注意**：多实例下 Phase 7 的 `fetchSockets()` 在线成员聚合会返回全部实例的 Socket，需复测按 `userId` 去重。**验收**：启动日志确认适配器初始化结果；两个后端实例下看板拖拽、通知推送与在线成员列表均一致。
    - **11D 联调与收尾**
      - **11.5 Upstash 控制台与端到端验证**：在 `.env` 填入 Upstash 的 `REDIS_URL` 后重启后端：连续刷新两次工作台首页，确认第二次命中 Redis 缓存；发出一次工作区邀请，观察 BullMQ 入队 / 消费日志，并在 Upstash Data Browser 中看到 `dashboard:*` 缓存键与 `bull:mail:*` 队列键；临时清空 `REDIS_URL` 重启，确认应用正常启动且业务零回归。**注意**：BullMQ Worker 的阻塞轮询会持续消耗 Upstash 免费额度，日常开发优先使用本地 Redis，云端仅用于部署验证。**验收**：键结构清晰可见，四条核心链路（缓存、邮件、通知、看板）零回归。
      - **11.6 收尾自检**：依次运行 `pnpm test`、`pnpm typecheck`、`pnpm biome check --write .`、`pnpm build`。**验收**：四条命令全绿且零 Biome 报错。
  - **阶段十一完成标准**：配置 `REDIS_URL` 时工作台二次请求命中缓存且任务 / 项目变更后立即失效，邀请邮件经 BullMQ 异步投递并支持重试，Socket.io 多实例广播与在线成员一致；未配置 `REDIS_URL` 时应用可正常启动且业务零回归；全部测试、类型检查、规范与构建命令通过。

- **第十二阶段（Phase 12）：全栈数据埋点 SDK 与产品行为分析看板**
  - 前端自定义轻量级埋点 SDK 攒批上报，NestJS 接收后经 BullMQ `analytics` 队列削峰批量写入 Neon，并在工作台侧提供产品行为分析看板。复用第十一阶段的 Redis / BullMQ 基础设施，未配置 `REDIS_URL` 时降级为同步批量入库。
  - **前置技术约定**
    - **全链路架构**：前端自定义轻量级埋点 SDK（内存攒批 + 定时冲洗 + `sendBeacon` 页面卸载兜底） -> NestJS 接收接口（`202 Accepted` 异步入队） -> **BullMQ `analytics` 队列削峰** -> Worker 批量写入 Neon（`prisma.analyticsEvent.createMany`） -> 工作台分析图表展示。
    - **隐私与数据规范**：事件统一包含 `eventName`（强类型枚举）、`properties`（结构化 JSON）、`sessionId`（前端生成的单次会话 UUID）、`userId`（可选，从服务端 Session 自动提取，绝不信任前端伪造）、`organizationId`、`path`、`clientTimestamp`。
    - **降级兼容**：若未配置 `REDIS_URL`，接收接口直接降级调用 `prisma.analyticsEvent.createMany` 批量入库。
  - **子任务拆解（12.1 – 12.6）：严格按序执行，每个任务完成并自检通过后再进入下一个**
    - **12.1 数据库模型与共享事件契约（`packages/db` & `packages/shared`）**
      - 在 `packages/db/prisma/schema.prisma` 新增 `AnalyticsEvent` 模型：
        - `id` (String, `@id @default(cuid())`)
        - `eventName` (String，建立索引 `@@index([organizationId, eventName, createdAt])`)
        - `userId` (String?)
        - `organizationId` (String?)
        - `sessionId` (String)
        - `path` (String)
        - `properties` (`Json?`)
        - `clientTimestamp` (`DateTime`，客户端事件发生时间，由上报载荷带入，与服务端 `createdAt` 区分)
        - `createdAt` (`DateTime`, `@default(now())`)
      - 推送 Schema 至 Neon（`db:push`）并生成 Prisma Client。
      - 在 `@repo/shared` 定义强类型事件枚举（如 `PAGE_VIEW`、`TASK_CREATED`、`TASK_DRAGGED`、`VIEW_SWITCHED`、`COMMAND_PALETTE_OPENED`、`AVATAR_UPLOADED`）及批量上报 Zod Schema（`batchTrackSchema`：单条事件必填 `eventName` / `sessionId` / `path` / `clientTimestamp`，`properties` / `organizationId` 可选；单批限制 `1 ~ 50` 条），补充 Vitest 单元测试。
      - **验收**：`pnpm --filter @repo/shared test` 通过，`typecheck` 无 `any`。
    - **12.2 后端埋点采集接口与 BullMQ 批量消费（`apps/server`）**
      - 新增 `AnalyticsModule`：
        - 注册 BullMQ `analytics` 队列与 `AnalyticsProcessor` 消费者：取出事件批次后，使用 `prisma.analyticsEvent.createMany` 一次性批量写入数据库。
        - 实现 `POST /analytics/batch` 接口（允许匿名或已登录调用，若存在有效 BetterAuth 会话则自动注入 `userId`，否则置为 `null`）：校验载荷后推入 `analytics` 队列并立即返回 `{ accepted: true, count }`（HTTP 202）。
        - 实现 `GET /workspaces/:organizationId/analytics`（受 `AuthGuard` 与 `OrganizationGuard` 保护）：聚合返回近 7 天事件趋势、热门功能触发排行（Top Events）及独立活跃用户数（DAU）。
      - **验收**：`AnalyticsProcessor` 单元测试验证 `createMany` 批量调用；压测或单次发送 10 条事件，接口毫秒级返回 202 且数据库成功落库 10 条记录。
    - **12.3 前端轻量级埋点 SDK 封装（`apps/web`）**
      - 在 `apps/web/src/lib/tracker.ts` 实现单例 `tracker`：
        - `track(eventName, properties)`：将事件推入内存缓冲区（附带当前路由 `path`、自动生成的 `sessionId`、当前 `activeOrganizationId`、`clientTimestamp`）。
        - **自动冲洗机制（Flush）**：缓冲区达到 **10 条** 或距离上次发送超过 **5000ms** 时，自动异步发送批量请求（失败时将事件重新放回队列头部重试一次，防止死循环）。
        - **页面离开兜底**：监听 `document.visibilitychange`（当状态变为 `hidden` 时），使用 `navigator.sendBeacon`（配合 `Blob(..., { type: 'application/json' })`）立即发送剩余缓冲区事件。
      - **验收**：为 `tracker.ts` 编写 Vitest 单元测试（使用 `vi.useFakeTimers()` 测试“满 10 条立即触发”、“5 秒定时触发”以及“失败放回队列”逻辑）。
    - **12.4 核心业务埋点接入（`apps/web`）**
      - 在关键交互位置埋入 `tracker.track(...)`（补齐 `zh.json` & `en.json` 事件展示名称）：
        1. **路由浏览（`PAGE_VIEW`）**：监听 TanStack Router 路由变化自动上报。
        2. **核心业务动作**：创建任务（`TASK_CREATED`）、看板拖拽移动任务（`TASK_DRAGGED`，携带 `fromStatus`、`toStatus`）、切换看板/列表视图（`VIEW_SWITCHED`）、按下 `Cmd+K` 打开命令面板（`COMMAND_PALETTE_OPENED`）。
      - **验收**：在页面上进行一系列操作后，观察浏览器 Network 面板，确认请求是按批次合并发送而非每次点击发一次。
    - **12.5 工作台或独立路由：产品行为分析看板（`apps/web`）**
      - 新增 `/analytics` 页面（或在工作台新增「数据洞察 / Analytics」Tab，并在侧边栏添加导航入口），复用第十阶段沉淀的 `shadcn/ui Chart`（Recharts）组件展示：
        1. **独立活跃用户（DAU）与总事件数卡片**。
        2. **功能使用热度横向柱状图（Feature Usage）**：直观对比看板拖拽、命令面板、视图切换等功能的真实使用频次。
        3. **近 7 天用户交互趋势折线图**。
      - **验收**：在看板拖拽几次、按几次 `Cmd+K` 后刷新分析页面，图表数据真实反映刚才的操作记录。
    - **12.6 收尾自检**
      - 依次运行 `pnpm test`、`pnpm typecheck`、`pnpm biome check --write .`、`pnpm build`。
      - **验收**：四条命令全绿且零 Biome 报错。
  - **阶段十二完成标准**：事件经前端 SDK 攒批上报、后端 BullMQ 批量入库（无 `REDIS_URL` 时降级同步入库），`AnalyticsEvent` 表结构与 `@repo/shared` 契约一致且含 `clientTimestamp`；分析看板的 DAU、功能热度与 7 天趋势数据真实反映用户操作；全部测试、类型检查、规范与构建命令通过。

- **第十三阶段（Phase 13）：账户安全闭环（邮箱验证、修改密码与重置密码）**
  - **前置技术约定**
    - **复用异步邮件队列（`MailQueueProducer`）**：所有新增认证邮件（邮箱验证、重置密码）必须通过第十一阶段（11.3）建立的 `MailQueueProducer` 单例异步入队发送；未配置 `REDIS_URL` 时自动降级为 `MailService` 直发，并在日志中打印完整回调链接，方便本地单机联调。
    - **BetterAuth 原生能力复用**：严禁手写自定义 Token 表或加解密逻辑，统一使用 BetterAuth 内置的 `emailVerification`、`sendResetPassword`、`changePassword` 与 `resetPassword`。
    - **邮箱验证强制生效**：开启 `emailAndPassword.requireEmailVerification`，未验证邮箱的账号不允许登录；**不考虑历史账号兼容**（存量账号需完成验证，或改用 GitHub 登录）。
    - **GitHub OAuth**：通过 BetterAuth 原生 `socialProviders.github` 接入 GitHub 登录，凭据来自环境变量 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`，禁止硬编码。
    - **多语言对齐**：所有新增页面、提示横幅、表单校验错误与邮件主题均需同步补齐 `zh.json` 与 `en.json`（两文件 key 必须一致，`resources.test.ts` 会校验）。
  - **子任务拆解（13.1 – 13.9）：严格按序执行，每个任务完成并自检通过后再进入下一个（先落地 GitHub 登录，再完成邮箱验证与密码闭环）**
    - **13.1 后端启用 GitHub OAuth（`apps/server`）**
      - 在 `apps/server/src/auth/auth.ts` 的 `socialProviders` 中启用 `github: { clientId, clientSecret }`，凭据从 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` 读取，缺失时启动即明确报错。
      - 确认 GitHub OAuth App 回调地址为 `${API_URL}/api/auth/callback/github`（本地默认 `http://localhost:3000/api/auth/callback/github`）；`.env` 与 `.env.example` 已包含对应变量。
      - **验收**：服务启动无缺失凭据报错，GitHub 授权回调链路可用。
    - **13.2 前端：登录/注册页 GitHub 登录（`apps/web`）**
      - 在 `/login` 与 `/register` 表单下方新增「使用 GitHub 继续 / Continue with GitHub」按钮，点击调用 `authClient.signIn.social({ provider: "github", callbackURL: `${window.location.origin}/home` })`。
      - 补充按钮文案与失败提示到 `zh.json` / `en.json`（两文件 key 保持一致）。
      - **验收**：点击按钮跳转 GitHub 授权页，授权后回跳 `/home` 并处于登录状态。
    - **13.3 扩展异步邮件队列类型（`apps/server`）**
      - 扩展 `MailService` 与 `MailQueueProducer` / `MailProcessor`，新增两个标准化发信方法与队列 Job 类型：
        1. `sendVerificationEmail({ email, userName, url })`
        2. `sendResetPasswordEmail({ email, userName, url })`
      - 确保在无 `REDIS_URL` 时降级通过 NestJS `Logger` 醒目打印对应链接。
      - **验收**：`MailProcessor` 单元测试覆盖新增两种邮件 Job 的正常消费与降级打印。

    - **13.4 后端启用邮箱验证与密码重置钩子（`apps/server`）**
      - 在 `apps/server/src/auth/auth.ts` 中完善配置：
        - `emailAndPassword` 设为 `{ enabled: true, requireEmailVerification: true, sendResetPassword: async ({ user, url }) => ... }`，把 BetterAuth 生成的 `url` **原样入队发送**——该链接已含一次性 `token` 与回调地址，禁止自行拼接或改写。
        - 新增顶层配置 `emailVerification: { sendOnSignUp: true, autoSignInAfterVerification: true, sendVerificationEmail: async ({ user, url }) => ... }`，同样将 `url` 原样入队。
        - 移除现有 `databaseHooks.user.create.before` 中强制写入 `emailVerified: true` 的逻辑，否则邮箱永远不会处于未验证状态。
        - 前端落地页由 `requestPasswordReset({ redirectTo })` / `sendVerificationEmail({ callbackURL })` 决定，不在该钩子里硬编码。
      - **验收**：注册新用户或请求重置密码时，`mail` 队列出现对应 Job，日志/邮件中输出带有效 `token` 的回调链接；未验证邮箱的密码登录被拒绝。

    - **13.5 共享表单校验 Schema（`packages/shared`）**
      - 抽取可复用的 `passwordSchema`（`min 8`、`max 128`），供现有 `signUpSchema` 与新 Schema 共用，避免密码规则漂移。
      - 新增密码安全校验 Schema：
        - `changePasswordSchema`（`currentPassword`、`newPassword` 复用 `passwordSchema`、`confirmPassword` 两次输入一致校验、`revokeOtherSessions: boolean`）。
        - `forgotPasswordSchema`（`email`）与 `resetPasswordSchema`（`newPassword` 复用 `passwordSchema`、`confirmPassword` 一致校验）。
      - 补充边界值 Vitest 单元测试（长度上下限、两次输入不一致）。
      - **验收**：`pnpm --filter @repo/shared test` 通过，`typecheck` 无 `any`。

    - **13.6 前端：未验证邮箱提醒与验证结果（`apps/web`）**
      - 在受保护布局（`apps/web/src/routes/_app.tsx`）顶部条件渲染 `<EmailVerificationBanner />`：当 `session.user.emailVerified === false` 时显示柔和提醒条，提供「重新发送验证邮件（Resend）」按钮（调用 `authClient.sendVerificationEmail({ email, callbackURL })`，带 60 秒倒计时防连点）。
      - 验证链接的 `callbackURL` 指向受保护首页（如 `${FRONTEND_URL}/home`）；BetterAuth 校验成功并自动登录后回到该页，前端检测到 `emailVerified` 变为 `true` 时隐藏横幅并弹出「邮箱验证成功」Toast（无需单独的 `/verify-email` 页面）。
      - **验收**：新注册账号登录后顶部出现未验证提醒横幅，点击验证链接后横幅自动消失且 `emailVerified` 变为 `true`。

    - **13.7 前端：忘记密码与重置密码页面（`apps/web`）**
      - 在 `/login` 页面密码输入框旁添加「忘记密码？ / Forgot password?」链接，跳转至 `/forgot-password`。
      - 开发 `/forgot-password` 公开路由：输入邮箱调用 `authClient.requestPasswordReset({ email, redirectTo: \`${window.location.origin}/reset-password\` })`，提交后展示「若该邮箱已注册，我们已发送重置链接」的统一提示（防邮箱枚举攻击，无论邮箱是否存在都不泄露账号状态）。
      - 开发 `/reset-password` 公开路由：从 URL Search Params 读取 `token`（缺失或过期时提示错误引导重新申请），使用 React Hook Form + `resetPasswordSchema` 调用 `authClient.resetPassword({ newPassword, token })`，成功后自动跳转 `/login`。
      - **验收**：完整走通“点击忘记密码 -> 从控制台/邮箱打开重置链接 -> 设置新密码 -> 使用新密码登录成功”。

    - **13.8 前端：个人设置页接入修改密码（`apps/web`）**
      - 在 `/settings/profile` 页面下方新增「账户安全 / Security」卡片（或拆分为「个人资料 / Profile」与「安全设置 / Security」双 Tab），集成 React Hook Form + `changePasswordSchema`。
      - 提交时调用 `authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions })`，提供当前密码错误等友好国际化提示，修改成功后清空表单。
      - **验收**：输入错误旧密码报错提示准确，输入正确旧密码可成功修改密码。

    - **13.9 收尾自检**
      - 依次运行 `pnpm test`、`pnpm typecheck`、`pnpm biome check --write .`、`pnpm build`。
      - **验收**：四条命令全绿且零 Biome 报错。
  - **阶段十三完成标准**：邮箱验证与重置/修改密码全流程可用，GitHub OAuth 可完成注册与登录；认证邮件统一经 `MailQueueProducer` 异步入队（无 `REDIS_URL` 时直发）；未验证邮箱的密码账号无法登录；新增页面、提示与校验错误中英双语文案一致；全部测试、类型检查、规范与构建命令通过。

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
