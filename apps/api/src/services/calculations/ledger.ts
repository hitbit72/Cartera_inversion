import type { CostMethod, TransactionType } from '@cartera/shared';
import { D, ZERO, type Decimal } from '../../lib/decimal.js';

export interface LedgerTransaction {
  id: string;
  asset_id: string;
  type: TransactionType;
  trade_date: string;
  quantity: string;
  unit_price: string;
  fees: string;
  fx_rate_eur: string;
  created_at?: string;
}

export interface TransactionComputation {
  amountEur: Decimal;
  feesEur: Decimal;
  /** Compra: importe + comisiones. Venta: importe − comisiones. */
  netEur: Decimal;
  /** Flujo de caja para la rentabilidad: compra positiva, venta negativa. */
  flowEur: Decimal;
  realizedPnlEur: Decimal | null;
}

export interface OpenLot {
  quantity: Decimal;
  costEur: Decimal;
  costNative: Decimal;
}

export interface OversoldEvent {
  transactionId: string;
  available: Decimal;
  requested: Decimal;
}

export interface LedgerResult {
  assetId: string;
  quantity: Decimal;
  costBasisEur: Decimal;
  costBasisNative: Decimal;
  realizedPnlEur: Decimal;
  avgCostEur: Decimal;
  avgCostNative: Decimal;
  lots: OpenLot[];
  transactions: Map<string, TransactionComputation>;
  oversold: OversoldEvent[];
}

/** Orden estable: fecha, después creación y, por último, id. */
export const sortLedgerTransactions = <T extends LedgerTransaction>(transactions: T[]): T[] =>
  [...transactions].sort((a, b) => {
    if (a.trade_date !== b.trade_date) return a.trade_date < b.trade_date ? -1 : 1;
    const aCreated = a.created_at ?? '';
    const bCreated = b.created_at ?? '';
    if (aCreated !== bCreated) return aCreated < bCreated ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

/**
 * Reconstruye el histórico de un activo. Se usa tanto para calcular la
 * cartera como para validar que una venta no supera la posición disponible.
 */
export const computeLedger = (
  assetId: string,
  transactions: LedgerTransaction[],
  method: CostMethod,
): LedgerResult => {
  const sorted = sortLedgerTransactions(transactions.filter((tx) => tx.asset_id === assetId));

  const computations = new Map<string, TransactionComputation>();
  const oversold: OversoldEvent[] = [];

  let position = ZERO;
  let lots: OpenLot[] = [];
  let averageCostEur = ZERO;
  let averageCostNative = ZERO;
  let realizedPnlEur = ZERO;
  let nativeCostOpen = ZERO;

  for (const tx of sorted) {
    const qty = D(tx.quantity);
    const price = D(tx.unit_price);
    const fees = D(tx.fees);
    const fx = D(tx.fx_rate_eur);

    const gross = qty.mul(price);
    const amountEur = gross.mul(fx);
    const feesEur = fees.mul(fx);

    if (tx.type === 'BUY') {
      const costEur = amountEur.plus(feesEur);
      const costNative = gross.plus(fees);

      if (method === 'FIFO') {
        lots.push({ quantity: qty, costEur, costNative });
        position = position.plus(qty);
        nativeCostOpen = nativeCostOpen.plus(costNative);
      } else {
        const newPosition = position.plus(qty);
        const totalCostEur = averageCostEur.mul(position).plus(costEur);
        const totalCostNative = averageCostNative.mul(position).plus(costNative);
        position = newPosition;
        averageCostEur = newPosition.isZero() ? ZERO : totalCostEur.div(newPosition);
        averageCostNative = newPosition.isZero() ? ZERO : totalCostNative.div(newPosition);
        nativeCostOpen = averageCostNative.mul(position);
      }

      computations.set(tx.id, {
        amountEur,
        feesEur,
        netEur: costEur,
        flowEur: costEur,
        realizedPnlEur: null,
      });
      continue;
    }

    // Venta
    const proceeds = amountEur.minus(feesEur);
    const positionBefore = position;

    if (qty.gt(positionBefore)) {
      oversold.push({ transactionId: tx.id, available: positionBefore, requested: qty });
    }

    let costConsumed = ZERO;

    if (method === 'FIFO') {
      let remaining = DecimalMin(qty, positionBefore);

      while (remaining.gt(0) && lots.length > 0) {
        const lot = lots[0]!;
        if (lot.quantity.lte(0)) {
          lots.shift();
          continue;
        }
        const take = DecimalMin(remaining, lot.quantity);
        const unitCostEur = lot.costEur.div(lot.quantity);
        const unitCostNative = lot.costNative.div(lot.quantity);

        costConsumed = costConsumed.plus(take.mul(unitCostEur));
        lot.quantity = lot.quantity.minus(take);
        lot.costEur = lot.costEur.minus(take.mul(unitCostEur));
        lot.costNative = lot.costNative.minus(take.mul(unitCostNative));
        nativeCostOpen = nativeCostOpen.minus(take.mul(unitCostNative));

        remaining = remaining.minus(take);
        if (lot.quantity.lte(0)) lots.shift();
      }

      position = positionBefore.minus(qty);
      if (position.isNegative()) position = ZERO;
      if (position.isZero()) lots = [];
    } else {
      const sold = DecimalMin(qty, positionBefore);
      costConsumed = averageCostEur.mul(sold);
      const nativeConsumed = averageCostNative.mul(sold);
      nativeCostOpen = nativeCostOpen.minus(nativeConsumed);
      position = positionBefore.minus(qty);
      if (position.isNegative()) position = ZERO;
      if (position.isZero()) {
        averageCostEur = ZERO;
        averageCostNative = ZERO;
        nativeCostOpen = ZERO;
      }
    }

    const realized = proceeds.minus(costConsumed);
    realizedPnlEur = realizedPnlEur.plus(realized);

    computations.set(tx.id, {
      amountEur,
      feesEur,
      netEur: proceeds,
      flowEur: proceeds.negated(),
      realizedPnlEur: realized,
    });
  }

  const costBasisEur =
    method === 'FIFO'
      ? lots.reduce((total, lot) => total.plus(lot.costEur), ZERO)
      : averageCostEur.mul(position);

  const costBasisNative =
    method === 'FIFO'
      ? lots.reduce((total, lot) => total.plus(lot.costNative), ZERO)
      : nativeCostOpen;

  return {
    assetId,
    quantity: position,
    costBasisEur,
    costBasisNative,
    realizedPnlEur,
    avgCostEur: position.isZero() ? ZERO : costBasisEur.div(position),
    avgCostNative: position.isZero() ? ZERO : costBasisNative.div(position),
    lots,
    transactions: computations,
    oversold,
  };
};

const DecimalMin = (a: Decimal, b: Decimal): Decimal => (a.lt(b) ? a : b);

export const ledgerByAsset = (
  transactions: LedgerTransaction[],
  method: CostMethod,
): Map<string, LedgerResult> => {
  const assetIds = new Set(transactions.map((tx) => tx.asset_id));
  const result = new Map<string, LedgerResult>();
  for (const assetId of assetIds) {
    result.set(assetId, computeLedger(assetId, transactions, method));
  }
  return result;
};
