import { parseCsv } from "./csv.js";
import { DOW_SHORT, parseLocalNoon } from "./analysis/weekday.js";
import {
  aggregateLuckTest,
  buildSkillSeries,
  enrichScoredRow,
  rollingAverage,
} from "./stats/scoring.js";
import { drawSkillChart } from "./stats/skillChart.js";

const CSV_PATH = "data/prediction_history.csv";

function formatWhites(cell) {
  if (!String(cell ?? "").trim()) return "—";
  return String(cell)
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");
}

function formatTicketLine(r, prefix) {
  const w = formatWhites(r[`${prefix}_whites`]);
  const b = String(r[`${prefix}_bonus`] ?? "").trim();
  if (w === "—" && !b) return "—";
  return `${w} + ${b || "?"}`;
}

function formatActual(r) {
  const nums = [r.actual_n1, r.actual_n2, r.actual_n3, r.actual_n4, r.actual_n5]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);
  const b = String(r.actual_bonus ?? "").trim();
  if (nums.length !== 5 || !b) return null;
  return `${nums.join(", ")} + ${b}`;
}

function formatTargetDate(iso) {
  const s = String(iso ?? "").trim();
  if (!s) return "—";
  const d = parseLocalNoon(s);
  if (Number.isNaN(d.getTime())) return s;
  const dow = DOW_SHORT[d.getDay()];
  return `${dow}, ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

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
  badge.className = pending
    ? "history-card__badge history-card__badge--pending"
    : "history-card__badge history-card__badge--done";
  badge.textContent = pending ? "Awaiting draw" : "Scored";
  head.append(title, badge);
  card.appendChild(head);

  const bodyEl = document.createElement("div");
  bodyEl.className = "history-card__body";
  bodyEl.append(
    row("Target draw", `${formatTargetDate(target)} (${target})`),
    row("Logged (UTC)", shortIso(r.predicted_at_utc)),
    row("Set A", formatTicketLine(r, "set_a")),
    row("Set B", formatTicketLine(r, "set_b")),
  );

  if (actual) {
    bodyEl.append(row("Actual", actual));
    const skillA = String(r.accuracy_set_a_pct ?? "").trim();
    const skillB = String(r.accuracy_set_b_pct ?? "").trim();
    const rawA = String(r.raw_match_pct_set_a ?? "").trim();
    const rawB = String(r.raw_match_pct_set_b ?? "").trim();
    const zA = String(r.skill_z_set_a ?? "").trim();
    const zB = String(r.skill_z_set_b ?? "").trim();
    const fmtSet = (label, skill, raw, hits, bonus, z) => {
      const parts = [];
      if (skill !== "") parts.push(`skill ${skill}% (z=${z || "—"})`);
      if (raw !== "") parts.push(`raw ${raw}%`);
      parts.push(`${hits ?? 0} whites, bonus ${bonus === "1" ? "yes" : "no"}`);
      return `${label}: ${parts.join(" · ")}`;
    };
    const accLine =
      skillA !== "" || skillB !== "" || rawA !== "" || rawB !== ""
        ? `${fmtSet("Set A", skillA, rawA, r.white_hits_a, r.bonus_hit_a, zA)} · ${fmtSet("Set B", skillB, rawB, r.white_hits_b, r.bonus_hit_b, zB)}`
        : "—";
    bodyEl.append(row("Skill score", accLine));
  }

  card.appendChild(bodyEl);
  return card;
}

function renderAnalytics(rows) {
  const copyEl = document.getElementById("ph-analytics-copy");
  const statsEl = document.getElementById("ph-analytics-stats");
  if (!copyEl) return;

  const enriched = rows.map((r) => enrichScoredRow(r));
  const zScores = [];
  for (const r of enriched) {
    if (!String(r.actual_n1 ?? "").trim()) continue;
    const za = Number.parseFloat(String(r.skill_z_set_a ?? ""));
    const zb = Number.parseFloat(String(r.skill_z_set_b ?? ""));
    if (Number.isFinite(za)) zScores.push(za);
    if (Number.isFinite(zb)) zScores.push(zb);
  }

  const test = aggregateLuckTest(zScores);
  const pText =
    test.pValue == null ? "—" : test.pValue < 0.0001 ? "< 0.0001" : String(test.pValue);

  copyEl.textContent = test.verdict;

  if (statsEl) {
    statsEl.replaceChildren();
    const items = [
      ["Scored tickets", String(test.n)],
      ["Mean skill z", test.meanZ == null ? "—" : String(test.meanZ)],
      ["p-value (skill > luck)", pText],
    ];
    for (const [label, value] of items) {
      const dt = document.createElement("div");
      dt.className = "ph-stat";
      const k = document.createElement("span");
      k.className = "ph-stat__label";
      k.textContent = label;
      const v = document.createElement("span");
      v.className = "ph-stat__value";
      v.textContent = value;
      dt.append(k, v);
      statsEl.appendChild(dt);
    }
  }
}

function renderChart(rows) {
  const canvas = document.getElementById("ph-chart");
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;

  const enriched = rows.map((r) => enrichScoredRow(r));
  const points = buildSkillSeries(enriched);
  const rolling = rollingAverage(points, 4);

  const draw = () => drawSkillChart(canvas, points, rolling);
  draw();
  window.addEventListener("resize", draw, { passive: true });
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
    statusEl.textContent =
      "No rows yet. Run the update workflow or node scripts/log_predictions.mjs once.";
    return;
  }

  const rows = sortRows(raw.map((r) => enrichScoredRow(r)));
  const scored = rows.filter((r) => formatActual(r)).length;
  statusEl.textContent = `${rows.length} logged prediction(s) (${scored} scored). Newest first.`;
  renderAnalytics(rows);
  renderChart(rows);
  listEl.replaceChildren();

  for (const r of rows) {
    listEl.appendChild(renderCard(r));
  }
}

main();
