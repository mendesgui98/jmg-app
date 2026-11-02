import { useSyncExternalStore } from "react";

// Menu lateral recolhido (só ícones) no computador: preferência do aparelho, guardada no navegador.
const KEY = "jmg-sidebar-collapsed";
const listeners = new Set<() => void>();

function read() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setSidebarCollapsed(value: boolean) {
  try {
    localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    // sem armazenamento (navegação privada): vale só nesta tela
  }
  current = value;
  listeners.forEach((l) => l());
}

let current: boolean | null = null;

export function useSidebarCollapsed() {
  const collapsed = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => (current ??= read()),
    () => false,
  );
  return [collapsed, setSidebarCollapsed] as const;
}
