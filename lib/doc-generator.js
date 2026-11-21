/**
 * Document Generator for Word (.doc) and PDF formats
 * Produces strictly:
 * 1. Title: "Summary del {Chapter}"
 * 2. Sequential page summaries in order
 * 3. Exam questions with their respective answers at the end
 * With professional layout, styling, and visual structure.
 */

const DocGenerator = {
  /**
   * Generates clean formatted Markdown
   */
  generateMarkdown(chapterTitle, contentMarkdown, meta = {}) {
    const timestamp = new Date().toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
    const header = `---
title: "Summary del ${chapterTitle}"
date: "${timestamp}"
pages_summarized: ${meta.totalPages || 'N/A'}
course: "McGraw-Hill English Course"
---

`;
    return header + contentMarkdown;
  },

  /**
   * Strips the redundant leading `# Summary del ...` if already presented in the header banner
   */
  stripLeadingTitle(markdown) {
    if (!markdown) return '';
    return markdown.replace(/^#\s*Summary\s+del\s+[^\r\n]+(?:\r?\n)+/i, '').trim();
  },

  /**
   * Generates a Microsoft Word compatible (.doc) document with Office XML formatting
   */
  generateWordDoc(chapterTitle, contentMarkdown, meta = {}) {
    const timestamp = new Date().toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
    const cleanContent = this.stripLeadingTitle(contentMarkdown);
    const bodyHtml = this.markdownToHtml(cleanContent);

    return `<html xmlns:o='urn:schemas-microsoft-com:office:office' 
xmlns:w='urn:schemas-microsoft-com:office:word' 
xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset='utf-8'>
  <title>Summary del ${this.escapeHtml(chapterTitle)}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page Section1 {
      size: 8.5in 11.0in;
      margin: 1.0in 1.0in 1.0in 1.0in;
      mso-header-margin: 0.5in;
      mso-footer-margin: 0.5in;
      mso-paper-source: 0;
    }
    div.Section1 {
      page: Section1;
    }
    body {
      font-family: 'Calibri', 'Segoe UI', Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1a1a1a;
      background-color: #ffffff;
    }
    .header-banner {
      border-bottom: 3pt solid #2563eb;
      padding-bottom: 14pt;
      margin-bottom: 22pt;
    }
    .doc-badge {
      font-size: 9pt;
      font-weight: bold;
      color: #2563eb;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 5pt;
    }
    h1 {
      font-size: 22pt;
      color: #1e3a8a;
      margin-top: 4pt;
      margin-bottom: 6pt;
      font-weight: bold;
      line-height: 1.25;
    }
    .doc-meta {
      font-size: 9.5pt;
      color: #64748b;
      margin-top: 4pt;
    }
    h2 {
      font-size: 13.5pt;
      color: #1e40af;
      background-color: #f0f7ff;
      border-left: 4.5pt solid #2563eb;
      padding: 7pt 11pt;
      margin-top: 24pt;
      margin-bottom: 10pt;
      font-weight: bold;
      page-break-after: avoid;
    }
    h3 {
      font-size: 11.5pt;
      color: #0f172a;
      margin-top: 14pt;
      margin-bottom: 4pt;
      font-weight: bold;
      page-break-after: avoid;
    }
    p {
      margin-top: 0;
      margin-bottom: 8pt;
    }
    ul, ol {
      margin-top: 0;
      margin-bottom: 10pt;
      padding-left: 20pt;
    }
    li {
      margin-bottom: 4pt;
    }
    strong {
      color: #0f172a;
    }
    hr {
      border: none;
      border-top: 1pt solid #cbd5e1;
      margin: 18pt 0;
    }
    blockquote, .answer-callout {
      background-color: #ecfdf5;
      border-left: 4pt solid #10b981;
      border: 1pt solid #a7f3d0;
      border-left-width: 4.5pt;
      padding: 8pt 12pt;
      margin: 8pt 0 14pt 0;
      color: #065f46;
      font-weight: 500;
      page-break-inside: avoid;
    }
    blockquote strong, .answer-callout strong {
      color: #047857;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12pt 0;
    }
    th, td {
      border: 1pt solid #cbd5e1;
      padding: 6pt 10pt;
      text-align: left;
    }
    th {
      background-color: #f1f5f9;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="Section1">
    <div class="header-banner">
      <div class="doc-badge">McGraw-Hill English Course • Final Exam Study Guide</div>
      <h1>Summary del ${this.escapeHtml(chapterTitle)}</h1>
      <div class="doc-meta">
        ${this.escapeHtml(meta.totalPages ? `Total de páginas analizadas: ${meta.totalPages}` : '')} • Fecha de compilación: ${timestamp}
      </div>
    </div>
    ${bodyHtml}
  </div>
</body>
</html>`;
  },

  /**
   * Generates a clean PDF-optimized HTML document with automatic print dialog
   */
  generatePdfHtml(chapterTitle, contentMarkdown, meta = {}) {
    const timestamp = new Date().toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
    const cleanContent = this.stripLeadingTitle(contentMarkdown);
    const bodyHtml = this.markdownToHtml(cleanContent);

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Summary del ${this.escapeHtml(chapterTitle)}</title>
  <style>
    @page {
      size: letter;
      margin: 20mm 18mm 20mm 18mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.65;
      color: #1e293b;
      background: #f8fafc;
      padding: 30px 16px;
    }
    .container {
      max-width: 860px;
      margin: 0 auto;
      background: #ffffff;
      padding: 44px;
      border-radius: 14px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.06);
      border: 1px solid #e2e8f0;
    }
    .action-bar {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-bottom: 24px;
    }
    .btn-action {
      border: none;
      padding: 10px 18px;
      font-size: 0.88rem;
      font-weight: 700;
      border-radius: 8px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s;
      text-decoration: none;
    }
    .btn-pdf {
      background: #dc2626;
      color: white;
      box-shadow: 0 2px 8px rgba(220, 38, 38, 0.3);
    }
    .btn-pdf:hover {
      background: #b91c1c;
      transform: translateY(-1px);
    }
    .btn-word {
      background: #2563eb;
      color: white;
      box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
    }
    .btn-word:hover {
      background: #1d4ed8;
      transform: translateY(-1px);
    }
    .header-box {
      border-bottom: 3px solid #2563eb;
      padding-bottom: 18px;
      margin-bottom: 28px;
    }
    .badge-course {
      display: inline-block;
      background: #eff6ff;
      color: #1d4ed8;
      font-size: 0.78rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 4px 12px;
      border-radius: 9999px;
      margin-bottom: 10px;
      border: 1px solid #bfdbfe;
    }
    h1 {
      font-size: 1.95rem;
      color: #0f172a;
      line-height: 1.25;
      margin-bottom: 8px;
      font-weight: 800;
    }
    .meta-line {
      font-size: 0.85rem;
      color: #64748b;
    }
    h2 {
      font-size: 1.3rem;
      color: #1e40af;
      background: #f1f5f9;
      border-left: 5px solid #2563eb;
      padding: 9px 14px;
      border-radius: 6px;
      margin-top: 32px;
      margin-bottom: 14px;
      font-weight: 700;
      page-break-after: avoid;
    }
    h3 {
      font-size: 1.08rem;
      color: #0f172a;
      margin-top: 20px;
      margin-bottom: 8px;
      font-weight: 700;
      page-break-after: avoid;
    }
    p {
      margin-bottom: 12px;
    }
    ul, ol {
      margin-bottom: 14px;
      padding-left: 24px;
    }
    li {
      margin-bottom: 5px;
    }
    strong {
      color: #0f172a;
    }
    hr {
      border: 0;
      border-top: 1px solid #cbd5e1;
      margin: 28px 0;
    }
    blockquote, .answer-callout {
      background-color: #ecfdf5;
      border-left: 4px solid #10b981;
      padding: 12px 16px;
      border-radius: 8px;
      color: #065f46;
      margin: 12px 0 20px 0;
      border: 1px solid #a7f3d0;
      border-left-width: 4px;
      page-break-inside: avoid;
    }
    blockquote strong, .answer-callout strong {
      color: #047857;
    }
    @media print {
      body {
        background: white;
        padding: 0;
      }
      .container {
        max-width: 100%;
        padding: 0;
        box-shadow: none;
        border: none;
      }
      .action-bar {
        display: none !important;
      }
      h2 {
        page-break-before: auto;
      }
      blockquote, .answer-callout {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="action-bar">
      <button class="btn-action btn-pdf" onclick="window.print()">📑 Guardar como PDF / Imprimir (Ctrl+P)</button>
    </div>
    <div class="header-box">
      <div class="badge-course">McGraw-Hill English Course • Guía de Estudio para Examen Final</div>
      <h1>Summary del ${this.escapeHtml(chapterTitle)}</h1>
      <div class="meta-line">
        ${this.escapeHtml(meta.totalPages ? `📄 ${meta.totalPages} páginas analizadas` : '')} • 📅 ${timestamp}
      </div>
    </div>
    <main>
      ${bodyHtml}
    </main>
  </div>
  <script>
    if (window.location.search.includes('print=true')) {
      setTimeout(() => window.print(), 600);
    }
  </script>
</body>
</html>`;
  },

  /**
   * Escape HTML utility
   */
  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  /**
   * Markdown to HTML converter with answer callout formatting
   */
  markdownToHtml(md) {
    if (!md) return '';

    let html = md;

    // Convert code blocks
    html = html.replace(/```([a-zA-Z0-9]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      return `<pre><code>${this.escapeHtml(code)}</code></pre>`;
    });

    // Convert inline code
    html = html.replace(/`([^`]+)`/g, (match, code) => {
      return `<code>${this.escapeHtml(code)}</code>`;
    });

    const lines = html.split('\n');
    const processedLines = [];
    let inTable = false;
    let tableRows = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Table line
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        if (!inTable) {
          inTable = true;
          tableRows = [];
        }
        tableRows.push(line);
        continue;
      } else {
        if (inTable) {
          processedLines.push(this.renderTable(tableRows));
          inTable = false;
          tableRows = [];
        }
      }

      // Headers
      if (line.startsWith('# ')) {
        processedLines.push(`<h1>${this.parseInline(line.substring(2))}</h1>`);
      } else if (line.startsWith('## ')) {
        processedLines.push(`<h2>${this.parseInline(line.substring(3))}</h2>`);
      } else if (line.startsWith('### ')) {
        processedLines.push(`<h3>${this.parseInline(line.substring(4))}</h3>`);
      } else if (line.startsWith('#### ')) {
        processedLines.push(`<h4>${this.parseInline(line.substring(5))}</h4>`);
      } else if (line.trim() === '---' || line.trim() === '***') {
        processedLines.push('<hr>');
      } else if (line.trim().startsWith('> ')) {
        processedLines.push(`<blockquote>${this.parseInline(line.trim().substring(2))}</blockquote>`);
      } else if (/^\s*\*{0,2}(?:Respuesta|Answer)\s*(?:correcta)?:?\*{0,2}/i.test(line.trim())) {
        // High-contrast callout for exam answers
        processedLines.push(`<div class="answer-callout">${this.parseInline(line.trim())}</div>`);
      } else if (/^\s*[-*•]\s+/.test(line)) {
        const item = line.replace(/^\s*[-*•]\s+/, '');
        processedLines.push(`<li>${this.parseInline(item)}</li>`);
      } else if (/^\s*\d+\.\s+/.test(line)) {
        const item = line.replace(/^\s*\d+\.\s+/, '');
        processedLines.push(`<li>${this.parseInline(item)}</li>`);
      } else if (line.trim() === '') {
        processedLines.push('');
      } else {
        processedLines.push(`<p>${this.parseInline(line)}</p>`);
      }
    }

    if (inTable) {
      processedLines.push(this.renderTable(tableRows));
    }

    let finalHtml = processedLines.join('\n');
    finalHtml = finalHtml.replace(/((?:<li>.*?<\/li>\s*)+)/g, '<ul>$1</ul>');

    return finalHtml;
  },

  /**
   * Helper to parse markdown table
   */
  renderTable(rows) {
    if (!rows || rows.length === 0) return '';
    let html = '<table>\n';
    let isHeader = true;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i].trim();
      if (/^\|[\s\-:|]+\|$/.test(row)) {
        isHeader = false;
        continue;
      }

      const cells = row
        .split('|')
        .slice(1, -1)
        .map(c => c.trim());

      html += '  <tr>\n';
      for (const cell of cells) {
        if (isHeader) {
          html += `    <th>${this.parseInline(cell)}</th>\n`;
        } else {
          html += `    <td>${this.parseInline(cell)}</td>\n`;
        }
      }
      html += '  </tr>\n';
    }
    html += '</table>';
    return html;
  },

  /**
   * Helper to parse inline markdown
   */
  parseInline(text) {
    if (!text) return '';
    let res = text;
    res = res.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    res = res.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    res = res.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    res = res.replace(/_([^_]+)_/g, '<em>$1</em>');
    return res;
  }
};

// Export
if (typeof self !== 'undefined') {
  self.DocGenerator = DocGenerator;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DocGenerator;
}
