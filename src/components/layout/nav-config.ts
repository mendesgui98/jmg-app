import {
  CalendarDays,
  CircleAlert,
  ListTodo,
  FileSignature,
  FileText,
  HardHat,
  LayoutDashboard,
  Layers,
  Package,
  Settings,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Só administrador e financeiro (custos e preços). */
  costs?: boolean;
  /** Tom de azul do módulo no menu, por grupo (só aparência). */
  color?: NavColor;
};
export type NavColor = "blue" | "navy" | "sky" | "slate";
export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Visão geral",
    items: [{ to: "/painel", label: "Painel", icon: LayoutDashboard, color: "blue" }],
  },
  {
    label: "Comercial",
    items: [
      { to: "/orcamentos", label: "Orçamentos", icon: FileText, costs: true, color: "navy" },
      { to: "/contratos", label: "Contratos", icon: FileSignature, costs: true, color: "navy" },
    ],
  },
  {
    label: "Execução",
    items: [
      { to: "/obras", label: "Obras", icon: HardHat, color: "sky" },
      { to: "/cronogramas", label: "Cronogramas", icon: CalendarDays, color: "sky" },
      { to: "/planejamento", label: "Planejamento", icon: ListTodo, color: "sky" },
      { to: "/pendencias", label: "Pendências", icon: CircleAlert, color: "sky" },
    ],
  },
  {
    label: "Gestão",
    items: [
      { to: "/financeiro", label: "Financeiro", icon: Wallet, costs: true, color: "blue" },
      { to: "/cadastros", label: "Cadastros", icon: Users, color: "blue" },
    ],
  },
  {
    label: "Catálogo",
    items: [
      { to: "/servicos", label: "Serviços", icon: Wrench, costs: true, color: "slate" },
      { to: "/materiais", label: "Materiais", icon: Package, costs: true, color: "slate" },
      { to: "/etapas", label: "Etapas e categorias", icon: Layers, color: "slate" },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = {
  to: "/configuracoes",
  label: "Configurações",
  icon: Settings,
  color: "slate",
};

export const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  financeiro: "Financeiro",
  equipe: "Equipe de obra",
};

export function visibleGroups(canSeeCosts: boolean) {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.costs || canSeeCosts),
  })).filter((g) => g.items.length);
}

/** Itens da barra inferior no celular (o 5º botão é "Mais"). */
export function mobileTabs(canSeeCosts: boolean): NavItem[] {
  const by = (to: string) => NAV_GROUPS.flatMap((g) => g.items).find((i) => i.to === to)!;
  return canSeeCosts
    ? [by("/painel"), by("/obras"), by("/orcamentos"), by("/financeiro")]
    : [by("/painel"), by("/obras"), by("/planejamento"), by("/pendencias")];
}

export const isActive = (pathname: string, to: string) =>
  pathname === to || pathname.startsWith(`${to}/`);
