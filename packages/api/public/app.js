/* global document, fetch */

const API = "/api";

// --- Helpers ---

async function apiCall(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function $(id) {
  return document.getElementById(id);
}

function show(el) {
  el.classList.add("active");
}

function hide(el) {
  el.classList.remove("active");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// --- Tab switching ---

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    const panel = $("panel-" + tab.dataset.tab);
    if (panel) panel.classList.add("active");

    if (tab.dataset.tab === "agents") loadAgents();
    if (tab.dataset.tab === "history") loadHistory();
  });
});

// --- Temperature slider ---

$("gen-temp").addEventListener("input", (e) => {
  $("gen-temp-val").textContent = e.target.value;
});

// --- Generate ---

$("gen-submit").addEventListener("click", async () => {
  const prompt = $("gen-prompt").value.trim();
  if (!prompt) return;

  const spinner = $("gen-spinner");
  const result = $("gen-result");
  const btn = $("gen-submit");

  btn.disabled = true;
  result.innerHTML = "";
  show(spinner);

  try {
    const data = await apiCall("/generate", {
      method: "POST",
      body: JSON.stringify({
        prompt,
        temperature: parseFloat($("gen-temp").value),
      }),
    });

    result.innerHTML = `
      <div class="card">
        <div class="result-header">
          <span class="badge">${escapeHtml(data.agent.name)}</span>
          <span class="badge badge--muted">${escapeHtml(data.agent.domain)}</span>
          <span style="color:var(--text-muted)">confidence: ${(data.agent.confidence * 100).toFixed(0)}%</span>
        </div>
        <pre>${escapeHtml(data.content)}</pre>
      </div>`;
  } catch (err) {
    result.innerHTML = `<div class="card"><pre style="color:var(--error)">${escapeHtml(err.message)}</pre></div>`;
  } finally {
    hide(spinner);
    btn.disabled = false;
  }
});

// --- Plan ---

$("plan-submit").addEventListener("click", async () => {
  const goal = $("plan-goal").value.trim();
  if (!goal) return;

  const spinner = $("plan-spinner");
  const result = $("plan-result");
  const btn = $("plan-submit");

  btn.disabled = true;
  result.innerHTML = "";
  show(spinner);

  try {
    const data = await apiCall("/plan", {
      method: "POST",
      body: JSON.stringify({
        goal,
        execute: $("plan-execute").checked,
        autoApprove: $("plan-approve").checked,
      }),
    });

    result.innerHTML = renderTaskGraph(data.graph, data.result);
  } catch (err) {
    result.innerHTML = `<div class="card"><pre style="color:var(--error)">${escapeHtml(err.message)}</pre></div>`;
  } finally {
    hide(spinner);
    btn.disabled = false;
  }
});

function renderTaskGraph(graph, planResult) {
  let html = `<div class="card"><h3>${escapeHtml(graph.goal)}</h3>`;

  for (const task of graph.tasks) {
    const resultInfo = planResult ? planResult.results.find((r) => r.taskId === task.id) : null;

    const statusBadge = resultInfo
      ? `<span class="badge ${resultInfo.status === "completed" ? "badge--success" : "badge--error"}">${resultInfo.status}</span>`
      : "";

    html += `
      <div class="task-node">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span class="task-id">${escapeHtml(task.id)}</span>
          ${statusBadge}
        </div>
        <span class="task-tool">${escapeHtml(task.tool)}</span>
        <div class="task-desc">${escapeHtml(task.description)}</div>
        ${task.dependsOn.length ? `<div class="task-deps">depends on: ${task.dependsOn.map(escapeHtml).join(", ")}</div>` : ""}
      </div>`;
  }

  if (planResult) {
    html += `<div style="margin-top:12px;font-size:13px">
      Result: <span class="badge ${planResult.success ? "badge--success" : "badge--error"}">${planResult.success ? "Success" : "Failed"}</span>
    </div>`;
  }

  html += "</div>";
  return html;
}

// --- Debug CI ---

