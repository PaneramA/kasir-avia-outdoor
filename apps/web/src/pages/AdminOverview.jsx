import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import useSWR from 'swr'
import { fetchPlans, fetchTenants } from '../lib/api'
import { ADMIN_CACHE_KEYS } from '../lib/adminCache'
import { APP_ROUTES } from '../lib/routes'

function formatDate(value) {
  const date = new Date(value || '')
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

const AdminOverview = ({ currentUser }) => {
  const tenantQuery = useSWR(ADMIN_CACHE_KEYS.tenants, fetchTenants)
  const planQuery = useSWR(ADMIN_CACHE_KEYS.plans, fetchPlans)
  const tenants = useMemo(() => Array.isArray(tenantQuery.data) ? tenantQuery.data : [], [tenantQuery.data])
  const plans = useMemo(() => Array.isArray(planQuery.data) ? planQuery.data : [], [planQuery.data])
  const isLoading = tenantQuery.isLoading || planQuery.isLoading
  const isRefreshing = tenantQuery.isValidating || planQuery.isValidating
  const queryError = tenantQuery.error || planQuery.error
  const errorMessage = queryError instanceof Error ? queryError.message : (queryError ? 'Gagal memuat ringkasan admin.' : '')

  const refreshData = () => Promise.all([tenantQuery.mutate(), planQuery.mutate()])

  const pendingTenants = useMemo(
    () => tenants.filter((tenant) => String(tenant.status).toLowerCase() !== 'active'),
    [tenants],
  )
  const activePlans = useMemo(
    () => plans.filter((plan) => String(plan.status).toLowerCase() === 'active'),
    [plans],
  )
  const recentTenants = useMemo(
    () => [...tenants].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)).slice(0, 6),
    [tenants],
  )

  const stats = [
    { label: 'Total toko', value: tenants.length, icon: 'fas fa-store', tone: 'bg-[#e8f0ee] text-[#176456]' },
    { label: 'Toko aktif', value: tenants.length - pendingTenants.length, icon: 'fas fa-circle-check', tone: 'bg-[#eaf7ef] text-[#267349]' },
    { label: 'Perlu ditinjau', value: pendingTenants.length, icon: 'fas fa-clock', tone: 'bg-[#fff4df] text-[#9a6500]' },
    { label: 'Paket aktif', value: activePlans.length, icon: 'fas fa-box-open', tone: 'bg-[#edf0fa] text-[#465ca8]' },
  ]

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 rounded-lg border border-[#dce3e6] bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="text-sm text-[#71808a]">Selamat datang, {currentUser?.username || 'Admin'}</p>
          <h2 className="mt-1 text-xl font-bold sm:text-2xl">Ringkasan platform</h2>
        </div>
        <button type="button" onClick={() => void refreshData()} disabled={isRefreshing} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#cfd8dc] px-4 text-sm font-semibold text-[#52616b] hover:border-[#2a7c6f] disabled:opacity-60">
          <i className={`fas fa-rotate-right ${isRefreshing ? 'animate-spin' : ''}`} />
          Perbarui data
        </button>
      </section>

      {errorMessage && <div className="rounded-lg border border-[#e9b7b7] bg-[#fff1f1] p-3 text-sm text-[#a82f2f]">{errorMessage}</div>}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <article key={stat.label} className="rounded-lg border border-[#dce3e6] bg-white p-4 sm:p-5">
            <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${stat.tone}`}><i className={stat.icon} /></span>
            <p className="mt-4 text-2xl font-bold">{isLoading ? '-' : stat.value}</p>
            <p className="mt-1 text-sm text-[#71808a]">{stat.label}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.7fr)]">
        <div className="overflow-hidden rounded-lg border border-[#dce3e6] bg-white">
          <div className="flex items-center justify-between border-b border-[#e6ebed] px-5 py-4">
            <div>
              <h3 className="font-bold">Toko terbaru</h3>
              <p className="mt-0.5 text-xs text-[#71808a]">Status dan paket saat ini</p>
            </div>
            <Link to={APP_ROUTES.adminStores} className="text-sm font-semibold text-[#176456] hover:underline">Lihat semua</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead className="bg-[#f7f9fa] text-xs uppercase text-[#71808a]">
                <tr>
                  <th className="px-5 py-3 font-semibold">Toko</th>
                  <th className="px-5 py-3 font-semibold">Paket</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Terdaftar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf0f1]">
                {recentTenants.map((tenant) => (
                  <tr key={tenant.id}>
                    <td className="px-5 py-3.5"><p className="font-semibold">{tenant.name}</p><p className="text-xs text-[#85919a]">{tenant.slug}</p></td>
                    <td className="px-5 py-3.5 text-[#52616b]">{tenant.subscription?.plan?.name || '-'}</td>
                    <td className="px-5 py-3.5"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${String(tenant.status).toLowerCase() === 'active' ? 'bg-[#eaf7ef] text-[#267349]' : 'bg-[#fff4df] text-[#9a6500]'}`}>{tenant.status}</span></td>
                    <td className="px-5 py-3.5 text-[#71808a]">{formatDate(tenant.createdAt)}</td>
                  </tr>
                ))}
                {!isLoading && recentTenants.length === 0 && <tr><td colSpan="4" className="px-5 py-8 text-center text-[#71808a]">Belum ada toko.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-3">
          <Link to={APP_ROUTES.adminStores} className="flex items-center justify-between rounded-lg border border-[#dce3e6] bg-white p-4 transition hover:border-[#76a69d]">
            <span className="flex items-center gap-3"><i className="fas fa-store text-[#176456]" /><span className="text-sm font-semibold">Kelola toko</span></span><i className="fas fa-chevron-right text-xs text-[#85919a]" />
          </Link>
          <Link to={APP_ROUTES.adminPlans} className="flex items-center justify-between rounded-lg border border-[#dce3e6] bg-white p-4 transition hover:border-[#76a69d]">
            <span className="flex items-center gap-3"><i className="fas fa-sliders text-[#465ca8]" /><span className="text-sm font-semibold">Edit paket & fitur</span></span><i className="fas fa-chevron-right text-xs text-[#85919a]" />
          </Link>
          {pendingTenants.length > 0 && (
            <div className="rounded-lg border border-[#e4c97b] bg-[#fff8df] p-4">
              <p className="text-sm font-bold text-[#76580d]">{pendingTenants.length} toko perlu ditinjau</p>
              <p className="mt-1 text-xs leading-relaxed text-[#8b6c21]">Periksa paket dan status subscription sebelum mengaktifkan toko.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export default AdminOverview
