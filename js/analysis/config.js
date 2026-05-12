/**
 * Per-analyzer weights (0 = disabled). Future analyzers plug in here and
 * contribute additive scores before the mixer runs.
 *
 * @type {{
 *   frequency: { enabled: boolean; weight: number; label: string };
 * }}
 */
export const DEFAULT_ANALYSIS_WEIGHTS = {
  frequency: {
    enabled: true,
    weight: 1,
    label: "Historical frequency",
  },
};
