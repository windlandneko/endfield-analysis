import { Chart, LineController, LineElement, PointElement, CategoryScale, LinearScale, Filler, Tooltip, Legend } from 'chart.js';

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Filler, Tooltip, Legend);

const PULLS_PER_TOKEN = 240;
const MERGED_POTENTIAL_INDEX = 6;
const INLINE_LABEL_SAMPLE_STEP = 40;
const INLINE_LABEL_TARGET_PERCENT = 50;
const TICK_MIN_PIXEL_GAP = 40;
const TICK_BASE_STEP = 20;

// State for toggling higher potentials display
let showHigherPotentials = false;
let showTokens = true;
let currentData = null;
let tokenBoundaryIndices = [];

// Vivid palette for light background
const COLORS = [
  'rgba(255, 255, 255, 0)',
  'rgba(210,50,60,0.9)',
  'rgba(30,160,100,0.9)',
  'rgba(200,155,20,0.9)',
  'rgba(140,60,190,0.9)',
  'rgba(20,140,210,0.9)',
  'rgba(220,120,30,0.9)',
  'rgba(180,50,130,0.9)',
  'rgba(30,175,155,0.9)',
];

function parsePullCount(label) {
  const match = label.match(/^(\d+)\s*pulls$/);
  return match ? parseInt(match[1], 10) : null;
}

function getTokenCountByPull(pullNum) {
  return Math.floor(pullNum / PULLS_PER_TOKEN);
}

function parseData(text) {
  const labels = [], rows = [];
  for (const line of text.split('\n')) {
    const match = line.match(/^\s*(.+?):\s*\t(.+)$/);
    if (!match) continue;
    labels.push(match[1].trim());
    rows.push(match[2].split('\t').map(Number));
  }
  return { labels, rows };
}

// Key milestones to annotate (pull number -> label)
const MILESTONES = {
  30: '加急招募',
  80: '小保底',
  120: '大保底',
  240: '干员信物',
  480: '干员信物',
  720: '干员信物',
  960: '干员信物',
  1200: '干员信物',
};

// Plugin to draw vertical lines + labels at special labels & milestones
const specialLinePlugin = {
  id: 'specialLine',
  beforeDatasetsDraw(chart) {
    const meta = chart.getDatasetMeta(0);
    if (!meta.data.length) return;
    const ctx = chart.ctx;
    const labels = chart.data.labels;
    // Build pull-number -> index map for milestones
    const pullToIdx = {};
    labels.forEach((l, i) => {
      const m = l.match(/^(\d+)\s*pulls$/);
      if (m) pullToIdx[+m[1]] = i;
    });

    const drawLine = (x, text, color) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, chart.chartArea.top);
      ctx.lineTo(x, chart.chartArea.bottom);
      ctx.stroke();
      // Draw text vertically along the line
      ctx.fillStyle = color;
      ctx.font = "500 12px 'HarmonyOS Sans SC', system-ui";
      const isMobile = chart.width < 600;
      if (isMobile) ctx.font = "500 10px 'HarmonyOS Sans SC', system-ui";
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.translate(x - 8, chart.chartArea.top + 4);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(text, 0, 0);
      ctx.restore();
    };

    // Collect all annotations
    const annotations = [];
    const annoColor = 'rgba(0, 0, 0, 0.3)';

    // Milestone annotations
    for (const [pull, text] of Object.entries(MILESTONES)) {
      const idx = pullToIdx[+pull];
      if (idx == null) continue;
      const x = meta.data[idx]?.x;
      if (x != null) annotations.push({ x, text: `${text} ${pull}`, color: annoColor });
    }

    // Sort by x and draw
    annotations.sort((a, b) => a.x - b.x);
    for (const a of annotations) {
      drawLine(a.x, a.text, a.color);
    }
  },
};

