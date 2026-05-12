/**
 * Per-analyzer weights (0 = disabled). Scores are combined additively per ball
 * before the mixer picks tickets.
 *
 * @type {{
 *   frequency: { enabled: boolean; weight: number; label: string };
 *   transition: { enabled: boolean; weight: number; label: string };
 * }}
 */
export const DEFAULT_ANALYSIS_WEIGHTS = {
  frequency: {
    enabled: true,
    weight: 1,
    label: "Historical frequency",
  },
  transition: {
    enabled: true,
    weight: 0.55,
    label: "After previous draw (pairs)",
  },
};
