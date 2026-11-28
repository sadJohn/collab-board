# Collab Board — Bugfix & Optimization Log

> 专门记录**已修复 / 已优化**以及**计划中**的 bugfix 与性能/体验优化。
> 与 `NOTES.md` 的区别：`NOTES.md` 记实现踩坑与约定；本文件记「针对某个具体问题做了什么改动、为什么、效果如何」。
>
> 每条记录统一包含：**类型 → 问题/现象 → 根因 → 方案 → 改动清单 → 验证 → 状态**。
> 文件引用一律用仓库相对路径，确保可随版本追溯。

---

## 记录模板（新增条目时复制）

```md
### [YYYY-MM-DD] 类型标签 — 一句话标题

- **类型**：bugfix / 优化（性能）/ 优化（体验）/ 优化（可维护性）
- **状态**：待实施 / 实施中 / 已完成 / 已回滚
- **问题/现象**：
- **根因**：
- **方案**：
- **改动清单**：
- **验证**：
- **相关文件**：
```

---

## 2026-11-28

### 优化（性能）— 切换工作区响应慢：移除 `get-full-organization` 热路径

- **类型**：优化（性能）/ 优化（体验）
- **状态**：已完成（2026-11-28 落地，typecheck / 95 项单测 / biome 全绿）
- **问题/现象**：
  在顶栏工作区下拉（`apps/web/src/components/layout/app-header.tsx`）或工作区页（`apps/web/src/routes/_app/workspace.tsx`）切换组织时，UI 明显卡顿、要等很久才刷新。用户感知为「点了没反应」。
- **根因**：
  切换链路在两个入口里都是同一套串行调用：
  `setActive() → getSession() → queryClient.clear() → router.invalidate()`。
  叠加三层浪费：

  1. better-auth 客户端在 `setActive` 后会通过内部 signal 自动重取 4 个查询（见 `node_modules/better-auth/.../dist/plugins/organization/client.mjs` 的 `atomListeners`）：`/get-session`、**`/organization/get-full-organization`**（最慢）、`/organization/get-active-member`、`/organization/get-active-member-role`。
  2. 应用层又手动 `getSession()` 一次；`queryClient.clear()` 清掉 session 缓存后，`router.invalidate()` 触发的 `requireSession` 会**冷取** `/get-session`（`apps/web/src/lib/route-guards.ts`）。
  3. `get-full-organization` 服务端本身很重：`findFullOrganization` 联表 members + invitations + teams，再加 `checkMembership` 和权限过滤。

  关键事实：**本 App 根本没用到 full organization 的数据**。全仓 `activeOrganization.data` 只读了 `.id`（9 处）和 `.name`（仅 `apps/web/src/components/home-page.tsx` 一处）；而 `useListOrganizations()` 已返回 `{id, name, slug}`；且没有任何地方用 `useActiveMember`。即 `get-full-organization` / `get-active-member` 对本 App 是纯开销。
- **方案（选定方案 A）**：
  新增零网络的 `useActiveWorkspace` hook，从已缓存的 session（`session.data.session.activeOrganizationId`）+ org 列表派生出当前工作区，返回 `{id, name, slug}`。全仓把 `useActiveOrganization` 替换为 `useActiveWorkspace`。

  better-auth 的 `useActiveOrganization` 仅在**有组件订阅（onMount）时**才发起请求（见 `useAuthQuery` 的 `onMount`）。没有任何组件订阅后，`get-full-organization` 就再也不会被调用——最慢的那个请求直接从热路径消失。

  切换时只剩 `/set-active` + `/get-session` 两个轻量请求，且后者 better-auth 已自动触发，应用层的手动 `getSession()` 可一并去掉。

  ```ts
  // apps/web/src/lib/use-active-workspace.ts（新增）
  export function useActiveWorkspace() {
    const session = useSession();
    const organizations = useListOrganizations();
    const activeId = session.data?.session.activeOrganizationId ?? null;
    const org = organizations.data?.find((o) => o.id === activeId) ?? null;
    return {
      data: org ? { id: org.id, name: org.name, slug: org.slug } : null,
      isPending: session.isPending || organizations.isPending,
    };
  }
  ```

  > 备注：方案 B（乐观切换）已完成，见下条；方案 C（去掉 `queryClient.clear()` / `router.invalidate()` / 统一 session 双缓存）仍作为后续增量项。