$("ci-submit").addEventListener("click", async () => {
  const log = $("ci-log").value.trim();
  if (!log) return;

  const spinner = $("ci-spinner");
  const result = $("ci-result");
  const btn = $("ci-submit");

  btn.disabled = true;
  result.innerHTML = "";
  show(spinner);

  try {
    const data = await apiCall("/debug-ci", {
      method: "POST",
      body: JSON.stringify({ log }),
    });

    result.innerHTML = renderDiagnosis(data.diagnosis);
  } catch (err) {
    result.innerHTML = `<div class="card"><pre style="color:var(--error)">${escapeHtml(err.message)}</pre></div>`;
  } finally {
    hide(spinner);
    btn.disabled = false;
  }
});

function renderDiagnosis(d) {
  let html = '<div class="card">';

  html += `
    <div class="diagnosis-field">
      <div class="field-label">Error Type</div>
      <div class="field-value"><span class="badge badge--error">${escapeHtml(d.errorType)}</span></div>
    </div>
    <div class="diagnosis-field">
      <div class="field-label">Summary</div>
      <div class="field-value">${escapeHtml(d.summary)}</div>
    </div>
    <div class="diagnosis-field">
      <div class="field-label">Root Cause</div>
      <div class="field-value">${escapeHtml(d.rootCause)}</div>
    </div>
    <div class="diagnosis-field">
      <div class="field-label">Confidence</div>
      <div class="field-value">${(d.confidence * 100).toFixed(0)}%</div>
    </div>`;

  if (d.affectedFiles && d.affectedFiles.length > 0) {
    html += `
      <div class="diagnosis-field">
        <div class="field-label">Affected Files</div>
        <div class="field-value">${d.affectedFiles.map((f) => `<code>${escapeHtml(f)}</code>`).join(", ")}</div>
      </div>`;
  }

  if (d.suggestedFixes && d.suggestedFixes.length > 0) {
    html += '<div class="diagnosis-field"><div class="field-label">Suggested Fixes</div>';
    for (const fix of d.suggestedFixes) {
      html += `
        <div class="fix-item">
          <div>[${(fix.confidence * 100).toFixed(0)}%] ${escapeHtml(fix.description)}</div>
          ${fix.command ? `<code>$ ${escapeHtml(fix.command)}</code>` : ""}
          ${fix.file ? `<div style="font-size:12px;color:var(--text-muted)">File: ${escapeHtml(fix.file)}</div>` : ""}
        </div>`;
    }
    html += "</div>";
  }

  html += "</div>";
  return html;
}

// --- Infra Diff ---

$("diff-submit").addEventListener("click", async () => {
  const diff = $("diff-content").value.trim();
  if (!diff) return;

  const spinner = $("diff-spinner");
  const result = $("diff-result");
  const btn = $("diff-submit");

  btn.disabled = true;
  result.innerHTML = "";
  show(spinner);

  const body = { diff };
  const before = $("diff-before").value.trim();
  const after = $("diff-after").value.trim();
  if (before && after) {
    body.before = before;
    body.after = after;
  }

  try {
    const data = await apiCall("/diff", {
      method: "POST",
      body: JSON.stringify(body),
    });

    result.innerHTML = renderAnalysis(data.analysis);
  } catch (err) {
    result.innerHTML = `<div class="card"><pre style="color:var(--error)">${escapeHtml(err.message)}</pre></div>`;
  } finally {
    hide(spinner);
    btn.disabled = false;
  }
});

