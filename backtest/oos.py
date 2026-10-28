"""Frozen-rule out-of-sample test: rules were fixed on 2025-10-20..2026-10-21; test on the year before and the week after."""
import sys
import numpy as np, pandas as pd
import run_dukascopy as R, engine as E

OLD, NEW = sys.argv[1], sys.argv[2]
parts = [R.assemble(OLD), R.assemble(NEW, "2025-10-20")]
df = pd.concat(parts); df = df[~df.index.duplicated()].sort_index()
P = E.prepare(df); idx = P["idx"]
b_a = int(idx.searchsorted(pd.Timestamp("2025-10-20", tz="UTC"))); b_b = int(idx.searchsorted(pd.Timestamp("2026-10-21", tz="UTC")))
print(f"bars {len(idx):,}: {idx[0].date()} -> {idx[-1].date()} | before-sample {b_a:,} bars, in-sample {b_b-b_a:,}, after-sample {len(idx)-b_b:,}")
FROZEN = dict(exit_k=2, stop_mode=1, stop_pts=40, tp_r=3, fresh=True, session=(570, 960), eod=960)
RULES = [("Original rules", dict(exit_k=3)),
         ("Best, longs only", {**FROZEN, "side": 1}),
         ("Best, longs + shorts", {**FROZEN, "side": 0}),
         ("Best, shorts only", {**FROZEN, "side": -1}),
         ("AM 9:30-13:00, both sides", {**FROZEN, "side": 0, "session": (570, 780)}),
         ("1:2 (10 stop / 20 target)", dict(exit_k=-1, stop_mode=1, stop_pts=10, tp_pts=20))]
segs = [("BEFORE (clean test)", 0, b_a), ("IN-SAMPLE (picked here)", b_a, b_b), ("AFTER (clean test)", b_b, len(idx))]
print(f"\n{'rule':<28}{'segment':<24}{'trades':>7}{'win%':>6}{'net $':>10}{'PF':>6}{'worst DD':>10}")
for name, kw in RULES:
    r = E.run(P, **kw)
    for sn, lo, hi in segs:
        s = E.stats(r, lo, hi)
        print(f"{name:<28}{sn:<24}{s['n']:>7}{s['win']:>6.0%}{s['net']:>10,.0f}{s['pf']:>6.2f}{s['mdd']:>10,.0f}")
    print()
for sn, lo, hi in segs:
    print(f"{sn:<24} NQ-style price {P['c'][lo]:,.0f} -> {P['c'][hi-1]:,.0f} ({(P['c'][hi-1]/P['c'][lo]-1):+.1%}); buy&hold 1 contract {(P['c'][hi-1]-P['c'][lo])*20:+,.0f}")
r = E.run(P, **RULES[1][1]); ym = idx[r[:, 0].astype(int)].strftime("%y-%m")
m = pd.Series(r[:, 5]).groupby(ym).sum(); mm = m[m.index < "25-10"]
print("\nlongs-only, months before sample:", " ".join(f"{k}:{v:+,.0f}" for k, v in mm.items()), f"| positive {int((mm>0).sum())}/{len(mm)}")
