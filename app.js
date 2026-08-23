const $ = (selector) => document.querySelector(selector);

const DEMO_RESULTS = [
  { model: "GPT-4o", hallucinations: 0, total: 20 },
  { model: "5.6 Luna", hallucinations: 2, total: 20 },
  { model: "5.6 Sol Pro", hallucinations: 7, total: 20 },
  { model: "5.6 Sol", hallucinations: 12, total: 20 },
  { model: "5.6 Terra", hallucinations: 14, total: 20 },
  { model: "GPT-5.5", hallucinations: 18, total: 20 },
];

const state = {
  rows: [],
  results: DEMO_RESULTS.map((result) => ({ ...result })),
  usingDemo: true,
  chartColors: [],
};

const COLORS = ["#0f58a9", "#1caa80", "#f6b300", "#ff7e0c", "#ef5141", "#c91e2b", "#7f32d6", "#1b8495"];

const PROVIDER_PRESETS = {
  openai: {
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
  },
  openrouter: {
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    model: "openai/gpt-4o-mini",
  },
  gemini: {
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent",
    model: "gemini-3.7-flash",
  },
  custom: {
    endpoint: "https://your-provider.example/v1/chat/completions",
    model: "your-model-name",
  },
};

const dom = {
  dropzone: $("#dropzone"),
  fileInput: $("#file-input"),
  folderInput: $("#folder-input"),
  fileList: $("#file-list"),
  fileCount: $("#file-count"),
  poster: $("#poster-frame"),
  resultState: $("#result-state"),
  toast: $("#toast"),
  chartEditor: $("#chart-editor"),
  localEvaluate: $("#local-evaluate"),
  apiEvaluate: $("#api-evaluate"),
};

