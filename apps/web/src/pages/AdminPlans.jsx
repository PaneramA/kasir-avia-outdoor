import React, { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { createPlanDefinition, fetchPlans, updatePlanDefinition } from '../lib/api'
import { ADMIN_CACHE_KEYS } from '../lib/adminCache'

const limitFields = [
  { key: 'maxBranches', label: 'Maksimal cabang', icon: 'fas fa-code-branch' },
  { key: 'maxTenantUsers', label: 'Maksimal user toko', icon: 'fas fa-users' },
  { key: 'maxItems', label: 'Maksimal item', icon: 'fas fa-boxes-stacked' },
  { key: 'maxMonthlyTransactions', label: 'Transaksi per bulan', icon: 'fas fa-receipt' },
]

const toggleFields = [
  { key: 'canManageBranches', label: 'Kelola cabang', description: 'Owner dapat menambah dan mengubah cabang.' },
  { key: 'canManageStaff', label: 'Kelola staf', description: 'Owner dapat membuat user dan mengatur akses staf.' },
  { key: 'canUseFinancialRecap', label: 'Rekap keuangan', description: 'Menu laporan keuangan tersedia di aplikasi toko.' },
  { key: 'canUseMultiBranch', label: 'Multi cabang', description: 'Operasional dapat memakai lebih dari satu cabang.' },
  { key: 'canExportData', label: 'Export data', description: 'Tombol export CSV dan Excel tersedia.' },
]

const emptyForm = {
  code: '', name: '', description: '', priceAmount: 0, pricePeriod: 'monthly', status: 'active',
  maxBranches: 1, maxTenantUsers: 3, maxItems: 150, maxMonthlyTransactions: 300,
  canManageBranches: true, canManageStaff: true, canUseFinancialRecap: false,
  canUseMultiBranch: false, canExportData: false,
}

function getFeatureValue(plan, key, fallback) {
  const feature = Array.isArray(plan?.features) ? plan.features.find((item) => item.key === key) : null
  return feature ? feature.value : fallback
}

function formFromPlan(plan) {
  if (!plan) return { ...emptyForm }
  return {
    code: plan.code || '',
    name: plan.name || '',
    description: plan.description || '',
    priceAmount: Number(plan.priceAmount || 0),
    pricePeriod: plan.pricePeriod || 'monthly',
    status: plan.status || 'active',
    maxBranches: getFeatureValue(plan, 'maxBranches', 1),
    maxTenantUsers: getFeatureValue(plan, 'maxTenantUsers', 1),
    maxItems: getFeatureValue(plan, 'maxItems', 1),
    maxMonthlyTransactions: getFeatureValue(plan, 'maxMonthlyTransactions', 1),
    canManageBranches: Boolean(getFeatureValue(plan, 'canManageBranches', false)),
    canManageStaff: Boolean(getFeatureValue(plan, 'canManageStaff', false)),
    canUseFinancialRecap: Boolean(getFeatureValue(plan, 'canUseFinancialRecap', false)),
    canUseMultiBranch: Boolean(getFeatureValue(plan, 'canUseMultiBranch', false)),
    canExportData: Boolean(getFeatureValue(plan, 'canExportData', false)),
  }
}

function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0))
}

function buildPayload(form) {
  return {
    code: form.code,
    name: form.name,
    description: form.description,
    priceAmount: Number(form.priceAmount),
    pricePeriod: form.pricePeriod,
    status: form.status,
    features: [
      ...limitFields.map(({ key }) => ({ key, valueType: 'integer', value: Number(form[key]) })),
      ...toggleFields.map(({ key }) => ({ key, valueType: 'boolean', value: Boolean(form[key]) })),
    ],
  }
}

