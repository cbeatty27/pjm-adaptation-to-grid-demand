"""Cross-check of PJM solar between two EIA sources, written to public/data/solar_check.json.

EIA-930 (hourly, reported by PJM) is what the site uses for solar output. EIA-923 (monthly, reported by each plant)
gives solar generation by state. For each month, the EIA-923 figure for each state is scaled by the share of that
state's solar capacity that EIA lists under PJM, and the states are added up. This assumes PJM's solar in a state
runs like the state's solar as a whole.

The result is the share of PJM solar output that the hourly data captures, month by month, and PJM's solar capacity
factor computed from the plant reports. The build reads only files already in public/data.

  python -m pipeline.build_checks
"""
from __future__ import annotations

import calendar
import datetime as dt
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
D = ROOT / "public/data"


def _units(name: str) -> list[dict]:
    o = json.loads((D / name).read_text())
    return [dict(zip(o["columns"], r)) for r in o["units"]]


def main() -> int:
    need = ["solar923.json", "plants.json", "plants_us.json"]
    if not all((D / n).exists() for n in need):
        print("solar check skipped: missing", [n for n in need if not (D / n).exists()])
        return 0
    s923 = json.loads((D / "solar923.json").read_text())
    gen = defaultdict(float)  # (month, state) -> MWh
    for period, state, fuel, g in s923["rows"]:
        if fuel == "SUN" and g is not None:
            gen[(period, state)] += g * 1000  # thousand MWh -> MWh
    solar = lambda us: [u for u in us if u["group"] == "solar" and u["state_cls"] == "operating" and u["online"]]  # noqa: E731
    us_s, pjm_s = solar(_units("plants_us.json")), solar(_units("plants.json"))
    mw = lambda u: u.get("msum") or u.get("mw") or 0  # noqa: E731

    def cap(units: list[dict], state: str | None, month: str) -> float:
        return sum(mw(u) for u in units if (state is None or u["state"] == state) and u["online"] <= month)

    # EIA-930 PJM solar, monthly average MW (months in Eastern Standard Time, as elsewhere on the site)
    h930 = defaultdict(lambda: [0.0, 0])
    for f in sorted(D.glob("hourly_pjm_*.json")):
        h = json.loads(f.read_text())
        a = (h.get("gen_mw") or {}).get("solar")
        if not a:
            continue
        t0 = dt.datetime.fromisoformat(h["start_utc"] + ":00")
        for i, v in enumerate(a):
            if v is not None:
                k = (t0 + dt.timedelta(hours=i - 5)).strftime("%Y-%m")
                h930[k][0] += v
                h930[k][1] += 1

    states = sorted({u["state"] for u in pjm_s})
    months = sorted({p for p, _ in gen})
    rows = []
    for m in months:
        if m not in h930 or h930[m][1] < 24 * 25:
            continue
        hrs = calendar.monthrange(int(m[:4]), int(m[5:]))[1] * 24
        est = 0.0
        for st in states:
            cs = cap(us_s, st, m)
            if cs and (m, st) in gen:
                est += gen[(m, st)] * cap(pjm_s, st, m) / cs
        est_mw = est / hrs
        got = h930[m][0] / h930[m][1]
        rows.append([m, round(est_mw), round(got), round(got / est_mw, 3) if est_mw else None, round(cap(pjm_s, None, m))])
    if len(rows) < 12:
        print("solar check skipped: fewer than 12 overlapping months")
        return 0
    last = rows[-12:]
    cf923 = sum(r[1] for r in last) / sum(r[4] for r in last)
    cf930 = sum(r[2] for r in last) / sum(r[4] for r in last)
    out = {
        "method": __doc__.strip().split("\n\n")[1].replace("\n", " "),
        "columns": ["month", "eia923_est_avg_mw", "eia930_avg_mw", "share_captured", "pjm_solar_capacity_mw"],
        "rows": rows,
        "latest12": {"from": last[0][0], "to": last[-1][0], "cf_eia923": round(cf923, 4), "cf_eia930": round(cf930, 4),
                     "share_captured": round(sum(r[2] for r in last) / sum(r[1] for r in last), 3)},
        "first12": {"from": rows[0][0], "to": rows[11][0], "share_captured": round(sum(r[2] for r in rows[:12]) / sum(r[1] for r in rows[:12]), 3)},
    }
    (D / "solar_check.json").write_text(json.dumps(out, separators=(",", ":")))
    print(f"solar check: hourly data captures {out['first12']['share_captured']:.0%} of plant-reported solar in "
          f"{out['first12']['from']}..{out['first12']['to']} and {out['latest12']['share_captured']:.0%} in "
          f"{out['latest12']['from']}..{out['latest12']['to']}; capacity factor {cf923:.1%} (plant reports) vs {cf930:.1%} (hourly)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
