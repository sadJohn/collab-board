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

---

### 优化（体验）— 顶栏/侧边栏固定、仅内容区滚动；窄屏补回可切换的导航抽屉

- **类型**：优化（体验）
- **状态**：已完成（落地，typecheck / 95 项单测 / biome 全绿）
- **问题/现象**：
  1. 滚动页面时，顶部 banner（`AppHeader`）和左侧导航菜单会一起滚走，只有滚回顶部才能看到。
  2. 窗口窄到 `md`（768px）以下时，左侧菜单整个消失，而顶栏里打开/收起菜单的按钮只在 `md:` 以上显示，导致窄屏**没有任何入口切换导航**。
- **根因**：
  - 布局根容器用 `min-h-dvh` + 文档流自然滚动，`header`/`aside` 都参与页面级滚动，没有任何一层被「钉」在视口里。
  - 侧边栏 `<aside>` 用 `hidden md:block` 在窄屏直接 `display:none`，且顶栏的折叠按钮带 `hidden md:inline-flex`——窄屏既没有常驻菜单，也没有触发入口。
- **方案**：
  1. 把 shell 改成「固定视口高度的 flex 列 + 仅内容区滚动」：根容器 `flex h-dvh flex-col overflow-hidden`，body 行 `flex-1 min-h-0 overflow-hidden`，`<header>` 加 `shrink-0`，`<aside>` 与 `<main>` 各自 `overflow-y-auto`。这样页面不再整体滚动，只有 `<main>` 出滚动条；顶栏和左侧菜单固定在视口内。`<main>` 加 `overscroll-contain` 防止滚动串到父层。
  2. 新增移动端导航抽屉（`mobile-nav.tsx`）：用原生 `<dialog>` + `showModal()`，浏览器免费提供焦点陷阱、Escape 关闭、遮罩层 inert、关闭后焦点回置。抽屉放与桌面侧栏相同的 4 个导航链接，点链接 / 点遮罩 / 按 Escape 都会关闭。
  3. 顶栏新增一个 `md:hidden` 的菜单按钮（`aria-controls` / `aria-expanded` 指向抽屉），窄屏可见；桌面端原有的折叠按钮保持不变（`hidden md:inline-flex`）。
  4. 抽屉开关状态放进 `ui-store` 的 `mobileNavOpen`（transient，不进 `partialize`，刷新即重置为关闭）。
  5. locale 新增 `nav.menu` / `nav.close`，`en.json` 与 `zh.json` 两语言键对齐（通过 `resources.test.ts`）。
- **改动清单**：
  1. `apps/web/src/routes/_app.tsx`：根容器改固定视口 flex 列；body 行 `flex-1 min-h-0 overflow-hidden`；`aside`/`main` 各自 `overflow-y-auto`（`main` 加 `overscroll-contain`、把原 `py-8` 移到两列上）；渲染 `<MobileNav />`。
  2. `apps/web/src/components/layout/app-header.tsx`：`<header>` 加 `shrink-0`；新增 `md:hidden` 菜单按钮（`Menu` 图标，`aria-controls="mobile-nav"`、`aria-expanded`）；桌面折叠按钮维持原样。
  3. `apps/web/src/components/layout/mobile-nav.tsx`（新增）：原生 `<dialog>` 抽屉，`useEffect` 同步 `showModal()`/`close()`，遮罩点击与 `cancel`（Escape）回写 store。
  4. `apps/web/src/stores/ui-store.ts`：新增 transient 状态 `mobileNavOpen` / `setMobileNavOpen`（不持久化）。
  5. `apps/web/src/locales/en.json` / `zh.json`：新增 `nav.menu`、`nav.close`，两文件键集对齐。
- **验证结果**：
  - `apps/web`：`pnpm typecheck` 通过；`pnpm test` 95/95 通过（含 locale 键对齐测试 `resources.test.ts`）；`biome check` 无报错。
  - 行为（桌面）：内容再长也只有右侧 `<main>` 滚动，顶栏与左侧菜单始终钉在视口内；侧栏折叠行为不变。
  - 行为（窄屏 < 768px）：左侧菜单隐藏，顶栏出现菜单按钮；点击弹出左侧抽屉，点导航链接 / 遮罩 / Escape 均关闭并正确导航；抽屉自带焦点陷阱与焦点回置。
