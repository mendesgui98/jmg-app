import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  BadgeCheck,
  Download,
  ExternalLink,
  Eye,
  FileDown,
  History,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { budgetVersionsOptions, hasUnsavedChanges } from "@/lib/budget-versions";
import { openDocument } from "@/lib/work-data";
import { documentFileName } from "@/lib/file-names";
import { fmtDate, fmtStamp } from "@/lib/format";
import { panelClass } from "@/lib/surface";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IconBubble, Money, Notice } from "@/components/kpi";
import { PageSkeleton } from "@/components/feedback";

/** Versões salvas do orçamento (um PDF por versão); a aprovada fica marcada. */
export function BudgetVersions({
  budgetId,
  fingerprint,
  locked,
  code,
  client,
}: {
  budgetId: string;
  fingerprint: string;
  locked: boolean;
  /** Número do orçamento e cliente, para o nome do PDF baixado ("ORC-2026-0042 v2 - Ana.pdf"). */
  code: string;
  client: string | null | undefined;
}) {
  const { data: versions = [] } = useQuery(budgetVersionsOptions(budgetId));
  const { data: names = {} } = useQuery({
    queryKey: ["profile-names", versions.map((v) => v.created_by).join(",")],
    enabled: versions.length > 0,
    queryFn: async () => {
      const ids = [...new Set(versions.map((v) => v.created_by).filter((x): x is string => !!x))];
      if (!ids.length) return {};
      const r = await supabase.from("profiles").select("id,full_name,email").in("id", ids);
      return Object.fromEntries(
        (r.data ?? []).map((p) => [p.id, p.full_name || p.email || "Usuário"]),
      ) as Record<string, string>;
    },
  });
  const [viewing, setViewing] = useState<(typeof versions)[number] | null>(null);
  const approved = versions.find((v) => v.approved);
  const pending = !locked && hasUnsavedChanges(versions, fingerprint);

  return (
    <section className={cn(panelClass, "mb-6 overflow-hidden")}>
      <header className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
        <IconBubble icon={History} tone="brand" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Versões salvas</h2>
          <p className="text-xs text-muted-foreground">
            {approved
              ? `${versions.length} ${versions.length === 1 ? "versão" : "versões"} até a aprovação · aprovada a versão ${approved.version}`
              : versions.length
                ? `${versions.length} ${versions.length === 1 ? "versão salva" : "versões salvas"}`
                : "Nenhuma versão salva ainda. Use “Salvar versão” para guardar o PDF."}
          </p>
        </div>
        {pending && versions.length > 0 && (
          <Badge variant="alert">Alterações ainda não salvas como versão</Badge>
        )}
      </header>
      {versions.length > 0 && (
        <ul className="divide-y divide-border/60 border-t border-border/60">
          {[...versions].reverse().map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-bold num">
                {v.version}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  Versão {v.version}
                  {v.approved && (
                    <Badge variant="positive">
                      <BadgeCheck className="h-3 w-3" /> Aprovada
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {fmtStamp(v.created_at)} ·{" "}
                  {new Date(v.created_at).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {names[v.created_by ?? ""] ?? "Usuário"}
                </p>
              </div>
              <Money value={v.total} className="text-sm font-semibold" />
              <Button type="button" size="sm" variant="outline" onClick={() => setViewing(v)}>
                <Eye className="h-4 w-4" />
                Visualizar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  openDocument(
                    v.file_path,
                    documentFileName(code, client, { suffix: `v${v.version}` }),
                  ).catch((e) => toast.error(e.message))
                }
              >
                <FileDown className="h-4 w-4" />
                PDF
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="flex h-[96vh] w-[min(1100px,96vw)] max-w-none flex-col gap-3 sm:max-w-none">
          {viewing && (
            <VersionViewer
              path={viewing.file_path}
              version={viewing.version}
              approved={viewing.approved}
              fileName={documentFileName(code, client, { suffix: `v${viewing.version}` })}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

/**
 * Mostra o PDF guardado de uma versão na tela, para conferir ou apresentar ao cliente. O arquivo é
 * baixado do bucket privado e exibido por URL blob (a CSP do app só aceita frames do próprio
 * domínio ou blob); "Apresentar" põe o documento em tela cheia.
 */
function VersionViewer({
  path,
  version,
  approved,
  fileName,
}: {
  path: string;
  version: number;
  approved: boolean;
  fileName: string;
}) {
  const {
    data: blob,
    error,
    isFetching,
  } = useQuery({
    queryKey: ["budget-version-file", path],
    queryFn: async () => {
      const r = await supabase.storage.from("jmg-documents").download(path);
      if (r.error) throw r.error;
      return new Blob([r.data], { type: "application/pdf" });
    },
    retry: false,
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  const stage = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement === stage.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else
      stage.current?.requestFullscreen().catch(() => {
        // Sem tela cheia (ex.: iPhone): abre o PDF numa aba, no visualizador do aparelho.
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-2 pr-8">
          <Eye className="h-5 w-5 text-primary" />
          Versão {version}
          {approved && (
            <Badge variant="positive">
              <BadgeCheck className="h-3 w-3" /> Aprovada
            </Badge>
          )}
        </DialogTitle>
      </DialogHeader>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          O PDF exatamente como foi salvo nesta versão. Use “Apresentar” para mostrar ao cliente em
          tela cheia.
        </p>
        <div className="flex flex-wrap gap-2">
          {url && (
            <Button type="button" size="sm" variant="outline" asChild>
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" /> Nova aba
              </a>
            </Button>
          )}
          {url && (
            <Button type="button" size="sm" variant="outline" asChild>
              <a href={url} download={fileName}>
                <Download className="h-4 w-4" /> Baixar
              </a>
            </Button>
          )}
          <Button type="button" size="sm" onClick={toggleFull} disabled={!url}>
            <Maximize2 className="h-4 w-4" /> Apresentar
          </Button>
        </div>
      </div>
      {error && (
        <Notice tone="negative">Não foi possível abrir a versão: {(error as Error).message}</Notice>
      )}
      <div
        ref={stage}
        className="relative min-h-0 flex-1 overflow-hidden rounded-xl border bg-muted"
      >
        {url ? (
          <iframe title={`Orçamento · versão ${version}`} src={url} className="h-full w-full" />
        ) : (
          isFetching && <PageSkeleton cards={1} />
        )}
        {full && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={toggleFull}
            className="absolute right-4 top-4 shadow-lg"
          >
            <Minimize2 className="h-4 w-4" /> Sair da apresentação
          </Button>
        )}
      </div>
    </>
  );
}
