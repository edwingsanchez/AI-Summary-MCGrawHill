/**
 * MHE English Study Summarizer - Service Worker (Background script)
 */

importScripts('../lib/ai-service.js', '../lib/doc-generator.js');

// Global State
let loopState = {
  isLoopRunning: false,
  status: 'IDLE', // 'IDLE' | 'SUMMARIZING' | 'NAVIGATING' | 'COMPLETED' | 'ERROR'
  message: 'Listo para iniciar',
  initialChapterId: null,
  initialChapterTitle: null,
  currentChapterTitle: null,
  initialUnitId: null,
  initialUnitTitle: null,
  currentUnitTitle: null,
  pageSummaries: [],
  omittedPagesCount: 0,
  finalSummaryMarkdown: null,
  finalHtml: null,
  activeTabId: null,
  lastUpdated: Date.now()
};

/**
 * Broadcast current state to active tab HUD and storage
 */
async function syncState(customMessage = null) {
  if (customMessage) {
    loopState.message = customMessage;
  }
  loopState.lastUpdated = Date.now();

  const activeChapTitle = loopState.currentChapterTitle || loopState.initialChapterTitle || loopState.currentUnitTitle || 'Chapter 1';

  // Save state to chrome storage so popup can read it
  await chrome.storage.local.set({
    loopState: {
      isLoopRunning: loopState.isLoopRunning,
      status: loopState.status,
      message: loopState.message,
      chapterTitle: activeChapTitle,
      unitTitle: activeChapTitle,
      pagesCount: loopState.pageSummaries.length,
      omittedPagesCount: loopState.omittedPagesCount || 0,
      hasCompletedDoc: !!loopState.finalSummaryMarkdown,
      finalSummaryMarkdown: loopState.finalSummaryMarkdown,
      finalHtml: loopState.finalHtml
    }
  });

  // Notify content script HUD if tab is active
  if (loopState.activeTabId) {
    try {
      chrome.tabs.sendMessage(loopState.activeTabId, {
        action: 'UPDATE_HUD_STATE',
        data: {
          status: loopState.status,
          message: loopState.message,
          chapterTitle: activeChapTitle,
          unitTitle: activeChapTitle,
          pagesCount: loopState.pageSummaries.length,
          omittedPagesCount: loopState.omittedPagesCount || 0,
          hasCompletedDoc: !!loopState.finalSummaryMarkdown
        }
      });
    } catch (e) {
      // Tab may be closed or reloading
    }
  }
}

/**
 * Get active McGraw-Hill tab
 */
async function getActiveMheTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs && tabs[0] && tabs[0].url && tabs[0].url.includes('mheducation.com')) {
    return tabs[0];
  }

  // Fallback: any mheducation tab
  const allMheTabs = await chrome.tabs.query({ url: '*://*.mheducation.com/*' });
  if (allMheTabs && allMheTabs.length > 0) {
    return allMheTabs[0];
  }

  return tabs[0] || null;
}

/**
 * Load user settings from storage
 */
async function getSettings() {
  const data = await chrome.storage.sync.get(['provider', 'geminiKey', 'deepseekKey', 'model', 'downloadFormat', 'omitExercises']);
  const provider = data.provider || 'gemini';
  const apiKey = provider === 'gemini' ? (data.geminiKey || '') : (data.deepseekKey || '');
  const model = data.model || (provider === 'gemini' ? 'gemini-3.8-flash' : 'deepseek-flash');
  const downloadFormat = data.downloadFormat || 'word';
  const omitExercises = data.omitExercises !== false; // Default true (omit exercises)

  return { provider, apiKey, model, downloadFormat, omitExercises };
}

/**
 * START THE AUTOMATED MULTI-PAGE SUMMARIZATION LOOP
 */
