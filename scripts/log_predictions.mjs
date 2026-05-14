/**
 * CI / local: append or update prediction rows and reconcile with actual draws.
 * Run from repo root: node scripts/log_predictions.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { parseCsv } from "../js/csv.js";
import { suggestSets } from "../js/analysis/suggest.js";
import { nextDrawCalendarDateIsoAfter } from "../js/analysis/schedule.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const FILES = {
  mega_millions: join(ROOT, "data", "mega_millions.csv"),
  powerball: join(ROOT, "data", "powerball.csv"),
};

const HISTORY_PATH = join(ROOT, "data", "prediction_history.csv");

const COLS = [
  "game",
  "target_draw_date",
  "predicted_at_utc",
  "set_a_whites",
  "set_a_bonus",
  "set_b_whites",
  "set_b_bonus",
  "actual_n1",
  "actual_n2",
  "actual_n3",
  "actual_n4",
  "actual_n5",
  "actual_bonus",
  "accuracy_set_a_pct",
  "accuracy_set_b_pct",
  "white_hits_a",
  "white_hits_b",
  "bonus_hit_a",
  "bonus_hit_b",
];

/**
 * @param {Record<string, string>} r
 */
function normalizeDraw(r) {
  const nums = ["n1", "n2", "n3", "n4", "n5"].map((k) =>
    Number.parseInt(String(r[k] ?? "").trim(), 10),
  );
  const bonus = Number.parseInt(String(r.bonus ?? "").trim(), 10);
  if (nums.some((n) => Number.isNaN(n)) || Number.isNaN(bonus)) return null;
  return {
    draw_date: String(r.draw_date ?? "").trim(),
    whites: nums,
    bonus,
  };
}

/**
 * @param {string} path
 */
function loadGameRows(path) {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf8");
  const { headers, rows: raw } = parseCsv(text);
  const need = new Set(["draw_date", "n1", "n2", "n3", "n4", "n5", "bonus"]);
  if (![...need].every((h) => headers.includes(h))) return [];
  const out = [];
  for (const r of raw) {
    const n = normalizeDraw(r);
    if (n) out.push(n);
  }
  return out;
}

/**
 * @param {{ draw_date: string, whites: number[], bonus: number }[]} rows
 */
function maxDrawDate(rows) {
  if (!rows.length) return "";
  return [...rows].sort((a, b) => a.draw_date.localeCompare(b.draw_date)).at(-1).draw_date;
}

/**
 * @param {{ draw_date: string, whites: number[], bonus: number }[]} rows
 * @param {string} iso
 */
function drawOnDate(rows, iso) {
  return rows.find((r) => r.draw_date === iso) ?? null;
}

/**
 * Combined accuracy: (white hits + bonus match) / 6 * 100
 * @param {number[]} predWhites
 * @param {number} predBonus
 * @param {{ whites: number[], bonus: number }} act
 */
function scoreTicket(predWhites, predBonus, act) {
  const pw = new Set(predWhites);
  let wh = 0;
  for (const w of act.whites) {
    if (pw.has(w)) wh += 1;
  }
  const bh = predBonus === act.bonus ? 1 : 0;
  const pct = Math.round((100 * (wh + bh)) / 6);
  return { wh, bh, pct };
}

