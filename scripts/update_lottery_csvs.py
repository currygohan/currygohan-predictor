#!/usr/bin/env python3
"""
Merge New York State open-data lottery JSON into normalized CSVs under data/.

Also ingests official repo-root CSV exports (megamillions.csv, powerball.csv) when present.
Prunes rows before game rule cutoffs. Dedupes by (draw_date, sorted whites, bonus).
"""

from __future__ import annotations

import csv
import json
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

DATA_MEGA = REPO_ROOT / "data" / "mega_millions.csv"
DATA_PB = REPO_ROOT / "data" / "powerball.csv"
OFFICIAL_MEGA = REPO_ROOT / "megamillions.csv"
OFFICIAL_PB = REPO_ROOT / "powerball.csv"

CUTOFF_PB = date(2015, 10, 4)
CUTOFF_MM = date(2025, 4, 8)

NY_MM_JSON = (
    "https://data.ny.gov/resource/5xaw-6ayf.json"
    "?$order=draw_date%20DESC&$limit=120"
)
NY_PB_JSON = (
    "https://data.ny.gov/resource/d6yy-54nr.json"
    "?$order=draw_date%20DESC&$limit=120"
)

FIELDNAMES = ("draw_date", "n1", "n2", "n3", "n4", "n5", "bonus", "multiplier", "source")


@dataclass(frozen=True)
class Draw:
    draw_date: date
    whites: tuple[int, int, int, int, int]
    bonus: int
    multiplier: str
    source: str

    def key(self) -> tuple:
        return (self.draw_date.isoformat(), self.whites, self.bonus)

    def as_dict(self) -> dict[str, str]:
        return {
            "draw_date": self.draw_date.isoformat(),
            "n1": str(self.whites[0]),
            "n2": str(self.whites[1]),
            "n3": str(self.whites[2]),
            "n4": str(self.whites[3]),
            "n5": str(self.whites[4]),
            "bonus": str(self.bonus),
            "multiplier": self.multiplier,
            "source": self.source,
        }


def fetch_json(url: str) -> list[dict]:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "currygohan-predictor/1.0 (+https://github.com/currygohan/currygohan-predictor)"},
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        raw = resp.read().decode("utf-8")
    data = json.loads(raw)
    if not isinstance(data, list):
        raise ValueError("expected JSON array from NY API")
    return data


def parse_iso_date(s: str) -> date:
    return datetime.strptime(s[:10], "%Y-%m-%d").date()


def ny_mega_to_draw(obj: dict) -> Draw:
    d = parse_iso_date(obj["draw_date"])
    whites = tuple(sorted(int(x) for x in str(obj["winning_numbers"]).split()))
    if len(whites) != 5:
        raise ValueError(f"mega winning_numbers: expected 5 ints, got {whites!r}")
    bonus = int(str(obj["mega_ball"]).strip())
    mult = str(obj.get("multiplier") or "").strip()
    return Draw(d, whites, bonus, mult, "ny_open_data")


def ny_powerball_to_draw(obj: dict) -> Draw:
    d = parse_iso_date(obj["draw_date"])
    parts = [int(x) for x in str(obj["winning_numbers"]).split()]
    if len(parts) != 6:
        raise ValueError(f"powerball winning_numbers: expected 6 ints, got {parts!r}")
    whites = tuple(sorted(parts[:5]))
    bonus = parts[5]
    mult = str(obj.get("multiplier") or "").strip()
    return Draw(d, whites, bonus, mult, "ny_open_data")


def parse_official_mega_row(cells: list[str]) -> Draw | None:
    if len(cells) < 10:
        return None
    game = cells[0].replace("\ufeff", "").strip()
    if game != "Mega Millions":
        return None
    m, d, y = int(cells[1]), int(cells[2]), int(cells[3])
    whites = tuple(sorted(int(cells[i]) for i in range(4, 9)))
    bonus = int(cells[9])
    mult = cells[10].strip() if len(cells) > 10 else ""
    return Draw(date(y, m, d), whites, bonus, mult, "official_csv")


def parse_official_pb_row(cells: list[str]) -> Draw | None:
    if len(cells) < 10:
        return None
    game = cells[0].replace("\ufeff", "").strip()
    if game != "Powerball":
        return None
    m, d, y = int(cells[1]), int(cells[2]), int(cells[3])
    whites = tuple(sorted(int(cells[i]) for i in range(4, 9)))
    bonus = int(cells[9])
    mult = cells[10].strip() if len(cells) > 10 else ""
    return Draw(date(y, m, d), whites, bonus, mult, "official_csv")


def iter_official(path: Path, parser):
    if not path.exists():
        return
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        for row in reader:
            if not row:
                continue
            d = parser(row)
            if d:
                yield d


def load_normalized_csv(path: Path) -> list[Draw]:
    if not path.exists():
        return []
    out: list[Draw] = []
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            try:
                dd = date.fromisoformat(str(r.get("draw_date", "")).strip())
                w = tuple(
                    int(str(r.get(f"n{i}", "")).strip())
                    for i in range(1, 6)
                )
                w = tuple(sorted(w))
                b = int(str(r.get("bonus", "")).strip())
                mult = str(r.get("multiplier") or "").strip()
                src = str(r.get("source") or "").strip() or "normalized_csv"
                out.append(Draw(dd, w, b, mult, src))
            except (ValueError, TypeError):
                continue
    return out


def merge_draws(*batches: list[Draw]) -> list[Draw]:
    by_key: dict[tuple, Draw] = {}
    for batch in batches:
        for d in batch:
            by_key[d.key()] = d
    return sorted(by_key.values(), key=lambda x: x.draw_date)


def prune(draws: list[Draw], cutoff: date) -> list[Draw]:
    return [d for d in draws if d.draw_date >= cutoff]


def write_csv(path: Path, draws: list[Draw]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDNAMES)
        w.writeheader()
        for d in draws:
            w.writerow(d.as_dict())


def run() -> int:
    errors: list[str] = []

    remote_mm: list[Draw] = []
    remote_pb: list[Draw] = []
    try:
        remote_mm = [ny_mega_to_draw(o) for o in fetch_json(NY_MM_JSON)]
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, json.JSONDecodeError) as e:
        errors.append(f"Mega NY fetch failed: {e}")
    try:
        remote_pb = [ny_powerball_to_draw(o) for o in fetch_json(NY_PB_JSON)]
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, json.JSONDecodeError) as e:
        errors.append(f"Powerball NY fetch failed: {e}")

    official_mm = list(iter_official(OFFICIAL_MEGA, parse_official_mega_row))
    official_pb = list(iter_official(OFFICIAL_PB, parse_official_pb_row))

    existing_mm = load_normalized_csv(DATA_MEGA)
    existing_pb = load_normalized_csv(DATA_PB)

    mm = prune(merge_draws(existing_mm, official_mm, remote_mm), CUTOFF_MM)
    pb = prune(merge_draws(existing_pb, official_pb, remote_pb), CUTOFF_PB)

    write_csv(DATA_MEGA, mm)
    write_csv(DATA_PB, pb)

    if errors:
        print("Warnings:", file=sys.stderr)
        for e in errors:
            print(f"  {e}", file=sys.stderr)
        if not official_mm and not existing_mm and not remote_mm:
            return 1
        if not official_pb and not existing_pb and not remote_pb:
            return 1

    print(f"Wrote {len(mm)} Mega Millions rows -> {DATA_MEGA.relative_to(REPO_ROOT)}")
    print(f"Wrote {len(pb)} Powerball rows -> {DATA_PB.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
