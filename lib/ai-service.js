/**
 * AI Service for Gemini and DeepSeek APIs
 * Optimized with AbortController timeouts, automatic retries, technical status callbacks,
 * and high-speed staged synthesis to prevent hangs and delays.
 */

const AIService = {
  PROVIDERS: {
    GEMINI: 'gemini',
    DEEPSEEK: 'deepseek'
  },

  DEFAULT_MODELS: {
    gemini: 'gemini-3.8-flash',
    deepseek: 'deepseek-flash'
  },

  AVAILABLE_MODELS: [
    // Current Google Gemini models
    { provider: 'gemini', id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash (Producción / Recomendado)' },
    { provider: 'gemini', id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite (Ultrarrápido y Económico)' },
    { provider: 'gemini', id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview (Alta Capacidad / Razonamiento)' },
    { provider: 'gemini', id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { provider: 'gemini', id: 'custom', name: '✏️ Otro modelo (Personalizado)...' },

    // Current DeepSeek models
    { provider: 'deepseek', id: 'deepseek-flash', name: 'DeepSeek Flash (V4.1 Flash - Recomendado)' },
    { provider: 'deepseek', id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro (Razonamiento Profundo)' },
    { provider: 'deepseek', id: 'deepseek-chat', name: 'DeepSeek Chat (Alias compatibilidad)' },
    { provider: 'deepseek', id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (Alias razonamiento)' },
    { provider: 'deepseek', id: 'custom', name: '✏️ Otro modelo (Personalizado)...' }
  ],

  /**
   * Helper to execute fetch with timeout and retry logic
   */
  async fetchWithRetry(url, options = {}, timeoutMs = 45000, maxRetries = 2, onRetry = null) {
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort(new Error(`Timeout de red: la API no respondió en ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });

        clearTimeout(timer);

        // Check if rate limited (429) or temporary server error (500, 502, 503)
        if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
          let errDetail = `HTTP ${response.status}: ${response.statusText}`;
          try {
            const errJson = await response.json();
            if (errJson.error?.message) errDetail = errJson.error.message;
          } catch (_) {}

          if (attempt < maxRetries) {
            const backoff = (attempt + 1) * 2000;
            if (onRetry) onRetry(attempt + 1, maxRetries, backoff, errDetail);
            await new Promise(r => setTimeout(r, backoff));
            continue;
          }
          throw new Error(`[HTTP ${response.status}] ${errDetail}`);
        }

        return response;
      } catch (err) {
        clearTimeout(timer);
        lastError = err;

        if (err.name === 'AbortError' || err.message?.includes('Timeout')) {
          if (attempt < maxRetries) {
            const backoff = 1500;
            if (onRetry) onRetry(attempt + 1, maxRetries, backoff, 'Timeout de conexión');
            await new Promise(r => setTimeout(r, backoff));
            continue;
          }
          throw new Error(`Tiempo de espera agotado (${Math.round(timeoutMs / 1000)}s). La API de IA está sobrecargada o la conexión es lenta.`);
        }

        if (attempt < maxRetries) {
          const backoff = 1500;
          if (onRetry) onRetry(attempt + 1, maxRetries, backoff, err.message);
          await new Promise(r => setTimeout(r, backoff));
          continue;
        }
      }
    }

    throw lastError || new Error('Fallo de conexión desconocido');
  },

  /**
   * Main dispatch method to call the chosen AI provider
   */
  async callAI({ provider, apiKey, model, prompt, systemPrompt = '', timeoutMs = 45000, onStatus = null }) {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error(`Por favor ingresa tu API Key para ${provider.toUpperCase()}`);
    }

    const cleanKey = apiKey.trim();
    const cleanModel = model || this.DEFAULT_MODELS[provider] || (provider === 'gemini' ? 'gemini-3.8-flash' : 'deepseek-flash');

    if (provider === this.PROVIDERS.GEMINI) {
      return await this.callGemini(cleanKey, cleanModel, prompt, systemPrompt, timeoutMs, onStatus);
    } else if (provider === this.PROVIDERS.DEEPSEEK) {
      return await this.callDeepSeek(cleanKey, cleanModel, prompt, systemPrompt, timeoutMs, onStatus);
    } else {
      throw new Error(`Proveedor de IA no reconocido: ${provider}`);
    }
  },

  /**
   * Google Gemini REST API call with timeout and retries
   */
  async callGemini(apiKey, model, userPrompt, systemPrompt = '', timeoutMs = 45000, onStatus = null) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const contents = [];
    if (systemPrompt && systemPrompt.trim()) {
      contents.push({
        role: 'user',
        parts: [{ text: `[INSTRUCCIONES DEL SISTEMA]: ${systemPrompt}\n\nPor favor confirma que entendiste.` }]
      });
      contents.push({
        role: 'model',
        parts: [{ text: 'Entendido. Procederé siguiendo exactamente estas instrucciones pedagógicas.' }]
      });
    }

    contents.push({
      role: 'user',
      parts: [{ text: userPrompt }]
    });

    const payload = {
      contents: contents,
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 6144,
        topP: 0.95
      }
    };

    const startTime = Date.now();
    const response = await this.fetchWithRetry(
      endpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      },
      timeoutMs,
      2,
      (attempt, max, backoff, reason) => {
        if (onStatus) {
          onStatus(`[REINTENTO ${attempt}/${max}] Gemini ocupado (${reason}). Reintentando en ${backoff / 1000}s...`);
        }
      }
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (!response.ok) {
      let errMsg = `Error ${response.status}: ${response.statusText}`;
      try {
        const errJson = await response.json();
        if (errJson.error && errJson.error.message) {
          errMsg = `Gemini API Error: ${errJson.error.message}`;
        }
      } catch (e) {}
      throw new Error(errMsg);
    }

    const data = await response.json();
    const candidate = data.candidates && data.candidates[0];
    if (!candidate || !candidate.content || !candidate.content.parts || !candidate.content.parts[0]) {
      if (candidate && candidate.finishReason === 'SAFETY') {
        throw new Error('La respuesta fue bloqueada por los filtros de seguridad de Gemini.');
      }
      throw new Error('Gemini no devolvió texto en la respuesta.');
    }

    console.log(`[Gemini] Respuesta generada en ${elapsed}s (Modelo: ${model})`);
    return candidate.content.parts[0].text;
  },

  /**
   * DeepSeek Chat Completions API call with timeout and retries
   */
  async callDeepSeek(apiKey, model, userPrompt, systemPrompt = '', timeoutMs = 45000, onStatus = null) {
    const endpoint = 'https://api.deepseek.com/chat/completions';

    const messages = [];
    if (systemPrompt && systemPrompt.trim()) {
      messages.push({
        role: 'system',
        content: systemPrompt
      });
    } else {
      messages.push({
        role: 'system',
        content: 'Eres un tutor y profesor de inglés experto especializado en preparar estudiantes para exámenes de certificación y exámenes finales de cursos McGraw-Hill.'
      });
    }

    messages.push({
      role: 'user',
      content: userPrompt
    });

    const payload = {
      model: model,
      messages: messages,
      temperature: 0.25,
      stream: false
    };

    const startTime = Date.now();
    const response = await this.fetchWithRetry(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      },
      timeoutMs,
      2,
      (attempt, max, backoff, reason) => {
        if (onStatus) {
          onStatus(`[REINTENTO ${attempt}/${max}] DeepSeek ocupado (${reason}). Reintentando en ${backoff / 1000}s...`);
        }
      }
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (!response.ok) {
      let errMsg = `Error ${response.status}: ${response.statusText}`;
      try {
        const errJson = await response.json();
        if (errJson.error && errJson.error.message) {
          errMsg = `DeepSeek API Error: ${errJson.error.message}`;
        }
      } catch (e) {}
      throw new Error(errMsg);
    }

    const data = await response.json();
    const choice = data.choices && data.choices[0];
    if (!choice || !choice.message || !choice.message.content) {
      throw new Error('DeepSeek no devolvió contenido en la respuesta.');
    }

    console.log(`[DeepSeek] Respuesta generada en ${elapsed}s (Modelo: ${model})`);
    return choice.message.content;
  },

  /**
   * Summarize a single page of the English course
   */
  async summarizePage({ provider, apiKey, model, unitTitle, pageNum, pageTitle, textContent, onStatus = null }) {
    const chapterName = unitTitle || 'Chapter';
    const systemPrompt = `Eres un profesor de inglés de nivel universitario y tutor de preparación para exámenes finales del curso McGraw-Hill.
Analiza la página del libro de texto y extrae de forma rápida y concisa los conceptos clave que el estudiante debe dominar para su examen.`;

    const userPrompt = `PÁGINA A RESUMIR:
- Capítulo: "${chapterName}"
- Página: "${pageNum || 'N/A'}"
- Sección: "${pageTitle || 'Contenido'}"

CONTENIDO DE LA PÁGINA:
"""
${textContent}
"""

INSTRUCCIONES:
Genera un resumen conciso en Markdown (máx 200 palabras):
1. 📌 **Idea Principal** (1 oración directa).
2. 🔤 **Vocabulario Clave** (Lista: Palabra en inglés - Significado en español - Ejemplo).
3. 📐 **Gramática o Estructura** (Reglas o expresiones clave).
4. 💡 **Pregunta Típica de Examen** (Concepto evaluable).`;

    return await this.callAI({
      provider,
      apiKey,
      model,
      prompt: userPrompt,
      systemPrompt,
      timeoutMs: 30000, // 30s per single page
      onStatus
    });
  },

  /**
   * Generates strictly the questions with answers and combines with page summaries:
   * 1. Title: "Summary del {Chapter}"
   * 2. Page summaries in order
   * 3. Exam questions with their respective answers
   * No unnecessary extra sections.
   */
  async synthesizeUnitAndGenerateExam({ provider, apiKey, model, unitTitle, totalPages, pageSummaries, onStatus = null }) {
    const chapterName = unitTitle || 'Chapter';

    // Build a compact digest of page summaries for the questions prompt
    const pageDigests = pageSummaries.map((p, idx) => {
      const summaryClean = (p.summary || '').replace(/[\r\n]+/g, ' ').substring(0, 300);
      return `[Página ${p.pageNum || (idx + 1)}]: ${summaryClean}`;
    }).join('\n');

    if (onStatus) {
      onStatus(`[PREGUNTAS DE EXAMEN] Generando preguntas y respuestas con ${model}...`);
    }

    const systemPrompt = `Eres un docente de inglés de McGraw-Hill. Tu tarea es generar preguntas de examen de opción múltiple y prácticas basadas en el contenido del capítulo, incluyendo inmediatamente la respuesta correcta y explicación de cada una.`;

    const userPrompt = `CAPÍTULO: "${chapterName}" (${totalPages} páginas estudiadas).

RESÚMENES DE LAS PÁGINAS DEL CAPÍTULO:
"""
${pageDigests}
"""

TAREA:
Genera las preguntas de examen del capítulo con sus respectivas respuestas.
Formato obligatorio:
## Preguntas de Examen del Capítulo y Respuestas

### Pregunta 1
[Enunciado de la pregunta en inglés]
- A) [Opción]
- B) [Opción]
- C) [Opción]
- D) [Opción]

**Respuesta correcta:** [Letra y breve justificación]

(Genera de 10 a 12 preguntas de examen con este formato exacto).

REGLA ESTRICTA: NO agregues introducciones, saludos, resúmenes adicionales, tablas de vocabulario ni notas extras. Solo el encabezado "## Preguntas de Examen del Capítulo y Respuestas" y las preguntas numeradas con sus respuestas.`;

    // Fast AI call focused only on questions and answers (~4-8 seconds)
    const questionsContent = await this.callAI({
      provider,
      apiKey,
      model,
      prompt: userPrompt,
      systemPrompt,
      timeoutMs: 35000,
      onStatus
    });

    // Exact requested structure: Title -> Page summaries -> Questions with answers
    const fullDocument = `# Summary del ${chapterName}

---

${pageSummaries.map((p, idx) => {
  const pageLabel = p.pageNum ? `Página ${p.pageNum}` : `Página ${idx + 1}`;
  return `## Resumen de la ${pageLabel}\n\n${p.summary}`;
}).join('\n\n---\n\n')}

---

${questionsContent.trim()}`;

    return fullDocument;
  },

  /**
   * Resilient local fallback builder when AI API is unavailable or times out.
   */
  buildLocalFallbackDocument(chapterName, pageSummaries, errorMessage = '') {
    return `# Summary del ${chapterName}

---

${pageSummaries.map((p, idx) => {
  const pageLabel = p.pageNum ? `Página ${p.pageNum}` : `Página ${idx + 1}`;
  return `## Resumen de la ${pageLabel}\n\n${p.summary}`;
}).join('\n\n---\n\n')}

---

## Preguntas de Examen del Capítulo y Respuestas

### Pregunta 1
¿Cuáles son las ideas y reglas principales presentadas a lo largo de este capítulo?
**Respuesta:** Revisar los conceptos clave destacados en el resumen de cada página.

### Pregunta 2
¿Qué vocabulario fundamental y expresiones se evaluarán en el examen?
**Respuesta:** Consultar los términos y definiciones registrados en cada página resumida.

### Pregunta 3
¿Cuáles son las estructuras gramaticales esenciales para aprobar este capítulo?
**Respuesta:** Estudiar las fórmulas y ejemplos prácticos incluidos en las notas anteriores.`;
  }
};

// Export
if (typeof self !== 'undefined') {
  self.AIService = AIService;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIService;
}
