"""Wholesale power and gas prices for PJM, from EIA. Never stops the run: whatever arrives is written to
public/data/wholesale_pjm.json, and anything that failed is recorded in its "errors" list.

  Power: EIA's Wholesale Electricity and Natural Gas Market Data, which EIA republishes with permission from the
         Intercontinental Exchange (ICE): daily on-peak price at the PJM West hub ("PJM WH Real Time Peak"),
         weighted average, high and low, $/MWh. https://www.eia.gov/electricity/wholesale
  Gas:   EIA's Henry Hub natural gas spot price, monthly, $/MMBtu (series RNGWHHD).

  python -m pipeline.fetch_wholesale
"""
from __future__ import annotations

import datetime as dt
import io
import json
import sys
from pathlib import Path

import pandas as pd
import requests

from . import eia

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/data"
FIRST_YEAR = 2017
BASE = "https://www.eia.gov/electricity/wholesale/xls"
UA = {"User-Agent": "Mozilla/5.0 (pjm-adaptation-to-grid-demand data pipeline)"}


def _urls(year: int, this_year: int) -> list[str]:
    if year == this_year:
        return [f"{BASE}/ice_electric-{year}.xlsx", f"{BASE}/archive/ice_electric-{year}final.xlsx"]
    return [f"{BASE}/archive/ice_electric-{year}final.xlsx", f"{BASE}/ice_electric-{year}.xlsx"]


def _col(df: pd.DataFrame, *words: str) -> str | None:
    for c in df.columns:
        name = str(c).lower()
        if all(w in name for w in words):
            return c
    return None


def power(errors: list[str]) -> tuple[list[list], list[str]]:
    this_year = dt.date.today().year
    rows: list[list] = []
    used: list[str] = []
    for year in range(FIRST_YEAR, this_year + 1):
        got = False
        for url in _urls(year, this_year):
            try:
                r = requests.get(url, headers=UA, timeout=120)
                if r.status_code != 200 or len(r.content) < 1000:
                    continue
                df = pd.read_excel(io.BytesIO(r.content))
                hub = _col(df, "hub")
                day = _col(df, "trade", "date") or _col(df, "date")
                wavg = _col(df, "wtd", "avg") or _col(df, "weighted") or _col(df, "avg")
                hi, lo = _col(df, "high"), _col(df, "low")
                vol = _col(df, "volume")
                if not hub or not day or not wavg:
                    errors.append(f"{year}: unexpected columns {list(df.columns)[:12]}")
                    continue
                sub = df[df[hub].astype(str).str.contains("PJM WH", case=False, na=False)]
                for _, x in sub.iterrows():
                    d = pd.to_datetime(x[day], errors="coerce")
                    if pd.isna(d) or pd.isna(x[wavg]):
                        continue
                    rows.append([d.strftime("%Y-%m-%d"), float(x[wavg]),
                                 float(x[hi]) if hi and pd.notna(x[hi]) else None,
                                 float(x[lo]) if lo and pd.notna(x[lo]) else None,
                                 float(x[vol]) if vol and pd.notna(x[vol]) else None])
                used.append(url)
                got = True
                print(f"power {year}: {len(sub)} PJM West rows from {url}")
                break
            except Exception as e:  # noqa: BLE001
                errors.append(f"{year} {url}: {str(e)[:200]}")
        if not got:
            errors.append(f"{year}: no file found")
    rows.sort(key=lambda x: x[0])
    # one row per trade date (keep the last one listed)
    dedup = {r[0]: r for r in rows}
    return [dedup[k] for k in sorted(dedup)], used


def gas(errors: list[str]) -> list[list]:
    for route, facet in (("natural-gas/pri/fut", "series"), ("natural-gas/pri/sum", "series")):
        try:
            rows = eia.fetch_all(route, {"frequency": "monthly", "data[]": ["value"], f"facets[{facet}][]": "RNGWHHD",
                                         "start": f"{FIRST_YEAR}-01", "sort[0][column]": "period", "sort[0][direction]": "asc"})
            out = [[str(r.get("period"))[:7], float(r["value"])] for r in rows if r.get("value") not in (None, "")]
            if out:
                return out
        except Exception as e:  # noqa: BLE001
            errors.append(f"gas {route}: {str(e)[:200]}")
    return []


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []
    daily, used = power(errors)
    monthly: dict[str, list[float]] = {}
    for d, w, *_ in daily:
        monthly.setdefault(d[:7], []).append(w)
    payload = {
        "retrieved_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "power": {"hub": "PJM West", "product": "PJM WH Real Time Peak", "units": "$/MWh",
                  "source": "EIA, Wholesale Electricity and Natural Gas Market Data (Intercontinental Exchange data, republished with permission)",
                  "url": "https://www.eia.gov/electricity/wholesale", "files": used,
                  "daily_columns": ["date", "wtd_avg", "high", "low", "volume_mwh"], "daily": daily,
                  "monthly": [[m, sum(v) / len(v), len(v)] for m, v in sorted(monthly.items())]},
        "gas": {"hub": "Henry Hub", "units": "$/MMBtu", "series": "RNGWHHD", "source": "EIA, Henry Hub natural gas spot price",
                "url": "https://www.eia.gov/dnav/ng/hist/rngwhhdm.htm", "monthly": gas(errors)},
        "errors": errors,
    }
    (OUT / "wholesale_pjm.json").write_text(json.dumps(payload, separators=(",", ":")))
    print(f"wholesale: {len(daily)} daily power rows, {len(payload['gas']['monthly'])} gas months, {len(errors)} notes")
    for e in errors[:20]:
        print("  note:", e, file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
