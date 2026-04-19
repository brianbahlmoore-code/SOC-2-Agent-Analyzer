// ── DOM References ─────────────────────────────────────────────────────────
const messagesEl    = document.getElementById('messages');
const msgInput      = document.getElementById('msgInput');
const sendBtn       = document.getElementById('sendBtn');
const inputFileList = document.getElementById('inputFileList');
const outputFileList= document.getElementById('outputFileList');
const statusDot     = document.getElementById('statusDot');
const statusText    = document.getElementById('statusText');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebar       = document.getElementById('sidebar');

// ── State ──────────────────────────────────────────────────────────────────
let isProcessing = false;

// ── Sidebar Toggle ─────────────────────────────────────────────────────────
sidebarToggle.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
});

// ── Auto-resize textarea ───────────────────────────────────────────────────
msgInput.addEventListener('input', () => {
  msgInput.style.height = 'auto';
  msgInput.style.height = Math.min(msgInput.scrollHeight, 140) + 'px';
});

// ── Keyboard shortcuts ─────────────────────────────────────────────────────
msgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// ── Quick action buttons ───────────────────────────────────────────────────
document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    msgInput.value = btn.dataset.msg;
    sendMessage();
  });
});

// ── Send button ────────────────────────────────────────────────────────────
sendBtn.addEventListener('click', sendMessage);

// ── Refresh buttons ────────────────────────────────────────────────────────
document.getElementById('refreshInputBtn').addEventListener('click', loadInputFiles);
document.getElementById('refreshOutputBtn').addEventListener('click', loadOutputFiles);

