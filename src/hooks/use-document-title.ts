import { useEffect } from "react";

/**
 * Título da aba enquanto a página está aberta: o navegador usa esse título como nome sugerido do
 * arquivo ao "Imprimir / salvar PDF" (ex.: "Cronograma ORC-2026-0042 - Mariana Ribeiro").
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
