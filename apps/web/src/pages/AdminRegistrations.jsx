import React, { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import AdminTenantOnboarding from '../components/AdminTenantOnboarding'
import { deleteTenant, fetchPlans, fetchTenants, updateTenant, updateTenantSubscription } from '../lib/api'
import { ADMIN_CACHE_KEYS } from '../lib/adminCache'

const featureLabels = {
  canManageBranches: 'Kelola cabang',
  canManageStaff: 'Kelola staf',
  canUseFinancialRecap: 'Rekap keuangan',
  canUseMultiBranch: 'Multi cabang',
  canExportData: 'Export data',
}

function toDateInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function toApiDate(value) {
  if (!value) return null
  return new Date(`${value}T23:59:59.999Z`).toISOString()
}

function buildDraft(tenant, plans) {
  const subscription = tenant?.subscription || {}
  return {
    name: tenant?.name || '',
    slug: tenant?.slug || '',
    tenantStatus: tenant?.status || 'suspended',
    planId: subscription.planId || plans[0]?.id || '',
    subscriptionStatus: subscription.status || 'trial',
    startsAt: toDateInput(subscription.startsAt),
    endsAt: toDateInput(subscription.endsAt),
    graceEndsAt: toDateInput(subscription.graceEndsAt),
    billingNotes: subscription.billingNotes || '',
  }
}

function getPlanFeature(plan, key, fallback = false) {
  const feature = Array.isArray(plan?.features) ? plan.features.find((item) => item.key === key) : null
  return feature ? feature.value : fallback
}

function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0))
}

