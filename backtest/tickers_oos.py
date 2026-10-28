"""Out-of-ticker + out-of-sample test of the FROZEN rules (nothing is re-tuned).

Each ticker's prices are multiplied by a constant so its average price equals NQ's (~27,500). That makes the 40 point stop,
the 0.25 tick, slippage and commissions mean the same fraction of price everywhere, and P&L reads as "NQ-sized" dollars.
Only regular-hours files (13:00-21:59 UTC) are downloaded, so every series here is a regular-hours-only series.

Usage: python tickers_oos.py NAME=dir [NAME=dir ...]
"""
import sys
import numpy as np, pandas as pd
import run_dukascopy as R, engine as E

NQ_REF = 27500.0
FROZEN = dict(exit_k=2, stop_mode=1, stop_pts=40, tp_r=3, fresh=True, session=(570, 960), eod=960)
RULES = [("Original rules", dict(exit_k=3)),
         ("Best, longs only", {**FROZEN, "side": 1}),
         ("Best, longs + shorts", {**FROZEN, "side": 0}),
         ("Best, shorts only", {**FROZEN, "side": -1}),
         ("1:2 (10 stop / 20 target)", dict(exit_k=-1, stop_mode=1, stop_pts=10, tp_pts=20))]


def blocks_of(df):
    gap = df.index.to_series().diff()
    cut = (gap > pd.Timedelta(minutes=70)) & (gap < pd.Timedelta(hours=10))   # a missing hour inside a trading day
    return [b for _, b in df.groupby(cut.cumsum()) if len(b) >= 600]


def load(d):
    df = R.assemble(d)
    df = df[~df.index.duplicated()].sort_index()
    df = df[(df.index.hour >= 13) & (df.index.hour <= 21) & (df.index < pd.Timestamp("2025-10-20", tz="UTC"))]
    k = NQ_REF / df["close"].mean()
    return df * k, k


def agg(parts):
    parts = [p for p in parts if len(p)]
    return np.vstack(parts) if parts else np.zeros((0, 10))


if __name__ == "__main__":
    items = [a.split("=", 1) for a in sys.argv[1:]]
    res = {}
    print(f"{'ticker':<14}{'rule':<28}{'trades':>7}{'win%':>6}{'net $':>10}{'PF':>6}{'worst DD':>10}")
    for name, d in items:
        df, k = load(d)
        bl = blocks_of(df); Ps = [E.prepare(b) for b in bl]
        nb = sum(len(b) for b in bl)
        days = len({x.date() for b in bl for x in b.index})
        up = sum((P["c"][-1] - P["c"][0]) * 20 for P in Ps)
        for rn, kw in RULES:
            r = agg([E.run(P, **kw) for P in Ps]); s = E.stats(r); res[(name, rn)] = s
            print(f"{name:<14}{rn:<28}{s['n']:>7}{s['win']:>6.0%}{s['net']:>10,.0f}{s['pf']:>6.2f}{s['mdd']:>10,.0f}")
        print(f"{name:<14}(data: {nb:,} bars, {days} trading days in {len(bl)} blocks; buy&hold, NQ-sized: {up:+,.0f})\n")
    print("\nSUMMARY: best-version longs-only profit factor by ticker:",
          {n: round(res[(n, 'Best, longs only')]['pf'], 2) for n, _ in items})
    print("Longs + shorts:", {n: round(res[(n, 'Best, longs + shorts')]['pf'], 2) for n, _ in items})
    print("Original rules:", {n: round(res[(n, 'Original rules')]['pf'], 2) for n, _ in items})
