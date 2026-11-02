import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarClock,
  FileSignature,
  FileSpreadsheet,
  FileText,
  HardHat,
  History,
  Percent,
  Receipt,
  ShoppingCart,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { formatCpfCnpj, formatPhone, formatRg } from "@/lib/documents";
import { RecordDeleteButton, DeletedRecordNotice } from "@/components/management/record-deletion";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { relationshipOptions } from "@/lib/relationship-data";
import { dashboardOptions } from "@/lib/dashboard-data";
import { financeOptions } from "@/lib/finance-data";
import { useMe } from "@/hooks/use-me";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Attachment } from "@/components/works/fields";
import { fmtBRL, fmtDate } from "@/lib/format";
import { entryState } from "@/lib/dashboard-math";
import { EmptyState, ListSkeleton, PageSkeleton } from "@/components/feedback";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { BUDGET_STATUS_VARIANT, CONTRACT_STATUS, WORK_STATUS_VARIANT } from "@/lib/status-badges";
import { IconBubble, KpiCard, Money, type Tone } from "@/components/kpi";
import { STATUS_LABEL as BUDGET_STATUS_LABEL } from "@/lib/budget-status";
import { panelClass } from "@/lib/surface";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { WORK_STATUS_LABEL } from "@/lib/work-status";

const KIND_LABEL: Record<string, string> = {
  cliente: "Cliente",
  contato: "Contato",
  arquiteto: "Arquiteto",
  fornecedor: "Fornecedor",
  prestador: "Prestador",
};
const PURCHASE_STATUS: Record<string, string> = {
  pedido: "Pedido",
  parcial: "Recebido em parte",
  recebido: "Recebido",
  cancelado: "Cancelado",
};

/** Seção do perfil: título discreto e lista num painel suave. */
function Section({
  title,
  icon,
  children,
  empty,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode[];
  empty?: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <IconBubble icon={icon} tone="neutral" className="h-8 w-8 rounded-lg" />
        {title}
      </h2>
      {children.length ? (
        <div className={cn(panelClass, "divide-y divide-border/60 overflow-hidden")}>
          {children}
        </div>
      ) : (
        (empty ?? <p className="px-1 text-sm text-muted-foreground">Nenhum registro.</p>)
      )}
    </section>
  );
}
const rowClass =
  "flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3.5 text-sm sm:px-5";