- **相关文件**：
  - `apps/web/src/routes/_app.tsx`
  - `apps/web/src/components/layout/app-header.tsx`、`apps/web/src/components/layout/mobile-nav.tsx`
  - `apps/web/src/stores/ui-store.ts`
  - `apps/web/src/locales/en.json`、`apps/web/src/locales/zh.json`

---

### 优化（体验）— 移动端抽屉：补回进出场动画 + 修复高度不到底

- **类型**：优化（体验）
- **状态**：已完成（落地，typecheck / 95 项单测 / biome 无 warning；浏览器实测高度到底、动画中间帧已截到）
- **问题/现象**：
  1. 移动端导航抽屉打开/关闭是瞬切，没有动画。
  2. 抽屉面板底部与视口底边之间有一截空白，高度没到底。
- **根因**：
  - 动画：原生 `<dialog>` 进出顶层（top layer）时在 `display: none` 与可见态之间切换，普通 `transition` 不生效，之前没做任何动画处理。
  - 高度：Chromium UA 样式表对 `dialog:modal` 默认施加 `max-height: calc((100% - 6px) - 2em)`（约比 100% 小 38px）。之前只设了 `h-dvh`，没盖掉这个 UA `max-height` 上限，所以面板始终差一截到底。
- **方案**：
  1. 把抽屉的可见面板从 dialog 本体拆到内层 `.drawer-sheet`，dialog 本体重置 UA 默认样式：`max-height/width: none`、`inset: 0`、`margin/padding/border: 0`、`background: transparent`，让遮罩铺满视口、面板样式由内层掌控。
  2. `.drawer-sheet` 高度设为 `100dvh`（随动态视口填充，到底），默认 `translateX(-100%)`（屏幕左侧外）。
  3. 按 `animate-to-from-top-layer` 指南实现动画：`@starting-style` 定义入场起点，`transition-behavior: allow-discrete` + 把 `display`/`overlay` 列入 `transition-property`，使 dialog 进出顶层时能滑动 + 遮罩淡入淡出；`prefers-reduced-motion` 下缩短到 0.01s。
  4. 退出动画的跨浏览器回退：Chrome/Edge 原生支持顶层退出过渡，直接 `close()` 即可；Firefox/Safari 不支持，于是设置 `[data-closing]` 让开态规则失配、元素过渡回闭态，等 `getAnimations()` 结束再 `close()`（带 400ms 超时兜底）。打开时若处于关闭动画中途，取消待定关闭。
  5. Escape（`cancel`）改为 `preventDefault` 后走同一套带动画的关闭，不再瞬关。
- **改动清单**：
  1. `apps/web/src/index.css`：新增 `#mobile-nav` 作用域样式块（UA reset + sheet 布局 + `@starting-style` 进出动画 + 遮罩过渡 + reduced-motion）。
  2. `apps/web/src/components/layout/mobile-nav.tsx`：dialog 内包 `.drawer-sheet`；新增 `supportsTopLayerExit()` 探测（含真实元素 probe，规避 Firefox 假支持）与 `closeAnimated()` 关闭流程；`onCancel` 改为带动画关闭；store 仍为唯一真相源，`useEffect` 编排 show/close。
- **验证结果**：
  - `apps/web`：`pnpm typecheck` 通过；`pnpm test` 95/95 通过；`biome check` 无 warning。
  - 浏览器实测（免登录独立测试页，390×844）：面板底边 computed `548px` === 视口高 `548px`，底部无缺口；`?slow` 拉长到 2s 后截到中间帧 `translateX(-125.6px)`（全程 256px）、遮罩 `rgba(0,0,0,0.255)`（满值 0.5），确认是滑动+淡入而非瞬切。测试页为临时验证产物，已删除，不进入构建。
- **相关文件**：
  - `apps/web/src/index.css`
  - `apps/web/src/components/layout/mobile-nav.tsx`

---

### 优化（体验）/ 优化（可维护性）— 移动端抽屉改用 motion：删掉手写顶层动画探测，修复出场动画不播放

