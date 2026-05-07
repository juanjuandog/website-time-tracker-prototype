const els = {
  datePicker: document.querySelector("#datePicker"),
  viewTabs: [...document.querySelectorAll(".viewTab")],
  toggleBtn: document.querySelector("#toggleBtn"),
  exportMd: document.querySelector("#exportMd"),
  warning: document.querySelector("#permissionWarning"),
  focusLabel: document.querySelector("#focusLabel"),
  totalTime: document.querySelector("#totalTime"),
  currentSite: document.querySelector("#currentSite"),
  currentTitle: document.querySelector("#currentTitle"),
  domainList: document.querySelector("#domainList"),
  pageList: document.querySelector("#pageList"),
  pieChart: document.querySelector("#pieChart"),
  donutSvg: document.querySelector("#donutSvg"),
  categoryDonutSvg: document.querySelector("#categoryDonutSvg"),
  chartLegend: document.querySelector("#chartLegend"),
  categoryLegend: document.querySelector("#categoryLegend"),
  chartTotal: document.querySelector("#chartTotal"),
  chartLabel: document.querySelector("#chartLabel"),
  categoryChartTotal: document.querySelector("#categoryChartTotal"),
  categoryChartLabel: document.querySelector("#categoryChartLabel"),
  dateText: document.querySelector("#dateText"),
  domainCount: document.querySelector("#domainCount"),
  pageCount: document.querySelector("#pageCount"),
  statusDot: document.querySelector("#statusDot"),
  statusText: document.querySelector("#statusText"),
  categoryRuleForm: document.querySelector("#categoryRuleForm"),
  rulePattern: document.querySelector("#rulePattern"),
  ruleCategory: document.querySelector("#ruleCategory"),
  categoryRules: document.querySelector("#categoryRules")
};

const chartColors = [
  "#ef9b72",
  "#f0c66e",
  "#79c98c",
  "#78a8d8",
  "#d99bc9",
  "#b59ae0",
  "#dfa86a",
  "#6fc7bd",
  "#f08f9d",
  "#93b76d",
  "#88a0e0",
  "#d4a66f",
  "#9dc7a6",
  "#c58dd6",
  "#e7b85f",
  "#71b3df"
];
const API_BASE = location.protocol.startsWith("http") ? "" : "http://127.0.0.1:4174";
let hoveredChartIndex = null;
let hoveredCategoryIndex = null;
let currentView = "day";
let settings = null;

els.datePicker.value = localDateKey();
els.datePicker.addEventListener("change", refresh);
els.viewTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    currentView = tab.dataset.view;
    els.viewTabs.forEach((item) => item.classList.toggle("active", item === tab));
    hoveredChartIndex = null;
    hoveredCategoryIndex = null;
    refresh();
  });
});
els.toggleBtn.addEventListener("click", async () => {
  await fetch(`${API_BASE}/api/toggle`, { method: "POST" });
  await refresh();
});

