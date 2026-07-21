import React, { useMemo, useState } from 'react'
import { onboardTenant } from '../lib/api'

const initialForm = {
  storeName: '', storeSlug: '', tenantStatus: 'active',
  ownerUsername: '', ownerPassword: '',
  initialBranchCode: 'pusat', initialBranchName: 'Toko Pusat',
  planId: '', subscriptionStatus: 'active', startsAt: new Date().toISOString().slice(0, 10),
  endsAt: '', graceEndsAt: '', billingNotes: '',
}

function slugify(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
}

function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
  const bytes = new Uint32Array(14)
  window.crypto.getRandomValues(bytes)
  return [...bytes].map((value) => alphabet[value % alphabet.length]).join('')
}

function toIsoStart(value) {
  return value ? new Date(`${value}T00:00:00.000Z`).toISOString() : undefined
}

function toIsoEnd(value) {
  return value ? new Date(`${value}T23:59:59.999Z`).toISOString() : null
}

function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0))
}

const AdminTenantOnboarding = ({ plans = [], onClose, onCreated }) => {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState(() => ({ ...initialForm, planId: plans.find((plan) => plan.status === 'active')?.id || plans[0]?.id || '' }))
  const [slugTouched, setSlugTouched] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [createdResult, setCreatedResult] = useState(null)

  const selectedPlan = useMemo(() => plans.find((plan) => plan.id === form.planId) || null, [form.planId, plans])

  const updateForm = (patch) => setForm((previous) => ({ ...previous, ...patch }))

  const validateStep = () => {
    setErrorMessage('')
    if (step === 1) {
      if (form.storeName.trim().length < 2 || form.storeSlug.trim().length < 2) {
        setErrorMessage('Nama dan slug toko wajib diisi.')
        return false
      }
      if (form.ownerUsername.trim().length < 3 || form.ownerPassword.length < 8) {
        setErrorMessage('Username owner minimal 3 karakter dan password minimal 8 karakter.')
        return false
      }
    }
    if (step === 2) {
      if (form.initialBranchCode.trim().length < 2 || form.initialBranchName.trim().length < 2 || !form.planId) {
        setErrorMessage('Data cabang dan paket wajib diisi.')
        return false
      }
      if (form.endsAt && form.startsAt && form.endsAt < form.startsAt) {
        setErrorMessage('Tanggal berakhir tidak boleh sebelum tanggal mulai.')
        return false
      }
      if (form.graceEndsAt && form.endsAt && form.graceEndsAt < form.endsAt) {
        setErrorMessage('Grace period tidak boleh sebelum tanggal berakhir.')
        return false
      }
    }
    return true
  }

  const handleNext = () => {
    if (validateStep()) setStep((current) => Math.min(3, current + 1))
  }

  const handleSubmit = async () => {
    setErrorMessage('')
    try {
      setIsSubmitting(true)
      const created = await onboardTenant({
        storeName: form.storeName.trim(),
        storeSlug: form.storeSlug.trim(),
        tenantStatus: form.tenantStatus,
        ownerUsername: form.ownerUsername.trim(),
        ownerPassword: form.ownerPassword,
        initialBranchCode: form.initialBranchCode.trim(),
        initialBranchName: form.initialBranchName.trim(),
        planId: form.planId,
        subscriptionStatus: form.subscriptionStatus,
        startsAt: toIsoStart(form.startsAt),
        endsAt: toIsoEnd(form.endsAt),
        graceEndsAt: toIsoEnd(form.graceEndsAt),
        billingNotes: form.billingNotes.trim(),
      })
      setCreatedResult({ ...created, temporaryPassword: form.ownerPassword })
      await onCreated?.(created)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Gagal membuat toko baru.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (createdResult) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#17202a]/55 p-4">
        <section role="dialog" aria-modal="true" className="w-full max-w-[520px] rounded-lg bg-white p-6 shadow-[0_24px_70px_rgba(23,32,42,0.3)]">
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#eaf7ef] text-lg text-[#267349]"><i className="fas fa-circle-check" /></span>
          <h2 className="mt-4 text-xl font-bold">Toko berhasil dibuat</h2>
          <p className="mt-1 text-sm text-[#71808a]">Berikan kredensial berikut kepada owner {createdResult.tenant?.name}.</p>
          <div className="mt-5 space-y-3 rounded-lg border border-[#dce3e6] bg-[#f7f9fa] p-4">
            <div><p className="text-xs text-[#71808a]">Username</p><p className="mt-1 font-mono text-sm font-bold">{createdResult.owner?.username}</p></div>
            <div><p className="text-xs text-[#71808a]">Password sementara</p><p className="mt-1 break-all font-mono text-sm font-bold">{createdResult.temporaryPassword}</p></div>
            <div><p className="text-xs text-[#71808a]">Halaman login</p><p className="mt-1 font-mono text-sm font-bold">{window.location.origin}/login</p></div>
          </div>
          <button type="button" onClick={onClose} className="mt-5 min-h-11 w-full rounded-lg bg-[#173f3a] px-5 text-sm font-bold text-white hover:bg-[#0f302c]">Selesai</button>
        </section>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#17202a]/55 p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="onboarding-title" className="max-h-[92vh] w-full max-w-[760px] overflow-y-auto rounded-lg bg-white shadow-[0_24px_70px_rgba(23,32,42,0.3)]">
        <div className="flex items-start justify-between border-b border-[#e6ebed] p-5">
          <div><h2 id="onboarding-title" className="text-lg font-bold">Tambah toko</h2><p className="mt-1 text-sm text-[#71808a]">Tahap {step} dari 3</p></div>
          <button type="button" aria-label="Tutup dialog" onClick={onClose} disabled={isSubmitting} className="flex h-9 w-9 items-center justify-center rounded-lg text-[#71808a] hover:bg-[#f1f3f4]"><i className="fas fa-xmark" /></button>
        </div>

        <div className="grid grid-cols-3 border-b border-[#e6ebed] bg-[#f7f9fa] px-5 py-3 text-center text-xs font-semibold text-[#71808a]">
          {['Toko & Owner', 'Cabang & Paket', 'Konfirmasi'].map((label, index) => <span key={label} className={step === index + 1 ? 'text-[#176456]' : ''}>{index + 1}. {label}</span>)}
        </div>

        <div className="p-5 sm:p-6">
          {errorMessage && <div className="mb-4 rounded-lg border border-[#e9b7b7] bg-[#fff1f1] p-3 text-sm text-[#a82f2f]">{errorMessage}</div>}

          {step === 1 && <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="mb-1.5 block text-sm font-semibold">Nama toko</label><input value={form.storeName} onChange={(event) => { const value = event.target.value; updateForm({ storeName: value, ...(!slugTouched ? { storeSlug: slugify(value) } : {}) }) }} className="min-h-11 w-full rounded-lg border border-[#cfd8dc] px-3 text-sm outline-none focus:border-[#2a7c6f]" autoFocus /></div>
            <div><label className="mb-1.5 block text-sm font-semibold">Slug toko</label><input value={form.storeSlug} onChange={(event) => { setSlugTouched(true); updateForm({ storeSlug: slugify(event.target.value) }) }} className="min-h-11 w-full rounded-lg border border-[#cfd8dc] px-3 text-sm outline-none focus:border-[#2a7c6f]" /></div>
            <div><label className="mb-1.5 block text-sm font-semibold">Username owner</label><input value={form.ownerUsername} onChange={(event) => updateForm({ ownerUsername: event.target.value.toLowerCase().replace(/\s+/g, '') })} autoComplete="off" className="min-h-11 w-full rounded-lg border border-[#cfd8dc] px-3 text-sm outline-none focus:border-[#2a7c6f]" /></div>
            <div><label className="mb-1.5 block text-sm font-semibold">Status toko</label><select value={form.tenantStatus} onChange={(event) => updateForm({ tenantStatus: event.target.value, ...(event.target.value === 'active' && ['suspended', 'expired'].includes(form.subscriptionStatus) ? { subscriptionStatus: 'active' } : {}) })} className="min-h-11 w-full rounded-lg border border-[#cfd8dc] bg-white px-3 text-sm"><option value="active">Aktif</option><option value="suspended">Suspended</option></select></div>
            <div className="sm:col-span-2"><label className="mb-1.5 block text-sm font-semibold">Password sementara</label><div className="flex gap-2"><input type={showPassword ? 'text' : 'password'} value={form.ownerPassword} onChange={(event) => updateForm({ ownerPassword: event.target.value })} autoComplete="new-password" className="min-h-11 min-w-0 flex-1 rounded-lg border border-[#cfd8dc] px-3 text-sm outline-none focus:border-[#2a7c6f]" /><button type="button" title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'} aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'} onClick={() => setShowPassword((value) => !value)} className="h-11 w-11 rounded-lg border border-[#cfd8dc] text-[#52616b]"><i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} /></button><button type="button" onClick={() => updateForm({ ownerPassword: generatePassword() })} className="min-h-11 rounded-lg border border-[#cfd8dc] px-3 text-sm font-semibold text-[#52616b]">Generate</button></div></div>
          </div>}

          {step === 2 && <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="mb-1.5 block text-sm font-semibold">Kode cabang</label><input value={form.initialBranchCode} onChange={(event) => updateForm({ initialBranchCode: slugify(event.target.value).slice(0, 40) })} className="min-h-11 w-full rounded-lg border border-[#cfd8dc] px-3 text-sm" /></div>
            <div><label className="mb-1.5 block text-sm font-semibold">Nama cabang</label><input value={form.initialBranchName} onChange={(event) => updateForm({ initialBranchName: event.target.value })} className="min-h-11 w-full rounded-lg border border-[#cfd8dc] px-3 text-sm" /></div>
            <div><label className="mb-1.5 block text-sm font-semibold">Paket</label><select value={form.planId} onChange={(event) => updateForm({ planId: event.target.value })} className="min-h-11 w-full rounded-lg border border-[#cfd8dc] bg-white px-3 text-sm">{plans.filter((plan) => plan.status === 'active').map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {formatCurrency(plan.priceAmount)}</option>)}</select></div>
            <div><label className="mb-1.5 block text-sm font-semibold">Status subscription</label><select value={form.subscriptionStatus} onChange={(event) => updateForm({ subscriptionStatus: event.target.value })} className="min-h-11 w-full rounded-lg border border-[#cfd8dc] bg-white px-3 text-sm"><option value="active">Aktif</option><option value="trial">Trial</option>{form.tenantStatus === 'suspended' && <><option value="suspended">Suspended</option><option value="expired">Expired</option></>}</select></div>
            <div><label className="mb-1.5 block text-sm font-semibold">Mulai</label><input type="date" value={form.startsAt} onChange={(event) => updateForm({ startsAt: event.target.value })} className="min-h-11 w-full rounded-lg border border-[#cfd8dc] px-3 text-sm" /></div>
            <div><label className="mb-1.5 block text-sm font-semibold">Berakhir</label><input type="date" value={form.endsAt} onChange={(event) => updateForm({ endsAt: event.target.value })} className="min-h-11 w-full rounded-lg border border-[#cfd8dc] px-3 text-sm" /></div>
            <div><label className="mb-1.5 block text-sm font-semibold">Grace period</label><input type="date" value={form.graceEndsAt} onChange={(event) => updateForm({ graceEndsAt: event.target.value })} className="min-h-11 w-full rounded-lg border border-[#cfd8dc] px-3 text-sm" /></div>
            <div><label className="mb-1.5 block text-sm font-semibold">Catatan billing</label><input value={form.billingNotes} onChange={(event) => updateForm({ billingNotes: event.target.value })} maxLength="300" className="min-h-11 w-full rounded-lg border border-[#cfd8dc] px-3 text-sm" /></div>
          </div>}

          {step === 3 && <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-[#dce3e6] p-4"><p className="text-xs font-semibold uppercase text-[#71808a]">Toko</p><p className="mt-2 font-bold">{form.storeName}</p><p className="mt-1 text-sm text-[#71808a]">{form.storeSlug} · {form.tenantStatus}</p></div>
            <div className="rounded-lg border border-[#dce3e6] p-4"><p className="text-xs font-semibold uppercase text-[#71808a]">Owner</p><p className="mt-2 font-bold">{form.ownerUsername}</p><p className="mt-1 text-sm text-[#71808a]">Role owner · akses cabang admin</p></div>
            <div className="rounded-lg border border-[#dce3e6] p-4"><p className="text-xs font-semibold uppercase text-[#71808a]">Cabang awal</p><p className="mt-2 font-bold">{form.initialBranchName}</p><p className="mt-1 text-sm text-[#71808a]">{form.initialBranchCode}</p></div>
            <div className="rounded-lg border border-[#dce3e6] p-4"><p className="text-xs font-semibold uppercase text-[#71808a]">Subscription</p><p className="mt-2 font-bold">{selectedPlan?.name || '-'}</p><p className="mt-1 text-sm text-[#71808a]">{form.subscriptionStatus} · mulai {form.startsAt || '-'}</p></div>
          </div>}
        </div>

        <div className="flex items-center justify-between border-t border-[#e6ebed] p-5">
          <button type="button" onClick={step === 1 ? onClose : () => { setErrorMessage(''); setStep((current) => current - 1) }} disabled={isSubmitting} className="min-h-11 rounded-lg border border-[#cfd8dc] px-4 text-sm font-semibold text-[#52616b]">{step === 1 ? 'Batal' : 'Kembali'}</button>
          {step < 3
            ? <button type="button" onClick={handleNext} className="min-h-11 rounded-lg bg-[#173f3a] px-5 text-sm font-bold text-white">Lanjut</button>
            : <button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting} className="min-h-11 rounded-lg bg-[#173f3a] px-5 text-sm font-bold text-white disabled:opacity-60"><i className="fas fa-store mr-2" />{isSubmitting ? 'Membuat...' : 'Buat toko & owner'}</button>}
        </div>
      </section>
    </div>
  )
}

export default AdminTenantOnboarding
