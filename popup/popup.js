/**
 * MHE English Study Summarizer - Popup Script
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const chapterLabel = document.getElementById('chapter-label') || document.getElementById('unit-label');
  const pageLabel = document.getElementById('page-label');
  const providerSelect = document.getElementById('provider-select');
  const modelSelect = document.getElementById('model-select');
  const apiKeyInput = document.getElementById('api-key-input');
  const keyProviderName = document.getElementById('key-provider-name');
  const keyHelpLink = document.getElementById('key-help-link');
  const btnToggleKey = document.getElementById('btn-toggle-key');
  const btnSaveKey = document.getElementById('btn-save-key');
  const keyStatus = document.getElementById('key-status');

  const btnPlay = document.getElementById('btn-play');
  const btnStop = document.getElementById('btn-stop');
  const btnSinglePage = document.getElementById('btn-single-page');
  const btnCopyRaw = document.getElementById('btn-copy-raw');

  const statusDisplayBox = document.getElementById('status-display-box');
  const statusIndicatorText = document.getElementById('status-indicator-text');
  const statusTechDetails = document.getElementById('status-tech-details');
  const statusPagesCount = document.getElementById('status-pages-count');

  const btnDownloadWord = document.getElementById('btn-download-word');
  const btnDownloadPdf = document.getElementById('btn-download-pdf');
  const btnCopyDoc = document.getElementById('btn-copy-doc');
  const downloadHintText = document.getElementById('download-hint-text');

  const btnTogglePreview = document.getElementById('btn-toggle-preview');
  const previewArrow = document.getElementById('preview-arrow');
  const previewContentBox = document.getElementById('preview-content-box');
  const previewEmptyText = document.getElementById('preview-empty-text');
  const previewText = document.getElementById('preview-text');

  const customModelContainer = document.getElementById('custom-model-container');
  const customModelInput = document.getElementById('custom-model-input');

  // Updated Model catalog with current Gemini 3.x and DeepSeek V4.x generations
  const MODELS = {
    gemini: [
      { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash (Producción / Recomendado)' },
      { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite (Ultrarrápido y Económico)' },
      { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview (Alta Capacidad / Razonamiento)' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'custom', name: '✏️ Otro modelo (Personalizado)...' }
    ],
    deepseek: [
      { id: 'deepseek-flash', name: 'DeepSeek Flash (V4.1 Flash - Recomendado)' },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro (Razonamiento Profundo)' },
      { id: 'deepseek-chat', name: 'DeepSeek Chat (Alias compatibilidad)' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (Alias razonamiento)' },
      { id: 'custom', name: '✏️ Otro modelo (Personalizado)...' }
    ]
  };

  const HELP_LINKS = {
    gemini: 'https://aistudio.google.com/app/apikey',
    deepseek: 'https://platform.deepseek.com/api_keys'
  };

  // State cache
  let currentProvider = 'gemini';
  let keys = { gemini: '', deepseek: '' };
  let currentFinalMarkdown = '';

  // 1. Load initial settings
  await loadSettings();

  // 2. Query McGraw-Hill Reader Tab for live Unit/Page
  await refreshReaderInfo();

  // 3. Sync UI with current background loop state
  await syncBackgroundState();

  // ==========================================
  // CONFIGURATION & API KEYS
  // ==========================================
  async function loadSettings() {
    const data = await chrome.storage.sync.get(['provider', 'geminiKey', 'deepseekKey', 'model']);
    currentProvider = data.provider || 'gemini';
    keys.gemini = data.geminiKey || '';
    keys.deepseek = data.deepseekKey || '';

    providerSelect.value = currentProvider;
    updateProviderUI(currentProvider, data.model);
  }

  function updateProviderUI(provider, selectedModel = null) {
    currentProvider = provider;
    keyProviderName.textContent = provider === 'gemini' ? 'Gemini' : 'DeepSeek';
    keyHelpLink.href = HELP_LINKS[provider] || '#';

    // Populate model dropdown
    modelSelect.innerHTML = '';
    const models = MODELS[provider] || [];
    models.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      modelSelect.appendChild(opt);
    });

    const isPredefined = models.some(m => m.id === selectedModel && m.id !== 'custom');
    if (isPredefined) {
      modelSelect.value = selectedModel;
      customModelContainer.style.display = 'none';
    } else if (selectedModel && selectedModel !== 'custom') {
      // It's a custom model typed by the user previously
      modelSelect.value = 'custom';
      customModelContainer.style.display = 'block';
      customModelInput.value = selectedModel;
    } else {
      modelSelect.value = models[0].id;
      customModelContainer.style.display = 'none';
    }

    // Set API Key
    apiKeyInput.value = keys[provider] || '';
    if (keys[provider]) {
      setKeyStatus('Clave configurada ✓', 'green');
    } else {
      setKeyStatus('Falta ingresar clave', 'orange');
    }
  }

  function setKeyStatus(msg, color) {
    keyStatus.textContent = msg;
    keyStatus.style.color = color === 'green' ? '#10b981' : color === 'red' ? '#ef4444' : '#f59e0b';
  }

  // Provider change listener
  providerSelect.addEventListener('change', async () => {
    const prov = providerSelect.value;
    updateProviderUI(prov);
    const chosenModel = getActiveModelValue();
    await chrome.storage.sync.set({ provider: prov, model: chosenModel });
  });

  // Model change listener
  modelSelect.addEventListener('change', async () => {
    if (modelSelect.value === 'custom') {
      customModelContainer.style.display = 'block';
      customModelInput.focus();
    } else {
      customModelContainer.style.display = 'none';
      await chrome.storage.sync.set({ model: modelSelect.value });
    }
  });

  // Custom model text input
  customModelInput.addEventListener('input', async () => {
    const val = customModelInput.value.trim();
    if (val) {
      await chrome.storage.sync.set({ model: val });
    }
  });

  function getActiveModelValue() {
    if (modelSelect.value === 'custom') {
      return customModelInput.value.trim() || (currentProvider === 'gemini' ? 'gemini-3.8-flash' : 'deepseek-flash');
    }
    return modelSelect.value;
  }

  // Toggle API key visibility
  btnToggleKey.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      btnToggleKey.textContent = '🔒';
    } else {
      apiKeyInput.type = 'password';
      btnToggleKey.textContent = '👁️';
    }
  });

  // Save API key
  btnSaveKey.addEventListener('click', async () => {
    const val = apiKeyInput.value.trim();
    if (!val) {
      setKeyStatus('Por favor ingresa una clave válida', 'red');
      return;
    }

    keys[currentProvider] = val;
    const saveObj = {};
    if (currentProvider === 'gemini') saveObj.geminiKey = val;
    if (currentProvider === 'deepseek') saveObj.deepseekKey = val;

    await chrome.storage.sync.set(saveObj);
    setKeyStatus('¡Clave guardada con éxito! ✓', 'green');
  });

  apiKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnSaveKey.click();
  });

  // ==========================================
  // READER LIVE DETECTION
  // ==========================================
  async function refreshReaderInfo() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];

      if (!activeTab || !activeTab.url || !activeTab.url.includes('mheducation.com')) {
        chapterLabel.textContent = 'Abre el lector de McGraw-Hill';
        pageLabel.textContent = '--';
        return;
      }

      chrome.tabs.sendMessage(activeTab.id, { action: 'EXTRACT_PAGE_DATA' }, (response) => {
        if (chrome.runtime.lastError || !response) {
          chapterLabel.textContent = 'Capítulo cargando o no detectado';
          pageLabel.textContent = '--';
          return;
        }

        chapterLabel.textContent = response.chapterTitle || response.unitTitle || 'Chapter 1';
        pageLabel.textContent = response.position || (response.pageNum ? `Pág. ${response.pageNum}` : '--');
      });
    } catch (e) {
      console.warn('Reader refresh warning:', e);
    }
  }

  // ==========================================
  // BUTTON ACTIONS
  // ==========================================

  // Play: Start Automated Multi-Page Loop
  btnPlay.addEventListener('click', async () => {
    const currentKey = keys[currentProvider]?.trim();
    if (!currentKey) {
      setKeyStatus(`Por favor ingresa y guarda tu API Key de ${currentProvider.toUpperCase()}`, 'red');
      apiKeyInput.focus();
      return;
    }

    // Send start message to service worker
    chrome.runtime.sendMessage({ action: 'START_UNIT_LOOP' });
    updateUIForStatus('SUMMARIZING', 'Iniciando resumen de páginas...');
  });

  // Stop: Halt Loop
  btnStop.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'STOP_LOOP' });
    updateUIForStatus('IDLE', 'Deteniendo proceso...');
  });

  // Single Page Summary
  btnSinglePage.addEventListener('click', () => {
    const currentKey = keys[currentProvider]?.trim();
    if (!currentKey) {
      setKeyStatus(`Por favor ingresa y guarda tu API Key de ${currentProvider.toUpperCase()}`, 'red');
      apiKeyInput.focus();
      return;
    }

    chrome.runtime.sendMessage({ action: 'SUMMARIZE_SINGLE_PAGE' });
    updateUIForStatus('SUMMARIZING', 'Resumiendo página actual...');
  });

  // Copy raw text from current page
  btnCopyRaw.addEventListener('click', async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]) return;

    chrome.tabs.sendMessage(tabs[0].id, { action: 'EXTRACT_PAGE_DATA' }, async (response) => {
      if (response && response.text) {
        await navigator.clipboard.writeText(response.text);
        btnCopyRaw.textContent = '✓ ¡Copiado!';
        setTimeout(() => { btnCopyRaw.textContent = '📋 Copiar texto plano'; }, 2000);
      } else {
        btnCopyRaw.textContent = '⚠️ Sin texto';
        setTimeout(() => { btnCopyRaw.textContent = '📋 Copiar texto plano'; }, 2000);
      }
    });
  });

  // ==========================================================
  // DOWNLOAD BUTTONS (USER SPECIFIC REQUIREMENT:
  // DARK WHEN SUMMARIZING; ACTIVE/BRIGHT WHEN COMPLETED)
  // Allows choosing between Word (.doc) and PDF (.pdf)
  // ==========================================================

  if (btnDownloadWord) {
    btnDownloadWord.addEventListener('click', () => {
      if (btnDownloadWord.disabled) return;
      chrome.runtime.sendMessage({ action: 'TRIGGER_DOWNLOAD', format: 'word' });
    });
  }

  if (btnDownloadPdf) {
    btnDownloadPdf.addEventListener('click', () => {
      if (btnDownloadPdf.disabled) return;
      chrome.runtime.sendMessage({ action: 'TRIGGER_DOWNLOAD', format: 'pdf' });
    });
  }

  btnCopyDoc.addEventListener('click', async () => {
    if (!currentFinalMarkdown) return;
    await navigator.clipboard.writeText(currentFinalMarkdown);
    btnCopyDoc.textContent = '✓ ¡Documento copiado!';
    setTimeout(() => { btnCopyDoc.textContent = '📋 Copiar al Portapapeles'; }, 2000);
  });

  // Accordion toggle
  btnTogglePreview.addEventListener('click', () => {
    previewContentBox.classList.toggle('collapsed');
    previewArrow.textContent = previewContentBox.classList.contains('collapsed') ? '▼' : '▲';
  });

  // ==========================================
  // STATE SYNCHRONIZATION
  // ==========================================
  async function syncBackgroundState() {
    chrome.runtime.sendMessage({ action: 'GET_STATE' }, (response) => {
      if (response && response.loopState) {
        applyState(response.loopState);
      }
    });
  }

  // Listen for storage changes from background service worker
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.loopState) {
      applyState(changes.loopState.newValue);
    }
  });

  function applyState(state) {
    if (!state) return;

    if (state.chapterTitle || state.unitTitle) {
      chapterLabel.textContent = state.chapterTitle || state.unitTitle;
    }

    if (state.pagesCount !== undefined) {
      statusPagesCount.textContent = `${state.pagesCount} página${state.pagesCount === 1 ? '' : 's'}`;
    }

    if (state.finalSummaryMarkdown) {
      currentFinalMarkdown = state.finalSummaryMarkdown;
      previewEmptyText.style.display = 'none';
      previewText.style.display = 'block';
      previewText.textContent = state.finalSummaryMarkdown;
    }

    updateUIForStatus(state.status, state.message, state.hasCompletedDoc);
  }

  /**
   * Updates all UI widgets, button states, and styling according to the current state
   */
  function updateUIForStatus(status, message, hasCompletedDoc = false) {
    statusDisplayBox.className = 'status-display';

    // Show technical details if message has bracketed stage [FASE ...] or [REINTENTO ...]
    if (message && (message.includes('[') || message.includes('⏱') || message.includes('Error'))) {
      statusIndicatorText.textContent = getFriendlyStatusSummary(status);
      if (statusTechDetails) {
        statusTechDetails.style.display = 'block';
        statusTechDetails.textContent = message;
      }
    } else {
      statusIndicatorText.textContent = message || 'Listo para iniciar';
      if (statusTechDetails) {
        statusTechDetails.style.display = 'none';
      }
    }

    switch (status) {
      case 'SUMMARIZING':
        statusDisplayBox.classList.add('status-summarizing');
        btnPlay.style.display = 'none';
        btnStop.style.display = 'flex';

        // DARK & DISABLED DOWNLOAD BUTTON WHILE SUMMARIZING
        setDownloadButtonState('DISABLED');
        break;

      case 'NAVIGATING':
        statusDisplayBox.classList.add('status-navigating');
        btnPlay.style.display = 'none';
        btnStop.style.display = 'flex';

        // DARK & DISABLED DOWNLOAD BUTTON WHILE NAVIGATING
        setDownloadButtonState('DISABLED');
        break;

      case 'COMPLETED':
        statusDisplayBox.classList.add('status-completed');
        statusIndicatorText.textContent = '¡Resumen completado! 🎉';
        btnPlay.style.display = 'flex';
        btnPlay.querySelector('.btn-primary-text').textContent = '▶ SIGUIENTE CAPÍTULO';
        btnStop.style.display = 'none';

        // ACTIVE & GLOWING DOWNLOAD BUTTON WHEN COMPLETED
        setDownloadButtonState('ACTIVE');
        break;

      case 'ERROR':
        statusDisplayBox.classList.add('status-error');
        btnPlay.style.display = 'flex';
        btnStop.style.display = 'none';
        if (!hasCompletedDoc) {
          setDownloadButtonState('DISABLED');
        }
        break;

      case 'IDLE':
      default:
        statusDisplayBox.classList.add('status-idle');
        btnPlay.style.display = 'flex';
        btnPlay.querySelector('.btn-primary-text').textContent = 'INICIAR RESUMEN (PLAY)';
        btnStop.style.display = 'none';

        if (hasCompletedDoc) {
          setDownloadButtonState('ACTIVE');
        } else {
          setDownloadButtonState('DISABLED');
        }
        break;
    }
  }

  function getFriendlyStatusSummary(status) {
    switch (status) {
      case 'SUMMARIZING': return 'Procesando con IA...';
      case 'NAVIGATING': return 'Avanzando en el libro...';
      case 'COMPLETED': return '¡Resumen completado! 🎉';
      case 'ERROR': return 'Atención requerida';
      default: return 'Listo para iniciar';
    }
  }

  /**
   * Directly enforces the user-requested styling for the download buttons:
   * Dark when summarizing / idle without completed summary.
   * Active and glowing when "Resumen completado".
   * Manages both Word (.doc) and PDF (.pdf) buttons.
   */
  function setDownloadButtonState(state) {
    if (state === 'ACTIVE') {
      if (btnDownloadWord) {
        btnDownloadWord.className = 'btn-download btn-download-word active';
        btnDownloadWord.disabled = false;
      }
      if (btnDownloadPdf) {
        btnDownloadPdf.className = 'btn-download btn-download-pdf active';
        btnDownloadPdf.disabled = false;
      }
      if (downloadHintText) {
        downloadHintText.textContent = '¡Resumen completado! 🎉 Haz clic para descargar en Word o guardar como PDF:';
      }
    } else {
      if (btnDownloadWord) {
        btnDownloadWord.className = 'btn-download btn-download-word disabled';
        btnDownloadWord.disabled = true;
      }
      if (btnDownloadPdf) {
        btnDownloadPdf.className = 'btn-download btn-download-pdf disabled';
        btnDownloadPdf.disabled = true;
      }
      if (downloadHintText) {
        downloadHintText.textContent = 'Elige tu formato preferido (botones inactivos/oscuros mientras resume; activos al completar):';
      }
    }
  }

  // Periodic poll to keep UI fresh if popup remains open
  setInterval(refreshReaderInfo, 3000);
});