els.categoryRuleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!settings) return;
  const pattern = els.rulePattern.value.trim().toLowerCase();
  const category = els.ruleCategory.value;
  if (!pattern || !category) return;
  const categoryRules = [
    { pattern, category },
    ...settings.categoryRules.filter((rule) => rule.pattern !== pattern)
  ];
  await saveSettings({ ...settings, categoryRules });
  els.rulePattern.value = "";
  await refresh();
});
function formatDuration(totalSeconds = 0) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`;
  if (minutes > 0) return `${minutes} 分钟`;
  return `${seconds} 秒`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderList(container, items, total, mode) {
  if (!items.length) {
    container.innerHTML = '<div class="empty">还没有记录。</div>';
    return;
  }
  container.innerHTML = items
    .slice(0, 12)
    .map((item) => {
      const percent = total > 0 ? Math.max(3, Math.round((item.durationSeconds / total) * 100)) : 0;
      const title = mode === "domain" ? item.key : item.title || item.key;
      const detail = mode === "domain" ? `${item.visits} 次记录` : item.url || item.app;
      return `
        <div class="row">
          <div>
            <div class="title" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
            <div class="url" title="${escapeHtml(detail)}">${escapeHtml(detail)}</div>
          </div>
          <div class="time">${formatDuration(item.durationSeconds)}</div>
          <div class="bar"><i style="--w:${percent}%"></i></div>
        </div>
      `;
    })
    .join("");
}

function renderCategoryLegend(items, total) {
  if (!items.length || total <= 0) {
    els.categoryLegend.innerHTML = '<div class="empty">还没有分类记录。</div>';
    return;
  }
  els.categoryLegend.innerHTML = items
    .map((item, index) => {
      const percent = Math.round((item.durationSeconds / total) * 100);
      return `
        <button class="legendItem categoryItem${hoveredCategoryIndex === index ? " active" : ""}" data-index="${index}" type="button">
          <span class="legendSwatch" style="--color:${chartColors[index]}"></span>
          <span class="legendName">${escapeHtml(item.key)}</span>
          <span class="legendTime">${percent}% · ${formatDuration(item.durationSeconds)}</span>
        </button>
      `;
    })
    .join("");
}

function renderCategoryPie(items, total) {
  if (!items.length || total <= 0) {
    els.categoryDonutSvg.innerHTML = "";
    els.categoryChartTotal.textContent = "0 分钟";
    els.categoryChartLabel.textContent = "暂无记录";
    els.categoryLegend.innerHTML = '<div class="empty">还没有分类记录。</div>';
    return;
  }

  let cursor = 0;
  const segments = items.map((item, index) => {
    const start = cursor;
    const end = cursor + (item.durationSeconds / total) * 360;
    cursor = end;
    return { item, index, start, end, color: chartColors[index] || "#eadfce" };
  });

  if (hoveredCategoryIndex !== null && hoveredCategoryIndex >= items.length) {
    hoveredCategoryIndex = null;
  }

  els.categoryDonutSvg.innerHTML = segments
    .map((segment) => {
      const active = hoveredCategoryIndex === segment.index;
      const dimmed = hoveredCategoryIndex !== null && !active;
      return `<path class="donutSegment${active ? " active" : ""}${dimmed ? " dimmed" : ""}" data-index="${segment.index}" d="${donutPath(120, 120, 74, 112, segment.start, segment.end)}" fill="${segment.color}"></path>`;
    })
    .join("");

  els.categoryDonutSvg.querySelectorAll(".donutSegment").forEach((segment) => {
    segment.addEventListener("mouseenter", () => setCategoryHover(Number(segment.dataset.index), items, total));
    segment.addEventListener("mouseleave", () => setCategoryHover(null, items, total));
    segment.addEventListener("focus", () => setCategoryHover(Number(segment.dataset.index), items, total));
    segment.addEventListener("blur", () => setCategoryHover(null, items, total));
  });

  updateCategoryCenter(items, total);
  renderCategoryLegend(items, total);

  els.categoryLegend.querySelectorAll(".legendItem").forEach((item) => {
    item.addEventListener("mouseenter", () => setCategoryHover(Number(item.dataset.index), items, total));
    item.addEventListener("mouseleave", () => setCategoryHover(null, items, total));
    item.addEventListener("focus", () => setCategoryHover(Number(item.dataset.index), items, total));
    item.addEventListener("blur", () => setCategoryHover(null, items, total));
  });
}

function renderRuleEditor(nextSettings) {
  settings = nextSettings;
  const categories = settings.categories || ["学习", "娱乐", "社交", "其他"];
  const selectedCategory = els.ruleCategory.value;
  els.ruleCategory.innerHTML = categories
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
    .join("");
  if (categories.includes(selectedCategory)) {
    els.ruleCategory.value = selectedCategory;
  }
  els.categoryRules.innerHTML = (settings.categoryRules || [])
    .map((rule) => `
      <div class="ruleChip">
        <span title="${escapeHtml(rule.pattern)}">${escapeHtml(rule.pattern)}</span>
        <strong>${escapeHtml(rule.category)}</strong>
        <button type="button" data-pattern="${escapeHtml(rule.pattern)}" title="删除" aria-label="删除 ${escapeHtml(rule.pattern)}">×</button>
      </div>
    `)
    .join("");

  els.categoryRules.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", async () => {
      const pattern = button.dataset.pattern;
      const categoryRules = settings.categoryRules.filter((rule) => rule.pattern !== pattern);
      await saveSettings({ ...settings, categoryRules });
      await refresh();
    });
  });
}

async function saveSettings(nextSettings) {
  const res = await fetch(`${API_BASE}/api/settings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(nextSettings)
  });
  settings = await res.json();
  renderRuleEditor(settings);
}

