import { parseCsv } from "./csv.js";
import { DOW_SHORT, parseLocalNoon } from "./analysis/weekday.js";

const CSV_PATH = "data/prediction_history.csv";

/**
 * @param {string} cell pipe-separated whites
 */
function formatWhites(cell) {
  if (!String(cell ?? "").trim()) return "—";
  return String(cell)
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * @param {Record<string, string>} r
 */
function formatTicketLine(r, prefix) {
  const w = formatWhites(r[`${prefix}_whites`]);
  const b = String(r[`${prefix}_bonus`] ?? "").trim();
  if (w === "—" && !b) return "—";
  return `${w} + ${b || "?"}`;
}

/**
 * @param {Record<string, string>} r
 */
function formatActual(r) {
  const nums = [r.actual_n1, r.actual_n2, r.actual_n3, r.actual_n4, r.actual_n5]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);
  const b = String(r.actual_bonus ?? "").trim();
  if (nums.length !== 5 || !b) return null;
  return `${nums.join(", ")} + ${b}`;
}

/**
 * @param {string} iso
 */
function formatTargetDate(iso) {
  const s = String(iso ?? "").trim();
  if (!s) return "—";
  const d = parseLocalNoon(s);
  if (Number.isNaN(d.getTime())) return s;
  const dow = DOW_SHORT[d.getDay()];
  return `${dow}, ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

/**
 * @param {Record<string, string>[]} rows
 */
function sortRows(rows) {
  return [...rows].sort((a, b) => {
    const c = String(b.target_draw_date).localeCompare(String(a.target_draw_date));
    if (c !== 0) return c;
    return String(a.game).localeCompare(String(b.game));
  });
}

function gameLabel(game) {
  if (game === "mega_millions") return "Mega Millions";
  if (game === "powerball") return "Powerball";
  return game;
}

function shortIso(iso) {
  const s = String(iso ?? "").trim();
  if (!s) return "—";
  return s.slice(0, 19).replace("T", " ");
}

/**
 * @param {string} label
 * @param {string} value
 */
function row(label, value) {
  const wrap = document.createElement("div");
  wrap.className = "history-card__row";
  const lab = document.createElement("span");
  lab.className = "history-card__label";
  lab.textContent = label;
  const val = document.createElement("span");
  val.className = "history-card__value nums";
  val.textContent = value;
  wrap.append(lab, val);
  return wrap;
}

/**
 * @param {Record<string, string>} r
 */
function renderCard(r) {
  const card = document.createElement("article");
  card.className = "history-card";
  card.setAttribute("role", "listitem");

  const game = String(r.game ?? "");
  const target = String(r.target_draw_date ?? "");
  const actual = formatActual(r);
  const pending = !actual;

  const head = document.createElement("header");
  head.className = "history-card__head";
  const title = document.createElement("h3");
  title.className = "history-card__title";
  title.textContent = gameLabel(game);
  const badge = document.createElement("span");
  badge.className = pending ? "history-card__badge history-card__badge--pending" : "history-card__badge history-card__badge--done";
  badge.textContent = pending ? "Awaiting draw" : "Scored";
  head.append(title, badge);
  card.appendChild(head);

  const body = document.createElement("div");
  body.className = "history-card__body";
  body.append(
    row("Target draw", `${formatTargetDate(target)} (${target})`),
    row("Logged (UTC)", shortIso(r.predicted_at_utc)),
    row("Set A", formatTicketLine(r, "set_a")),
    row("Set B", formatTicketLine(r, "set_b")),
  );

  if (actual) {
    body.append(row("Actual", actual));
    const accA = String(r.accuracy_set_a_pct ?? "").trim();
    const accB = String(r.accuracy_set_b_pct ?? "").trim();
    const accLine =
      accA !== "" || accB !== ""
        ? `Set A ${accA !== "" ? `${accA}%` : "—"} (${r.white_hits_a ?? 0} whites, bonus ${r.bonus_hit_a === "1" ? "yes" : "no"}) · Set B ${accB !== "" ? `${accB}%` : "—"} (${r.white_hits_b ?? 0} whites, bonus ${r.bonus_hit_b === "1" ? "yes" : "no"})`
        : "—";
    body.append(row("Accuracy", accLine));
  }

  card.appendChild(body);
  return card;
}

async function main() {
  const statusEl = document.getElementById("ph-status");
  const listEl = document.getElementById("ph-list");

  let res;
  try {
    res = await fetch(CSV_PATH, { cache: "no-store" });
  } catch (e) {
    statusEl.textContent =
      `Could not load ${CSV_PATH}. Use a local server from the repo root, or open the deployed GitHub Pages URL.`;
    statusEl.classList.add("error");
    return;
  }

  if (!res.ok) {
    statusEl.textContent = `HTTP ${res.status} for ${CSV_PATH}.`;
    statusEl.classList.add("error");
    return;
  }

  const text = await res.text();
  const { headers, rows: raw } = parseCsv(text);
  if (!headers.length || !raw.length) {
    statusEl.textContent = "No rows yet. Run the update workflow or node scripts/log_predictions.mjs once.";
    return;
  }

  const rows = sortRows(raw);
  statusEl.textContent = `${rows.length} logged prediction(s). Newest first.`;
  listEl.replaceChildren();

  for (const r of rows) {
    listEl.appendChild(renderCard(r));
  }
}

main();
