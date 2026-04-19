const { GoogleGenerativeAI } = require('@google/generative-ai');

const EXTRACTION_PROMPT = `You are a senior SOC 2 audit expert and GRC consultant. Analyze this SOC 2 report comprehensively. Extract findings, exceptions, and generate professional remediation plans and mitigating controls.

Return ONLY valid JSON (no markdown, no code blocks) with this exact structure:

{
  "serviceOrganization": "Name of company being audited",
  "systemDescription": "Description of the system/service audited",
  "serviceName": "Name of the service or product",
  "auditPeriod": { "from": "Start date", "to": "End date" },
  "reportDate": "Date the report was issued",
  "reportType": "Type I or Type II",
  "auditor": {
    "firmName": "Name of CPA/auditing firm",
    "location": "City, State of auditor",
    "signedBy": "Signing partner name if available"
  },
  "trustServiceCategories": ["Security", "Availability", "Processing Integrity", "Confidentiality", "Privacy"],
  "scope": "Description of what is in scope",
  "systemBoundary": "Description of the system boundary",
  "infrastructureComponents": ["list of key infrastructure items"],
  "dataCategories": ["types of data processed"],
  "controls": [
    {
      "criterionId": "CC1.1",
      "category": "Common Criteria",
      "subcategory": "Control Environment",
      "description": "Brief description of the criterion",
      "controlActivity": "Control in place",
      "testingProcedure": "How auditor tested it",
      "testingResult": "No exceptions noted",
      "hasException": false
    }
  ],
  "keyFindings": [
    {
      "id": "F-001",
      "title": "Short title of the finding",
      "severity": "High",
      "category": "Access Control",
      "description": "Detailed description of what was found",
      "affectedCriteria": ["CC6.1", "CC6.2"],
      "isException": true
    }
  ],
  "exceptions": [
    {
      "criterionId": "CC X.X",
      "controlDescription": "Description of the control that had an exception",
      "exceptionDescription": "What the exception was",
      "auditorConclusion": "Auditor conclusion about the exception",
      "severity": "High or Medium or Low",
      "affectedArea": "Brief description of what area is affected"
    }
  ],
  "remediationPlans": [
    {
      "findingId": "F-001",
      "findingTitle": "Short title of the finding being remediated",
      "priority": "Immediate or Short-term or Long-term",
      "description": "Detailed remediation approach",
      "actionSteps": [
        "Step 1: Specific action to take",
        "Step 2: Another specific action",
        "Step 3: Validation step"
      ],
      "timeline": "30 days",
      "estimatedEffort": "Low or Medium or High",
      "owner": "Responsible team (e.g. IT Security, DevOps, Compliance)"
    }
  ],
  "mitigatingControls": [
    {
      "findingId": "F-001",
      "findingTitle": "Finding this control addresses",
      "controlName": "Name of the mitigating control",
      "controlType": "Preventive or Detective or Corrective or Compensating",
      "description": "How this control mitigates the risk",
      "implementationGuidance": "Practical steps to implement this control",
      "framework": "NIST CSF or ISO 27001 or CIS Controls (reference framework)",
      "effectiveness": "High or Medium or Low"
    }
  ],
  "opinion": "Unqualified or Qualified or Adverse or Disclaimer of Opinion",
  "opinionText": "Summary of the auditor opinion",
  "managementAssertion": "Summary of management assertion",
  "complementaryUserEntityControls": ["list of CUECs"],
  "subserviceOrganizations": [{ "name": "Name", "services": "Services provided", "method": "Carve-out or Inclusive" }],
  "keyRisks": ["key risks identified"]
}

IMPORTANT INSTRUCTIONS:
- keyFindings: Extract ALL notable findings, not just exceptions. Include observations, recommendations, and exceptions. Rate severity as High/Medium/Low/Informational.
- remediationPlans: Create a UNIQUE, ACTIONABLE plan for EVERY finding in keyFindings. Make steps specific and practical.
- mitigatingControls: Suggest at least one mitigating control per finding. Be specific about implementation.
- exceptions: Extract all actual audit exceptions (where controls failed testing).
- If no exceptions exist, return empty arrays for exceptions, but still populate keyFindings with observations.
- Extract as many controls as possible from the controls section.

SOC 2 REPORT TEXT:
`;

// ── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parses a 429 error body to determine:
 *  - isDaily: true if the daily quota is exhausted (permanent until reset)
 *  - retryAfterMs: suggested wait time in ms (from RetryInfo)
 */
function parse429(err) {
  const msg = err.message || '';

  // Check for daily quota exhaustion
  const isDaily = msg.includes('PerDay') || msg.includes('per_day');

  // Extract suggested retry delay (e.g. "32.664458371s")
  const delayMatch = msg.match(/retryDelay["\s:]+(\d+(?:\.\d+)?)s/);
  const retryAfterMs = delayMatch ? Math.ceil(parseFloat(delayMatch[1]) * 1000) : 60000;

  return { isDaily, retryAfterMs };
}

// ── Main AI Processor with Retry Logic ──────────────────────────────────────

// Fallback model chain — if the primary model's quota is hit, try the next
const MODEL_FALLBACKS = [
  process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  'gemini-flash-latest',
  'gemini-2.0-flash-lite-001'
];

async function processWithAI(text, apiKey, onRetry) {
  const genAI = new GoogleGenerativeAI(apiKey);

  // Truncate: keep first 180k chars to stay within free-tier context
  const MAX = 180000;
  let processedText = text.length > MAX
    ? text.slice(0, MAX) + '\n\n[... truncated for quota efficiency ...]'
    : text;

  const fullPrompt = EXTRACTION_PROMPT + processedText;
  const MAX_RETRIES = 3;

  // Try each model in the fallback chain
  for (let modelIdx = 0; modelIdx < MODEL_FALLBACKS.length; modelIdx++) {
    const modelName = MODEL_FALLBACKS[modelIdx];
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 8192
      }
    });

    if (onRetry && modelIdx > 0) {
      onRetry(0, 0, `Switching to fallback model: ${modelName}`);
    }

    let attempt = 0;
    let lastErr;

    while (attempt <= MAX_RETRIES) {
      try {
        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        return JSON.parse(response.text());

      } catch (err) {
        lastErr = err;
        const is429 = err.message && err.message.includes('429');

        if (!is429) throw err; // Non-quota errors bubble immediately

        const { isDaily, retryAfterMs } = parse429(err);

        if (isDaily) {
          // Daily quota hit for this model — try next model in chain
          break;
        }

        attempt++;
        if (attempt > MAX_RETRIES) break;

        const waitSec = Math.ceil(retryAfterMs / 1000);
        if (onRetry) onRetry(attempt, waitSec);
        await sleep(retryAfterMs + 2000);
      }
    }

    // If we get here on the last model, throw a clear error
    if (modelIdx === MODEL_FALLBACKS.length - 1) {
      throw new Error(
        '🚫 Daily Gemini API free-tier quota exhausted on all available models. ' +
        'Quota resets at midnight Pacific Time. ' +
        'To process reports now, enable billing at https://console.cloud.google.com/billing'
      );
    }
  }
}

module.exports = { processWithAI };
