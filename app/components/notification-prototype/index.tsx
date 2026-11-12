// PROTOTYPE (throwaway, wayfinder ticket "What the NotificationFeed looks like in Cadence").
// Three variants of the NotificationFeed on the existing app layout, switchable via ?variant=A|B|C.
// ?empty=1 shows the empty state. All data is mocked in memory, nothing is persisted or sent.
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  Bell,
  CheckCheck,
  CircleCheck,
  CircleX,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Reply,
  ShoppingCart,
  Undo2,
  UsersRound,
  X,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { UserRole } from "~/db/schema";

// ---------- mock data (seven Notifications from ticket "Which Notifications does Cadence send") ----------

type Kind =
  | "refund_submitted"
  | "refund_approved"
  | "refund_declined"
  | "comment"
  | "reply"
  | "purchase"
  | "seat";

interface MockNotification {
  id: number;
  kind: Kind;
  text: string;
  time: string;
  group: "Today" | "Earlier";
  read: boolean;
  to: string;
}

const KIND_ICON: Record<Kind, typeof Bell> = {
  refund_submitted: Undo2,
  refund_approved: CircleCheck,
  refund_declined: CircleX,
  comment: MessageSquare,
  reply: Reply,
  purchase: ShoppingCart,
  seat: UsersRound,
};

function seed(role: UserRole | null): MockNotification[] {
  if (role === UserRole.Admin) {
    return [
      { id: 1, kind: "refund_submitted", text: "Sam Lee asked for a Refund on Intro to SQL. Pending.", time: "4 min ago", group: "Today", read: false, to: "/admin/refunds" },
      { id: 2, kind: "refund_submitted", text: "Priya Nair asked for a Refund on Advanced TypeScript. Pending.", time: "2 h ago", group: "Today", read: false, to: "/admin/refunds" },
      { id: 3, kind: "refund_submitted", text: "dana@example.com asked for a Refund on React Basics. Pending.", time: "Yesterday", group: "Earlier", read: true, to: "/admin/refunds" },
      { id: 4, kind: "refund_submitted", text: "Omar Haddad asked for a Refund on Intro to SQL. Pending.", time: "3 days ago", group: "Earlier", read: true, to: "/admin/refunds" },
    ];
  }
  if (role === UserRole.Instructor) {
    return [
      { id: 1, kind: "comment", text: "Sam Lee commented on Joins, in Intro to SQL.", time: "12 min ago", group: "Today", read: false, to: "/instructor/questions" },
      { id: 2, kind: "purchase", text: "Priya Nair bought Intro to SQL.", time: "1 h ago", group: "Today", read: false, to: "/instructor" },
      { id: 3, kind: "reply", text: "Sam Lee replied to your comment on Joins.", time: "5 h ago", group: "Today", read: true, to: "/instructor/questions" },
      { id: 4, kind: "purchase", text: "dana@example.com bought Advanced TypeScript.", time: "Yesterday", group: "Earlier", read: true, to: "/instructor" },
      { id: 5, kind: "comment", text: "Omar Haddad commented on Window functions, in Intro to SQL.", time: "2 days ago", group: "Earlier", read: true, to: "/instructor/questions" },
    ];
  }
  return [
    { id: 1, kind: "refund_approved", text: "Your Refund Request for Intro to SQL was approved. You get $49 back and your Course Access has ended. Your Progress is saved.", time: "20 min ago", group: "Today", read: false, to: "/courses" },
    { id: 2, kind: "reply", text: "Priya replied to your comment on Joins.", time: "3 h ago", group: "Today", read: false, to: "/courses" },
    { id: 3, kind: "seat", text: "Priya redeemed a seat for Advanced TypeScript.", time: "Yesterday", group: "Earlier", read: true, to: "/team" },
    { id: 4, kind: "refund_declined", text: "Our team declined your Refund Request for React Basics. You keep your Course Access.", time: "4 days ago", group: "Earlier", read: true, to: "/courses" },
  ];
}

// ---------- shared state ----------

interface FeedCtx {
  items: MockNotification[];
  unread: number;
  markRead: (id: number) => void;
  markAllRead: () => void;
}
const Ctx = createContext<FeedCtx | null>(null);
const useFeed = () => useContext(Ctx)!;

export const PROTOTYPE_VARIANTS = [
  { key: "A", name: "Bell popover" },
  { key: "B", name: "Sidebar item + full page" },
  { key: "C", name: "Right drawer / bottom sheet" },
] as const;

function useVariant() {
  const [params] = useSearchParams();
  const v = (params.get("variant") ?? "A").toUpperCase();
  return PROTOTYPE_VARIANTS.some((x) => x.key === v) ? v : "A";
}

// ---------- shared pieces ----------

