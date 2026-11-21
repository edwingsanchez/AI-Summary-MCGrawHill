# 📘 MHE English Study Summarizer (Extensión de Chrome)

Extensión de Google Chrome (Manifest V3) diseñada específicamente para estudiantes de cursos de inglés de **McGraw-Hill Education**. Automatiza la lectura del libro, resume página por página usando **Google Gemini** o **DeepSeek**, se detiene automáticamente al terminar cada Unidad/Tema y genera un documento **Summary del Chapter** en **Microsoft Word (.doc)** o **PDF (.pdf)** con preguntas y respuestas de examen final.

---

## 🚀 Características Principales

1. **Lectura y Navegación Automática (Botón Play):**
   - Hace resumen de la página actual del libro.
   - Presiona automáticamente el botón de pasar a la siguiente página (`nav-forward-paginate-button` / `#next-button`).
   - Detecta la transición y repite el proceso página a página.
   - **Detección Inteligente de Chapter:** Se detiene automáticamente en cuanto detecta el inicio de un nuevo Capítulo (analizando la estructura del libro, el índice TOC y las cabeceras).
   - Al finalizar todas las páginas del capítulo, compila el documento final.

2. **Elección de Descarga: Word (.doc) o PDF (.pdf):**
   - 📄 **Descargar en Word (.doc):** Documento nativo de Microsoft Word con estilos y tipografía Calibri, tarjetas para cada página y cajas destacadas para las respuestas de examen. Compatible con MS Word, Word Online y Google Docs.
   - 📑 **Guardar en PDF (.pdf):** Abre un visor dedicado de alta resolución (`viewer.html`) con diseño de página para impresión (`@page { size: letter; margin: 20mm; }`) y dispara automáticamente el cuadro de diálogo de Chrome para guardar en PDF con 1 clic.
   - 📋 **Copiar texto al portapapeles:** Opción rápida para copiar todo el documento en Markdown limpio.

3. **Estructura Estricta y Formateada del Documento (Sin Secciones de Más):**
   - **Título Oficial:** `Summary del Chapter {número}: {título}` (ej. *Summary del Chapter 4: Inclusion in a Diverse Workplace*).
   - **Resúmenes Secuenciales:** Resumen limpio de cada página en orden cronológico (`## Resumen de la Página {X}`):
     - 📌 **Idea Principal**
     - 🔤 **Vocabulario Clave**
     - 📐 **Gramática o Estructura**
     - 💡 **Pregunta Típica de Examen**
   - **Preguntas de Examen con Respuestas al Final:** Cuestionario de práctica (`## Preguntas de Examen del Capítulo y Respuestas`) con preguntas de opción múltiple y sus respuestas destacadas en recuadros verdes de estudio.
   - **Cero secciones extras:** Sin resúmenes ejecutivos redundantes, sin tablas de vocabulario duplicadas, sin notas de relleno.

4. **Botones de Descarga Dinámicos (Oscuros al Resumir / Brillantes al Completar):**
   - **Mientras resume o en espera:** Los botones de descarga se muestran **oscuros y deshabilitados** (`#1e293b`, `opacity: 0.55`, `cursor: not-allowed`), evitando descargas incompletas.
   - **Al finalizar el capítulo:** El estado cambia a **"¡Resumen completado! 🎉"** y ambos botones de descarga se activan:
     - Botón Word en azul real brillante (`#2563eb`).
     - Botón PDF en rojo carmesí vibrante (`#dc2626`).

5. **Superación de Medidas Anti-Copia de McGraw-Hill:**
   - **Extracción Directa del DOM/srcdoc:** McGraw-Hill usa `oncopy="return false"` y `user-select: none` para impedir el típico `Ctrl + C`. Esta extensión extrae el texto puro directamente del atributo `srcdoc` y del DOM del iframe, haciendo imposible que el sitio bloquee la lectura.
   - **Desbloqueador de Copia Integrado:** Remueve automáticamente las restricciones de eventos y estilos en la página para que también puedas usar `Ctrl + C` libremente si así lo deseas.

6. **Soporte para Modelos de IA Actuales y Personalizados:**
   - **Google Gemini:**
     - `gemini-3.8-flash` (Modelo insignia, rápido, con ventana de contexto de 1M y razonamiento avanzado — recomendado).
     - `gemini-3.5-flash-lite` (Ultrarrápido y sumamente económico para resúmenes de alto volumen).
     - `gemini-3-pro-preview` (Máxima capacidad y razonamiento profundo).
     - `gemini-2.5-flash` (Compatibilidad).
   - **DeepSeek:**
     - `deepseek-flash` (Basado en DeepSeek-V4.1-Flash: rápido, contexto de 1M tokens y capacidades multimodales — recomendado).
     - `deepseek-v4-pro` (Para razonamiento avanzado y resolución de problemas complejos).
     - `deepseek-chat` y `deepseek-reasoner` (Aliases de compatibilidad).
   - **Opción de Modelo Personalizado:** Puedes seleccionar *"✏️ Otro modelo (Personalizado)..."* y escribir cualquier ID de modelo directamente.