function getSettings() {
  return {
    prompt: $("#prompt-input").value.trim(),
    expected: $("#answer-input").value.trim(),
    signals: $("#signals-input").value.split("\n").map((value) => value.trim().toLowerCase()).filter(Boolean),
    title: $("#title-input").value.trim() || "Evaluation results",
    subtitle: $("#subtitle-input").value.trim(),
    footer: $("#footer-input").value.trim(),
    chartTitle: $("#bar-title-input").value.trim() || "Hallucination Rate",
    chartSubtitle: $("#bar-subtitle-input").value.trim(),
    axisLabel: $("#axis-label-input").value.trim() || "Hallucination rate (%)",
  };
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeHtml(value) {
  return escapeXml(value);
}

function wrapText(value, maxChars) {
  const words = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function svgText(value, x, y, options = {}) {
  const {
    size = 16,
    fill = "#151a27",
    weight = 400,
    anchor = "start",
    family = "Arial, Helvetica, sans-serif",
    lineHeight = Math.round(size * 1.35),
    maxChars = 999,
    letterSpacing = 0,
  } = options;
  const lines = Array.isArray(value) ? value : wrapText(value, maxChars);
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="${family}" font-size="${size}px" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${letterSpacing}px">${lines.map((line, index) => `<tspan x="${x}" dy="${index ? lineHeight : 0}">${escapeXml(line)}</tspan>`).join("")}</text>`;
}

function modelFromMetadata(metadata) {
  const match = metadata.match(/(?:openai|anthropic|google|meta|xai)[/:]([A-Za-z0-9._-]+)/i);
  if (!match) return "";
  const id = match[1].toLowerCase();
  if (id.includes("5.6-luna")) return "5.6 Luna";
  if (id.includes("5.6-sol-pro")) return "5.6 Sol Pro";
  if (id.includes("5.6-sol")) return "5.6 Sol";
  if (id.includes("5.6-terra")) return "5.6 Terra";
  if (id.includes("gpt-5.5")) return "GPT-5.5";
  if (id.includes("gpt-4o")) return "GPT-4o";
  return id.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function modelFromFilename(filename) {
  const lower = filename.toLowerCase();
  if (lower.includes("5.6solpro") || lower.includes("5.6solpri")) return "5.6 Sol Pro";
  if (lower.includes("5.6sol")) return "5.6 Sol";
  if (lower.includes("5.6terra")) return "5.6 Terra";
  if (lower.includes("5.6luna")) return "5.6 Luna";
  if (lower.startsWith("5.5")) return "GPT-5.5";
  if (lower.trimStart().startsWith("4o")) return "GPT-4o";
  const baseName = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return baseName.replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Imported HTML";
}

function readableDocumentText(documentFromFile) {
  const candidates = [
    documentFromFile.querySelector("main"),
    documentFromFile.querySelector('[role="main"]'),
    documentFromFile.querySelector("article"),
    documentFromFile.body,
  ].filter(Boolean);
  let bestText = "";
  candidates.forEach((candidate) => {
    const clone = candidate.cloneNode(true);
    clone.querySelectorAll("script, style, noscript, template, svg, canvas, nav, header, footer").forEach((element) => element.remove());
    const text = clone.textContent?.replace(/\s+/g, " ").trim() || "";
    if (text.length > bestText.length) bestText = text;
  });
  return bestText.slice(0, 18000);
}

function parseExport(html, filename, index) {
  const documentFromFile = new DOMParser().parseFromString(html, "text/html");
  // Do not accidentally import the builder itself when the repository folder is selected.
  if (documentFromFile.querySelector("#dropzone") && documentFromFile.querySelector("#poster-frame")) return null;
  const userMessage = documentFromFile.querySelector("article.message.user .message-content, .message.user .message-content");
  const assistantMessage = documentFromFile.querySelector("article.message.assistant .message-content, .message.assistant .message-content");
  const metadata = documentFromFile.querySelector("article.message.assistant header span, .message.assistant header span")?.textContent || "";
  const prompt = userMessage?.textContent?.trim() || getSettings().prompt;
  const answer = assistantMessage?.textContent?.replace(/\s+/g, " ").trim() || readableDocumentText(documentFromFile);
  if (!answer) return null;
  return {
    id: `${index}-${filename}`,
    fileName: filename,
    model: modelFromMetadata(metadata) || modelFromFilename(filename),
    prompt,
    answer,
    metadata: metadata.trim() || documentFromFile.title?.trim() || "Generic HTML document",
  };
}

async function parseFiles(fileList) {
  const htmlFiles = [...fileList].filter((file) => /\.html?$/i.test(file.name));
  const parsed = await Promise.all(htmlFiles.map(async (file, index) => {
    const html = await file.text();
    return parseExport(html, file.name, index);
  }));
  return parsed.filter(Boolean);
}

function localEvaluate(rows) {
  const signals = getSettings().signals;
  return rows.map((row) => {
    const answer = row.answer.toLowerCase();
    if (!answer) return { ...row, status: "uncertain", reason: "No assistant answer was found." };
    const matched = signals.find((signal) => answer.includes(signal));
    if (matched) {
      return { ...row, status: "correct", reason: `Matched correct signal: “${matched}”.` };
    }
    return { ...row, status: "hallucination", reason: "No configured correct signal was found in the answer." };
  });
}

function groupEvaluations(rows) {
  const grouped = new Map();
  rows.forEach((row) => {
    const model = row.model || "Unknown model";
    if (!grouped.has(model)) grouped.set(model, { model, hallucinations: 0, total: 0, correct: 0, uncertain: 0 });
    const group = grouped.get(model);
    group.total += 1;
    if (row.status === "hallucination") group.hallucinations += 1;
    if (row.status === "correct") group.correct += 1;
    if (row.status === "uncertain") group.uncertain += 1;
  });
  return [...grouped.values()];
}

function formatPercent(value) {
  return `${Math.round(value)}%`;
}

function getBarColor(index) {
  return state.chartColors[index] || COLORS[index % COLORS.length];
}

function buildChartSvg(results, settings) {
  const width = 1200;
  const height = 760;
  const titleLines = wrapText(settings.title, 62);
  const subtitleLines = wrapText(settings.subtitle, 105).slice(0, 2);
  const promptLines = wrapText(settings.prompt, 34).slice(0, 3);
  const expectedLines = wrapText(settings.expected, 40).slice(0, 3);
  const chartTitleY = 332;
  // Keep enough breathing room below the chart heading for the labels on 100% bars.
  const chartTop = 410;
  const chartBottom = 620;
  const plotLeft = 124;
  const plotRight = 1118;
  const plotHeight = chartBottom - chartTop;
  const step = results.length ? (plotRight - plotLeft) / results.length : 160;
  const barWidth = Math.min(82, Math.max(42, step * .46));
  const maxLabels = results.length > 9 ? 14 : 18;
  const gradientDefs = results.map((_, index) => {
    const color = getBarColor(index);
    return `<linearGradient id="bar-${index}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity=".82"/></linearGradient>`;
  }).join("");

  const grid = [0, 20, 40, 60, 80, 100].map((tick) => {
    const y = chartBottom - (tick / 100) * plotHeight;
    return `<line x1="${plotLeft}" y1="${y}" x2="${plotRight}" y2="${y}" stroke="#d8dbe1" stroke-width="1" stroke-dasharray="4 5"/>${svgText(`${tick}%`, plotLeft - 17, y + 5, { size: 13, fill: "#4c5360", anchor: "end", maxChars: 8 })}`;
  }).join("");

  const bars = results.map((result, index) => {
    const percent = result.total ? (result.hallucinations / result.total) * 100 : 0;
    const barScale = Math.max(60, Math.min(Number(result.heightScale) || 100, 140));
    const barHeight = Math.min(plotHeight, Math.max(percent ? (percent / 100) * plotHeight * (barScale / 100) : 2, 2));
    const x = plotLeft + step * index + (step - barWidth) / 2;
    const y = chartBottom - barHeight;
    const center = x + barWidth / 2;
    const labelLines = wrapText(result.model, maxLabels).slice(0, 2);
    const countY = Math.max(y - 25, chartTop - 25);
    const percentY = Math.max(y - 5, chartTop - 5);
    return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="url(#bar-${index})" rx="1"/>${svgText(`${result.hallucinations}/${result.total}`, center, countY, { size: 16, weight: 700, anchor: "middle", maxChars: 20 })}${svgText(formatPercent(percent), center, percentY, { size: 16, weight: 700, fill: getBarColor(index), anchor: "middle", maxChars: 20 })}${svgText(labelLines, center, chartBottom + 31, { size: 13, fill: "#252a34", anchor: "middle", lineHeight: 18, maxChars: maxLabels })}`;
  }).join("");

  const titleMarkup = svgText(titleLines, 600, 57, { size: 27, weight: 700, anchor: "middle", family: "Arial, Helvetica, sans-serif", lineHeight: 31, maxChars: 999 });
  const subtitleMarkup = svgText(subtitleLines, 55, 112, { size: 15, fill: "#424957", lineHeight: 21, maxChars: 999 });
  const promptMarkup = svgText(promptLines, 230, 206, { size: 16, weight: 700, lineHeight: 23, maxChars: 999 });
  const expectedMarkup = svgText(expectedLines, 762, 205, { size: 14, fill: "#323947", lineHeight: 21, maxChars: 999 });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(settings.title)}">
  <defs>${gradientDefs}</defs>
  <rect width="1200" height="760" fill="#ffffff"/>
  ${titleMarkup}
  ${subtitleMarkup}
  <rect x="55" y="145" width="1090" height="125" rx="15" fill="#ffffff" stroke="#d9dde5" stroke-width="1.5"/>
  <path d="M82 177h36c7 0 12 5 12 12v18c0 7-5 12-12 12h-14l-14 11v-11h-8c-7 0-12-5-12-12v-18c0-7 5-12 12-12Z" fill="none" stroke="#5535d4" stroke-width="3"/>
  <path d="M106 213h35c7 0 12 5 12 12v14c0 7-5 12-12 12h-8v10l-14-10h-13c-7 0-12-5-12-12v-2" fill="#cfc5ff" opacity=".8"/>
  ${svgText("?", 100, 211, { size: 31, weight: 700, fill: "#5535d4", anchor: "middle", maxChars: 3 })}
  <line x1="182" y1="164" x2="182" y2="251" stroke="#7965e2" stroke-width="2"/>
  ${svgText("TEST PROMPT", 218, 181, { size: 13, weight: 700, fill: "#5535d4", letterSpacing: 1.1, maxChars: 20 })}
  ${promptMarkup}
  <line x1="704" y1="164" x2="704" y2="251" stroke="#d8dbe1" stroke-width="1" stroke-dasharray="4 4"/>
  ${svgText("EXPECTED TRUTH", 752, 181, { size: 13, weight: 700, fill: "#5535d4", letterSpacing: 1.1, maxChars: 30 })}
  ${expectedMarkup}
  <rect x="25" y="292" width="1150" height="400" rx="15" fill="#ffffff" stroke="#d9dde5" stroke-width="1.5"/>
  ${svgText(settings.chartTitle, 600, chartTitleY, { size: 24, weight: 700, anchor: "middle", maxChars: 45 })}
  ${svgText(settings.chartSubtitle, 600, chartTitleY + 27, { size: 14, fill: "#626a78", anchor: "middle", maxChars: 65 })}
  <line x1="${plotLeft}" y1="${chartTop}" x2="${plotLeft}" y2="${chartBottom}" stroke="#171b24" stroke-width="2"/>
  <line x1="${plotLeft}" y1="${chartBottom}" x2="${plotRight}" y2="${chartBottom}" stroke="#171b24" stroke-width="2"/>
  ${grid}
  ${bars}
  <text x="48" y="500" transform="rotate(-90 48 500)" fill="#303642" font-family="Arial, Helvetica, sans-serif" font-size="13px" text-anchor="middle">${escapeXml(settings.axisLabel)}</text>
  ${svgText(settings.footer, 55, 738, { size: 11, fill: "#6b7280", maxChars: 130 })}
  </svg>`;
}

function syncChartColors() {
  state.chartColors = state.results.map((_, index) => state.chartColors[index] || COLORS[index % COLORS.length]);
}

function renderChartEditor() {
  if (!state.results.length) {
    dom.chartEditor.innerHTML = `<div class="file-empty">Add a bar to start building the chart.</div>`;
    return;
  }
  dom.chartEditor.innerHTML = state.results.map((result, index) => `<div class="bar-editor-row" data-row="${index}">
    <div class="bar-editor-top">
      <span class="bar-editor-index"><span class="bar-color-swatch" style="background:${getBarColor(index)}"></span> Bar ${index + 1}</span>
      <span class="bar-editor-actions">
        <button class="icon-button" type="button" data-action="up" data-index="${index}" aria-label="Move bar up">↑</button>
        <button class="icon-button" type="button" data-action="down" data-index="${index}" aria-label="Move bar down">↓</button>
        <button class="icon-button danger" type="button" data-action="delete" data-index="${index}" aria-label="Delete bar">×</button>
      </span>
    </div>
    <div class="bar-editor-grid">
      <input class="field" type="text" data-field="model" data-index="${index}" value="${escapeHtml(result.model)}" aria-label="Bar ${index + 1} label" />
      <input class="field" type="number" min="0" max="999999" step="1" data-field="hallucinations" data-index="${index}" value="${result.hallucinations}" aria-label="Bar ${index + 1} hallucinations" />
      <input class="field" type="number" min="1" max="999999" step="1" data-field="total" data-index="${index}" value="${result.total}" aria-label="Bar ${index + 1} total" />
      <input class="field" type="color" data-field="color" data-index="${index}" value="${getBarColor(index)}" aria-label="Bar ${index + 1} color" />
    </div>
    <div class="bar-height-control">
      <label for="bar-height-${index}">Visual height <output id="bar-height-value-${index}">${result.heightScale || 100}%</output></label>
      <input id="bar-height-${index}" type="range" min="60" max="140" step="5" data-field="heightScale" data-index="${index}" value="${result.heightScale || 100}" aria-label="Bar ${index + 1} visual height" />
    </div>
  </div>`).join("");
}

function render() {
  const settings = getSettings();
  syncChartColors();
  dom.poster.innerHTML = buildChartSvg(state.results, settings);
  dom.fileCount.textContent = state.usingDemo ? "Demo" : state.rows.length ? `${state.rows.length} files` : "Manual";
  const total = state.results.reduce((sum, item) => sum + item.total, 0);
  const hallucinations = state.results.reduce((sum, item) => sum + item.hallucinations, 0);
  const percent = total ? Math.round((hallucinations / total) * 100) : 0;
  dom.resultState.innerHTML = `<span class="status-dot"></span> ${state.usingDemo ? "Demo results" : `${state.results.length} models · ${percent}% overall`}`;
  renderChartEditor();
}

function renderFileList() {
  if (!state.rows.length) {
    dom.fileList.innerHTML = `<div class="file-empty">No uploads yet. The preview is showing demo data.</div>`;
    return;
  }
  const visible = state.rows.slice(0, 30);
  dom.fileList.innerHTML = visible.map((row) => `<div class="file-item" title="${escapeHtml(row.fileName)}"><span>${escapeHtml(row.fileName)}</span></div>`).join("");
  if (state.rows.length > visible.length) {
    dom.fileList.insertAdjacentHTML("beforeend", `<div class="file-empty">+ ${state.rows.length - visible.length} more files</div>`);
  }
}

function showToast(message, isError = false) {
  dom.toast.textContent = message;
  dom.toast.classList.toggle("error", isError);
}

function applyChartDataChange(event) {
  const field = event.target.dataset.field;
  const index = Number(event.target.dataset.index);
  if (!field || !Number.isInteger(index) || !state.results[index]) return;
  const result = state.results[index];
  state.usingDemo = false;
  if (field === "model") result.model = event.target.value.trim() || "Unnamed model";
  if (field === "hallucinations") result.hallucinations = Math.min(Math.max(Number(event.target.value) || 0, 0), result.total);
  if (field === "total") {
    result.total = Math.max(Number(event.target.value) || 1, 1);
    result.hallucinations = Math.min(result.hallucinations, result.total);
  }
  if (field === "color" && /^#[0-9a-f]{6}$/i.test(event.target.value)) state.chartColors[index] = event.target.value;
  if (field === "heightScale") result.heightScale = Math.max(60, Math.min(Number(event.target.value) || 100, 140));
  render();
  showToast("Chart data updated.");
}

function moveChartRow(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= state.results.length) return;
  [state.results[index], state.results[target]] = [state.results[target], state.results[index]];
  [state.chartColors[index], state.chartColors[target]] = [state.chartColors[target], state.chartColors[index]];
  state.usingDemo = false;
  render();
}

function addChartRow() {
  state.results.push({ model: "New model", hallucinations: 0, total: 20, correct: 20, uncertain: 0 });
  state.chartColors.push(COLORS[(state.results.length - 1) % COLORS.length]);
  state.usingDemo = false;
  render();
  showToast("New bar added.");
}

function deleteChartRow(index) {
  if (state.results.length <= 1) {
    showToast("Keep at least one bar in the chart.", true);
    return;
  }
  state.results.splice(index, 1);
  state.chartColors.splice(index, 1);
  state.usingDemo = false;
  render();
  showToast("Bar removed.");
}

async function handleFiles(fileList) {
  const files = [...fileList].filter((file) => /\.html?$/i.test(file.name));
  if (!files.length) {
    showToast("Please choose one or more .html files.", true);
    return;
  }
  showToast(`Reading ${files.length} HTML export${files.length === 1 ? "" : "s"}…`);
  try {
    const rows = await parseFiles(files);
    if (!rows.length) throw new Error("No readable HTML content was found in those files.");
    state.rows = rows;
    state.usingDemo = false;
    state.results = groupEvaluations(localEvaluate(rows));
    state.chartColors = [];
    renderFileList();
    render();
    showToast(`Parsed ${rows.length} response${rows.length === 1 ? "" : "s"}. Local evaluation is ready.`);
  } catch (error) {
    showToast(error.message || "Could not read those files.", true);
  }
}

async function collectDirectoryFiles(directoryHandle, files = []) {
  for await (const entry of directoryHandle.values()) {
    if (entry.kind === "file") {
      files.push(await entry.getFile());
    } else if (entry.kind === "directory") {
      await collectDirectoryFiles(entry, files);
    }
  }
  return files;
}

async function chooseFolder() {
  if (typeof window.showDirectoryPicker === "function" && window.isSecureContext) {
    try {
      const directoryHandle = await window.showDirectoryPicker({ mode: "read" });
      showToast("Reading the selected folder…");
      const files = await collectDirectoryFiles(directoryHandle);
      await handleFiles(files);
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
      showToast(error.message || "Could not read that folder.", true);
      return;
    }
  }
  dom.folderInput.click();
}

function readEntry(entry) {
  return new Promise((resolve, reject) => {
    if (entry.isFile) {
      entry.file((file) => resolve([file]), reject);
      return;
    }
    const reader = entry.createReader();
    const entries = [];
    const readBatch = () => reader.readEntries(async (batch) => {
      if (!batch.length) {
        try {
          const nestedFiles = [];
          for (const child of entries) nestedFiles.push(...await readEntry(child));
          resolve(nestedFiles);
        } catch (error) {
          reject(error);
        }
        return;
      }
      entries.push(...batch);
      readBatch();
    }, reject);
    readBatch();
  });
}

async function readDroppedFiles(dataTransfer) {
  const entries = [...(dataTransfer.items || [])]
    .map((item) => item.webkitGetAsEntry?.())
    .filter(Boolean);
  if (!entries.length) return [...dataTransfer.files];
  const nested = await Promise.all(entries.map((entry) => readEntry(entry)));
  return nested.flat();
}

function setBusy(button, busy, label) {
  if (!button.dataset.originalLabel) button.dataset.originalLabel = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? label : button.dataset.originalLabel;
}

function parseApiContent(content) {
  const cleaned = String(content || "").replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const objectStart = cleaned.indexOf("{");
  const objectEnd = cleaned.lastIndexOf("}");
  if (objectStart < 0 || objectEnd < objectStart) throw new Error("The evaluator did not return JSON.");
  return JSON.parse(cleaned.slice(objectStart, objectEnd + 1));
}

function buildProviderRequest(provider, endpoint, apiKey, model, instruction) {
  if (provider === "gemini") {
    const url = new URL(endpoint);
    url.searchParams.set("key", apiKey);
    return {
      url: url.toString(),
      headers: { "Content-Type": "application/json" },
      body: {
        contents: [{ role: "user", parts: [{ text: instruction }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      },
    };
  }
  return {
    url: endpoint,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: { model, temperature: 0, messages: [{ role: "user", content: instruction }] },
  };
}

function readProviderResponse(provider, data) {
  if (provider === "gemini") {
    return data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  }
  const content = data?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) return content.map((part) => typeof part === "string" ? part : part.text || "").join("");
  return content || "";
}

async function evaluateWithApi() {
  if (!state.rows.length) {
    showToast("Upload HTML exports before using the API evaluator.", true);
    return;
  }
  const provider = $("#api-provider").value;
  const apiKey = $("#api-key").value.trim();
  const endpoint = $("#api-endpoint").value.trim();
  const model = $("#api-model").value.trim();
  if (!apiKey || !endpoint || !model) {
    $(".api-details").open = true;
    showToast("Add an API key, endpoint, and model first.", true);
    return;
  }
  const settings = getSettings();
  const batchSize = 14;
  const batches = [];
  for (let index = 0; index < state.rows.length; index += batchSize) batches.push(state.rows.slice(index, index + batchSize));
  setBusy(dom.apiEvaluate, true, "Evaluating…");
  showToast(`Sending ${state.rows.length} response${state.rows.length === 1 ? "" : "s"} in ${batches.length} batch${batches.length === 1 ? "" : "es"}…`);
  try {
    const allEvaluations = [];
    for (const batch of batches) {
      const items = batch.map((row) => ({ id: row.id, model: row.model, prompt: row.prompt, answer: row.answer }));
      const instruction = `You are a rigorous evaluator of AI answers. The test prompt is:\n${settings.prompt}\n\nThe expected truth is:\n${settings.expected}\n\nClassify every response as exactly one of: correct, hallucination, uncertain. A response is a hallucination when it confidently invents facts instead of following the expected truth. Return ONLY valid JSON in this shape: {"evaluations":[{"id":"...","status":"correct|hallucination|uncertain","reason":"brief explanation"}]}. Preserve each id exactly.\n\nResponses to classify:\n${JSON.stringify(items)}`;
      const request = buildProviderRequest(provider, endpoint, apiKey, model, instruction);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);
      let response;
      try {
        response = await fetch(request.url, {
          method: "POST",
          signal: controller.signal,
          headers: request.headers,
          body: JSON.stringify(request.body),
        });
      } finally {
        clearTimeout(timeout);
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message || `Evaluator returned HTTP ${response.status}.`);
      const parsed = parseApiContent(readProviderResponse(provider, data));
      if (!Array.isArray(parsed.evaluations)) throw new Error("The evaluator response did not include an evaluations array.");
      allEvaluations.push(...parsed.evaluations);
    }
    const byId = new Map(allEvaluations.map((item) => [String(item.id), item]));
    const evaluatedRows = state.rows.map((row) => {
      const evaluation = byId.get(String(row.id));
      const status = ["correct", "hallucination", "uncertain"].includes(evaluation?.status) ? evaluation.status : "uncertain";
      return { ...row, status, reason: evaluation?.reason || "The evaluator did not return a result for this response." };
    });
    state.results = groupEvaluations(evaluatedRows);
    render();
    showToast("API evaluation complete. Review the chart, then export it.");
  } catch (error) {
    const message = error.name === "AbortError" ? "The API request timed out." : error.message;
    showToast(`${message} If this is a browser CORS error, use an OpenAI-compatible endpoint that permits browser requests or add a Vercel proxy later.`, true);
  } finally {
    setBusy(dom.apiEvaluate, false);
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getSvgString() {
  const svg = dom.poster.querySelector("svg");
  if (!svg) throw new Error("The chart preview is not ready yet.");
  return `<?xml version="1.0" encoding="UTF-8"?>\n${svg.outerHTML}`;
}

function downloadSvg() {
  try {
    downloadBlob(new Blob([getSvgString()], { type: "image/svg+xml;charset=utf-8" }), "phantom-chart.svg");
    showToast("SVG downloaded.");
  } catch (error) {
    showToast(error.message, true);
  }
}

function downloadPng() {
  try {
    const svgString = getSvgString();
    const blobUrl = URL.createObjectURL(new Blob([svgString], { type: "image/svg+xml;charset=utf-8" }));
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 2400;
      canvas.height = 1520;
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) downloadBlob(blob, "phantom-chart.png");
        URL.revokeObjectURL(blobUrl);
      }, "image/png");
    };
    image.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      showToast("Could not render the PNG. SVG is still available.", true);
    };
    image.src = blobUrl;
    showToast("Rendering PNG…");
  } catch (error) {
    showToast(error.message, true);
  }
}

function printPdf() {
  try {
    const printWindow = window.open("", "_blank", "width=1200,height=900");
    if (!printWindow) throw new Error("The print window was blocked. Allow pop-ups and try again.");
    printWindow.document.write(`<!doctype html><html><head><title>Phantom Chart</title><style>html,body{margin:0;background:#fff}svg{display:block;width:100%;height:auto}@page{size:A4 landscape;margin:10mm}</style></head><body>${getSvgString()}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 350);
    showToast("Print dialog opened. Choose “Save as PDF” to create the PDF.");
  } catch (error) {
    showToast(error.message, true);
  }
}

function applyProviderPreset() {
  const provider = $("#api-provider").value;
  const preset = PROVIDER_PRESETS[provider];
  if (!preset) return;
  $("#api-endpoint").value = preset.endpoint;
  $("#api-model").value = preset.model;
  $("#api-key").placeholder = provider === "gemini" ? "Paste your Gemini API key" : "Paste your provider API key";
}

$("#choose-files").addEventListener("click", () => dom.fileInput.click());
$("#choose-folder").addEventListener("click", chooseFolder);
dom.fileInput.addEventListener("change", (event) => handleFiles(event.target.files));
dom.folderInput.addEventListener("change", (event) => handleFiles(event.target.files));
$("#clear-files").addEventListener("click", () => {
  state.rows = [];
  state.results = DEMO_RESULTS.map((result) => ({ ...result }));
  state.usingDemo = true;
  state.chartColors = [];
  dom.fileInput.value = "";
  dom.folderInput.value = "";
  renderFileList();
  render();
  showToast("Uploads cleared. Showing demo data.");
});

dom.dropzone.addEventListener("click", (event) => {
  if (!event.target.closest("button")) dom.fileInput.click();
});
dom.dropzone.addEventListener("keydown", (event) => {
  if ((event.key === "Enter" || event.key === " ") && event.target === dom.dropzone) {
    event.preventDefault();
    dom.fileInput.click();
  }
});
["dragenter", "dragover"].forEach((eventName) => dom.dropzone.addEventListener(eventName, (event) => {
  event.preventDefault();
  dom.dropzone.classList.add("is-dragging");
}));
["dragleave", "drop"].forEach((eventName) => dom.dropzone.addEventListener(eventName, (event) => {
  event.preventDefault();
  dom.dropzone.classList.remove("is-dragging");
}));
dom.dropzone.addEventListener("drop", async (event) => {
  try {
    const files = await readDroppedFiles(event.dataTransfer);
    await handleFiles(files);
  } catch (error) {
    showToast(error.message || "Could not read the dropped files.", true);
  }
});
dom.localEvaluate.addEventListener("click", () => {
  if (!state.rows.length) {
    showToast("Upload HTML files first. The preview demo is already evaluated.", true);
    return;
  }
  state.results = groupEvaluations(localEvaluate(state.rows));
  render();
  showToast("Local evaluation complete.");
});
$("#api-provider").addEventListener("change", applyProviderPreset);
dom.apiEvaluate.addEventListener("click", evaluateWithApi);
dom.chartEditor.addEventListener("input", (event) => {
  if (event.target.dataset.field !== "heightScale") return;
  const output = document.querySelector(`#bar-height-value-${event.target.dataset.index}`);
  if (output) output.textContent = `${event.target.value}%`;
});
dom.chartEditor.addEventListener("change", applyChartDataChange);
dom.chartEditor.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const index = Number(button.dataset.index);
  if (button.dataset.action === "up") moveChartRow(index, -1);
  if (button.dataset.action === "down") moveChartRow(index, 1);
  if (button.dataset.action === "delete") deleteChartRow(index);
});
$("#add-bar-row").addEventListener("click", addChartRow);
$("#download-svg").addEventListener("click", downloadSvg);
$("#download-png").addEventListener("click", downloadPng);
$("#print-pdf").addEventListener("click", printPdf);
["#title-input", "#subtitle-input", "#prompt-input", "#answer-input", "#footer-input", "#bar-title-input", "#bar-subtitle-input", "#axis-label-input"].forEach((selector) => $(selector).addEventListener("input", render));

renderFileList();
render();