function UnreadBadge({ count, className }: { count: number; className?: string }) {
  if (count === 0) return null;
  return (
    <span
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-5 text-primary-foreground tabular-nums",
        className
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

function Row({ n, dense, onNavigate }: { n: MockNotification; dense?: boolean; onNavigate?: () => void }) {
  const { markRead } = useFeed();
  const Icon = KIND_ICON[n.kind];
  return (
    <Link
      to={n.to}
      onClick={() => {
        markRead(n.id);
        onNavigate?.();
      }}
      className={cn(
        "flex gap-3 px-4 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
        dense ? "py-2.5" : "py-3.5",
        !n.read && "bg-primary/5"
      )}
    >
      <div className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", n.read ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm leading-snug", n.read ? "text-muted-foreground" : "font-medium text-foreground")}>{n.text}</p>
        <p className="mt-1 text-xs text-muted-foreground">{n.time}</p>
      </div>
      {!n.read && <span aria-label="Unread" className="mt-2 size-2 shrink-0 rounded-full bg-primary" />}
    </Link>
  );
}

function Empty() {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Bell className="size-5" />
      </div>
      <p className="mt-3 text-sm font-medium">You're all caught up</p>
      <p className="mt-1 text-sm text-muted-foreground">New activity on your courses and Refund Requests shows up here.</p>
    </div>
  );
}

function MarkAll() {
  const { unread, markAllRead } = useFeed();
  return (
    <button
      onClick={markAllRead}
      disabled={unread === 0}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
    >
      <CheckCheck className="size-3.5" /> Mark all read
    </button>
  );
}

