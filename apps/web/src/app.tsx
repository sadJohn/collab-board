import { TASK_STATUS_LABELS, TASK_STATUSES } from "@repo/shared";
import { Button } from "@repo/ui";
import { ArrowRight, LayoutDashboard } from "lucide-react";

const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";

export function App() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <LayoutDashboard className="size-4" />
            Collab Board
          </div>
          <span className="text-xs text-muted-foreground">API · {apiUrl}</span>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-16">
        <section className="flex flex-col gap-4">
          <span className="w-fit rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
            Phase 3 · Frontend foundation
          </span>
          <h1 className="text-4xl font-semibold tracking-tight">
            Real-time tasks, without the refresh button.
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            React 19, Vite, Tailwind CSS v4 and shadcn/ui are wired up. Shared Zod schemas from{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-sm">@repo/shared</code> and UI
            components from <code className="rounded bg-muted px-1 py-0.5 text-sm">@repo/ui</code>{" "}
            resolve from this app.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button>
              Get started
              <ArrowRight />
            </Button>
            <Button variant="outline">View board</Button>
            <Button variant="ghost">Docs</Button>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {TASK_STATUSES.map((status) => (
            <div key={status} className="rounded-lg border bg-card p-4 shadow-xs">
              <p className="text-sm font-medium">{TASK_STATUS_LABELS[status]}</p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{status}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
