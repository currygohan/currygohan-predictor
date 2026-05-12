import { parseCsv } from "./csv.js";
import { suggestSets } from "./analysis/stub.js";

const RECENT_COUNT = 25;

/** @typedef {{ draw_date: string, n1: string, n2: string, n3: string, n4: string, n5: string, bonus: string, multiplier?: string, source?: string }} RawRow */

const games = [
  {
    id: "mega_millions",
    title: "Mega Millions",
    csvPath: "data/mega_millions.csv",
    statusEl: document.getElementById("mm-status"),
    tableHead: document.getElementById("mm-table-head"),
    tableBody: document.getElementById("mm-table-body"),
    picksEl: document.getElementById("mm-picks"),
  },
  {
    id: "powerball",
    title: "Powerball",
    csvPath: "data/powerball.csv",
    statusEl: document.getElementById("pb-status"),
    tableHead: document.getElementById("pb-table-head"),
    tableBody: document.getElementById("pb-table-body"),
    picksEl: document.getElementById("pb-picks"),
  },
];

/**
 * @param {RawRow} r
 * @returns {{ draw_date: string, whites: number[], bonus: number, multiplier: string, source: string } | null}
 */
function normalizeRow(r) {
  const nums = ["n1", "n2", "n3", "n4", "n5"].map((k) => Number.parseInt(String(r[k] ?? "").trim(), 10));
  const bonus = Number.parseInt(String(r.bonus ?? "").trim(), 10);
  if (nums.some((n) => Number.isNaN(n)) || Number.isNaN(bonus)) return null;
  return {
    draw_date: String(r.draw_date ?? "").trim(),
    whites: nums,
    bonus,
    multiplier: String(r.multiplier ?? "").trim(),
    source: String(r.source ?? "").trim(),
  };
}

/**
 * @param {{ draw_date: string, whites: number[], bonus: number }[]} rows
 */
function sortByDateDesc(rows) {
  return [...rows].sort((a, b) => (a.draw_date < b.draw_date ? 1 : a.draw_date > b.draw_date ? -1 : 0));
}

function formatTicket(whites, bonus) {
  const w = [...whites].sort((a, b) => a - b);
  return `${w.join(" · ")} + ${bonus}`;
}

/**
 * @param {typeof games[0]} game
 * @param {{ draw_date: string, whites: number[], bonus: number, multiplier: string, source: string }[]} rows
 */
function renderTable(game, rows) {
  const recent = sortByDateDesc(rows).slice(0, RECENT_COUNT);
  game.tableHead.replaceChildren();
  game.tableBody.replaceChildren();

  const hr = document.createElement("tr");
  ["Date", "Numbers", "Bonus", "×"].forEach((label) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    hr.appendChild(th);
  });
  game.tableHead.appendChild(hr);

  for (const r of recent) {
    const tr = document.createElement("tr");
    const tdDate = document.createElement("td");
    tdDate.textContent = r.draw_date;
    const tdNums = document.createElement("td");
    tdNums.className = "nums";
    tdNums.textContent = [...r.whites].sort((a, b) => a - b).join(", ");
    const tdBonus = document.createElement("td");
    tdBonus.className = "nums";
    tdBonus.textContent = String(r.bonus);
    const tdMult = document.createElement("td");
    tdMult.className = "nums";
    tdMult.textContent = r.multiplier || "—";
    tr.append(tdDate, tdNums, tdBonus, tdMult);
    game.tableBody.appendChild(tr);
  }
}

/**
 * @param {typeof games[0]} game
 * @param {{ draw_date: string, whites: number[], bonus: number, multiplier: string, source: string }[]} rows
 */
function renderPicks(game, rows) {
  game.picksEl.replaceChildren();
  const suggestion = suggestSets(game.id, rows);

  if (suggestion?.caption) {
    const note = document.createElement("p");
    note.className = "pick-note";
    note.textContent = suggestion.caption;
    game.picksEl.appendChild(note);
  }

  for (const label of ["Set A", "Set B"]) {
    const card = document.createElement("div");
    card.className = "pick-card";
    const h3 = document.createElement("h3");
    h3.textContent = label;
    const body = document.createElement("div");
    body.className = "numbers";

    if (!suggestion) {
      body.classList.add("pending");
      body.textContent = "Not enough history to score (or analysis disabled).";
    } else {
      const pick = label === "Set A" ? suggestion.setA : suggestion.setB;
      body.textContent = formatTicket(pick.whites, pick.bonus);
    }

    card.append(h3, body);
    game.picksEl.appendChild(card);
  }
}

async function loadGameCsv(game) {
  game.statusEl.textContent = "Loading…";
  game.statusEl.classList.remove("error");

  let res;
  try {
    res = await fetch(game.csvPath, { cache: "no-store" });
  } catch (e) {
    game.statusEl.textContent = `Network error loading ${game.csvPath}. For local preview, run a static server from the repo root.`;
    game.statusEl.classList.add("error");
    throw e;
  }

  if (!res.ok) {
    game.statusEl.textContent = `HTTP ${res.status} for ${game.csvPath}.`;
    game.statusEl.classList.add("error");
    throw new Error(String(res.status));
  }

  const text = await res.text();
  const { headers, rows: rawRows } = parseCsv(text);
  const required = new Set(["draw_date", "n1", "n2", "n3", "n4", "n5", "bonus"]);
  const missing = [...required].filter((h) => !headers.includes(h));
  if (missing.length) {
    game.statusEl.textContent = `CSV missing columns: ${missing.join(", ")}.`;
    game.statusEl.classList.add("error");
    throw new Error("bad csv");
  }

  const parsed = [];
  for (const r of rawRows) {
    const n = normalizeRow(r);
    if (n) parsed.push(n);
  }

  game.statusEl.textContent = `${parsed.length} draws loaded (showing latest ${Math.min(RECENT_COUNT, parsed.length)}).`;
  return parsed;
}

async function main() {
  for (const game of games) {
    try {
      const rows = await loadGameCsv(game);
      renderTable(game, rows);
      renderPicks(game, rows);
    } catch {
      renderTable(game, []);
      renderPicks(game, []);
    }
  }
}

main();
