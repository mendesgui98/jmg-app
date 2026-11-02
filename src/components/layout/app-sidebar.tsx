import { Link, useLocation } from "@tanstack/react-router";
import { PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { useSidebarCollapsed } from "@/hooks/use-sidebar-collapsed";
import { useMe } from "@/hooks/use-me";
import { isMac, openSearch } from "@/lib/command-palette";
import { cn } from "@/lib/utils";
import { Brand } from "./brand";
import { SETTINGS_ITEM, isActive, visibleGroups, type NavColor, type NavItem } from "./nav-config";
import { UserMenu } from "./user-menu";

/** Ícone de cada módulo num quadradinho em um tom da paleta azul JMG do seu grupo. */
const NAV_CHIP: Record<NavColor, string> = {
  blue: "bg-primary-soft text-primary",
  navy: "bg-extra-soft text-extra",
  sky: "bg-sky-500/15 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
  slate: "bg-slate-500/12 text-slate-600 dark:bg-slate-400/15 dark:text-slate-300",
};

export function NavLink({
  item,
  onNavigate,
  compact = false,
}: {
  item: NavItem;
  onNavigate?: (() => void) | undefined;
  /** Menu recolhido: só o ícone (o nome aparece ao passar o mouse). */
  compact?: boolean;
}) {
  const { pathname } = useLocation();
  const active = isActive(pathname, item.to);
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={compact ? item.label : undefined}
      aria-label={compact ? item.label : undefined}
      className={cn(
        "group relative flex h-10 items-center gap-3 rounded-xl px-2 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        compact && "justify-center px-0",
        active
          ? "bg-gradient-to-r from-hero to-hero-end font-semibold text-hero-foreground shadow-hero"
          : "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105",
          active ? "bg-gold/20 text-gold" : NAV_CHIP[item.color ?? "slate"],
        )}
      >
        <item.icon className="h-4 w-4" />
      </span>
      {!compact && item.label}
      {active && !compact && (
        <span aria-hidden className="ml-auto mr-1 h-1.5 w-1.5 rounded-full bg-gold" />
      )}
    </Link>
  );
}

/** Lista de navegação agrupada (usada na barra lateral e no menu "Mais" do celular). */
export function NavGroups({
  onNavigate,
  compact = false,
}: {
  onNavigate?: (() => void) | undefined;
  compact?: boolean;
}) {
  const { data: me } = useMe();
  return (
    <nav className={compact ? "space-y-3" : "space-y-5"} aria-label="Navegação principal">
      {visibleGroups(!!me?.canSeeCosts).map((g) => (
        <div key={g.label}>
          {compact ? (
            <hr className="mx-2 mb-2 border-sidebar-border" aria-hidden />
          ) : (
            <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-primary/70">
              {g.label}
            </p>
          )}
          <div className="space-y-1">
            {g.items.map((item) => (
              <NavLink key={item.to} item={item} onNavigate={onNavigate} compact={compact} />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function SearchButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openSearch}
      className={cn(
        "flex h-10 w-full items-center gap-2 rounded-xl border border-sidebar-border bg-card px-3 text-sm text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring outline-none",
        className,
      )}
    >
      <Search className="h-4 w-4" />
      <span className="flex-1 text-left">Buscar…</span>
      <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium sm:inline">
        {isMac() ? "⌘" : "Ctrl"} K
      </kbd>
    </button>
  );
}

export function AppSidebar({ onSignOut }: { onSignOut: () => void }) {
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const Toggle = collapsed ? PanelLeftOpen : PanelLeftClose;
  const toggle = (
    <button
      type="button"
      onClick={() => setCollapsed(!collapsed)}
      title={collapsed ? "Abrir menu" : "Recolher menu (tela cheia)"}
      aria-label={collapsed ? "Abrir menu" : "Recolher menu"}
      aria-expanded={!collapsed}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground transition-colors outline-none hover:bg-sidebar-accent/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
    >
      <Toggle className="h-[18px] w-[18px]" />
    </button>
  );
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar bg-gradient-to-b from-sidebar to-sidebar-end transition-[width] duration-200 lg:flex",
        collapsed ? "w-[72px]" : "w-64",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 pt-5 pb-4",
          collapsed ? "flex-col px-2" : "justify-between px-4",
        )}
      >
        <Brand compact={collapsed} />
        {toggle}
      </div>
      <div className={cn("pb-4", collapsed ? "flex justify-center px-2" : "px-3")}>
        {collapsed ? (
          <button
            type="button"
            onClick={openSearch}
            title="Buscar"
            aria-label="Buscar"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-sidebar-border bg-card text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Search className="h-4 w-4" />
          </button>
        ) : (
          <SearchButton />
        )}
      </div>
      <div className={cn("flex-1 overflow-y-auto pb-4", collapsed ? "px-2" : "px-3")}>
        <NavGroups compact={collapsed} />
      </div>
      <div
        className={cn(
          "space-y-1 border-t border-sidebar-border p-3",
          collapsed && "flex flex-col items-center px-2",
        )}
      >
        <NavLink item={SETTINGS_ITEM} compact={collapsed} />
        <UserMenu onSignOut={onSignOut} full={!collapsed} />
      </div>
    </aside>
  );
}