function BellButton({ onClick, open, className }: { onClick: () => void; open?: boolean; className?: string }) {
  const { unread } = useFeed();
  return (
    <button
      onClick={onClick}
      aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      aria-expanded={open}
      className={cn("relative inline-flex size-10 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:size-8", className)}
    >
      <Bell className="size-4" />
      {unread > 0 && (
        <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground tabular-nums md:right-0 md:top-0">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}

function useDismiss(open: boolean, close: () => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, close, ref]);
}

// ---------- Variant A: bell in the sidebar header, popover panel ----------

function PanelList({ dense }: { dense?: boolean }) {
  const { items } = useFeed();
  if (items.length === 0) return <Empty />;
  return (
    <div className="divide-y">
      {items.map((n) => (
        <Row key={n.id} n={n} dense={dense} />
      ))}
    </div>
  );
}

function VariantABell({ mobile }: { mobile?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);
  return (
    <div ref={ref} className={cn(!mobile && "relative ml-auto")}>
      <BellButton onClick={() => setOpen((o) => !o)} open={open} />
      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className={cn(
            "z-50 overflow-hidden border bg-popover text-popover-foreground shadow-lg",
            mobile
              ? "fixed inset-x-0 top-14 max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-x-0"
              : "absolute left-0 top-10 w-96 rounded-lg"
          )}
        >
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <h2 className="text-sm font-semibold">Notifications</h2>
            <MarkAll />
          </div>
          <div className={cn(!mobile && "max-h-[28rem] overflow-y-auto")}>
            <PanelList dense />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Variant B: sidebar nav item with count, feed is a full page in the main area ----------

function VariantBNav({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const { unread } = useFeed();
  return (
    <button
      onClick={() => setOpen(!open)}
      aria-current={open ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        open ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      <Bell className="size-4" />
      <span className="flex-1 text-left">Notifications</span>
      <UnreadBadge count={unread} />
    </button>
  );
}

function VariantBPage({ close }: { close: () => void }) {
  const { items, unread } = useFeed();
  const [tab, setTab] = useState<"all" | "unread">("all");
  const shown = items.filter((n) => tab === "all" || !n.read);
  const groups = (["Today", "Earlier"] as const).map((g) => ({ g, rows: shown.filter((n) => n.group === g) })).filter((x) => x.rows.length);
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <div className="flex items-center gap-1">
          <MarkAll />
          <button onClick={close} aria-label="Close notifications" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent">
            <X className="size-4" />
          </button>
        </div>
      </div>
      <div className="mt-4 flex gap-1 border-b" role="tablist">
        {(["all", "unread"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn("-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium capitalize", tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {t}
            {t === "unread" && <UnreadBadge count={unread} />}
          </button>
        ))}
      </div>
      {groups.length === 0 ? (
        tab === "unread" && items.length > 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Nothing unread.</div>
        ) : (
          <Empty />
        )
      ) : (
        groups.map(({ g, rows }) => (
          <section key={g} className="mt-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g}</h2>
            <div className="divide-y overflow-hidden rounded-lg border bg-card">
              {rows.map((n) => (
                <Row key={n.id} n={n} onNavigate={close} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

// ---------- Variant C: floating bell top-right of the content, drawer (desktop) / bottom sheet (mobile) ----------

function VariantCDrawer({ open, close }: { open: boolean; close: () => void }) {
  const { items } = useFeed();
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, close, ref);
  if (!open) return null;
  const fresh = items.filter((n) => !n.read);
  const older = items.filter((n) => n.read);
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-2xl border bg-popover text-popover-foreground shadow-xl md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-96 md:rounded-none md:rounded-l-2xl"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30 md:hidden" />
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-base font-semibold">Notifications</h2>
          <div className="flex items-center gap-1">
            <MarkAll />
            <button onClick={close} aria-label="Close" className="rounded-md p-2 text-muted-foreground hover:bg-accent">
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto pb-4">
          {items.length === 0 ? (
            <Empty />
          ) : (
            <>
              {fresh.length > 0 && (
                <>
                  <h3 className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">New</h3>
                  <div className="divide-y border-y">
                    {fresh.map((n) => (
                      <Row key={n.id} n={n} onNavigate={close} />
                    ))}
                  </div>
                </>
              )}
              {older.length > 0 && (
                <>
                  <h3 className="px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Earlier</h3>
                  <div className="divide-y border-y">
                    {older.map((n) => (
                      <Row key={n.id} n={n} onNavigate={close} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ---------- switcher ----------

function Switcher({ current }: { current: string }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const empty = params.get("empty") === "1";
  const idx = PROTOTYPE_VARIANTS.findIndex((v) => v.key === current);

  function go(next: string, nextEmpty = empty) {
    const p = new URLSearchParams(params);
    p.set("variant", next);
    if (nextEmpty) p.set("empty", "1");
    else p.delete("empty");
    navigate({ search: p.toString() }, { replace: true });
  }
  const step = (d: number) => go(PROTOTYPE_VARIANTS[(idx + d + PROTOTYPE_VARIANTS.length) % PROTOTYPE_VARIANTS.length].key);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  return (
    <div className="fixed bottom-3 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full bg-neutral-900 p-1 text-xs text-white shadow-xl">
      <button onClick={() => step(-1)} aria-label="Previous variant" className="rounded-full p-1.5 hover:bg-white/15">
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-36 px-1 text-center font-medium">
        {current} ({PROTOTYPE_VARIANTS[idx].name})
      </span>
      <button onClick={() => step(1)} aria-label="Next variant" className="rounded-full p-1.5 hover:bg-white/15">
        <ChevronRight className="size-4" />
      </button>
      <button onClick={() => go(current, !empty)} className={cn("rounded-full px-2.5 py-1.5 font-medium", empty ? "bg-white text-neutral-900" : "hover:bg-white/15")}>
        Empty
      </button>
    </div>
  );
}

// ---------- shell: wraps the real app layout ----------

export function NotificationPrototype({
  role,
  renderLayout,
}: {
  role: UserRole | null;
  renderLayout: (slots: {
    headerAction: React.ReactNode;
    extraNav: React.ReactNode;
    topBar: React.ReactNode;
    overlay: React.ReactNode;
    pageOverride: React.ReactNode | null;
  }) => React.ReactNode;
}) {
  const variant = useVariant();
  const [params] = useSearchParams();
  const empty = params.get("empty") === "1";
  const [read, setRead] = useState<Set<number>>(new Set());
  const [pageOpen, setPageOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const items = useMemo(
    () => (empty ? [] : seed(role).map((n) => ({ ...n, read: n.read || read.has(n.id) }))),
    [role, read, empty]
  );
  const ctx: FeedCtx = {
    items,
    unread: items.filter((n) => !n.read).length,
    markRead: (id) => setRead((s) => new Set(s).add(id)),
    markAllRead: () => setRead(new Set(items.map((n) => n.id))),
  };

  // close surfaces when switching variants
  useEffect(() => {
    setPageOpen(false);
    setDrawerOpen(false);
  }, [variant]);

  const mobileTop = (action: React.ReactNode) => (
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border bg-sidebar px-4 text-sidebar-foreground md:hidden">
      <span className="text-lg font-bold tracking-tight">Cadence</span>
      {action}
    </div>
  );

  let slots: Parameters<typeof renderLayout>[0] = { headerAction: null, extraNav: null, topBar: null, overlay: null, pageOverride: null };
  if (variant === "A") {
    slots = { ...slots, headerAction: <div className="hidden md:block ml-auto"><VariantABell /></div>, topBar: mobileTop(<VariantABell mobile />) };
  } else if (variant === "B") {
    slots = {
      ...slots,
      extraNav: <VariantBNav open={pageOpen} setOpen={setPageOpen} />,
      topBar: mobileTop(
        <button onClick={() => setPageOpen((o) => !o)} aria-label="Notifications" className="relative inline-flex size-10 items-center justify-center rounded-md hover:bg-sidebar-accent">
          <Bell className="size-4" />
          <UnreadBadge count={ctx.unread} className="absolute right-0 top-0 min-w-4 px-1 text-[10px] leading-4" />
        </button>
      ),
      pageOverride: pageOpen ? <VariantBPage close={() => setPageOpen(false)} /> : null,
    };
  } else {
    const bell = <BellButton onClick={() => setDrawerOpen(true)} open={drawerOpen} />;
    slots = {
      ...slots,
      topBar: mobileTop(bell),
      overlay: (
        <>
          <div className="pointer-events-none fixed right-4 top-3 z-30 hidden md:block">
            <div className="pointer-events-auto rounded-full border bg-background shadow-sm [&_button]:text-foreground/70 [&_button]:hover:bg-accent">
              {bell}
            </div>
          </div>
          <VariantCDrawer open={drawerOpen} close={() => setDrawerOpen(false)} />
        </>
      ),
    };
  }

  return (
    <Ctx.Provider value={ctx}>
      {renderLayout(slots)}
      <Switcher current={variant} />
    </Ctx.Provider>
  );
}
