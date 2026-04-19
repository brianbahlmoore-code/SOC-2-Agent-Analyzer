require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { scanForPDFs, scanOutputFiles } = require('./agent/scanner');
const { extractTextFromPDF } = require('./agent/extractor');
const { processWithAI } = require('./agent/ai-processor');
const { generateUnifiedReport } = require('./agent/template-engine');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;
const INPUT_DIR = path.join(__dirname, 'input');
const OUTPUT_DIR = path.join(__dirname, 'output');

// Ensure input and output dirs exist
if (!fs.existsSync(INPUT_DIR)) fs.mkdirSync(INPUT_DIR, { recursive: true });
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Intent Detection ──────────────────────────────────────────────────────
function detectIntent(message) {
  const m = message.toLowerCase().trim();
  if (m.includes('help') || m.includes('what can you do') || m.includes('how')) return 'help';
  if (m.includes('scan') || m.includes('how many') || m.includes('list') || m.includes('find')) return 'scan';
  if (m.includes('open') || m.includes('output') || m.includes('generated')) return 'list_output';
  // Specific file mention
  const pdfMatch = message.match(/([^\s]+\.pdf)/i);
  if (pdfMatch) return { type: 'document_one', filename: pdfMatch[1] };
  // Default: document all
  if (m.includes('document') || m.includes('process') || m.includes('run') ||
      m.includes('all') || m.includes('report') || m.includes('start') || m.includes('go') ||
      m.includes('magic')) {
    return 'document_all';
  }
  return 'unknown';
}

