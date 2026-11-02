import { RecordDeleteButton, RecordTrash } from "@/components/management/record-deletion";
import { formatCep, formatCpfCnpj, formatPhone, formatRg } from "@/lib/documents";
import { capitalizeWordsProps } from "@/lib/text-case";
import { pageMeta } from "@/lib/page-meta";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import {
  Contact,
  Hammer,
  Mail,
  PencilRuler,
  Phone,
  Plus,
  Search,
  Truck,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { SubmitForm } from "@/components/enter-submit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { IconBubble, Segmented } from "@/components/kpi";
import { panelClass, segmentClass } from "@/lib/surface";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { selectClass } from "@/components/works/fields";
import { EmptyState, ListSkeleton, PageSkeleton } from "@/components/feedback";

type Person = Database["public"]["Tables"]["people"]["Row"];
type Kind = Database["public"]["Enums"]["person_kind"];

export const Route = createFileRoute("/_authenticated/cadastros")({
  validateSearch: (s: Record<string, unknown>): { kind?: string; edit?: string } => ({
    kind: typeof s["kind"] === "string" ? s["kind"] : "cliente",
    edit: typeof s["edit"] === "string" ? s["edit"] : "",
  }),
  head: () => pageMeta("Cadastros", "Clientes, arquitetos, fornecedores e prestadores da JMG."),
  component: Cadastros,
});

const KINDS: { k: Kind; label: string; one: string }[] = [
  { k: "cliente", label: "Clientes", one: "Cliente" },
  { k: "contato", label: "Contatos", one: "Contato" },
  { k: "arquiteto", label: "Arquitetos", one: "Arquiteto" },
  { k: "fornecedor", label: "Fornecedores", one: "Fornecedor" },
  { k: "prestador", label: "Prestadores", one: "Prestador" },
];

const KIND_ICON: Record<Kind, LucideIcon> = {
  cliente: User,
  contato: Contact,
  arquiteto: PencilRuler,
  fornecedor: Truck,
  prestador: Hammer,
};

const FIELDS: [keyof Person, string, string?][] = [
  ["name", "Nome / Razão social"],
  ["document", "CPF / CNPJ"],
  ["rg", "RG"],
  ["phone", "Telefone"],
  ["email", "E-mail"],
  ["endereco", "Endereço"],
  ["bairro", "Bairro"],
  ["cidade", "Cidade"],
  ["uf", "UF"],
  ["cep", "CEP"],
  ["specialty", "Especialidade / ramo"],
];

// Pontuação aplicada enquanto digita; o valor é salvo já pontuado.
const MASKS: Partial<Record<keyof Person, (v: string) => string>> = {
  document: formatCpfCnpj,
  rg: formatRg,
  phone: formatPhone,
  cep: formatCep,
};
// Primeira letra de cada palavra maiúscula enquanto digita.
const CAPITALIZED = new Set<keyof Person>(["name", "endereco", "bairro", "cidade"]);

// Busca aceita o documento com ou sem pontuação.
function matches(value: string, q: string) {
  const query = q.toLowerCase();
  if (value.toLowerCase().includes(query)) return true;
  const qDigits = q.replace(/\D/g, "");
  return qDigits.length > 0 && qDigits === q.trim() && value.replace(/\D/g, "").includes(qDigits);
}

function Cadastros() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const kind = KINDS.find((k) => k.k === search.kind)?.k ?? "cliente";
  const setKind = (kind: string) => navigate({ to: "/cadastros", search: { kind, edit: "" } });
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [edit, setEdit] = useState<Partial<Person> | null>(null);
  const qc = useQueryClient();

  const { data = [] } = useQuery({
    queryKey: ["people", kind],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("people")
        .select("*")
        .is("deleted_at", null)
        .eq("kind", kind)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (search.edit) {
      const p = data.find((p) => p.id === search.edit);
      if (p) setEdit(p);
    }
  }, [search.edit, data]);
  const save = useMutation({
    mutationFn: async (p: Partial<Person>) => {
      if (!p.name?.trim()) throw new Error("Informe o nome.");
      const payload = {
        ...p,
        kind: p.kind ?? kind,
        name: p.name.trim(),
        document: p.document ? formatCpfCnpj(p.document) : p.document,
        rg: p.rg ? formatRg(p.rg) : p.rg,
        phone: p.phone ? formatPhone(p.phone).replace(/\s*\/\s*$/, "") : p.phone,
        cep: p.cep ? formatCep(p.cep) : p.cep,
      } as Person;
      const { error } = p.id
        ? await supabase.from("people").update(payload).eq("id", p.id)
        : await supabase.from("people").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Salvo.");
      setEdit(null);
      navigate({ to: "/cadastros", search: { kind, edit: "" }, replace: true });
      qc.invalidateQueries({ queryKey: ["people"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const list = data.filter(
    (p) =>
      (showInactive || p.active) && [p.name, p.document, p.phone].some((v) => matches(v ?? "", q)),
  );

  return (
    <div>
      <PageHeader
        title="Cadastros"
        subtitle="Clientes, contatos, arquitetos, fornecedores e prestadores."
        actions={
          <>
            <RecordTrash entity="people" />
            <Button onClick={() => setEdit({ kind, active: true })}>
              <Plus className="h-4 w-4" /> Novo
            </Button>
          </>
        }
      />
      <Segmented className="mb-4">
        {KINDS.map((k) => (
          <button
            key={k.k}
            type="button"
            role="tab"
            aria-selected={kind === k.k}
            onClick={() => setKind(k.k)}
            className={segmentClass(kind === k.k)}
          >
            {k.label}
          </button>
        ))}
      </Segmented>
      <div
        className={cn(
          panelClass,
          "mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 p-3 shadow-none sm:p-4",
        )}
      >
        <div className="relative w-full min-w-0 sm:w-auto sm:max-w-sm sm:flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} /> Mostrar arquivados
        </label>
      </div>
      {list.length ? (
        <div className={cn(panelClass, "divide-y divide-border/60 overflow-hidden")}>
          {list.map((p) => (
            <article
              key={p.id}
              className={cn(
                "flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-4 sm:flex-nowrap sm:px-5",
                !p.active && "opacity-70",
              )}
            >
              <IconBubble icon={KIND_ICON[p.kind] ?? Users} tone="neutral" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link
                    to="/cadastros/$id"
                    params={{ id: p.id }}
                    className="min-w-0 break-words font-medium leading-snug text-foreground hover:text-primary"
                  >
                    {p.name}
                  </Link>
                  {!p.active && <Badge variant="neutral">Arquivado</Badge>}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {p.phone && (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <Phone className="h-3.5 w-3.5" aria-hidden />
                      {formatPhone(p.phone)}
                    </span>
                  )}
                  {p.email && (
                    <span className="inline-flex min-w-0 items-center gap-1 break-all">
                      <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {p.email}
                    </span>
                  )}
                  {p.specialty && <span>{p.specialty}</span>}
                  {!p.phone && !p.email && !p.specialty && <span>Sem contato informado</span>}
                </div>
              </div>
              <div className="-mb-1 -ml-3 flex w-full shrink-0 items-center gap-1 pl-12 sm:m-0 sm:w-auto sm:p-0">
                <Button size="sm" variant="ghost" onClick={() => setEdit(p)}>
                  Editar
                </Button>
                <RecordDeleteButton entity="people" id={p.id} name={p.name} />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          compact
          icon={Users}
          title="Nenhum cadastro encontrado"
          description="Ajuste a busca ou cadastre uma nova pessoa."
        />
      )}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <SubmitForm onSubmit={() => edit && save.mutate(edit)} pending={save.isPending}>
            <DialogHeader>
              <DialogTitle>{edit?.id ? "Editar cadastro" : "Novo cadastro"}</DialogTitle>
            </DialogHeader>
            {edit && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <Label>Tipo</Label>
                  <select
                    className={selectClass}
                    value={edit.kind ?? kind}
                    onChange={(e) => setEdit({ ...edit, kind: e.target.value as Kind })}
                  >
                    {KINDS.map((k) => (
                      <option key={k.k} value={k.k}>
                        {k.one}
                      </option>
                    ))}
                  </select>
                </div>
                {FIELDS.map(([f, l]) => (
                  <div
                    key={f}
                    className={
                      f === "name" || f === "endereco" ? "space-y-1 sm:col-span-2" : "space-y-1"
                    }
                  >
                    <Label>{l}</Label>
                    <Input
                      value={(edit[f] as string) ?? ""}
                      inputMode={
                        f === "document" || f === "cep"
                          ? "numeric"
                          : f === "phone"
                            ? "tel"
                            : undefined
                      }
                      {...(CAPITALIZED.has(f) ? capitalizeWordsProps : {})}
                      onChange={(e) =>
                        setEdit({ ...edit, [f]: MASKS[f]?.(e.target.value) ?? e.target.value })
                      }
                    />
                  </div>
                ))}
                <div className="space-y-1 sm:col-span-2">
                  <Label>Observações</Label>
                  <Textarea
                    value={edit.notes ?? ""}
                    onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={edit.active ?? true}
                    onCheckedChange={(v) => setEdit({ ...edit, active: v })}
                  />{" "}
                  Ativo
                </label>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEdit(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={save.isPending}>
                Salvar
              </Button>
            </DialogFooter>
          </SubmitForm>
        </DialogContent>
      </Dialog>
    </div>
  );
}
