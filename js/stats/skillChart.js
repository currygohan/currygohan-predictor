/**
 * Draw skill-percentile time series on a canvas (no external chart lib).
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{ date: string, skillPct: number, game: string }[]} points
 * @param {{ index: number, value: number, date: string }[]} rolling
 */
export function drawSkillChart(canvas, points, rolling) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(280, Math.floor(rect.width) || 320);
  const h = 220;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const pad = { top: 16, right: 12, bottom: 36, left: 40 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  ctx.fillStyle = "#141b26";
  ctx.fillRect(0, 0, w, h);

  if (!points.length) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No scored predictions yet — chart appears after draws complete.", w / 2, h / 2);
    return;
  }

  const yMin = 0;
  const yMax = 100;
  const xMin = 0;
  const xMax = Math.max(1, points.length - 1);

  const toX = (i) => pad.left + (i / xMax) * plotW;
  const toY = (v) => pad.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  ctx.strokeStyle = "#2a3a52";
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g += 1) {
    const y = yMin + ((yMax - yMin) * g) / 4;
    const py = toY(y);
    ctx.beginPath();
    ctx.moveTo(pad.left, py);
    ctx.lineTo(w - pad.right, py);
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(String(Math.round(y)), pad.left - 6, py + 3);
  }

  const luckY = toY(50);
  ctx.strokeStyle = "rgba(240, 198, 116, 0.55)";
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(pad.left, luckY);
  ctx.lineTo(w - pad.right, luckY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#f0c674";
  ctx.font = "10px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("50 = random expectation", pad.left + 4, luckY - 5);

  if (rolling.length > 1) {
    ctx.strokeStyle = "#5eb3f6";
    ctx.lineWidth = 2;
    ctx.beginPath();
    rolling.forEach((r, idx) => {
      const x = toX(r.index);
      const y = toY(r.value);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  points.forEach((p, i) => {
    const x = toX(i);
    const y = toY(p.skillPct);
    ctx.beginPath();
    ctx.fillStyle = p.game === "powerball" ? "#c9a0ff" : "#6bcf8e";
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "#94a3b8";
  ctx.font = "10px system-ui, sans-serif";
  ctx.textAlign = "center";
  const labelEvery = points.length <= 6 ? 1 : Math.ceil(points.length / 5);
  points.forEach((p, i) => {
    if (i % labelEvery !== 0 && i !== points.length - 1) return;
    const x = toX(i);
    const short = p.date.slice(5);
    ctx.fillText(short, x, h - 10);
  });

  ctx.fillStyle = "#f0f4fa";
  ctx.font = "11px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Skill % (odds-adjusted)", pad.left, 12);
  ctx.fillStyle = "#5eb3f6";
  ctx.fillText("— rolling avg", pad.left + 118, 12);
}