- **类型**：优化（体验）/ 优化（可维护性）
- **状态**：已完成（落地，typecheck / 95 项单测 / biome 无 warning；浏览器实测进、出场中间帧均截到）
- **问题/现象**：
  1. 抽屉**出场动画不播放**：打开是滑入，关闭却是瞬切消失，进出不对称。
  2. 项目已安装 `motion`（`motion/react`，首页与可排序任务卡已在用），但抽屉仍靠手写 CSS + `@starting-style` + `transition-behavior: allow-discrete` + `getAnimations()` 回退探测实现动画，代码冗长且跨浏览器脆弱。
- **根因**：
  上一版的出场依赖「CSS 顶层退出过渡 + Firefox/Safari 的 `[data-closing]`/`getAnimations()` 回退」。该路径对浏览器顶层退出原生支持或回退时序敏感，实际不稳定：`close()` 把 dialog 移出顶层后元素瞬间 `display:none`，退出过渡没机会播放，表现为瞬关。
- **方案**：
  保留原生 `<dialog>` + `showModal()`（焦点陷阱 / Escape / inert 遮罩 / 焦点回置全部不变），但**进出场动画交给 motion 声明式驱动**，不再手写顶层动画：
  1. 面板与遮罩各是一个 `<motion.div>`，共享 `variants = { open, closed }`，`initial="closed"`、`animate={open ? "open" : "closed"}`。
  2. **入场**：`useEffect` 监听 `open` → `dialog.showModal()`，motion 把 closed 变体播到 open（面板 `x: -100% → 0%`，遮罩 `opacity: 0 → 1`）。
  3. **出场（修复点）**：`dismiss()` 只把 `open` 置 false；motion 播放 open→closed；面板的 `onAnimationComplete("closed")` 里才调用 `dialog.close()`。关闭时机由 JS 动画完成回调控制，**每个浏览器都会完整播放出场**，不再依赖顶层退出原生支持或回退探测。
  4. 布局从 CSS 移到 Tailwind 类：`max-h-none max-w-none` 盖掉 UA `dialog:modal` 的 `max-height` 上限（面板到底），`h-dvh` 动态视口高度；`index.css` 里整个 `#mobile-nav` 块删除。
  5. 轻量关闭：`<dialog onClick>` 判定 `!sheetRef.current?.contains(event.target)` 时关闭（遮罩现为子 div，不能再靠 `event.target === dialog` 判定）；`useReducedMotion()` 下过渡 `duration: 0`，不播动画但仍走同一关闭回调。
  6. 删掉 `supportsTopLayerExit()` 探测、`data-closing` 属性、`getAnimations()` 等待、`closingRef`、`useCallback` 等样板。
- **改动清单**：
  1. `apps/web/src/components/layout/mobile-nav.tsx`：用 `motion/react` 的 `motion` + `useReducedMotion` 重写，variants 驱动进出场，`onAnimationComplete` 定时 `close()`；布局改 Tailwind 类；删除手写动画探测代码。
  2. `apps/web/src/index.css`：删除整个 `#mobile-nav` 作用域样式块（UA reset / sheet 布局 / `@starting-style` / 遮罩过渡 / reduced-motion 共约 75 行），样式与动画全部内联到组件。
- **验证结果**：
  - `apps/web`：`pnpm typecheck` 通过；`pnpm test` 95/95 通过（`resources.test.ts` 语言键对齐仍绿，本次未新增 key，复用既有 `nav.menu` / `nav.close`）；`biome check` 无 warning。
  - 浏览器实测（免登录独立测试页，镜像同一套组件逻辑，视口等价 390×844）：
    - 面板底边 `548px` === 视口高 `548px`，无缺口；完全打开时 transform 为 identity（x=0）。
    - `?slow` 把过渡拉到 2s：入场中途截到 `translateX(-59.16px)`（在 -256~0 之间）→ 入场滑动；**出场中途**（点遮罩后 700ms）截到 `translateX(-198.79px)` 且 `dialog.open === true` → 出场确实在播放而非瞬关，bug 修复。
  - 临时测试页 `apps/web/public/drawer-motion-test.html` 已删除，不进入构建。
- **相关文件**：
  - `apps/web/src/components/layout/mobile-nav.tsx`
  - `apps/web/src/index.css`

---

### 优化（可维护性）— 桌面侧栏与移动抽屉复用同一套导航组件

