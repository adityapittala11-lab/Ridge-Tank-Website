"""NQ 5-min backtest: 50 EMA + three Supertrends (11/2, 10/1, 12/3), all agree to trade.

Usage:
  python nq_supertrend_backtest.py --csv nq_5min.csv
  MASSIVE_API_KEY=xxx python nq_supertrend_backtest.py --from 2025-01-01 --to 2025-06-30

CSV columns (any case): timestamp/time/date, open, high, low, close[, volume]
"""
import argparse, os, sys
import numpy as np, pandas as pd

POINT_VALUE = 20.0  # NQ: $20 per point
SUPERTRENDS = [(11, 2.0), (10, 1.0), (12, 3.0)]  # (ATR period, multiplier), source = (H+L)/2


def load_csv(path):
    df = pd.read_csv(path)
    df.columns = [c.strip().lower() for c in df.columns]
    tcol = next(c for c in ("timestamp", "time", "datetime", "date", "t") if c in df.columns)
    t = df[tcol]
    unit = "ms" if pd.api.types.is_numeric_dtype(t) and t.iloc[0] > 1e11 else None
    df.index = pd.to_datetime(t, unit=unit, utc=True)
    return df[["open", "high", "low", "close"]].sort_index()


def load_massive(key, start, end, ticker="NQ1", base="https://api.massive.com"):
    """Pulls 5-min futures bars. Adjust `url` if your Massive plan uses a different path."""
    import requests
    url = f"{base}/futures/vX/aggs/{ticker}"
    params = {"resolution": "5min", "window_start.gte": start, "window_start.lte": end,
              "limit": 50000, "sort": "window_start.asc", "apiKey": key}
    rows = []
    while url:
        r = requests.get(url, params=params, timeout=60)
        r.raise_for_status()
        j = r.json()
        rows += j.get("results", [])
        url, params = j.get("next_url"), {"apiKey": key}
    df = pd.DataFrame(rows)
    df.index = pd.to_datetime(df["window_start"], unit="ns", utc=True)
    return df[["open", "high", "low", "close"]]


def atr_rma(h, l, c, n):  # "Change ATR Calculation Method" ticked = Wilder/RMA
    pc = np.r_[np.nan, c[:-1]]
    tr = np.maximum.reduce([h - l, np.abs(h - pc), np.abs(l - pc)])
    tr[0] = h[0] - l[0]
    out = np.full(len(tr), np.nan)
    if len(tr) < n:
        return out
    out[n - 1] = tr[:n].mean()
    for i in range(n, len(tr)):
        out[i] = (out[i - 1] * (n - 1) + tr[i]) / n
    return out


def supertrend(df, period, mult):
    h, l, c = df.high.values, df.low.values, df.close.values
    hl2 = (h + l) / 2
    atr = atr_rma(h, l, c, period)
    up, dn = hl2 - mult * atr, hl2 + mult * atr
    d = np.ones(len(c), dtype=int)
    for i in range(1, len(c)):
        if np.isnan(atr[i]):
            continue
        if c[i - 1] > up[i - 1]:
            up[i] = max(up[i], up[i - 1])
        if c[i - 1] < dn[i - 1]:
            dn[i] = min(dn[i], dn[i - 1])
        d[i] = d[i - 1]
        if d[i - 1] == -1 and c[i] > dn[i - 1]:
            d[i] = 1
        elif d[i - 1] == 1 and c[i] < up[i - 1]:
            d[i] = -1
    d[np.isnan(atr)] = 0
    return d


def backtest(df, slippage=0.0):
    df = df.copy()
    df["ema"] = df.close.ewm(span=50, adjust=False).mean()
    dirs = np.vstack([supertrend(df, p, m) for p, m in SUPERTRENDS])
    all_up, all_dn = (dirs == 1).all(0), (dirs == -1).all(0)
    long_ok = all_up & (df.close.values > df.ema.values)
    short_ok = all_dn & (df.close.values < df.ema.values)

    o, idx = df.open.values, df.index
    trades, pos, entry, e_t = [], 0, 0.0, None
    for i in range(len(df) - 1):
        # signal evaluated on bar i close, filled at bar i+1 open (no look-ahead)
        if pos == 1 and not all_up[i]:
            trades.append((e_t, idx[i + 1], 1, entry, o[i + 1] - slippage)); pos = 0
        elif pos == -1 and not all_dn[i]:
            trades.append((e_t, idx[i + 1], -1, entry, o[i + 1] + slippage)); pos = 0
        if pos == 0:
            if long_ok[i]:
                pos, entry, e_t = 1, o[i + 1] + slippage, idx[i + 1]
            elif short_ok[i]:
                pos, entry, e_t = -1, o[i + 1] - slippage, idx[i + 1]
    t = pd.DataFrame(trades, columns=["entry_time", "exit_time", "side", "entry", "exit"])
    t["points"] = (t.exit - t.entry) * t.side
    t["pnl_usd"] = t.points * POINT_VALUE
    return t


def report(t):
    if t.empty:
        print("No trades."); return
    w, ls = t[t.pnl_usd > 0], t[t.pnl_usd <= 0]
    eq = t.pnl_usd.cumsum()
    print(f"Trades:        {len(t)}  (long {int((t.side==1).sum())}, short {int((t.side==-1).sum())})")
    print(f"Win rate:      {len(w)/len(t):.1%}")
    print(f"Total P&L:     ${t.pnl_usd.sum():,.0f}  ({t.points.sum():,.1f} pts, 1 contract)")
    print(f"Avg trade:     ${t.pnl_usd.mean():,.0f}   Avg win ${w.pnl_usd.mean():,.0f}   Avg loss ${ls.pnl_usd.mean():,.0f}")
    print(f"Profit factor: {w.pnl_usd.sum()/abs(ls.pnl_usd.sum()) if len(ls) and ls.pnl_usd.sum() else float('inf'):.2f}")
    print(f"Max drawdown:  ${(eq - eq.cummax()).min():,.0f}")
    print(f"Long P&L ${t[t.side==1].pnl_usd.sum():,.0f} | Short P&L ${t[t.side==-1].pnl_usd.sum():,.0f}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv")
    ap.add_argument("--from", dest="start", default="2025-01-01")
    ap.add_argument("--to", dest="end", default="2025-12-31")
    ap.add_argument("--slippage", type=float, default=0.0, help="points per fill")
    a = ap.parse_args()
    if a.csv:
        df = load_csv(a.csv)
    elif os.getenv("MASSIVE_API_KEY"):
        df = load_massive(os.environ["MASSIVE_API_KEY"], a.start, a.end)
    else:
        sys.exit("Give --csv FILE or set MASSIVE_API_KEY")
    t = backtest(df, a.slippage)
    report(t)
    t.to_csv("nq_trades.csv", index=False)
    print("Trades saved to nq_trades.csv")