- **改动清单**：
  1. 新增 `apps/web/src/lib/use-active-workspace.ts`：从 `session.activeOrganizationId` + `useListOrganizations()` 派生出 `{id, name, slug}`，自身零网络。
  2. 全仓替换 `useActiveOrganization` → `useActiveWorkspace`（共 15 处调用，分布在 15 个文件）。实施时发现除了 9 处「先取变量再读 `.data`」的写法，还有 6 处内联 `useActiveOrganization().data?.id`（看板/快建任务/评论/任务详情/两个 realtime hook），必须一并替换——只要还有一个组件订阅，better-auth 就仍会在 mount 时拉取 `get-full-organization`。
     - 布局/导航：`components/layout/app-header.tsx`、`components/layout/notification-center.tsx`、`components/command-palette.tsx`
     - 页面：`components/home-page.tsx`、`components/analytics/analytics-page.tsx`、`routes/_app/workspace.tsx`、`routes/_app/projects/index.tsx`、`routes/_app/projects/$projectId/route.tsx`、`routes/_app/projects/$projectId/list.tsx`
     - 看板/任务：`components/board/kanban-board.tsx`、`components/board/quick-create-task.tsx`、`components/task/task-comments.tsx`、`components/task/task-detail-form.tsx`
     - Hooks：`hooks/use-dashboard-realtime.ts`、`hooks/use-project-realtime.ts`
  3. 去掉切换处理器里冗余的手动 `authClient.getSession()`：`setActive` 已通过 better-auth 的 `$sessionSignal` 自动重取 session。涉及 `app-header.tsx` 的 `handleOrganizationChange` 和 `workspace.tsx` 的 `refreshSession`。
  4. `auth-client.ts` 仍保留 `useActiveOrganization` 导出（better-auth 提供），但全仓已无调用方，因此不会再触发该查询。
- **验证结果**：
  - `grep` 确认 `apps/web/src` 下已无任何 `useActiveOrganization` 调用（仅剩 `auth-client.ts` 的导出与新 hook 内的文档注释）→ `get-full-organization` 不再被订阅、不再发起。
  - `apps/web`：`pnpm typecheck` 通过；`pnpm test` 95/95 通过；`biome check` 无报错。
  - 切换热路径从「`setActive` + 自动 4 连重取（含慢查询）+ 手动 `getSession` + 冷取 session」收敛为「`setActive` + 自动 `get-session`」，慢查询消失。
- **相关文件**：
  - `apps/web/src/lib/auth-client.ts`（better-auth 客户端与 hooks 导出）
  - `apps/web/src/lib/session.ts`、`apps/web/src/lib/route-guards.ts`（session 缓存与守卫）
  - `apps/web/src/lib/query-keys.ts`（按 org 分作用域的缓存键）
  - `node_modules/better-auth/.../dist/plugins/organization/client.mjs`（signal 行为，仅作参考，不改动）

---

### 优化（体验）— 切换工作区乐观化：UI 瞬时响应、后台提交、失败回滚

- **类型**：优化（体验）/ 优化（性能）
- **状态**：已完成（2026-11-28 落地，typecheck / 95 项单测 / biome 全绿）
- **问题/现象**：
  方案 A 消除了慢查询，但切换仍要等 `/set-active` + `/get-session` 往返完成才刷新，存在可感知的「点了稍等」延迟；失败时也没有反馈。
- **根因**：
  切换是「先等网络成功，再更新 UI」的悲观模式。所有消费者都从 session 派生活跃 org，session 不更新则 UI 不动。
- **方案（方案 B，乐观切换）**：
  引入一个瞬时覆盖层，让 UI 先切、网络在后台跑：

  1. `ui-store` 新增 transient 状态 `optimisticActiveOrganizationId`（**不持久化**，刷新即重置）和 `workspaceSwitchError`。
  2. `useActiveWorkspace` **优先返回 optimistic id**（再从 org list 查 name/slug），于是选中瞬间全应用就按新工作区渲染；per-org 的 queryKey 随之变化，React Query 自动拉取新 org 的数据。`setActive` 会触发 better-auth 自动重取 session，当 session 追上 optimistic（`useEffect` 检测 `sessionId === optimisticId`）时清掉覆盖值，把控制权交还给 session 这个真相源——避免 flicker 窗口。
  3. 新增 `useSwitchWorkspace().switchTo(id)`：先乐观设置 → 后台 `setActive` → 成功后**定向失效**非 org 作用域但 org 相关的缓存（`notifications.list`、`invitations.received`、`session`，per-org key 已随 id 变化自动重取）+ `router.invalidate()`；**失败**时若仍是最新请求则回滚 optimistic（UI 回到原工作区）并写入错误。用 `latestTarget` ref 防止快速连切时旧响应覆盖新选择。
  4. 接入点：
     - app-header 下拉：选中即 `void switchTo`，瞬时切换；错误以小字号红色文字展示、4s 自动消失；退出登录时清理 optimistic/error。
     - workspace 页、command-palette：切换走 `switchTo`。
     - notification-center：跨工作区跳转业务通知时 `await switchTo`（乐观瞬时反馈，但导航等提交完成，保证 board 接口命中正确工作区）；接受邀请后补一次 `listOrganizations.refetch()`——避免新加入的 org 不在缓存列表里、导致 `useActiveWorkspace` 派生不出名称而空白（这是方案 A 改为从 list 派生后引入的依赖）。