- **类型**：优化（可维护性）
- **状态**：已完成（落地，typecheck / 95 项单测 / biome 无 warning）
- **问题/现象**：
  主导航在两处重复实现：桌面侧栏（`routes/_app.tsx`）把 4 个 `<Link>` 的 `to` / `className` / `activeProps` / `t()` 硬编码写了 4 遍；移动抽屉（`components/layout/mobile-nav.tsx`）把同样 4 项抽成了 `NAV_ITEMS` 数组，但只在抽屉内部用，没回灌到桌面端。加/改导航项要改两处，样式与 locale key 容易漂移。
- **根因**：
  先写的桌面端是硬编码，后加抽屉时才想到抽数组，但没把公共部分提升出去，导致数据与样式各存一份。
- **方案**：
  新增 `components/layout/nav-links.tsx`，导出单一事实源 `NAV_ITEMS` 与 `NavLinks` 组件（渲染 `<nav>` + 4 个 `<Link>`，样式集中定义）。桌面端 `<NavLinks />`，移动端 `<NavLinks onNavigate={dismiss} />`——唯一行为差异（点链接后关抽屉）通过可选 `onNavigate` prop 传入，桌面端不传。
- **改动清单**：
  1. 新增 `apps/web/src/components/layout/nav-links.tsx`：`NAV_ITEMS` 常量 + `NavLinks` 组件（可选 `onNavigate?: () => void`）。
  2. `apps/web/src/routes/_app.tsx`：侧栏 `<nav>` 里 4 个硬编码 `<Link>` 替换为 `<NavLinks />`；清理不再使用的 `Link` / `useTranslation` 导入与 `t`。
  3. `apps/web/src/components/layout/mobile-nav.tsx`：删除本地 `NAV_ITEMS` 与内联 `<nav>`，改用 `<NavLinks onNavigate={dismiss} />`；清理 `Link` 导入。
- **验证结果**：
  - `apps/web`：`pnpm typecheck` 通过；`pnpm test` 95/95 通过；`biome check` 无 warning。
  - 行为不变：桌面侧栏 4 项导航与选中高亮、移动抽屉点链接后关闭并导航，均与改动前一致（`onNavigate` 透传给 `<Link onClick>`，少参数函数兼容 `MouseEventHandler` 签名）。
- **相关文件**：
  - `apps/web/src/components/layout/nav-links.tsx`（新增）
  - `apps/web/src/routes/_app.tsx`
  - `apps/web/src/components/layout/mobile-nav.tsx`

---

### 优化（体验）— 用 sonner 统一提示：操作级错误/成功改 toast，字段校验与阻塞错误保留行内

- **类型**：优化（体验）/ 优化（可维护性）
- **状态**：已实施（2026-11-28，方案 B）
- **问题/现象**：
  1. 全仓没有集中式提示库。用户操作失败时的反馈散落在各组件里：用 `useState` 存 `formError`/`actionError`，再在表单里渲染一行 `<p className="text-destructive" role="alert">`；写法重复、样式与位置不统一。
  2. 唯一的「toast」是 `email-verification-banner.tsx` 手写的：自己维护 `showVerifiedToast` 状态 + `setTimeout` 5s 自动消失 + `fixed` 定位，约 25 行样板。
  3. 工作区切换失败把错误存进 `ui-store` 的 `workspaceSwitchError`，在 `app-header.tsx` 行内渲染 `<span role="alert">` 并另配一个 4s 自动消失的 `useEffect`——一个 transient 提示占用了全局 store 状态 + 订阅 + 定时器。
  4. 部分关键成功操作（创建项目、创建工作区、重置密码）没有显式成功反馈，用户只能靠「对话框关了 / 跳转了」推断成功。
- **根因**：
  项目起步时没有引入 toast 库，各类反馈就地实现；随着功能增长，行内红字 + 手写 toast + store 驱动提示三套并存，既不统一也难维护。`@repo/ui` 也没有 toast 原语。
