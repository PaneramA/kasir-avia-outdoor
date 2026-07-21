export const ADMIN_CACHE_KEYS = {
  tenants: 'admin/tenants',
  plans: 'admin/plans',
}

export const ADMIN_SWR_OPTIONS = {
  dedupingInterval: 5000,
  errorRetryCount: 2,
  keepPreviousData: true,
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
}