// ─── Agent Pipeline ────────────────────────────────────────────────────────
async function runAgent(message, send) {
  const intent = detectIntent(message);

  if (intent === 'help') {
    send('msg', { text: `Here's what I can do:\n\n• **"document all reports"** — Scan the input folder, read every SOC 2 PDF, and generate a documented HTML report for each one in the output folder.\n• **"scan folder"** — List all PDF files found in the input folder.\n• **"list output"** — Show all generated documentation files.\n• **"process [filename].pdf"** — Process a specific file only.\n\nJust drop your SOC 2 PDFs into the **input/** folder and tell me to document them!` });
    return;
  }

  if (intent === 'list_output') {
    const files = scanOutputFiles(OUTPUT_DIR);
    if (files.length === 0) {
      send('msg', { text: '📂 No output files yet. Run "document all reports" first!' });
    } else {
      send('msg', { text: `📄 **${files.length} documented report(s):**\n${files.map(f => `• ${f.name}`).join('\n')}` });
    }
    return;
  }

  if (intent === 'scan') {
    send('step', { text: '🔍 Scanning input folder...' });
    const files = scanForPDFs(INPUT_DIR);
    if (files.length === 0) {
      send('msg', { text: '📂 No PDF files found in the **input/** folder.\n\nDrop your SOC 2 reports into:\n`' + INPUT_DIR + '`' });
    } else {
      const list = files.map(f => `• **${f.name}** (${f.sizeMB} MB)`).join('\n');
      send('msg', { text: `📂 Found **${files.length}** PDF report(s):\n\n${list}` });
    }
    return;
  }

  if (intent === 'unknown') {
    send('msg', { text: `I'm not sure what you mean. Try:\n• "document all reports"\n• "scan folder"\n• "help"` });
    return;
  }

  // ── DOCUMENT ALL or DOCUMENT ONE ─────────────────────────────────────────
  send('step', { text: '🔍 Scanning input folder for SOC 2 reports...' });
  let files = scanForPDFs(INPUT_DIR);

  if (intent.type === 'document_one') {
    files = files.filter(f => f.name.toLowerCase() === intent.filename.toLowerCase());
    if (files.length === 0) {
      send('msg', { text: `❌ File **${intent.filename}** not found in the input folder.` });
      return;
    }
  }

  if (files.length === 0) {
    send('msg', { text: `📂 No PDF files found in:\n\`${INPUT_DIR}\`\n\nPlease drop your SOC 2 reports into the **input/** folder and try again.` });
    return;
  }

  send('found', { text: `📂 Found **${files.length}** report(s) to process.`, files: files.map(f => f.name) });

  const results = [];
  const aiEntries = [];  // Collect AI data for unified report
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    send('progress', { text: `\n─────────────────────────────\n📄 [${i + 1}/${files.length}] **${file.name}** (${file.sizeMB} MB)`, file: file.name });

    // Step 1: Extract text
    send('step', { text: `   ⏳ Extracting text from PDF...` });
    const extracted = await extractTextFromPDF(file.path);
    if (!extracted.success) {
      send('step', { text: `   ❌ Failed to extract text: ${extracted.error}` });
      results.push({ file: file.name, success: false, error: extracted.error });
      continue;
    }
    send('step', { text: `   ✅ Extracted ${extracted.pages} pages (${Math.round(extracted.text.length / 1000)}k chars)` });

    // Step 2: AI analysis
    send('step', { text: `   🤖 Analyzing with Gemini AI... (this may take 15–30 seconds)` });
    let data;
    try {
      data = await processWithAI(extracted.text, API_KEY, (attempt, waitSec, msg) => {
        if (msg) {
          send('step', { text: `   🔄 ${msg}` });
        } else {
          send('step', { text: `   ⏳ Rate limited — retrying in ${waitSec}s (attempt ${attempt}/3)...` });
        }
      });
      const controlCount = Array.isArray(data.controls) ? data.controls.length : 0;
      const exceptionCount = Array.isArray(data.exceptions) ? data.exceptions.length : 0;
      send('step', { text: `   ✅ AI identified: ${data.serviceOrganization || 'org'} | ${data.reportType || 'SOC 2'} | ${controlCount} controls | ${exceptionCount} exception(s)` });
      aiEntries.push({ data, sourceFilename: file.name });
      results.push({ file: file.name, success: true });
    } catch (err) {
      send('step', { text: `   ❌ AI processing failed: ${err.message}` });
      results.push({ file: file.name, success: false, error: err.message });
      // If daily quota is exhausted, stop processing remaining files
      if (err.message && err.message.includes('Daily Gemini')) {
        send('msg', { text: '⛔ **Daily quota exhausted.** The free tier allows a limited number of requests per day.\n\n**To continue processing today:** Enable billing at https://console.cloud.google.com/billing\n\n**Otherwise:** Quota resets at midnight Pacific Time — try again tomorrow.' });
        break;
      }
      continue;
    }

    // Cooldown between files to avoid per-minute rate limits
    if (i < files.length - 1) {
      send('step', { text: `   ⏸ Cooling down 5s before next file...` });
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  // ── Generate unified report ───────────────────────────────────────────
  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  if (aiEntries.length > 0) {
    send('step', { text: `\n📝 Generating unified report for ${aiEntries.length} organization(s)...` });
    try {
      const output = generateUnifiedReport(aiEntries, OUTPUT_DIR);
      send('step', { text: `   ✅ Saved: **${output.filename}**` });

      // Build chat summary text
      let summary = `\n🎉 **Done! ${succeeded.length}/${files.length} report(s) analyzed.**\n`;
      summary += `\n📄 **Unified Report:** ${output.filename}\n`;
      output.summaryData.forEach(c => {
        summary += `\n• **${c.company}** — ${c.opinion} Opinion | ${c.exceptions} deviation(s) | ${c.remediations} remediation(s) | ${c.mitigating} mitigating control(s)`;
      });
      if (failed.length > 0) {
        summary += `\n\n❌ **Failed:**\n` + failed.map(r => `• ${r.file}: ${r.error}`).join('\n');
      }

      send('done', {
        text: summary,
        reportFilename: output.filename,
        summaryData: output.summaryData,
        results
      });
    } catch (err) {
      send('error', { text: `❌ Report generation failed: ${err.message}` });
    }
  } else {
    let summary = `\n❌ **No reports could be processed.**\n`;
    if (failed.length > 0) {
      summary += failed.map(r => `• ${r.file}: ${r.error}`).join('\n');
    }
    send('done', { text: summary, results });
  }
}

// ─── SSE Chat Endpoint ─────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'No message' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  const send = (type, payload) => {
    res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
  };

  try {
    await runAgent(message, send);
  } catch (err) {
    send('error', { text: `❌ Unexpected error: ${err.message}` });
  } finally {
    send('end', {});
    res.end();
  }
});

// ─── File List APIs ────────────────────────────────────────────────────────
app.get('/api/files/input', (req, res) => {
  res.json(scanForPDFs(INPUT_DIR));
});

app.get('/api/files/output', (req, res) => {
  res.json(scanOutputFiles(OUTPUT_DIR));
});

// ─── Serve Generated HTML Output Files ────────────────────────────────────
app.get('/output-file', (req, res) => {
  const name = req.query.name;
  if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) {
    return res.status(400).send('Invalid filename.');
  }
  const filePath = path.join(OUTPUT_DIR, name);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found.');
  }
  res.sendFile(filePath);
});

