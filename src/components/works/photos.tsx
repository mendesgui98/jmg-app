import { Image as ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { fmtDate, fmtStamp } from "@/lib/format";
import { panelClass } from "@/lib/surface";
import { cn } from "@/lib/utils";
import { EmptyState, ListSkeleton, PageSkeleton } from "@/components/feedback";
type RecordRow = Database["public"]["Tables"]["work_records"]["Row"];
export function WorkPhoto({ path, caption }: { path: string; caption: string | null }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setUrl("");
    setError(false);
    supabase.storage
      .from("jmg-documents")
      .createSignedUrl(path, 300)
      .then((r) => {
        if (active) {
          setUrl(r.data?.signedUrl || "");
          setError(!!r.error);
        }
      });
    return () => {
      active = false;
    };
  }, [path]);
  return (
    <figure className="space-y-2">
      {url ? (
        <img
          src={url}
          alt={caption || "Foto de avanço da obra"}
          className="max-h-80 w-full rounded object-contain"
        />
      ) : (
        <p className="p-4 text-sm text-muted-foreground">
          {error ? "Foto indisponível" : "Carregando foto…"}
        </p>
      )}
      {caption && <figcaption className="text-xs text-muted-foreground">{caption}</figcaption>}
    </figure>
  );
}
export function StagePhotos({
  records,
  stages,
}: {
  records: RecordRow[];
  stages: { id: string; name: string }[];
}) {
  const photos = records.filter(
    (r) => r.file_path && /\.(png|jpg|jpeg|webp|gif)$/i.test(r.file_path),
  );
  return (
    <section className="space-y-5">
      <h2 className="text-base font-semibold">Fotos de avanço</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {photos.map((r) => (
          <article key={r.id} className={cn(panelClass, "space-y-2 p-4")}>
            <h3 className="font-semibold leading-snug">
              {stages.find((s) => s.id === r.stage_id)?.name || r.title}
            </h3>
            <p className="text-xs text-muted-foreground">
              {fmtDate(r.record_date)} · {r.responsible || "Sem responsável"} · Atualização{" "}
              {fmtStamp(r.updated_at)}
            </p>
            {r.file_path && <WorkPhoto path={r.file_path} caption={r.caption} />}
          </article>
        ))}
      </div>
      {!photos.length && (
        <div className={panelClass}>
          <EmptyState compact icon={ImageIcon} title="Nenhuma foto registrada" />
        </div>
      )}
    </section>
  );
}
