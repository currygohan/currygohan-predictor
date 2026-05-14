#!/usr/bin/env python3
"""
Daily lottery draw updater: fetches from New York State open data (Socrata),
validates numbers and dates, merges into data/*.csv, prunes rule cutoffs.

Merge behavior: each run pulls up to 500 most recent rows from the NY API and
merges with existing data/*.csv. Every draw in that payload whose key
(date + sorted whites + bonus) is not already present is added — so if your
CSV was behind by several draws, one successful run can fill all of them at
once (not only the single latest draw), as long as those draws appear in the
500-row window.

Official repo-root CSVs (megamillions.csv, powerball.csv) are optional:
set MERGE_OFFICIAL_CSV=1 to merge them (e.g. one-time history); daily runs
do not require re-downloading those files.
"""

from __future__ import annotations

import csv
import json
import os
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

DATA_MEGA = REPO_ROOT / "data" / "mega_millions.csv"
DATA_PB = REPO_ROOT / "data" / "powerball.csv"
OFFICIAL_MEGA = REPO_ROOT / "megamillions.csv"
OFFICIAL_PB = REPO_ROOT / "powerball.csv"

CUTOFF_PB = date(2015, 10, 4)
CUTOFF_MM = date(2025, 4, 8)

# Current matrix rules (post-cutoff draws must satisfy these).
MM_WHITE_MIN, MM_WHITE_MAX = 1, 70
MM_BONUS_MIN, MM_BONUS_MAX = 1, 24
PB_WHITE_MIN, PB_WHITE_MAX = 1, 69
PB_BONUS_MIN, PB_BONUS_MAX = 1, 26

NY_MM_BASE = "https://data.ny.gov/resource/5xaw-6ayf.json?$order=draw_date%20DESC&$limit=500"
NY_PB_BASE = "https://data.ny.gov/resource/d6yy-54nr.json?$order=draw_date%20DESC&$limit=500"

FIELDNAMES = ("draw_date", "n1", "n2", "n3", "n4", "n5", "bonus", "multiplier", "source")

USER_AGENT = (
    "currygohan-predictor/1.1 (+https://github.com/currygohan/currygohan-predictor)"
)

# Warn if merged history is this stale vs UTC "today" (does not fail the job).
MAX_STALENESS_WARN_DAYS = 21

FETCH_RETRIES = 5
FETCH_BASE_DELAY_SEC = 2.0


def _ny_url(base: str) -> str:
    token = os.environ.get("SOCRATA_APP_TOKEN", "").strip()
    if not token:
        return base
    sep = "&" if "?" in base else "?"
    return f"{base}{sep}$$app_token={urllib.parse.quote(token, safe='')}"


@dataclass(frozen=True)
class Draw:
    draw_date: date
    whites: tuple[int, int, int, int, int]
    bonus: int
    multiplier: str
    source: str

    def key(self) -> tuple[str, tuple[int, int, int, int, int], int]:
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


def _merge_official_enabled() -> bool:
    return os.environ.get("MERGE_OFFICIAL_CSV", "").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def utc_today() -> date:
    return datetime.now(timezone.utc).date()


def fetch_json(url: str) -> list[dict]:
    last_err: BaseException | None = None
    for attempt in range(FETCH_RETRIES):
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                raw = resp.read().decode("utf-8")
            data = json.loads(raw)
            if not isinstance(data, list):
                raise ValueError("expected JSON array from NY API")
            return data
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, ValueError) as e:
            last_err = e
            if attempt + 1 < FETCH_RETRIES:
                delay = FETCH_BASE_DELAY_SEC * (2**attempt) + random.uniform(0, 0.5)
                time.sleep(delay)
    assert last_err is not None
    raise last_err


def parse_iso_date(s: str) -> date:
    s = str(s).strip()[:10]
    return datetime.strptime(s, "%Y-%m-%d").date()


def validate_draw_date(
    d: date,
    *,
    cutoff: date,
    label: str,
) -> None:
    """Reject impossible or out-of-range calendar dates from the feed."""
    if d < cutoff:
        raise ValueError(f"{label}: draw_date {d} is before rule cutoff {cutoff}")
    today = utc_today()
    if d > today + timedelta(days=1):
        raise ValueError(
            f"{label}: draw_date {d} is in the future (today UTC {today}); bad feed or clock"
        )
    if d.year < 2000 or d.year > today.year + 1:
        raise ValueError(f"{label}: draw_date {d} has absurd year")


