import { DEFAULT_ANALYSIS_WEIGHTS } from "./config.js";
import { GAME_RULES } from "./constants.js";
import { computeCompressibilityScores } from "./compressibility.js";
import {
  buildCooccurrenceMatrices,
  cooccurrenceScoresForContext,
} from "./cooccurrence.js";
import { computeFrequencyCounts } from "./frequency.js";
import { mergeScores, pickTwoTicketsFromScores, scaleScores } from "./mixer.js";
import { computeSpectralScores } from "./spectral.js";
import {
  computeWeekdayScores,
  DOW_SHORT,
  nextScheduledDrawDayOfWeek,
} from "./weekday.js";
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
  const specCfg = DEFAULT_ANALYSIS_WEIGHTS.spectral;
  const compCfg = DEFAULT_ANALYSIS_WEIGHTS.compressibility;
  const wdCfg = DEFAULT_ANALYSIS_WEIGHTS.weekday;

  const freqOn = freqCfg.enabled && freqCfg.weight > 0;
  const transOn = transCfg.enabled && transCfg.weight > 0;
  const coOn = coCfg.enabled && coCfg.weight > 0;
  const specOn = specCfg.enabled && specCfg.weight > 0;
  const compOn = compCfg.enabled && compCfg.weight > 0;
  const wdOn = wdCfg.enabled && wdCfg.weight > 0;
  if (!freqOn && !transOn && !coOn && !specOn && !compOn && !wdOn) return null;

  let combined = zeroScoreMaps(game);
  const captionParts = [];

  const ordered =
    transOn || coOn || compOn ? sortChronological(historyRows) : null;
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

  if (specOn) {
    const rawSpec = computeSpectralScores(game, historyRows);
    const scaled = scaleScores(rawSpec, specCfg.weight);
    combined = mergeScores(combined, scaled, game);
    const sw = specCfg.weight === 1 ? "×1" : `×${specCfg.weight}`;
    captionParts.push(
      `${specCfg.label} (${sw}; 2nd mode on white graph, Perron on bonus coupling)`,
    );
  }

  if (compOn && ordered?.length) {
    const rawComp = computeCompressibilityScores(ordered, rules);
    const scaled = scaleScores(rawComp, compCfg.weight);
    combined = mergeScores(combined, scaled, game);
    const kw = compCfg.weight === 1 ? "×1" : `×${compCfg.weight}`;
    captionParts.push(
      `${compCfg.label} (${kw}; last-256-draw entropy + Markov-1 on hit indicators)`,
    );
  }

  if (wdOn) {
    const targetDow = nextScheduledDrawDayOfWeek(game);
    const rawWd = computeWeekdayScores(game, historyRows, targetDow);
    const scaled = scaleScores(rawWd, wdCfg.weight);
    combined = mergeScores(combined, scaled, game);
    const ww = wdCfg.weight === 1 ? "×1" : `×${wdCfg.weight}`;
    captionParts.push(
      `${wdCfg.label} (${ww}; rates on ${DOW_SHORT[targetDow]} draws only — next scheduled draw weekday, local calendar; not causal)`,
    );
  }

  const tickets = pickTwoTicketsFromScores(combined, game);
  if (!tickets) return null;

  const caption =
    `${captionParts.join(" · ")}. Whites and bonus scored separately. ` +
    "Set B = next-best whites after Set A, different bonus when possible.";

  return { ...tickets, caption };
}
