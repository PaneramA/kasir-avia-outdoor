import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchPlans, fetchTenants, updateTenant, updateTenantSubscription } from '../lib/api'

function formatDateTime(value) {
  if (!value) {
    return '-'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return '-'
  }

  return parsed.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatCurrency(value) {
  const parsed = Number(value || 0)
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(parsed) ? parsed : 0)
}

function appendReviewNote(existingNotes, decisionLabel, noteText) {
  const normalizedExisting = String(existingNotes || '').trim()
  const normalizedNote = String(noteText || '').trim()
  const timestamp = new Date().toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const entry = `[${decisionLabel} • ${timestamp}] ${normalizedNote || '-'}`

  return normalizedExisting ? `${normalizedExisting}\n${entry}` : entry
}

function buildDraftForTenant(tenant, plans) {
  const activePlans = Array.isArray(plans)
    ? plans.filter((plan) => String(plan?.status || '').trim().toLowerCase() === 'active')
    : []
  const fallbackPlanId = activePlans[0]?.id || plans[0]?.id || ''
  const subscription = tenant?.subscription || null
  const tenantStatus = String(tenant?.status || '').trim().toLowerCase()

  return {
    planId: subscription?.planId || fallbackPlanId,
    subscriptionStatus: tenantStatus === 'active' ? (subscription?.status || 'active') : 'active',
    adminNote: '',
  }
}

