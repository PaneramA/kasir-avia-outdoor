export const APP_BRAND = {
  name: 'Sewantara',
  fullName: 'Sewa Nusantara',
  adminName: 'Sewantara Admin',
  logoSrc: '/icons/sewantara-icon-192.png',
}

const LEGACY_BRAND_NAMES = new Set([
  'aviaoutdoor',
  'avia outdoor',
  'kasiravo',
  'kasir avo',
])

export function isLegacyBrandName(value) {
  return LEGACY_BRAND_NAMES.has(String(value || '').trim().toLowerCase())
}

export function resolveAppBrandName(value) {
  const normalized = String(value || '').trim()
  return normalized && !isLegacyBrandName(normalized) ? normalized : APP_BRAND.name
}

export function formatDashboardBrandName(value, maxLength = 11) {
  const brandName = resolveAppBrandName(value)
  return Array.from(brandName).slice(0, maxLength).join('')
}
