"""Three extra EIA pulls that support checks on the story page. Each is independent and never stops the run:
whatever arrives is written to public/data, and what failed is recorded in public/data/extras_status.json.

  weather.json   Population-weighted heating and cooling degree days by census division (EIA Short-Term Energy
                 Outlook series, built by EIA from NOAA state data), monthly.
  prices.json    Average retail electricity price, sales and revenue by state and sector (EIA retail sales route).
  solar923.json  EIA-923 monthly net generation from solar, by state, all sectors. Used to compare each state's solar
                 output with its installed solar capacity, as a check on the EIA-930 solar figure for PJM.

  python -m pipeline.fetch_extras
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
from pathlib import Path

from . import eia

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/data"
START = "2015-01"
# States where EIA lists PJM generators (whole states; PJM covers only part of some).
STATES = ["DC", "DE", "IL", "IN", "KY", "MD", "MI", "NC", "NJ", "OH", "PA", "TN", "VA", "WV"]


def _num(v):
    try:
        return None if v is None or v == "" else float(v)
    except (TypeError, ValueError):
        return None


def weather() -> dict:
    route = "steo"
    listed = eia.facet_values(route, "seriesId")
    ids = {f.get("id"): f.get("name") for f in listed if re.match(r"^ZW[HC]D", str(f.get("id", "")))}
    if not ids:
        raise eia.EIAError(f"no degree-day series found on {route}; {len(listed)} series listed")
    rows = eia.fetch_all(route, {"frequency": "monthly", "data[]": ["value"], "start": START,
                                 "facets[seriesId][]": sorted(ids), "sort[0][column]": "period", "sort[0][direction]": "asc"})
    series: dict[str, dict[str, float]] = {}
    for r in rows:
        v = _num(r.get("value"))
        if v is not None:
            series.setdefault(r.get("seriesId"), {})[str(r.get("period"))[:7]] = v
    return {"route": route, "series_names": ids, "unit": "degree days per month", "series": series, "rows": len(rows)}


def prices() -> dict:
    route = "electricity/retail-sales"
    rows = eia.fetch_all(route, {"frequency": "monthly", "data[]": ["price", "sales", "revenue"], "start": START,
                                 "facets[stateid][]": STATES + ["US"], "facets[sectorid][]": ["RES", "COM", "IND", "ALL"],
                                 "sort[0][column]": "period", "sort[0][direction]": "asc"})
    out = [[str(r.get("period"))[:7], r.get("stateid"), r.get("sectorid"), _num(r.get("price")), _num(r.get("sales")), _num(r.get("revenue"))] for r in rows]
    units = {k: rows[0].get(f"{k}-units") for k in ("price", "sales", "revenue")} if rows else {}
    return {"route": route, "columns": ["period", "state", "sector", "price", "sales", "revenue"], "units": units, "rows": out}


def solar923() -> dict:
    route = "electricity/electric-power-operational-data"
    have = {f.get("id") for f in eia.facet_values(route, "fueltypeid")}
    fuels = [f for f in ("SUN", "SPV", "ALL") if f in have]
    if "SUN" not in fuels and "SPV" not in fuels:
        raise eia.EIAError(f"no solar fuel id on {route}")
    rows = eia.fetch_all(route, {"frequency": "monthly", "data[]": ["generation"], "start": "2021-01",
                                 "facets[location][]": STATES + ["US"], "facets[sectorid][]": "99", "facets[fueltypeid][]": fuels,
                                 "sort[0][column]": "period", "sort[0][direction]": "asc"})
    out = [[str(r.get("period"))[:7], r.get("location"), r.get("fueltypeid"), _num(r.get("generation"))] for r in rows]
    return {"route": route, "columns": ["period", "state", "fuel", "generation"], "units": rows[0].get("generation-units") if rows else None, "rows": out}


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    status = {"retrieved_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")}
    for name, fn in (("weather", weather), ("prices", prices), ("solar923", solar923)):
        try:
            d = fn()
            (OUT / f"{name}.json").write_text(json.dumps(d, separators=(",", ":")))
            status[name] = {"ok": True, "rows": len(d.get("rows", [])) if isinstance(d.get("rows"), list) else d.get("rows")}
            print(f"{name}: ok")
        except Exception as e:  # noqa: BLE001
            status[name] = {"ok": False, "error": str(e)[:400]}
            print(f"WARNING: {name} pull skipped: {e}", file=sys.stderr)
    (OUT / "extras_status.json").write_text(json.dumps(status, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
