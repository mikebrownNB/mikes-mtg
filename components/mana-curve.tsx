/**
 * Tiny mana curve as a stack of bars. Bins are 0, 1, 2, 3, 4, 5, 6, 7+.
 * Lands are excluded — that's the convention for curve charts since their
 * CMC is 0 but they don't represent "spend a turn casting" the same way.
 */
type CurveCard = {
  cmc: number | null;
  type_line: string | null;
  quantity: number;
};

const BINS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const BIN_LABELS = ["0", "1", "2", "3", "4", "5", "6", "7+"] as const;

export function ManaCurve({ cards }: { cards: CurveCard[] }) {
  const counts = BINS.map(() => 0);
  for (const c of cards) {
    if ((c.type_line ?? "").toLowerCase().includes("land")) continue;
    const cmc = c.cmc ?? 0;
    const idx = cmc >= 7 ? 7 : Math.max(0, Math.floor(cmc));
    counts[idx] += c.quantity;
  }
  const max = Math.max(1, ...counts);
  const total = counts.reduce((s, n) => s + n, 0);

  if (total === 0) {
    return (
      <p className="text-xs text-neutral-500">No non-land cards yet.</p>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
      <div className="mb-2 flex items-center justify-between text-xs text-neutral-400">
        <span>Mana curve</span>
        <span>{total} non-land</span>
      </div>
      <div className="flex h-16 items-end gap-1">
        {counts.map((n, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div className="relative flex h-full w-full items-end">
              <div
                className="w-full rounded-t bg-emerald-600/80"
                style={{ height: `${(n / max) * 100}%` }}
                title={`CMC ${BIN_LABELS[i]}: ${n}`}
              />
              {n > 0 && (
                <span className="absolute inset-x-0 -top-4 text-center text-[10px] text-neutral-300">
                  {n}
                </span>
              )}
            </div>
            <span className="text-[10px] text-neutral-500">
              {BIN_LABELS[i]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
