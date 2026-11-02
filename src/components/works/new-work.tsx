import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Plus, FileCheck, HardHat } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { IconBubble } from "@/components/kpi";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Memo, selectClass } from "./fields";
import { text, number } from "@/lib/form-values";
import { clearDraft } from "@/lib/clear-draft";
import { DraftForm } from "./draft-form";
import { localDate } from "@/lib/dashboard-math";
import { openingPosition } from "@/lib/work-opening";
import { uploadDocument } from "@/lib/work-data";
import { convertBudgetToWork } from "@/lib/work-budget";
export function NewWork() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("");
  const [busy, setBusy] = useState(false);
  const [request, setRequest] = useState(() => crypto.randomUUID());
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ["new-work-options"],
    enabled: open,
    queryFn: async () => {
      const [p, b] = await Promise.all([
        supabase
          .from("people")
          .select("id,name")
          .eq("kind", "cliente")
          .is("deleted_at", null)
          .eq("active", true),
        supabase
          .from("budgets")
          .select("id,number,title,client_display")
          .is("deleted_at", null)
          .eq("status", "aprovado")
          .eq("archived", false),
      ]);
      if (p.error) throw p.error;
      if (b.error) throw b.error;
      return { people: p.data, budgets: b.data };
    },
  });
  async function save(d: FormData) {
    setBusy(true);
    try {
      let id: string;
      if (mode === "budget") {
        id = await convertBudgetToWork(text(d, "budget"));
      } else {
        openingPosition(
          number(d, "original_value"),
          number(d, "existing_extras"),
          number(d, "received"),
          number(d, "paid"),
          number(d, "progress"),
        );
        const fields = [
          "name",
          "client_id",
          "address",
          "work_type",
          "responsible",
          "start",
          "end",
          "actual_start",
          "status",
          "reference_date",
          "payment_conditions",
          "notes",
        ];
        const payload: Record<string, string | number | boolean> = {};
        for (const f of fields) payload[f] = text(d, f);
        for (const f of [
          "original_value",
          "existing_extras",
          "received",
          "paid",
          "incurred",
          "pending_payable",
          "progress",
        ])
          payload[f] = number(d, f);
        payload["is_pilot"] = d.get("is_pilot") === "on";
        const r = await supabase.rpc("create_direct_work", {
          _request_id: request,
          _data: payload,
        });
        if (r.error) throw r.error;
        id = r.data;
        for (const name of ["documents", "photos"])
          for (const file of d.getAll(name)) {
            if (file instanceof File && file.size) {
              const path = await uploadDocument(file, "records");
              const rec = await supabase.from("work_records").insert({
                work_id: id,
                kind: name === "photos" ? "diario" : "documento",
                title: file.name,
                record_date: text(d, "reference_date"),
                file_path: path,
                body: "Anexo existente no cadastro inicial",
              });
              if (rec.error) throw rec.error;
            }
          }
      }
      await qc.invalidateQueries();
      setOpen(false);
      setMode("");
      setRequest(crypto.randomUUID());
      await clearDraft(`new-work-${mode}`);
      toast.success("Obra cadastrada.");
      await navigate({ to: "/obras/$id", params: { id } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        onClick={() => {
          setMode("");
          setOpen(true);
        }}
      >
        <Plus className="h-4 w-4" />
        Nova obra
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova obra</DialogTitle>
          </DialogHeader>
          {!mode ? (
            <div className="grid gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-14 justify-start gap-3 whitespace-normal rounded-xl p-3 text-left"
                onClick={() => setMode("budget")}
              >
                <IconBubble icon={FileCheck} tone="positive" />
                Criar a partir de orçamento aprovado
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-14 justify-start gap-3 whitespace-normal rounded-xl p-3 text-left"
                onClick={() => setMode("direct")}
              >
                <IconBubble icon={HardHat} tone="brand" />
                Cadastrar obra diretamente
              </Button>
            </div>
          ) : (
            <DraftForm
              scope={`new-work-${mode}`}
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                save(new FormData(e.currentTarget));
              }}
            >
              {mode === "budget" ? (
                <label className="text-sm">
                  Orçamento aprovado
                  <select
                    name="budget"
                    aria-label="Orçamento aprovado"
                    className={selectClass}
                    required
                  >
                    <option value="">Selecionar</option>
                    {data?.budgets.map((b) => (
                      <option key={b.id} value={b.id}>
                        #{b.number} · {b.title} · {b.client_display}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <>
                  <Field name="name" label="Nome da obra" required capitalize />
                  <label className="block text-sm">
                    Cliente
                    <select
                      name="client_id"
                      aria-label="Cliente da obra"
                      required
                      className={selectClass}
                    >
                      <option value="">Selecionar cliente</option>
                      {data?.people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Field name="address" label="Endereço / localização" capitalize />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field name="work_type" label="Tipo de obra" />
                    <Field name="responsible" label="Responsável" capitalize />
                    <Field name="start" label="Data de início" type="date" />
                    <Field name="end" label="Previsão de término" type="date" />
                  </div>
                  <label className="block text-sm">
                    Status atual
                    <select name="status" className={selectClass}>
                      <option value="contratacao">Em contratação</option>
                      <option value="execucao">Em execução</option>
                      <option value="pausada">Pausada</option>
                      <option value="concluida">Concluída</option>
                    </select>
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      name="original_value"
                      label="Valor original contratado (R$)"
                      type="number"
                      required
                    />
                    <Field
                      name="existing_extras"
                      label="Aditivos já existentes (R$)"
                      type="number"
                    />
                  </div>
                  <label className="block text-sm">
                    Esta obra já está em andamento?
                    <select name="ongoing" className={selectClass}>
                      <option value="nao">Não</option>
                      <option value="sim">Sim</option>
                    </select>
                  </label>
                  <Field
                    name="reference_date"
                    label="Data de referência da posição inicial"
                    type="date"
                    required
                    value={localDate()}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field name="actual_start" label="Início real" type="date" />
                    <Field name="received" label="Recebido antes do sistema (R$)" type="number" />
                    <Field name="paid" label="Despesas pagas anteriores (R$)" type="number" />
                    <Field
                      name="incurred"
                      label="Custos incorridos anteriores (R$)"
                      type="number"
                    />
                    <Field
                      name="pending_payable"
                      label="Contas a pagar anteriores (R$)"
                      type="number"
                    />
                    <Field name="progress" label="Avanço físico atual (%)" type="number" />
                  </div>
                  <Memo name="payment_conditions" label="Condições de pagamento" />
                  <Memo name="notes" label="Observações / escopo" />
                  <label className="block text-sm">
                    Documentos e contratos existentes
                    <input
                      aria-label="Documentos existentes"
                      type="file"
                      name="documents"
                      multiple
                      className={selectClass}
                    />
                  </label>
                  <label className="block text-sm">
                    Fotos existentes
                    <input
                      aria-label="Fotos existentes"
                      type="file"
                      accept="image/*"
                      name="photos"
                      multiple
                      className={selectClass}
                    />
                  </label>
                  <label className="flex gap-2 text-xs">
                    <input name="is_pilot" type="checkbox" />
                    PILOTO — TESTE (fora dos indicadores reais por padrão)
                  </label>
                </>
              )}
              <div className="flex justify-between gap-3">
                <Button type="button" variant="outline" onClick={() => setMode("")}>
                  Voltar
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Salvando…" : mode === "budget" ? "Iniciar obra" : "Cadastrar obra"}
                </Button>
              </div>
            </DraftForm>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
