import { cents, financeTotals, remaining, type EntryLike, type SettlementLike } from "./operations";
export type DatedEntry = EntryLike & { due_date: string };
export type DatedSettlement = SettlementLike & { paid_date: string };
export function businessDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function installmentRows(total: number, count: number, firstDue: string) {
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 120 ||
    !Number.isFinite(total) ||
    total <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(firstDue)
  )
    throw Error("Informe valor, quantidade de parcelas e primeiro vencimento.");
  const cents = Math.round(total * 100);
  if (cents < count) throw Error("Valor insuficiente para as parcelas.");
  const [year, month, day] = firstDue.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) throw Error("Data inválida.");
  return Array.from({ length: count }, (_, i) => {
    const last = new Date(year, month + i, 0).getDate();
    return {
      amount: (Math.floor(cents / count) + (i < cents % count ? 1 : 0)) / 100,
      due_date: localDate(new Date(year, month - 1 + i, Math.min(day, last))),
    };
  });
}
export function entryState(
  entry: DatedEntry,
  settlements: SettlementLike[],
  today = businessDate(),
) {
  const paid = cents(
    settlements.filter((s) => s.entry_id === entry.id).reduce((t, s) => t + s.amount, 0),
  );
  const pending = remaining(entry.amount, paid);
  return {
    paid,
    pending,
    status:
      pending <= 0
        ? entry.direction === "entrada"
          ? "recebido"
          : "pago"
        : entry.due_date < today
          ? "vencido"
          : paid > 0
            ? "parcial"
            : "previsto",
  };
}
export function periodRange(period: string, now = new Date()) {
  const [y, m1, d] = businessDate(now).split("-").map(Number) as [number, number, number];
  const m = m1 - 1;
  const calendarNow = new Date(y, m, d);
  let start: Date, end: Date;
  switch (period) {
    case "hoje":
      start = end = new Date(y, m, d);
      break;
    case "semana": {
      const offset = (calendarNow.getDay() + 6) % 7;
      start = new Date(y, m, d - offset);
      end = new Date(y, m, d - offset + 6);
      break;
    }
    case "mes":
      start = new Date(y, m, 1);
      end = new Date(y, m + 1, 0);
      break;
    case "trimestre":
      start = new Date(y, Math.floor(m / 3) * 3, 1);
      end = new Date(y, Math.floor(m / 3) * 3 + 3, 0);
      break;
    case "ano":
      start = new Date(y, 0, 1);
      end = new Date(y, 11, 31);
      break;
    default:
      return { from: "", to: "" };
  }
  return { from: localDate(start), to: localDate(end) };
}
export function inPeriod(date: string, from: string, to: string) {
  return (!from || date >= from) && (!to || date <= to);
}
export function periodCash(
  entries: DatedEntry[],
  settlements: DatedSettlement[],
  from: string,
  to: string,
) {
  const active = entries.filter((e) => !e.canceled);
  const movements = settlements.filter((s) => inPeriod(s.paid_date, from, to));
  const paid = (direction: string) =>
    movements
      .filter((s) => active.some((e) => e.id === s.entry_id && e.direction === direction))
      .reduce((t, s) => t + s.amount, 0);
  const received = paid("entrada"),
    spent = paid("saida");
  const pending = financeTotals(
    active.filter((e) => inPeriod(e.due_date, from, to)),
    settlements,
  );
  return {
    received,
    spent,
    cash: received - spent,
    receivable: pending.receivable,
    payable: pending.payable,
  };
}
export function contractBalance(contract: number, received: number) {
  return {
    receivable: Math.max(0, contract - received),
    financialProgress: contract > 0 ? (received / contract) * 100 : 0,
    credit: Math.max(0, received - contract),
  };
}
export function monthlyCash(entries: DatedEntry[], settlements: DatedSettlement[]) {
  const rows = new Map<
    string,
    {
      month: string;
      received: number;
      spent: number;
      cash: number;
      balance: number;
      expected: number;
    }
  >();
  const get = (date: string) => {
    const month = date.slice(0, 7);
    let row = rows.get(month);
    if (!row) {
      row = { month, received: 0, spent: 0, cash: 0, balance: 0, expected: 0 };
      rows.set(month, row);
    }
    return row;
  };
  for (const e of entries.filter((e) => !e.canceled)) {
    get(e.due_date).expected += e.direction === "entrada" ? e.amount : -e.amount;
    for (const s of settlements.filter((s) => s.entry_id === e.id)) {
      const r = get(s.paid_date);
      if (e.direction === "entrada") r.received += s.amount;
      else r.spent += s.amount;
    }
  }
  let balance = 0;
  return [...rows.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((r) => {
      r.cash = r.received - r.spent;
      balance += r.cash;
      r.balance = balance;
      return r;
    });
}