const AdminRegistrations = () => {
  const [tenants, setTenants] = useState([])
  const [plans, setPlans] = useState([])
  const [draftsByTenantId, setDraftsByTenantId] = useState({})
  const [expandedTenantId, setExpandedTenantId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [processingTenantId, setProcessingTenantId] = useState('')

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage('')

    try {
      const [tenantData, planData] = await Promise.all([
        fetchTenants(),
        fetchPlans(),
      ])

      const safeTenants = Array.isArray(tenantData) ? tenantData : []
      const safePlans = Array.isArray(planData) ? planData : []

      setTenants(safeTenants)
      setPlans(safePlans)
      setDraftsByTenantId((previousDrafts) => {
        const nextDrafts = {}
        safeTenants.forEach((tenant) => {
          nextDrafts[tenant.id] = previousDrafts[tenant.id] || buildDraftForTenant(tenant, safePlans)
        })
        return nextDrafts
      })
      setExpandedTenantId((previousTenantId) => (
        safeTenants.some((tenant) => tenant.id === previousTenantId) ? previousTenantId : safeTenants[0]?.id || ''
      ))
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Gagal memuat daftar tenant.'
      setErrorMessage(messageText)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const pendingTenants = useMemo(
    () => tenants
      .filter((tenant) => String(tenant?.status || '').trim().toLowerCase() !== 'active')
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [tenants],
  )

  const activeTenants = useMemo(
    () => tenants
      .filter((tenant) => String(tenant?.status || '').trim().toLowerCase() === 'active')
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, 8),
    [tenants],
  )

  const activePlans = useMemo(
    () => plans.filter((plan) => String(plan?.status || '').trim().toLowerCase() === 'active'),
    [plans],
  )

  const getDraft = useCallback((tenant) => (
    draftsByTenantId[tenant.id] || buildDraftForTenant(tenant, plans)
  ), [draftsByTenantId, plans])

  const updateDraft = useCallback((tenantId, patch) => {
    setDraftsByTenantId((previousDrafts) => ({
      ...previousDrafts,
      [tenantId]: {
        ...(previousDrafts[tenantId] || {}),
        ...patch,
      },
    }))
  }, [])

  const handleReviewDecision = useCallback(async (tenant, decision) => {
    const draft = getDraft(tenant)
    const selectedPlanId = String(draft.planId || '').trim()
    const noteText = String(draft.adminNote || '').trim()

    setMessage('')
    setErrorMessage('')

    if (!selectedPlanId) {
      setErrorMessage(`Pilih paket awal terlebih dahulu untuk tenant ${tenant.name}.`)
      return
    }

    if (decision === 'reject' && !noteText) {
      setErrorMessage(`Tambahkan catatan admin saat menolak atau menahan tenant ${tenant.name}.`)
      return
    }

    try {
      setProcessingTenantId(tenant.id)

      const nextSubscriptionStatus = decision === 'approve'
        ? String(draft.subscriptionStatus || 'active').trim().toLowerCase()
        : 'suspended'

      const nextBillingNotes = appendReviewNote(
        tenant.subscription?.billingNotes,
        decision === 'approve' ? 'APPROVED' : 'REJECTED',
        noteText,
      )

      await updateTenantSubscription(tenant.id, {
        planId: selectedPlanId,
        status: nextSubscriptionStatus,
        billingNotes: nextBillingNotes,
      })

      await updateTenant(tenant.id, {
        status: decision === 'approve' ? 'active' : 'suspended',
      })

      setMessage(
        decision === 'approve'
          ? `Tenant ${tenant.name} berhasil di-approve, diaktifkan, dan diberi paket awal.`
          : `Tenant ${tenant.name} tetap suspended dan catatan review berhasil disimpan.`,
      )

      setDraftsByTenantId((previousDrafts) => ({
        ...previousDrafts,
        [tenant.id]: {
          ...(previousDrafts[tenant.id] || {}),
          adminNote: '',
        },
      }))

      await loadData()
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Gagal memperbarui status tenant.'
      setErrorMessage(messageText)
    } finally {
      setProcessingTenantId('')
    }
  }, [getDraft, loadData])

  return (
    <div className="space-y-6 pt-0 pb-5">
      <section className="rounded-DEFAULT border border-border bg-[linear-gradient(135deg,rgba(230,126,34,0.16),rgba(20,26,26,0.96))] p-5 sm:p-6">
        <p className="text-[0.76rem] font-semibold uppercase tracking-[0.16em] text-accent">Approval Center</p>
        <h2 className="mt-2 text-[1.45rem] font-bold text-text-main sm:text-[1.75rem]">
          Approval untuk toko baru yang register
        </h2>
        <p className="mt-2 max-w-[760px] text-sm leading-relaxed text-text-muted">
          Review tenant baru, pilih paket awal, simpan catatan admin, lalu aktifkan toko saat onboarding
          dan pembayaran sudah siap.
        </p>
      </section>

      {message && (
        <div className="rounded-lg border border-[#2ecc71]/40 bg-[#2ecc71]/10 p-3 text-sm text-[#6ee7a8]">{message}</div>
      )}

      {errorMessage && (
        <div className="rounded-lg border border-[#e74c3c]/40 bg-[#e74c3c]/10 p-3 text-sm text-[#f3b2ad]">{errorMessage}</div>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <article className="rounded-DEFAULT border border-border bg-sidebar-bg/60 p-5">
          <p className="text-sm text-text-muted">Menunggu Approval</p>
          <p className="mt-2 text-[1.5rem] font-bold text-text-main">{pendingTenants.length}</p>
        </article>
        <article className="rounded-DEFAULT border border-border bg-sidebar-bg/60 p-5">
          <p className="text-sm text-text-muted">Tenant Aktif</p>
          <p className="mt-2 text-[1.5rem] font-bold text-text-main">{tenants.length - pendingTenants.length}</p>
        </article>
        <article className="rounded-DEFAULT border border-border bg-sidebar-bg/60 p-5">
          <p className="text-sm text-text-muted">Paket Aktif</p>
          <p className="mt-2 text-[1.5rem] font-bold text-text-main">{activePlans.length}</p>
        </article>
        <article className="rounded-DEFAULT border border-border bg-sidebar-bg/60 p-5">
          <p className="text-sm text-text-muted">Total Tenant</p>
          <p className="mt-2 text-[1.5rem] font-bold text-text-main">{tenants.length}</p>
        </article>
      </section>

      <section className="rounded-DEFAULT border border-border bg-sidebar-bg/60 p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-[1.05rem] font-bold text-text-main">Review Pendaftaran Baru</h3>
            <p className="mt-1 text-sm text-text-muted">
              Toko yang belum aktif muncul di sini. Kamu bisa pilih paket, status subscription awal, dan catatan admin sebelum approve.
            </p>
          </div>
          <p className="text-xs text-text-muted">
            Tenant yang belum disetujui atau ditahan akan tetap memakai status platform <span className="font-semibold text-text-main">suspended</span>.
          </p>
        </div>

        {isLoading ? (
          <div className="mt-4 text-text-muted">Memuat daftar pendaftaran...</div>
        ) : pendingTenants.length === 0 ? (
          <div className="mt-4 rounded-lg border border-border/50 bg-bg-main/30 p-4 text-sm text-text-muted">
            Belum ada tenant baru yang menunggu approval.
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {pendingTenants.map((tenant) => {
              const draft = getDraft(tenant)
              const selectedPlan = plans.find((plan) => plan.id === draft.planId) || null
              const isExpanded = expandedTenantId === tenant.id

              return (
                <article key={tenant.id} className="rounded-lg border border-border/50 bg-bg-main/30 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-text-main">{tenant.name}</p>
                        <span className="rounded-full bg-[#e67e22]/12 px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-wide text-accent">
                          {tenant.status}
                        </span>
                        <span className="rounded-full bg-border/60 px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-wide text-text-muted">
                          {tenant.subscription?.status || 'trial'}
                        </span>
                      </div>
                      <p className="text-xs text-text-muted">slug: {tenant.slug}</p>
                      <p className="text-xs text-text-muted">
                        Owner: {tenant.ownerUsernames?.length ? tenant.ownerUsernames.join(', ') : '-'}
                      </p>
                      <p className="text-xs text-text-muted">
                        Cabang awal: {tenant.branchCount ?? 0} • User tenant: {tenant.membershipCount ?? 0}
                      </p>
                      <p className="text-xs text-text-muted">Dibuat: {formatDateTime(tenant.createdAt)}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="min-h-11 rounded-lg border border-border bg-sidebar-bg px-4 py-2 text-sm font-semibold text-text-main transition hover:border-accent"
                        onClick={() => setExpandedTenantId((currentTenantId) => (
                          currentTenantId === tenant.id ? '' : tenant.id
                        ))}
                      >
                        {isExpanded ? 'Tutup Review' : 'Buka Review'}
                      </button>
                      <button
                        type="button"
                        className="min-h-11 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60"
                        onClick={() => handleReviewDecision(tenant, 'approve')}
                        disabled={processingTenantId === tenant.id}
                      >
                        {processingTenantId === tenant.id ? 'Memproses...' : 'Approve Cepat'}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-5 grid grid-cols-1 gap-4 border-t border-border/60 pt-5 lg:grid-cols-[1.1fr_0.9fr]">
                      <div className="space-y-4">
                        <div className="rounded-lg border border-border/50 bg-sidebar-bg/40 p-4">
                          <p className="text-xs uppercase tracking-[0.14em] text-text-muted">Snapshot Pendaftaran</p>
                          <div className="mt-3 space-y-2 text-sm text-text-muted">
                            <p>Nama toko: <span className="font-semibold text-text-main">{tenant.name}</span></p>
                            <p>Owner utama: <span className="font-semibold text-text-main">{tenant.ownerUsernames?.[0] || '-'}</span></p>
                            <p>Paket saat ini: <span className="font-semibold text-text-main">{tenant.subscription?.plan?.name || 'Belum ada'}</span></p>
                            <p>Status subscription: <span className="font-semibold text-text-main">{tenant.subscription?.status || 'trial'}</span></p>
                            <p>Harga paket terpilih: <span className="font-semibold text-text-main">{selectedPlan ? formatCurrency(selectedPlan.priceAmount) : '-'}</span></p>
                          </div>
                        </div>

                        <div className="rounded-lg border border-border/50 bg-sidebar-bg/40 p-4">
                          <label className="mb-1.5 block text-[0.85rem] text-text-muted">Catatan review sebelumnya</label>
                          <div className="min-h-[88px] rounded-lg border border-border bg-bg-main/60 p-3 text-sm text-text-muted whitespace-pre-wrap">
                            {tenant.subscription?.billingNotes || 'Belum ada catatan review.'}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4 rounded-lg border border-border/50 bg-sidebar-bg/40 p-4">
                        <div>
                          <label className="mb-1.5 block text-[0.85rem] text-text-muted">Paket Awal Tenant</label>
                          <select
                            className="w-full rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
                            value={draft.planId}
                            onChange={(event) => updateDraft(tenant.id, { planId: event.target.value })}
                            disabled={processingTenantId === tenant.id}
                          >
                            <option value="">Pilih paket</option>
                            {plans.map((plan) => (
                              <option key={plan.id} value={plan.id}>
                                {plan.name} • {plan.code} • {formatCurrency(plan.priceAmount)}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="mb-1.5 block text-[0.85rem] text-text-muted">Status Subscription Saat Approve</label>
                          <select
                            className="w-full rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
                            value={draft.subscriptionStatus}
                            onChange={(event) => updateDraft(tenant.id, { subscriptionStatus: event.target.value })}
                            disabled={processingTenantId === tenant.id}
                          >
                            <option value="trial">trial</option>
                            <option value="active">active</option>
                            <option value="suspended">suspended</option>
                            <option value="expired">expired</option>
                          </select>
                        </div>

                        <div>
                          <label className="mb-1.5 block text-[0.85rem] text-text-muted">Catatan Admin</label>
                          <textarea
                            className="min-h-[120px] w-full rounded-lg border border-border bg-bg-main p-3 text-text-main outline-none focus:border-accent"
                            placeholder="Contoh: pembayaran DP sudah masuk, aktifkan trial 14 hari."
                            value={draft.adminNote}
                            onChange={(event) => updateDraft(tenant.id, { adminNote: event.target.value })}
                            disabled={processingTenantId === tenant.id}
                          />
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <button
                            type="button"
                            className="min-h-11 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60"
                            onClick={() => handleReviewDecision(tenant, 'approve')}
                            disabled={processingTenantId === tenant.id}
                          >
                            {processingTenantId === tenant.id ? 'Memproses...' : 'Approve & Aktifkan'}
                          </button>
                          <button
                            type="button"
                            className="min-h-11 rounded-lg border border-[#e74c3c]/40 bg-[#e74c3c]/10 px-4 py-2 text-sm font-semibold text-[#f3b2ad] transition hover:bg-[#e74c3c]/20 disabled:opacity-60"
                            onClick={() => handleReviewDecision(tenant, 'reject')}
                            disabled={processingTenantId === tenant.id}
                          >
                            {processingTenantId === tenant.id ? 'Memproses...' : 'Tolak / Tetap Suspended'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="rounded-DEFAULT border border-border bg-sidebar-bg/60 p-5 sm:p-6">
        <h3 className="text-[1.05rem] font-bold text-text-main">Tenant Aktif Terbaru</h3>
        <p className="mt-1 text-sm text-text-muted">Ringkasan cepat tenant yang sudah aktif di platform.</p>

        <div className="mt-4 space-y-3">
          {activeTenants.length === 0 ? (
            <div className="rounded-lg border border-border/50 bg-bg-main/30 p-4 text-sm text-text-muted">
              Belum ada tenant aktif.
            </div>
          ) : activeTenants.map((tenant) => (
            <article key={tenant.id} className="rounded-lg border border-border/50 bg-bg-main/30 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-text-main">{tenant.name}</p>
                  <p className="mt-1 text-xs text-text-muted">slug: {tenant.slug}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    Owner: {tenant.ownerUsernames?.length ? tenant.ownerUsernames.join(', ') : '-'}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    Paket: {tenant.subscription?.plan?.name || '-'} • {tenant.subscription?.status || '-'}
                  </p>
                </div>
                <span className="rounded-full bg-[#2ecc71]/12 px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-wide text-[#6ee7a8]">
                  {tenant.status}
                </span>
              </div>
              <p className="mt-2 text-xs text-text-muted">Dibuat: {formatDateTime(tenant.createdAt)}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

export default AdminRegistrations