// Plugin to draw inline legend labels centered in each dataset's stacked band
const inlineLegendPlugin = {
  id: 'inlineLegend',
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    const metas = chart.data.datasets.map((_, i) => chart.getDatasetMeta(i));

    chart.data.datasets.forEach((ds, di) => {
      const meta = metas[di];
      if (meta.hidden) return;

      // Skip "无" label
      if (ds.label === '无') return;

      // Sample every 40 points, avoid 120n positions, find closest to 50%
      const dataLen = ds.data.length;
      const sampleStep = INLINE_LABEL_SAMPLE_STEP;

      let bestIdx = 0, bestDist = Infinity;
      for (let i = 0; i < dataLen; i += sampleStep) {
        // Skip positions that are multiples of 120
        if (i === 120 || i % 240 === 0) continue;

        const v = ds.data[i];
        const d = Math.abs(v - INLINE_LABEL_TARGET_PERCENT);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }

      const pt = meta.data[bestIdx];
      if (!pt) return;
      const x = pt.x;
      const y = pt.y;

      const text = ds.label;
      ctx.save();
      const isMobile = chart.width < 600;
      ctx.font = isMobile
        ? "500 11px 'HarmonyOS Sans SC', system-ui"
        : "500 13px 'HarmonyOS Sans SC', system-ui";
      const tw = ctx.measureText(text).width;
      const pad = 5;
      ctx.fillStyle = ds.borderColor;
      ctx.fillRect(x - tw / 2 - pad, y - 10, tw + pad * 2, 18);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y);
      ctx.restore();
    });
  },
};

// Draw a vertical guide line following mouse hover position.
const hoverGuideLinePlugin = {
  id: 'hoverGuideLine',
  afterDatasetsDraw(chart) {
    const active = chart.tooltip?.getActiveElements?.() || chart.getActiveElements?.() || [];
    if (!active.length) return;

    const x = active[0]?.element?.x;
    if (x == null) return;

    const ctx = chart.ctx;
    const { top, bottom } = chart.chartArea;
    ctx.save();
    ctx.strokeStyle = 'rgba(20, 20, 20, 0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.restore();
  },
};

// Draw vertical connectors at 240n boundaries when tokens are displayed.
const tokenBoundaryConnectorPlugin = {
  id: 'tokenBoundaryConnector',
  beforeDatasetsDraw(chart) {
    if (!showTokens || !tokenBoundaryIndices.length) return;

    const ctx = chart.ctx;
    const metas = chart.data.datasets.map((_, i) => chart.getDatasetMeta(i));

    metas.forEach((meta, di) => {
      if (meta.hidden) return;
      const ds = chart.data.datasets[di];
      ctx.save();
      ctx.strokeStyle = ds.borderColor;
      ctx.lineWidth = ds.borderWidth || 1.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (const idx of tokenBoundaryIndices) {
        if (idx <= 0 || idx >= meta.data.length) continue;
        const prev = meta.data[idx - 1];
        const curr = meta.data[idx];
        if (!prev || !curr) continue;

        ctx.beginPath();
        // Draw an L connector: horizontal (239->240 at prev.y) then vertical at 240.
        // This avoids the tiny anti-aliasing gap between the hidden diagonal segment.
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(curr.x, prev.y);
        ctx.moveTo(curr.x, prev.y);
        ctx.lineTo(curr.x, curr.y);
        ctx.stroke();
      }
      ctx.restore();
    });
  },
};

let chart = null;

// Helper function to merge columns from startIdx to endIdx (exclusive)
function mergeColumns(rows, startIdx, endIdx) {
  return rows.map(r => {
    let sum = 0;
    for (let j = startIdx; j < endIdx; j++) {
      sum += r[j];
    }
    return sum * 100;
  });
}

function toPercentColumn(rows, colIdx) {
  return rows.map(r => r[colIdx] * 100);
}

function getSeriesColor(potentialLevel) {
  // Keep level 0 ("无") neutral, and cycle non-white colors for all other levels.
  if (potentialLevel === 0) return 'rgba(140,140,140,0.9)';
  return COLORS[((potentialLevel - 1) % (COLORS.length - 1)) + 1];
}

function computeTickStepByWidth(chartWidth, totalPulls) {
  if (totalPulls <= 0) return TICK_BASE_STEP;
  const pixelsPerPull = chartWidth / totalPulls;
  let step = TICK_BASE_STEP;
  while (step * pixelsPerPull < TICK_MIN_PIXEL_GAP && step < totalPulls) {
    step += TICK_BASE_STEP;
  }
  return step;
}