export function PersonProfile({ id }: { id: string }) {
  const { data: me } = useMe();
  const { data, error } = useQuery(relationshipOptions(!!me?.canSeeCosts));
  const { data: dash } = useQuery({ ...dashboardOptions, enabled: !!me?.canSeeCosts });
  const { data: finance } = useQuery({ ...financeOptions, enabled: !!me?.canSeeCosts });
  if (error)
    return (
      <p role="alert" className="text-destructive">
        {error.message}
      </p>
    );
  const person = data?.people.find((p) => p.id === id);
  if (!data) return <PageSkeleton cards={3} />;
  if (!person) return <p>Cadastro não encontrado.</p>;
  if (person.deleted_at) return <DeletedRecordNotice entity="people" id={id} name={person.name} />;
  const budgets = data.budgets.filter(
    (b) => (!b.deleted_at && b.client_id === id) || b.architect_id === id,
  );
  const purchases = data.purchases.filter((p) => p.supplier_id === id);
  const workIds = new Set([
    ...data.works
      .filter((w) => !w.deleted_at && (w.client_id === id || w.architect_id === id))
      .map((w) => w.id),
    ...purchases.map((p) => p.work_id),
  ]);
  const works = data.works.filter((w) => workIds.has(w.id));
  const sums = dash?.works.filter((w) => workIds.has(w.work.id)) ?? [];
  const entries =
    finance?.entries.filter(
      (e) =>
        !e.canceled &&
        (e.person_id === id ||
          (person.kind === "fornecedor" &&
            purchases.some((p) => p.id === e.payable_order_id || p.id === e.purchase_order_id))),
    ) ?? [];
  const settled = (direction: string) =>
    entries
      .filter((e) => e.direction === direction)
      .reduce((t, e) => t + entryState(e, finance?.settlements ?? []).paid, 0);
  const pending = entries
    .filter((e) => e.direction === "saida")
    .reduce((t, e) => t + entryState(e, finance?.settlements ?? []).pending, 0);
  const commissionEntries = entries.filter((e) => e.category === "Comissão da arquiteta");
  const paidCommission = commissionEntries.reduce(
    (t, e) => t + entryState(e, finance?.settlements ?? []).paid,
    0,
  );
  const commission = sums.reduce((t, w) => t + w.result.commission, 0);
  const kpis: [string, number, Tone, LucideIcon, boolean?][] =
    person.kind === "arquiteto"
      ? [
          [
            "Valor das obras vinculadas",
            sums.reduce((t, w) => t + w.result.sale, 0),
            "neutral",
            HardHat,
          ],
          ["Comissão prevista", commission, "neutral", Percent],
          ["Comissão paga com vínculo", paidCommission, "neutral", ArrowDown],
          [
            "Comissão pendente",
            Math.max(0, commission - paidCommission),
            "alert",
            CalendarClock,
            true,
          ],
        ]
      : person.kind === "fornecedor"
        ? [
            [
              "Total comprado",
              purchases
                .filter((p) => p.status !== "cancelado")
                .reduce(
                  (t, p) => t + p.purchase_lines.reduce((s, l) => s + l.quantity * l.unit_price, 0),
                  0,
                ),
              "neutral",
              ShoppingCart,
            ],
            ["Pagamentos", settled("saida"), "negative", ArrowDown],
            ["A pagar", pending, "negative", Receipt, true],
          ]
        : [
            [
              "Valores contratados",
              sums.reduce((t, w) => t + w.result.sale, 0),
              "neutral",
              FileSignature,
            ],
            ["Recebido", sums.reduce((t, w) => t + w.totals.received, 0), "positive", ArrowUp],
            [
              "Saldo contratual",
              sums.reduce((t, w) => t + w.balance.receivable, 0),
              "positive",
              CalendarClock,
              true,
            ],
          ];
  const contracts = data.contracts.filter((c) => !c.deleted_at && workIds.has(c.work_id));
  const records = data.records.filter((r) => workIds.has(r.work_id));
  const history = data.history.filter((h) => h.entity_id === id);
  return (
    <div className="space-y-6">
      <Link
        to="/cadastros"
        search={{ kind: person.kind }}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Cadastros
      </Link>
      <PageHeader
        title={person.name}
        subtitle={`${KIND_LABEL[person.kind] ?? person.kind} · ${person.active ? "Ativo" : "Arquivado"}`}
        actions={
          <>
            <RecordDeleteButton entity="people" id={id} name={person.name} />
            <Button asChild variant="outline">
              <Link to="/cadastros" search={{ kind: person.kind, edit: id }}>
                Editar cadastro
              </Link>
            </Button>
          </>
        }
      />
      {me?.canSeeCosts && (
        <div
          className={cn(
            "grid grid-cols-2 gap-3 sm:gap-4",
            kpis.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
          )}
        >
          {kpis.map(([l, v, tone, icon, filled], i) => (
            <KpiCard
              key={l}
              label={l}
              icon={icon}
              tone={tone}
              filled={!!filled}
              className={cn(kpis.length === 3 && i === 0 && "col-span-2 lg:col-span-1")}
              value={<Money value={Number(v)} />}
            />
          ))}
        </div>
      )}
      <dl className={cn(panelClass, "grid grid-cols-2 gap-x-6 gap-y-4 p-4 sm:grid-cols-3 sm:p-5")}>
        {[
          ["Telefone", person.phone && formatPhone(person.phone)],
          ["E-mail", person.email],
          ["CPF / CNPJ", person.document && formatCpfCnpj(person.document)],
          ["RG", person.rg && formatRg(person.rg)],
          [
            "Endereço",
            [person.endereco, person.bairro, person.cidade, person.uf].filter(Boolean).join(", "),
          ],
          ["Especialidade", person.specialty],
          ["Observações", person.notes],
        ].map(([l, v]) => (
          <div
            key={l}
            className={cn(
              "min-w-0",
              (l === "E-mail" || l === "Endereço" || l === "Observações") &&
                "col-span-2 sm:col-span-1",
            )}
          >
            <dt className="text-xs text-muted-foreground">{l}</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium">{v || "—"}</dd>
          </div>
        ))}
      </dl>
      <Section
        title="Obras atuais e anteriores"
        icon={HardHat}
        empty={<EmptyState compact icon={HardHat} title="Nenhuma obra vinculada" />}
      >
        {works.map((w) => {
          const label = WORK_STATUS_LABEL[w.status] ?? w.status;
          const variant = WORK_STATUS_VARIANT[w.status] ?? "neutral";
          return (
            <Link
              key={w.id}
              to="/obras/$id"
              params={{ id: w.id }}
              className={cn(rowClass, "transition-colors hover:bg-muted/50")}
            >
              <span className="min-w-0">
                <span className="font-medium text-foreground">{w.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {data.people.find((p) => p.id === w.client_id)?.name}
                </span>
              </span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant={variant}>{label}</Badge>
                {fmtDate(w.planned_end)}
              </span>
            </Link>
          );
        })}
      </Section>
      {me?.canSeeCosts && (
        <>
          <Section title="Orçamentos" icon={FileSpreadsheet}>
            {budgets.map((b) => (
              <Link
                key={b.id}
                to="/orcamentos/$id"
                params={{ id: b.id }}
                className={cn(rowClass, "transition-colors hover:bg-muted/50")}
              >
                <span className="min-w-0 font-medium">
                  <span className="text-muted-foreground">#{b.number}</span> · {b.title}
                </span>
                <Badge variant={BUDGET_STATUS_VARIANT[b.status] ?? "neutral"}>
                  {BUDGET_STATUS_LABEL[b.status] ?? b.status}
                </Badge>
              </Link>
            ))}
          </Section>
          <Section title="Contratos" icon={FileSignature}>
            {contracts.map((c) => (
              <div key={c.id} className={rowClass}>
                <Link
                  to="/obras/$id"
                  params={{ id: c.work_id }}
                  search={{ tab: "contrato" }}
                  className="min-w-0 font-medium hover:text-primary"
                >
                  {works.find((w) => w.id === c.work_id)?.name}
                </Link>
                <span className="flex items-center gap-2">
                  <Badge variant={c.status === "assinado" ? "positive" : "neutral"}>
                    {CONTRACT_STATUS[c.status]?.label ?? c.status}
                  </Badge>
                  <Attachment path={c.signed_path} />
                </span>
              </div>
            ))}
          </Section>
          {person.kind === "fornecedor" && (
            <Section title="Compras" icon={ShoppingCart}>
              {purchases.map((p) => (
                <div key={p.id} className={rowClass}>
                  <Link
                    to="/obras/$id"
                    params={{ id: p.work_id }}
                    search={{ tab: "compras", record: p.id }}
                    className="min-w-0 hover:text-primary"
                  >
                    <span className="font-medium">{p.description}</span>
                    <span className="block text-xs text-muted-foreground">
                      {works.find((w) => w.id === p.work_id)?.name}
                    </span>
                  </Link>
                  <span className="flex items-center gap-2">
                    <Badge variant={p.status === "cancelado" ? "neutral" : "info"}>
                      {PURCHASE_STATUS[p.status] ?? p.status}
                    </Badge>
                    <Money
                      className="font-semibold"
                      value={p.purchase_lines.reduce((t, l) => t + l.quantity * l.unit_price, 0)}
                    />
                    <Attachment path={p.file_path} />
                  </span>
                </div>
              ))}
            </Section>
          )}
          <Section title="Pagamentos e contas vinculadas" icon={Wallet}>
            {entries.map((e) => (
              <div key={e.id} className={rowClass}>
                <Link
                  to="/financeiro"
                  search={{ work: e.work_id || "", entry: e.id }}
                  className="flex min-w-0 items-center gap-3 hover:text-primary"
                >
                  <IconBubble
                    icon={e.direction === "entrada" ? ArrowUp : ArrowDown}
                    tone={e.direction === "entrada" ? "positive" : "negative"}
                    className="h-8 w-8 rounded-lg"
                  />
                  <span className="min-w-0">
                    <span className="font-medium">{e.description}</span>
                    <span className="block text-xs text-muted-foreground">
                      parcela {e.installment_index}/{e.installment_count}
                    </span>
                  </span>
                </Link>
                <span className="text-right">
                  <Money
                    className="font-semibold"
                    value={e.amount}
                    tone={e.direction === "entrada" ? "positive" : "negative"}
                  />
                  <span className="block text-xs text-muted-foreground">
                    saldo <Money value={entryState(e, finance?.settlements ?? []).pending} />
                  </span>
                </span>
              </div>
            ))}
          </Section>
          <Section title="Documentos das obras" icon={FileText}>
            {records.map((r) => (
              <div key={r.id} className={rowClass}>
                <Link
                  to="/obras/$id"
                  params={{ id: r.work_id }}
                  search={{ tab: "documento", record: r.id }}
                  className="min-w-0 font-medium hover:text-primary"
                >
                  {r.title}
                </Link>
                <Attachment path={r.file_path} />
              </div>
            ))}
          </Section>
          <Section title="Histórico cadastral" icon={History}>
            {history.map((h) => (
              <p key={h.id} className="px-4 py-3 text-xs text-muted-foreground sm:px-5">
                Alteração registrada · {fmtDate(h.changed_at)}
              </p>
            ))}
          </Section>
        </>
      )}
    </div>
  );
}