- **改动清单**：
  1. `apps/web/src/stores/ui-store.ts`：新增 `optimisticActiveOrganizationId` / `setOptimisticActiveOrganizationId` / `workspaceSwitchError` / `setWorkspaceSwitchError`，均不进 `partialize`（不持久化）。
  2. `apps/web/src/lib/use-active-workspace.ts`：优先 optimistic；session 追上后交还；list 缺失时回退 `{ id, name: "", slug: "" }`（保证 org 作用域查询仍能跑）；暴露 `isSwitching`。
  3. `apps/web/src/lib/use-switch-workspace.ts`（新增）：`switchTo` 乐观提交 + 竞态守卫 + 定向缓存失效 + 失败回滚，返回 `{ ok, error }` 供需要等待提交的调用方使用。
  4. `apps/web/src/components/layout/app-header.tsx`：下拉接入 `switchTo`；错误展示与自动消失；signOut 清理状态。
  5. `apps/web/src/routes/_app/workspace.tsx`：`activate` 改用 `switchTo`。
  6. `apps/web/src/components/command-palette.tsx`：工作区切换改用 `switchTo`，移除不再需要的 `authClient` / `globalQueryClient` / `sessionQueryOptions` 依赖。
  7. `apps/web/src/components/layout/notification-center.tsx`：`handleBusinessClick` 跨 org 走 `switchTo`；`handleAccept` 后 `listOrganizations.refetch()`；移除 `globalQueryClient` / `sessionQueryOptions`。
  8. `apps/web/src/locales/en.json` / `zh.json`：新增 `workspace.switchFailed`（两语言键对齐，通过 `resources.test.ts`）。
- **验证结果**：
  - `apps/web`：`pnpm typecheck` 通过；`pnpm test` 95/95 通过（含 locale 键对齐测试）；`biome check` 无报错。
  - 行为：选中工作区后 UI（header 下拉值、dashboard/看板/列表的 org 作用域数据）瞬时切换，不再等网络；`setActive` 在后台完成。失败时 UI 回滚到原工作区并在 header 提示。
  - 竞态：快速连切 A→B→C，仅最新目标 C 可提交/回滚，过期响应不会覆盖。
  - 数据隔离不变：per-org queryKey 仍按 org 分作用域；旧 org 数据保留在缓存中，切回时瞬时命中。
- **相关文件**：
  - `apps/web/src/stores/ui-store.ts`（乐观覆盖层状态）
  - `apps/web/src/lib/use-active-workspace.ts`、`apps/web/src/lib/use-switch-workspace.ts`
  - `apps/web/src/components/layout/app-header.tsx`、`apps/web/src/components/layout/notification-center.tsx`
  - `apps/web/src/components/command-palette.tsx`、`apps/web/src/routes/_app/workspace.tsx`
  - `apps/web/src/locales/en.json`、`apps/web/src/locales/zh.json`

---

### 回归修复 — 切换工作区首页只在第一次刷新：cookie 竞态 + 误缓存

- **类型**：bugfix
- **状态**：已完成（2026-11-28 落地，typecheck / 95 项单测 / biome 全绿）
- **问题/现象**：
  方案 B（乐观切换）上线后，在首页从顶栏下拉切换工作区：**第一次**切换能正确刷新成新工作区数据，**后续**切换首页不再更新、也没有加载状态。
