"""Fast NQ strategy engine: 50 EMA + three Supertrends (11/2, 10/1, 12/3, source (H+L)/2, RMA ATR).

Fill model (same as realistic.py): signals on bar close, entries/market exits at the next open
with slippage, stops fill at the level (or the open on a gap) with extra slippage, targets are
limit orders that need price to trade 1 tick through, stop wins when a bar touches both.
"""
import numpy as np, pandas as pd
from numba import njit

TICK, PV = 0.25, 20.0
SUPERTRENDS = [(11, 2.0), (10, 1.0), (12, 3.0)]


@njit(cache=True)
def _atr_rma(h, l, c, n):
    N = len(c); tr = np.empty(N); out = np.full(N, np.nan)
    tr[0] = h[0] - l[0]
    for i in range(1, N):
        tr[i] = max(h[i] - l[i], abs(h[i] - c[i - 1]), abs(l[i] - c[i - 1]))
    if N < n: return out
    s = 0.0
    for i in range(n): s += tr[i]
    out[n - 1] = s / n
    for i in range(n, N): out[i] = (out[i - 1] * (n - 1) + tr[i]) / n
    return out


@njit(cache=True)
def supertrend_line(h, l, c, period, mult):
    """Pine 'SuperTrend' (KivancOzbilgic) with ta.atr. Returns trend (+1/-1, 0 while warming up) and the active line."""
    N = len(c); atr = _atr_rma(h, l, c, period)
    up = np.full(N, np.nan); dn = np.full(N, np.nan); d = np.zeros(N, np.int64); line = np.full(N, np.nan)
    tr = 1
    for i in range(N):
        if np.isnan(atr[i]):
            continue
        src = (h[i] + l[i]) / 2
        u = src - mult * atr[i]; v = src + mult * atr[i]
        u1 = up[i - 1] if i > 0 and not np.isnan(up[i - 1]) else u
        d1 = dn[i - 1] if i > 0 and not np.isnan(dn[i - 1]) else v
        if i > 0 and c[i - 1] > u1: u = max(u, u1)
        if i > 0 and c[i - 1] < d1: v = min(v, d1)
        up[i] = u; dn[i] = v
        if tr == -1 and c[i] > d1: tr = 1
        elif tr == 1 and c[i] < u1: tr = -1
        d[i] = tr
        line[i] = u if tr == 1 else v
    return d, line


def prepare(df):
    """df: UTC-indexed OHLC. Returns dict of numpy arrays used by sim()."""
    df = df[~df.index.duplicated()].sort_index()
    h, l, c, o = (df[k].values.astype(np.float64) for k in ("high", "low", "close", "open"))
    ds, lines = [], []
    for p, m in SUPERTRENDS:
        d, ln = supertrend_line(h, l, c, p, m); ds.append(d); lines.append(ln)
    ny = df.index.tz_convert("America/New_York")
    mins = (ny.hour * 60 + ny.minute).values.astype(np.int64)
    day = ((ny + pd.Timedelta(hours=6)).normalize().tz_localize(None) - pd.Timestamp("1970-01-01")) // pd.Timedelta(days=1)  # futures trading day (18:00 ET roll)
    day = np.asarray(day, dtype=np.int64)
    cnt_up = sum((d == 1).astype(np.int64) for d in ds); cnt_dn = sum((d == -1).astype(np.int64) for d in ds)
    return dict(idx=df.index, o=o, h=h, l=l, c=c, ema=df.close.ewm(span=50, adjust=False).mean().values,
                d=ds, lines=lines, cnt_up=cnt_up, cnt_dn=cnt_dn, slow_dir=ds[2], slow_line=lines[2],
                mins=mins, day=day, atr14=_atr_rma(h, l, c, 14))