// ── Markdown-lite renderer ─────────────────────────────────────────────────
function renderText(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

// ── Set status ─────────────────────────────────────────────────────────────
function setStatus(state, text) {
  statusDot.className = 'status-dot' + (state !== 'ready' ? ` ${state}` : '');
  statusText.textContent = text;
}

// ── Append user message ────────────────────────────────────────────────────
function addUserMessage(text) {
  const div = document.createElement('div');
  div.className = 'msg user';
  div.innerHTML = `
    <div class="msg-avatar">👤</div>
    <div class="msg-bubble">${renderText(text)}</div>
  `;
  messagesEl.appendChild(div);
  scrollToBottom();
}

// ── Create agent message container ─────────────────────────────────────────
function createAgentMessage() {
  const wrap = document.createElement('div');
  wrap.className = 'msg agent';

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = '⚡';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  // Typing indicator
  const typing = document.createElement('div');
  typing.className = 'typing-indicator';
  typing.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  bubble.appendChild(typing);

  const stepsBlock = document.createElement('div');
  stepsBlock.className = 'agent-steps-block';
  bubble.appendChild(stepsBlock);

  const mainText = document.createElement('div');
  mainText.className = 'main-text';
  bubble.appendChild(mainText);

  const chipsArea = document.createElement('div');
  chipsArea.className = 'file-chips';
  bubble.appendChild(chipsArea);

  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  messagesEl.appendChild(wrap);
  scrollToBottom();

  return { wrap, bubble, typing, stepsBlock, mainText, chipsArea };
}

// ── Handle SSE events from agent ───────────────────────────────────────────
function handleEvent(ctx, event) {
  const { typing, stepsBlock, mainText, chipsArea } = ctx;

  switch (event.type) {
    case 'step': {
      typing.style.display = 'none';
      const line = document.createElement('div');
      const text = event.text || '';
      const isSuccess = text.includes('✅');
      const isError   = text.includes('❌');
      const isProgress= text.startsWith('   ⏳') || text.startsWith('   🤖') || text.startsWith('   📝');
      line.className = 'agent-step' + (isSuccess ? ' success' : isError ? ' error' : isProgress ? ' progress' : '');
      line.innerHTML = renderText(text.trim());
      stepsBlock.appendChild(line);
      scrollToBottom();
      break;
    }

    case 'found': {
      typing.style.display = 'none';
      const line = document.createElement('div');
      line.className = 'agent-step success';
      line.innerHTML = renderText(event.text || '');
      stepsBlock.appendChild(line);

      if (Array.isArray(event.files)) {
        event.files.forEach(f => {
          const chip = document.createElement('div');
          chip.className = 'file-chip';
          chip.innerHTML = `📄 ${f}`;
          chipsArea.appendChild(chip);
        });
      }
      scrollToBottom();
      break;
    }

    case 'progress': {
      typing.style.display = 'none';
      const line = document.createElement('div');
      line.className = 'agent-step';
      line.innerHTML = '<br>' + renderText((event.text || '').trim());
      stepsBlock.appendChild(line);
      scrollToBottom();
      break;
    }

    case 'msg': {
      typing.style.display = 'none';
      mainText.innerHTML = renderText(event.text || '');
      scrollToBottom();
      break;
    }

    case 'done': {
      typing.style.display = 'none';

      // Show text summary
      if (event.text) {
        const finalDiv = document.createElement('div');
        finalDiv.style.marginTop = '12px';
        finalDiv.innerHTML = renderText(event.text);
        mainText.appendChild(finalDiv);
      }

      // Show per-company summary cards + Open Report button
      if (event.summaryData && event.summaryData.length > 0 && event.reportFilename) {
        const summaryWrap = document.createElement('div');
        summaryWrap.style.marginTop = '16px';

        // Company summary cards
        event.summaryData.forEach(c => {
          const card = document.createElement('div');
          card.style.cssText = 'background:#F8F7F4;border:1px solid #E5E3DC;border-radius:8px;padding:14px 16px;margin-bottom:10px;';
          card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <strong style="font-size:14px">${c.company}</strong>
              <span style="font-size:11px;font-family:monospace;padding:2px 8px;border-radius:3px;${c.opinion.toLowerCase().includes('unqualified') ? 'background:#F0FDF4;border:1px solid #BBF7D0;color:#065F46' : 'background:#FEF2F2;border:1px solid #FECACA;color:#991B1B'}">${c.opinion}</span>
            </div>
            <div style="display:flex;gap:16px;font-size:12px;color:#6B6861">
              <span>${c.exceptions > 0 ? '🔴' : '🟢'} ${c.exceptions} deviation(s)</span>
              <span>📋 ${c.remediations} plan(s)</span>
              <span>🛡️ ${c.mitigating} control(s)</span>
            </div>
          `;
          summaryWrap.appendChild(card);
        });

        // Open Report button
        const btnWrap = document.createElement('div');
        btnWrap.style.marginTop = '14px';
        const openBtn = document.createElement('a');
        openBtn.href = `/output-file?name=${encodeURIComponent(event.reportFilename)}`;
        openBtn.target = '_blank';
        openBtn.textContent = '📄 Open Unified Report';
        openBtn.style.cssText = 'display:inline-block;padding:10px 22px;background:#1A1A18;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:.3px;transition:opacity .15s;';
        openBtn.addEventListener('mouseenter', () => openBtn.style.opacity = '0.85');
        openBtn.addEventListener('mouseleave', () => openBtn.style.opacity = '1');
        btnWrap.appendChild(openBtn);
        summaryWrap.appendChild(btnWrap);

        mainText.appendChild(summaryWrap);
      }

      scrollToBottom();
      // Refresh output file list after completion
      setTimeout(loadOutputFiles, 500);
      break;
    }

    case 'error': {
      typing.style.display = 'none';
      const errDiv = document.createElement('div');
      errDiv.style.color = '#EF4444';
      errDiv.innerHTML = renderText(event.text || 'An error occurred.');
      mainText.appendChild(errDiv);
      scrollToBottom();
      break;
    }
  }
}

// ── Main send message function ─────────────────────────────────────────────
async function sendMessage() {
  if (isProcessing) return;
  const text = msgInput.value.trim();
  if (!text) return;

  msgInput.value = '';
  msgInput.style.height = 'auto';

  // Remove welcome screen if present
  const welcome = messagesEl.querySelector('.welcome');
  if (welcome) welcome.remove();

  isProcessing = true;
  sendBtn.disabled = true;
  setStatus('busy', 'Agent working...');

  addUserMessage(text);
  const ctx = createAgentMessage();

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Split on double newline (SSE message boundary)
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const part of parts) {
        const line = part.split('\n').find(l => l.startsWith('data: '));
        if (!line) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type !== 'end') handleEvent(ctx, event);
        } catch (_) { /* skip malformed */ }
      }
    }
  } catch (err) {
    handleEvent(ctx, { type: 'error', text: `Connection error: ${err.message}` });
  } finally {
    isProcessing = false;
    sendBtn.disabled = false;
    setStatus('ready', 'Ready');
    loadInputFiles();
  }
}

// ── File list loaders ──────────────────────────────────────────────────────
async function loadInputFiles() {
  try {
    const res = await fetch('/api/files/input');
    const files = await res.json();
    inputFileList.innerHTML = '';
    if (files.length === 0) {
      inputFileList.innerHTML = '<div class="file-empty">Drop PDFs into<br><code>/input</code> folder</div>';
    } else {
      files.forEach(f => {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.innerHTML = `<span class="fi-icon">📄</span><span class="fi-name" title="${f.name}">${f.name}</span><span class="fi-size">${f.sizeMB}MB</span>`;
        inputFileList.appendChild(item);
      });
    }
  } catch (_) {}
}

async function loadOutputFiles() {
  try {
    const res = await fetch('/api/files/output');
    const files = await res.json();
    outputFileList.innerHTML = '';
    if (files.length === 0) {
      outputFileList.innerHTML = '<div class="file-empty">No documents yet</div>';
    } else {
      files.forEach(f => {
        const item = document.createElement('a');
        item.className = 'file-item';
        item.href = `/output-file?name=${encodeURIComponent(f.name)}`;
        item.target = '_blank';
        item.innerHTML = `<span class="fi-icon">✅</span><span class="fi-name" title="${f.name}">${f.name}</span>`;
        outputFileList.appendChild(item);
      });
    }
  } catch (_) {}
}

// ── Scroll to bottom ───────────────────────────────────────────────────────
function scrollToBottom() {
  requestAnimationFrame(() => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

// ── Welcome message ────────────────────────────────────────────────────────
function showWelcome() {
  const div = document.createElement('div');
  div.className = 'welcome';
  div.innerHTML = `
    <div class="welcome-eyebrow">AI Agents</div>
    <div class="welcome-badge">Active</div>
    <h2>SOC 2 Report Analyzer</h2>
    <p>Intelligent agent that automates SOC 2 audit review. Drop PDF reports into the <code>/input</code> folder, then tell me to process them — I'll extract key findings, exceptions, generate remediation plans and mitigating controls.</p>
    <div class="welcome-cards">
      <button class="welcome-card" data-msg="do your magic">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div class="welcome-card-icon">📄</div>
          <span class="welcome-card-badge">PDF Processing</span>
        </div>
        <div class="welcome-card-title">SOC 2 Report Analyzer</div>
        <div class="welcome-card-desc">Scans PDF audit reports and extracts key findings, exceptions, and remediation items automatically.</div>
        <div class="welcome-card-tags">
          <span class="wc-tag">⚡ Gemini</span>
          <span class="wc-tag-type">PDF Processing</span>
        </div>
      </button>
      <button class="welcome-card" data-msg="scan folder">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div class="welcome-card-icon">🔍</div>
          <span class="welcome-card-badge">Scanner</span>
        </div>
        <div class="welcome-card-title">Scan Folder</div>
        <div class="welcome-card-desc">Find all SOC 2 PDF reports available in the input folder and list them for processing.</div>
        <div class="welcome-card-tags">
          <span class="wc-tag">⚡ Gemini</span>
          <span class="wc-tag-type">File System</span>
        </div>
      </button>
      <button class="welcome-card" data-msg="list output">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div class="welcome-card-icon">📋</div>
          <span class="welcome-card-badge">Output</span>
        </div>
        <div class="welcome-card-title">View Generated Docs</div>
        <div class="welcome-card-desc">List all previously generated documentation reports in the output folder.</div>
        <div class="welcome-card-tags">
          <span class="wc-tag">⚡ Gemini</span>
          <span class="wc-tag-type">Reports</span>
        </div>
      </button>
      <button class="welcome-card" data-msg="help">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div class="welcome-card-icon">💡</div>
          <span class="welcome-card-badge">Guide</span>
        </div>
        <div class="welcome-card-title">Help & Commands</div>
        <div class="welcome-card-desc">Learn all available commands and how to use the SOC 2 audit agent effectively.</div>
        <div class="welcome-card-tags">
          <span class="wc-tag">⚡ Gemini</span>
          <span class="wc-tag-type">Documentation</span>
        </div>
      </button>
    </div>
  `;

  div.querySelectorAll('.welcome-card').forEach(btn => {
    btn.addEventListener('click', () => {
      msgInput.value = btn.dataset.msg;
      sendMessage();
    });
  });

  messagesEl.appendChild(div);
}

// ── Init ───────────────────────────────────────────────────────────────────
showWelcome();
loadInputFiles();
loadOutputFiles();