- **根因**：
  服务端接口按 cookie 解析活跃组织——`getDashboard()`（`apps/web/src/lib/api/dashboard.ts`）调 `api.get("dashboard")` 不带 orgId，全靠服务端 session cookie。切换时存在竞态：

  1. `switchTo` 先**同步**设置 optimistic id → 触发重渲染；首页 `useQuery({ queryKey: queryKeys.dashboard(newOrgId) })` 立即发 GET。
  2. 但此时 `/set-active` 还没把 cookie 提交到服务端，服务端仍返回**旧 org** 的数据，却被缓存在**新 org 的 key** 下。
  3. 方案 B 的 `switchTo` 只定向失效了 `notifications.list` / `invitations.received` / `session`，**没失效 `dashboard`**；全局 `staleTime: 30_000`（`apps/web/src/lib/query-client.ts`）又让这份错缓存在 30s 内视为「新鲜」，于是既不重取、`isPending` 也一直是 `false`（无 loading）。
  4. 第一次切换只是时序侥幸（`setActive` 比 GET 先完成）；后续切换稳定命中竞态。
- **方案**：
  提交成功后、cookie 已落库的时间点，**整包清空应用缓存**，强制所有 org 作用域查询用正确 cookie 重取，并补回加载态：

  ```ts
  // apps/web/src/lib/use-switch-workspace.ts switchTo() 成功分支
  await refetchSession();   // session 原子确定刷新，useActiveWorkspace 交还 optimistic 覆盖
  queryClient.clear();      // 丢弃竞态期可能误缓存的旧数据，强制按新 cookie 重取（也恢复 loading）
  await router.invalidate();
  ```

  要点：
  - `queryClient.clear()` 只清 TanStack Query 缓存，**不影响** better-auth 自己的 nanostore（org 列表 / session），所以 header 的工作区名称不会被清空；`session.refetch()` 负责把 session 原子更新到最新。
  - 首页 `DashboardPage` 的加载分支扩展为 `dashboardQuery.isPending || activeOrganization.isSwitching`——在 `clear()` 执行前的竞态窗口里也显示 loading，杜绝旧工作区数据闪一下。
- **改动清单**：
  1. `apps/web/src/lib/use-switch-workspace.ts`：成功分支由「定向失效 3 个 key」改为 `session.refetch()` + `queryClient.clear()` + `router.invalidate()`；移除不再使用的 `queryKeys` 导入；`session.refetch` 提取到 `refetchSession` 并加入 `useCallback` 依赖（与 `workspace-gate.tsx` 既有模式一致）。
  2. `apps/web/src/components/home-page.tsx`：加载判断加上 `activeOrganization.isSwitching`，切换期间保持 loading。
- **验证结果**：
  - `apps/web`：`pnpm typecheck` 通过；`pnpm test` 95/95 通过；`biome check` 无报错。
  - 行为：从首页下拉连续切换多个工作区，每次都显示 loading 并刷新到目标工作区数据，不再只在第一次生效。
- **相关文件**：
  - `apps/web/src/lib/use-switch-workspace.ts`
  - `apps/web/src/components/home-page.tsx`
  - `apps/web/src/lib/query-client.ts`（`staleTime` 配置，未改动，仅解释背景）

---

### 回归修复 — 项目页切换出现两次加载：查询 scope 用了乐观 id

- **类型**：bugfix
- **状态**：已完成（2026-11-28 落地，typecheck / 95 项单测 / biome 全绿）
- **问题/现象**：
  上一条修复（`queryClient.clear()`）解决了「只刷新一次」，但在项目页（及看板/列表/分析等数据页）切换工作区时出现**两次加载**，第二次才显示新工作区的数据。
- **根因**：
  所有数据页的 `useQuery` 都用 `useActiveWorkspace().data.id`（**乐观** id）做 queryKey。切换瞬间：
  1. optimistic id 翻到 B → queryKey 变 → 立即对 B 发 GET，但此时 cookie 还是 A → 服务端返回 A 的数据，缓存在 B 的 key 下（错误）。
  2. `setActive` 提交后 `queryClient.clear()` 清掉这份错缓存 → B 的 query 再次发起（这次 cookie 正确）→ 第二次加载才拿到 B 的数据。

  即「乐观 id 驱动查询」与「cookie 滞后提交」本质冲突：查询永远会先对旧 cookie 白跑一次。`clear()` 只是事后擦屁股，还会把刚发起的正确请求取消再重发，造成可见的双加载。