const AdminPlans = () => {
  const planQuery = useSWR(ADMIN_CACHE_KEYS.plans, fetchPlans)
  const plans = useMemo(() => Array.isArray(planQuery.data) ? planQuery.data : [], [planQuery.data])
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (isCreating || plans.length === 0) return
    const selectedExists = plans.some((plan) => plan.id === selectedPlanId)
    if (!selectedExists) {
      setSelectedPlanId(plans[0].id)
      setForm(formFromPlan(plans[0]))
    }
  }, [isCreating, plans, selectedPlanId])

  const selectedPlan = useMemo(() => plans.find((plan) => plan.id === selectedPlanId) || null, [plans, selectedPlanId])

  const selectPlan = (plan) => {
    setSelectedPlanId(plan.id)
    setForm(formFromPlan(plan))
    setIsCreating(false)
    setMessage('')
    setErrorMessage('')
  }

  const startCreating = () => {
    setSelectedPlanId('')
    setForm({ ...emptyForm })
    setIsCreating(true)
    setMessage('')
    setErrorMessage('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setMessage('')
    setErrorMessage('')
    try {
      setIsSaving(true)
      const saved = isCreating
        ? await createPlanDefinition(buildPayload(form))
        : await updatePlanDefinition(selectedPlanId, buildPayload(form))
      setMessage(isCreating ? 'Paket baru berhasil dibuat.' : 'Perubahan paket berhasil disimpan dan berlaku untuk tenant pada paket ini.')
      await planQuery.mutate((currentPlans = []) => {
        const exists = currentPlans.some((plan) => plan.id === saved.id)
        return exists
          ? currentPlans.map((plan) => plan.id === saved.id ? saved : plan)
          : [...currentPlans, saved]
      }, { revalidate: false })
      setSelectedPlanId(saved.id)
      setForm(formFromPlan(saved))
      setIsCreating(false)
      void planQuery.mutate()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Gagal menyimpan paket.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {message && <div className="rounded-md border border-accent bg-card-bg p-3 text-sm font-medium text-accent">{message}</div>}
      {(errorMessage || planQuery.error) && <div className="rounded-md border border-red-600 bg-card-bg p-3 text-sm font-medium text-red-600">{errorMessage || planQuery.error?.message || 'Gagal memuat daftar paket.'}</div>}

      <div className="grid min-h-[640px] gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-md border border-border bg-card-bg">
          <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
            <div><p className="text-sm font-bold text-text-main">Daftar paket</p><p className="mt-0.5 text-xs text-text-muted">{plans.length} paket tersedia</p></div>
            <button type="button" aria-label="Buat paket baru" title="Buat paket baru" onClick={startCreating} className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-white hover:bg-accent-hover"><i className="fas fa-plus" /></button>
          </div>
          <div className="p-2">
            {planQuery.isLoading && <p className="p-4 text-sm text-text-muted">Memuat paket...</p>}
            {plans.map((plan) => (
              <button key={plan.id} type="button" onClick={() => selectPlan(plan)} className={`mb-1 w-full rounded-md border p-3 text-left transition ${!isCreating && selectedPlanId === plan.id ? 'border-accent bg-bg-main' : 'border-border bg-card-bg hover:bg-bg-main'}`}>
                <div className="flex items-start justify-between gap-2"><p className="font-semibold text-text-main">{plan.name}</p><span className={`rounded-md border px-2 py-1 text-[0.68rem] font-bold uppercase ${plan.status === 'active' ? 'border-accent bg-accent text-white' : 'border-border bg-bg-main text-text-muted'}`}>{plan.status}</span></div>
                <p className="mt-1 text-xs text-text-muted">{formatCurrency(plan.priceAmount)} / {plan.pricePeriod}</p>
                <p className="mt-2 text-xs text-text-muted">{plan.tenantCount || 0} tenant · {plan.code}</p>
              </button>
            ))}
          </div>
        </section>

        <form onSubmit={handleSubmit} className="rounded-md border border-border bg-card-bg">
          <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-lg font-bold text-text-main">{isCreating ? 'Paket baru' : (selectedPlan?.name || 'Editor paket')}</h2><p className="mt-1 text-xs text-text-muted">{isCreating ? 'Tentukan harga, kuota, dan fitur.' : `${selectedPlan?.tenantCount || 0} tenant menggunakan paket ini.`}</p></div>
            <button type="submit" disabled={isSaving || (!isCreating && !selectedPlanId)} className="min-h-11 rounded-md bg-accent px-5 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-60"><i className="fas fa-floppy-disk mr-2" />{isSaving ? 'Menyimpan...' : 'Simpan paket'}</button>
          </div>

          <div className="space-y-7 p-5 lg:p-6">
            <section>
              <h3 className="mb-4 text-sm font-bold text-text-main">Informasi paket</h3>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div><label className="mb-1.5 block text-xs font-semibold text-text-muted">Kode paket</label><input value={form.code} onChange={(event) => setForm((previous) => ({ ...previous, code: event.target.value }))} minLength="2" maxLength="40" className="min-h-11 w-full rounded-md border border-border bg-bg-main px-3 text-sm text-text-main outline-none placeholder:text-text-muted focus:border-accent" placeholder="pro-monthly" required /></div>
                <div><label className="mb-1.5 block text-xs font-semibold text-text-muted">Nama paket</label><input value={form.name} onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))} minLength="2" maxLength="120" className="min-h-11 w-full rounded-md border border-border bg-bg-main px-3 text-sm text-text-main outline-none focus:border-accent" required /></div>
                <div><label className="mb-1.5 block text-xs font-semibold text-text-muted">Harga</label><input type="number" min="0" step="1" value={form.priceAmount} onChange={(event) => setForm((previous) => ({ ...previous, priceAmount: event.target.value }))} className="min-h-11 w-full rounded-md border border-border bg-bg-main px-3 text-sm text-text-main outline-none focus:border-accent" required /></div>
                <div><label className="mb-1.5 block text-xs font-semibold text-text-muted">Periode</label><select value={form.pricePeriod} onChange={(event) => setForm((previous) => ({ ...previous, pricePeriod: event.target.value }))} className="min-h-11 w-full rounded-md border border-border bg-bg-main px-3 text-sm text-text-main outline-none focus:border-accent"><option value="monthly">Bulanan</option><option value="yearly">Tahunan</option><option value="custom">Custom</option></select></div>
                <div className="md:col-span-2 xl:col-span-3"><label className="mb-1.5 block text-xs font-semibold text-text-muted">Deskripsi</label><input value={form.description} onChange={(event) => setForm((previous) => ({ ...previous, description: event.target.value }))} maxLength="300" className="min-h-11 w-full rounded-md border border-border bg-bg-main px-3 text-sm text-text-main outline-none focus:border-accent" /></div>
                <div><label className="mb-1.5 block text-xs font-semibold text-text-muted">Status</label><select value={form.status} onChange={(event) => setForm((previous) => ({ ...previous, status: event.target.value }))} className="min-h-11 w-full rounded-md border border-border bg-bg-main px-3 text-sm text-text-main outline-none focus:border-accent"><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select></div>
              </div>
            </section>

            <section className="border-t border-border pt-6">
              <h3 className="mb-4 text-sm font-bold text-text-main">Batas pemakaian</h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {limitFields.map((field) => (
                  <label key={field.key} className="rounded-md border border-border bg-bg-main p-4">
                    <span className="flex items-center gap-2 text-xs font-semibold text-text-muted"><i className={`${field.icon} text-accent`} />{field.label}</span>
                    <input type="number" min="1" step="1" value={form[field.key]} onChange={(event) => setForm((previous) => ({ ...previous, [field.key]: event.target.value }))} className="mt-3 min-h-10 w-full rounded-md border border-border bg-card-bg px-3 text-sm font-bold text-text-main outline-none focus:border-accent" required />
                  </label>
                ))}
              </div>
            </section>

            <section className="border-t border-border pt-6">
              <h3 className="mb-4 text-sm font-bold text-text-main">Fitur yang tersedia</h3>
              <div className="divide-y divide-border rounded-md border border-border bg-card-bg">
                {toggleFields.map((field) => (
                  <label key={field.key} className="flex cursor-pointer items-center justify-between gap-4 p-4 hover:bg-bg-main">
                    <span><span className="block text-sm font-semibold text-text-main">{field.label}</span><span className="mt-0.5 block text-xs text-text-muted">{field.description}</span></span>
                    <span className="relative inline-flex h-6 w-11 shrink-0">
                      <input type="checkbox" checked={form[field.key]} onChange={(event) => setForm((previous) => ({ ...previous, [field.key]: event.target.checked }))} className="peer sr-only" />
                      <span className="absolute inset-0 rounded-full bg-border transition peer-checked:bg-accent" />
                      <span className="absolute left-1 top-1 h-4 w-4 rounded-full border border-border bg-card-bg transition-transform peer-checked:translate-x-5" />
                    </span>
                  </label>
                ))}
              </div>
            </section>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AdminPlans
