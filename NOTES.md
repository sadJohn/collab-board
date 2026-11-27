# Collab Board — Implementation Notes

> 只记录**实现过程中真正踩过的坑**、反复试错后才得出的结论、以及未来 Phase 必须遵守的约定。
> 每条写清楚：**问题是什么 → 最初以为该怎么做（错的方式）→ 后来发现应该怎么做 → 相关文件**。

---

## Phase 7 — Presence + Command Palette

### 7-A. Gateway 聚合 presence 时，别用 `?? ""` 兜底 name/email

- **问题**：`broadcastRoomPresence` 里把 `u.name ?? ""` 写进聚合，再交给 `roomPresenceUpdatedPayloadSchema.parse`。Schema 对 name/email 有 `min(1)`，空串一进来直接 ZodError。
- **最初的误判**：以为 schema 是"对外契约"、Gateway 是"数据清洗层"，可以在 Gateway 里把缺字段的 user 用空串填满再 parse。
- **正确做法**：Gateway 在聚合阶段就跳过缺 `id / name / email` 的 socket 行。schema 只做最终防线，不做数据清洗工具；auth session 本来就保证这些字段存在，防御性过滤是兜底而不是常态。
- **相关文件**：`apps/server/src/events/projects.gateway.ts` 的两处 `broadcastRoomPresence` / `handleGetRoomPresence` 聚合循环。

### 7-B. Socket.IO 同一用户多标签页 → 必须按 userId 去重

- **问题**：`fetchSockets()` 返回的是所有连接，Alice 开两个标签页就会出现两条完全相同的 presence 记录。
- **最初的误判**：以为 presence 广播是"每次 join/leave 触发一次全量快照"，不需要在 Gateway 里再做集合运算。
- **正确做法**：在聚合时维护 `Set<string>`（已出现过的 userId），同一 userId 只取第一条。广播端幂等写入，客户端永远只收到去重后的快照。服务端不能假设"客户端按钮禁用"或"用户不会多标签"来代替集合约束。
- **相关文件**：同上；对应经验根因描述（Experience ID `100009558`）。

### 7-C. `disconnecting` 事件比 `disconnect` 更适合 presence

- **问题**：`disconnect` 触发时 socket 已经离开了所有房间，`socket.rooms` 为空，拿不到"从哪些项目房间出去"。
- **最初的误判**：准备在 `disconnect` 里用 `server.sockets.adapter.rooms` 反向查。
- **正确做法**：在 `afterInit` 里给每个 connection 注册 `socket.on("disconnecting", cb)`。这个事件在 socket 离开房间**之前**触发，`socket.rooms` 还完整。遍历 `socket.rooms` 里以 `project:` 开头的条目，对每个项目房间分别广播 presence。
- **相关文件**：`projects.gateway.ts` 的 `server.on("connection", ...)` 块。

### 7-D. 客户端 presence 不走 Zustand

- **问题**：`useProjectPresence` 第一次实现时犹豫要不要和 tasks/projects 一样走 React Query 或 Zustand。
- **最初的误判**：觉得 Zustand 是"全局状态中心"，应该把所有东西都放进去。
- **正确做法**：presence 完全是 server-push、没有 optimistic update、只在单个项目路由内有意义、数据量极小（团队人数）。用本地 `useState` 维护就够了。严格遵守 `PROJECT_SPEC.md` 里的"Zustand 只放 UI 临时态 / 命令式触发器，不放服务端异步数据"。
- **相关文件**：`apps/web/src/hooks/use-project-presence.ts`、`apps/web/src/stores/ui-store.ts`。

### 7-E. Socket 事件方向要拆成两个常量，不要靠 payload 里的 type 区分

- **问题**：Socket.IO 里如果上行和下行共用同一个事件名（比如 `presence`），payload 里再放 `direction: "request" | "broadcast"`，客户端很容易把请求回显也当成广播处理。
- **最初的误判**：想着省几个常量，统一用 `presence` + payload type。
- **正确做法**：上行（客户端请求）和下行（服务端广播）用不同的事件常量。7.1 里就是 `GET_ROOM_PRESENCE`（请求，带 ack）和 `ROOM_PRESENCE_UPDATED`（广播，无 ack）。协议级分开，payload 自然也各管各的。
- **相关文件**：`packages/shared/src/socket-events.ts` 的 `SOCKET_EVENTS` map。

### 7-F. `@radix-ui/react-tooltip` 需要全局 Provider

- **问题**：`<Tooltip>` 单独用是渲染空白的——它依赖上游有 `<TooltipProvider>`。
- **最初的误判**：以为像 Dialog 那样直接 render 就行。
- **正确做法**：在根布局（`__root.tsx`）的 RouterProvider / QueryClientProvider 外面包一层 `<TooltipProvider delayDuration={150}>`。Provider 在最顶层，组件在任意子树都能用。
- **相关文件**：`apps/web/src/routes/__root.tsx`。

### 7-G. 路由有 `validateSearch` 时，navigate 必须带 search 参数