function escapeCsvCell(s) {
  const t = String(s ?? "");
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

/**
 * @param {Record<string, string>[]} rows
 */
function writeHistory(rows) {
  const lines = [COLS.join(",")];
  for (const r of rows) {
    lines.push(COLS.map((k) => escapeCsvCell(r[k] ?? "")).join(","));
  }
  writeFileSync(HISTORY_PATH, lines.join("\n") + "\n", "utf8");
}

/**
 * @returns {Record<string, string>[]}
 */
function readHistory() {
  if (!existsSync(HISTORY_PATH)) return [];
  const text = readFileSync(HISTORY_PATH, "utf8").trim();
  if (!text) return [];
  const { headers, rows: raw } = parseCsv(text);
  if (!headers.length) return [];
  return raw.map((obj) => {
    const o = {};
    for (const k of COLS) {
      o[k] = String(obj[k] ?? "").trim();
    }
    return o;
  });
}

/**
 * @param {Record<string, string>[]} history
 * @param {"mega_millions"|"powerball"} game
 * @param {{ draw_date: string, whites: number[], bonus: number }[]} gameRows
 */
function reconcile(history, game, gameRows) {
  const maxD = maxDrawDate(gameRows);
  for (const h of history) {
    if (h.game !== game) continue;
    if (String(h.actual_n1 || "").trim() !== "") continue;
    if (!h.target_draw_date || h.target_draw_date > maxD) continue;
    const act = drawOnDate(gameRows, h.target_draw_date);
    if (!act) continue;
    const sorted = [...act.whites].sort((a, b) => a - b);
    h.actual_n1 = String(sorted[0]);
    h.actual_n2 = String(sorted[1]);
    h.actual_n3 = String(sorted[2]);
    h.actual_n4 = String(sorted[3]);
    h.actual_n5 = String(sorted[4]);
    h.actual_bonus = String(act.bonus);

    const wa = h.set_a_whites.split("|").map((x) => Number.parseInt(x, 10));
    const wb = h.set_b_whites.split("|").map((x) => Number.parseInt(x, 10));
    const ba = Number.parseInt(h.set_a_bonus, 10);
    const bb = Number.parseInt(h.set_b_bonus, 10);

    const sa = scoreTicket(wa, ba, act);
    const sb = scoreTicket(wb, bb, act);
    h.white_hits_a = String(sa.wh);
    h.white_hits_b = String(sb.wh);
    h.bonus_hit_a = String(sa.bh);
    h.bonus_hit_b = String(sb.bh);
    h.accuracy_set_a_pct = String(sa.pct);
    h.accuracy_set_b_pct = String(sb.pct);
  }
}

/**
 * @param {number[]} whites
 */
function whitesToCell(whites) {
  return [...whites].sort((a, b) => a - b).join("|");
}

/**
 * @param {"mega_millions"|"powerball"} game
 * @param {Record<string, string>[]} history
 * @param {{ draw_date: string, whites: number[], bonus: number }[]} gameRows
 */
function appendPredictionForNextDraw(game, history, gameRows) {
  const last = maxDrawDate(gameRows);
  if (!last) {
    console.warn(`[${game}] no draws in CSV; skip prediction append`);
    return;
  }
  const target = nextDrawCalendarDateIsoAfter(last, game);
  const suggestion = suggestSets(game, gameRows);
  if (!suggestion) {
    console.warn(`[${game}] suggestSets returned null; skip`);
    return;
  }

  const existing = history.find(
    (h) => h.game === game && h.target_draw_date === target && !String(h.actual_n1 || "").trim(),
  );
  const now = new Date().toISOString();
  const row = {
    game,
    target_draw_date: target,
    predicted_at_utc: now,
    set_a_whites: whitesToCell(suggestion.setA.whites),
    set_a_bonus: String(suggestion.setA.bonus),
    set_b_whites: whitesToCell(suggestion.setB.whites),
    set_b_bonus: String(suggestion.setB.bonus),
    actual_n1: "",
    actual_n2: "",
    actual_n3: "",
    actual_n4: "",
    actual_n5: "",
    actual_bonus: "",
    accuracy_set_a_pct: "",
    accuracy_set_b_pct: "",
    white_hits_a: "",
    white_hits_b: "",
    bonus_hit_a: "",
    bonus_hit_b: "",
  };

  if (existing) {
    Object.assign(existing, row);
    console.log(`[${game}] updated pending prediction for target ${target}`);
  } else {
    history.push(row);
    console.log(`[${game}] appended prediction for target ${target}`);
  }
}

function main() {
  let history = readHistory();
  if (!history.length && !existsSync(HISTORY_PATH)) {
    writeHistory([]);
    history = readHistory();
  }

  for (const game of /** @type {const} */ (["mega_millions", "powerball"])) {
    const gameRows = loadGameRows(FILES[game]);
    reconcile(history, game, gameRows);
  }

  for (const game of /** @type {const} */ (["mega_millions", "powerball"])) {
    const gameRows = loadGameRows(FILES[game]);
    appendPredictionForNextDraw(game, history, gameRows);
  }

  writeHistory(history);
  console.log(`Wrote ${history.length} rows -> data/prediction_history.csv`);
}

main();
