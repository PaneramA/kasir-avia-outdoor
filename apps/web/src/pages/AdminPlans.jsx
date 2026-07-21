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
      {message && <div className="rounded-lg border border-[#acd9c8] bg-[#edf9f4] p-3 text-sm text-[#176456]">{message}</div>}
      {(errorMessage || planQuery.error) && <div className="rounded-lg border border-[#e9b7b7] bg-[#fff1f1] p-3 text-sm text-[#a82f2f]">{errorMessage || planQuery.error?.message || 'Gagal memuat daftar paket.'}</div>}

      <div className="grid min-h-[640px] gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-lg border border-[#dce3e6] bg-white">
          <div className="flex items-center justify-between border-b border-[#e6ebed] px-4 py-3.5">
            <div><p className="text-sm font-bold">Daftar paket</p><p className="mt-0.5 text-xs text-[#71808a]">{plans.length} paket tersedia</p></div>
            <button type="button" aria-label="Buat paket baru" title="Buat paket baru" onClick={startCreating} className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#173f3a] text-white hover:bg-[#0f302c]"><i className="fas fa-plus" /></button>
          </div>
          <div className="p-2">
            {planQuery.isLoading && <p className="p-4 text-sm text-[#71808a]">Memuat paket...</p>}
            {plans.map((plan) => (
              <button key={plan.id} type="button" onClick={() => selectPlan(plan)} className={`mb-1 w-full rounded-lg border p-3 text-left transition ${!isCreating && selectedPlanId === plan.id ? 'border-[#76a69d] bg-[#eef7f5]' : 'border-transparent hover:bg-[#f4f6f7]'}`}>
                <div className="flex items-start justify-between gap-2"><p className="font-semibold">{plan.name}</p><span className={`rounded-full px-2 py-1 text-[0.68rem] font-bold uppercase ${plan.status === 'active' ? 'bg-[#dff3e7] text-[#267349]' : 'bg-[#e8ecee] text-[#65737d]'}`}>{plan.status}</span></div>
                <p className="mt-1 text-xs text-[#71808a]">{formatCurrency(plan.priceAmount)} / {plan.pricePeriod}</p>
                <p className="mt-2 text-xs text-[#85919a]">{plan.tenantCount || 0} tenant · {plan.code}</p>
              </button>
            ))}
          </div>
        </section>

        <form onSubmit={handleSubmit} className="rounded-lg border border-[#dce3e6] bg-white">
          <div className="flex flex-col gap-3 border-b border-[#e6ebed] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-lg font-bold">{isCreating ? 'Paket baru' : (selectedPlan?.name || 'Editor paket')}</h2><p className="mt-1 text-xs text-[#71808a]">{isCreating ? 'Tentukan harga, kuota, dan fitur.' : `${selectedPlan?.tenantCount || 0} tenant menggunakan paket ini.`}</p></div>
            <button type="submit" disabled={isSaving || (!isCreating && !selectedPlanId)} className="min-h-11 rounded-lg bg-[#173f3a] px-5 text-sm font-bold text-white hover:bg-[#0f302c] disabled:opacity-60"><i className="fas fa-floppy-disk mr-2" />{isSaving ? 'Menyimpan...' : 'Simpan paket'}</button>
          </div>

          <div className="space-y-7 p-5 lg:p-6">
            <section>
              <h3 className="mb-4 text-sm font-bold">Informasi paket</h3>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div><label className="mb-1.5 block text-xs font-semibold text-[#52616b]">Kode paket</label><input value={form.code} onChange={(event) => setForm((previous) => ({ ...previous, code: event.target.value }))} minLength="2" maxLength="40" className="min-h-11 w-full rounded-lg border border-[#cfd8dc] px-3 text-sm outline-none focus:border-[#2a7c6f]" placeholder="pro-monthly" required /></div>
                <div><label className="mb-1.5 block text-xs font-semibold text-[#52616b]">Nama paket</label><input value={form.name} onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))} minLength="2" maxLength="120" className="min-h-11 w-full rounded-lg border border-[#cfd8dc] px-3 text-sm outline-none focus:border-[#2a7c6f]" required /></div>
                <div><label className="mb-1.5 block text-xs font-semibold text-[#52616b]">Harga</label><input type="number" min="0" step="1" value={form.priceAmount} onChange={(event) => setForm((previous) => ({ ...previous, priceAmount: event.target.value }))} className="min-h-11 w-full rounded-lg border border-[#cfd8dc] px-3 text-sm outline-none focus:border-[#2a7c6f]" required /></div>
                <div><label className="mb-1.5 block text-xs font-semibold text-[#52616b]">Periode</label><select value={form.pricePeriod} onChange={(event) => setForm((previous) => ({ ...previous, pricePeriod: event.target.value }))} className="min-h-11 w-full rounded-lg border border-[#cfd8dc] bg-white px-3 text-sm"><option value="monthly">Bulanan</option><option value="yearly">Tahunan</option><option value="custom">Custom</option></select></div>
                <div className="md:col-span-2 xl:col-span-3"><label className="mb-1.5 block text-xs font-semibold text-[#52616b]">Deskripsi</label><input value={form.description} onChange={(event) => setForm((previous) => ({ ...previous, description: event.target.value }))} maxLength="300" className="min-h-11 w-full rounded-lg border border-[#cfd8dc] px-3 text-sm outline-none focus:border-[#2a7c6f]" /></div>
                <div><label className="mb-1.5 block text-xs font-semibold text-[#52616b]">Status</label><select value={form.status} onChange={(event) => setForm((previous) => ({ ...previous, status: event.target.value }))} className="min-h-11 w-full rounded-lg border border-[#cfd8dc] bg-white px-3 text-sm"><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select></div>
              </div>
            </section>

            <section className="border-t border-[#edf0f1] pt-6">
              <h3 className="mb-4 text-sm font-bold">Batas pemakaian</h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {limitFields.map((field) => (
                  <label key={field.key} className="rounded-lg border border-[#dce3e6] p-4">
                    <span className="flex items-center gap-2 text-xs font-semibold text-[#52616b]"><i className={`${field.icon} text-[#176456]`} />{field.label}</span>
                    <input type="number" min="1" step="1" value={form[field.key]} onChange={(event) => setForm((previous) => ({ ...previous, [field.key]: event.target.value }))} className="mt-3 min-h-10 w-full rounded-lg border border-[#cfd8dc] px-3 text-sm font-bold outline-none focus:border-[#2a7c6f]" required />
                  </label>
                ))}
              </div>
            </section>

            <section className="border-t border-[#edf0f1] pt-6">
              <h3 className="mb-4 text-sm font-bold">Fitur yang tersedia</h3>
              <div className="divide-y divide-[#edf0f1] rounded-lg border border-[#dce3e6]">
                {toggleFields.map((field) => (
                  <label key={field.key} className="flex cursor-pointer items-center justify-between gap-4 p-4 hover:bg-[#fafbfb]">
                    <span><span className="block text-sm font-semibold">{field.label}</span><span className="mt-0.5 block text-xs text-[#71808a]">{field.description}</span></span>
                    <span className="relative inline-flex h-6 w-11 shrink-0">
                      <input type="checkbox" checked={form[field.key]} onChange={(event) => setForm((previous) => ({ ...previous, [field.key]: event.target.checked }))} className="peer sr-only" />
                      <span className="absolute inset-0 rounded-full bg-[#c8d0d4] transition peer-checked:bg-[#2a7c6f]" />
                      <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
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
