const fs = require('fs');
const path = require('path');

// ── Helpers ─────────────────────────────────────────────────────────────────
const s = (val, fallback = 'Not specified') =>
  val === null || val === undefined || val === '' ? fallback : String(val);
const arr = (val) => (Array.isArray(val) ? val : []);

function generateReport(data, sourceFilename, outputDir) {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const baseName = path.basename(sourceFilename, '.pdf');
  const outputFilename = `${baseName}_summary.html`;
  const outputPath = path.join(outputDir, outputFilename);
  fs.writeFileSync(outputPath, buildHTML(data, sourceFilename), 'utf-8');
  return { path: outputPath, filename: outputFilename };
}

// ── CSS class helpers ───────────────────────────────────────────────────────
function severityClass(sev) {
  const v = (sev || '').toLowerCase();
  if (v === 'high') return 'sev-high';
  if (v === 'medium') return 'sev-medium';
  if (v === 'low') return 'sev-low';
  return 'sev-info';
}

function priorityClass(p) {
  const v = (p || '').toLowerCase();
  if (v === 'immediate') return 'pri-immediate';
  if (v === 'short-term') return 'pri-short';
  return 'pri-long';
}

function ctrlTypeClass(t) {
  const v = (t || '').toLowerCase();
  if (v.includes('prevent')) return 'ct-preventive';
  if (v.includes('detect')) return 'ct-detective';
  if (v.includes('correct')) return 'ct-corrective';
  return 'ct-compensating';
}

function severityDot(sev) {
  const v = (sev || '').toLowerCase();
  if (v === 'high') return '🔴';
  if (v === 'medium') return '🟡';
  if (v === 'low') return '🟢';
  return '⚪';
}

