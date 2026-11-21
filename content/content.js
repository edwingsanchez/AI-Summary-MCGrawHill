/**
 * MHE English Study Summarizer - Content Script
 * Runs in McGraw-Hill Reader pages (main frame and iframes)
 */

(function () {
  // 1. NEUTRALIZE ANTI-COPY MEASURES IMMEDIATELY
  function disableCopyProtection() {
    try {
      document.body?.removeAttribute('oncopy');
      document.body?.removeAttribute('oncut');
      document.body?.removeAttribute('oncontextmenu');
      document.body?.removeAttribute('onselectstart');

      if (typeof window.oncopy !== 'undefined') window.oncopy = null;
      if (typeof document.oncopy !== 'undefined') document.oncopy = null;
      if (typeof window.oncut !== 'undefined') window.oncut = null;
      if (typeof document.oncut !== 'undefined') document.oncut = null;

      document.body?.classList.add('mhe-copy-enabled');

      // Stop page scripts from intercepting Ctrl+C in capture phase
      window.addEventListener('copy', (e) => {
        e.stopImmediatePropagation();
      }, true);

      window.addEventListener('cut', (e) => {
        e.stopImmediatePropagation();
      }, true);

      window.addEventListener('contextmenu', (e) => {
        e.stopImmediatePropagation();
      }, true);
    } catch (e) {
      console.warn('[MHE Summarizer] Copy unblocker warning:', e);
    }
  }

  // Run on load and periodically in case McGraw-Hill re-renders
  disableCopyProtection();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', disableCopyProtection);
  }
  setInterval(disableCopyProtection, 3000);

  // If this script is running inside a sub-frame, its job is just anti-copy unblocking
  if (window !== window.top) {
    return;
  }

  // ==========================================
  // TOP FRAME CONTROLLER & EXTRACTION LOGIC
  // ==========================================
  console.log('[MHE Summarizer] Content script loaded in top window.');

  /**
   * Extract clean text and metadata from the reader
   */
  function extractPageData() {
    let rawText = '';
    let pageTitle = '';
    let sourceUsed = 'none';
    let pageHeadings = [];
    let domFlags = { interactiveInputs: 0 };

    // Strategy 1: Check #clo-iframe (Standard McGraw-Hill single page reader)
    const cloIframe = document.querySelector('#clo-iframe, iframe[data-automation-id="clo-iframe"]');
    if (cloIframe) {
      const srcdoc = cloIframe.getAttribute('srcdoc');
      if (srcdoc && srcdoc.trim().length > 0) {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(srcdoc, 'text/html');
          cleanReaderDocument(doc);
          pageTitle = doc.querySelector('title')?.innerText?.trim() || doc.querySelector('h1, h2')?.innerText?.trim() || '';
          pageHeadings = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, .activity-title, .exercise-header'))
            .map(el => el.innerText?.trim())
            .filter(Boolean);
          domFlags.interactiveInputs = doc.querySelectorAll('input[type="text"], textarea, .question-container, [data-automation-id*="exercise"]').length;
          rawText = extractTextFromDoc(doc);
          sourceUsed = 'clo-iframe-srcdoc';
        } catch (err) {
          console.warn('[MHE Summarizer] Error parsing srcdoc:', err);
        }
      }

      // Fallback: direct iframe contentDocument
      if (!rawText || rawText.length < 50) {
        try {
          if (cloIframe.contentDocument && cloIframe.contentDocument.body) {
            const doc = cloIframe.contentDocument;
            pageTitle = pageTitle || doc.querySelector('title')?.innerText?.trim() || doc.querySelector('h1, h2')?.innerText?.trim() || '';
            if (pageHeadings.length === 0) {
              pageHeadings = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, .activity-title, .exercise-header'))
                .map(el => el.innerText?.trim())
                .filter(Boolean);
            }
            domFlags.interactiveInputs = doc.querySelectorAll('input[type="text"], textarea, .question-container, [data-automation-id*="exercise"]').length;
            rawText = cloIframe.contentDocument.body.innerText || '';
            sourceUsed = 'clo-iframe-contentDocument';
          }
        } catch (e) {
          // cross-origin restriction if any
        }
      }
    }

    // Strategy 2: Check Dual-Page View (#left-iframe and #right-iframe)
    if (!rawText || rawText.length < 50) {
      const leftIframe = document.querySelector('#left-iframe');
      const rightIframe = document.querySelector('#right-iframe');
      let combined = '';

      if (leftIframe) {
        combined += extractIframeContent(leftIframe, 'Left Page');
      }
      if (rightIframe) {
        combined += (combined ? '\n\n--- [Página Derecha] ---\n\n' : '') + extractIframeContent(rightIframe, 'Right Page');
      }

      if (combined.trim().length > 50) {
        rawText = combined;
        sourceUsed = 'dual-iframes';
      }
    }

    // Strategy 3: Check Top-level Epub Container
    if (!rawText || rawText.length < 50) {
      const mainContainer = document.querySelector('[data-automation-id="epub-viewer-main"], .rdrx-content-region, reader-core-epub-ui-viewer');
      if (mainContainer) {
        rawText = mainContainer.innerText || '';
        sourceUsed = 'main-container';
      }
    }

    // Check active TOC section node label for exercise indicators
    const activeTocNode = document.querySelector('mat-tree-node[aria-current="page"], mat-tree-node .material-toc-current-page-indicator');
    if (activeTocNode) {
      const parentNode = activeTocNode.closest('mat-tree-node') || activeTocNode;
      const tocLabel = parentNode.getAttribute('aria-label') || parentNode.innerText?.trim();
      if (tocLabel) {
        pageHeadings.push(tocLabel);
      }
    }

    // Clean up extracted text
    const cleanText = sanitizeExtractedText(rawText);
    const chapterInfo = detectCurrentChapter();
    const positionInfo = detectPosition();

    // Check whether the page is an exercise/practice page
    const exerciseCheck = detectExercisePage(pageTitle, cleanText, pageHeadings, domFlags);

    return {
      text: cleanText,
      pageTitle: pageTitle || positionInfo.raw || 'Página Actual',
      unitId: chapterInfo.id,
      unitTitle: chapterInfo.title,
      chapterId: chapterInfo.id,
      chapterTitle: chapterInfo.title,
      position: positionInfo.raw,
      pageNum: positionInfo.current,
      totalPages: positionInfo.total,
      source: sourceUsed,
      isExercise: exerciseCheck.isExercise,
      exerciseReason: exerciseCheck.reason
    };
  }

  /**
   * Helper to extract content from an iframe element
   */
  function extractIframeContent(iframe, label) {
    if (!iframe) return '';
    try {
      const srcdoc = iframe.getAttribute('srcdoc');
      if (srcdoc && srcdoc.trim().length > 0) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(srcdoc, 'text/html');
        cleanReaderDocument(doc);
        return extractTextFromDoc(doc);
      }
    } catch (e) {}

    try {
      if (iframe.contentDocument && iframe.contentDocument.body) {
        return iframe.contentDocument.body.innerText || '';
      }
    } catch (e) {}

    return '';
  }

  /**
   * Remove unwanted tags, annotations, credit styles from parsed document
   */
  function cleanReaderDocument(doc) {
    if (!doc) return;
    const selectorsToRemove = [
      'script',
      'style',
      'noscript',
      '.mhe-inline-credit',
      '.annotation',
      '#MathJax_Message',
      '[aria-hidden="true"]',
      '.dpg-icon'
    ];
    selectorsToRemove.forEach((sel) => {
      doc.querySelectorAll(sel).forEach((el) => el.remove());
    });
  }

  /**
   * Traverse document and collect clean structured text
   */
  function extractTextFromDoc(doc) {
    if (!doc || !doc.body) return '';

    const blocks = [];
    const elements = doc.body.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, blockquote, dt, dd, table');

    if (elements.length > 0) {
      elements.forEach((el) => {
        const tag = el.tagName.toLowerCase();
        const text = el.innerText?.trim();
        if (!text) return;

        if (tag.startsWith('h')) {
          blocks.push(`\n### ${text}\n`);
        } else if (tag === 'li') {
          blocks.push(`• ${text}`);
        } else {
          blocks.push(text);
        }
      });
      return blocks.join('\n\n');
    }

    return doc.body.innerText || '';
  }

  /**
   * Remove boilerplate, duplicate spacing, and reader artifacts
   */
  function sanitizeExtractedText(text) {
    if (!text) return '';
    let cleaned = text;

    // Remove pseudo-element artifact markers
    cleaned = cleaned.replace(/(Started|Underline Started|Circle Started|Box Started|Highlight Started|Placemark Started)/gi, '');
    cleaned = cleaned.replace(/\.mhe-inline-credit\s*\{\s*display:\s*none\s*\}/gi, '');

    // Normalize whitespace
    cleaned = cleaned.replace(/\r\n/g, '\n');
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    return cleaned.trim();
  }

  /**
   * Intelligently detects whether the current page is an exercise / practice page
   * to omit it from summarization and study guides.
   */
  function detectExercisePage(pageTitle = '', text = '', headings = [], domFlags = {}) {
    const lowerTitle = (pageTitle || '').toLowerCase();
    const cleanHeadings = (headings || []).map(h => (h || '').trim().toLowerCase()).filter(Boolean);

    // 1. Explicit Title or Heading matches for exercises/practice
    // e.g. "Exercises", "Practice 1", "Grammar Practice", "Activity 3", "Self-Assessment", "Workbook", "Vocabulary Practice"
    const explicitExerciseKeywords = [
      'exercise', 'exercises', 'practice', 'activities', 'activity', 'workbook',
      'self-assessment', 'self assessment', 'self-test', 'self test', 'quiz',
      'comprehension check', 'check your understanding', 'grammar practice',
      'vocabulary practice', 'language practice', 'pronunciation practice',
      'listening practice', 'reading practice', 'writing practice', 'speaking practice',
      'review exercises', 'chapter review', 'pair work', 'group work', 'role play',
      'your turn', 'over to you', 'test your knowledge', 'test yourself',
      'ejercicio', 'ejercicios', 'práctica', 'practica', 'actividades', 'actividad',
      'autoevaluación', 'autoevaluacion', 'repaso', 'cuestionario'
    ];

    const hasExplicitTitleMatch = explicitExerciseKeywords.some(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(lowerTitle)) return true;
      return cleanHeadings.some(h => h.length < 60 && regex.test(h));
    });

    if (hasExplicitTitleMatch) {
      const matchedName = pageTitle || cleanHeadings.find(h => explicitExerciseKeywords.some(k => new RegExp(`\\b${k}\\b`, 'i').test(h))) || 'Ejercicios';
      return {
        isExercise: true,
        reason: `Página de ejercicios/práctica identificada por título ("${matchedName}")`
      };
    }

    // 2. Count fill-in-the-blank patterns: "___", ".....", "[   ]"
    const blankMatches = (text.match(/_{3,}|\.{4,}|\[\s{2,}\]|\(\s*blank\s*\)/g) || []).length;

    // 3. Exercise instruction phrases
    const exerciseInstructionRegex = /\b(complete the (following|sentences?|table|chart|text|dialogue|conversations?)|fill in the (blanks?|missing)|match the (words?|columns?|definitions?|items?|headings?|questions?)|circle the (correct|best)|choose the (correct|best) (word|words|option|answer)|write the correct form|underline the correct|in pairs,? (ask|discuss|compare|practice)|work with a partner|listen and (repeat|choose|fill|complete|circle)|answer the questions below|mark (each|the) statement (true|false)|true or false\??|unscramble the words|put the words in (order|the correct order)|rewrite the sentences)\b/i;
    const hasExerciseInstruction = exerciseInstructionRegex.test(text);

    // 4. Count numbered exercise items: "1. ____", "2. ____", "1) ...", etc.
    const numberedExerciseLines = (text.match(/^\s*(?:[1-9]\d?|[a-f])[\.\)]\s+.*(?:_{2,}|\.{3,}|\[|\b(?:is|are|was|were|do|does|did|can|could|would)\b.*\?)/gim) || []).length;

    // 5. Calculate word count of text
    const totalWords = text.trim().split(/\s+/).filter(w => w.length > 0).length;

    // Case A: High concentration of blanks (3+) with exercise instructions or numbered prompts
    if (blankMatches >= 3 && (hasExerciseInstruction || numberedExerciseLines >= 2)) {
      return {
        isExercise: true,
        reason: `Hoja de actividades (${blankMatches} espacios para rellenar / prompts de práctica)`
      };
    }

    // Case B: 4 or more numbered exercise prompts with short total text (worksheet without theory)
    if (numberedExerciseLines >= 4 && (totalWords < 350 || hasExerciseInstruction)) {
      return {
        isExercise: true,
        reason: `Cuestionario de ejercicios (${numberedExerciseLines} preguntas de práctica sin texto teórico)`
      };
    }

    // Case C: Multiple choice exercise questions without theoretical exposition
    const mcOptionCount = (text.match(/^\s*[A-D]\)\s+/gim) || []).length;
    if (mcOptionCount >= 6 && totalWords < 400) {
      return {
        isExercise: true,
        reason: `Cuestionario de opción múltiple (${mcOptionCount} opciones de respuesta sin teoría)`
      };
    }

    // Case D: Interactive DOM input elements
    if (domFlags.interactiveInputs && domFlags.interactiveInputs >= 2) {
      return {
        isExercise: true,
        reason: `Elementos interactivos de evaluación detectados (${domFlags.interactiveInputs} campos de respuesta)`
      };
    }

    return {
      isExercise: false,
      reason: null
    };
  }

  /**
   * Detect the current Chapter (e.g. "Chapter 4: Inclusion in a Diverse Workplace")
   */
  function detectCurrentChapter() {
    // Method 1: Check Table of Contents tree nodes in drawer
    const tocNodes = Array.from(document.querySelectorAll('mat-tree-node'));
    if (tocNodes.length > 0) {
      // Find the current active leaf node
      const activeNodeIndex = tocNodes.findIndex((node) => {
        return node.getAttribute('aria-current') === 'page' ||
               node.querySelector('[data-automation-id="material-toc-current-page-indicator"]') !== null;
      });

      if (activeNodeIndex !== -1) {
        // Look backwards from the active node to find the enclosing level 0 node (Chapter)
        for (let i = activeNodeIndex; i >= 0; i--) {
          const level = tocNodes[i].getAttribute('data-level');
          if (level === '0') {
            const label = tocNodes[i].getAttribute('aria-label') || tocNodes[i].innerText?.trim();
            if (label) {
              const formattedTitle = formatChapterTitle(label);
              return {
                id: normalizeChapterId(formattedTitle),
                title: formattedTitle
              };
            }
          }
        }
      }

      // Check expanded level 0 node
      const expandedLevel0 = tocNodes.find((node) => {
        return node.getAttribute('data-level') === '0' && node.classList.contains('expanded-node');
      });
      if (expandedLevel0) {
        const label = expandedLevel0.getAttribute('aria-label') || expandedLevel0.innerText?.trim();
        if (label) {
          const formattedTitle = formatChapterTitle(label);
          return {
            id: normalizeChapterId(formattedTitle),
            title: formattedTitle
          };
        }
      }
    }

    // Method 2: Inspect clo-iframe base href or srcdoc URL
    const cloIframe = document.querySelector('#clo-iframe');
    if (cloIframe) {
      const srcdoc = cloIframe.getAttribute('srcdoc') || '';
      const baseMatch = srcdoc.match(/chapter(\d+)|unit(\d+)/i);
      if (baseMatch) {
        const num = parseInt(baseMatch[1] || baseMatch[2], 10);
        // Try to find the full title from TOC matching this chapter number
        const matchingTocNode = tocNodes.find((n) => {
          const lbl = (n.getAttribute('aria-label') || '').toLowerCase();
          return n.getAttribute('data-level') === '0' && (lbl.includes(`chapter ${num}`) || lbl.includes(`unit ${num}`));
        });

        if (matchingTocNode) {
          const fullLabel = matchingTocNode.getAttribute('aria-label') || matchingTocNode.innerText?.trim();
          const formatted = formatChapterTitle(fullLabel);
          return {
            id: `Chapter ${num}`,
            title: formatted
          };
        }

        return {
          id: `Chapter ${num}`,
          title: `Chapter ${num}`
        };
      }
    }

    // Method 3: Check document title or position
    const title = document.title;
    if (title && (title.includes('Unit') || title.includes('Chapter') || title.includes('Tema') || title.includes('Capítulo'))) {
      const formattedTitle = formatChapterTitle(title);
      return {
        id: normalizeChapterId(formattedTitle),
        title: formattedTitle
      };
    }

    return {
      id: 'Chapter 1',
      title: 'Chapter 1'
    };
  }

  function formatChapterTitle(str) {
    if (!str) return 'Chapter 1';
    let formatted = str.trim();

    // Replace "Unit" or "Tema" or "Capítulo" with "Chapter"
    formatted = formatted.replace(/^(?:Unit|Tema|Capítulo)\s*(\d+)/i, 'Chapter $1');

    // Ensure it starts with "Chapter X" if a number exists
    const match = formatted.match(/(?:Chapter|Unit|Tema|Capítulo)\s*(\d+)[:\s]*(.*)/i);
    if (match) {
      const num = match[1];
      const rest = match[2]?.trim();
      if (rest) {
        return `Chapter ${num}: ${rest}`;
      }
      return `Chapter ${num}`;
    }

    return formatted;
  }

  function normalizeChapterId(str) {
    if (!str) return 'chapter-default';
    const match = str.match(/Chapter\s*(\d+)/i);
    if (match) {
      return `Chapter ${match[1]}`;
    }
    return str.split(':')[0].trim();
  }

  /**
   * Detect current page position (e.g., "46 of 504")
   */
  function detectPosition() {
    const el = document.querySelector('[data-automation-id="position-indicator"]');
    if (el) {
      const txt = el.innerText.trim();
      const match = txt.match(/(\d+)\s+of\s+(\d+)/i);
      if (match) {
        return {
          raw: txt,
          current: parseInt(match[1], 10),
          total: parseInt(match[2], 10)
        };
      }
      return { raw: txt, current: 0, total: 0 };
    }
    return { raw: '1 of 1', current: 1, total: 1 };
  }

  /**
   * Click the Next Page button in McGraw-Hill Reader
   */
  async function clickNextPage() {
    const nextBtn = document.querySelector(
      'button[data-automation-id="nav-forward-paginate-button"], #next-button, button.page-nav.next, reader-core-forward-button button'
    );

    if (!nextBtn) {
      return { success: false, reason: 'BUTTON_NOT_FOUND' };
    }

    // Check if next button is disabled
    const isDisabled = nextBtn.disabled ||
                       nextBtn.hasAttribute('disabled') ||
                       nextBtn.getAttribute('aria-disabled') === 'true' ||
                       nextBtn.classList.contains('disabled');

    if (isDisabled) {
      return { success: false, reason: 'END_OF_BOOK' };
    }

    const previousPos = detectPosition().raw;
    const prevSrcdoc = document.querySelector('#clo-iframe')?.getAttribute('srcdoc') || '';

    // Click the next page button
    nextBtn.click();

    // Wait for the reader to flip page and load new content
    const transitioned = await waitForPageTransition(previousPos, prevSrcdoc);
    return { success: transitioned, reason: transitioned ? null : 'TRANSITION_TIMEOUT' };
  }

  /**
   * Wait for position indicator or iframe srcdoc to change
   */
  function waitForPageTransition(oldPos, oldSrcdoc, maxWaitMs = 6000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const interval = setInterval(() => {
        const currentPos = detectPosition().raw;
        const currentSrcdoc = document.querySelector('#clo-iframe')?.getAttribute('srcdoc') || '';

        const posChanged = currentPos && currentPos !== oldPos;
        const srcdocChanged = currentSrcdoc && currentSrcdoc !== oldSrcdoc;

        if (posChanged || srcdocChanged) {
          clearInterval(interval);
          // Allow 800ms for Angular / DOM rendering to stabilize
          setTimeout(() => resolve(true), 800);
          return;
        }

        if (Date.now() - startTime > maxWaitMs) {
          clearInterval(interval);
          // Timeout reached, proceed anyway
          resolve(true);
        }
      }, 250);
    });
  }

  // ==========================================
  // FLOATING ON-PAGE HUD / WIDGET
  // ==========================================
  let hudElement = null;

  function createFloatingHUD() {
    if (document.getElementById('mhe-summarizer-hud')) return;

    hudElement = document.createElement('div');
    hudElement.id = 'mhe-summarizer-hud';
    hudElement.innerHTML = `
      <div class="mhe-hud-header" id="mhe-hud-drag-handle">
        <div class="mhe-hud-title">
          <span class="mhe-hud-icon">⚡</span>
          <span>MHE Study Summarizer</span>
        </div>
        <div class="mhe-hud-controls">
          <button class="mhe-hud-btn-toggle" id="mhe-hud-toggle" title="Minimizar / Expandir">▼</button>
        </div>
      </div>
      <div class="mhe-hud-body">
        <div class="mhe-info-row">
          <span class="mhe-info-label">Current Chapter:</span>
          <span class="mhe-info-value" id="mhe-hud-chapter">Cargando...</span>
        </div>
        <div class="mhe-info-row">
          <span class="mhe-info-label">Página:</span>
          <span class="mhe-info-value" id="mhe-hud-page">--</span>
        </div>
        <div class="mhe-status-badge status-idle" id="mhe-hud-status-badge">
          <span class="mhe-status-dot"></span>
          <span id="mhe-hud-status-text">Listo para iniciar</span>
        </div>
        <div class="mhe-actions">
          <button class="mhe-btn mhe-btn-play" id="mhe-hud-btn-play">▶ Iniciar Capítulo</button>
          <button class="mhe-btn mhe-btn-stop" id="mhe-hud-btn-stop" style="display: none;">⏹ Detener</button>
        </div>
        <div class="mhe-download-group">
          <button class="mhe-btn-dl mhe-btn-word disabled" id="mhe-hud-btn-word" disabled title="Descargar en Word (.doc)">
            📄 Word (.doc)
          </button>
          <button class="mhe-btn-dl mhe-btn-pdf disabled" id="mhe-hud-btn-pdf" disabled title="Guardar en PDF (.pdf)">
            📑 PDF (.pdf)
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(hudElement);

    // Minimize toggle
    const toggleBtn = hudElement.querySelector('#mhe-hud-toggle');
    toggleBtn.addEventListener('click', () => {
      hudElement.classList.toggle('mhe-minimized');
      toggleBtn.textContent = hudElement.classList.contains('mhe-minimized') ? '▲' : '▼';
    });

    // Button actions
    hudElement.querySelector('#mhe-hud-btn-play').addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'START_UNIT_LOOP' });
    });

    hudElement.querySelector('#mhe-hud-btn-stop').addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'STOP_LOOP' });
    });

    hudElement.querySelector('#mhe-hud-btn-word').addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'TRIGGER_DOWNLOAD', format: 'word' });
    });

    hudElement.querySelector('#mhe-hud-btn-pdf').addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'TRIGGER_DOWNLOAD', format: 'pdf' });
    });

    // Make HUD draggable
    makeDraggable(hudElement, hudElement.querySelector('#mhe-hud-drag-handle'));

    // Initial info update
    updateHUDInfo();
  }

  function updateHUDInfo(stateData = null) {
    if (!hudElement) return;
    const chapter = detectCurrentChapter();
    const pos = detectPosition();

    const chapterEl = hudElement.querySelector('#mhe-hud-chapter');
    const pageEl = hudElement.querySelector('#mhe-hud-page');

    if (chapterEl) chapterEl.textContent = chapter.title || 'Chapter 1';
    if (pageEl) {
      if (stateData && stateData.omittedPagesCount && stateData.omittedPagesCount > 0) {
        pageEl.textContent = `${pos.raw || '--'} (${stateData.omittedPagesCount} ejerc. omitidos)`;
      } else {
        pageEl.textContent = pos.raw || '--';
      }
    }
  }

  function updateHUDState(stateData) {
    if (!hudElement) createFloatingHUD();

    const badge = hudElement.querySelector('#mhe-hud-status-badge');
    const statusText = hudElement.querySelector('#mhe-hud-status-text');
    const playBtn = hudElement.querySelector('#mhe-hud-btn-play');
    const stopBtn = hudElement.querySelector('#mhe-hud-btn-stop');
    const btnWord = hudElement.querySelector('#mhe-hud-btn-word');
    const btnPdf = hudElement.querySelector('#mhe-hud-btn-pdf');

    if (!badge || !statusText) return;

    badge.className = 'mhe-status-badge';
    updateHUDInfo(stateData);

    function setHudDlState(active) {
      if (btnWord) {
        btnWord.className = active ? 'mhe-btn-dl mhe-btn-word active' : 'mhe-btn-dl mhe-btn-word disabled';
        btnWord.disabled = !active;
      }
      if (btnPdf) {
        btnPdf.className = active ? 'mhe-btn-dl mhe-btn-pdf active' : 'mhe-btn-dl mhe-btn-pdf disabled';
        btnPdf.disabled = !active;
      }
    }

    switch (stateData.status) {
      case 'IDLE':
        badge.classList.add('status-idle');
        statusText.textContent = 'Listo para iniciar';
        playBtn.style.display = 'flex';
        stopBtn.style.display = 'none';
        setHudDlState(stateData.hasCompletedDoc);
        break;

      case 'SUMMARIZING':
        badge.classList.add('status-summarizing');
        statusText.textContent = stateData.message || 'Resumiendo página...';
        playBtn.style.display = 'none';
        stopBtn.style.display = 'flex';
        setHudDlState(false);
        break;

      case 'NAVIGATING':
        badge.classList.add('status-navigating');
        statusText.textContent = stateData.message || 'Pasando a siguiente página...';
        playBtn.style.display = 'none';
        stopBtn.style.display = 'flex';
        setHudDlState(false);
        break;

      case 'COMPLETED':
        badge.classList.add('status-completed');
        statusText.textContent = 'Resumen completado 🎉';
        playBtn.style.display = 'flex';
        playBtn.textContent = '▶ Siguiente Capítulo';
        stopBtn.style.display = 'none';
        setHudDlState(true);
        showToast('¡Capítulo completado! Documento en Word o PDF listo para descargar.');
        break;

      case 'ERROR':
        badge.classList.add('status-error');
        statusText.textContent = stateData.message || 'Error en el proceso';
        playBtn.style.display = 'flex';
        stopBtn.style.display = 'none';
        setHudDlState(stateData.hasCompletedDoc);
        break;
    }
  }

  function showToast(message) {
    const existing = document.querySelector('.mhe-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'mhe-toast';
    toast.innerHTML = `<span>📘</span><span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  function makeDraggable(element, handle) {
    let posX = 0, posY = 0, mouseX = 0, mouseY = 0;
    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      e.preventDefault();
      mouseX = e.clientX;
      mouseY = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
      e.preventDefault();
      posX = mouseX - e.clientX;
      posY = mouseY - e.clientY;
      mouseX = e.clientX;
      mouseY = e.clientY;
      element.style.top = (element.offsetTop - posY) + 'px';
      element.style.left = (element.offsetLeft - posX) + 'px';
      element.style.bottom = 'auto';
      element.style.right = 'auto';
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }

  // ==========================================
  // RUNTIME MESSAGE DISPATCHER
  // ==========================================
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'EXTRACT_PAGE_DATA') {
      const data = extractPageData();
      sendResponse(data);
      return true;
    }

    if (request.action === 'CLICK_NEXT_PAGE') {
      clickNextPage().then((result) => {
        sendResponse(result);
      });
      return true; // async response
    }

    if (request.action === 'UPDATE_HUD_STATE') {
      updateHUDState(request.data);
      sendResponse({ ok: true });
      return true;
    }

    if (request.action === 'SHOW_TOAST') {
      showToast(request.message);
      sendResponse({ ok: true });
      return true;
    }
  });

  // Create HUD after reader initializes
  setTimeout(createFloatingHUD, 1500);

})();
