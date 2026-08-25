export const APP_STATE_KEY = 'dataLotto49State';
export const FILTER_PRESET_KEY = 'dataLotto49Filters';

export function saveAppStateToStorage(state: any): void {
  localStorage.setItem(APP_STATE_KEY, JSON.stringify(state));
}

export function loadAppStateFromStorage(): any | null {
  const savedStateJSON = localStorage.getItem(APP_STATE_KEY);
  if (savedStateJSON) {
    return JSON.parse(savedStateJSON);
  }
  return null;
}

export function loadFilterPresetFromStorage(): any | null {
  const savedFiltersJSON = localStorage.getItem(FILTER_PRESET_KEY);
  if (savedFiltersJSON) {
    return JSON.parse(savedFiltersJSON);
  }
  return null;
}