def validate_mega_draw(draw: Draw) -> None:
    validate_draw_date(draw.draw_date, cutoff=CUTOFF_MM, label="Mega Millions")
    w = draw.whites
    if len(w) != 5 or len(set(w)) != 5:
        raise ValueError(f"Mega Millions: need 5 distinct white balls, got {w!r}")
    for n in w:
        if not (MM_WHITE_MIN <= n <= MM_WHITE_MAX):
            raise ValueError(f"Mega Millions: white ball {n} out of range [{MM_WHITE_MIN}, {MM_WHITE_MAX}]")
    if not (MM_BONUS_MIN <= draw.bonus <= MM_BONUS_MAX):
        raise ValueError(
            f"Mega Millions: Mega Ball {draw.bonus} out of range [{MM_BONUS_MIN}, {MM_BONUS_MAX}]"
        )


def validate_powerball_draw(draw: Draw) -> None:
    validate_draw_date(draw.draw_date, cutoff=CUTOFF_PB, label="Powerball")
    w = draw.whites
    if len(w) != 5 or len(set(w)) != 5:
        raise ValueError(f"Powerball: need 5 distinct white balls, got {w!r}")
    for n in w:
        if not (PB_WHITE_MIN <= n <= PB_WHITE_MAX):
            raise ValueError(f"Powerball: white ball {n} out of range [{PB_WHITE_MIN}, {PB_WHITE_MAX}]")
    if not (PB_BONUS_MIN <= draw.bonus <= PB_BONUS_MAX):
        raise ValueError(
            f"Powerball: Powerball {draw.bonus} out of range [{PB_BONUS_MIN}, {PB_BONUS_MAX}]"
        )


def ny_mega_to_draw(obj: dict) -> Draw:
    d = parse_iso_date(obj["draw_date"])
    whites = tuple(sorted(int(x) for x in str(obj["winning_numbers"]).split()))
    if len(whites) != 5:
        raise ValueError(f"mega winning_numbers: expected 5 ints, got {whites!r}")
    bonus = int(str(obj["mega_ball"]).strip())
    mult = str(obj.get("multiplier") or "").strip()
    draw = Draw(d, whites, bonus, mult, "ny_open_data")
    validate_mega_draw(draw)
    return draw


def ny_powerball_to_draw(obj: dict) -> Draw:
    d = parse_iso_date(obj["draw_date"])
    parts = [int(x) for x in str(obj["winning_numbers"]).split()]
    if len(parts) != 6:
        raise ValueError(f"powerball winning_numbers: expected 6 ints, got {parts!r}")
    whites = tuple(sorted(parts[:5]))
    bonus = parts[5]
    mult = str(obj.get("multiplier") or "").strip()
    if isinstance(obj.get("multiplier"), (int, float)) and not mult:
        mult = str(int(obj["multiplier"]))
    draw = Draw(d, whites, bonus, mult, "ny_open_data")
    validate_powerball_draw(draw)
    return draw


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
    draw = Draw(date(y, m, d), whites, bonus, mult, "official_csv")
    validate_mega_draw(draw)
    return draw


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
    draw = Draw(date(y, m, d), whites, bonus, mult, "official_csv")
    validate_powerball_draw(draw)
    return draw


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
                w = tuple(int(str(r.get(f"n{i}", "")).strip()) for i in range(1, 6))
                w = tuple(sorted(w))
                b = int(str(r.get("bonus", "")).strip())
                mult = str(r.get("multiplier") or "").strip()
                src = str(r.get("source") or "").strip() or "normalized_csv"
                out.append(Draw(dd, w, b, mult, src))
            except (ValueError, TypeError):
                continue
    return out


def warn_if_stale(draws: list[Draw], *, label: str) -> None:
    if not draws:
        print(f"WARN: {label}: no draws after merge.", file=sys.stderr)
        return
    latest = max(d.draw_date for d in draws)
    today = utc_today()
    age = (today - latest).days
    if age > MAX_STALENESS_WARN_DAYS:
        print(
            f"WARN: {label}: latest draw {latest} is {age} days behind UTC today {today} "
            f"(>{MAX_STALENESS_WARN_DAYS}d). Check NY feed or push a manual CSV update.",
            file=sys.stderr,
        )


