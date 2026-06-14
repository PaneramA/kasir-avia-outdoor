import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createPlanDefinition,
  fetchPlans,
  fetchTenantSubscriptions,
  updateTenantSubscription,
} from '../lib/api'

const initialPlanForm = {
  code: '',
  name: '',
  description: '',
  priceAmount: 0,
  pricePeriod: 'monthly',
  status: 'active',
  maxBranches: 1,
  maxItems: 150,
  maxMonthlyTransactions: 300,
  maxTenantUsers: 3,
  canManageBranches: true,
  canManageStaff: true,
  canUseFinancialRecap: false,
  canUseMultiBranch: false,
  canExportData: false,
}

function getFeatureValue(plan, key, fallback) {
  const feature = Array.isArray(plan?.features)
    ? plan.features.find((item) => item.key === key)
    : null

  return feature ? feature.value : fallback
}

const AdminPlans = () => {
  const [plans, setPlans] = useState([])
  const [tenantSubscriptions, setTenantSubscriptions] = useState([])
  const [drafts, setDrafts] = useState({})
  const [planForm, setPlanForm] = useState(initialPlanForm)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmittingPlan, setIsSubmittingPlan] = useState(false)
  const [savingTenantId, setSavingTenantId] = useState('')
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage('')

    try {
      const [plansData, subscriptionsData] = await Promise.all([
        fetchPlans(),
        fetchTenantSubscriptions(),
      ])

      const safePlans = Array.isArray(plansData) ? plansData : []
      const safeSubscriptions = Array.isArray(subscriptionsData) ? subscriptionsData : []

      setPlans(safePlans)
      setTenantSubscriptions(safeSubscriptions)
      setDrafts(safeSubscriptions.reduce((accumulator, item) => {
        const next = accumulator
        next[item.tenantId] = {
          planId: item.subscription?.planId || safePlans[0]?.id || '',
          status: item.subscription?.status || (item.tenantStatus === 'active' ? 'active' : 'trial'),
          billingNotes: item.subscription?.billingNotes || '',
        }
        return next
      }, {}))
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Gagal memuat paket dan subscription tenant.'
      setErrorMessage(messageText)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const planCards = useMemo(() => plans.map((plan) => ({
    ...plan,
    maxBranches: getFeatureValue(plan, 'maxBranches', '-'),
    maxItems: getFeatureValue(plan, 'maxItems', '-'),
    maxMonthlyTransactions: getFeatureValue(plan, 'maxMonthlyTransactions', '-'),
    maxTenantUsers: getFeatureValue(plan, 'maxTenantUsers', '-'),
    canUseFinancialRecap: Boolean(getFeatureValue(plan, 'canUseFinancialRecap', false)),
    canUseMultiBranch: Boolean(getFeatureValue(plan, 'canUseMultiBranch', false)),
    canExportData: Boolean(getFeatureValue(plan, 'canExportData', false)),
  })), [plans])

  const handleCreatePlan = async (event) => {
    event.preventDefault()
    setMessage('')
    setErrorMessage('')

    try {
      setIsSubmittingPlan(true)
      await createPlanDefinition({
        code: planForm.code,
        name: planForm.name,
        description: planForm.description,
        priceAmount: Number(planForm.priceAmount),
        pricePeriod: planForm.pricePeriod,
        status: planForm.status,
        features: [
          { key: 'maxBranches', valueType: 'integer', value: Number(planForm.maxBranches) },
          { key: 'maxItems', valueType: 'integer', value: Number(planForm.maxItems) },
          { key: 'maxMonthlyTransactions', valueType: 'integer', value: Number(planForm.maxMonthlyTransactions) },
          { key: 'maxTenantUsers', valueType: 'integer', value: Number(planForm.maxTenantUsers) },
          { key: 'canManageBranches', valueType: 'boolean', value: Boolean(planForm.canManageBranches) },
          { key: 'canManageStaff', valueType: 'boolean', value: Boolean(planForm.canManageStaff) },
          { key: 'canUseFinancialRecap', valueType: 'boolean', value: Boolean(planForm.canUseFinancialRecap) },
          { key: 'canUseMultiBranch', valueType: 'boolean', value: Boolean(planForm.canUseMultiBranch) },
          { key: 'canExportData', valueType: 'boolean', value: Boolean(planForm.canExportData) },
        ],
      })
      setMessage('Paket baru berhasil dibuat.')
      setPlanForm(initialPlanForm)
      await loadData()
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Gagal membuat paket baru.'
      setErrorMessage(messageText)
    } finally {
      setIsSubmittingPlan(false)
    }
  }

  const handleSaveTenantSubscription = async (tenantId) => {
    const draft = drafts[tenantId]
    if (!draft?.planId) {
      setErrorMessage('Pilih plan terlebih dahulu.')
      return
    }

    setMessage('')
    setErrorMessage('')

    try {
      setSavingTenantId(tenantId)
      await updateTenantSubscription(tenantId, {
        planId: draft.planId,
        status: draft.status,
        billingNotes: draft.billingNotes,
      })
      setMessage('Subscription tenant berhasil diperbarui.')
      await loadData()
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Gagal memperbarui subscription tenant.'
      setErrorMessage(messageText)
    } finally {
      setSavingTenantId('')
    }
  }

  return (
    <div className="space-y-6 pt-0 pb-5">
      <section className="rounded-DEFAULT border border-border bg-[linear-gradient(135deg,rgba(57,173,164,0.14),rgba(20,26,26,0.96))] p-5 sm:p-6">
        <p className="text-[0.76rem] font-semibold uppercase tracking-[0.16em] text-accent">Packages Control</p>
        <h2 className="mt-2 text-[1.45rem] font-bold text-text-main sm:text-[1.75rem]">
          Paket, limit, dan subscription tenant
        </h2>
        <p className="mt-2 max-w-[780px] text-sm leading-relaxed text-text-muted">
          Modul dasar paket platform sudah hidup. Dari sini kamu bisa membuat plan baru dan assign paket
          ke tenant satu per satu sebelum limit enforcement backend ditambahkan ke create branch, item, dan transaksi.
        </p>
      </section>

      {message && (
        <div className="rounded-lg border border-[#2ecc71]/40 bg-[#2ecc71]/10 p-3 text-sm text-[#6ee7a8]">{message}</div>
      )}

      {errorMessage && (
        <div className="rounded-lg border border-[#e74c3c]/40 bg-[#e74c3c]/10 p-3 text-sm text-[#f3b2ad]">{errorMessage}</div>
      )}

      <section className="rounded-DEFAULT border border-border bg-sidebar-bg/60 p-5 sm:p-6">
        <h3 className="text-[1.05rem] font-bold text-text-main">Buat Paket Baru</h3>
        <p className="mt-1 text-sm text-text-muted">Isi plan dengan kuota inti dulu, nanti detail enforcement backend bisa kita sambungkan bertahap.</p>

        <form onSubmit={handleCreatePlan} className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-4">
          <input
            className="rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
            placeholder="Code, contoh: starter-plus"
            value={planForm.code}
            onChange={(event) => setPlanForm((prev) => ({ ...prev, code: event.target.value }))}
            required
          />
          <input
            className="rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
            placeholder="Nama paket"
            value={planForm.name}
            onChange={(event) => setPlanForm((prev) => ({ ...prev, name: event.target.value }))}
            required
          />
          <input
            type="number"
            min="0"
            className="rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
            placeholder="Harga"
            value={planForm.priceAmount}
            onChange={(event) => setPlanForm((prev) => ({ ...prev, priceAmount: event.target.value }))}
            required
          />
          <select
            className="rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
            value={planForm.pricePeriod}
            onChange={(event) => setPlanForm((prev) => ({ ...prev, pricePeriod: event.target.value }))}
          >
            <option value="monthly">monthly</option>
            <option value="yearly">yearly</option>
            <option value="custom">custom</option>
          </select>

          <textarea
            className="min-h-[90px] rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent xl:col-span-2"
            placeholder="Deskripsi paket"
            value={planForm.description}
            onChange={(event) => setPlanForm((prev) => ({ ...prev, description: event.target.value }))}
          />
          <select
            className="rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
            value={planForm.status}
            onChange={(event) => setPlanForm((prev) => ({ ...prev, status: event.target.value }))}
          >
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
          <div className="grid grid-cols-2 gap-3 xl:col-span-1">
            <input
              type="number"
              min="1"
              className="rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
              placeholder="Max cabang"
              value={planForm.maxBranches}
              onChange={(event) => setPlanForm((prev) => ({ ...prev, maxBranches: event.target.value }))}
              required
            />
            <input
              type="number"
              min="1"
              className="rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
              placeholder="Max user"
              value={planForm.maxTenantUsers}
              onChange={(event) => setPlanForm((prev) => ({ ...prev, maxTenantUsers: event.target.value }))}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3 xl:col-span-2">
            <input
              type="number"
              min="1"
              className="rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
              placeholder="Max item"
              value={planForm.maxItems}
              onChange={(event) => setPlanForm((prev) => ({ ...prev, maxItems: event.target.value }))}
              required
            />
            <input
              type="number"
              min="1"
              className="rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
              placeholder="Max transaksi bulanan"
              value={planForm.maxMonthlyTransactions}
              onChange={(event) => setPlanForm((prev) => ({ ...prev, maxMonthlyTransactions: event.target.value }))}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3 xl:col-span-2">
            {[
              ['canManageBranches', 'Boleh kelola cabang'],
              ['canManageStaff', 'Boleh kelola staff'],
              ['canUseFinancialRecap', 'Boleh pakai recap keuangan'],
              ['canUseMultiBranch', 'Boleh multi-branch'],
              ['canExportData', 'Boleh export data'],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 rounded-lg border border-border/50 bg-bg-main/30 p-3 text-sm text-text-main">
                <input
                  type="checkbox"
                  checked={Boolean(planForm[key])}
                  onChange={(event) => setPlanForm((prev) => ({ ...prev, [key]: event.target.checked }))}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <button
            type="submit"
            disabled={isSubmittingPlan}
            className="min-h-11 rounded-lg bg-accent px-5 py-2.5 font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60 xl:col-span-4"
          >
            {isSubmittingPlan ? 'Menyimpan paket...' : 'Buat Paket'}
          </button>
        </form>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {isLoading ? (
          <div className="rounded-DEFAULT border border-border bg-sidebar-bg/60 p-5 text-text-muted xl:col-span-3">
            Memuat paket dan subscription tenant...
          </div>
        ) : planCards.map((plan) => (
          <article key={plan.id} className="rounded-DEFAULT border border-border bg-sidebar-bg/60 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[1.05rem] font-bold text-text-main">{plan.name}</p>
                <p className="mt-1 text-xs uppercase tracking-wide text-text-muted">{plan.code}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-wide ${
                plan.status === 'active' ? 'bg-[#2ecc71]/12 text-[#6ee7a8]' : 'bg-[#e67e22]/12 text-accent'
              }`}
              >
                {plan.status}
              </span>
            </div>

            <p className="mt-3 text-sm text-text-muted">{plan.description || 'Tanpa deskripsi.'}</p>
            <p className="mt-3 text-sm font-semibold text-text-main">
              Rp {Number(plan.priceAmount || 0).toLocaleString('id-ID')} / {plan.pricePeriod}
            </p>

            <div className="mt-4 space-y-2 text-sm text-text-muted">
              <div className="rounded-lg border border-border/50 bg-bg-main/30 p-3">Cabang: {plan.maxBranches}</div>
              <div className="rounded-lg border border-border/50 bg-bg-main/30 p-3">Item: {plan.maxItems}</div>
              <div className="rounded-lg border border-border/50 bg-bg-main/30 p-3">Transaksi / bulan: {plan.maxMonthlyTransactions}</div>
              <div className="rounded-lg border border-border/50 bg-bg-main/30 p-3">User toko: {plan.maxTenantUsers}</div>
              <div className="rounded-lg border border-border/50 bg-bg-main/30 p-3">
                Fitur: {[
                  plan.canUseFinancialRecap ? 'recap keuangan' : null,
                  plan.canUseMultiBranch ? 'multi-branch' : null,
                  plan.canExportData ? 'export data' : null,
                ].filter(Boolean).join(', ') || 'dasar'}
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-DEFAULT border border-border bg-sidebar-bg/60 p-5 sm:p-6">
        <h3 className="text-[1.05rem] font-bold text-text-main">Assign Paket ke Tenant</h3>
        <p className="mt-1 text-sm text-text-muted">Subscription tenant bisa kamu atur dari sini sambil menunggu modul billing penuh dibangun.</p>

        <div className="mt-4 space-y-3">
          {tenantSubscriptions.map((tenant) => {
            const draft = drafts[tenant.tenantId] || {
              planId: plans[0]?.id || '',
              status: tenant.tenantStatus === 'active' ? 'active' : 'trial',
              billingNotes: '',
            }

            return (
              <article key={tenant.tenantId} className="rounded-lg border border-border/50 bg-bg-main/30 p-4">
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr_1fr_1fr_auto] xl:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-text-main">{tenant.tenantName}</p>
                      <span className={`rounded-full px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-wide ${
                        tenant.tenantStatus === 'active' ? 'bg-[#2ecc71]/12 text-[#6ee7a8]' : 'bg-[#e67e22]/12 text-accent'
                      }`}
                      >
                        {tenant.tenantStatus}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-text-muted">slug: {tenant.tenantSlug}</p>
                    <p className="mt-1 text-xs text-text-muted">
                      Paket sekarang: {tenant.subscription?.plan?.name || 'Belum di-assign'}
                    </p>
                  </div>

                  <select
                    className="rounded-lg border border-border bg-sidebar-bg p-2.5 text-text-main outline-none focus:border-accent"
                    value={draft.planId}
                    onChange={(event) => setDrafts((prev) => ({
                      ...prev,
                      [tenant.tenantId]: {
                        ...draft,
                        planId: event.target.value,
                      },
                    }))}
                  >
                    <option value="">Pilih paket</option>
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>{plan.name}</option>
                    ))}
                  </select>

                  <div className="space-y-2">
                    <select
                      className="w-full rounded-lg border border-border bg-sidebar-bg p-2.5 text-text-main outline-none focus:border-accent"
                      value={draft.status}
                      onChange={(event) => setDrafts((prev) => ({
                        ...prev,
                        [tenant.tenantId]: {
                          ...draft,
                          status: event.target.value,
                        },
                      }))}
                    >
                      <option value="trial">trial</option>
                      <option value="active">active</option>
                      <option value="suspended">suspended</option>
                      <option value="expired">expired</option>
                    </select>
                    <input
                      className="w-full rounded-lg border border-border bg-sidebar-bg p-2.5 text-text-main outline-none focus:border-accent"
                      placeholder="Catatan billing"
                      value={draft.billingNotes}
                      onChange={(event) => setDrafts((prev) => ({
                        ...prev,
                        [tenant.tenantId]: {
                          ...draft,
                          billingNotes: event.target.value,
                        },
                      }))}
                    />
                  </div>

                  <button
                    type="button"
                    disabled={savingTenantId === tenant.tenantId}
                    onClick={() => handleSaveTenantSubscription(tenant.tenantId)}
                    className="min-h-11 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60"
                  >
                    {savingTenantId === tenant.tenantId ? 'Menyimpan...' : 'Simpan'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}

export default AdminPlans
