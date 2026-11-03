import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  addMonths,
  businessDaysBetween,
  claimCode,
  claimSla,
  claimStatus,
  finalInspectionDate,
  repeatIndex,
  slaLabel,
  spanLabel,
  warrantyEnd,
  warrantyReport,
  warrantyAlerts,
  warrantyState,
  type ReportClaim,
} from "./warranty";

describe("prazo da garantia", () => {
  it("soma meses respeitando o fim do mês", () => {
    expect(addMonths("2026-02-10", 12)).toBe("2027-02-10");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2027-02-10", -1)).toBe("2027-01-10");
    expect(warrantyEnd("2026-06-01")).toBe("2027-06-01");
  });

  it("conta os dias que faltam e a fase", () => {
    const w = { start_date: "2026-02-10", end_date: "2027-02-10" };
    expect(warrantyState(w, "2026-11-03")).toMatchObject({
      left: 99,
      phase: "ativa",
      label: "Faltam 99 dias",
      elapsed: 73,
    });
    expect(warrantyState(w, "2027-01-20")).toMatchObject({ left: 21, phase: "vencendo" });
    expect(warrantyState(w, "2027-02-10")).toMatchObject({ left: 0, label: "Vence hoje" });
    expect(warrantyState(w, "2027-02-12")).toMatchObject({
      phase: "encerrada",
      label: "Encerrada há 2 dias",
      elapsed: 100,
    });
    expect(warrantyState(w, "2026-02-01")).toMatchObject({
      phase: "futura",
      label: "Começa em 9 dias",
      elapsed: 0,
    });
  });

  it("escreve o tempo em meses e dias", () => {
    expect(spanLabel(99)).toBe("3 meses e 8 dias");
    expect(spanLabel(20)).toBe("20 dias");
    expect(spanLabel(1)).toBe("1 dia");
    expect(spanLabel(-61)).toBe("2 meses");
  });

  it("sugere a vistoria final um mês antes do fim", () => {
    expect(finalInspectionDate({ end_date: "2027-02-10" })).toBe("2027-01-10");
    expect(
      finalInspectionDate({ end_date: "2027-02-10", final_inspection_date: "2027-01-05" }),
    ).toBe("2027-01-05");
  });
});

describe("dias úteis", () => {
  it("pula sábado e domingo", () => {
    // 30/10/2026 é sexta.
    expect(addBusinessDays("2026-10-30", 5)).toBe("2026-11-06");
    expect(addBusinessDays("2026-10-31", 1)).toBe("2026-11-02");
    expect(businessDaysBetween("2026-10-30", "2026-11-06")).toBe(5);
    expect(businessDaysBetween("2026-10-30", "2026-11-01")).toBe(0);
    expect(businessDaysBetween("2026-11-06", "2026-10-30")).toBe(0);
  });
});

const claim = (o: Partial<ReportClaim> & { id: string }): ReportClaim => ({
  warranty_id: "w1",
  reported_at: "2026-10-30",
  evaluation: "procedente",
  resolved_at: null,
  stage_id: "hid",
  executor_kind: "equipe",
  executor_id: null,
  lesson: null,
  description: "x",
  ...o,
});

describe("chamados", () => {
  it("deriva a situação das visitas e da avaliação", () => {
    const c = claim({ id: "c1" });
    expect(claimStatus(c, [])).toBe("aberto");
    expect(
      claimStatus(c, [{ claim_id: "c1", visit_date: "2026-11-04", done: false, outcome: null }]),
    ).toBe("agendado");
    expect(
      claimStatus(c, [{ claim_id: "c1", visit_date: "2026-11-04", done: true, outcome: "voltar" }]),
    ).toBe("em_atendimento");
    expect(claimStatus({ ...c, resolved_at: "2026-11-05" }, [])).toBe("resolvido");
    expect(claimStatus({ ...c, evaluation: "mau_uso" }, [])).toBe("nao_coberto");
  });

  it("controla o prazo de 5 dias úteis até a 1ª visita", () => {
    const c = claim({ id: "c1" });
    const open = claimSla(c, [], "2026-11-03");
    expect(open).toMatchObject({ deadline: "2026-11-06", state: "no_prazo", left: 3 });
    expect(slaLabel(open)).toBe("No prazo · faltam 3 dias úteis");
    const late = claimSla(c, [], "2026-11-10");
    expect(late).toMatchObject({ state: "fora_do_prazo", late: 2 });
    expect(slaLabel(late)).toBe("Fora do prazo · 2 dias úteis de atraso");
    const done = claimSla(
      c,
      [{ claim_id: "c1", visit_date: "2026-11-04", done: true, outcome: "reparo" }],
      "2026-11-20",
    );
    expect(done).toMatchObject({ state: "cumprido", days: 3 });
    expect(
      claimSla(
        c,
        [{ claim_id: "c1", visit_date: "2026-11-09", done: true, outcome: "reparo" }],
        "2026-11-20",
      ),
    ).toMatchObject({ state: "atrasou", late: 1 });
    expect(claimSla({ ...c, evaluation: "desgaste" }, [], "2026-12-01").state).toBe("nao_conta");
  });

  it("numera e conta repetições da mesma etapa na obra", () => {
    expect(claimCode(4)).toBe("GAR-0004");
    const a = claim({ id: "a", reported_at: "2026-03-01", stage_id: "por" });
    const b = claim({ id: "b", reported_at: "2026-07-01", stage_id: "por" });
    const other = claim({ id: "c", warranty_id: "w2", reported_at: "2026-05-01", stage_id: "por" });
    expect(repeatIndex(a, [a, b, other])).toBe(1);
    expect(repeatIndex(b, [a, b, other])).toBe(2);
  });
});

