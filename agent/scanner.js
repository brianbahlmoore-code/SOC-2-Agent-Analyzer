const fs = require('fs');
const path = require('path');

/**
 * Recursively scans a directory for PDF files.
 * @param {string} dir - Directory path to scan
 * @returns {Array} - Array of file objects {name, path, size, sizeMB, modified}
 */
function scanForPDFs(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    return [];
  }

  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...scanForPDFs(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
      const stat = fs.statSync(fullPath);
      files.push({
        name: entry.name,
        path: fullPath,
        size: stat.size,
        sizeMB: (stat.size / (1024 * 1024)).toFixed(2),
        modified: stat.mtime.toISOString()
      });
    }
  }

  return files;
}

/**
 * Lists output HTML files already generated.
 * @param {string} dir - Output directory path
 */
function scanOutputFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.html'))
    .map(f => ({ name: f, path: path.join(dir, f) }));
}

module.exports = { scanForPDFs, scanOutputFiles };
