import { RecordDeleteButton, DeletedRecordNotice } from "@/components/management/record-deletion";
import { formatCep, formatCnpj, formatCpfCnpj, formatRg } from "@/lib/documents";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { AlertTriangle, FileDown, FileCheck, FileText, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { contractTemplate } from "@/lib/contract-template";
import { loadWorkBudget, workBase } from "@/lib/work-budget";
import { computeBudget, splitPayments } from "@/lib/pricing";
import { fmtBRL, fmtDate, reaisPorExtenso } from "@/lib/format";
import { uploadDocument } from "@/lib/work-data";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { CONTRACT_STATUS } from "@/lib/status-badges";
import { IconBubble, type Tone } from "@/components/kpi";
import { panelClass } from "@/lib/surface";
import { cn } from "@/lib/utils";
import { Field, Attachment } from "./fields";
import { ContractActions } from "@/components/management/contract-status";
import { text } from "@/lib/form-values";
export function Contract({
  workId,
  budgetId,
  start,
  end,
  address,
}: {
  workId: string;
  budgetId: string | null;
  start: string | null;
  end: string | null;
  address: string | null;
}) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const { data, error } = useQuery({
    queryKey: ["contract", workId, start, end],
    queryFn: async () => {
      const [c, b, company] = await Promise.all([
        supabase.from("contracts").select("*").eq("work_id", workId).maybeSingle(),
        loadWorkBudget(workId),
        supabase.from("company_settings").select("*").single(),
      ]);
      if (c.error) throw c.error;
      if (company.error) throw company.error;
      const p = b.budget.client_id
        ? await supabase.from("people").select("*").eq("id", b.budget.client_id).maybeSingle()
        : { data: null };
      const x = company.data;
      const client = p.data;
      const r = workBase(b);
      const values: Record<string, string> = {
        CLIENTE: b.budget.client_display || client?.name || "",
        RG: formatRg(client?.rg),
        DOCUMENTO: formatCpfCnpj(client?.document),
        ENDERECO_CLIENTE: client
          ? [
              client.endereco,
              client.bairro,
              client.cidade,
              client.uf,
              client.cep && formatCep(client.cep),
            ]
              .filter(Boolean)
              .join(", ")
          : "",
        EMPRESA: [
          x.razao_social,
          x.cnpj && formatCnpj(x.cnpj),
          x.endereco,
          x.bairro,
          x.cidade,
          x.uf,
          x.cep && formatCep(x.cep),
        ]
          .filter(Boolean)
          .join("\n"),
        ENDERECO_OBRA: address || "",
        ORCAMENTO: budgetId
          ? `Orçamento nº ${b.budget.number} · revisão ${b.budget.revision}`
          : "Contrato externo · " + b.budget.title,
        VALOR: fmtBRL(r.saleNet),
        VALOR_EXTENSO: reaisPorExtenso(r.saleNet),
        PAGAMENTOS:
          "paymentConditions" in b
            ? b.paymentConditions || "{{PAGAMENTOS}}"
            : splitPayments(r.saleNet, b.terms)
                .rows.map((t) => `${t.label} · ${t.pct}% · ${fmtBRL(t.value)}`)
                .join("\n"),
        DADOS_BANCARIOS: [
          x.razao_social,
          `PIX: ${x.pix || "{{PIX}}"}`,
          `Banco: ${x.banco || "{{BANCO}}"}`,
          `Agência: ${x.agencia || "{{AGENCIA}}"}`,
          `Conta: ${x.conta || "{{CONTA}}"}`,
        ].join("\n"),
        INICIO: start ? fmtDate(start) : "",
        TERMINO: end ? fmtDate(end) : "",
        PRAZO: b.budget.estimated_term || "",
        ESCOPO:
          "scope" in b
            ? b.scope || "{{ESCOPO}}"
            : b.sections
                .map(
                  (s) =>
                    `${s.title}\n${b.items
                      .filter((i) => i.section_id === s.id)
                      .map((i) => `${i.description} — ${i.quantity} ${i.unit}`)
                      .join("\n")}\nMateriais inclusos: ${s.materials_text || "não informados"}`,
                )
                .join("\n\n"),
        ASSINATURA_JMG: [x.razao_social, x.cnpj && formatCnpj(x.cnpj), x.responsavel]
          .filter(Boolean)
          .join("\n"),
      };
      const generated = contractTemplate.replace(
        /\{\{([^}]+)\}\}/g,
        (match, key) => values[key] || match,
      );
      return { contract: c.data, generated, client: values["CLIENTE"] ?? "" };
    },
  });
  useEffect(() => {
    if (data) setBody(data.contract?.body || data.generated);
  }, [data]);
  async function save(status = "aguardando_revisao", d?: FormData) {
    if (!me?.isAdmin) return;
    setBusy(true);
    try {
      const f = d?.get("signed");
      const path =
        f instanceof File && f.size
          ? await uploadDocument(f, "contracts")
          : data?.contract?.signed_path;
      const payload = {
        work_id: workId,
        body,
        status,
        signed_path: path ?? null,
        signed_date: d ? text(d, "date") || null : null,
      };
      const r = data?.contract
        ? await supabase.from("contracts").update(payload).eq("id", data.contract.id)
        : await supabase.from("contracts").insert(payload);
      if (r.error) throw r.error;
      qc.invalidateQueries({ queryKey: ["contract", workId] });
      toast.success(status === "assinado" ? "Contrato assinado registrado." : "Contrato salvo.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const missing = [...new Set(body.match(/\{\{[^}]+\}\}/g) ?? [])];
  const signed = data?.contract?.status === "assinado";
  const status = (data?.contract && CONTRACT_STATUS[data.contract.status]) || {
    label: data?.contract?.status || "Não gerado",
    variant: "neutral" as const,
    tone: "neutral" as const,
  };
  if (data?.contract?.deleted_at)
    return <DeletedRecordNotice entity="contracts" id={data.contract.id} name="Contrato" />;
  if (error) return <p className="text-destructive">{error.message}</p>;
  // Obra com orçamento aprovado: o contrato é o PDF do modelo oficial (gerado pelo orçamento) e
  // segue a mesma situação do menu Contratos. O editor de texto fica para contratos antigos.
  if (budgetId && data && (!data.contract || data.contract.generated_path || !data.contract.body))
    return (
      <section className={cn(panelClass, "space-y-4 p-4 sm:p-5")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <IconBubble icon={FileText} tone={status.tone} />
            <div>
              <h2 className="text-base font-semibold">
                Contrato {data.contract?.code && <span>· {data.contract.code}</span>}
              </h2>
              <p className="text-xs text-muted-foreground">
                {data.contract?.generated_at
                  ? `Gerado em ${fmtDate(data.contract.generated_at)} pelo modelo oficial`
                  : "Ainda não gerado"}
              </p>
            </div>
          </div>
          {data.contract?.status !== "assinado" && (
            <Button asChild>
              <Link to="/orcamentos/$id/pdf" params={{ id: budgetId }} search={{ doc: "contrato" }}>
                <FileDown className="h-4 w-4" />
                {data.contract ? "Gerar de novo" : "Gerar contrato"}
              </Link>
            </Button>
          )}
        </div>
        {data.contract ? (
          <ContractActions contract={data.contract} client={data.client} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Ao gerar, o contrato entra em Contratos como aguardando assinatura.
          </p>
        )}
      </section>
    );
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <IconBubble icon={FileText} tone={status.tone} />
          <h2 className="text-base font-semibold">Contrato</h2>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data?.contract && (
            <RecordDeleteButton entity="contracts" id={data.contract.id} name="Contrato" />
          )}
          <Attachment path={data?.contract?.signed_path} />
          {data?.contract && (
            <Button variant="outline" asChild>
              <Link to="/obras/$id/contrato/pdf" params={{ id: workId }}>
                <FileDown className="h-4 w-4" />
                Revisar PDF
              </Link>
            </Button>
          )}
        </div>
      </div>
      {missing.length > 0 && (
        <div className="flex gap-3 rounded-xl bg-alert-soft p-4 text-sm text-alert">
          <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <b>Dados ausentes</b>
            <p className="break-words">
              {missing.map((s) => s.replace(/[{}]/g, "").replace(/_/g, " ")).join(", ")}
            </p>
          </div>
        </div>
      )}
      <Textarea
        aria-label="Texto do contrato"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={22}
        disabled={!me?.isAdmin || signed}
        className="rounded-xl bg-card font-sans text-sm leading-relaxed shadow-card"
      />
      {me?.isAdmin && !signed && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={() => save()}>
              <Save className="h-4 w-4" />
              Salvar rascunho
            </Button>
            <Button
              disabled={busy || missing.length > 0}
              onClick={() => save("aguardando_assinatura")}
            >
              <FileCheck className="h-4 w-4" />
              Finalizar contrato
            </Button>
          </div>
          {data?.contract?.status === "aguardando_assinatura" && (
            <form
              className={cn(panelClass, "flex flex-wrap items-end gap-3 p-4 shadow-none sm:p-5")}
              onSubmit={(e) => {
                e.preventDefault();
                save("assinado", new FormData(e.currentTarget));
              }}
            >
              <Field name="date" label="Data da assinatura" type="date" required />
              <Field name="signed" label="Contrato assinado" type="file" required />
              <Button type="submit" disabled={busy}>
                Registrar assinatura
              </Button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