- **问题**：TanStack Router 的 list 路由定义了 `validateSearch: taskListSearchSchema` 但没写 `defaultSearch`，导致从 CommandPalette 里 `navigate({ to: "/projects/$projectId/list", params })` 直接被 TS 报错：`Property 'search' is missing`。
- **最初的误判**：以为 validateSearch 只校验、不影响 navigate 的类型。
- **正确做法**：带了 validateSearch 的路由，navigate 时必须显式传一个满足 schema 的 `search` 对象。项目里已有 `DEFAULT_TASK_LIST_SEARCH` 常量，直接复用。另一种做法是给 list 路由加上 `defaultSearch = DEFAULT_TASK_LIST_SEARCH`，这样 navigate 就可以省掉 search。
- **相关文件**：`apps/web/src/components/command-palette.tsx` 里的 `gotoList()`；list 路由的 `validateSearch` 定义。

### 7-H. cmdk 的 `CommandDialog` 不是 forwardRef 组件

- **问题**：给 `@repo/ui` 写 command 组件时，前 6 个 primitives 都是 forwardRef 风格，CommandDialog 准备也写成 forwardRef。
- **最初的误判**：以为 shadcn/ui 的所有组件都是 forwardRef。
- **正确做法**：CommandDialog 本质上就是 `<Dialog>` + 一个 `<Command>` 原语的组合，Dialog 本身已经是 forwardRef 了，外层再套一层 forwardRef 没有意义。CommandDialog 就是一个普通 function component，props 类型直接继承 `Dialog` 的 props 再加上 `title / description` 两个可选字段。
- **相关文件**：`packages/ui/src/components/command.tsx`。

### 7-I. `window.location.pathname` 比 TanStack Router 的 `useLocation` 更适合命令面板

- **问题**：CommandPalette 在 `_app.tsx` 里全局挂载，用 `useLocation()` 拿 pathname 来判断当前是否在项目路由下。但 `useLocation()` 只有在 Router context 内部才有值——Palette 本身就在 RouterProvider 里，理论上能用，但 navigate 的 `from` 参数类型会被锁死。
- **最初的误判**：准备把 ProjectLayout 的 projectId 通过 props 一层层传到 Palette。
- **正确做法**：直接用 `window.location.pathname.match(/^\/projects\/([^/]+)/)`。路由上下文能从 pathname 稳定推断，Palette 又不需要 subscribe location 变化（路由切换会卸载再挂载，effect 自然重跑）。简单、类型安全、不会触发 navigate 的 `FromPathOption` 约束。
- **相关文件**：`apps/web/src/components/command-palette.tsx`。

---

## Phase 1–6 — 已完成的决策回顾（高频复用）

### R-A. `biome` 的 `noNonNullAssertion` 不是"警告"

- `biome.json` 里默认是 error。`projectId!` 这种写法在父条件块里已经 `!== null` 的情况下，BIOME 仍然会报。
- 正确做法：在条件块外面先做 `const currentProjectId = projectId as string`，条件块内用 `currentProjectId`。或者直接 `projectId!` 加 biome-ignore（但不推荐，前者语义更清晰）。

### R-B. 服务端 socket `auth` 复用 BetterAuth session，不要自己发 JWT

- 一开始 gateway 里写了一半 JWT 解码逻辑，后来发现 BetterAuth 的 `auth.api.getSession({ headers: fromNodeHeaders(socket.handshake.headers) })` 就能直接从 cookie 拿 session。
- 正确做法：`fromNodeHeaders` 把 Node.js 原生 headers 转成 BetterAuth 能读的格式，一行搞定。`socket.data.user` 直接存 `session.user`，后续所有 presence / broadcast 都直接用。

### R-C. 所有 socket payload 必须走 shared schema 的 parse/safeParse

- Gateway 端收到客户端 payload，一定要 `schema.safeParse(payload)`，失败就返回 `{ ok: false, error: "INVALID_PAYLOAD" }`。
- 前端端收到服务端广播，一定要 `schema.safeParse(raw)`，失败就 `console.warn` + 丢弃，不能信任服务端会永远遵守契约。
- 这就是 shared 包存在的意义：schema 是协议，不是类型装饰。

---

## 通用原则清单（任何时候都不能忘）

1. **Schema 是协议不是装饰**：任何跨进程（HTTP / WebSocket / IPC）传递的数据，两端都必须 parse。shared 包是唯一生效的地方。
2. **集合写入必须幂等**：任何"用户属于某集合"的语义（房间成员、在线列表、匹配池），写的时候就按主键去重。不要依赖客户端"禁用按钮"来保证服务端不重复写。
3. **Zustand 不存服务端异步数据**：只放 UI 临时态（drawer open、command palette open、当前激活任务 id、语言）。服务端数据一律走 React Query。
4. **路由 navigate 类型错误先看有没有 validateSearch / defaultSearch**：TanStack Router 对带 schema 的路由要求很严，缺 search 会编译不过。
5. **biome 先 write 再 check**：`pnpm biome check --write --unsafe` 能修掉 90% 的格式问题，剩下 10%（a11y 语义、import 顺序、nonNullAssertion）手动处理。