@njit(cache=True)
def _sim(o, h, l, c, ema, cnt_up, cnt_dn, slow_dir, slow_line, mins, day, atr14,
         use_ema, fresh, s_min, e_min, eod_min, max_per_day, side_mask, min_atr,
         exit_k, stop_mode, stop_pts, tp_r, tp_pts, slip_e, slip_s, comm):
    N = len(o)
    out = np.empty((N // 2 + 2, 10)); nt = 0; mae = 0.0
    pos = 0; entry = 0.0; ei = 0; sl = 0.0; tp = 0.0; has_sl = False; has_tp = False
    armed = True; cur_day = -1; day_trades = 0
    pend = 0; pend_line = 0.0
    for i in range(1, N):
        just = False
        # 1) fill pending entry at this open
        if pos == 0 and pend != 0:
            pos = pend; ei = i; just = True
            entry = round((o[i] + pos * slip_e) / 0.25) * 0.25
            has_sl = False; has_tp = False; mae = 0.0
            risk = 0.0
            if stop_mode == 1:
                sl = entry - pos * stop_pts; has_sl = True; risk = stop_pts
            elif stop_mode >= 2:
                sl = pend_line; has_sl = True; risk = (entry - sl) * pos
                if risk < 4.0 or risk > 150.0:  # degenerate line distance: drop the trade
                    pos = 0; has_sl = False
            if pos != 0:
                if tp_r > 0 and has_sl: tp = entry + pos * tp_r * risk; has_tp = True
                elif tp_pts > 0: tp = entry + pos * tp_pts; has_tp = True
            day_trades += 1
            if fresh: armed = False
        pend = 0
        # 2) manage open position on bar i
        if pos != 0:
            adv = (entry - l[i]) if pos == 1 else (h[i] - entry)
            if adv > mae: mae = adv
            done = False; px = 0.0; why = 0
            if not just:
                flip = False
                if exit_k < 0:
                    flip = False  # no Supertrend exit (stop / target / end of day only)
                elif exit_k > 0:
                    agree = cnt_up[i - 1] if pos == 1 else cnt_dn[i - 1]
                    flip = agree < exit_k
                else:
                    flip = slow_dir[i - 1] != pos
                eod = eod_min >= 0 and mins[i] >= eod_min and (mins[i - 1] < eod_min or mins[i] < mins[i - 1])
                if flip or eod:
                    px = round((o[i] - pos * slip_e) / 0.25) * 0.25; done = True; why = 3 if (eod and not flip) else 0
                elif stop_mode == 3 and slow_dir[i - 1] == pos:
                    nl = slow_line[i - 1]
                    if pos == 1: sl = max(sl, nl)
                    else: sl = min(sl, nl)
            if not done:
                if has_sl and ((pos == 1 and l[i] <= sl) or (pos == -1 and h[i] >= sl)):
                    gap = (o[i] <= sl) if pos == 1 else (o[i] >= sl)
                    base = o[i] if gap else sl
                    px = round((base - pos * slip_s) / 0.25) * 0.25; done = True; why = 1
                elif has_tp and ((pos == 1 and h[i] >= tp + 0.25) or (pos == -1 and l[i] <= tp - 0.25)):
                    gap = (o[i] >= tp) if pos == 1 else (o[i] <= tp)
                    px = round(o[i] / 0.25) * 0.25 if gap else tp; done = True; why = 2
            if done:
                out[nt, 0] = ei; out[nt, 1] = i; out[nt, 2] = pos; out[nt, 3] = entry; out[nt, 4] = px
                out[nt, 5] = (px - entry) * pos * 20.0 - 2.0 * comm
                out[nt, 6] = sl if has_sl else 0.0; out[nt, 7] = tp if has_tp else 0.0; out[nt, 8] = why; out[nt, 9] = mae; nt += 1; pos = 0
        # 3) look for a new entry on this bar's close
        if day[i] != cur_day:
            cur_day = day[i]; day_trades = 0
        okl = cnt_up[i] == 3 and (not use_ema or c[i] > ema[i])
        oks = cnt_dn[i] == 3 and (not use_ema or c[i] < ema[i])
        if not (okl or oks): armed = True
        if pos == 0 and i < N - 1 and (armed or not fresh):
            if mins[i] >= s_min and mins[i] < e_min and (max_per_day == 0 or day_trades < max_per_day) and atr14[i] >= min_atr:
                if okl and side_mask >= 0: pend = 1; pend_line = slow_line[i]
                elif oks and side_mask <= 0: pend = -1; pend_line = slow_line[i]
    if pos != 0:  # mark open trade at the last close
        px = c[N - 1]
        out[nt, 0] = ei; out[nt, 1] = N - 1; out[nt, 2] = pos; out[nt, 3] = entry; out[nt, 4] = px
        out[nt, 5] = (px - entry) * pos * 20.0 - 2.0 * comm
        out[nt, 6] = sl if has_sl else 0.0; out[nt, 7] = tp if has_tp else 0.0; out[nt, 8] = 4; out[nt, 9] = mae; nt += 1
    return out[:nt]


def run(P, use_ema=True, fresh=False, session=(0, 1440), eod=-1, max_per_day=0, side=0, min_atr=0.0,
        exit_k=3, stop_mode=0, stop_pts=0.0, tp_r=0.0, tp_pts=0.0, slip_e=0.25, slip_s=0.5, comm=2.5):
    r = _sim(P["o"], P["h"], P["l"], P["c"], P["ema"], P["cnt_up"], P["cnt_dn"], P["slow_dir"], P["slow_line"],
             P["mins"], P["day"], P["atr14"], use_ema, fresh, session[0], session[1], eod, max_per_day, side, min_atr,
             exit_k, stop_mode, float(stop_pts), float(tp_r), float(tp_pts), slip_e, slip_s, comm)
    return r


def stats(r, lo=0, hi=None):
    """Summary over trades whose entry bar is in [lo, hi). dd = closed-trade drawdown, mdd = worst drawdown counting the
    adverse move inside each trade (what the account really felt)."""
    if hi is None: hi = 1 << 60
    t = r[(r[:, 0] >= lo) & (r[:, 0] < hi)] if len(r) else r
    n = len(t)
    if n == 0: return dict(n=0, net=0.0, pf=0.0, win=0.0, dd=0.0, mdd=0.0, avg=0.0)
    p = t[:, 5]; w = p[p > 0].sum(); ls = -p[p <= 0].sum(); eq = np.cumsum(p)
    before = np.concatenate(([0.0], eq[:-1])); peak = np.maximum.accumulate(np.concatenate(([0.0], eq)))[:-1]
    worst = before - t[:, 9] * 20.0
    mdd = float(min((worst - peak).min(), (eq - np.maximum.accumulate(eq)).min()))
    return dict(n=n, net=float(p.sum()), pf=float(w / ls) if ls > 0 else 99.0, win=float((p > 0).mean()),
                dd=float((eq - np.maximum.accumulate(eq)).min()), mdd=mdd, avg=float(p.mean()))
