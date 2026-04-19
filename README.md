# SOC 2 Agent Analyzer

An AI-powered local agent that autonomously reads SOC 2 audit reports (PDF), extracts key findings using the Gemini API, and generates a professional unified executive summary — all through a clean chat-driven interface.

---

## What It Does

1. **Scans** a local `input/` folder for SOC 2 PDF reports
2. **Extracts** text from each PDF (supports 100–300+ page reports)
3. **Analyzes** each report with Gemini AI using the AICPA 2017 Trust Services Criteria framework
4. **Generates** a single unified HTML report covering all organizations with:
   - Deviations & Exceptions (mapped to TSC criteria codes)
   - Proposed Remediation Plans (with action steps, owner, timeline)
   - Mitigating Controls identified within the report
5. **Displays** a per-company summary card in the chat with an "Open Unified Report" button

---

## Output Format

The generated report follows the **SOC 2 Claude Skill** framework (AICPA 2017 TSC with 2022 Revised Points of Focus) and is structured as:

- **Company Overview** — auditor, opinion, audit period, Trust Service Categories
- **Deviations & Exceptions** — what failed, TSC criterion, auditor conclusion
- **Proposed Remediation Plans** — actionable steps, priority, owner, timeline
- **Mitigating Controls** — existing controls in the report that address deviations

---

## Tech Stack

- **Backend:** Node.js + Express
- **AI:** Google Gemini API (`gemini-2.0-flash` with fallback chain)
- **PDF Parsing:** `pdf-parse`
- **Frontend:** Vanilla HTML/CSS/JS with SSE (Server-Sent Events) for real-time streaming

---

## Setup

### 1. Clone the repo
```bash
git clone https://github.com/brianbahlmoore-code/SOC-2-Agent-Analyzer.git
cd SOC-2-Agent-Analyzer
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure your API key
Create a `.env` file in the root:
```
GEMINI_API_KEY=your_google_ai_studio_api_key_here
GEMINI_MODEL=gemini-2.0-flash
```

Get a free API key at [aistudio.google.com](https://aistudio.google.com)

### 4. Add your SOC 2 reports
Drop your SOC 2 PDF files into the `input/` folder (created automatically on first run).

### 5. Start the agent
```bash
node server.js
```

Then open [http://localhost:3000](http://localhost:3000) and click **"✨ Do your magic"**.

---

## Usage

| Command | What it does |
|---|---|
| `✨ Do your magic` | Processes all PDFs in `input/` and generates unified report |
| `Scan folder` | Lists PDFs found in the input folder |
| `List output` | Shows previously generated reports |
| `Help` | Shows available commands |

---

## Free Tier Limits (Google AI Studio)

| Model | Daily Limit | Notes |
|---|---|---|
| `gemini-2.0-flash` | ~1M tokens/day | Primary model |
| `gemini-flash-latest` | ~1M tokens/day | Fallback #1 |
| `gemini-2.0-flash-lite-001` | ~1M tokens/day | Fallback #2 |

250 pages ≈ ~125,000 tokens. The free tier handles 3 reports easily.
Quota resets at **midnight Pacific Time** daily.

---

## Project Structure

```
├── server.js              # Express server + agent pipeline
├── public/
│   ├── index.html         # Chat UI
│   ├── app.js             # Frontend SSE handler + summary cards
│   └── style.css          # Chat UI styles
├── agent/
│   ├── ai-processor.js    # Gemini API calls + retry/fallback logic
│   ├── extractor.js       # PDF → text extraction
│   ├── scanner.js         # Input/output folder scanning
│   └── template-engine.js # HTML report generator (unified)
├── input/                 # (gitignored) Drop SOC 2 PDFs here
├── output/                # (gitignored) Generated HTML reports saved here
├── .env                   # (gitignored) Your API key
└── package.json
```

---

## Author

**Brian Bahl Moore**  
[LinkedIn](https://linkedin.com/in/brianbahl) · [Portfolio](https://brianbahlmoore-code.github.io/)

---

*Framework: AICPA 2017 Trust Services Criteria (2022 Revised Points of Focus)*
