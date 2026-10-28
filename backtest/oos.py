"""Frozen-rule out-of-sample test. Rules were fixed on 2025-10-20..2026-10-21; this runs them, untouched, on:
  BEFORE: the year before (each contiguous block of downloaded data run on its own so gaps never get bridged)
  AFTER : data after 2026-10-21 (continuing straight on from the in-sample series, so indicators are warmed up)
Usage: python oos.py <dir with newer-than-sample files + older files> <dir with 2025-10-20..2026-10-21 files>
"""
import sys
import numpy as np, pandas as pd
import run_dukascopy as R, engine as E

OOS_DIR, MAIN_DIR = sys.argv[1], sys.argv[2]
S0, S1 = pd.Timestamp("2025-10-20", tz="UTC"), pd.Timestamp("2026-10-21", tz="UTC")
FROZEN = dict(exit_k=2, stop_mode=1, stop_pts=40, tp_r=3, fresh=True, session=(570, 960), eod=960)
RULES = [("Original rules", dict(exit_k=3)),
         ("Best, longs only", {**FROZEN, "side": 1}),
         ("Best, longs + shorts", {**FROZEN, "side": 0}),
         ("Best, shorts only", {**FROZEN, "side": -1}),
         ("AM 9:30-13:00, both sides", {**FROZEN, "side": 0, "session": (570, 780)}),
         ("1:2 (10 stop / 20 target)", dict(exit_k=-1, stop_mode=1, stop_pts=10, tp_pts=20))]

allb = R.assemble(OOS_DIR); allb = allb[~allb.index.duplicated()].sort_index()
old = allb[allb.index < S0]
gap = old.index.to_series().diff()
cut = (gap > pd.Timedelta(hours=2)) & (gap < pd.Timedelta(hours=40))
blocks = [b for _, b in old.groupby(cut.cumsum()) if len(b) >= 1500]
print(f"BEFORE data: {len(old):,} bars in {len(blocks)} usable blocks covering {sum(len(b) for b in blocks):,} bars "
      f"({blocks[0].index[0].date() if blocks else '-'} .. {blocks[-1].index[-1].date() if blocks else '-'})")
main = R.assemble(MAIN_DIR, "2025-10-20"); new = allb[allb.index >= S1]
after = pd.concat([main, new]); after = after[~after.index.duplicated()].sort_index()
Pa = E.prepare(after); a_lo = int(Pa["idx"].searchsorted(S1))
print(f"AFTER data: {len(new):,} bars ({new.index[0].date() if len(new) else '-'} .. {new.index[-1].date() if len(new) else '-'})")
Pb = [E.prepare(b) for b in blocks]

def agg(parts):
    parts = [p for p in parts if len(p)]
    return np.vstack(parts) if parts else np.zeros((0, 10))

print(f"\n{'rule':<28}{'segment':<10}{'trades':>7}{'win%':>6}{'net $':>10}{'PF':>6}{'worst DD':>10}")
for name, kw in RULES:
    before = agg([E.run(P, **kw) for P in Pb])
    aft = E.run(Pa, **kw); aft = aft[aft[:, 0] >= a_lo] if len(aft) else aft
    for sn, r in (("BEFORE", before), ("AFTER", aft)):
        s = E.stats(r)
        print(f"{name:<28}{sn:<10}{s['n']:>7}{s['win']:>6.0%}{s['net']:>10,.0f}{s['pf']:>6.2f}{s['mdd']:>10,.0f}")
    print()
bh = sum((P["c"][-1] - P["c"][0]) * 20 for P in Pb)
print(f"buy&hold 1 contract across the BEFORE blocks: {bh:+,.0f}")
if len(Pb):
    r = agg([E.run(P, **RULES[1][1]) for P in Pb])
    ids = np.concatenate([P["idx"][E.run(P, **RULES[1][1])[:, 0].astype(int)] for P in Pb]) if len(r) else []
    if len(r):
        m = pd.Series(r[:, 5]).groupby(pd.DatetimeIndex(ids).strftime("%y-%m")).sum()
        print("longs-only BEFORE by month:", " ".join(f"{k}:{v:+,.0f}" for k, v in m.items()), f"| positive {int((m>0).sum())}/{len(m)}")