describe("relatório", () => {
  it("agrupa por etapa, executor e obra, com tempos e custos", () => {
    const claims = [
      claim({ id: "1", stage_id: "hid", resolved_at: "2026-11-05" }),
      claim({
        id: "2",
        stage_id: "hid",
        warranty_id: "w2",
        executor_kind: "prestador",
        executor_id: "p1",
      }),
      claim({ id: "3", stage_id: "por", evaluation: "mau_uso" }),
      claim({ id: "4", stage_id: "por", reported_at: "2025-01-01" }),
      claim({ id: "5", stage_id: null, lesson: "Testar sifões na entrega" }),
    ];
    const visits = [
      { claim_id: "1", visit_date: "2026-11-02", done: true, outcome: "voltar" },
      { claim_id: "1", visit_date: "2026-11-05", done: true, outcome: "resolvido" },
      { claim_id: "2", visit_date: "2026-11-10", done: true, outcome: "reparo" },
      { claim_id: "4", visit_date: "2025-01-02", done: true, outcome: "resolvido" },
    ];
    const r = warrantyReport({
      claims,
      visits,
      costs: new Map([
        ["1", 200],
        ["2", 100],
      ]),
      from: "2026-01-01",
      to: "2026-11-20",
      stageName: (id) => ({ hid: "Hidráulica", por: "Porcelanato" })[id ?? ""] ?? "Sem etapa",
      executorName: (k, id) => (k === "equipe" ? "Equipe própria" : `Prestador ${id}`),
      warrantyName: (id) => id,
    });
    expect(r).toMatchObject({
      total: 4,
      visits: 3,
      cost: 300,
      covered: 3,
      notCovered: 1,
      reasons: [{ key: "mau_uso", count: 1 }],
      avgResolution: 4,
    });
    expect(r.visitsPerClaim).toBeCloseTo(0.75);
    // Chamado 1 visitado no 1º dia útil (cumprido), 2 com 2 dias úteis de atraso, 5 sem visita e
    // fora do prazo em 20/11.
    expect(r.onTimeRate).toBeCloseTo(1 / 3);
    expect(r.avgFirstVisit).toBeCloseTo((1 + 7) / 2);
    expect(r.byStage[0]).toMatchObject({
      name: "Hidráulica",
      claims: 2,
      works: 2,
      visits: 3,
      cost: 300,
    });
    expect(r.byStage.map((s) => s.name)).toEqual(["Hidráulica", "Porcelanato", "Sem etapa"]);
    expect(r.byExecutor[1]).toMatchObject({ name: "Prestador p1", claims: 1, perWork: 1 });
    expect(r.byWarranty[0]).toMatchObject({ id: "w1", claims: 3 });
    expect(r.lessons).toEqual([
      { id: "5", stage: "Sem etapa", lesson: "Testar sifões na entrega" },
    ]);
  });
});

describe("avisos do Painel", () => {
  it("lista chamados fora do prazo e garantias vencendo sem vistoria", () => {
    const ws = [
      { id: "w1", start_date: "2025-11-20", end_date: "2026-11-20", final_inspection_done: false },
      { id: "w2", start_date: "2025-11-10", end_date: "2026-11-10", final_inspection_done: true },
      { id: "w3", start_date: "2026-02-10", end_date: "2027-02-10", final_inspection_done: false },
    ];
    const cs = [
      claim({
        id: "c1",
        warranty_id: "w3",
        reported_at: "2026-10-21",
        description: "Porcelanato trincado\nsala",
      }),
    ];
    const a = warrantyAlerts(ws, cs, [], "2026-11-03", (w) => `Obra ${w.id}`);
    expect(a.map((x) => x.kind)).toEqual(["atendimento", "vencimento"]);
    expect(a[0]!.detail).toBe(
      "Obra w3 · Porcelanato trincado · 4 dias úteis de atraso na 1ª visita",
    );
    expect(a[1]).toMatchObject({ title: "Garantia vence em 17 dias", warrantyId: "w1" });
  });
});
