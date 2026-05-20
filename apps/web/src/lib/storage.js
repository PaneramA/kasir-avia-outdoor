export const STORAGE_KEYS = {
  inventory: 'avia_inventory',
  categories: 'avia_categories',
  rentals: 'avia_rentals',
  theme: 'avia_theme',
};

export const DEFAULT_CATEGORIES = ['Tenda', 'Carrier', 'Alat Masak', 'Lainnya'];

function readJson(key, fallbackValue) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return fallbackValue;
    }

    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getInventory() {
  return readJson(STORAGE_KEYS.inventory, []);
}

export function saveInventory(inventory) {
  writeJson(STORAGE_KEYS.inventory, inventory);
}

export function getCategories() {
  const categories = readJson(STORAGE_KEYS.categories, DEFAULT_CATEGORIES);
  return Array.isArray(categories) && categories.length > 0 ? categories : DEFAULT_CATEGORIES;
}

export function saveCategories(categories) {
  writeJson(STORAGE_KEYS.categories, categories);
}

export function getRentals() {
  return readJson(STORAGE_KEYS.rentals, []);
}

export function saveRentals(rentals) {
  writeJson(STORAGE_KEYS.rentals, rentals);
}

export function getTheme() {
  const saved = localStorage.getItem(STORAGE_KEYS.theme);
  return saved === 'dark' ? 'dark' : 'light';
}

export function saveTheme(theme) {
  const normalized = theme === 'dark' ? 'dark' : 'light';
  localStorage.setItem(STORAGE_KEYS.theme, normalized);
}
