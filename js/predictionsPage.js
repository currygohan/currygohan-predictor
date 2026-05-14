import { parseCsv } from "./csv.js";

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
  if (nums.length !== 5 || !b) return "—";
  return `${nums.join(", ")} + ${b}`;
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

async function main() {
  const statusEl = document.getElementById("ph-status");
  const tbody = document.getElementById("ph-body");

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
  statusEl.textContent = `${rows.length} row(s). Newest target draw first.`;
  tbody.replaceChildren();

  for (const r of rows) {
    const tr = document.createElement("tr");
    const tdGame = document.createElement("td");
    tdGame.textContent = gameLabel(String(r.game ?? ""));
    const tdTarget = document.createElement("td");
    tdTarget.className = "nums";
    tdTarget.textContent = String(r.target_draw_date ?? "—");
    const tdAt = document.createElement("td");
    tdAt.className = "nums";
    tdAt.textContent = shortIso(r.predicted_at_utc);
    const tdA = document.createElement("td");
    tdA.className = "nums";
    tdA.textContent = formatTicketLine(r, "set_a");
    const tdB = document.createElement("td");
    tdB.className = "nums";
    tdB.textContent = formatTicketLine(r, "set_b");
    const tdAct = document.createElement("td");
    tdAct.className = "nums";
    tdAct.textContent = formatActual(r);
    const tdAccA = document.createElement("td");
    tdAccA.className = "nums";
    tdAccA.textContent =
      String(r.accuracy_set_a_pct ?? "").trim() !== "" ? `${r.accuracy_set_a_pct}%` : "—";
    const tdAccB = document.createElement("td");
    tdAccB.className = "nums";
    tdAccB.textContent =
      String(r.accuracy_set_b_pct ?? "").trim() !== "" ? `${r.accuracy_set_b_pct}%` : "—";
    tr.append(tdGame, tdTarget, tdAt, tdA, tdB, tdAct, tdAccA, tdAccB);
    tbody.appendChild(tr);
  }
}

main();