- **方案（方案 B，已确认范围）**：
  引入 `sonner`，在根布局挂一个 `<Toaster />`，把「**用户操作产生的瞬时反馈**」统一收敛为 toast；同时画清边界，**不**把本该留在原地的提示迁走。

  **边界——迁 toast（瞬时、非上下文绑定）**：
  - 操作失败：登录/注册/创建工作区/邀请成员/创建项目/新建任务/移动任务/保存任务/评论增删/头像上传/保存资料/改密/忘记密码/重置密码/通知中心接受/拒绝/全部已读/跨区跳转/工作区切换失败。
  - 操作成功：邮箱验证（迁移手写 toast）、创建项目、创建工作区、重置密码（跳转前提示）。

  **边界——保留行内（不迁，刻意为之）**：
  - **字段级校验错误**：`components/form/form-field.tsx`（`FormTextField` / `FormTextareaField` 共用）渲染在输入框下方的 zod 错误——与字段绑定，必须留在原地。`quick-create-task.tsx` 的 `titleError` 同理（无 `role="alert"`，本就是行内字段错误）。
  - **阻塞性加载 / 页面态错误**：查询失败时没有别的内容可展示、错误本身就是页面内容的——`reset-password` 缺 token（`missingToken`）、`accept-invitation` 邀请无效/加载失败（`isError`）、`pending-invitations` 列表加载失败（`isError`）、`notification-center` 列表加载失败（`isError`）、`workspace-gate` 激活失败（带 Retry 按钮的整屏 gate）。这类提示若变 toast，屏幕会一片空白，必须保留行内。
  - **上下文型成功确认**：忘记密码 `sent`（替换表单的页面态）、邀请成员 `sentTo`（显示目标邮箱）、资料/改密 `saved`、拒绝邀请 `rejected`、验证邮件 `sent`——已经是就近、清晰的行内确认，无需改 toast。
  - **纯信息提示**：`kanban-board` 的 `truncated` 截断说明。

  实施要点：
  - `<Toaster />` 挂在 `__root.tsx` 的 `RootLayout`（`TooltipProvider` 同级），`theme` 与应用 resolved theme 同步（见下），`position="top-right"`、`closeButton`、`richColors={false}`，外观通过 `index.css` 作用域样式映射到应用语义 token（`--card`/`--border`/`--card-foreground`/`--destructive` 等），亮/暗随 `html.dark` 自动切换，error/success 用左侧色条区分。
  - 新增 `useResolvedTheme()`（`lib/use-resolved-theme.ts`）：订阅 `useUiStore` 的 `theme` 偏好 + `watchSystemTheme` 的 OS 变化，返回 `resolveTheme()` 结果，供 `<Toaster theme={...} />` 与将来需要 resolved theme 的组件复用。