// ── Build HTML ──────────────────────────────────────────────────────────────
function buildHTML(data, sourceFilename) {
  const org = s(data.serviceOrganization, 'Unknown Organization');
  const period = data.auditPeriod || {};
  const auditor = data.auditor || {};
  const exceptions = arr(data.exceptions);
  const findings = arr(data.keyFindings);
  const remediations = arr(data.remediationPlans);
  const mitigating = arr(data.mitigatingControls);
  const controls = arr(data.controls);
  const tsc = arr(data.trustServiceCategories);
  const opinion = s(data.opinion, 'Unknown');
  const opinionClass = opinion.toLowerCase().includes('unqualified') ? 'unqualified'
    : opinion.toLowerCase().includes('qualified') ? 'qualified' : 'adverse';
  const genDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Stats
  const totalControls = controls.length;
  const totalExceptions = exceptions.length;
  const highFindings = findings.filter(f => (f.severity || '').toLowerCase() === 'high').length;
  const totalRemediations = remediations.length;
  const totalMitigating = mitigating.length;

  // ── Section 2: Deviations & Exceptions ──────────────────────────────────
  const deviationCards = exceptions.length > 0 ? exceptions.map((e, i) => `
    <div class="deviation-card">
      <div class="dev-header">
        <div class="dev-left">
          <span class="dev-number">#${i + 1}</span>
          <span class="cid">${s(e.criterionId, 'N/A')}</span>
          <span class="sev-badge ${severityClass(e.severity)}">${severityDot(e.severity)} ${s(e.severity, 'Medium')}</span>
        </div>
        <span class="dev-area">${s(e.affectedArea, '')}</span>
      </div>
      <h4 class="dev-control">${s(e.controlDescription, 'Control Exception')}</h4>
      <div class="dev-body">
        <div class="dev-block dev-block-exception">
          <div class="dev-label">What Was Found</div>
          <p>${s(e.exceptionDescription)}</p>
        </div>
        <div class="dev-block dev-block-conclusion">
          <div class="dev-label">Auditor's Conclusion</div>
          <p>${s(e.auditorConclusion)}</p>
        </div>
      </div>
    </div>`).join('') : `
    <div class="no-deviations">
      <div class="no-dev-icon">✓</div>
      <div class="no-dev-text">
        <strong>No Exceptions Noted</strong>
        <p>The auditor did not identify any deviations or exceptions in the controls tested during the audit period.</p>
      </div>
    </div>`;

  // ── Section 3: Proposed Remediation Plans ───────────────────────────────
  const remediationCards = remediations.map((r, i) => `
    <div class="remediation-card">
      <div class="rem-header">
        <div class="rem-left">
          <span class="rem-number">#${i + 1}</span>
          <span class="pri-badge ${priorityClass(r.priority)}">${s(r.priority, 'Short-term')}</span>
          <span class="rem-effort">Effort: ${s(r.estimatedEffort, 'Medium')}</span>
        </div>
        <span class="rem-timeline">⏱ ${s(r.timeline, 'TBD')}</span>
      </div>
      <h4 class="rem-title">${s(r.findingTitle)}</h4>
      <p class="rem-desc">${s(r.description)}</p>
      <div class="rem-plan">
        <div class="rem-plan-header">
          <span class="rem-plan-label">Action Plan</span>
          <span class="rem-plan-finding">${s(r.findingId, '')}</span>
        </div>
        <ol class="action-steps">${arr(r.actionSteps).map(step => `<li>${s(step)}</li>`).join('')}</ol>
      </div>
      <div class="rem-footer">
        <div class="rem-meta"><span class="rem-meta-label">Owner</span><span class="rem-meta-value">👤 ${s(r.owner, 'TBD')}</span></div>
        <div class="rem-meta"><span class="rem-meta-label">Timeline</span><span class="rem-meta-value">📅 ${s(r.timeline, 'TBD')}</span></div>
        <div class="rem-meta"><span class="rem-meta-label">Evidence Needed</span><span class="rem-meta-value">📋 Post-remediation audit artifacts</span></div>
      </div>
    </div>`).join('');

  // ── Section 4: Mitigating Controls ──────────────────────────────────────
  const mitigatingCards = mitigating.map((m, i) => `
    <div class="mitigating-card">
      <div class="mit-header">
        <div class="mit-left">
          <span class="mit-number">#${i + 1}</span>
          <span class="ctrl-type-badge ${ctrlTypeClass(m.controlType)}">${s(m.controlType, 'Preventive')}</span>
        </div>
        <div class="mit-right">
          ${m.framework ? `<span class="mit-framework">${m.framework}</span>` : ''}
          <span class="mit-effectiveness">Effectiveness: <strong>${s(m.effectiveness, 'Medium')}</strong></span>
        </div>
      </div>
      <h4 class="mit-title">${s(m.controlName)}</h4>
      <p class="mit-ref">↳ Addresses: <strong>${s(m.findingTitle)}</strong></p>
      <p class="mit-desc">${s(m.description)}</p>
      ${m.implementationGuidance ? `
      <div class="mit-guidance">
        <div class="mit-guidance-label">Implementation Guidance</div>
        <p>${s(m.implementationGuidance)}</p>
      </div>` : ''}
    </div>`).join('');

  // ── Full HTML ───────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${org} — SOC 2 Executive Summary</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg:#F8F7F4; --white:#fff; --border:#E5E3DC; --border-strong:#C8C4BA;
      --text:#1A1A18; --secondary:#6B6861; --muted:#A8A49D;
      --accent:#1A1A18; --accent-warm:#B45309;
      --badge-bg:#FEF3C7; --badge-text:#92400E;
      --high-bg:#FEF2F2; --high-border:#FECACA; --high-text:#991B1B;
      --med-bg:#FFFBEB; --med-border:#FDE68A; --med-text:#92400E;
      --low-bg:#F0FDF4; --low-border:#BBF7D0; --low-text:#065F46;
      --pass-bg:#F0FDF4; --pass-text:#065F46;
      --fail-bg:#FEF2F2; --fail-text:#991B1B;
      --blue-bg:#EFF6FF; --blue-border:#BFDBFE; --blue-text:#1E40AF;
      --purple-bg:#F5F3FF; --purple-border:#DDD6FE; --purple-text:#5B21B6;
      --shadow:0 1px 3px rgba(0,0,0,.06); --shadow-md:0 4px 12px rgba(0,0,0,.08);
      --radius:8px;
    }
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);font-size:14px;line-height:1.6}
    h1,h2,h3{font-family:'DM Serif Display',Georgia,serif;font-weight:400}

    /* ── Header ─────────────────────────────────────────── */
    .doc-header{background:var(--white);border-bottom:1px solid var(--border);padding:48px 48px 36px}
    .header-inner{max-width:960px;margin:0 auto}
    .header-eyebrow{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:12px}
    .header-org{font-family:'DM Serif Display',serif;font-size:38px;color:var(--text);margin-bottom:6px;line-height:1.15}
    .header-service{color:var(--secondary);font-size:15px;margin-bottom:24px;max-width:700px;line-height:1.5}
    .header-pills{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:28px}
    .pill{display:inline-block;padding:4px 12px;border-radius:4px;font-size:11px;font-weight:500;letter-spacing:.3px}
    .pill-outline{background:transparent;border:1px solid var(--border-strong);color:var(--secondary)}
    .pill-accent{background:var(--badge-bg);border:1px solid #FDE68A;color:var(--badge-text)}
    .pill-pass{background:var(--pass-bg);border:1px solid var(--low-border);color:var(--pass-text)}
    .pill-fail{background:var(--fail-bg);border:1px solid var(--high-border);color:var(--fail-text)}
    .header-meta{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:20px;padding-top:24px;border-top:1px solid var(--border)}
    .hm-label{font-size:10px;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:3px}
    .hm-value{font-size:13px;font-weight:500;color:var(--text)}

    /* ── Layout ─────────────────────────────────────────── */
    .container{max-width:960px;margin:0 auto;padding:32px 48px 48px}

    /* ── Stats Bar ──────────────────────────────────────── */
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:32px}
    .stat{background:var(--white);border:1px solid var(--border);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);text-align:center}
    .stat-num{font-family:'DM Serif Display',serif;font-size:32px;line-height:1;margin-bottom:6px;color:var(--text)}
    .stat-num.red{color:#991B1B} .stat-num.amber{color:#92400E} .stat-num.green{color:#065F46}
    .stat-lbl{font-size:10px;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:1px;color:var(--muted)}

    /* ── Sections ───────────────────────────────────────── */
    .section{background:var(--white);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:24px;overflow:hidden;box-shadow:var(--shadow)}
    .sec-head{padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
    .sec-title-wrap{display:flex;align-items:center;gap:10px}
    .sec-icon{width:32px;height:32px;border:1px solid var(--border);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;background:var(--bg)}
    .sec-title{font-size:14px;font-weight:600;color:var(--text);font-family:'Inter',sans-serif}
    .sec-count{font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--muted)}
    .sec-body{padding:24px}

    /* ── Executive Summary ──────────────────────────────── */
    .exec-summary{background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:20px 24px;margin-bottom:24px;line-height:1.7;font-size:13.5px;color:var(--secondary)}
    .exec-summary strong{color:var(--text)}

    /* ── Tags & Badges ─────────────────────────────────── */
    .cid{display:inline-block;background:#F1F0F9;border:1px solid #DDD9F5;color:#4B47A0;padding:2px 7px;border-radius:3px;font-size:10px;font-family:'JetBrains Mono',monospace;white-space:nowrap;margin:1px}
    .sev-badge{display:inline-block;padding:3px 10px;border-radius:3px;font-size:10px;font-family:'JetBrains Mono',monospace;font-weight:500;text-transform:uppercase;letter-spacing:.5px}
    .sev-high{background:var(--high-bg);border:1px solid var(--high-border);color:var(--high-text)}
    .sev-medium{background:var(--med-bg);border:1px solid var(--med-border);color:var(--med-text)}
    .sev-low{background:var(--low-bg);border:1px solid var(--low-border);color:var(--low-text)}
    .sev-info{background:var(--bg);border:1px solid var(--border);color:var(--secondary)}
    .pri-badge{display:inline-block;padding:3px 10px;border-radius:3px;font-size:10px;font-family:'JetBrains Mono',monospace;font-weight:500}
    .pri-immediate{background:var(--high-bg);border:1px solid var(--high-border);color:var(--high-text)}
    .pri-short{background:var(--med-bg);border:1px solid var(--med-border);color:var(--med-text)}
    .pri-long{background:var(--low-bg);border:1px solid var(--low-border);color:var(--low-text)}
    .ctrl-type-badge{display:inline-block;padding:3px 10px;border-radius:3px;font-size:10px;font-family:'JetBrains Mono',monospace;font-weight:500}
    .ct-preventive{background:var(--blue-bg);border:1px solid var(--blue-border);color:var(--blue-text)}
    .ct-detective{background:var(--purple-bg);border:1px solid var(--purple-border);color:var(--purple-text)}
    .ct-corrective{background:var(--low-bg);border:1px solid var(--low-border);color:var(--low-text)}
    .ct-compensating{background:var(--bg);border:1px solid var(--border);color:var(--secondary)}

    /* ── Deviation Cards ───────────────────────────────── */
    .deviation-card{border:1px solid var(--border);border-radius:var(--radius);padding:20px 24px;margin-bottom:16px;background:var(--white);border-left:3px solid #EF4444;transition:box-shadow .15s}
    .deviation-card:hover{box-shadow:var(--shadow-md)}
    .dev-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px}
    .dev-left{display:flex;align-items:center;gap:8px}
    .dev-number{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--muted);font-weight:500}
    .dev-area{font-size:11px;color:var(--secondary);font-family:'JetBrains Mono',monospace}
    .dev-control{font-size:15px;font-weight:600;margin-bottom:14px;color:var(--text);font-family:'Inter',sans-serif}
    .dev-body{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .dev-block{border-radius:6px;padding:14px}
    .dev-block-exception{background:var(--high-bg);border:1px solid var(--high-border)}
    .dev-block-conclusion{background:var(--bg);border:1px solid var(--border)}
    .dev-label{font-size:10px;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:1px;color:var(--muted);display:block;margin-bottom:6px}
    .dev-block p{font-size:13px;color:var(--secondary);line-height:1.6;margin:0}
    .no-deviations{display:flex;align-items:center;gap:18px;padding:6px}
    .no-dev-icon{width:48px;height:48px;border-radius:50%;background:var(--pass-bg);border:2px solid var(--low-border);display:flex;align-items:center;justify-content:center;font-size:22px;color:var(--pass-text);flex-shrink:0}
    .no-dev-text strong{font-size:15px;display:block;margin-bottom:4px;color:var(--text)}
    .no-dev-text p{font-size:13px;color:var(--secondary);margin:0;line-height:1.5}

    /* ── Remediation Cards ──────────────────────────────── */
    .remediation-card{border:1px solid var(--border);border-radius:var(--radius);padding:20px 24px;margin-bottom:16px;background:var(--white);transition:box-shadow .15s}
    .remediation-card:hover{box-shadow:var(--shadow-md)}
    .rem-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px}
    .rem-left{display:flex;align-items:center;gap:8px}
    .rem-number{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--muted);font-weight:500}
    .rem-effort{font-size:11px;color:var(--secondary);font-family:'JetBrains Mono',monospace}
    .rem-timeline{font-size:11px;color:var(--muted);font-family:'JetBrains Mono',monospace}
    .rem-title{font-size:15px;font-weight:600;margin-bottom:6px;color:var(--text);font-family:'Inter',sans-serif}
    .rem-desc{font-size:13px;color:var(--secondary);margin-bottom:16px;line-height:1.6}
    .rem-plan{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:16px;margin-bottom:16px}
    .rem-plan-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
    .rem-plan-label{font-size:10px;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:1px;color:var(--muted)}
    .rem-plan-finding{font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--muted)}
    .action-steps{padding-left:18px;display:flex;flex-direction:column;gap:6px}
    .action-steps li{font-size:13px;color:var(--text);line-height:1.6}
    .rem-footer{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding-top:14px;border-top:1px solid var(--border)}
    .rem-meta{display:flex;flex-direction:column}
    .rem-meta-label{font-size:10px;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin-bottom:3px}
    .rem-meta-value{font-size:12px;color:var(--text)}

    /* ── Mitigating Control Cards ──────────────────────── */
    .mitigating-card{border:1px solid var(--border);border-radius:var(--radius);padding:20px 24px;margin-bottom:16px;background:var(--white);border-left:3px solid #3B82F6;transition:box-shadow .15s}
    .mitigating-card:hover{box-shadow:var(--shadow-md)}
    .mit-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px}
    .mit-left{display:flex;align-items:center;gap:8px}
    .mit-right{display:flex;align-items:center;gap:12px}
    .mit-number{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--muted);font-weight:500}
    .mit-framework{font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--muted);background:var(--bg);border:1px solid var(--border);padding:2px 7px;border-radius:3px}
    .mit-effectiveness{font-size:11px;color:var(--secondary);font-family:'JetBrains Mono',monospace}
    .mit-title{font-size:15px;font-weight:600;margin-bottom:4px;color:var(--text);font-family:'Inter',sans-serif}
    .mit-ref{font-size:12px;color:var(--muted);font-family:'JetBrains Mono',monospace;margin-bottom:10px}
    .mit-ref strong{color:var(--secondary)}
    .mit-desc{font-size:13px;color:var(--secondary);margin-bottom:14px;line-height:1.6}
    .mit-guidance{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:14px}
    .mit-guidance-label{font-size:10px;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:6px}
    .mit-guidance p{font-size:13px;color:var(--secondary);line-height:1.6;margin:0}

    /* ── Opinion Box ────────────────────────────────────── */
    .opinion-box{border-radius:var(--radius);padding:18px 20px;display:flex;align-items:center;gap:14px}
    .opinion-box.unqualified{background:var(--low-bg);border:1px solid var(--low-border)}
    .opinion-box.qualified{background:var(--med-bg);border:1px solid var(--med-border)}
    .opinion-box.adverse{background:var(--high-bg);border:1px solid var(--high-border)}
    .opinion-icon{font-size:24px}
    .opinion-label{font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:2px}
    .opinion-verdict{font-family:'DM Serif Display',serif;font-size:20px;margin-bottom:2px}
    .opinion-text{font-size:12.5px;color:var(--secondary);line-height:1.5}

    /* ── Footer ─────────────────────────────────────────── */
    .doc-footer{border-top:1px solid var(--border);text-align:center;padding:24px;margin-top:12px;font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--muted)}

    /* ── Empty State ────────────────────────────────────── */
    .empty-state{text-align:center;padding:32px;color:var(--muted);font-size:13px}

    /* ── Print ──────────────────────────────────────────── */
    @media print{body{background:#fff}.container{padding:20px}.section,.deviation-card,.remediation-card,.mitigating-card{box-shadow:none;break-inside:avoid}}
    @media(max-width:700px){.dev-body,.rem-footer{grid-template-columns:1fr}.stats{grid-template-columns:repeat(2,1fr)}.container{padding:20px 16px}.doc-header{padding:28px 16px}}
  </style>
</head>
<body>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- SECTION 1: COMPANY OVERVIEW                                           -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
<div class="doc-header">
  <div class="header-inner">
    <div class="header-eyebrow">SOC 2 Executive Summary · AI Generated · ${genDate}</div>
    <h1 class="header-org">${org}</h1>
    <p class="header-service">${s(data.serviceName, s(data.systemDescription, 'Service description not available.')).substring(0, 200)}</p>
    <div class="header-pills">
      <span class="pill pill-outline">SOC 2 ${s(data.reportType, 'Type II')}</span>
      <span class="pill pill-outline">${s(period.from, '?')} — ${s(period.to, '?')}</span>
      <span class="pill pill-outline">${s(auditor.firmName, 'Unknown Auditor')}</span>
      <span class="pill ${opinionClass === 'unqualified' ? 'pill-pass' : 'pill-fail'}">${opinion} Opinion</span>
      ${tsc.map(t => `<span class="pill pill-accent">${t}</span>`).join('')}
    </div>
    <div class="header-meta">
      <div class="hm-item"><div class="hm-label">Audit Period</div><div class="hm-value">${s(period.from)} – ${s(period.to)}</div></div>
      <div class="hm-item"><div class="hm-label">Report Date</div><div class="hm-value">${s(data.reportDate)}</div></div>
      <div class="hm-item"><div class="hm-label">Auditing Firm</div><div class="hm-value">${s(auditor.firmName)}</div></div>
      <div class="hm-item"><div class="hm-label">Source File</div><div class="hm-value">${sourceFilename}</div></div>
    </div>
  </div>
</div>

<div class="container">

  <!-- Stats Bar -->
  <div class="stats">
    <div class="stat">
      <div class="stat-num ${totalExceptions > 0 ? 'red' : 'green'}">${totalExceptions}</div>
      <div class="stat-lbl">Deviations Found</div>
    </div>
    <div class="stat">
      <div class="stat-num ${highFindings > 0 ? 'red' : 'green'}">${highFindings}</div>
      <div class="stat-lbl">High Severity</div>
    </div>
    <div class="stat">
      <div class="stat-num">${totalRemediations}</div>
      <div class="stat-lbl">Remediation Plans</div>
    </div>
    <div class="stat">
      <div class="stat-num">${totalMitigating}</div>
      <div class="stat-lbl">Mitigating Controls</div>
    </div>
  </div>

  <!-- Executive Summary -->
  <div class="exec-summary">
    This report summarizes the SOC 2 ${s(data.reportType, 'Type II')} audit of <strong>${org}</strong>,
    covering the period <strong>${s(period.from, 'N/A')} to ${s(period.to, 'N/A')}</strong>,
    audited by <strong>${s(auditor.firmName, 'the independent auditor')}</strong>.
    ${totalExceptions > 0
      ? `The audit identified <strong>${totalExceptions} deviation(s)</strong>${highFindings > 0 ? `, including <strong>${highFindings} high-severity finding(s)</strong>` : ''}.
         Below are the detailed exceptions, proposed remediation plans with actionable steps, and mitigating controls already identified within the report.`
      : `The auditor issued an <strong>${opinion}</strong> opinion with <strong>no exceptions noted</strong>.
         ${totalControls > 0 ? `A total of <strong>${totalControls} controls</strong> were tested during the audit period.` : ''}
         Below are the identified mitigating controls and recommendations for continuous improvement.`
    }
  </div>

  <!-- Auditor Opinion -->
  <div class="section">
    <div class="sec-head">
      <div class="sec-title-wrap"><div class="sec-icon">🏛</div><span class="sec-title">Auditor's Opinion</span></div>
    </div>
    <div class="sec-body">
      <div class="opinion-box ${opinionClass}">
        <div class="opinion-icon">${opinionClass === 'unqualified' ? '✅' : opinionClass === 'qualified' ? '⚠️' : '🚨'}</div>
        <div>
          <div class="opinion-label">Independent Auditor's Conclusion</div>
          <div class="opinion-verdict">${opinion} Opinion</div>
          <div class="opinion-text">${s(data.opinionText, 'Opinion text not available.')}</div>
        </div>
      </div>
    </div>
  </div>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- SECTION 2: DEVIATIONS & EXCEPTIONS                                    -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
  <div class="section">
    <div class="sec-head">
      <div class="sec-title-wrap"><div class="sec-icon">⚠️</div><span class="sec-title">Deviations & Exceptions</span></div>
      <span class="sec-count">${totalExceptions > 0 ? `${totalExceptions} deviation(s) identified` : 'Clean audit'}</span>
    </div>
    <div class="sec-body">${deviationCards}</div>
  </div>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- SECTION 3: PROPOSED REMEDIATION PLANS                                 -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
  ${remediations.length > 0 ? `
  <div class="section">
    <div class="sec-head">
      <div class="sec-title-wrap"><div class="sec-icon">📋</div><span class="sec-title">Proposed Remediation Plans</span></div>
      <span class="sec-count">${totalRemediations} action plan(s)</span>
    </div>
    <div class="sec-body">${remediationCards}</div>
  </div>` : ''}

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- SECTION 4: MITIGATING CONTROLS IDENTIFIED                             -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
  ${mitigating.length > 0 ? `
  <div class="section">
    <div class="sec-head">
      <div class="sec-title-wrap"><div class="sec-icon">🛡️</div><span class="sec-title">Mitigating Controls Identified</span></div>
      <span class="sec-count">${totalMitigating} control(s) identified in report</span>
    </div>
    <div class="sec-body">${mitigatingCards}</div>
  </div>` : ''}

</div>

<div class="doc-footer">
  SOC 2 Executive Summary · AI Generated · ${genDate} · Source: ${sourceFilename}<br>
  Framework: AICPA 2017 Trust Services Criteria (2022 Revised Points of Focus)
</div>

</body>
</html>`;
}

// ══════════════════════════════════════════════════════════════════════════
// UNIFIED REPORT — All companies in one HTML document
// ══════════════════════════════════════════════════════════════════════════

function generateUnifiedReport(entries, outputDir) {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const dateStr = new Date().toISOString().slice(0, 10);
  const outputFilename = `SOC2_Unified_Summary_${dateStr}.html`;
  const outputPath = path.join(outputDir, outputFilename);

  // Build per-company sections
  const companySections = entries.map((entry, idx) => buildCompanySection(entry.data, entry.sourceFilename, idx)).join('');

  // Aggregate stats
  const totalExceptions = entries.reduce((sum, e) => sum + arr(e.data.exceptions).length, 0);
  const totalRemediations = entries.reduce((sum, e) => sum + arr(e.data.remediationPlans).length, 0);
  const totalMitigating = entries.reduce((sum, e) => sum + arr(e.data.mitigatingControls).length, 0);
  const highFindings = entries.reduce((sum, e) => sum + arr(e.data.keyFindings).filter(f => (f.severity || '').toLowerCase() === 'high').length, 0);

  const genDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Build summary data for each company (returned to server for chat display)
  const summaryData = entries.map(e => ({
    company: s(e.data.serviceOrganization, 'Unknown'),
    reportType: s(e.data.reportType, 'Type II'),
    opinion: s(e.data.opinion, 'Unknown'),
    exceptions: arr(e.data.exceptions).length,
    remediations: arr(e.data.remediationPlans).length,
    mitigating: arr(e.data.mitigatingControls).length,
    highFindings: arr(e.data.keyFindings).filter(f => (f.severity || '').toLowerCase() === 'high').length,
    sourceFile: e.sourceFilename
  }));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SOC 2 Unified Executive Summary</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg:#F8F7F4; --white:#fff; --border:#E5E3DC; --border-strong:#C8C4BA;
      --text:#1A1A18; --secondary:#6B6861; --muted:#A8A49D;
      --accent:#1A1A18; --accent-warm:#B45309;
      --badge-bg:#FEF3C7; --badge-text:#92400E;
      --high-bg:#FEF2F2; --high-border:#FECACA; --high-text:#991B1B;
      --med-bg:#FFFBEB; --med-border:#FDE68A; --med-text:#92400E;
      --low-bg:#F0FDF4; --low-border:#BBF7D0; --low-text:#065F46;
      --pass-bg:#F0FDF4; --pass-text:#065F46;
      --fail-bg:#FEF2F2; --fail-text:#991B1B;
      --blue-bg:#EFF6FF; --blue-border:#BFDBFE; --blue-text:#1E40AF;
      --purple-bg:#F5F3FF; --purple-border:#DDD6FE; --purple-text:#5B21B6;
      --shadow:0 1px 3px rgba(0,0,0,.06); --shadow-md:0 4px 12px rgba(0,0,0,.08);
      --radius:8px;
    }
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);font-size:14px;line-height:1.6}
    h1,h2,h3{font-family:'DM Serif Display',Georgia,serif;font-weight:400}

    .doc-header{background:var(--white);border-bottom:1px solid var(--border);padding:48px 48px 36px}
    .header-inner{max-width:960px;margin:0 auto}
    .header-eyebrow{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:12px}
    .header-title{font-family:'DM Serif Display',serif;font-size:38px;color:var(--text);margin-bottom:6px;line-height:1.15}
    .header-subtitle{color:var(--secondary);font-size:15px;margin-bottom:24px;max-width:700px;line-height:1.5}

    .container{max-width:960px;margin:0 auto;padding:32px 48px 48px}
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:32px}
    .stat{background:var(--white);border:1px solid var(--border);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);text-align:center}
    .stat-num{font-family:'DM Serif Display',serif;font-size:32px;line-height:1;margin-bottom:6px;color:var(--text)}
    .stat-num.red{color:#991B1B} .stat-num.amber{color:#92400E} .stat-num.green{color:#065F46}
    .stat-lbl{font-size:10px;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:1px;color:var(--muted)}

    .exec-summary{background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:20px 24px;margin-bottom:32px;line-height:1.7;font-size:13.5px;color:var(--secondary)}
    .exec-summary strong{color:var(--text)}

    /* Company divider */
    .company-divider{margin:40px 0 24px;padding:24px;background:var(--white);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow)}
    .company-divider-eyebrow{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:8px}
    .company-divider h2{font-size:28px;margin-bottom:6px}
    .company-divider-meta{font-size:13px;color:var(--secondary)}
    .company-pills{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
    .pill{display:inline-block;padding:4px 12px;border-radius:4px;font-size:11px;font-weight:500;letter-spacing:.3px}
    .pill-outline{background:transparent;border:1px solid var(--border-strong);color:var(--secondary)}
    .pill-accent{background:var(--badge-bg);border:1px solid #FDE68A;color:var(--badge-text)}
    .pill-pass{background:var(--pass-bg);border:1px solid var(--low-border);color:var(--pass-text)}
    .pill-fail{background:var(--fail-bg);border:1px solid var(--high-border);color:var(--fail-text)}

    .section{background:var(--white);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:20px;overflow:hidden;box-shadow:var(--shadow)}
    .sec-head{padding:16px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
    .sec-title-wrap{display:flex;align-items:center;gap:10px}
    .sec-icon{width:30px;height:30px;border:1px solid var(--border);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;background:var(--bg)}
    .sec-title{font-size:13px;font-weight:600;color:var(--text);font-family:'Inter',sans-serif}
    .sec-count{font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--muted)}
    .sec-body{padding:20px 24px}

    .cid{display:inline-block;background:#F1F0F9;border:1px solid #DDD9F5;color:#4B47A0;padding:2px 7px;border-radius:3px;font-size:10px;font-family:'JetBrains Mono',monospace;white-space:nowrap;margin:1px}
    .sev-badge{display:inline-block;padding:3px 10px;border-radius:3px;font-size:10px;font-family:'JetBrains Mono',monospace;font-weight:500;text-transform:uppercase;letter-spacing:.5px}
    .sev-high{background:var(--high-bg);border:1px solid var(--high-border);color:var(--high-text)}
    .sev-medium{background:var(--med-bg);border:1px solid var(--med-border);color:var(--med-text)}
    .sev-low{background:var(--low-bg);border:1px solid var(--low-border);color:var(--low-text)}
    .sev-info{background:var(--bg);border:1px solid var(--border);color:var(--secondary)}
    .pri-badge{display:inline-block;padding:3px 10px;border-radius:3px;font-size:10px;font-family:'JetBrains Mono',monospace;font-weight:500}
    .pri-immediate{background:var(--high-bg);border:1px solid var(--high-border);color:var(--high-text)}
    .pri-short{background:var(--med-bg);border:1px solid var(--med-border);color:var(--med-text)}
    .pri-long{background:var(--low-bg);border:1px solid var(--low-border);color:var(--low-text)}
    .ctrl-type-badge{display:inline-block;padding:3px 10px;border-radius:3px;font-size:10px;font-family:'JetBrains Mono',monospace;font-weight:500}
    .ct-preventive{background:var(--blue-bg);border:1px solid var(--blue-border);color:var(--blue-text)}
    .ct-detective{background:var(--purple-bg);border:1px solid var(--purple-border);color:var(--purple-text)}
    .ct-corrective{background:var(--low-bg);border:1px solid var(--low-border);color:var(--low-text)}
    .ct-compensating{background:var(--bg);border:1px solid var(--border);color:var(--secondary)}

    .deviation-card{border:1px solid var(--border);border-radius:var(--radius);padding:18px 22px;margin-bottom:14px;background:var(--white);border-left:3px solid #EF4444}
    .dev-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px}
    .dev-left{display:flex;align-items:center;gap:8px}
    .dev-number{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--muted);font-weight:500}
    .dev-area{font-size:11px;color:var(--secondary);font-family:'JetBrains Mono',monospace}
    .dev-control{font-size:14px;font-weight:600;margin-bottom:12px;color:var(--text);font-family:'Inter',sans-serif}
    .dev-body{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .dev-block{border-radius:6px;padding:12px}
    .dev-block-exception{background:var(--high-bg);border:1px solid var(--high-border)}
    .dev-block-conclusion{background:var(--bg);border:1px solid var(--border)}
    .dev-label{font-size:10px;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:1px;color:var(--muted);display:block;margin-bottom:4px}
    .dev-block p{font-size:12.5px;color:var(--secondary);line-height:1.6;margin:0}
    .no-deviations{display:flex;align-items:center;gap:16px;padding:4px}
    .no-dev-icon{width:44px;height:44px;border-radius:50%;background:var(--pass-bg);border:2px solid var(--low-border);display:flex;align-items:center;justify-content:center;font-size:20px;color:var(--pass-text);flex-shrink:0}
    .no-dev-text strong{font-size:14px;display:block;margin-bottom:3px;color:var(--text)}
    .no-dev-text p{font-size:12.5px;color:var(--secondary);margin:0;line-height:1.5}

    .remediation-card{border:1px solid var(--border);border-radius:var(--radius);padding:18px 22px;margin-bottom:14px;background:var(--white)}
    .rem-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px}
    .rem-left{display:flex;align-items:center;gap:8px}
    .rem-number{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--muted);font-weight:500}
    .rem-effort{font-size:11px;color:var(--secondary);font-family:'JetBrains Mono',monospace}
    .rem-timeline{font-size:11px;color:var(--muted);font-family:'JetBrains Mono',monospace}
    .rem-title{font-size:14px;font-weight:600;margin-bottom:6px;color:var(--text);font-family:'Inter',sans-serif}
    .rem-desc{font-size:12.5px;color:var(--secondary);margin-bottom:14px;line-height:1.6}
    .rem-plan{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:14px;margin-bottom:14px}
    .rem-plan-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
    .rem-plan-label{font-size:10px;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:1px;color:var(--muted)}
    .rem-plan-finding{font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--muted)}
    .action-steps{padding-left:18px;display:flex;flex-direction:column;gap:5px}
    .action-steps li{font-size:12.5px;color:var(--text);line-height:1.6}
    .rem-footer{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding-top:12px;border-top:1px solid var(--border)}
    .rem-meta-label{font-size:10px;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin-bottom:2px}
    .rem-meta-value{font-size:12px;color:var(--text)}

    .mitigating-card{border:1px solid var(--border);border-radius:var(--radius);padding:18px 22px;margin-bottom:14px;background:var(--white);border-left:3px solid #3B82F6}
    .mit-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px}
    .mit-left{display:flex;align-items:center;gap:8px}
    .mit-right{display:flex;align-items:center;gap:12px}
    .mit-number{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--muted);font-weight:500}
    .mit-framework{font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--muted);background:var(--bg);border:1px solid var(--border);padding:2px 7px;border-radius:3px}
    .mit-effectiveness{font-size:11px;color:var(--secondary);font-family:'JetBrains Mono',monospace}
    .mit-title{font-size:14px;font-weight:600;margin-bottom:4px;color:var(--text);font-family:'Inter',sans-serif}
    .mit-ref{font-size:11px;color:var(--muted);font-family:'JetBrains Mono',monospace;margin-bottom:8px}
    .mit-ref strong{color:var(--secondary)}
    .mit-desc{font-size:12.5px;color:var(--secondary);margin-bottom:12px;line-height:1.6}
    .mit-guidance{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:12px}
    .mit-guidance-label{font-size:10px;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:5px}
    .mit-guidance p{font-size:12.5px;color:var(--secondary);line-height:1.6;margin:0}

    .doc-footer{border-top:1px solid var(--border);text-align:center;padding:24px;margin-top:12px;font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--muted)}

    @media print{body{background:#fff}.container{padding:20px}.section,.deviation-card,.remediation-card,.mitigating-card,.company-divider{box-shadow:none;break-inside:avoid}}
    @media(max-width:700px){.dev-body,.rem-footer{grid-template-columns:1fr}.stats{grid-template-columns:repeat(2,1fr)}.container{padding:20px 16px}.doc-header{padding:28px 16px}}
  </style>
</head>
<body>

<div class="doc-header">
  <div class="header-inner">
    <div class="header-eyebrow">SOC 2 Unified Executive Summary · AI Generated · ${genDate}</div>
    <h1 class="header-title">SOC 2 Audit Analysis</h1>
    <p class="header-subtitle">${entries.length} report(s) analyzed. This document provides a consolidated view of deviations, remediation plans, and mitigating controls across all audited organizations.</p>
  </div>
</div>

<div class="container">

  <div class="stats">
    <div class="stat">
      <div class="stat-num">${entries.length}</div>
      <div class="stat-lbl">Reports Analyzed</div>
    </div>
    <div class="stat">
      <div class="stat-num ${totalExceptions > 0 ? 'red' : 'green'}">${totalExceptions}</div>
      <div class="stat-lbl">Total Deviations</div>
    </div>
    <div class="stat">
      <div class="stat-num">${totalRemediations}</div>
      <div class="stat-lbl">Remediation Plans</div>
    </div>
    <div class="stat">
      <div class="stat-num">${totalMitigating}</div>
      <div class="stat-lbl">Mitigating Controls</div>
    </div>
  </div>

  <div class="exec-summary">
    This unified report consolidates the SOC 2 audit analysis of <strong>${entries.length} organization(s)</strong>:
    ${entries.map(e => `<strong>${s(e.data.serviceOrganization, 'Unknown')}</strong>`).join(', ')}.
    ${totalExceptions > 0
      ? `A total of <strong>${totalExceptions} deviation(s)</strong> were identified${highFindings > 0 ? `, including <strong>${highFindings} high-severity finding(s)</strong>` : ''}. Each deviation below includes a proposed remediation plan and identified mitigating controls.`
      : `All audits resulted in <strong>clean opinions with no exceptions noted</strong>.`
    }
  </div>

  ${companySections}

</div>

<div class="doc-footer">
  SOC 2 Unified Executive Summary · AI Generated · ${genDate} · ${entries.length} report(s)<br>
  Framework: AICPA 2017 Trust Services Criteria (2022 Revised Points of Focus)
</div>

</body>
</html>`;

  fs.writeFileSync(outputPath, html, 'utf-8');
  return { path: outputPath, filename: outputFilename, summaryData };
}

// ── Build one company's section for the unified report ─────────────────────
function buildCompanySection(data, sourceFilename, idx) {
  const org = s(data.serviceOrganization, 'Unknown Organization');
  const period = data.auditPeriod || {};
  const auditor = data.auditor || {};
  const exceptions = arr(data.exceptions);
  const remediations = arr(data.remediationPlans);
  const mitigating = arr(data.mitigatingControls);
  const tsc = arr(data.trustServiceCategories);
  const opinion = s(data.opinion, 'Unknown');
  const opinionClass = opinion.toLowerCase().includes('unqualified') ? 'pill-pass' : 'pill-fail';

  const deviationCards = exceptions.length > 0 ? exceptions.map((e, i) => `
    <div class="deviation-card">
      <div class="dev-header">
        <div class="dev-left">
          <span class="dev-number">#${i + 1}</span>
          <span class="cid">${s(e.criterionId, 'N/A')}</span>
          <span class="sev-badge ${severityClass(e.severity)}">${severityDot(e.severity)} ${s(e.severity, 'Medium')}</span>
        </div>
        <span class="dev-area">${s(e.affectedArea, '')}</span>
      </div>
      <h4 class="dev-control">${s(e.controlDescription, 'Control Exception')}</h4>
      <div class="dev-body">
        <div class="dev-block dev-block-exception"><div class="dev-label">What Was Found</div><p>${s(e.exceptionDescription)}</p></div>
        <div class="dev-block dev-block-conclusion"><div class="dev-label">Auditor's Conclusion</div><p>${s(e.auditorConclusion)}</p></div>
      </div>
    </div>`).join('') : `
    <div class="no-deviations">
      <div class="no-dev-icon">✓</div>
      <div class="no-dev-text"><strong>No Exceptions Noted</strong><p>The auditor did not identify any deviations during the audit period.</p></div>
    </div>`;

  const remediationCards = remediations.map((r, i) => `
    <div class="remediation-card">
      <div class="rem-header">
        <div class="rem-left">
          <span class="rem-number">#${i + 1}</span>
          <span class="pri-badge ${priorityClass(r.priority)}">${s(r.priority, 'Short-term')}</span>
          <span class="rem-effort">Effort: ${s(r.estimatedEffort, 'Medium')}</span>
        </div>
        <span class="rem-timeline">⏱ ${s(r.timeline, 'TBD')}</span>
      </div>
      <h4 class="rem-title">${s(r.findingTitle)}</h4>
      <p class="rem-desc">${s(r.description)}</p>
      <div class="rem-plan">
        <div class="rem-plan-header"><span class="rem-plan-label">Action Plan</span><span class="rem-plan-finding">${s(r.findingId, '')}</span></div>
        <ol class="action-steps">${arr(r.actionSteps).map(step => `<li>${s(step)}</li>`).join('')}</ol>
      </div>
      <div class="rem-footer">
        <div><div class="rem-meta-label">Owner</div><div class="rem-meta-value">👤 ${s(r.owner, 'TBD')}</div></div>
        <div><div class="rem-meta-label">Timeline</div><div class="rem-meta-value">📅 ${s(r.timeline, 'TBD')}</div></div>
        <div><div class="rem-meta-label">Evidence Needed</div><div class="rem-meta-value">📋 Post-remediation artifacts</div></div>
      </div>
    </div>`).join('');

  const mitigatingCards = mitigating.map((m, i) => `
    <div class="mitigating-card">
      <div class="mit-header">
        <div class="mit-left">
          <span class="mit-number">#${i + 1}</span>
          <span class="ctrl-type-badge ${ctrlTypeClass(m.controlType)}">${s(m.controlType, 'Preventive')}</span>
        </div>
        <div class="mit-right">
          ${m.framework ? `<span class="mit-framework">${m.framework}</span>` : ''}
          <span class="mit-effectiveness">Effectiveness: <strong>${s(m.effectiveness, 'Medium')}</strong></span>
        </div>
      </div>
      <h4 class="mit-title">${s(m.controlName)}</h4>
      <p class="mit-ref">↳ Addresses: <strong>${s(m.findingTitle)}</strong></p>
      <p class="mit-desc">${s(m.description)}</p>
      ${m.implementationGuidance ? `<div class="mit-guidance"><div class="mit-guidance-label">Implementation Guidance</div><p>${s(m.implementationGuidance)}</p></div>` : ''}
    </div>`).join('');

  return `
  <!-- ── Company ${idx + 1}: ${org} ─── -->
  <div class="company-divider">
    <div class="company-divider-eyebrow">Report ${idx + 1} of ${idx + 1}</div>
    <h2>${org}</h2>
    <div class="company-divider-meta">${s(data.serviceName, s(data.systemDescription, ''))}</div>
    <div class="company-pills">
      <span class="pill pill-outline">SOC 2 ${s(data.reportType, 'Type II')}</span>
      <span class="pill pill-outline">${s(period.from, '?')} — ${s(period.to, '?')}</span>
      <span class="pill pill-outline">${s(auditor.firmName, 'Unknown Auditor')}</span>
      <span class="pill ${opinionClass}">${opinion} Opinion</span>
      ${tsc.map(t => `<span class="pill pill-accent">${t}</span>`).join('')}
    </div>
  </div>

  <div class="section">
    <div class="sec-head"><div class="sec-title-wrap"><div class="sec-icon">⚠️</div><span class="sec-title">Deviations & Exceptions</span></div><span class="sec-count">${exceptions.length > 0 ? exceptions.length + ' deviation(s)' : 'Clean audit'}</span></div>
    <div class="sec-body">${deviationCards}</div>
  </div>

  ${remediations.length > 0 ? `
  <div class="section">
    <div class="sec-head"><div class="sec-title-wrap"><div class="sec-icon">📋</div><span class="sec-title">Proposed Remediation Plans</span></div><span class="sec-count">${remediations.length} plan(s)</span></div>
    <div class="sec-body">${remediationCards}</div>
  </div>` : ''}

  ${mitigating.length > 0 ? `
  <div class="section">
    <div class="sec-head"><div class="sec-title-wrap"><div class="sec-icon">🛡️</div><span class="sec-title">Mitigating Controls</span></div><span class="sec-count">${mitigating.length} control(s)</span></div>
    <div class="sec-body">${mitigatingCards}</div>
  </div>` : ''}
  `;
}

module.exports = { generateReport, generateUnifiedReport };