const AdminRegistrations = () => {
  const tenantQuery = useSWR(ADMIN_CACHE_KEYS.tenants, fetchTenants)
  const planQuery = useSWR(ADMIN_CACHE_KEYS.plans, fetchPlans)
  const tenants = useMemo(() => Array.isArray(tenantQuery.data) ? tenantQuery.data : [], [tenantQuery.data])
  const plans = useMemo(() => Array.isArray(planQuery.data) ? planQuery.data : [], [planQuery.data])
  const [drafts, setDrafts] = useState({})
  const [selectedTenantId, setSelectedTenantId] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false)
  const [savingTenantId, setSavingTenantId] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteForm, setDeleteForm] = useState({ confirmationText: '', password: '' })
  const [isDeleting, setIsDeleting] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    setDrafts((previous) => tenants.reduce((result, tenant) => ({
      ...result,
      [tenant.id]: previous[tenant.id] || buildDraft(tenant, plans),
    }), {}))
    setSelectedTenantId((current) => tenants.some((tenant) => tenant.id === current) ? current : (tenants[0]?.id || ''))
  }, [plans, tenants])

  const isLoading = tenantQuery.isLoading || planQuery.isLoading
  const queryError = tenantQuery.error || planQuery.error
  const queryErrorMessage = queryError instanceof Error ? queryError.message : (queryError ? 'Gagal memuat data toko.' : '')

  const handleRefresh = async () => {
    setErrorMessage('')
    try {
      await Promise.all([tenantQuery.mutate(), planQuery.mutate()])
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Gagal memperbarui data toko.')
    }
  }

  const handleTenantCreated = async (created) => {
    const createdTenant = created?.tenant
    if (!createdTenant?.id) return
    await tenantQuery.mutate((currentTenants = []) => [
      createdTenant,
      ...currentTenants.filter((tenant) => tenant.id !== createdTenant.id),
    ], { revalidate: false })
    setSelectedTenantId(createdTenant.id)
    setMessage(`Toko ${createdTenant.name} dan akun owner berhasil dibuat.`)
    void tenantQuery.mutate()
  }

  const filteredTenants = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return tenants.filter((tenant) => {
      const matchesQuery = !keyword || [tenant.name, tenant.slug, ...(tenant.ownerUsernames || [])]
        .some((value) => String(value || '').toLowerCase().includes(keyword))
      const matchesStatus = statusFilter === 'all' || String(tenant.status).toLowerCase() === statusFilter
      return matchesQuery && matchesStatus
    })
  }, [query, statusFilter, tenants])

  const selectedTenant = tenants.find((tenant) => tenant.id === selectedTenantId) || null
  const selectedDraft = selectedTenant ? (drafts[selectedTenant.id] || buildDraft(selectedTenant, plans)) : null
  const selectedPlan = plans.find((plan) => plan.id === selectedDraft?.planId) || null

  const updateDraft = (patch) => {
    if (!selectedTenant) return
    setDrafts((previous) => ({
      ...previous,
      [selectedTenant.id]: { ...(previous[selectedTenant.id] || buildDraft(selectedTenant, plans)), ...patch },
    }))
  }

  const handleSave = async (event) => {
    event.preventDefault()
    if (!selectedTenant || !selectedDraft?.planId) return
    setMessage('')
    setErrorMessage('')
    try {
      setSavingTenantId(selectedTenant.id)
      await updateTenant(selectedTenant.id, {
        name: selectedDraft.name,
        slug: selectedDraft.slug,
        status: selectedDraft.tenantStatus,
      })
      await updateTenantSubscription(selectedTenant.id, {
        planId: selectedDraft.planId,
        status: selectedDraft.subscriptionStatus,
        startsAt: selectedDraft.startsAt ? new Date(`${selectedDraft.startsAt}T00:00:00.000Z`).toISOString() : undefined,
        endsAt: toApiDate(selectedDraft.endsAt),
        graceEndsAt: toApiDate(selectedDraft.graceEndsAt),
        billingNotes: selectedDraft.billingNotes,
      })
      setMessage(`Perubahan ${selectedDraft.name} berhasil disimpan.`)
      setDrafts({})
      await tenantQuery.mutate()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Gagal menyimpan perubahan toko.')
    } finally {
      setSavingTenantId('')
    }
  }

  const openDeleteDialog = () => {
    if (!selectedTenant) return
    setDeleteTarget(selectedTenant)
    setDeleteForm({ confirmationText: '', password: '' })
    setMessage('')
    setErrorMessage('')
  }

  const closeDeleteDialog = () => {
    if (isDeleting) return
    setDeleteTarget(null)
    setDeleteForm({ confirmationText: '', password: '' })
  }

  const handleDelete = async (event) => {
    event.preventDefault()
    if (!deleteTarget) return

    setMessage('')
    setErrorMessage('')
    try {
      setIsDeleting(true)
      const removed = await deleteTenant(deleteTarget.id, deleteForm)
      const remainingTenants = tenants.filter((tenant) => tenant.id !== deleteTarget.id)
      setDeleteTarget(null)
      setDeleteForm({ confirmationText: '', password: '' })
      await tenantQuery.mutate(remainingTenants, { revalidate: false })
      setSelectedTenantId(remainingTenants[0]?.id || '')
      setDrafts((previous) => Object.fromEntries(
        Object.entries(previous).filter(([tenantId]) => tenantId !== deleteTarget.id),
      ))
      setMessage(`Toko ${removed?.name || deleteTarget.name} beserta seluruh datanya berhasil dihapus.`)
      void tenantQuery.mutate()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Gagal menghapus toko.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-5">
      {message && <div className="rounded-lg border border-[#acd9c8] bg-[#edf9f4] p-3 text-sm text-[#176456]">{message}</div>}
      {(errorMessage || queryErrorMessage) && <div className="rounded-lg border border-[#e9b7b7] bg-[#fff1f1] p-3 text-sm text-[#a82f2f]">{errorMessage || queryErrorMessage}</div>}

      <section className="rounded-lg border border-[#dce3e6] bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto_auto]">
          <div className="relative">
            <i className="fas fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#85919a]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama, slug, atau owner" className="min-h-11 w-full rounded-lg border border-[#cfd8dc] pl-10 pr-3 text-sm outline-none focus:border-[#2a7c6f]" />
          </div>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-h-11 rounded-lg border border-[#cfd8dc] bg-white px-3 text-sm outline-none focus:border-[#2a7c6f]">
            <option value="all">Semua status</option>
            <option value="active">Aktif</option>
            <option value="suspended">Suspended</option>
          </select>
          <button type="button" onClick={() => void handleRefresh()} disabled={tenantQuery.isValidating || planQuery.isValidating} className="min-h-11 rounded-lg border border-[#cfd8dc] px-4 text-sm font-semibold text-[#52616b] hover:border-[#2a7c6f] disabled:opacity-60"><i className={`fas fa-rotate-right mr-2 ${(tenantQuery.isValidating || planQuery.isValidating) ? 'animate-spin' : ''}`} />Perbarui</button>
          <button type="button" onClick={() => setIsOnboardingOpen(true)} className="min-h-11 rounded-lg bg-[#173f3a] px-4 text-sm font-bold text-white hover:bg-[#0f302c]"><i className="fas fa-plus mr-2" />Tambah toko</button>
        </div>
      </section>

      <div className="grid min-h-[620px] gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-lg border border-[#dce3e6] bg-white">
          <div className="border-b border-[#e6ebed] px-4 py-3.5">
            <p className="text-sm font-bold">Daftar toko</p>
            <p className="mt-0.5 text-xs text-[#71808a]">{filteredTenants.length} dari {tenants.length} toko</p>
          </div>
          <div className="max-h-[680px] overflow-y-auto p-2">
            {isLoading && <p className="p-4 text-sm text-[#71808a]">Memuat toko...</p>}
            {!isLoading && filteredTenants.map((tenant) => (
              <button
                type="button"
                key={tenant.id}
                onClick={() => { setSelectedTenantId(tenant.id); setMessage(''); setErrorMessage('') }}
                className={`mb-1 w-full rounded-lg border p-3 text-left transition ${selectedTenantId === tenant.id ? 'border-[#76a69d] bg-[#eef7f5]' : 'border-transparent hover:bg-[#f4f6f7]'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold">{tenant.name}</p><p className="mt-0.5 truncate text-xs text-[#85919a]">{tenant.slug}</p></div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[0.68rem] font-bold uppercase ${String(tenant.status).toLowerCase() === 'active' ? 'bg-[#dff3e7] text-[#267349]' : 'bg-[#fff0cf] text-[#8b6108]'}`}>{tenant.status}</span>
                </div>
                <p className="mt-2 text-xs text-[#65737d]">{tenant.subscription?.plan?.name || 'Tanpa paket'} · {tenant.branchCount ?? 0} cabang</p>
              </button>
            ))}
            {!isLoading && filteredTenants.length === 0 && <p className="p-4 text-center text-sm text-[#71808a]">Toko tidak ditemukan.</p>}
          </div>
        </section>

        <section className="rounded-lg border border-[#dce3e6] bg-white">
          {!selectedTenant || !selectedDraft ? (
            <div className="flex min-h-[420px] items-center justify-center p-6 text-sm text-[#71808a]">Pilih toko untuk membuka pengaturan.</div>
          ) : (
            <form onSubmit={handleSave}>
              <div className="flex flex-col gap-3 border-b border-[#e6ebed] p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold">{selectedTenant.name}</h2>
                  <p className="mt-1 text-xs text-[#71808a]">Owner: {selectedTenant.ownerUsernames?.join(', ') || '-'} · {selectedTenant.membershipCount ?? 0} user</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={openDeleteDialog} className="min-h-11 rounded-lg border border-[#e1aaaa] bg-white px-4 text-sm font-bold text-[#b52f2f] hover:bg-[#fff1f1]"><i className="fas fa-trash-can mr-2" />Hapus toko</button>
                  <button type="submit" disabled={savingTenantId === selectedTenant.id} className="min-h-11 rounded-lg bg-[#173f3a] px-5 text-sm font-bold text-white hover:bg-[#0f302c] disabled:opacity-60"><i className="fas fa-floppy-disk mr-2" />{savingTenantId === selectedTenant.id ? 'Menyimpan...' : 'Simpan perubahan'}</button>
                </div>
              </div>

              <div className="grid gap-6 p-5 lg:grid-cols-2 lg:p-6">
                <div className="space-y-4">
                  <h3 className="border-b border-[#edf0f1] pb-2 text-sm font-bold">Identitas toko</h3>
                  <div><label className="mb-1.5 block text-xs font-semibold text-[#52616b]">Nama toko</label><input value={selectedDraft.name} onChange={(event) => updateDraft({ name: event.target.value })} minLength="2" maxLength="120" className="min-h-11 w-full rounded-lg border border-[#cfd8dc] px-3 text-sm outline-none focus:border-[#2a7c6f]" required /></div>
                  <div><label className="mb-1.5 block text-xs font-semibold text-[#52616b]">Slug</label><input value={selectedDraft.slug} onChange={(event) => updateDraft({ slug: event.target.value })} minLength="2" maxLength="80" className="min-h-11 w-full rounded-lg border border-[#cfd8dc] px-3 text-sm outline-none focus:border-[#2a7c6f]" required /></div>
                  <div><label className="mb-1.5 block text-xs font-semibold text-[#52616b]">Status toko</label><select value={selectedDraft.tenantStatus} onChange={(event) => updateDraft({ tenantStatus: event.target.value })} className="min-h-11 w-full rounded-lg border border-[#cfd8dc] bg-white px-3 text-sm outline-none focus:border-[#2a7c6f]"><option value="active">Aktif</option><option value="suspended">Suspended</option></select></div>

                  <h3 className="border-b border-[#edf0f1] pb-2 pt-2 text-sm font-bold">Masa langganan</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="mb-1.5 block text-xs font-semibold text-[#52616b]">Mulai</label><input type="date" value={selectedDraft.startsAt} onChange={(event) => updateDraft({ startsAt: event.target.value })} className="min-h-11 w-full rounded-lg border border-[#cfd8dc] px-3 text-sm" /></div>
                    <div><label className="mb-1.5 block text-xs font-semibold text-[#52616b]">Berakhir</label><input type="date" value={selectedDraft.endsAt} onChange={(event) => updateDraft({ endsAt: event.target.value })} className="min-h-11 w-full rounded-lg border border-[#cfd8dc] px-3 text-sm" /></div>
                  </div>
                  <div><label className="mb-1.5 block text-xs font-semibold text-[#52616b]">Batas grace period</label><input type="date" value={selectedDraft.graceEndsAt} onChange={(event) => updateDraft({ graceEndsAt: event.target.value })} className="min-h-11 w-full rounded-lg border border-[#cfd8dc] px-3 text-sm" /></div>
                </div>

                <div className="space-y-4">
                  <h3 className="border-b border-[#edf0f1] pb-2 text-sm font-bold">Paket & akses</h3>
                  <div><label className="mb-1.5 block text-xs font-semibold text-[#52616b]">Paket langganan</label><select value={selectedDraft.planId} onChange={(event) => updateDraft({ planId: event.target.value })} className="min-h-11 w-full rounded-lg border border-[#cfd8dc] bg-white px-3 text-sm outline-none focus:border-[#2a7c6f]" required>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {formatCurrency(plan.priceAmount)}</option>)}</select></div>
                  <div><label className="mb-1.5 block text-xs font-semibold text-[#52616b]">Status subscription</label><select value={selectedDraft.subscriptionStatus} onChange={(event) => updateDraft({ subscriptionStatus: event.target.value })} className="min-h-11 w-full rounded-lg border border-[#cfd8dc] bg-white px-3 text-sm outline-none focus:border-[#2a7c6f]"><option value="trial">Trial</option><option value="active">Aktif</option><option value="suspended">Suspended</option><option value="expired">Expired</option></select></div>

                  {selectedPlan && (
                    <div className="rounded-lg border border-[#d8e5e2] bg-[#f3f8f7] p-4">
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div><p className="text-[#71808a]">Cabang</p><p className="mt-0.5 font-bold">{getPlanFeature(selectedPlan, 'maxBranches', 0)}</p></div>
                        <div><p className="text-[#71808a]">User</p><p className="mt-0.5 font-bold">{getPlanFeature(selectedPlan, 'maxTenantUsers', 0)}</p></div>
                        <div><p className="text-[#71808a]">Item</p><p className="mt-0.5 font-bold">{getPlanFeature(selectedPlan, 'maxItems', 0)}</p></div>
                        <div><p className="text-[#71808a]">Transaksi/bulan</p><p className="mt-0.5 font-bold">{getPlanFeature(selectedPlan, 'maxMonthlyTransactions', 0)}</p></div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {Object.entries(featureLabels).map(([key, label]) => (
                          <span key={key} className={`rounded-full px-2.5 py-1 text-[0.7rem] font-semibold ${getPlanFeature(selectedPlan, key, false) ? 'bg-[#dff3e7] text-[#267349]' : 'bg-[#e8ecee] text-[#71808a]'}`}>{getPlanFeature(selectedPlan, key, false) ? 'Aktif' : 'Nonaktif'} · {label}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div><label className="mb-1.5 block text-xs font-semibold text-[#52616b]">Catatan billing</label><textarea value={selectedDraft.billingNotes} onChange={(event) => updateDraft({ billingNotes: event.target.value })} maxLength="300" rows="5" className="w-full rounded-lg border border-[#cfd8dc] p-3 text-sm outline-none focus:border-[#2a7c6f]" placeholder="Catatan pembayaran atau onboarding" /><p className="mt-1 text-right text-xs text-[#85919a]">{selectedDraft.billingNotes.length}/300</p></div>
                </div>
              </div>
            </form>
          )}
        </section>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#17202a]/55 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDeleteDialog() }}>
          <section role="dialog" aria-modal="true" aria-labelledby="delete-tenant-title" className="w-full max-w-[500px] rounded-lg border border-[#dce3e6] bg-white shadow-[0_24px_70px_rgba(23,32,42,0.3)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#e6ebed] p-5">
              <div className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#fff0f0] text-[#b52f2f]"><i className="fas fa-triangle-exclamation" /></span>
                <div>
                  <h2 id="delete-tenant-title" className="text-lg font-bold text-[#17202a]">Hapus toko secara permanen</h2>
                  <p className="mt-1 text-sm text-[#71808a]">{deleteTarget.name}</p>
                </div>
              </div>
              <button type="button" aria-label="Tutup dialog" onClick={closeDeleteDialog} disabled={isDeleting} className="flex h-9 w-9 items-center justify-center rounded-lg text-[#71808a] hover:bg-[#f1f3f4]"><i className="fas fa-xmark" /></button>
            </div>

            <form onSubmit={handleDelete} className="space-y-4 p-5">
              <div className="rounded-lg border border-[#e9b7b7] bg-[#fff5f5] p-3 text-sm leading-relaxed text-[#8f2d2d]">
                Seluruh cabang, inventaris, transaksi, customer, user toko, dan pengaturan langganan akan dihapus dan tidak dapat dipulihkan.
              </div>

              <div>
                <label htmlFor="delete-tenant-confirmation" className="mb-1.5 block text-sm font-semibold text-[#34434d]">Ketik nama toko untuk konfirmasi</label>
                <div className="mb-2 rounded-lg bg-[#f3f5f6] px-3 py-2 font-mono text-sm font-bold text-[#17202a]">{deleteTarget.name}</div>
                <input
                  id="delete-tenant-confirmation"
                  value={deleteForm.confirmationText}
                  onChange={(event) => setDeleteForm((previous) => ({ ...previous, confirmationText: event.target.value }))}
                  autoComplete="off"
                  className="min-h-11 w-full rounded-lg border border-[#cfd8dc] px-3 text-sm outline-none focus:border-[#b52f2f] focus:ring-2 focus:ring-[#b52f2f]/10"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="delete-tenant-password" className="mb-1.5 block text-sm font-semibold text-[#34434d]">Password admin</label>
                <input
                  id="delete-tenant-password"
                  type="password"
                  value={deleteForm.password}
                  onChange={(event) => setDeleteForm((previous) => ({ ...previous, password: event.target.value }))}
                  autoComplete="current-password"
                  className="min-h-11 w-full rounded-lg border border-[#cfd8dc] px-3 text-sm outline-none focus:border-[#b52f2f] focus:ring-2 focus:ring-[#b52f2f]/10"
                  required
                />
              </div>

              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={closeDeleteDialog} disabled={isDeleting} className="min-h-11 rounded-lg border border-[#cfd8dc] px-4 text-sm font-semibold text-[#52616b] hover:bg-[#f4f6f7] disabled:opacity-60">Batal</button>
                <button
                  type="submit"
                  disabled={isDeleting || deleteForm.confirmationText !== deleteTarget.name || !deleteForm.password}
                  className="min-h-11 rounded-lg bg-[#b52f2f] px-5 text-sm font-bold text-white hover:bg-[#912525] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <i className="fas fa-trash-can mr-2" />{isDeleting ? 'Menghapus...' : 'Hapus permanen'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {isOnboardingOpen && (
        <AdminTenantOnboarding
          plans={plans}
          onClose={() => setIsOnboardingOpen(false)}
          onCreated={handleTenantCreated}
        />
      )}
    </div>
  )
}

export default AdminRegistrations
