/** Nome da situação da obra para a tela (um só em todo o app; o valor do banco nunca aparece). */
export const WORK_STATUS_LABEL: Record<string, string> = {
  contratacao: "Em contratação",
  execucao: "Em execução",
  pausada: "Pausada",
  concluida: "Concluída",
};

export const workStatusLabel = (status: string | null | undefined) =>
  status ? (WORK_STATUS_LABEL[status] ?? status) : "—";