- **改动清单**：

  **1. 基础设施**
  1. `apps/web/package.json`：新增依赖 `sonner`；`pnpm install`。
  2. 新增 `apps/web/src/lib/use-resolved-theme.ts`：返回响应式 resolved theme（light/dark）。
  3. `apps/web/src/routes/__root.tsx`：`RootLayout` 内挂载 `<Toaster theme={useResolvedTheme()} position="top-right" closeButton richColors={false} />`。
  4. `apps/web/src/index.css`：新增 sonner 作用域样式块，用应用 token 覆盖默认外观（含 `data-type="error"` / `data-type="success"` 色条）。

  **2. 清理：工作区切换错误从 store 搬到 toast**
  5. `apps/web/src/stores/ui-store.ts`：删除 `workspaceSwitchError` / `setWorkspaceSwitchError`（interface 字段、初始值、setter）。已确认无测试断言该字段。
  6. `apps/web/src/lib/use-switch-workspace.ts`：失败分支的 `setError(null)` / `setError(message)` 改为 `toast.error(message || t("workspace.switchFailed"))`（保留 `latestTarget` 竞态守卫，只对最新目标弹一次）；成功分支的 `setError(null)` 删除。`SwitchWorkspaceResult` 返回接口不变（`notification-center` 仍读 `error`）。
  7. `apps/web/src/components/layout/app-header.tsx`：删除 `workspaceSwitchError` / `clearWorkspaceSwitchError` 订阅、4s 自动消失的 `useEffect`、行内 `<span role="alert">`，以及 `handleSignOut` 里的 `clearWorkspaceSwitchError(null)`。

  **3. 错误迁移：`setXxxError` → `toast.error`，删行内 `<p role="alert">` 与无用状态**
  8. `components/auth/login-form.tsx`、`components/auth/register-form.tsx`：`formError` → `toast.error`；`GithubSignInButton` 的 `onError` 直接传 `toast.error`（签名兼容 `(message: string) => void`）；删状态与行内 alert。字段级校验仍由 `FormTextField` 行内展示，不动。
  9. `routes/forgot-password.tsx`：`formError` → `toast.error`；`submitted` 行内成功保留。
  10. `routes/reset-password.tsx`：提交 `formError` → `toast.error`；`missingToken` 页面态 alert 保留。成功分支在 `navigate` 前 `toast.success(t("auth.reset.success"))`。
  11. `components/workspace/create-organization-form.tsx`：`formError` → `toast.error`；成功分支 `toast.success(t("workspace.create.success"))`。
  12. `components/workspace/invite-member-form.tsx`：`formError` → `toast.error`；`sentTo` 行内成功保留。
  13. `components/project/create-project-form.tsx`：`formError`（含 409 `keyExists` 与通用 `failed`）→ `toast.error`；成功分支 `toast.success(t("projects.create.success"))`。
  14. `components/task/task-detail-form.tsx`：mutation `onError` 的 `setFormError` → `toast.error`。
  15. `components/task/task-comments.tsx`：`createMutation` / `deleteMutation` 的 `onError` → `toast.error`；删 `error` 状态与行内 alert。
  16. `components/board/quick-create-task.tsx`：`formError`（`board.createFailed`）→ `toast.error`；`titleError` 字段校验保留行内。
  17. `components/board/kanban-board.tsx`：`moveFailed` → `toast.error`；删状态与行内 alert；`truncated` 信息提示保留。
  18. `components/workspace/pending-invitations.tsx`：`actionError`（`copyFailed` / `cancelFailed`）→ `toast.error`；列表 `loadFailed`（`isError`）保留行内。
  19. `routes/accept-invitation.$invitationId.tsx`：`actionError`（`acceptFailed` / `rejectFailed`）→ `toast.error`；邀请无效/加载失败的页面态 alert 保留行内。
  20. `components/layout/notification-center.tsx`：`actionError`（接受/拒绝/跨区跳转失败/全部已读失败）→ `toast.error`；列表 `loadFailed`（`isError`）在 popover 内保留行内。`handleBusinessClick` 里 `switchTo` 返回的 `error` 也走 `toast.error`。
  21. `routes/_app/settings/profile.tsx`：`avatarError` / `saveError` / `securityError` → `toast.error`；`saved` / `securitySaved` 行内成功保留。
  22. `components/auth/email-verification-banner.tsx`：重发失败 `error` → `toast.error`；手写的 `showVerifiedToast`（状态 + `setTimeout` + `fixed` 定位 div + `TOAST_DURATION_MS`）整体删除，改为 `toast.success(t("auth.verification.success"))`；`sent` 行内状态与未验证 banner 保留。

  **4. Locale（en/zh 必须对齐，受 `resources.test.ts` 约束）**
  23. 新增 3 个成功 key（现有错误 key 全部已存在且两语言对齐，直接复用）：
      - `workspace.create.success`、`projects.create.success`、`auth.reset.success`
      - 同步写入 `apps/web/src/locales/en.json` 与 `zh.json`，键集对齐。
      - 复用既有：`auth.verification.success`、`workspace.switchFailed`、`board.createFailed`、`board.moveFailed`、`task.saveFailed`、`task.commentFailed`、`task.commentDeleteFailed`、`settings.profile.saveFailed`、`settings.profile.avatar.uploadFailed`、`settings.security.invalidCurrent`、`settings.security.failed` 等。

  **5. 测试更新（断言 `getByRole("alert")` 的用例需改为断言 toast）**
  24. `components/auth/auth-forms.test.tsx`：登录失败、注册失败用例把 `screen.getByRole("alert")` 断言改为校验 toast 内容。
  25. `components/project/create-project-form.test.tsx`：409 冲突与通用失败两条用例同上。
  26. `components/workspace/workspace-forms.test.tsx`：`create-organization-form` 的「Slug already taken」用例（line 64）改 toast 断言；`invite-member-form` 的 `getByRole("status")` 成功用例（line 91）不变（`sentTo` 保留行内）。
  27. 测试机制二选一（实施时定）：(a) 在受影响测试里 `vi.mock("sonner")` 暴露 `toast.error/success` 的 `vi.fn()`，断言调用参数（i18n 在测试里是真实实例，`t()` 会解析成最终文案，参数断言稳定）；或 (b) 渲染时挂载 `<Toaster />`，用 `screen.findByText(...)` 断言。推荐 (a)，不依赖 sonner 渲染时序。
  28. `workspace-gate.test.tsx` 对 `getByRole("alert")` 的断言**不变**——`activationError` 属阻塞性 gate 错误，保留行内（见边界）。