function getTickStep(chart) {
  const width = Math.round(chart.chartArea?.width || chart.width || 800);
  const totalPulls = chart.data.labels.length;
  if (chart.$tickCacheWidth !== width || chart.$tickCacheTotal !== totalPulls) {
    chart.$tickCacheWidth = width;
    chart.$tickCacheTotal = totalPulls;
    chart.$tickCacheStep = computeTickStepByWidth(width, totalPulls);
  }
  return chart.$tickCacheStep || TICK_BASE_STEP;
}

function buildDataset(label, data, colorIdx, fill) {
  const color = getSeriesColor(colorIdx);
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: color.replace('0.9', '0.18'),
    fill,
    tension: 0.3,
    borderWidth: 1.5,
    pointRadius: 0,
    pointBackgroundColor: color,
  };
}

function render({ labels, rows }) {
  currentData = { labels, rows };
  const cols = rows[0].length;

  // Calculate max token count across all pulls
  let maxTokenCount = 0;
  if (!showTokens) {
    labels.forEach(label => {
      const pullNum = parsePullCount(label);
      if (pullNum != null) {
        const tokenCount = getTokenCountByPull(pullNum);
        if (tokenCount > maxTokenCount) maxTokenCount = tokenCount;
      }
    });
  }

  // Apply token shifting if tokens are hidden
  let processedRows = rows;
  if (!showTokens) {
    processedRows = rows.map((row, idx) => {
      // Extract pull number from label
      const pullNum = parsePullCount(labels[idx]);
      if (pullNum == null) return row;

      // Calculate how many tokens should have been received by this pull
      const tokenCount = getTokenCountByPull(pullNum);

      if (tokenCount === 0) return row;

      // Shift the data down by tokenCount levels
      const newRow = Array.from({ length: cols }, () => 0);
      for (let i = 0; i < cols; i++) {
        if (i === 0) {
          // "无" column stays the same
          newRow[0] = row[0];
        } else if (i <= tokenCount) {
          // Accumulate lower levels into the lowest non-zero level
          newRow[1] += row[i];
        } else {
          // Shift down by tokenCount
          newRow[i - tokenCount] = row[i];
        }
      }
      return newRow;
    });
  }

  // When hiding tokens and showing higher potentials, limit display to effective max level
  const effectiveCols = (!showTokens && showHigherPotentials) ? cols - maxTokenCount : cols;

  tokenBoundaryIndices = [];
  if (showTokens) {
    labels.forEach((label, idx) => {
      const pullNum = parsePullCount(label);
      if (pullNum != null && pullNum > 0 && pullNum % PULLS_PER_TOKEN === 0) {
        tokenBoundaryIndices.push(idx);
      }
    });
  }

  let datasets;

  if (showHigherPotentials) {
    // Show all data (or up to effectiveCols if tokens hidden), with "及以上" suffix on highest level
    datasets = Array.from({ length: effectiveCols }, (_, ri) => {
      const i = effectiveCols - 1 - ri;
      let label;
      if (i === 0) {
        label = "无";
      } else if (i === effectiveCols - 1) {
        // Highest level gets "及以上" suffix
        label = i === MERGED_POTENTIAL_INDEX ? "满潜及以上" : `${i - 1}潜及以上`;
      } else if (i === MERGED_POTENTIAL_INDEX) {
        label = "满潜";
      } else {
        label = `${i - 1}潜`;
      }

      let data;
      if (i === effectiveCols - 1 && effectiveCols < cols) {
        // For the highest effective level, merge all higher levels
        data = mergeColumns(processedRows, i, cols);
      } else {
        data = toPercentColumn(processedRows, i);
      }

      return buildDataset(label, data, i, ri === 0 ? 'origin' : '-1');
    });
  } else {
    // Merge all data from index 6 (满潜) onwards into "满潜及以上"
    const mergedCols = MERGED_POTENTIAL_INDEX + 1; // 0-5潜 + 满潜及以上

    // Pre-calculate merged data for better performance
    const mergedData = mergeColumns(processedRows, MERGED_POTENTIAL_INDEX, cols);

    datasets = Array.from({ length: mergedCols }, (_, ri) => {
      const i = mergedCols - 1 - ri;
      let label;
      if (i === 0) {
        label = "无";
      } else if (i === MERGED_POTENTIAL_INDEX) {
        label = "满潜及以上";
      } else {
        label = `${i - 1}潜`;
      }

      const data = i === MERGED_POTENTIAL_INDEX ? mergedData : toPercentColumn(processedRows, i);

      return buildDataset(label, data, i, ri === 0 ? 'origin' : '-1');
    });
  }

  if (showTokens && tokenBoundaryIndices.length) {
    const boundarySet = new Set(tokenBoundaryIndices);
    datasets.forEach(ds => {
      ds.segment = {
        borderColor: ctx => (boundarySet.has(ctx.p1DataIndex) ? 'rgba(0,0,0,0)' : ds.borderColor),
      };
    });
  }

  document.getElementById('info').textContent = `Made by Charlie`;

  if (chart) chart.destroy();
  chart = new Chart(document.getElementById('chart'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      normalized: true,
      layout: { padding: { top: 18, right: 8 } },
      interaction: { mode: 'index', intersect: false, axis: 'x' },
      scales: {
        x: {
          ticks: {
            autoSkip: false,
            maxRotation: 0,
            color: '#999',
            callback(_, i) {
              const l = this.chart.data.labels[i];
              if (!/^\d+\s*pulls$/.test(l)) return null;
              const n = parseInt(l, 10);
              const tickStep = getTickStep(this.chart);
              return n % tickStep === 0 ? n : null;
            },
          },
          grid: { color: 'rgba(0,0,0,0.06)' },
        },
        y: {
          stacked: true,
          min: 0, max: 100,
          ticks: { color: '#999', font: { size: window.innerWidth < 600 ? 9 : 11 }, callback: v => v + '%' },
          grid: { color: 'rgba(0,0,0,0.06)' },
        },
      },
      plugins: {
        tooltip: {
          backgroundColor: 'rgba(255,255,255,0.96)',
          borderColor: '#ddd',
          borderWidth: 1,
          titleFont: { family: "'HarmonyOS Sans SC', system-ui", size: 12, weight: 400 },
          bodyFont: { family: "'HarmonyOS Sans SC', system-ui", size: 11 },
          titleColor: '#666',
          bodyColor: '#333',
          padding: 10,
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(4)}%`,
          },
        },
        legend: { display: false },
      },
    },
    plugins: [specialLinePlugin, hoverGuideLinePlugin, inlineLegendPlugin, tokenBoundaryConnectorPlugin],
  });
}

// Load default data
fetch('/data.txt')
  .then(r => r.ok ? r.text() : Promise.reject('no default data'))
  .then(text => render(parseData(text)))
  .catch(() => { });

document.getElementById('file-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  file.text().then(text => render(parseData(text)));
});

function setToggleButtonState(button, enabled, enabledText, disabledText) {
  const label = button.querySelector('.toggle-label');
  if (label) {
    label.textContent = enabled ? enabledText : disabledText;
  } else {
    button.textContent = enabled ? enabledText : disabledText;
  }
  button.classList.toggle('is-active', enabled);
  button.style.setProperty('--fill', enabled ? '100%' : '0%');
}

// Toggle tokens button
const toggleTokensBtn = document.getElementById('toggle-tokens-btn');
toggleTokensBtn.addEventListener('click', () => {
  showTokens = !showTokens;
  setToggleButtonState(toggleTokensBtn, showTokens, '隐藏信物', '显示信物');
  if (currentData) {
    render(currentData);
  }
});

// Toggle higher potentials button
const toggleHigherBtn = document.getElementById('toggle-higher-btn');
toggleHigherBtn.addEventListener('click', () => {
  showHigherPotentials = !showHigherPotentials;
  setToggleButtonState(toggleHigherBtn, showHigherPotentials, '隐藏更高潜能', '显示更高潜能');
  if (currentData) {
    render(currentData);
  }
});

// Initial button states
setToggleButtonState(toggleTokensBtn, showTokens, '隐藏信物', '显示信物');
setToggleButtonState(toggleHigherBtn, showHigherPotentials, '隐藏更高潜能', '显示更高潜能');
