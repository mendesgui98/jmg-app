import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, RefreshCw } from "lucide-react";
import { apiConfigured, apiSend } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Notice } from "@/components/kpi";
import { PageSkeleton } from "@/components/feedback";

// Prévia do orçamento: a mesma página do PDF oficial (modelo JMG, gerada pela API), mostrada na
// tela sem gerar o arquivo, para conferir e corrigir antes de gerar o PDF. Abre mesmo quando ainda
// falta algo para o PDF e lista o que falta.

export function ProposalPreviewButton({ budgetId }: { budgetId: string }) {
  const [open, setOpen] = useState(false);
  if (!apiConfigured) return null;
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Eye className="h-4 w-4" /> Visualizar orçamento
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[96vh] w-[min(900px,96vw)] max-w-none flex-col gap-3 sm:max-w-none">
          {open && <Preview budgetId={budgetId} onClose={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Preview({ budgetId, onClose }: { budgetId: string; onClose: () => void }) {
  const { data, error, isFetching, refetch } = useQuery({
    queryKey: ["budget-preview", budgetId],
    queryFn: () =>
      apiSend<{ html: string; issues: string[] }>("POST", `/v1/orcamentos/${budgetId}/previa`),
    retry: false,
    gcTime: 0,
  });
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5 text-primary" />
          Visualização do orçamento
        </DialogTitle>
      </DialogHeader>
      <p className="text-sm text-muted-foreground">
        É assim que o orçamento sai no PDF para o cliente. Se algo precisar mudar, feche, corrija e
        visualize de novo antes de gerar o PDF.
      </p>
      {data && data.issues.length > 0 && (
        <Notice tone="alert">Antes de gerar o PDF: {data.issues.join(" ")}</Notice>
      )}
      {error && (
        <Notice tone="negative">
          Não foi possível montar a visualização: {(error as Error).message}
        </Notice>
      )}
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-muted">
        {data ? (
          <iframe
            title="Visualização do orçamento"
            srcDoc={data.html}
            sandbox=""
            className="h-[70vh] w-full bg-white"
          />
        ) : (
          isFetching && <PageSkeleton cards={1} />
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Atualizar
        </Button>
        <Button type="button" onClick={onClose}>
          Fechar e corrigir
        </Button>
      </div>
    </>
  );
}
