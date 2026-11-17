"""Planned generators from the 'Planned' tab of EIA's monthly generator file (Form EIA-860M).

EIA refuses scripted downloads of the workbook from some networks, so the tab is read from a workbook downloaded by
hand and kept in the repository (pipeline/static), the same way as the Retired tab.

  python -m pipeline.build_planned --from-workbook path/to/<month>_generator<year>.xlsx   # refresh the stored copy
  python -m pipeline.build_planned                                                        # write public/data/planned.json

A unit is PJM when EIA lists PJM as its balancing authority. Nothing is inferred about who a plant will serve.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import pandas as pd

from . import groups as G

ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "pipeline/static"
OUT = ROOT / "public/data"
COLS = {
    "Entity Name": "entity", "Plant ID": "plant", "Plant Name": "name", "Plant State": "state", "County": "county",
    "Balancing Authority Code": "ba", "Sector": "sector", "Generator ID": "gen", "Nameplate Capacity (MW)": "mw",
    "Net Summer Capacity (MW)": "msum", "Technology": "tech", "Energy Source Code": "src",
    "Planned Operation Month": "om", "Planned Operation Year": "oy", "Status": "status",
    "Latitude": "lat", "Longitude": "lon",
}


def from_workbook(path: Path) -> None:
    raw = pd.read_excel(path, sheet_name="Planned", header=2, dtype=str)
    missing = [c for c in COLS if c not in raw.columns]
    if missing:
        raise SystemExit(f"Planned tab columns not recognised, missing {missing}")
    df = raw[list(COLS)].rename(columns=COLS)
    df = df[pd.to_numeric(df["plant"], errors="coerce").notna()]
    STATIC.mkdir(parents=True, exist_ok=True)
    df.to_csv(STATIC / "planned_raw.csv.gz", index=False, compression="gzip")
    prov = {
        "source": f"EIA-860M workbook {path.name}", "sheet": "Planned", "header_row": 2, "rows": int(len(df)),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "page": "https://www.eia.gov/electricity/data/eia860m/",
    }
    (STATIC / "planned_prov.json").write_text(json.dumps(prov, indent=1))
    print(f"stored {len(df)} planned generators from {path.name}")
    # announced retirements: operating units with a planned retirement date (Operating tab)
    op = pd.read_excel(path, sheet_name="Operating", header=2, dtype=str)
    keep = {**{k: v for k, v in COLS.items() if k not in ("Planned Operation Month", "Planned Operation Year", "Status")},
            "Planned Retirement Month": "rm", "Planned Retirement Year": "ry"}
    missing = [c for c in keep if c not in op.columns]
    if missing:
        raise SystemExit(f"Operating tab columns not recognised, missing {missing}")
    op = op[list(keep)].rename(columns=keep)
    op = op[pd.to_numeric(op["ry"], errors="coerce").notna()]
    op.to_csv(STATIC / "retiring_raw.csv.gz", index=False, compression="gzip")
    print(f"stored {len(op)} operating generators with a planned retirement date")


def build() -> None:
    f = STATIC / "planned_raw.csv.gz"
    if not f.exists():
        print("no stored Planned tab; skipping planned.json")
        return
    df = pd.read_csv(f, dtype=str).fillna("")
    num = lambda s: pd.to_numeric(df[s], errors="coerce")  # noqa: E731
    ym = num("oy").astype("Int64").astype(str) + "-" + num("om").astype("Int64").astype(str).str.zfill(2)
    ym = ym.where(ym.str.fullmatch(r"\d{4}-\d{2}"), "")
    code = df["status"].str.extract(r"^\((\w+)\)")[0].fillna("")
    out = pd.DataFrame({
        "plant": num("plant").astype("Int64").astype(str), "gen": df["gen"].str.strip(), "name": df["name"],
        "entity": df["entity"], "state": df["state"], "county": df["county"], "ba": df["ba"].str.strip(),
        "src": df["src"].str.strip(), "group": df["src"].str.strip().map(lambda c: G.GEN_SOURCE.get(c, "other")),
        "tech": df["tech"], "mw": num("mw").round(1), "msum": num("msum").round(1), "online": ym,
        "status": code, "lat": num("lat").round(5), "lon": num("lon").round(5),
    })
    out["pjm"] = out["ba"].eq("PJM")
    out = out.astype(object).where(out.notna(), None)
    prov = json.loads((STATIC / "planned_prov.json").read_text())
    names = dict(df.assign(code=code).drop_duplicates("code")[["code", "status"]].values.tolist())
    payload = {
        "meta": {**prov, "capacity_basis": "nameplate capacity (mw) and net summer capacity (msum)",
                 "pjm_rule": "balancing authority code PJM on the Planned tab",
                 "status_names": {k: v for k, v in names.items() if k},
                 "pjm_rows": int(out["pjm"].sum())},
        "columns": list(out.columns), "rows": out.values.tolist(),
    }
    rf = STATIC / "retiring_raw.csv.gz"
    if rf.exists():
        r = pd.read_csv(rf, dtype=str).fillna("")
        rn = lambda s: pd.to_numeric(r[s], errors="coerce")  # noqa: E731
        rym = rn("ry").astype("Int64").astype(str) + "-" + rn("rm").astype("Int64").astype(str).str.zfill(2)
        ret = pd.DataFrame({
            "plant": rn("plant").astype("Int64").astype(str), "gen": r["gen"].str.strip(), "name": r["name"], "state": r["state"],
            "ba": r["ba"].str.strip(), "src": r["src"].str.strip(), "group": r["src"].str.strip().map(lambda c: G.GEN_SOURCE.get(c, "other")),
            "mw": rn("mw").round(1), "msum": rn("msum").round(1), "retire": rym.where(rym.str.fullmatch(r"\d{4}-\d{2}"), ""),
        })
        ret["pjm"] = ret["ba"].eq("PJM")
        ret = ret.astype(object).where(ret.notna(), None)
        payload["retiring"] = {"columns": list(ret.columns), "rows": ret.values.tolist(),
                               "rule": "operating generators with a planned retirement year on the Operating tab"}
        print(f"retiring: {len(ret)} units, {int(ret['pjm'].sum())} in PJM")
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "planned.json").write_text(json.dumps(payload, separators=(",", ":")))
    print(f"planned.json: {len(out)} units, {int(out['pjm'].sum())} in PJM")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-workbook", type=Path)
    a = ap.parse_args()
    if a.from_workbook:
        from_workbook(a.from_workbook)
    build()
