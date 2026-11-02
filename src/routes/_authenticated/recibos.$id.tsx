import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Download, ExternalLink, RefreshCw } from "lucide-react";
import { pageMeta } from "@/lib/page-meta";
import { apiConfigured, apiFile } from "@/lib/api-client";
import { useMe } from "@/hooks/use-me";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/kpi";
import { NoAccess, PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/feedback";
import { panelClass } from "@/lib/surface";
import { cn } from "@/lib/utils";

// Recibo de pagamento (modelo JMG) de um recebimento de entrada da obra, gerado pela API
// (POST /v1/recebimentos/:id/recibo). Os dados do pagador e o ID da transação são opcionais: o
// recibo sai sem essas linhas quando ficam em branco.

export const Route = createFileRoute("/_authenticated/recibos/$id")({
  head: () => pageMeta("Recibo de pagamento", "Comprovante de recebimento para o cliente."),
  component: Receipt,
});

type Extra = { name: string; document: string; bank: string; account: string; tx: string };
const EMPTY: Extra = { name: "", document: "", bank: "", account: "", tx: "" };

function Receipt() {
  const { id } = Route.useParams();
  const router = useRouter();
  const { data: me } = useMe();
  const [form, setForm] = useState<Extra>(EMPTY);
  const [applied, setApplied] = useState<Extra>(EMPTY);
  const { data, error, isFetching, refetch } = useQuery({
    queryKey: ["receipt-pdf", id, applied],
    enabled: apiConfigured && !!me?.canSeeCosts,
    retry: false,
    gcTime: 0,
    // Gerar o documento é caro (e o contrato é registrado): só quando a pessoa pede "Atualizar",
    // nunca ao voltar para a aba.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () =>
      apiFile("POST", `/v1/recebimentos/${id}/recibo`, "Recibo.pdf", {
        payer: {
          name: applied.name,
          document: applied.document,
          bank: applied.bank,
          account: applied.account,
        },
        transactionId: applied.tx,
      }),
  });
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!data) return;
    const u = URL.createObjectURL(data.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [data]);
  if (me && !me.canSeeCosts) return <NoAccess />;
  const field = (k: keyof Extra, label: string, placeholder?: string) => (
    <label className="grid gap-1 text-xs text-muted-foreground">
      {label}
      <Input
        value={form[k]}
        placeholder={placeholder}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
      />
    </label>
  );
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => router.history.back()}
        className="inline-flex min-h-10 items-center text-sm text-muted-foreground hover:text-foreground"
      >
        ← Voltar
      </button>
      <PageHeader
        eyebrow="Financeiro"
        title="Recibo de pagamento"
        subtitle={
          data ? data.name.replace(/\.pdf$/, "") : "Comprovante de recebimento para o cliente"
        }
        actions={
          url && data ? (
            <>
              <Button variant="outline" asChild>
                <a href={url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" /> Abrir em nova aba
                </a>
              </Button>
              <Button asChild>
                <a href={url} download={data.name}>
                  <Download className="h-4 w-4" /> Baixar PDF
                </a>
              </Button>
            </>
          ) : null
        }
      />
      <form
        className={cn(panelClass, "grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6 lg:items-end")}
        onSubmit={(e) => {
          e.preventDefault();
          if (JSON.stringify(form) === JSON.stringify(applied)) void refetch();
          else setApplied(form);
        }}
      >
        <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-6">
          Opcional: dados de quem pagou e o ID da transação (PIX). Em branco, o recibo usa o nome e
          o documento do cliente e não mostra essas linhas.
        </p>
        {field("name", "Titular", "Nome do cliente")}
        {field("document", "CPF/CNPJ do titular", "Documento do cliente")}
        {field("bank", "Banco de origem")}
        {field("account", "Agência / conta")}
        {field("tx", "ID da transação")}
        <Button type="submit" disabled={isFetching}>
          <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Atualizar recibo
        </Button>
      </form>
      {!apiConfigured && (
        <Notice tone="negative">A API não está configurada (VITE_API_URL).</Notice>
      )}
      {error && !isFetching && (
        <Notice tone="negative">Não foi possível gerar o recibo: {(error as Error).message}</Notice>
      )}
      {isFetching && !url && <PageSkeleton cards={1} />}
      {url && (
        <iframe
          title="Recibo em PDF"
          src={url}
          className="h-[calc(100vh-200px)] min-h-[620px] w-full rounded-2xl border bg-muted"
        />
      )}
      <p className="text-xs text-muted-foreground">
        O recibo é gerado a partir do recebimento lançado no{" "}
        <Link to="/financeiro" className="text-primary hover:underline">
          Financeiro
        </Link>
        ; para corrigir valor, data ou forma, ajuste o recebimento e gere de novo.
      </p>
    </div>
  );
}