async function startUnitLoop() {
  if (loopState.isLoopRunning) {
    console.log('[MHE Summarizer] Loop is already running.');
    return;
  }

  const tab = await getActiveMheTab();
  if (!tab || !tab.id) {
    loopState.status = 'ERROR';
    await syncState('No se encontró pestaña activa de McGraw-Hill.');
    return;
  }
  loopState.activeTabId = tab.id;

  const { provider, apiKey, model } = await getSettings();
  if (!apiKey || apiKey.trim() === '') {
    loopState.status = 'ERROR';
    await syncState(`Falta la API Key de ${provider.toUpperCase()}. Configúrala en la extensión.`);
    return;
  }

  // Reset accumulator
  loopState.isLoopRunning = true;
  loopState.pageSummaries = [];
  loopState.omittedPagesCount = 0;
  loopState.finalSummaryMarkdown = null;
  loopState.finalHtml = null;
  loopState.initialChapterId = null;
  loopState.initialChapterTitle = null;
  loopState.currentChapterTitle = null;
  loopState.initialUnitId = null;
  loopState.initialUnitTitle = null;
  loopState.currentUnitTitle = null;

  try {
    // 1. Extract initial page
    loopState.status = 'SUMMARIZING';
    await syncState('Extrayendo contenido de la página actual...');

    let pageData = await sendMessageToTab(tab.id, { action: 'EXTRACT_PAGE_DATA' });

    if (!pageData || !pageData.text || pageData.text.length < 30) {
      // Small pause and retry in case reader was still rendering
      await new Promise(r => setTimeout(r, 1500));
      pageData = await sendMessageToTab(tab.id, { action: 'EXTRACT_PAGE_DATA' });
    }

    if (!pageData || !pageData.text || pageData.text.length < 30) {
      throw new Error('No se pudo extraer texto del libro. Asegúrate de tener una página abierta.');
    }

    loopState.initialChapterId = pageData.chapterId || pageData.unitId;
    loopState.initialChapterTitle = pageData.chapterTitle || pageData.unitTitle;
    loopState.currentChapterTitle = loopState.initialChapterTitle;
    loopState.initialUnitId = loopState.initialChapterId;
    loopState.initialUnitTitle = loopState.initialChapterTitle;
    loopState.currentUnitTitle = loopState.initialChapterTitle;

    console.log(`[MHE Summarizer] Inició Capítulo: "${loopState.initialChapterTitle}" (ID: ${loopState.initialChapterId})`);

    // Main multi-page loop
    while (loopState.isLoopRunning) {
      const pageNumStr = pageData.pageNum ? `Pág. ${pageData.pageNum}` : pageData.position;

      // 1.5 CHECK: OMIT EXERCISE PAGES
      const settings = await getSettings();
      if (settings.omitExercises && pageData.isExercise) {
        loopState.omittedPagesCount = (loopState.omittedPagesCount || 0) + 1;
        console.log(`[MHE Summarizer] Omitiendo página de ejercicios ${pageNumStr}: ${pageData.exerciseReason}`);
        await syncState(`[OMITIDA - ${pageNumStr}] Ejercicios detectados (${pageData.exerciseReason || 'Práctica'}). Pasando a siguiente página...`);

        // Navigate to next page immediately without calling AI
        const navResult = await sendMessageToTab(tab.id, { action: 'CLICK_NEXT_PAGE' });
        if (!navResult || navResult.reason === 'END_OF_BOOK') {
          console.log('[MHE Summarizer] Fin del libro alcanzado tras omitir ejercicios.');
          break;
        }

        if (!loopState.isLoopRunning) break;

        // Extract new page data
        const nextPageData = await sendMessageToTab(tab.id, { action: 'EXTRACT_PAGE_DATA' });
        if (!nextPageData) break;

        // Check if new Chapter started
        const newChapId = nextPageData.chapterId || nextPageData.unitId;
        if (newChapId && loopState.initialChapterId && newChapId !== loopState.initialChapterId) {
          console.log(`[MHE Summarizer] ¡Nuevo Capítulo detectado tras omitir ejercicios! Deteniendo avance.`);
          break;
        }

        pageData = nextPageData;
        loopState.currentChapterTitle = pageData.chapterTitle || pageData.unitTitle;
        loopState.currentUnitTitle = loopState.currentChapterTitle;
        continue; // Cycle again to process or check next page
      }

      loopState.status = 'SUMMARIZING';
      await syncState(`[PROCESANDO ${pageNumStr}] Extrayendo y resumiendo con ${model}...`);

      // 2. Generate summary of current page with retry and fallback
      let pageSummary = '';
      try {
        pageSummary = await AIService.summarizePage({
          provider,
          apiKey,
          model,
          unitTitle: loopState.initialChapterTitle,
          pageNum: pageData.pageNum || pageData.position,
          pageTitle: pageData.pageTitle,
          textContent: pageData.text,
          onStatus: async (technicalStatus) => {
            await syncState(technicalStatus);
          }
        });
      } catch (pageErr) {
        console.warn(`[MHE Summarizer] Error en página ${pageNumStr}:`, pageErr);
        // Resilient fallback for individual page: keep text excerpt so loop doesn't abort
        pageSummary = `📌 **Resumen local de emergencia:**\n${pageData.text.substring(0, 400)}...\n\n*(Nota: la API reportó: ${pageErr.message})*`;
      }

      loopState.pageSummaries.push({
        pageNum: pageData.pageNum || (loopState.pageSummaries.length + 1),
        pageTitle: pageData.pageTitle,
        summary: pageSummary
      });

      console.log(`[MHE Summarizer] Resumida ${pageNumStr}. Total acumulado: ${loopState.pageSummaries.length} páginas.`);

      if (!loopState.isLoopRunning) break;

      // 3. Navigate to next page
      loopState.status = 'NAVIGATING';
      await syncState(`[NAVEGACIÓN] ${pageNumStr} completada. Avanzando a la siguiente página...`);

      const navResult = await sendMessageToTab(tab.id, { action: 'CLICK_NEXT_PAGE' });

      if (!navResult || navResult.reason === 'END_OF_BOOK') {
        console.log('[MHE Summarizer] Fin del libro alcanzado.');
        break;
      }

      if (!navResult.success) {
        console.warn('[MHE Summarizer] Aviso de navegación:', navResult.reason);
      }

      if (!loopState.isLoopRunning) break;

      // 4. Extract new page data
      const nextPageData = await sendMessageToTab(tab.id, { action: 'EXTRACT_PAGE_DATA' });
      if (!nextPageData) {
        throw new Error('Error al leer la siguiente página.');
      }

      // 5. CHECK CHAPTER BOUNDARY: Has a new Chapter started?
      const newChapId = nextPageData.chapterId || nextPageData.unitId;
      if (newChapId && loopState.initialChapterId && newChapId !== loopState.initialChapterId) {
        console.log(`[MHE Summarizer] ¡Nuevo Capítulo detectado! Cambió de [${loopState.initialChapterId}] a [${newChapId}]. Deteniendo avance.`);
        break; // Stop loop, we have completed the current chapter!
      }

      pageData = nextPageData;
      loopState.currentChapterTitle = pageData.chapterTitle || pageData.unitTitle;
      loopState.currentUnitTitle = loopState.currentChapterTitle;
    }

    // 6. FINALIZE CHAPTER: High-Speed Synthesis + Exam Generator + Heartbeat
    if (loopState.pageSummaries.length > 0) {
      loopState.status = 'SUMMARIZING';
      const synthesisStart = Date.now();

      // Heartbeat timer keeps Manifest V3 Service Worker alive and updates technical elapsed time
      let elapsedSec = 0;
      const heartbeat = setInterval(async () => {
        elapsedSec += 2;
        await syncState(`[FASE 2/3] Generando Simulador de Examen con ${model}... (⏱ ${elapsedSec}s)`);
      }, 2000);

      try {
        await syncState(`[FASE 1/3] Compilando extractos de ${loopState.pageSummaries.length} páginas...`);

        const masterDoc = await AIService.synthesizeUnitAndGenerateExam({
          provider,
          apiKey,
          model,
          unitTitle: loopState.initialChapterTitle,
          totalPages: loopState.pageSummaries.length,
          pageSummaries: loopState.pageSummaries,
          onStatus: async (technicalMsg) => {
            await syncState(technicalMsg);
          }
        });

        clearInterval(heartbeat);
        const totalDuration = ((Date.now() - synthesisStart) / 1000).toFixed(1);

        await syncState(`[FASE 3/3] Estructurando documento Word y PDF...`);

        loopState.finalSummaryMarkdown = DocGenerator.generateMarkdown(
          loopState.initialChapterTitle,
          masterDoc,
          { totalPages: loopState.pageSummaries.length, omittedPages: loopState.omittedPagesCount, model }
        );

        loopState.finalWordDoc = DocGenerator.generateWordDoc(
          loopState.initialChapterTitle,
          masterDoc,
          { totalPages: loopState.pageSummaries.length, omittedPages: loopState.omittedPagesCount, model }
        );

        loopState.finalPdfHtml = DocGenerator.generatePdfHtml(
          loopState.initialChapterTitle,
          masterDoc,
          { totalPages: loopState.pageSummaries.length, omittedPages: loopState.omittedPagesCount, model }
        );

        loopState.status = 'COMPLETED';
        loopState.isLoopRunning = false;
        await syncState(`¡Summary del ${loopState.initialChapterTitle} completado en ${totalDuration}s!`);

      } catch (synthError) {
        clearInterval(heartbeat);
        console.warn('[MHE Summarizer] Fallo en la síntesis remota con IA, activando compilación de respaldo local:', synthError);

        // RESILIENT FALLBACK: Never lose user data!
        const fallbackDoc = AIService.buildLocalFallbackDocument(
          loopState.initialChapterTitle,
          loopState.pageSummaries,
          synthError.message
        );

        loopState.finalSummaryMarkdown = DocGenerator.generateMarkdown(
          loopState.initialChapterTitle,
          fallbackDoc,
          { totalPages: loopState.pageSummaries.length, omittedPages: loopState.omittedPagesCount, model }
        );

        loopState.finalWordDoc = DocGenerator.generateWordDoc(
          loopState.initialChapterTitle,
          fallbackDoc,
          { totalPages: loopState.pageSummaries.length, omittedPages: loopState.omittedPagesCount, model }
        );

        loopState.finalPdfHtml = DocGenerator.generatePdfHtml(
          loopState.initialChapterTitle,
          fallbackDoc,
          { totalPages: loopState.pageSummaries.length, omittedPages: loopState.omittedPagesCount, model }
        );

        loopState.status = 'COMPLETED';
        loopState.isLoopRunning = false;
        await syncState(`¡Guía compilada con éxito! (Respaldo local activado: ${synthError.message.substring(0, 50)}...)`);
      }
    } else {
      loopState.status = 'IDLE';
      loopState.isLoopRunning = false;
      await syncState('Proceso cancelado antes de resumir páginas.');
    }

  } catch (error) {
    console.error('[MHE Summarizer] Error en el ciclo:', error);
    loopState.status = 'ERROR';
    loopState.isLoopRunning = false;
    await syncState(`Error: ${error.message}`);
  }
}

