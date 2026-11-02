import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { flushQueue, type FlushResult, type QueuedItem, type QueueStore } from "./offline-queue";
import { indexedDbStore } from "./offline-store";
import { uploadDocument } from "./work-data";

// Registros de obra (diário, entrega, assistência...) criados sem internet.
// Ficam no aparelho e são enviados quando a conexão volta. Cada item guarda quem o criou: em
// aparelho compartilhado, outro usuário não vê nem envia (com a própria conta) o que não é dele.

type RecordInsert = Database["public"]["Tables"]["work_records"]["Insert"];
export type PendingRecord = {
  payload: RecordInsert & { id: string; work_id: string };
  file?: Blob | undefined;
  fileName?: string | undefined;
  /** Usuário que criou o registro (itens antigos, sem dono, ficam com quem estiver logado). */
  userId?: string | undefined;
};

async function currentUserId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

const mine = (item: QueuedItem<PendingRecord>, uid: string | null) =>
  !!uid && (item.data.userId ?? uid) === uid;

let store: QueueStore<PendingRecord> | null = null;
const getStore = () => (store ??= indexedDbStore<PendingRecord>("records"));

const listeners = new Set<() => void>();
export function subscribePending(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
const notify = () => listeners.forEach((l) => l());

export async function pendingRecords(): Promise<QueuedItem<PendingRecord>[]> {
  if (typeof indexedDB === "undefined") return [];
  const uid = await currentUserId();
  return (await getStore().all()).filter((i) => mine(i, uid));
}

export async function enqueueRecord(record: PendingRecord) {
  record = { ...record, userId: (await currentUserId()) ?? undefined };
  await getStore().put({
    id: record.payload.id,
    createdAt: new Date().toISOString(),
    attempts: 0,
    data: record,
  });
  notify();
}

/** Envia um registro. O id é gerado no aparelho: reenviar o mesmo item não duplica. */
export async function sendRecord(item: QueuedItem<PendingRecord>) {
  const { data } = item;
  let filePath = data.payload.file_path ?? null;
  if (data.file && !filePath) {
    const file = new File([data.file], data.fileName ?? "anexo", { type: data.file.type });
    filePath = await uploadDocument(file, `records/${data.payload.work_id}`);
    // Guarda o caminho para não reenviar o arquivo se a inserção falhar.
    await getStore().put({
      ...item,
      data: { payload: { ...data.payload, file_path: filePath }, userId: data.userId },
    });
  }
  const { error } = await supabase
    .from("work_records")
    .insert({ ...data.payload, file_path: filePath });
  // 23505 = já existe (inserção anterior chegou ao banco mas a resposta se perdeu).
  if (error && (error as { code?: string }).code !== "23505") throw error;
}

let flushing: Promise<FlushResult> | null = null;
export function flushPendingRecords() {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve({ sent: 0, failed: 0, pending: 0, offline: false });
  }
  // Só os itens do usuário logado: os de outro usuário esperam ele entrar de novo.
  const own: QueueStore<PendingRecord> = {
    all: async () => {
      const uid = await currentUserId();
      return (await getStore().all()).filter((i) => mine(i, uid));
    },
    put: (item) => getStore().put(item),
    remove: (id) => getStore().remove(id),
  };
  flushing ??= flushQueue(own, sendRecord).finally(() => {
    flushing = null;
    notify();
  });
  return flushing;
}
