import { t } from './i18n';

export function initFilterInfoButtons() {
  const EXPANDED_FILTERS: { [selector: string]: string } = {
    '#terminacionesOptions': 'terminaciones',
    '#terminacionesDistintasOptions': 'variedadTerm',
    '#entropyTerminacionesMin': 'entropiaTerm',
    '#sumMin': 'sumaTotal',
    '#parImparOptions': 'parImpar',
    '#bajosAltosOptions': 'bajosAltos',
    '#primosMin': 'primos',
    '#consecutivosOptions': 'consecutivos',
    '#entropyIntervalosMin': 'entropiaInt',
    '#distanciaMin': 'distancia',
    '#agrupDecenasOptions': 'agrupDecenas',
    '#excluirDecenasOptions': 'excluirDecenas',
    '#sumaDigitosMin': 'sumaDigitos',
    '#desviacionMin': 'desviacion',
    '#geometricOptions': 'geometricos',
    '#useMarkovSwitch': 'predictivos',
    '#useNashSwitch': 'nash',
    '#useGapPercentilSwitch': 'gapPercentil'
  };

  const filterGroups = document.querySelectorAll('.filter-group, .dashboard-filter-group');
  filterGroups.forEach((group) => {
    const titleEl = group.querySelector('.filter-title, .dashboard-filter-header');
    if (!titleEl) return;

    if (titleEl.querySelector('.filter-info-btn')) return;

    for (const [selector, groupKey] of Object.entries(EXPANDED_FILTERS)) {
      if (group.querySelector(selector)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'filter-info-btn filter-info-btn-expanded';
        btn.dataset.expandedKey = groupKey;
        btn.textContent = 'ℹ️';
        btn.title = t('filterInfo.shared.titleExpanded');
        titleEl.appendChild(btn);
        return;
      }
    }

    let infoText = group.getAttribute('data-info') || group.getAttribute('title') || '';
    const headerText = titleEl.textContent || '';

    if (group.querySelector('#useMarkovSwitch')) {
      infoText = t('filters.predictivos.dataInfo');
      group.setAttribute('data-info', infoText);
    } else if (headerText.includes('Suma Estrellas') || headerText.includes('Suma Soles')) {
      infoText = "Suma total de los números de las estrellas o soles seleccionados en la combinación.";
    } else if (headerText.includes('Par/Impar Estrellas') || headerText.includes('Par/Impar Soles')) {
      infoText = "Distribución y proporción de estrellas o soles pares e impares.";
    } else if (headerText.includes('Bajos/Altos Estrellas') || headerText.includes('Bajos/Altos Soles')) {
      infoText = "Proporción de estrellas o soles bajos y altos según el rango del juego actual.";
    } else if (headerText.includes('Suma Dígitos Estrellas') || headerText.includes('Suma Cifras Estrellas')) {
      infoText = "Suma de los dígitos individuales de todas las estrellas o soles elegidos.";
    } else if (headerText.includes('Primos Estrellas')) {
      infoText = "Cantidad de estrellas o soles que pertenecen al conjunto de números primos.";
    } else if (headerText.includes('Consecutivos Estrellas')) {
      infoText = "Presencia de estrellas o soles consecutivos en la combinación.";
    } else if (headerText.includes('Distancia Estrellas')) {
      infoText = "Diferencia mínima o máxima entre los valores de las estrellas o soles.";
    }

    if (!infoText) {
      infoText = "Filtro estadístico para la optimización y criba de combinaciones.";
    }

    const titleKey = group.getAttribute('data-i18n-title');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'filter-info-btn';
    btn.setAttribute('aria-label', `Información sobre ${headerText.trim()}`);
    btn.title = "Toca para ver explicación del filtro";
    btn.setAttribute('data-info', infoText);
    if (titleKey) {
      btn.setAttribute('data-i18n-info', titleKey);
    }
    btn.textContent = 'ⓘ';

    titleEl.appendChild(btn);
  });
}
