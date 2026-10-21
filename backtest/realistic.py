"""Realistic NQ run: tick rounding, slippage, commissions, gap fills, limit-through fills,
open trade marked at the end, worst-case intrabar drawdown, starting balance."""
import argparse, numpy as np, pandas as pd
import nq_supertrend_backtest as b

TICK, TICK_USD = 0.25, 5.0


def rt(x):  # round to tick
    return round(x / TICK) * TICK


def run(df, target, stop, capital, slip_ticks=1, stop_slip_ticks=2, comm_side=2.5, limit_through=True, flip_exit=False):
    df = df.copy()
    # drop an unfinished last bar (timestamp not on a 5-min boundary)
    if df.index[-1].minute % 5 or df.index[-1].second:
        df = df.iloc[:-1]
    df["ema"] = df.close.ewm(span=50, adjust=False).mean()
    d = np.vstack([b.supertrend(df, p, m) for p, m in b.SUPERTRENDS])
    long_ok = (d == 1).all(0) & (df.close.values > df.ema.values)
    short_ok = (d == -1).all(0) & (df.close.values < df.ema.values)
    long_ok_st, short_ok_st = (d == 1).all(0), (d == -1).all(0)
    o, h, l, c, idx = df.open.values, df.high.values, df.low.values, df.close.values, df.index
    es, ss = slip_ticks * TICK, stop_slip_ticks * TICK
    through = TICK if limit_through else 0.0

    bal, trades, pos, worst, peak = capital, [], 0, capital, capital
    maxdd = 0.0
    ent = e_t = tp = sl = None

    def finish(i, px, why):
        nonlocal bal, pos
        pts = (px - ent) * pos
        pnl = pts * b.POINT_VALUE - 2 * comm_side
        bal += pnl
        trades.append((e_t, idx[i], pos, ent, px, pts, pnl, why))
        pos = 0

    def check_exit(i):
        if sl is not None and ((pos == 1 and l[i] <= sl) or (pos == -1 and h[i] >= sl)):
            gap = o[i] <= sl if pos == 1 else o[i] >= sl
            base = o[i] if gap else sl
            finish(i, rt(base - pos * ss), "stop"); return True
        if (pos == 1 and h[i] >= tp + through) or (pos == -1 and l[i] <= tp - through):
            gap = o[i] >= tp if pos == 1 else o[i] <= tp
            finish(i, rt(o[i]) if gap else tp, "target"); return True
        return False

    for i in range(1, len(df)):
        if pos != 0:
            if not check_exit(i) and flip_exit and not (long_ok_st[i - 1] if pos == 1 else short_ok_st[i - 1]):
                finish(i, rt(o[i] - pos * es), "flip")
        if pos == 0 and i < len(df) - 1 and (long_ok[i] or short_ok[i]):
            pos = 1 if long_ok[i] else -1
            ent, e_t = rt(o[i + 1] + pos * es), idx[i + 1]
            tp = ent + pos * target
            sl = None if stop is None else ent - pos * stop
            # entry bar can already hit the stop/target (stop first = worst case)
            j = i + 1
            if not check_exit(j):
                pass
        # worst-case mark-to-market on bar i for an open trade
        if pos != 0:
            adverse = l[i] if pos == 1 else h[i]
            eq = bal + (adverse - ent) * pos * b.POINT_VALUE
        else:
            eq = bal
        peak = max(peak, eq); maxdd = min(maxdd, eq - peak); worst = min(worst, eq)
    open_pnl = 0.0
    if pos != 0:  # mark open trade at final close, exit costs included
        px = rt(c[-1] - pos * es)
        open_pnl = (px - ent) * pos * b.POINT_VALUE - 2 * comm_side
    t = pd.DataFrame(trades, columns=["entry_time", "exit_time", "side", "entry", "exit", "points", "pnl_usd", "why"])
    return t, open_pnl, maxdd, worst, df


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True)
    ap.add_argument("--capital", type=float, default=50000)
    a = ap.parse_args()
    df = b.load_csv(a.csv)
    print(f"Start ${a.capital:,.0f} | 1 NQ | 1 tick entry slip, 2 tick stop slip, $2.50/side commission, limit fills need 1 tick through\n")
    print(f"{'Setup':22}{'Trades':>7}{'Win%':>7}{'Net P&L':>10}{'End bal':>10}{'Return':>8}{'PF':>6}{'MaxDD':>9}{'Min bal':>9}  Costs")
    for name, tg, st in [("10-pt TP (no stop)", 10, None), ("1:1 (10 stop/10 TP)", 10, 10), ("1:2 (10 stop/20 TP)", 20, 10)]:
        t, op, dd, worst, d2 = run(df, tg, st, a.capital)
        n = len(t) + (1 if op else 0)
        pnl = t.pnl_usd.sum() + op
        wins = (t.pnl_usd > 0).sum()
        gl = abs(t.pnl_usd[t.pnl_usd <= 0].sum()) + (abs(op) if op < 0 else 0)
        gw = t.pnl_usd[t.pnl_usd > 0].sum() + (op if op > 0 else 0)
        costs = n * 5.0
        print(f"{name:22}{n:>7}{wins/n:>7.1%}{pnl:>10,.0f}{a.capital+pnl:>10,.0f}{pnl/a.capital:>8.1%}{gw/gl if gl else float('inf'):>6.2f}{dd:>9,.0f}{worst:>9,.0f}  ${costs:,.0f} comm")
        t.to_csv(f"trades_{tg}_{st}.csv", index=False)