- **方案**：
  把「展示用的乐观 id」和「查询用的 committed id」彻底拆开：

  1. `useActiveWorkspace` 新增 `queryId`（= `session.activeOrganizationId`，仅 cookie 提交、session 追上后才变化）；`data` 仍保持乐观，供 header 下拉选中态、工作区名称、实时订阅使用。
  2. 所有数据查询的 queryKey / enabled 改用 `queryId`：切换期间 key 不变 → **不会提前发请求**；提交后 `queryId` 翻到 B → 触发**一次**正确请求。
  3. `switchTo` 去掉 `queryClient.clear()`（它会取消刚发起的正确请求、再触发一次，反而双加载），保留 `session.refetch()` 让 session 追上、`queryId` 翻转，并定向失效全局缓存 `notifications.list` / `invitations.received`（非 org 作用域，不会随 key 变化自动重取）。
  4. `_app` 布局在 `isSwitching` 期间用一个 loading 占位替换 `<Outlet/>`——切换瞬间所有数据页被隐藏，杜绝「header 已显示 B、页面还渲染 A 旧数据」的错配闪烁，一处编辑覆盖全部页面。

  ```ts
  // apps/web/src/lib/use-active-workspace.ts
  return { data /* 乐观：UI chrome */, queryId /* committed：查询 scope */, isSwitching, ... };

  // apps/web/src/routes/_app.tsx — 切换期间隐藏旧页面
  {isSwitching ? <SwitchLoader /> : <Outlet />}
  ```
- **改动清单**：
  1. `apps/web/src/lib/use-active-workspace.ts`：返回值新增 `queryId`（committed session id），文档注释说明 `data` 与 `queryId` 的职责划分。
  2. `apps/web/src/lib/use-switch-workspace.ts`：成功分支移除 `queryClient.clear()`，改为 `session.refetch()` + 定向失效 `notifications.list` / `invitations.received` + `router.invalidate()`；重新引入 `queryKeys` 导入；更新函数文档注释。
  3. `apps/web/src/routes/_app.tsx`：`isSwitching` 时渲染 loading 占位替换 `<Outlet/>`（复用 `workspace.loading` 文案）。
  4. 8 个数据查询页把喂给 queryKey 的 org id 从 `data.id` 改为 `queryId`：
     `components/home-page.tsx`、`routes/_app/projects/index.tsx`、`components/analytics/analytics-page.tsx`、`routes/_app/projects/$projectId/list.tsx`、`routes/_app/projects/$projectId/route.tsx`、`components/board/kanban-board.tsx`、`components/task/task-comments.tsx`、`components/task/task-detail-form.tsx`。
     其中 home-page 的展示名称仍读 `data.name`（乐观，即时反馈）。
  5. 展示/选中/失效/实时订阅类调用方（app-header 下拉、command-palette、notification-center、workspace 页、quick-create-task、use-dashboard-realtime、use-project-realtime）继续用乐观 `data.id`，不在本次改动范围。
- **验证结果**：
  - `apps/web`：`pnpm typecheck` 通过；`pnpm test` 95/95 通过；`biome check` 无报错。
  - 行为：项目页（及其他数据页）切换工作区只出现一次加载，直接显示新工作区数据；header 下拉与工作区名仍瞬时翻转；旧工作区数据保留在各自 org key 下，切回时瞬时命中。
- **相关文件**：
  - `apps/web/src/lib/use-active-workspace.ts`、`apps/web/src/lib/use-switch-workspace.ts`
  - `apps/web/src/routes/_app.tsx`
  - `apps/web/src/components/home-page.tsx`、`apps/web/src/components/analytics/analytics-page.tsx`、`apps/web/src/components/board/kanban-board.tsx`、`apps/web/src/components/task/task-comments.tsx`、`apps/web/src/components/task/task-detail-form.tsx`
  - `apps/web/src/routes/_app/projects/index.tsx`、`apps/web/src/routes/_app/projects/$projectId/list.tsx`、`apps/web/src/routes/_app/projects/$projectId/route.tsx`

---

### 优化（体验）— 切换工作区缓存优先：有缓存即时展示，无缓存才加载

- **类型**：优化（体验）
- **状态**：已完成（2026-11-28 落地，typecheck / 95 项单测 / biome 全绿）
- **问题/现象**：
  上一条修复保证了切换正确且只加载一次，但每次切换都要等 `setActive`+`getSession` 往返（全局遮罩一直转 spinner），即便目标工作区的数据已经在缓存里也不能即时看到。
- **根因**：
  为了杜绝「对旧 cookie 发请求」的竞态，数据查询被 key 在 committed id（`queryId`）上——切换期间 key 不变，页面读不到目标工作区的缓存；同时 `_app` 的全局 `isSwitching` 遮罩把整个 `<Outlet/>` 替换成 spinner，进一步挡住了任何缓存渲染。
