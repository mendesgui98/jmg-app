import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileCheck, FileDown, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useMe } from "@/hooks/use-me";
import { fileExtension, openDocument, uploadDocument } from "@/lib/work-data";
import { documentFileName } from "@/lib/file-names";
import { fmtDate } from "@/lib/format";
import { text } from "@/lib/form-values";
import { CONTRACT_STATUS } from "@/lib/status-badges";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, selectClass } from "@/components/works/fields";
import { cn } from "@/lib/utils";

// Situação do contrato (aguardando revisão → aguardando assinatura → assinado), PDF gerado pelo
// modelo oficial e o documento assinado guardado no bucket privado. Usado no menu Contratos e na
// aba Contrato da obra; só o administrador muda a situação (RLS de contracts).

type ContractRow = Database["public"]["Tables"]["contracts"]["Row"];

export function ContractStatusBadge({ status }: { status: string }) {
  const s = CONTRACT_STATUS[status];
  return <Badge variant={s?.variant ?? "neutral"}>{s?.label ?? status}</Badge>;
}

export function ContractActions({
  contract,
  badge = true,
  client,
}: {
  contract: ContractRow;
  /** Cliente da obra, para o nome do arquivo baixado ("CT-2026-0042 - Mariana Ribeiro.pdf"). */
  client?: string | null | undefined;
  /** false quando a situação já aparece ao lado do título. */
  badge?: boolean;
}) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [signing, setSigning] = useState(false);
  const [busy, setBusy] = useState(false);
  const signed = contract.status === "assinado";
  const refresh = () => {
    for (const key of [["relationships"], ["contract", contract.work_id], ["contracts"]])
      qc.invalidateQueries({ queryKey: key });
  };
  async function setStatus(status: string) {
    setBusy(true);
    const r = await supabase.from("contracts").update({ status }).eq("id", contract.id);
    setBusy(false);
    if (r.error) toast.error(r.error.message);
    else {
      toast.success("Situação do contrato atualizada.");
      refresh();
    }
  }
  async function sign(d: FormData) {
    setBusy(true);
    try {
      const f = d.get("signed");
      if (!(f instanceof File) || !f.size) throw Error("Anexe o contrato assinado.");
      const path = await uploadDocument(f, "contracts");
      const r = await supabase
        .from("contracts")
        .update({ status: "assinado", signed_path: path, signed_date: text(d, "date") || null })
        .eq("id", contract.id);
      if (r.error) throw r.error;
      toast.success("Contrato assinado guardado.");
      setSigning(false);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const open = (path: string, suffix?: string) =>
    openDocument(
      path,
      documentFileName(contract.code || "Contrato", client, suffix ? { suffix } : {}).replace(
        /\.pdf$/,
        fileExtension(path),
      ),
    ).catch((e) => toast.error(e.message));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {me?.isAdmin && !signed ? (
        <select
          aria-label="Situação do contrato"
          className={cn(selectClass, "h-9 w-auto py-1 text-sm")}
          value={contract.status}
          disabled={busy}
          onChange={(e) =>
            e.target.value === "assinado" ? setSigning(true) : void setStatus(e.target.value)
          }
        >
          <option value="aguardando_revisao">Aguardando revisão</option>
          <option value="aguardando_assinatura">Aguardando assinatura</option>
          <option value="assinado">Contrato assinado…</option>
        </select>
      ) : (
        badge && <ContractStatusBadge status={contract.status} />
      )}
      {contract.generated_path && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => open(contract.generated_path!)}
        >
          <FileDown className="h-4 w-4" />
          PDF gerado
        </Button>
      )}
      {contract.signed_path && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => open(contract.signed_path!, "assinado")}
        >
          <FileCheck className="h-4 w-4" />
          Contrato assinado{contract.signed_date ? ` · ${fmtDate(contract.signed_date)}` : ""}
        </Button>
      )}
      {me?.isAdmin && !signed && (
        <Button type="button" size="sm" variant="outline" onClick={() => setSigning(true)}>
          <Upload className="h-4 w-4" />
          Enviar contrato assinado
        </Button>
      )}
      <Dialog open={signing} onOpenChange={setSigning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contrato assinado</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Anexe o documento com as assinaturas (PDF ou foto). Depois de registrado, o contrato
            fica bloqueado; mudanças entram como aditivo.
          </p>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void sign(new FormData(e.currentTarget));
            }}
          >
            <Field name="date" label="Data da assinatura" type="date" required />
            <Field name="signed" label="Documento assinado" type="file" required />
            <Button type="submit" disabled={busy}>
              Registrar assinatura
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
