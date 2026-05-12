import { GAME_RULES } from "./constants.js";

/** JS Sunday = 0 … Saturday = 6 (local calendar). */
export const DRAW_DOW_BY_GAME = {
  /** Mega Millions: Tuesday, Friday */
  mega_millions: [2, 5],
  /** Powerball: Monday, Wednesday, Saturday */
  powerball: [1, 3, 6],
};

export const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Parse YYYY-MM-DD at local noon so weekday matches wall calendar in the user's timezone.
 * @param {string} iso
 */
export function parseLocalNoon(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).trim());
  if (!m) return new Date(NaN);
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  return new Date(y, mo, d, 12, 0, 0, 0);
}

/**
 * @param {string} iso
 * @returns {number} 0–6
 */
export function getLocalDayOfWeek(iso) {
  return parseLocalNoon(iso).getDay();
}

/**
 * First calendar day from today (local) whose weekday is an official draw day for this game.
 * @param {"mega_millions"|"powerball"} game
 */
export function nextScheduledDrawDayOfWeek(game) {
  const allowed = DRAW_DOW_BY_GAME[game];
  if (!allowed?.length) return 0;
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  for (let i = 0; i < 14; i += 1) {
    const dow = start.getDay();
    if (allowed.includes(dow)) return dow;
    start.setDate(start.getDate() + 1);
  }
  return allowed[0];
}

/**
 * Empirical rates on draws that fell on `targetDow` (local weekday of draw_date).
 * White score = (# of those draws where this white appeared) / (# of draws on that weekday).
 * Bonus score = (# of those draws with this bonus) / (# of draws on that weekday).
 *
 * @param {"mega_millions"|"powerball"} game
 * @param {{ draw_date: string, whites: number[], bonus: number }[]} rows
 * @param {number} targetDow 0–6
 */
export function computeWeekdayScores(game, rows, targetDow) {
  const rules = GAME_RULES[game];
  /** @type {Record<number, number>} */
  const white = {};
  /** @type {Record<number, number>} */
  const bonus = {};
  if (!rules) return { white, bonus };

  for (let n = rules.whiteMin; n <= rules.whiteMax; n += 1) white[n] = 0;
  for (let n = rules.bonusMin; n <= rules.bonusMax; n += 1) bonus[n] = 0;

  let nOnDay = 0;
  /** @type {Record<number, number>} */
  const whiteHits = {};
  /** @type {Record<number, number>} */
  const bonusHits = {};

  for (const row of rows) {
    if (getLocalDayOfWeek(row.draw_date) !== targetDow) continue;
    nOnDay += 1;
    for (const w of row.whites) {
      if (!Number.isInteger(w) || w < rules.whiteMin || w > rules.whiteMax) continue;
      whiteHits[w] = (whiteHits[w] ?? 0) + 1;
    }
    const b = row.bonus;
    if (Number.isInteger(b) && b >= rules.bonusMin && b <= rules.bonusMax) {
      bonusHits[b] = (bonusHits[b] ?? 0) + 1;
    }
  }

  if (nOnDay === 0) {
    return { white, bonus };
  }

  for (let c = rules.whiteMin; c <= rules.whiteMax; c += 1) {
    white[c] = (whiteHits[c] ?? 0) / nOnDay;
  }
  for (let b = rules.bonusMin; b <= rules.bonusMax; b += 1) {
    bonus[b] = (bonusHits[b] ?? 0) / nOnDay;
  }

  return { white, bonus };
}