- **验证（已实施，2026-11-28）**：
  - `apps/web`：`pnpm --filter @repo/web typecheck` 通过（exit 0）；`pnpm --filter @repo/web test` 全绿（17 文件 / 95 用例，含更新后的 toast 断言与 `resources.test.ts` 语言键对齐）；`pnpm biome check apps/web/src` 无报错（`--write` 自动整理了 7 个文件的 import 排序，复查干净）。
  - 行为（按计划边界落地；以下为代码层面确认，未做人工 UI 回归）：
    - 各操作失败 → `toast.error`，右上角弹出、自动消失；文案与原行内 alert 一致（复用同一 `t()` key）。字段校验错误仍由 `FormTextField` 在输入框下方行内展示。
    - 创建项目/工作区、邮箱验证、重置密码成功 → `toast.success`。
    - 工作区切换失败 → `use-switch-workspace` 走 `toast.error`，`ui-store` 不再持有 transient 错误，`app-header` 无行内红字与 4s 定时器。
    - 阻塞/加载类错误（邀请无效、缺 token、列表加载失败、gate 激活失败）仍保留行内 `role="alert"`，屏幕不会空白；`workspace-gate.test.tsx` 断言未改。
  - 主题：`<Toaster theme={useResolvedTheme()} position="top-right" closeButton richColors={false} />` 跟随应用亮/暗。`index.css` 用 `html body [data-sonner-toaster][data-sonner-theme="light"|"dark"]` 提升特异性覆盖 sonner 运行时注入样式，`--normal-bg/--normal-text/--normal-border` 映射到 `--card/--card-foreground/--border`，`--border-radius` 取 `--radius`，字体继承；`richColors={false}` 使变体 toast 保留卡片底色，差异由 sonner 内置变体图标（✓/⚠/✕）表达。
  - 测试采用计划中的方案 (a)：三个受影响测试文件 `vi.mock("sonner")` 暴露 `toast.error/success` 的 `vi.fn()`，断言调用参数；`vi.mocked(toast.error)` 取 mock 实例以通过类型检查。
- **相关文件**：
  - 基础设施：`apps/web/package.json`、`apps/web/src/routes/__root.tsx`、`apps/web/src/lib/use-resolved-theme.ts`（新增）、`apps/web/src/index.css`
  - 清理：`apps/web/src/stores/ui-store.ts`、`apps/web/src/lib/use-switch-workspace.ts`、`apps/web/src/components/layout/app-header.tsx`
  - 错误迁移：`apps/web/src/components/auth/{login,register}-form.tsx`、`apps/web/src/components/auth/email-verification-banner.tsx`、`apps/web/src/routes/{forgot,reset}-password.tsx`、`apps/web/src/components/workspace/{create-organization,invite-member,pending-invitations}-form.tsx`（含 `pending-invitations.tsx`）、`apps/web/src/components/project/create-project-form.tsx`、`apps/web/src/components/task/{task-detail-form,task-comments}.tsx`、`apps/web/src/components/board/{quick-create-task,kanban-board}.tsx`、`apps/web/src/routes/accept-invitation.$invitationId.tsx`、`apps/web/src/components/layout/notification-center.tsx`、`apps/web/src/routes/_app/settings/profile.tsx`
  - Locale：`apps/web/src/locales/en.json`、`apps/web/src/locales/zh.json`
  - 测试：`apps/web/src/components/auth/auth-forms.test.tsx`、`apps/web/src/components/project/create-project-form.test.tsx`、`apps/web/src/components/workspace/workspace-forms.test.tsx`
  - 参考（不动）：`apps/web/src/components/form/form-field.tsx`（字段校验行内，保留）、`apps/web/src/lib/theme.ts`（resolved theme 计算）
