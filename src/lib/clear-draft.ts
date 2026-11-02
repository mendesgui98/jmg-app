import { supabase } from "@/integrations/supabase/client";
/** Apaga o rascunho de um formulário depois de salvar (a mesma chave que o DraftForm usa). */
export async function clearDraft(scope: string) {
  try {
    const { data } = await supabase.auth.getSession();
    const id = data.session?.user.id;
    if (id) localStorage.removeItem(`jmg-draft:${id}:${scope}`);
  } catch {
    // sem acesso ao armazenamento: nada a apagar
  }
}
