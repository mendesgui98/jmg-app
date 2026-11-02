import { describe, expect, it } from "vitest";
import { cashProjection } from "./business-indicators";
import type { CompositionRow } from "./executive";
import {
  cashChart,
  followUps,
  marginRanking,
  nextStage,
  receiptPace,
  stageTimeline,
  weekAgenda,
  whatsappLink,
} from "./panel-insights";

const row = (
  date: string,
  amount: number,
  extra: Partial<CompositionRow> = {},
): CompositionRow => ({
  id: `${date}-${amount}`,
  workId: "w1",
  work: "Obra Eliana",
  client: "Eliana",
  description: "Parcela",
  date,
  amount,
  status: "aberto",
  tab: "financeiro",
  ...extra,
});

describe("cashChart", () => {
  const today = "2026-10-31";
  const received = [row("2026-09-10", 1000), row("2026-10-05", 2000)];
  const spent = [row("2026-09-20", -400), row("2026-10-15", -600)];
  const projection = cashProjection(
    5000,
    [row("2026-11-10", 3000)],
    [row("2026-12-02", 7000)],
    today,
  );
  const chart = cashChart({ received, spent }, 5000, projection, today, 2);

  it("reconstitui o saldo de fim de mês a partir do saldo de hoje", () => {
    expect(chart.months.slice(0, 3)).toMatchObject([
      { month: "2026-08", received: 0, spent: 0, balance: 5000 - 3000 + 1000 },
      { month: "2026-09", received: 1000, spent: 400, balance: 5000 - 2000 + 600 },
      { month: "2026-10", received: 2000, spent: 600, balance: 5000, current: true },
    ]);
  });

  it("estende com o saldo projetado da última semana de cada mês", () => {
    const future = chart.months.filter((m) => m.future);
    expect(future[0]).toMatchObject({ month: "2026-11", balance: 8000 });
    expect(future[1]).toMatchObject({ month: "2026-12", balance: 1000 });
    expect(chart.low).toMatchObject({ balance: 1000 });
  });
});

describe("weekAgenda", () => {
  const today = "2026-11-02";
  const agenda = weekAgenda(
    [
      row("2026-11-05", 18500, { description: "1ª medição", installment: "3/4" }),
      row("2026-10-30", 900),
    ],
    [
      row("2026-11-03", -6200, { description: "Casa do Piso", installment: "1/1" }),
      row("2026-11-20", -100),
    ],
    [
      {
        workId: "w2",
        work: "Obra Marcos",
        name: "Elétrica",
        planned_start: "2026-11-04",
        progress: 0,
      },
      {
        workId: "w2",
        work: "Obra Marcos",
        name: "Estrutura",
        planned_start: "2026-11-04",
        progress: 30,
      },
    ],
    today,
  );

  it("lista em ordem de data o que vence ou começa nos próximos 7 dias (nome, não só 1/1)", () => {
    expect(agenda.items.map((i) => [i.date, i.kind, i.title])).toEqual([
      ["2026-11-03", "saida", "Casa do Piso"],
      ["2026-11-04", "etapa", "Elétrica começa"],
      ["2026-11-05", "entrada", "1ª medição · parcela 3/4"],
    ]);
    expect(agenda.items[0]).toMatchObject({ day: "03", weekday: "ter", amount: 6200 });
  });

  it("soma entradas e saídas da semana", () => {
    expect(agenda.inflow).toBe(18500);
    expect(agenda.outflow).toBe(6200);
  });
});

describe("stageTimeline", () => {
  const today = "2026-10-31";
  const stage = (
    id: string,
    sort: number,
    progress: number,
    start: string | null,
    end: string | null,
    weight = 0,
  ) => ({
    id,
    name: id,
    sort,
    planned_start: start,
    planned_end: end,
    progress,
    weight,
  });
  const timeline = stageTimeline(
    [
      stage("pintura", 4, 0, "2026-11-20", "2026-11-30"),
      stage("demolicao", 1, 100, "2026-09-01", "2026-09-10"),
      stage("revestimento", 3, 40, "2026-10-01", "2026-10-25"),
      stage("eletrica", 2, 20, "2026-10-20", "2026-11-10"),
    ],
    today,
  );

  it("ordena pelo cronograma e marca concluída, atrasada, em andamento e a fazer", () => {
    expect(timeline.map((s) => [s.id, s.state])).toEqual([
      ["demolicao", "concluida"],
      ["eletrica", "andamento"],
      ["revestimento", "atrasada"],
      ["pintura", "afazer"],
    ]);
  });

  it("próxima etapa prioriza a atrasada", () => {
    expect(nextStage(timeline)?.id).toBe("revestimento");
    expect(nextStage([])).toBeNull();
  });

  it("usa o peso como tamanho quando existe", () => {
    const t2 = stageTimeline(
      [stage("a", 1, 0, null, null, 30), stage("b", 2, 0, null, null, 70)],
      today,
    );
    expect(t2.map((s) => s.size)).toEqual([30, 70]);
  });
});

describe("followUps", () => {
  const b = (number: number, revision: number, status: string, issue_date: string) => ({
    id: `${number}-${revision}`,
    number,
    revision,
    status,
    issue_date,
    title: "Reforma",
    client: `Cliente ${number}`,
    phone: null,
    value: 1000,
  });

  it("só a última revisão enviada há 7 dias ou mais, da mais antiga para a mais nova", () => {
    const list = followUps(
      [
        b(21, 0, "enviado", "2026-10-10"),
        b(24, 0, "enviado", "2026-10-19"),
        b(26, 0, "enviado", "2026-10-28"),
        b(30, 0, "enviado", "2026-09-01"),
        b(30, 1, "aprovado", "2026-10-01"),
      ],
      "2026-10-31",
    );
    expect(list.map((x) => [x.number, x.days])).toEqual([
      [21, 21],
      [24, 12],
    ]);
  });
});

describe("whatsappLink", () => {
  it("monta o link com DDI 55 e recusa telefones incompletos", () => {
    expect(whatsappLink("(11) 98765-4321")).toBe("https://wa.me/5511987654321");
    expect(whatsappLink("+55 11 98765-4321")).toBe("https://wa.me/5511987654321");
    expect(whatsappLink("1234")).toBeNull();
    expect(whatsappLink(null)).toBeNull();
  });
});

describe("marginRanking", () => {
  it("ordena pela margem e classifica pela meta e pela mínima", () => {
    const list = marginRanking([
      { id: "a", name: "A", margin: 0.087, target: 15, min: 10 },
      { id: "b", name: "B", margin: 0.161, target: 15, min: 10 },
      { id: "c", name: "C", margin: null, target: 15, min: 10 },
      { id: "d", name: "D", margin: 0.138, target: 15, min: 10 },
    ]);
    expect(list.map((w) => [w.id, w.pct, w.tone])).toEqual([
      ["b", 16.1, "meta"],
      ["d", 13.8, "atencao"],
      ["a", 8.7, "abaixo"],
    ]);
  });
});

describe("receiptPace", () => {
  it("avisa quando o recebido fica 5 pontos ou mais atrás do avanço", () => {
    expect(receiptPace(62, 55)).toEqual({ gap: 7, behind: true });
    expect(receiptPace(34, 40)).toEqual({ gap: -6, behind: false });
    expect(receiptPace(50, 46)).toEqual({ gap: 4, behind: false });
  });
});