// ─── Demo Endpoint (Portfolio Embed) ──────────────────────────────────────
// Uses pre-extracted PDF text from demo-data/*.json — no file upload needed.
app.post('/api/demo', async (req, res) => {
  const DEMO_DIR = path.join(__dirname, 'demo-data');
  const demoFiles = [
    { key: 'github',   label: 'GitHub SOC 2 Type II (2025)',       file: 'github.json' },
    { key: 'onetrust', label: 'OneTrust Certification Automation', file: 'onetrust.json' },
    { key: 'vanta',    label: 'Vanta SOC 2 Type II (2025)',        file: 'vanta.json' },
  ];

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  });

  const send = (type, payload) => {
    res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
  };

  try {
    send('step', { text: '🔍 Loading pre-extracted SOC 2 reports...' });
    send('found', { text: `📂 Found **${demoFiles.length}** demo report(s).`, files: demoFiles.map(f => f.label) });

    const aiEntries = [];
    const results = [];

    for (let i = 0; i < demoFiles.length; i++) {
      const df = demoFiles[i];
      send('progress', { text: `\n─────────────────────────────\n📄 [${i + 1}/${demoFiles.length}] **${df.label}**`, file: df.label });

      const jsonPath = path.join(DEMO_DIR, df.file);
      if (!fs.existsSync(jsonPath)) {
        send('step', { text: `   ❌ Demo data not found: ${df.file}` });
        results.push({ file: df.label, success: false, error: 'Demo data missing' });
        continue;
      }

      const { text, pages } = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      send('step', { text: `   ✅ Loaded ${pages} pages from demo data` });
      send('step', { text: `   🤖 Analyzing with Gemini AI... (this may take 15–30 seconds)` });

      try {
        const data = await processWithAI(text, API_KEY, (attempt, waitSec, msg) => {
          if (msg) send('step', { text: `   🔄 ${msg}` });
          else send('step', { text: `   ⏳ Rate limited — retrying in ${waitSec}s (attempt ${attempt}/3)...` });
        });
        const exceptCount = Array.isArray(data.exceptions) ? data.exceptions.length : 0;
        send('step', { text: `   ✅ ${data.serviceOrganization || df.label} | ${data.reportType || 'SOC 2'} | ${exceptCount} exception(s)` });
        aiEntries.push({ data, sourceFilename: df.label });
        results.push({ file: df.label, success: true });
      } catch (err) {
        send('step', { text: `   ❌ AI failed: ${err.message}` });
        results.push({ file: df.label, success: false, error: err.message });
        if (err.message && err.message.includes('Daily Gemini')) {
          send('msg', { text: '⛔ **Daily quota exhausted.** Quota resets at midnight Pacific Time.' });
          break;
        }
        continue;
      }

      if (i < demoFiles.length - 1) {
        send('step', { text: `   ⏸ Cooling down 5s...` });
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    const succeeded = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    if (aiEntries.length > 0) {
      send('step', { text: `\n📝 Generating unified report for ${aiEntries.length} organization(s)...` });
      const output = generateUnifiedReport(aiEntries, OUTPUT_DIR);
      send('step', { text: `   ✅ Saved: **${output.filename}**` });

      let summary = `\n🎉 **Done! ${succeeded.length}/${demoFiles.length} reports analyzed.**\n`;
      output.summaryData.forEach(c => {
        summary += `\n• **${c.company}** — ${c.opinion} Opinion | ${c.exceptions} deviation(s) | ${c.remediations} remediation(s) | ${c.mitigating} mitigating control(s)`;
      });
      if (failed.length > 0) summary += `\n\n❌ **Failed:**\n` + failed.map(r => `• ${r.file}: ${r.error}`).join('\n');

      send('done', { text: summary, reportFilename: output.filename, summaryData: output.summaryData, results });
    } else {
      send('done', { text: `\n❌ No reports could be processed.\n` + failed.map(r => `• ${r.file}: ${r.error}`).join('\n'), results });
    }
  } catch (err) {
    send('error', { text: `❌ Demo error: ${err.message}` });
  } finally {
    send('end', {});
    res.end();
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅ SOC 2 Audit Agent running at http://localhost:${PORT}`);
  console.log(`📁 Input folder:  ${INPUT_DIR}`);
  console.log(`📁 Output folder: ${OUTPUT_DIR}`);
  console.log(`🤖 AI Engine:     Gemini 3.1 Pro\n`);
});
