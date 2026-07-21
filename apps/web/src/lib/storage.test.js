// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_CATEGORIES,
  STORAGE_KEYS,
  getCategories,
  getInventory,
  getRentals,
  getTheme,
  saveCategories,
  saveInventory,
  saveRentals,
  saveTheme,
} from './storage.js';

beforeEach(() => localStorage.clear());

describe('local storage helpers', () => {
  it('round-trips inventory and rentals', () => {
    saveInventory([{ id: 'item-1' }]);
    saveRentals([{ id: 'rental-1' }]);
    expect(getInventory()).toEqual([{ id: 'item-1' }]);
    expect(getRentals()).toEqual([{ id: 'rental-1' }]);
  });

  it('falls back safely from malformed JSON', () => {
    localStorage.setItem(STORAGE_KEYS.inventory, '{bad-json}');
    expect(getInventory()).toEqual([]);
  });

  it('uses default categories for missing or empty values', () => {
    expect(getCategories()).toEqual(DEFAULT_CATEGORIES);
    saveCategories([]);
    expect(getCategories()).toEqual(DEFAULT_CATEGORIES);
    saveCategories(['Tenda']);
    expect(getCategories()).toEqual(['Tenda']);
  });

  it('normalizes the theme', () => {
    saveTheme('dark');
    expect(getTheme()).toBe('dark');
    saveTheme('sepia');
    expect(getTheme()).toBe('light');
  });
});
