import { DEFAULT_ANALYSIS_WEIGHTS } from "./config.js";
import { GAME_RULES } from "./constants.js";
import {
  buildCooccurrenceMatrices,
  cooccurrenceScoresForContext,
} from "./cooccurrence.js";
import { computeFrequencyCounts } from "./frequency.js";
import { mergeScores, pickTwoTicketsFromScores, scaleScores } from "./mixer.js";
import {
  buildTransitionMatrices,
  transitionScoresForNextDraw,
  zeroScoreMaps,
} from "./transitions.js";

/**
 * @param {{ draw_date: string, whites: number[], bonus: number }[]} rows
 */
function sortChronological(rows) {
  return [...rows].sort((a, b) => {
    const c = a.draw_date.localeCompare(b.draw_date);
    if (c !== 0) return c;
    return 0;
  });
}

/**
 * @param {"mega_millions"|"powerball"} game
 * @param {{ draw_date: string, whites: number[], bonus: number }[]} historyRows
 * @returns {null | {
 *   setA: { whites: number[], bonus: number };
 *   setB: { whites: number[], bonus: number };
 *   caption: string;
 * }}
 */
export function suggestSets(game, historyRows) {
  const rules = GAME_RULES[game];
  if (!rules || !historyRows?.length) return null;

  const freqCfg = DEFAULT_ANALYSIS_WEIGHTS.frequency;
  const transCfg = DEFAULT_ANALYSIS_WEIGHTS.transition;
  const coCfg = DEFAULT_ANALYSIS_WEIGHTS.cooccurrence;

  const freqOn = freqCfg.enabled && freqCfg.weight > 0;
  const transOn = transCfg.enabled && transCfg.weight > 0;
  const coOn = coCfg.enabled && coCfg.weight > 0;
  if (!freqOn && !transOn && !coOn) return null;

  let combined = zeroScoreMaps(game);
  const captionParts = [];

  const ordered =
    transOn || coOn ? sortChronological(historyRows) : null;
  const last = ordered?.length ? ordered[ordered.length - 1] : null;

  if (freqOn) {
    const counts = computeFrequencyCounts(historyRows, rules);
    const scaled = scaleScores(counts, freqCfg.weight);
    combined = mergeScores(combined, scaled, game);
    const fw = freqCfg.weight === 1 ? "×1" : `×${freqCfg.weight}`;
    captionParts.push(`${freqCfg.label} (${fw})`);
  }

  if (transOn && ordered && last) {
    if (ordered.length >= 2) {
      const matrices = buildTransitionMatrices(ordered, rules);
      const rawTrans = transitionScoresForNextDraw(matrices, last, rules);
      const scaled = scaleScores(rawTrans, transCfg.weight);
      combined = mergeScores(combined, scaled, game);
      const tw = transCfg.weight === 1 ? "×1" : `×${transCfg.weight}`;
      captionParts.push(
        `${transCfg.label} (${tw}; context = latest draw ${last.draw_date})`,
      );
    } else {
      captionParts.push(`${transCfg.label} (skipped — need 2+ draws for pairs)`);
    }
  }

  if (coOn && ordered && last) {
    const coMats = buildCooccurrenceMatrices(historyRows, rules);
    const rawCo = cooccurrenceScoresForContext(coMats, last, rules);
    const scaled = scaleScores(rawCo, coCfg.weight);
    combined = mergeScores(combined, scaled, game);
    const cw = coCfg.weight === 1 ? "×1" : `×${coCfg.weight}`;
    captionParts.push(
      `${coCfg.label} (${cw}; white–white pairs + white–bonus with latest draw ${last.draw_date})`,
    );
  }

  const tickets = pickTwoTicketsFromScores(combined, game);
  if (!tickets) return null;

  const caption =
    `${captionParts.join(" · ")}. Whites and bonus scored separately. ` +
    "Set B = next-best whites after Set A, different bonus when possible.";

  return { ...tickets, caption };
}