/**
 * Summarize just the current viewed page (single page mode)
 */
async function summarizeSinglePage() {
  const tab = await getActiveMheTab();
  if (!tab || !tab.id) {
    loopState.status = 'ERROR';
    await syncState('No se encontró pestaña activa de McGraw-Hill.');
    return;
  }
  loopState.activeTabId = tab.id;

  const { provider, apiKey, model } = await getSettings();
  if (!apiKey || apiKey.trim() === '') {
    loopState.status = 'ERROR';
    await syncState(`Falta la API Key de ${provider.toUpperCase()}.`);
    return;
  }

  try {
    loopState.status = 'SUMMARIZING';
    await syncState('Extrayendo texto de la página actual...');

    const pageData = await sendMessageToTab(tab.id, { action: 'EXTRACT_PAGE_DATA' });
    if (!pageData || !pageData.text || pageData.text.length < 30) {
      throw new Error('Texto insuficiente en la página. Abre el visor del libro.');
    }

    loopState.initialUnitTitle = pageData.unitTitle;
    loopState.currentUnitTitle = pageData.unitTitle;

    await syncState(`Generando resumen de ${pageData.position} con ${provider.toUpperCase()}...`);

    const pageSummary = await AIService.summarizePage({
      provider,
      apiKey,
      model,
      unitTitle: pageData.unitTitle,
      pageNum: pageData.pageNum || pageData.position,
      pageTitle: pageData.pageTitle,
      textContent: pageData.text
    });

    loopState.pageSummaries = [{
      pageNum: pageData.pageNum || 1,
      pageTitle: pageData.pageTitle,
      summary: pageSummary
    }];

    loopState.finalSummaryMarkdown = DocGenerator.generateMarkdown(
      pageData.unitTitle,
      `# Resumen de ${pageData.pageTitle} (${pageData.position})\n\n${pageSummary}`,
      { totalPages: 1, model }
    );

    loopState.finalHtml = DocGenerator.generateStyledHtml(
      pageData.unitTitle,
      `# Resumen de ${pageData.pageTitle} (${pageData.position})\n\n${pageSummary}`,
      { totalPages: 1, model }
    );

    loopState.status = 'COMPLETED';
    await syncState('Resumen de página completado.');
  } catch (err) {
    loopState.status = 'ERROR';
    await syncState(`Error: ${err.message}`);
  }
}

