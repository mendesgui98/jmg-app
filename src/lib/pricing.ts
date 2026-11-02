/**
 * Motor de precificação da JMG.
 *
 * Fórmulas (todas explícitas, sem contagem dupla):
 *  - Custo MO do item       = quantidade × custo unitário do terceiro
 *  - Qtde material (consumo) = quantidade × consumo por unidade × (1 + perda)
 *  - Custo material         = qtde consumo × (preço de compra ÷ conversão)   [só materiais fornecidos pela JMG]
 *    -> com rendimento de embalagem: embalagens = ⌈qtde consumo ÷ rendimento⌉ (por serviço),
 *       custo = embalagens × preço da embalagem
 *  - Preço MO (lista)       = custo MO × (1 + acréscimo MO) × (1 + reserva de negociação)
 *  - Preço Mat (lista)      = custo Mat × (1 + acréscimo Mat) × (1 + reserva de negociação)
 *    -> "acréscimo" é sempre sobre CUSTO. "Margem" é sempre sobre VENDA.
 *  - Desconto do item: repartido entre MO e Mat do item, proporcional ao preço.
 *  - Desconto geral: repartido entre MO e Mat proporcional ao preço já com descontos de itens.
 *  - Venda líquida          = MO líquida + Mat líquida
 *  - Tributos/despesas      = Σ(alíquota × base) — base "venda" ou "mao_de_obra" (líquidas)
 *  - Comissão da arquiteta  = % × MO líquida  (NUNCA inclui materiais)
 *  - Resultado              = venda líquida − custo MO − custo Mat − tributos − comissão
 *  - Margem                 = resultado ÷ venda líquida
 *  - Reinvestimento         = resultado × % de destinação (não é deduzido do resultado)
 *  Esse é o modelo dos orçamentos antigos (params sem "model"), mantido para não mudar valores.
 *
 * Modelo "custo direto" (params.model = "custo_direto", padrão dos orçamentos novos):
 *  - Custo direto           = custo MO + custo materiais
 *  - Preço calculado        = custo direto ÷ [1 − (estrutura + RT + impostos + margem)]
 *  - Preço final            = preço negociado (se houver) ou o calculado
 *  - Estrutura, RT, impostos = % × preço final; lucro = preço final − custo direto − os três
 *  - Materiais vão ao cliente a custo; a mão de obra de venda é o restante do preço final
 *  Com params.rates_base = "mao_de_obra" (orçamentos abertos e novos), os percentuais só incidem
 *  sobre a mão de obra e o material leva apenas o imposto:
 *  - Preço da MO            = custo MO ÷ [1 − (estrutura + RT + impostos + margem)]
 *  - Preço dos materiais    = custo materiais ÷ (1 − impostos)
 *  - Estrutura, RT, margem  = % × preço da MO; impostos = % × preço final
 *  - Margem                 = lucro ÷ preço da MO
 */

export type TaxBase = "venda" | "mao_de_obra";
export interface Tax {
  name: string;
  rate: number; // percentual, ex.: 6 = 6%
  base: TaxBase;
}

export interface PricingParams {
  labor_markup: number;
  materials_markup: number;
  negotiation_reserve: number;
  desired_margin: number;
  min_margin: number;
  architect_commission: number;
  reinvestment_share: number;
  taxes: Tax[];
  /** "custo_direto" = modelo atual; ausente = acréscimos sobre custo (orçamentos antigos). */
  model?: "custo_direto" | undefined;
  /** "mao_de_obra" = percentuais só sobre a MO e materiais só com imposto (custo direto). */
  rates_base?: "mao_de_obra" | undefined;
  /** Custo estrutural JMG (% do preço). */
  structure_rate?: number | undefined;
  /** Impostos (% do preço). */
  tax_rate?: number | undefined;
  /** false zera a RT (architect_commission continua guardada). */
  apply_rt?: boolean | undefined;
  /** Preço proposto ao cliente; nulo = usa o preço calculado. */
  negotiated_price?: number | null | undefined;
}

