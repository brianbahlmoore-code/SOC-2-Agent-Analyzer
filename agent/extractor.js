const fs = require('fs');

/**
 * Extracts raw text from a PDF file using pdf-parse.
 * Note: Works on text-based PDFs. Scanned/image PDFs require OCR.
 */
async function extractTextFromPDF(filePath) {
  try {
    // Use internal path to avoid pdf-parse running its own tests on require
    const pdfParse = require('pdf-parse/lib/pdf-parse.js');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);

    return {
      text: data.text,
      pages: data.numpages,
      info: data.info || {},
      success: true
    };
  } catch (err) {
    return {
      text: '',
      pages: 0,
      info: {},
      success: false,
      error: err.message
    };
  }
}

module.exports = { extractTextFromPDF };
