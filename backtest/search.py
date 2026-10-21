"""Grid search over rule variants of the 50 EMA + 3 Supertrend strategy with a 3-way time split.

train (first 50%) picks candidates, validation (next 25%) filters them, test (last 25%) is looked at once.
"""
import itertools, json, sys
import numpy as np
import engine as E

SESSIONS = {"24h": (0, 1440), "RTH 9:30-16:00": (570, 960), "AM 9:30-13:00": (570, 780)}


def grid():
    for fresh, (sname, sess), eod, side, exit_k in itertools.product(
            (False, True), SESSIONS.items(), (-1, 960), (0, 1, -1), (3, 2, 1, 0, -1)):
        if sname == "24h" and eod == 960:
            continue  # flat-at-4pm only makes sense for day sessions
        combos = []
        combos += [dict(stop_mode=0, tp_pts=tp) for tp in (0, 20, 40, 80)]
        combos += [dict(stop_mode=1, stop_pts=sp, tp_pts=tp) for sp in (20, 40, 80) for tp in (0, 20, 40, 80)]
        combos += [dict(stop_mode=1, stop_pts=sp, tp_r=r) for sp in (20, 40, 80) for r in (1, 2, 3)]
        combos += [dict(stop_mode=sm, tp_r=r) for sm in (2, 3) for r in (0, 1, 2, 3)]
        for cb in combos:
            if exit_k == -1 and cb["stop_mode"] == 0:
                continue  # no stop and no Supertrend exit: losers are held forever, so the result is fake
            yield dict(fresh=fresh, session=sess, sname=sname, eod=eod, side=side, exit_k=exit_k, **cb)


def label(c):
    s = []
    s.append({3: "exit when any ST disagrees", 2: "exit when <2 STs agree", 1: "exit when all 3 flip",
              0: "exit on slow ST (12,3) flip", -1: "no ST exit"}[c["exit_k"]])
    sm = c["stop_mode"]
    if sm == 1: s.append(f"stop {c.get('stop_pts')}pt")
    if sm == 2: s.append("stop at slow ST line")
    if sm == 3: s.append("trailing slow ST line stop")
    if c.get("tp_r"): s.append(f"target {c['tp_r']}R")
    if c.get("tp_pts"): s.append(f"target {c['tp_pts']}pt")
    s.append(c["sname"]); s.append({0: "long+short", 1: "longs only", -1: "shorts only"}[c["side"]])
    if c["fresh"]: s.append("first signal per trend")
    if c["eod"] >= 0: s.append("flat 4pm")
    return " | ".join(s)


def kw(c):
    return {k: v for k, v in c.items() if k != "sname"}


def search(P):
    N = len(P["o"]); b1, b2 = int(N * 0.5), int(N * 0.75)
    ym = (P["idx"].year * 12 + P["idx"].month).values; mid = ym - ym.min(); nm = int(mid.max()) + 1
    sel_months = sorted(set(mid[:b2].tolist()))
    rows = []
    for c in grid():
        r = E.run(P, **kw(c))
        s = [E.stats(r, 0, b1), E.stats(r, b1, b2), E.stats(r, b2, N)]
        mon = np.zeros(nm)
        if len(r):
            np.add.at(mon, mid[r[:, 0].astype(int)], r[:, 5])
        full = [m for m in sel_months if m != mid[b2 - 1] or True]
        s.append(dict(sel=E.stats(r, 0, b2), months=mon[full], frac_pos=float((mon[full] > 0).mean())))
        rows.append((c, s))
    return rows, (b1, b2)


def report(P, rows, bounds, top=12, min_n=60):
    b1, b2 = bounds
    ok = [(c, s) for c, s in rows if s[0]["n"] >= min_n and s[1]["n"] >= min_n // 2]
    allpos = [(c, s) for c, s in ok if s[0]["net"] > 0 and s[1]["net"] > 0]
    print(f"configs tested: {len(rows)} | enough trades: {len(ok)} | profitable in train AND validation: {len(allpos)} "
          f"| ...and also in test: {sum(1 for c, s in allpos if s[2]['net'] > 0)}")
    allpos.sort(key=lambda cs: min(cs[1][0]["pf"], cs[1][1]["pf"]), reverse=True)
    print(f"\nTop {top} picked on train+validation only, then shown on untouched test:")
    print(f"{'#':>2} {'train PF':>8} {'val PF':>7} {'TEST PF':>8} {'TEST net$':>10} {'TEST n':>6} {'test win%':>9}  rule")
    for k, (c, s) in enumerate(allpos[:top], 1):
        print(f"{k:>2} {s[0]['pf']:>8.2f} {s[1]['pf']:>7.2f} {s[2]['pf']:>8.2f} {s[2]['net']:>10,.0f} {s[2]['n']:>6} {s[2]['win']:>9.0%}  {label(c)}")
    return allpos


if __name__ == "__main__":
    import pandas as pd, nq_supertrend_backtest as b
    df = b.load_csv(sys.argv[1]) if sys.argv[1].endswith(".csv") else None
    P = E.prepare(df)
    rows, bounds = search(P)
    report(P, rows, bounds)