7. **Omisión Automática de Páginas de Ejercicios:**
   - **Detección inteligente multinivel:** La extensión analiza títulos, encabezados, índice TOC y densidad de espacios para rellenar (`___`) o prompts de actividades (`Grammar Practice`, `Vocabulary Practice`, `Self-Assessment`, `Workbook`, etc.).
   - **Ahorro de tiempo y tokens:** Salta las hojas de ejercicios inmediatamente sin llamar a la IA ni incluir espacios vacíos en tu resumen, avanzando directo a la siguiente página de teoría.
   - **Control en la interfaz:** Puedes activar o desactivar la casilla *"🚫 Omitir páginas de ejercicios"* en cualquier momento desde el menú de la extensión.

8. **Widget Flotante en Pantalla (HUD):**
   - En la esquina inferior derecha de la ventana del libro se inyecta un control flotante con el estado en tiempo real, botón Play/Stop y botones directos de descarga para Word y PDF.

---

## 🛠️ Instalación en Google Chrome

1. Abre Google Chrome y ve a la barra de direcciones:
   ```text
   chrome://extensions
   ```
2. Activa el interruptor **Modo de desarrollador** en la esquina superior derecha.
3. Haz clic en el botón **Cargar descomprimida** (Load unpacked).
4. Selecciona la carpeta de la extensión:
   ```text
   C:\Users\Mau\.gemini\antigravity\scratch\mhe-study-summarizer-extension
   ```
   *(Si ya la tenías cargada, simplemente haz clic en el ícono de recargar 🔄 en la tarjeta de la extensión).*
5. Verás el ícono de **MHE English Study Summarizer** en la barra de extensiones de Chrome (puedes fijarlo con la chincheta 📌).

---

## 🔑 Obtención de API Keys

### Opción A: Google Gemini (Recomendado y Gratuito)
1. Entra a [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Inicia sesión con tu cuenta de Google.
3. Haz clic en **Create API Key**.
4. Copia tu clave y pégala en la extensión.

### Opción B: DeepSeek
1. Entra a [DeepSeek Platform](https://platform.deepseek.com/api_keys).
2. Crea tu API Key.
3. Cópiala y pégala en la sección de DeepSeek de la extensión.

---

## 📖 Modo de Uso en McGraw-Hill

1. Entra a tu curso de inglés en McGraw-Hill y abre el libro en la primera página del Chapter que quieras estudiar (ej. *Chapter 4: Inclusion in a Diverse Workplace*).
2. Abre la extensión haciendo clic en su ícono.
3. Observarás que en **Current Chapter** aparece el número y nombre del capítulo actual.
4. Selecciona tu proveedor (**Gemini** o **DeepSeek**), ingresa tu API Key y haz clic en **Guardar**.
5. Haz clic en el botón grande:
   ```text
   ▶ INICIAR RESUMEN (PLAY)
   ```
6. La extensión:
   - Extraerá el texto de la página actual y la resumirá con la IA.
   - Presionará automáticamente el botón de página siguiente.
   - Repetirá el ciclo para cada página de ese Chapter.
   - En cuanto detecte que comienza el siguiente Chapter, **se detendrá automáticamente**.
   - Compilará el documento final y generará las preguntas de examen con sus respuestas.
7. El indicador mostrará: **"¡Resumen completado! 🎉"** y los botones de descarga se activarán:
   - **📄 Descargar en Word (.doc):** Guarda el archivo `Summary_del_Chapter_4_Inclusion_in_a_Diverse_Workplace.doc`.
   - **📑 Guardar en PDF (.pdf):** Abre la vista de estudio y dispara el cuadro para guardar en PDF.

---

## 📂 Estructura del Proyecto

```text
mhe-study-summarizer-extension/
├── manifest.json              # Configuración Manifest V3 con permisos
├── icons/                     # Íconos de la extensión (16, 48, 128)
├── lib/
│   ├── ai-service.js          # Conectores Gemini y DeepSeek con timeouts y reintentos
│   └── doc-generator.js       # Generador de Word (.doc) y PDF (.html) con estilos y estructura
├── background/
│   └── service-worker.js      # Coordinador de ciclo multi-página, IA y descargas
├── content/
│   ├── content.js             # Extractor anti-bloqueo, clic de página, detector de unidad y HUD
│   └── content.css            # Estilos del HUD flotante y desbloqueo de selección
├── popup/
│   ├── popup.html             # Interfaz con botones de descarga Word y PDF
│   ├── popup.css              # Estilos del popup con estados activo/oscuro de los botones
│   └── popup.js               # Sincronización en tiempo real y disparadores de descarga
├── viewer.html                # Visor imprimible para PDF con barra de acciones
├── viewer.js                  # Lógica del visor para imprimir/guardar PDF y Word
└── README.md                  # Documentación completa
```
