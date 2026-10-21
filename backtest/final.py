"""Pick the best rule variant using train+validation only, report the untouched test split, build the replay page."""
import sys
import numpy as np
import engine as E, search as S, run_dukascopy as R, build_replay as BR

OUT = "replay.html"


def pick(rows):
    """Rank on the selection window only (first 75%): needs enough trades, profit, most months positive; score = PF * share of profitable months."""
    cand = []
    for c, s in rows:
        sel, fp = s[3]["sel"], s[3]["frac_pos"]
        if sel["n"] >= 100 and sel["net"] > 0 and fp >= 0.6:
            cand.append((c, s, min(sel["pf"], 3.0) * fp))
    cand.sort(key=lambda x: x[2], reverse=True)
    return [(c, s) for c, s, _ in cand]


def line(tag, s):
    return f"{tag:<11} trades {s['n']:>4} | win {s['win']:>4.0%} | net {s['net']:>9,.0f} | PF {s['pf']:>5.2f} | maxDD {s['mdd']:>9,.0f}"


if __name__ == "__main__":
    df = R.assemble(sys.argv[1] if len(sys.argv) > 1 else "duka", sys.argv[2] if len(sys.argv) > 2 else None)
    P = E.prepare(df); N = len(P["o"])
    rows, (b1, b2) = S.search(P)
    cand = pick(rows)
    print(f"{len(P['o']):,} bars, {P['idx'][0].date()} to {P['idx'][-1].date()} | split at {P['idx'][b1].date()} and {P['idx'][b2].date()}")
    print(f"configs: {len(rows)} | pass train+val filter: {len(cand)} | of those also profitable in test: {sum(1 for c, s in cand if s[2]['net'] > 0)}")
    base_c = dict(fresh=False, session=(0, 1440), sname="24h", eod=-1, side=0, exit_k=3, stop_mode=0)
    base = E.run(P, **S.kw(base_c))
    print("\nORIGINAL RULES"); [print("  " + line(t, E.stats(base, lo, hi))) for t, lo, hi in (("train", 0, b1), ("validation", b1, b2), ("TEST", b2, N))]
    print("\nTOP 8 (chosen without looking at test):")
    for k, (c, s) in enumerate(cand[:8], 1):
        print(f"{k}. {S.label(c)}")
        for t, x in zip(("train", "validation", "TEST"), s): print("     " + line(t, x))
    best_c, best_s = cand[0]
    best = E.run(P, **S.kw(best_c))
    onetwo = E.run(P, exit_k=-1, stop_mode=1, stop_pts=10, tp_pts=20)
    strategies = [
        dict(name="Original rules", desc="Enter when 3 Supertrends agree and price is past the 50 EMA. Exit when they stop agreeing.", trades=base),
        dict(name="Best version found", desc=S.label(best_c), trades=best),
        dict(name="1:2 risk-reward", desc="10 point stop, 20 point target, same entries", trades=onetwo),
    ]
    sub = (f"Every trade on 5-minute US Tech 100 (NQ-style) from {P['idx'][0].date()} to {P['idx'][-1].date()}, with slippage and commissions. "
           "Pick a strategy, filter the trades, and step through each one.")
    note = ("Data: Dukascopy US Tech 100 CFD 5-minute bars (tracks NQ closely but is not the futures contract, so prices sit a little off). "
            "Costs: 1 tick entry slippage, 2 ticks on stops, $2.50 per side, targets fill only when price trades 1 tick through, stops win ties inside a bar. "
            "The rules were chosen on the first 75% of the data; the shaded last 25% is the only honest out-of-sample check.")
    mb = BR.build(P, strategies, OUT, 50000, b2, sub, note, default=1)
    print(f"\nbuilt {OUT} ({mb:.1f} MB)")