/**
 * Stop loop safely
 */
async function stopLoop() {
  loopState.isLoopRunning = false;
  if (loopState.status === 'SUMMARIZING' || loopState.status === 'NAVIGATING') {
    loopState.status = 'IDLE';
    await syncState('Proceso detenido por el usuario.');
  }
}

/**
 * Trigger file download of the generated study guide in Word or PDF format
 */
async function triggerDownload(format = null) {
  if (!loopState.finalSummaryMarkdown && !loopState.finalWordDoc && !loopState.finalPdfHtml) {
    console.warn('[MHE Summarizer] No hay documento generado para descargar.');
    return;
  }

  const { downloadFormat } = await getSettings();
  const chosenFormat = format || downloadFormat || 'word';

  // Use the exact Chapter Name in the filename: "Summary_del_Chapter_4_Inclusion_in_a_Diverse_Workplace"
  const rawTitle = loopState.initialChapterTitle || loopState.currentChapterTitle || loopState.initialUnitTitle || 'Chapter_1';
  const cleanTitle = rawTitle.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

  let fileContent = '';
  let filename = '';
  let mimeType = '';

  if (chosenFormat === 'pdf') {
    // Open viewer.html with print=true so user can directly save as PDF with Chrome print dialog
    const viewerUrl = chrome.runtime.getURL('viewer.html?print=true');
    chrome.tabs.create({ url: viewerUrl });
    return;
  } else {
    // Default format: Word document (.doc)
    fileContent = loopState.finalWordDoc || loopState.finalHtml || loopState.finalSummaryMarkdown;
    filename = `Summary_del_${cleanTitle}.doc`;
    mimeType = 'application/msword;charset=utf-8';

    const base64Data = btoa(unescape(encodeURIComponent(fileContent)));
    const dataUrl = `data:${mimeType};base64,${base64Data}`;

    chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: true
    });
  }
}