function renderAnalysis(a) {
  const riskClass =
    {
      low: "risk-low",
      medium: "risk-medium",
      high: "risk-high",
      critical: "risk-critical",
    }[a.riskLevel] || "";

  let html = '<div class="card">';

  html += `
    <div class="diagnosis-field">
      <div class="field-label">Summary</div>
      <div class="field-value">${escapeHtml(a.summary)}</div>
    </div>
    <div class="diagnosis-field">
      <div class="field-label">Risk Level</div>
      <div class="field-value"><span class="${riskClass}" style="font-weight:600;text-transform:uppercase">${escapeHtml(a.riskLevel)}</span></div>
    </div>
    <div class="diagnosis-field">
      <div class="field-label">Cost Impact</div>
      <div class="field-value">${escapeHtml(a.costImpact.direction)} &mdash; ${escapeHtml(a.costImpact.details)}</div>
    </div>
    <div class="diagnosis-field">
      <div class="field-label">Rollback Complexity</div>
      <div class="field-value">${escapeHtml(a.rollbackComplexity)}</div>
    </div>
    <div class="diagnosis-field">
      <div class="field-label">Confidence</div>
      <div class="field-value">${(a.confidence * 100).toFixed(0)}%</div>
    </div>`;

  if (a.changes && a.changes.length > 0) {
    html += '<div class="diagnosis-field"><div class="field-label">Changes</div>';
    for (const c of a.changes) {
      const attr = c.attribute ? ` (${escapeHtml(c.attribute)})` : "";
      html += `<div style="font-size:13px;margin-bottom:4px"><span class="badge badge--muted">${escapeHtml(c.action)}</span> ${escapeHtml(c.resource)}${attr}</div>`;
    }
    html += "</div>";
  }

  if (a.riskFactors && a.riskFactors.length > 0) {
    html += `
      <div class="diagnosis-field">
        <div class="field-label">Risk Factors</div>
        <ul style="margin-left:16px">${a.riskFactors.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>
      </div>`;
  }

  if (a.securityImpact && a.securityImpact.length > 0) {
    html += `
      <div class="diagnosis-field">
        <div class="field-label">Security Impact</div>
        <ul style="margin-left:16px">${a.securityImpact.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>
      </div>`;
  }

  if (a.recommendations && a.recommendations.length > 0) {
    html += `
      <div class="diagnosis-field">
        <div class="field-label">Recommendations</div>
        <ul style="margin-left:16px">${a.recommendations.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>
      </div>`;
  }

  html += "</div>";
  return html;
}

// --- Agents ---

async function loadAgents() {
  const grid = $("agents-grid");
  try {
    const data = await apiCall("/agents");
    grid.innerHTML = renderAgents(data.agents);
  } catch (err) {
    grid.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}

function renderAgents(agents) {
  if (!agents.length) return '<div class="empty">No agents available</div>';

  return agents
    .map(
      (a) => `
    <div class="agent-card">
      <h4>${escapeHtml(a.name)}</h4>
      <div class="domain">${escapeHtml(a.domain)}</div>
      <div class="keywords">${a.keywords.map((k) => `<span class="keyword">${escapeHtml(k)}</span>`).join("")}</div>
    </div>`,
    )
    .join("");
}

// --- History ---

async function loadHistory() {
  const container = $("history-table");
  const type = $("history-type").value;
  const query = type ? `?type=${type}` : "";

  try {
    const data = await apiCall(`/history${query}`);
    container.innerHTML = renderHistory(data.entries);
  } catch (err) {
    container.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}

function renderHistory(entries) {
  if (!entries.length) return '<div class="empty">No history entries</div>';

  let html = `<table>
    <thead><tr>
      <th>ID</th><th>Type</th><th>Time</th><th>Status</th><th>Duration</th>
    </tr></thead><tbody>`;

  for (const e of entries) {
    const time = new Date(e.timestamp).toLocaleString();
    const status = e.success
      ? '<span class="badge badge--success">ok</span>'
      : '<span class="badge badge--error">error</span>';

    html += `<tr style="cursor:pointer" onclick="toggleDetail('detail-${e.id}')">
      <td>${escapeHtml(e.id)}</td>
      <td><span class="badge badge--muted">${escapeHtml(e.type)}</span></td>
      <td style="color:var(--text-muted)">${escapeHtml(time)}</td>
      <td>${status}</td>
      <td>${e.durationMs}ms</td>
    </tr>
    <tr id="detail-${e.id}" style="display:none">
      <td colspan="5"><pre>${escapeHtml(JSON.stringify(e.response, null, 2))}</pre></td>
    </tr>`;
  }

  html += "</tbody></table>";
  return html;
}

function toggleDetail(id) {
  const row = $(id);
  if (row) {
    row.style.display = row.style.display === "none" ? "table-row" : "none";
  }
}

// Make toggleDetail available globally
globalThis.toggleDetail = toggleDetail;

$("history-type").addEventListener("change", loadHistory);

$("history-clear").addEventListener("click", async () => {
  try {
    await apiCall("/history", { method: "DELETE" });
    loadHistory();
  } catch {
    // ignore
  }
});

// --- Init ---

async function init() {
  try {
    const health = await apiCall("/health");
    const badge = $("provider-badge");
    badge.textContent = health.provider;
    badge.classList.add("badge--success");
  } catch {
    const badge = $("provider-badge");
    badge.textContent = "offline";
    badge.classList.add("badge--error");
  }
}

init();