function renderPie(items, total) {
  if (!items.length || total <= 0) {
    els.donutSvg.innerHTML = "";
    els.chartTotal.textContent = "0 分钟";
    els.chartLabel.textContent = "暂无记录";
    els.chartLegend.innerHTML = '<div class="empty">还没有记录。</div>';
    return;
  }

  let cursor = 0;
  const visibleItems = [...items];
  let otherSeconds = 0;
  const otherLimitSeconds = total * 0.05;
  while (visibleItems.length > 1) {
    const candidate = visibleItems[visibleItems.length - 1];
    if (otherSeconds + candidate.durationSeconds > otherLimitSeconds) break;
    otherSeconds += candidate.durationSeconds;
    visibleItems.pop();
  }
  const chartItems = otherSeconds > 0
    ? [...visibleItems, { key: "其他", durationSeconds: otherSeconds, visits: 0 }]
    : visibleItems;
  const segments = chartItems.map((item, index) => {
    const start = cursor;
    const end = cursor + (item.durationSeconds / total) * 360;
    cursor = end;
    return { item, index, start, end, color: chartColors[index] || "#eadfce" };
  });

  if (hoveredChartIndex !== null && hoveredChartIndex >= chartItems.length) {
    hoveredChartIndex = null;
  }

  els.donutSvg.innerHTML = segments
    .map((segment) => {
      const active = hoveredChartIndex === segment.index;
      const dimmed = hoveredChartIndex !== null && !active;
      return `<path class="donutSegment${active ? " active" : ""}${dimmed ? " dimmed" : ""}" data-index="${segment.index}" d="${donutPath(120, 120, 74, 112, segment.start, segment.end)}" fill="${segment.color}"></path>`;
    })
    .join("");

  els.donutSvg.querySelectorAll(".donutSegment").forEach((segment) => {
    segment.addEventListener("mouseenter", () => setChartHover(Number(segment.dataset.index), chartItems, total));
    segment.addEventListener("mouseleave", () => setChartHover(null, chartItems, total));
    segment.addEventListener("focus", () => setChartHover(Number(segment.dataset.index), chartItems, total));
    segment.addEventListener("blur", () => setChartHover(null, chartItems, total));
  });

  updateChartCenter(chartItems, total);

  els.chartLegend.innerHTML = chartItems
    .map((item, index) => {
      const percent = Math.round((item.durationSeconds / total) * 100);
      return `
        <button class="legendItem${hoveredChartIndex === index ? " active" : ""}" data-index="${index}" type="button">
          <span class="legendSwatch" style="--color:${chartColors[index]}"></span>
          <span class="legendName" title="${escapeHtml(item.key)}">${escapeHtml(item.key)}</span>
          <span class="legendTime">${percent}% · ${formatDuration(item.durationSeconds)}</span>
        </button>
      `;
    })
    .join("");

  els.chartLegend.querySelectorAll(".legendItem").forEach((item) => {
    item.addEventListener("mouseenter", () => setChartHover(Number(item.dataset.index), chartItems, total));
    item.addEventListener("mouseleave", () => setChartHover(null, chartItems, total));
    item.addEventListener("focus", () => setChartHover(Number(item.dataset.index), chartItems, total));
    item.addEventListener("blur", () => setChartHover(null, chartItems, total));
  });
}

function setChartHover(index, items, total) {
  hoveredChartIndex = index;
  els.donutSvg.querySelectorAll(".donutSegment").forEach((segment) => {
    const active = Number(segment.dataset.index) === hoveredChartIndex;
    segment.classList.toggle("active", active);
    segment.classList.toggle("dimmed", hoveredChartIndex !== null && !active);
  });
  els.chartLegend.querySelectorAll(".legendItem").forEach((item) => {
    item.classList.toggle("active", Number(item.dataset.index) === hoveredChartIndex);
  });
  updateChartCenter(items, total);
}

function setCategoryHover(index, items, total) {
  hoveredCategoryIndex = index;
  els.categoryDonutSvg.querySelectorAll(".donutSegment").forEach((segment) => {
    const active = Number(segment.dataset.index) === hoveredCategoryIndex;
    segment.classList.toggle("active", active);
    segment.classList.toggle("dimmed", hoveredCategoryIndex !== null && !active);
  });
  els.categoryLegend.querySelectorAll(".legendItem").forEach((item) => {
    item.classList.toggle("active", Number(item.dataset.index) === hoveredCategoryIndex);
  });
  updateCategoryCenter(items, total);
}