/**
 * Helper to send message to tab with error handling
 */
function sendMessageToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[MHE Summarizer] Message error:', chrome.runtime.lastError.message);
        resolve(null);
      } else {
        resolve(response);
      }
    });
  });
}

// Runtime Message Listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'START_UNIT_LOOP') {
    startUnitLoop();
    sendResponse({ ok: true });
    return true;
  }

  if (request.action === 'SUMMARIZE_SINGLE_PAGE') {
    summarizeSinglePage();
    sendResponse({ ok: true });
    return true;
  }

  if (request.action === 'STOP_LOOP') {
    stopLoop();
    sendResponse({ ok: true });
    return true;
  }

  if (request.action === 'TRIGGER_DOWNLOAD') {
    triggerDownload(request.format);
    sendResponse({ ok: true });
    return true;
  }

  if (request.action === 'GET_STATE') {
    sendResponse({
      loopState: {
        isLoopRunning: loopState.isLoopRunning,
        status: loopState.status,
        message: loopState.message,
        chapterTitle: loopState.currentChapterTitle || loopState.initialChapterTitle,
        unitTitle: loopState.currentUnitTitle || loopState.initialUnitTitle,
        pagesCount: loopState.pageSummaries.length,
        omittedPagesCount: loopState.omittedPagesCount || 0,
        hasCompletedDoc: !!loopState.finalSummaryMarkdown,
        finalSummaryMarkdown: loopState.finalSummaryMarkdown
      }
    });
    return true;
  }
});
