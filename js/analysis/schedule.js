import { DRAW_DOW_BY_GAME, parseLocalNoon } from "./weekday.js";

/**
 * First official draw calendar date **strictly after** `lastDrawDateIso` (YYYY-MM-DD).
 * Uses the same local-noon weekday rules as draw scheduling.
 *
 * @param {string} lastDrawDateIso
 * @param {"mega_millions"|"powerball"} game
 * @returns {string} YYYY-MM-DD
 */
export function nextDrawCalendarDateIsoAfter(lastDrawDateIso, game) {
  const allowed = DRAW_DOW_BY_GAME[game];
  if (!allowed?.length) return lastDrawDateIso;
  const start = parseLocalNoon(lastDrawDateIso);
  if (Number.isNaN(start.getTime())) return lastDrawDateIso;
  start.setDate(start.getDate() + 1);
  start.setHours(12, 0, 0, 0);
  for (let i = 0; i < 14; i += 1) {
    if (allowed.includes(start.getDay())) {
      const y = start.getFullYear();
      const mo = String(start.getMonth() + 1).padStart(2, "0");
      const d = String(start.getDate()).padStart(2, "0");
      return `${y}-${mo}-${d}`;
    }
    start.setDate(start.getDate() + 1);
  }
  const y = start.getFullYear();
  const mo = String(start.getMonth() + 1).padStart(2, "0");
  const d = String(start.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}