function updateChartCenter(items, total) {
  const hovered = hoveredChartIndex === null ? null : items[hoveredChartIndex];
  els.chartTotal.textContent = hovered ? formatDuration(hovered.durationSeconds) : formatDuration(total);
  els.chartLabel.textContent = hovered ? hovered.key : "全部网站";
}

function updateCategoryCenter(items, total) {
  const hovered = hoveredCategoryIndex === null ? null : items[hoveredCategoryIndex];
  els.categoryChartTotal.textContent = hovered ? formatDuration(hovered.durationSeconds) : formatDuration(total);
  els.categoryChartLabel.textContent = hovered ? hovered.key : "全部分类";
}

function donutPath(cx, cy, innerRadius, outerRadius, startAngle, endAngle) {
  if (endAngle - startAngle >= 359.99) {
    endAngle = startAngle + 359.99;
  }
  const startOuter = polarToCartesian(cx, cy, outerRadius, endAngle);
  const endOuter = polarToCartesian(cx, cy, outerRadius, startAngle);
  const startInner = polarToCartesian(cx, cy, innerRadius, startAngle);
  const endInner = polarToCartesian(cx, cy, innerRadius, endAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 0 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 1 ${endInner.x} ${endInner.y}`,
    "Z"
  ].join(" ");
}

function polarToCartesian(cx, cy, radius, angleInDegrees) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians)
  };
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function refresh() {
  const date = els.datePicker.value || localDateKey();
  els.exportMd.href = `${API_BASE}/api/export.md?date=${encodeURIComponent(date)}`;
  const res = await fetch(`${API_BASE}/api/state?date=${encodeURIComponent(date)}&view=${encodeURIComponent(currentView)}`);
  const data = await res.json();
  renderRuleEditor(data.settings);
  const summary = data.summary;
  const labels = {
    day: "今日总时长",
    week: "本周总时长",
    month: "本月总时长"
  };

  els.toggleBtn.textContent = data.running ? "暂停" : "继续";
  els.toggleBtn.classList.toggle("primary", !data.running);
  els.statusDot.classList.toggle("paused", !data.running);
  els.statusText.textContent = data.idle ? "Idle" : data.running ? "Daily Web Time" : "Paused";
  els.focusLabel.textContent = labels[currentView] || "总时长";
  els.totalTime.textContent = formatDuration(summary.totalSeconds);
  els.currentSite.textContent = currentSiteText(data);
  els.currentTitle.textContent = currentTitleText(data);
  els.dateText.textContent = data.range?.start === data.range?.end ? date : `${data.range?.start} 至 ${data.range?.end}`;
  els.domainCount.textContent = `${summary.byDomain.length} 个`;
  els.pageCount.textContent = `${summary.byPage.length} 个`;
  els.chartTotal.textContent = formatDuration(summary.totalSeconds);

  if (data.lastError) {
    els.warning.classList.remove("hidden");
    els.warning.textContent = `读取当前网页失败：${data.lastError.message}。请在 macOS“系统设置 > 隐私与安全性”里给当前终端/Codex 授权“辅助功能”和“自动化”。`;
  } else {
    els.warning.classList.add("hidden");
  }

  renderList(els.domainList, summary.byDomain, summary.totalSeconds, "domain");
  renderList(els.pageList, summary.byPage, summary.totalSeconds, "page");
  renderCategoryPie(summary.byCategory, summary.totalSeconds);
  renderPie(summary.byDomain, summary.totalSeconds);
}

function currentSiteText(data) {
  if (data.idle) return "电脑空闲中";
  if (data.lastSample?.type === "ignored") return data.lastSample.domain || "已忽略";
  return data.current?.domain || data.lastSample?.domain || data.lastSample?.app || "等待采样";
}

function currentTitleText(data) {
  if (data.idle) return `超过 ${Math.round((data.idleSeconds || 0) / 60)} 分钟未操作，已暂停计时`;
  if (data.lastSample?.type === "ignored") return "已按忽略列表跳过，不会写入记录";
  return data.current?.title || data.lastSample?.title || "-";
}

refresh();
setInterval(refresh, 2500);