def drop_dates_overridden_by_remote(local: list[Draw], remote: list[Draw]) -> list[Draw]:
    """When NY publishes a correction for a date, prefer remote over repo rows for that date."""
    rdates = {d.draw_date for d in remote}
    return [d for d in local if d.draw_date not in rdates]


def drop_dates_overridden_by_remote_official(
    official: list[Draw], remote: list[Draw]
) -> list[Draw]:
    rdates = {d.draw_date for d in remote}
    return [d for d in official if d.draw_date not in rdates]


def assert_unique_dates(draws: list[Draw], *, label: str) -> None:
    by_date: dict[date, tuple[tuple[int, int, int, int, int], int]] = {}
    for d in draws:
        if d.draw_date in by_date and by_date[d.draw_date] != (d.whites, d.bonus):
            raise ValueError(
                f"{label}: API returned two different rows for {d.draw_date}: "
                f"{by_date[d.draw_date]} vs {(d.whites, d.bonus)}"
            )
        by_date[d.draw_date] = (d.whites, d.bonus)


def merge_draws(*batches: list[Draw]) -> list[Draw]:
    by_key: dict[tuple[str, tuple[int, int, int, int, int], int], Draw] = {}
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
    merge_official = _merge_official_enabled()

    url_mm = _ny_url(NY_MM_BASE)
    url_pb = _ny_url(NY_PB_BASE)

    try:
        raw_mm = fetch_json(url_mm)
        raw_pb = fetch_json(url_pb)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, json.JSONDecodeError) as e:
        print(
            f"WARN: NY API fetch failed after retries ({e!r}). "
            "Leaving CSVs unchanged. Optional: add repo secret SOCRATA_APP_TOKEN "
            "if you see HTTP 403 from data.ny.gov.",
            file=sys.stderr,
        )
        return 0

    remote_mm: list[Draw] = []
    remote_pb: list[Draw] = []
    for o in raw_mm:
        try:
            remote_mm.append(ny_mega_to_draw(o))
        except (ValueError, KeyError, TypeError) as e:
            print(f"WARN: skip Mega row {o!r}: {e}", file=sys.stderr)
    for o in raw_pb:
        try:
            remote_pb.append(ny_powerball_to_draw(o))
        except (ValueError, KeyError, TypeError) as e:
            print(f"WARN: skip Powerball row {o!r}: {e}", file=sys.stderr)

    if not remote_mm or not remote_pb:
        print(
            "WARN: No usable remote draws after parsing; leaving CSVs unchanged.",
            file=sys.stderr,
        )
        return 0

    try:
        assert_unique_dates(remote_mm, label="Mega Millions")
        assert_unique_dates(remote_pb, label="Powerball")
    except (ValueError, KeyError, TypeError) as e:
        print(f"ERROR: duplicate conflicting dates in NY API payload: {e}", file=sys.stderr)
        return 1

    existing_mm = load_normalized_csv(DATA_MEGA)
    existing_pb = load_normalized_csv(DATA_PB)

    existing_mm = drop_dates_overridden_by_remote(existing_mm, remote_mm)
    existing_pb = drop_dates_overridden_by_remote(existing_pb, remote_pb)

    official_mm: list[Draw] = []
    official_pb: list[Draw] = []
    if merge_official:
        official_mm = [d for d in iter_official(OFFICIAL_MEGA, parse_official_mega_row) if d]
        official_pb = [d for d in iter_official(OFFICIAL_PB, parse_official_pb_row) if d]
        official_mm = drop_dates_overridden_by_remote_official(official_mm, remote_mm)
        official_pb = drop_dates_overridden_by_remote_official(official_pb, remote_pb)

    mm = prune(merge_draws(existing_mm, official_mm, remote_mm), CUTOFF_MM)
    pb = prune(merge_draws(existing_pb, official_pb, remote_pb), CUTOFF_PB)

    warn_if_stale(mm, label="Mega Millions")
    warn_if_stale(pb, label="Powerball")

    write_csv(DATA_MEGA, mm)
    write_csv(DATA_PB, pb)

    print(f"OK: wrote {len(mm)} Mega Millions rows -> {DATA_MEGA.relative_to(REPO_ROOT)}")
    print(f"OK: wrote {len(pb)} Powerball rows -> {DATA_PB.relative_to(REPO_ROOT)}")
    if not merge_official:
        print("(Official root CSVs not merged; set MERGE_OFFICIAL_CSV=1 to include them.)")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
