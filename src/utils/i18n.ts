type TranslationParams = Record<string, string | number>;

const localesCache: Record<string, Record<string, string>> = {};
let currentLocale: string = 'es';

/**
 * Carga perezosa de un archivo JSON de idioma desde /locales/{lang}.json
 */
export async function loadLocale(lang: string): Promise<void> {
  if (localesCache[lang]) {
    return;
  }

  try {
    const response = await fetch(`./locales/${lang}.json`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    localesCache[lang] = data;
  } catch (error) {
    console.warn(`[i18n] Error al cargar el idioma "${lang}":`, error);
  }
}

/**
 * Obtiene la traducción de una clave con fallback a 'es' e interpolación.
 * Si no existe en ningún idioma, devuelve [clave].
 */
export function t(key: string, params?: TranslationParams): string {
  let text = localesCache[currentLocale]?.[key];

  // Fallback al idioma español si no se encuentra en el activo
  if (!text && currentLocale !== 'es') {
    text = localesCache['es']?.[key];
  }

  // Si tampoco se encuentra en español, se muestra [clave]
  if (!text) {
    return `[${key}]`;
  }

  // Interpolación de parámetros {nombre}
  if (params) {
    Object.keys(params).forEach((paramKey) => {
      text = text!.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(params[paramKey]));
    });
  }

  return text;
}

/**
 * Devuelve el idioma activo actual ('es', 'en', etc.).
 */
export function getLocale(): string {
  return currentLocale;
}

/**
 * Establece un nuevo idioma activo, cargándolo si es preciso y guardando en localStorage.
 */
export async function setLocale(lang: string): Promise<void> {
  await loadLocale(lang);
  currentLocale = lang;
  localStorage.setItem('datalotto_locale', lang);
  applyTranslations();
}

/**
 * Recorre todos los elementos del DOM con atributo data-i18n="clave" y asigna textContent = t(clave).
 */
export function applyTranslations(): void {
  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) {
      let params: Record<string, string | number> | undefined;
      const paramsAttr = el.getAttribute('data-i18n-params');
      if (paramsAttr) {
        try {
          params = JSON.parse(paramsAttr);
        } catch (e) {
          console.warn('[i18n] Error al parsear data-i18n-params:', paramsAttr, e);
        }
      }
      const infoBtn = el.querySelector('.filter-info-btn');
      el.textContent = t(key, params);
      if (infoBtn) {
        el.appendChild(infoBtn);
      }
    }
  });

  const titleElements = document.querySelectorAll('[data-i18n-title]');
  titleElements.forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key) {
      el.setAttribute('title', t(key));
    }
  });

  const infoElements = document.querySelectorAll('[data-i18n-info]');
  infoElements.forEach((el) => {
    const key = el.getAttribute('data-i18n-info');
    if (key) {
      el.setAttribute('data-info', t(key));
    }
  });
}

/**
 * Inicialización al arrancar la app: carga 'es' siempre primero y aplica el idioma guardado.
 */
export async function initI18n(): Promise<void> {
  await loadLocale('es');
  const savedLocale = localStorage.getItem('datalotto_locale');
  if (savedLocale && savedLocale !== 'es') {
    await loadLocale(savedLocale);
    currentLocale = savedLocale;
  } else {
    currentLocale = 'es';
  }
  applyTranslations();
}
