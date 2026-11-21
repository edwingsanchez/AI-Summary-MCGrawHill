/**
 * MHE English Study Summarizer - Document Viewer Script
 */

document.addEventListener('DOMContentLoaded', async () => {
  const chapterDocTitle = document.getElementById('chapter-doc-title');
  const chapterDocMeta = document.getElementById('chapter-doc-meta');
  const documentBody = document.getElementById('document-body');
  const toolbarTitle = document.getElementById('toolbar-title');

  const btnPrintPdf = document.getElementById('btn-print-pdf');
  const btnDownloadWord = document.getElementById('btn-download-word');
  const btnCopyContent = document.getElementById('btn-copy-content');

  // Load state from chrome storage
  const data = await chrome.storage.local.get(['loopState']);
  const loopState = data.loopState || {};

  const chapterTitle = loopState.chapterTitle || loopState.unitTitle || 'Chapter 1';
  const pagesCount = loopState.pagesCount || (loopState.pageSummaries ? loopState.pageSummaries.length : 0);
  const markdown = loopState.finalSummaryMarkdown || '';
  const timestamp = new Date().toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });

  // Update Page Title and Metadata
  document.title = `Summary del ${chapterTitle}`;
  chapterDocTitle.textContent = `Summary del ${chapterTitle}`;
  const omittedCount = loopState.omittedPagesCount || 0;
  toolbarTitle.textContent = `Summary del ${chapterTitle}`;
  chapterDocMeta.textContent = `${pagesCount ? `📄 ${pagesCount} páginas de teoría analizadas${omittedCount ? ` (${omittedCount} páginas de ejercicios omitidas)` : ''} • ` : ''}📅 Fecha: ${timestamp}`;

  if (markdown) {
    const cleanContent = typeof DocGenerator !== 'undefined'
      ? DocGenerator.stripLeadingTitle(markdown)
      : markdown.replace(/^#\s*Summary\s+del\s+[^\r\n]+(?:\r?\n)+/i, '').trim();

    const bodyHtml = typeof DocGenerator !== 'undefined'
      ? DocGenerator.markdownToHtml(cleanContent)
      : cleanContent;

    documentBody.innerHTML = bodyHtml;
  } else {
    documentBody.innerHTML = `
      <div class="empty-state">
        <h3>No se encontró resumen activo</h3>
        <p style="margin-top: 8px;">Abre el libro de McGraw-Hill, abre la extensión y haz clic en <strong>▶ Iniciar Resumen (Play)</strong>.</p>
      </div>
    `;
  }

  // Button actions
  btnPrintPdf.addEventListener('click', () => {
    window.print();
  });

  btnDownloadWord.addEventListener('click', () => {
    if (typeof DocGenerator === 'undefined' || !markdown) {
      chrome.runtime.sendMessage({ action: 'TRIGGER_DOWNLOAD', format: 'word' });
      return;
    }

    const wordContent = DocGenerator.generateWordDoc(chapterTitle, markdown, { totalPages: pagesCount, omittedPages: omittedCount });
    const cleanFilenameTitle = chapterTitle.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    const filename = `Summary_del_${cleanFilenameTitle}.doc`;
    const mimeType = 'application/msword;charset=utf-8';
    const base64Data = btoa(unescape(encodeURIComponent(wordContent)));
    const dataUrl = `data:${mimeType};base64,${base64Data}`;

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  btnCopyContent.addEventListener('click', async () => {
    if (!markdown) return;
    await navigator.clipboard.writeText(markdown);
    btnCopyContent.textContent = '✓ ¡Copiado!';
    setTimeout(() => { btnCopyContent.textContent = '📋 Copiar'; }, 2000);
  });

  // Automatically trigger print dialog if requested
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('print') === 'true' || urlParams.get('autoPrint') === 'true') {
    setTimeout(() => {
      window.print();
    }, 500);
  }
});