export const emptyParams: PricingParams = {
  labor_markup: 0,
  materials_markup: 0,
  negotiation_reserve: 0,
  desired_margin: 0,
  min_margin: 0,
  architect_commission: 0,
  reinvestment_share: 0,
  taxes: [],
};

export interface ItemMaterial {
  material_id?: string | null;
  name: string;
  consumption_unit: string;
  purchase_unit: string;
  conversion: number; // unidades de consumo por unidade de compra
  consumption: number; // por unidade do serviço
  loss_pct: number;
  price: number; // por unidade de compra (snapshot)
  supplied_by: "jmg" | "cliente";
  package_yield?: number | null; // rendimento de 1 embalagem; nulo = compra fracionada
  yield_unit?: string | null;
}

export interface PricingItem {
  id?: string | undefined;
  quantity: number;
  labor_cost_unit: number;
  materials: ItemMaterial[];
  labor_markup_override?: number | null | undefined;
  materials_markup_override?: number | null | undefined;
  item_discount?: number | undefined;
}

export interface ItemResult {
  id?: string | undefined;
  laborCost: number;
  materialsCost: number;
  laborList: number;
  materialsList: number;
  laborNet: number;
  materialsNet: number;
  total: number;
}

export interface BudgetResult {
  items: ItemResult[];
  laborCost: number;
  materialsCost: number;
  totalCost: number;
  laborList: number;
  materialsList: number;
  listTotal: number;
  reserveAmount: number;
  itemDiscounts: number;
  generalDiscount: number;
  totalDiscount: number;
  laborNet: number;
  materialsNet: number;
  saleNet: number;
  taxes: { name: string; base: TaxBase; rate: number; baseValue: number; amount: number }[];
  taxesTotal: number;
  commission: number;
  result: number;
  margin: number; // fração (0.2 = 20%)
  reinvestment: number;
  belowMin: boolean;
  belowDesired: boolean;
  maxExtraDiscount: number;
  /** Custo estrutural JMG (0 no modelo legado). */
  structure: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (n: number | null | undefined) => (Number(n) || 0) / 100;

export function materialQty(m: ItemMaterial, serviceQty: number) {
  return serviceQty * (Number(m.consumption) || 0) * (1 + pct(m.loss_pct));
}
/** Custo por unidade de consumo (estimativa unitária, sem arredondar embalagens). */
export function materialUnitCost(m: ItemMaterial) {
  const conv =
    Number(m.package_yield) > 0
      ? Number(m.package_yield)
      : Number(m.conversion) > 0
        ? Number(m.conversion)
        : 1;
  return (Number(m.price) || 0) / conv;
}
/** Embalagens inteiras para um serviço (arredonda por serviço); null sem rendimento. */
export function materialPackages(m: ItemMaterial, serviceQty: number) {
  const packageYield = Number(m.package_yield);
  if (!(packageYield > 0)) return null;
  return Math.max(0, Math.ceil(materialQty(m, serviceQty) / packageYield - 1e-9));
}
/** Quantidade em unidades de compra: embalagens inteiras ou fração pela conversão. */
export function materialPurchaseQty(m: ItemMaterial, serviceQty: number) {
  const conv = Number(m.conversion) > 0 ? Number(m.conversion) : 1;
  return materialPackages(m, serviceQty) ?? materialQty(m, serviceQty) / conv;
}
export function materialCost(m: ItemMaterial, serviceQty: number) {
  if (m.supplied_by === "cliente") return 0;
  const packages = materialPackages(m, serviceQty);
  if (packages !== null) return packages * (Number(m.price) || 0);
  return materialQty(m, serviceQty) * materialUnitCost(m);
}

/** Os 4 percentuais do modelo do custo direto, em % (12.5 = 12,5%). */
export interface PriceRates {
  structure: number;
  rt: number;
  taxes: number;
  margin: number;
}

export const isDirectCostModel = (params: Pick<PricingParams, "model">) =>
  params.model === "custo_direto";

/** Custo direto com os percentuais só sobre a mão de obra (materiais levam só o imposto). */
export const laborRatesBase = (params: Pick<PricingParams, "model" | "rates_base">) =>
  isDirectCostModel(params) && params.rates_base === "mao_de_obra";

/** Percentuais do orçamento no modelo do custo direto (RT zerada quando não se aplica). */
export function priceRates(params: PricingParams): PriceRates {
  return {
    structure: Number(params.structure_rate) || 0,
    rt: params.apply_rt === false ? 0 : Number(params.architect_commission) || 0,
    taxes: Number(params.tax_rate) || 0,
    margin: Number(params.desired_margin) || 0,
  };
}

/**
 * Preço de venda = (custo direto − materiais) ÷ [1 − (estrutura + RT + impostos + margem)]
 * + materiais ÷ (1 − impostos). `materials` = custo dos materiais que levam só o imposto
 * (0 = todos os percentuais sobre o custo direto inteiro).
 * null quando a soma dos percentuais chega a 100% (não existe preço).
 */
export function priceFromCost(directCost: number, rates: PriceRates, materials = 0) {
  const raw = rawPrice(directCost, rates, materials);
  return raw === null ? null : r2(raw);
}
function rawPrice(directCost: number, rates: PriceRates, materials = 0) {
  const share = pct(rates.structure) + pct(rates.rt) + pct(rates.taxes) + pct(rates.margin);
  if (share >= 1 - 1e-9) return null;
  const m = Number(materials) || 0;
  return ((Number(directCost) || 0) - m) / (1 - share) + materialsPrice(m, rates);
}
/** Materiais com só o imposto: custo ÷ (1 − impostos). */
function materialsPrice(materials: number, rates: Pick<PriceRates, "taxes">) {
  return (Number(materials) || 0) / (1 - pct(rates.taxes));
}

/** Preço sugerido: o calculado arredondado para a centena mais próxima. */
export const suggestedPrice = (price: number) => Math.round(price / 100) * 100;

/**
 * Abertura de um preço: impostos são % do preço; estrutura e RT são % do preço da mão de obra
 * (o preço inteiro quando `materials` = 0); o lucro é a sobra, para a soma bater centavo a
 * centavo com o preço. A margem é o lucro sobre o preço da mão de obra.
 */
export function priceBreakdown(
  price: number,
  directCost: number,
  rates: Omit<PriceRates, "margin">,
  /** Preço sem arredondar (o calculado), para os percentuais baterem com a conta exata. */
  exactPrice: number = price,
  /** Custo dos materiais que levam só o imposto. */
  materials = 0,
) {
  const p = r2(Number(price) || 0);
  const basis = Number(exactPrice) || 0;
  const matPrice = materialsPrice(materials, rates);
  const laborBasis = basis - matPrice;
  const structure = r2(laborBasis * pct(rates.structure));
  const rt = r2(laborBasis * pct(rates.rt));
  const taxes = r2(basis * pct(rates.taxes));
  const profit = r2(p - (Number(directCost) || 0) - structure - rt - taxes);
  const laborPrice = p - r2(matPrice);
  return {
    price: p,
    directCost: r2(directCost),
    materialsPrice: r2(matPrice),
    laborPrice: r2(laborPrice),
    structure,
    rt,
    taxes,
    profit,
    margin: laborPrice > 0 ? profit / laborPrice : 0,
  };
}

/** Abertura do preço calculado para um custo direto (null se os percentuais somam 100%+). */
export function costBreakdown(directCost: number, rates: PriceRates, materials = 0) {
  const raw = rawPrice(directCost, rates, materials);
  return raw === null ? null : priceBreakdown(r2(raw), directCost, rates, raw, materials);
}

/** Folga dos centavos arredondados ao comparar a margem com a meta (0,01 ponto percentual). */
const MARGIN_TOLERANCE = 1e-4;

export type MarginLevel = "saudavel" | "atencao" | "alerta" | "prejuizo";
/** Faixa da margem: meta ou acima, entre mínima e meta, abaixo da mínima, negativa. */
export function marginLevel(margin: number, target: number, min: number): MarginLevel {
  if (margin < 0) return "prejuizo";
  if (margin < pct(min) - MARGIN_TOLERANCE) return "alerta";
  if (margin < pct(target) - MARGIN_TOLERANCE) return "atencao";
  return "saudavel";
}

/** Simulador: preço para o custo direto com cada margem, mantendo estrutura, RT e impostos. */
export function priceSimulation(
  directCost: number,
  rates: PriceRates,
  margins: number[] = [5, 8, 10, 12, 15, 20],
  materials = 0,
) {
  return margins.map((margin) => ({
    margin,
    price: priceFromCost(directCost, { ...rates, margin }, materials),
  }));
}

function computeDirectCost(items: PricingItem[], params: PricingParams): BudgetResult {
  const rates = priceRates(params);
  const pre = items.map((it) => {
    const q = Number(it.quantity) || 0;
    const laborCost = q * (Number(it.labor_cost_unit) || 0);
    const materialsCost = (it.materials || []).reduce((s, m) => s + materialCost(m, q), 0);
    return { id: it.id, laborCost, materialsCost };
  });
  const laborCost = pre.reduce((s, p) => s + p.laborCost, 0);
  const materialsCost = pre.reduce((s, p) => s + p.materialsCost, 0);
  const totalCost = laborCost + materialsCost;
  // Materiais que levam só o imposto (0 = percentuais sobre o custo direto inteiro).
  const onlyTax = laborRatesBase(params) ? materialsCost : 0;
  const exact = rawPrice(totalCost, rates, onlyTax) ?? 0;
  const calculated = r2(exact);
  const negotiated = params.negotiated_price;
  const isNegotiated = negotiated != null && Number(negotiated) >= 0;
  const price = isNegotiated ? r2(Number(negotiated)) : calculated;
  const b = priceBreakdown(price, totalCost, rates, isNegotiated ? price : exact, onlyTax);
  // Materiais a custo (ou com só o imposto); o que o preço tem além disso e do custo da MO vai
  // para a mão de obra de cada item, proporcional ao custo direto do item (ou ao custo da MO,
  // quando os percentuais são só sobre ela).
  const materialsFactor = onlyTax > 0 ? 1 / (1 - pct(rates.taxes)) : 1;
  const materialsSale = materialsCost * materialsFactor;
  const spread = price - materialsSale - laborCost;
  const itemResults: ItemResult[] = pre.map((p) => {
    const direct = p.laborCost + p.materialsCost;
    const share =
      onlyTax > 0 && laborCost > 0
        ? p.laborCost / laborCost
        : totalCost > 0
          ? direct / totalCost
          : pre.length
            ? 1 / pre.length
            : 0;
    const laborNet = p.laborCost + spread * share;
    const materialsNet = p.materialsCost * materialsFactor;
    return {
      id: p.id,
      laborCost: p.laborCost,
      materialsCost: p.materialsCost,
      laborList: laborNet,
      materialsList: materialsNet,
      laborNet,
      materialsNet,
      total: laborNet + materialsNet,
    };
  });
  const discount = Math.max(0, calculated - price);
  const minPrice = priceFromCost(
    totalCost,
    { ...rates, margin: Number(params.min_margin) || 0 },
    onlyTax,
  );
  return {
    items: itemResults,
    laborCost: r2(laborCost),
    materialsCost: r2(materialsCost),
    totalCost: r2(totalCost),
    laborList: r2(calculated - materialsSale),
    materialsList: r2(materialsSale),
    listTotal: r2(calculated),
    reserveAmount: 0,
    itemDiscounts: 0,
    generalDiscount: r2(discount),
    totalDiscount: r2(discount),
    laborNet: r2(price - materialsSale),
    materialsNet: r2(materialsSale),
    saleNet: price,
    taxes: [
      { name: "Impostos", base: "venda", rate: rates.taxes, baseValue: price, amount: b.taxes },
    ],
    taxesTotal: b.taxes,
    commission: b.rt,
    result: b.profit,
    margin: b.margin,
    reinvestment: r2(Math.max(b.profit, 0) * pct(params.reinvestment_share)),
    belowMin: price > 0 && b.margin < pct(params.min_margin) - MARGIN_TOLERANCE,
    belowDesired: price > 0 && b.margin < pct(params.desired_margin) - MARGIN_TOLERANCE,
    maxExtraDiscount:
      minPrice === null ? 0 : Math.max(0, Math.floor((price - minPrice) * 100) / 100),
    structure: b.structure,
  };
}

export function computeBudget(
  items: PricingItem[],
  params: PricingParams,
  generalDiscount = 0,
): BudgetResult {
  if (isDirectCostModel(params)) return computeDirectCost(items, params);
  const reserve = pct(params.negotiation_reserve);
  const pre = items.map((it) => {
    const q = Number(it.quantity) || 0;
    const laborCost = q * (Number(it.labor_cost_unit) || 0);
    const materialsCost = (it.materials || []).reduce((s, m) => s + materialCost(m, q), 0);
    const lm = it.labor_markup_override ?? params.labor_markup;
    const mm = it.materials_markup_override ?? params.materials_markup;
    const laborList = laborCost * (1 + pct(lm)) * (1 + reserve);
    const materialsList = materialsCost * (1 + pct(mm)) * (1 + reserve);
    const list = laborList + materialsList;
    const disc = Math.min(Math.max(Number(it.item_discount) || 0, 0), list);
    const lShare = list > 0 ? laborList / list : 0;
    return {
      id: it.id,
      laborCost,
      materialsCost,
      laborList,
      materialsList,
      reserveFree: laborCost * (1 + pct(lm)) + materialsCost * (1 + pct(mm)),
      laborAfterItem: laborList - disc * lShare,
      materialsAfterItem: materialsList - disc * (1 - lShare),
      disc,
    };
  });

  const afterItems = pre.reduce((s, p) => s + p.laborAfterItem + p.materialsAfterItem, 0);
  const gd = Math.min(Math.max(Number(generalDiscount) || 0, 0), afterItems);
  const factor = afterItems > 0 ? (afterItems - gd) / afterItems : 0;

  const itemResults: ItemResult[] = pre.map((p) => {
    const laborNet = p.laborAfterItem * factor;
    const materialsNet = p.materialsAfterItem * factor;
    return {
      id: p.id,
      laborCost: p.laborCost,
      materialsCost: p.materialsCost,
      laborList: p.laborList,
      materialsList: p.materialsList,
      laborNet,
      materialsNet,
      total: laborNet + materialsNet,
    };
  });

  const sum = (f: (x: (typeof itemResults)[number]) => number) =>
    itemResults.reduce((s, x) => s + f(x), 0);
  const laborCost = sum((x) => x.laborCost);
  const materialsCost = sum((x) => x.materialsCost);
  const laborList = sum((x) => x.laborList);
  const materialsList = sum((x) => x.materialsList);
  const laborNet = sum((x) => x.laborNet);
  const materialsNet = sum((x) => x.materialsNet);
  const saleNet = laborNet + materialsNet;
  const itemDiscounts = pre.reduce((s, p) => s + p.disc, 0);
  const reserveAmount = laborList + materialsList - pre.reduce((s, p) => s + p.reserveFree, 0);

  const taxes = (params.taxes || []).map((t) => {
    const baseValue = t.base === "mao_de_obra" ? laborNet : saleNet;
    return { ...t, baseValue, amount: baseValue * pct(t.rate) };
  });
  const taxesTotal = taxes.reduce((s, t) => s + t.amount, 0);
  const commission = laborNet * pct(params.architect_commission);
  const totalCost = laborCost + materialsCost;
  const result = saleNet - totalCost - taxesTotal - commission;
  const margin = saleNet > 0 ? result / saleNet : 0;

  // Desconto geral adicional máximo mantendo a margem mínima.
  // Com desconto proporcional extra d, venda e MO caem pelo mesmo fator k=(1-d).
  // margem(k) = a − C/(S·k), onde a = 1 − taxaVenda − (taxaMO+comissão)·L/S
  const sRate = (params.taxes || [])
    .filter((t) => t.base !== "mao_de_obra")
    .reduce((s, t) => s + pct(t.rate), 0);
  const lRate =
    (params.taxes || [])
      .filter((t) => t.base === "mao_de_obra")
      .reduce((s, t) => s + pct(t.rate), 0) + pct(params.architect_commission);
  let maxExtraDiscount = 0;
  if (saleNet > 0) {
    const a = 1 - sRate - (lRate * laborNet) / saleNet;
    const denom = saleNet * (a - pct(params.min_margin));
    if (denom > 0) {
      const kMin = totalCost / denom;
      maxExtraDiscount = Math.max(0, saleNet * (1 - kMin));
    }
  }

  return {
    items: itemResults,
    laborCost: r2(laborCost),
    materialsCost: r2(materialsCost),
    totalCost: r2(totalCost),
    laborList: r2(laborList),
    materialsList: r2(materialsList),
    listTotal: r2(laborList + materialsList),
    reserveAmount: r2(reserveAmount),
    itemDiscounts: r2(itemDiscounts),
    generalDiscount: r2(gd),
    totalDiscount: r2(itemDiscounts + gd),
    laborNet: r2(laborNet),
    materialsNet: r2(materialsNet),
    saleNet: r2(saleNet),
    taxes: taxes.map((t) => ({ ...t, baseValue: r2(t.baseValue), amount: r2(t.amount) })),
    taxesTotal: r2(taxesTotal),
    commission: r2(commission),
    result: r2(result),
    margin,
    reinvestment: r2(Math.max(result, 0) * pct(params.reinvestment_share)),
    belowMin: saleNet > 0 && margin < pct(params.min_margin),
    belowDesired: saleNet > 0 && margin < pct(params.desired_margin),
    maxExtraDiscount: Math.floor(maxExtraDiscount * 100) / 100,
    structure: 0,
  };
}

/**
 * Distribui o valor total pelas condições de pagamento (%). A conta é feita em centavos inteiros:
 * cada parcela é % × total arredondado ao centavo e a diferença vai para a última parcela.
 */
export function splitPayments<T extends { pct: number }>(total: number, terms: T[]) {
  const totalCents = Math.round((Number(total) || 0) * 100);
  const cents = terms.map((t) => Math.round((totalCents * (Number(t.pct) || 0)) / 100));
  const pctSum = r2(terms.reduce((s, t) => s + (Number(t.pct) || 0), 0));
  if (cents.length && Math.abs(pctSum - 100) < 1e-9) {
    const others = cents.slice(0, -1).reduce((s, c) => s + c, 0);
    cents[cents.length - 1] = totalCents - others;
  }
  return { rows: terms.map((t, i) => ({ ...t, value: (cents[i] ?? 0) / 100 })), pctSum };
}

export interface ClientMaterialLine {
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

/**
 * Valores que o cliente vê na proposta, todos a preço de venda líquido (com acréscimo e descontos).
 * Cada material recebe o fator venda ÷ custo de materiais do seu item; materiais iguais do mesmo
 * grupo são somados. Valor unitário e total são arredondados ao centavo (total = unitário ×
 * quantidade) e a diferença de centavos fica na mão de obra, para o total geral ser sempre o
 * `saleNet` de computeBudget. Material fornecido pelo cliente não tem valor e não entra.
 */
export function clientPriceSheet(
  items: (PricingItem & { group: string })[],
  params: PricingParams,
  generalDiscount = 0,
) {
  const result = computeBudget(items, params, generalDiscount);
  const acc = new Map<
    string,
    { group: string; name: string; unit: string; qty: number; sale: number }
  >();
  items.forEach((it, i) => {
    const r = result.items[i];
    if (!r || !(r.materialsCost > 0)) return;
    const factor = r.materialsNet / r.materialsCost;
    const q = Number(it.quantity) || 0;
    for (const m of it.materials || []) {
      const cost = materialCost(m, q);
      if (!(cost > 0)) continue;
      const key = [it.group, m.material_id || m.name.trim().toLowerCase(), m.purchase_unit].join(
        "|",
      );
      const row = acc.get(key) ?? {
        group: it.group,
        name: m.name,
        unit: m.purchase_unit,
        qty: 0,
        sale: 0,
      };
      row.qty += materialPurchaseQty(m, q);
      row.sale += cost * factor;
      acc.set(key, row);
    }
  });
  const groups = new Map<string, { lines: ClientMaterialLine[]; totalCents: number }>();
  for (const row of acc.values()) {
    const quantity = r2(row.qty);
    if (!(quantity > 0)) continue;
    const unitCents = Math.round((row.sale * 100) / quantity);
    const totalCents = Math.round(unitCents * quantity);
    const g = groups.get(row.group) ?? { lines: [], totalCents: 0 };
    g.lines.push({
      name: row.name,
      unit: row.unit,
      quantity,
      unitPrice: unitCents / 100,
      total: totalCents / 100,
    });
    g.totalCents += totalCents;
    groups.set(row.group, g);
  }
  const materialsCents = [...groups.values()].reduce((s, g) => s + g.totalCents, 0);
  const laborCents = Math.max(0, Math.round(result.saleNet * 100) - materialsCents);
  return {
    result,
    materials: new Map(
      [...groups].map(([k, g]) => [k, { lines: g.lines, total: g.totalCents / 100 }]),
    ),
    materialsTotal: materialsCents / 100,
    laborTotal: laborCents / 100,
    total: (laborCents + materialsCents) / 100,
  };
}

/** Custo econômico não duplica parcelas nem pedidos já incluídos nos lançamentos. */
export function computeWorkResult(
  base: BudgetResult,
  approvedExtras: { price: number; cost: number }[],
  incurred: number,
  committed: number,
  additional: number | null,
  recordedCommission = 0,
  recordedTaxes = 0,
) {
  const extraValue = approvedExtras.reduce((s, e) => s + e.price, 0);
  const sale = base.saleNet + extraValue;
  const commission = Math.max(base.commission, recordedCommission);
  const taxes = Math.max(base.taxesTotal, recordedTaxes);
  const remainingEstimate =
    additional ??
    Math.max(
      0,
      base.totalCost + approvedExtras.reduce((s, e) => s + e.cost, 0) - incurred - committed,
    );
  // Custo estrutural do orçamento (modelo do custo direto) também não é lucro da obra.
  const structure = base.structure ?? 0;
  const cost = incurred + committed + remainingEstimate + commission + taxes + structure;
  const result = sale - cost;
  const accumulatedResult = sale - incurred - commission - taxes - structure;
  return {
    sale,
    extraValue,
    commission,
    taxes,
    structure,
    cost,
    result,
    accumulatedResult,
    remainingEstimate,
    estimateConfirmed: additional !== null,
    margin: sale > 0 ? result / sale : 0,
    /** Resultado ÷ preço da mão de obra (venda − materiais): a base dos orçamentos novos. */
    laborMargin: sale - base.materialsNet > 0 ? result / (sale - base.materialsNet) : 0,
  };
}

/**
 * Margem na mesma base das metas do orçamento (`desired_margin`/`min_margin`): sobre a mão de
 * obra nos orçamentos com os percentuais só sobre ela, senão sobre a venda total.
 */
export function targetMargin(
  params: Pick<PricingParams, "model" | "rates_base"> | null | undefined,
  r: { margin: number; laborMargin?: number },
) {
  return params && laborRatesBase(params) && r.laborMargin !== undefined ? r.laborMargin : r.margin;
}

/** Nome da base da margem, para os rótulos ("sobre a mão de obra" / "sobre a venda"). */
export const marginBaseLabel = (
  params: Pick<PricingParams, "model" | "rates_base"> | null | undefined,
) => (params && laborRatesBase(params) ? "sobre a mão de obra" : "sobre a venda");

/** Contract value supplied directly, without inferred catalog pricing or rates. */
export function directContractBase(value: number): BudgetResult {
  const r = computeBudget([], emptyParams, 0);
  return { ...r, saleNet: value, listTotal: value, result: value };
}
