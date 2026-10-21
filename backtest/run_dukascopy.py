"""Assemble cached Dukascopy US Tech 100 5-min bars, search rule variants, print the honest split results."""
import glob, os, sys
import numpy as np, pandas as pd
import engine as E, search as S

DIR = sys.argv[1] if len(sys.argv) > 1 else "duka"


def assemble(d=DIR, start=None):
    parts = []
    for f in sorted(glob.glob(os.path.join(d, "*.csv"))):
        if os.path.getsize(f) == 0:
            continue
        parts.append(pd.read_csv(f, header=None, names=["ts", "open", "high", "low", "close"]))
    df = pd.concat(parts).drop_duplicates("ts").sort_values("ts")
    # a bar can be split across hour files only at boundaries (5-min bars never straddle hours), so no merge needed
    df.index = pd.to_datetime(df.ts, unit="s", utc=True)
    df = df[["open", "high", "low", "close"]]
    return df[df.index >= pd.Timestamp(start, tz="UTC")] if start else df


if __name__ == "__main__":
    df = assemble()
    print("bars:", len(df), df.index[0], "->", df.index[-1], "| days:", df.index.normalize().nunique())
    P = E.prepare(df)
    rows, bounds = S.search(P)
    b1, b2 = bounds
    N = len(P["o"])
    print("splits (bars):", b1, b2 - b1, N - b2, "|", P["idx"][0].date(), P["idx"][b1].date(), P["idx"][b2].date(), P["idx"][-1].date())
    base = E.run(P, exit_k=3)
    print("ORIGINAL rules  train/val/test:", [(s["n"], round(s["net"]), round(s["pf"], 2)) for s in (E.stats(base, 0, b1), E.stats(base, b1, b2), E.stats(base, b2, N))])
    S.report(P, rows, bounds)