- **方案**：
  改成「key 用乐观 id + fetch 用 `isSwitching` 门控」，两者结合既拿到缓存优先，又不触发错请求：
  1. 数据查询的 queryKey **改回乐观 `data.id`**——切换瞬间 key 就指向目标工作区，React Query 直接命中其缓存（有缓存 → 瞬时渲染）。
  2. 每个 org 作用域查询的 `enabled` 加上 `&& !isSwitching`——切换期间（cookie 未提交）**不发任何网络请求**，从根上避免对旧 cookie 取数、缓存污染；session 追上后 `isSwitching` 翻 false，查询才解禁。
  3. 切换提交后，`switchTo` 对目标工作区全部 org 作用域查询执行 `queryClient.invalidateQueries({ queryKey: ["organizations", organizationId] })`（按前缀命中 dashboard/projects/tasks/members/analytics/invitations）——把缓存标脏，使刚解禁的查询**立即在后台刷新一次**，不再受 `staleTime` 延后；缓存数据仍留在屏幕上，不闪 loading。
  4. 移除 `_app` 的全局切换遮罩，让缓存能即时显示；各页面原有的 `isPending` loading 仅在「目标工作区无缓存」时出现（首次访问才加载）。
  5. 移除 `list.tsx` 的 `placeholderData: keepPreviousData`——它会在 queryKey 变化（含跨工作区切换）时把上一个查询的数据顶到新 key 下显示，造成「旧工作区任务在新工作区标题下闪现」的跨 org 泄漏。

  无缓存（首次访问某工作区）时：切换期间 query 被禁用且无数据 → `isPending` 为 true → 页面显示自身 loading；提交后解禁 → 一次正确请求。与「每次都加载」相比，已访问过的工作区零等待。
- **改动清单**：
  1. `apps/web/src/lib/use-active-workspace.ts`：移除上一版引入的 `queryId`，`data` 恢复纯乐观语义；更新文档注释说明「key 用乐观、fetch 门控 `!isSwitching`」的契约。
  2. `apps/web/src/routes/_app.tsx`：移除 `isSwitching` 全局遮罩，`<WorkspaceGate>` 内直接渲染 `<Outlet/>`；清理 `useActiveWorkspace`/`Loader2` 导入。
  3. `apps/web/src/lib/use-switch-workspace.ts`：`session.refetch()` 之后新增 `queryClient.invalidateQueries({ queryKey: ["organizations", organizationId] })`，强制目标工作区查询立即后台刷新；保留定向失效 notifications/invitations + `router.invalidate`，无 `clear`。
  4. 8 个数据查询页：queryKey 改回 `data.id`（乐观），`enabled` 加 `&& !isSwitching`：
     `components/home-page.tsx`、`routes/_app/projects/index.tsx`、`components/analytics/analytics-page.tsx`、`routes/_app/projects/$projectId/list.tsx`、`routes/_app/projects/$projectId/route.tsx`、`components/board/kanban-board.tsx`、`components/task/task-comments.tsx`、`components/task/task-detail-form.tsx`。
     其中 home-page 去掉 loading 门里的 `|| isSwitching`（`isPending` 已能区分有无缓存）。
- **验证结果**：
  - `apps/web`：`pnpm typecheck` 通过；`pnpm test` 95/95 通过；`biome check` 无报错。
  - 行为：切到已访问过的工作区 → 数据瞬时命中缓存、无 loading，header 同步翻转，并立即在后台刷新一次（缓存可见、无闪烁）；切到从未访问的工作区 → 显示一次 loading 后展示数据；来回切换不出现旧工作区数据闪现。
- **相关文件**：
  - `apps/web/src/lib/use-active-workspace.ts`、`apps/web/src/lib/use-switch-workspace.ts`、`apps/web/src/routes/_app.tsx`
  - `apps/web/src/components/home-page.tsx`、`apps/web/src/components/analytics/analytics-page.tsx`、`apps/web/src/components/board/kanban-board.tsx`、`apps/web/src/components/task/task-comments.tsx`、`apps/web/src/components/task/task-detail-form.tsx`
  - `apps/web/src/routes/_app/projects/index.tsx`、`apps/web/src/routes/_app/projects/$projectId/list.tsx`、`apps/web/src/routes/_app/projects/$projectId/route.tsx`
