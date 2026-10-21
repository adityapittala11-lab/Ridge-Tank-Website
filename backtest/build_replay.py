"""Pack bars + trades into one compressed blob and inject it into the replay page template."""
import base64, gzip, json
import numpy as np
import pandas as pd

TEMPLATE = "/tmp/claude-0/-home-user-Ridge-Tank-Website/fda4aebb-a5a4-54be-b54a-3c2183fdd5ee/scratchpad/replay_template.html"


def delta(a):
    a = np.asarray(a, dtype=np.int64)
    return np.diff(a, prepend=0).astype(np.int32)


def build(P, strategies, out_path, capital, test_start, sub, note, default=0, template=TEMPLATE):
    """strategies: list of dict(name, desc, trades=<engine.run array>)."""
    sec = {}
    sec["t"] = delta(np.asarray((P["idx"] - pd.Timestamp("1970-01-01", tz="UTC")) // pd.Timedelta(minutes=1)))
    for k in ("o", "h", "l", "c"):
        sec[k] = delta(np.round(P[k] * 100))
    sec["e"] = delta(np.round(P["ema"] * 100))
    for k in range(3):
        sec[f"ln{k}"] = delta(np.round(np.nan_to_num(P["lines"][k]) * 100))
    sec["dirs"] = sum((P["d"][k] + 1) * 3 ** k for k in range(3)).astype(np.int32)
    meta_s = []
    for k, s in enumerate(strategies):
        r = s["trades"]
        sec[f"s{k}_ei"] = r[:, 0].astype(np.int32); sec[f"s{k}_xi"] = r[:, 1].astype(np.int32)
        sec[f"s{k}_side"] = r[:, 2].astype(np.int32)
        sec[f"s{k}_en"] = np.round(r[:, 3] * 100).astype(np.int32); sec[f"s{k}_ex"] = np.round(r[:, 4] * 100).astype(np.int32)
        sec[f"s{k}_pnl"] = np.round(r[:, 5]).astype(np.int32)
        sec[f"s{k}_sl"] = np.round(r[:, 6] * 100).astype(np.int32); sec[f"s{k}_tp"] = np.round(r[:, 7] * 100).astype(np.int32)
        sec[f"s{k}_why"] = r[:, 8].astype(np.int32)
        meta_s.append(dict(name=s["name"], desc=s["desc"]))
    names = list(sec)
    blob = np.concatenate([sec[n] for n in names]).astype("<i4").tobytes()
    b64 = base64.b64encode(gzip.compress(blob, 9)).decode()
    meta = dict(n=int(len(P["o"])), capital=capital, testStart=int(test_start), strats=meta_s, sub=sub, note=note,
                defaultStrat=default, sections=[[n, int(len(sec[n]))] for n in names])
    html = open(template).read().replace("/*META*/null", json.dumps(meta)).replace("/*BLOB*/", b64)
    open(out_path, "w").write(html)
    return len(html) / 1e6
