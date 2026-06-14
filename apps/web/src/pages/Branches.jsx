import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createBranch,
  fetchBranches,
  fetchTenantMemberships,
  getStoredSession,
  updateBranch,
} from '../lib/api'

const initialBranchForm = {
  code: '',
  name: '',
  status: 'active',
}

const Branches = () => {
  const currentUser = getStoredSession().user
  const [branches, setBranches] = useState([])
  const [memberships, setMemberships] = useState([])
  const [branchForm, setBranchForm] = useState(initialBranchForm)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmittingBranch, setIsSubmittingBranch] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage('')

    try {
      const [branchesData, membershipsData] = await Promise.all([
        fetchBranches('current'),
        fetchTenantMemberships('current'),
      ])

      setBranches(Array.isArray(branchesData) ? branchesData : [])
      setMemberships(Array.isArray(membershipsData) ? membershipsData : [])
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Gagal memuat data cabang tenant.'
      setErrorMessage(messageText)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const currentMembership = useMemo(() => (
    memberships.find((membership) => membership.userId === currentUser?.id) || null
  ), [memberships, currentUser?.id])

  const canAdministerTenant = useMemo(() => {
    if (!currentMembership || currentMembership.status !== 'active') {
      return false
    }

    return currentMembership.role === 'owner' || currentMembership.role === 'admin'
  }, [currentMembership])

  const handleCreateBranch = async (event) => {
    event.preventDefault()
    setMessage('')
    setErrorMessage('')

    try {
      setIsSubmittingBranch(true)
      await createBranch(branchForm)
      setMessage('Cabang baru berhasil ditambahkan.')
      setBranchForm(initialBranchForm)
      await loadData()
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Gagal menambah cabang.'
      setErrorMessage(messageText)
    } finally {
      setIsSubmittingBranch(false)
    }
  }

  const handleUpdateBranchStatus = async (branch, nextStatus) => {
    setMessage('')
    setErrorMessage('')

    try {
      await updateBranch(branch.id, { status: nextStatus })
      setMessage(`Status cabang ${branch.name} diperbarui ke ${nextStatus}.`)
      await loadData()
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Gagal update status cabang.'
      setErrorMessage(messageText)
    }
  }

  return (
    <div className="space-y-6 pt-0 pb-4 sm:pb-5">
      {message && (
        <div className="rounded-lg border border-[#2ecc71]/40 bg-[#2ecc71]/10 p-3 text-sm text-[#6ee7a8]">{message}</div>
      )}

      {errorMessage && (
        <div className="rounded-lg border border-[#e74c3c]/40 bg-[#e74c3c]/10 p-3 text-sm text-[#f3b2ad]">{errorMessage}</div>
      )}

      <section className="rounded-DEFAULT border border-border bg-sidebar-bg/60 p-4 sm:p-6">
        <h3 className="mb-1 text-[1rem] font-bold text-text-main">Ringkasan Cabang Tenant</h3>
        <p className="text-sm text-text-muted">
          Role global: <span className="font-semibold text-text-main">{currentUser?.role || '-'}</span>
          {' '}| Role tenant aktif: <span className="font-semibold text-text-main">{currentMembership?.role || '-'}</span>
          {' '}({currentMembership?.status || 'no-membership'})
        </p>
        <p className="mt-2 text-xs text-text-muted">
          Area ini khusus untuk owner/admin tenant mengatur daftar cabang dan status operasional toko.
        </p>
        {!canAdministerTenant && (
          <p className="mt-2 text-xs text-[#f3b2ad]">
            Kamu belum punya role owner/admin aktif di tenant ini, jadi pengelolaan cabang dibatasi.
          </p>
        )}
      </section>

      <section className="rounded-DEFAULT border border-border bg-sidebar-bg/60 p-4 sm:p-6">
        <h3 className="mb-1 text-[1.1rem] font-bold text-text-main">Tambah Cabang</h3>
        <p className="mb-5 text-sm text-text-muted">Cabang dipakai untuk memisahkan operasional. Jumlah cabang mengikuti paket tenant kamu.</p>

        <form onSubmit={handleCreateBranch} className="grid grid-cols-1 items-end gap-4 md:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-[0.85rem] text-text-muted">Kode Cabang</label>
            <input
              className="w-full rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
              placeholder="contoh: pusat"
              value={branchForm.code}
              onChange={(event) => setBranchForm((prev) => ({ ...prev, code: event.target.value }))}
              required
              disabled={!canAdministerTenant}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[0.85rem] text-text-muted">Nama Cabang</label>
            <input
              className="w-full rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
              placeholder="Toko Pusat"
              value={branchForm.name}
              onChange={(event) => setBranchForm((prev) => ({ ...prev, name: event.target.value }))}
              required
              disabled={!canAdministerTenant}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[0.85rem] text-text-muted">Status</label>
            <select
              className="w-full rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
              value={branchForm.status}
              onChange={(event) => setBranchForm((prev) => ({ ...prev, status: event.target.value }))}
              disabled={!canAdministerTenant}
            >
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={isSubmittingBranch || !canAdministerTenant}
            className="min-h-11 rounded-lg bg-accent px-5 py-2.5 font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {isSubmittingBranch ? 'Menyimpan...' : 'Tambah Cabang'}
          </button>
        </form>
      </section>

      <section className="rounded-DEFAULT border border-border bg-sidebar-bg/60 p-4 sm:p-6">
        <h3 className="mb-1 text-[1.1rem] font-bold text-text-main">Daftar Cabang</h3>
        <p className="mb-5 text-sm text-text-muted">Ubah status cabang aktif/nonaktif untuk kontrol operasional tenant.</p>

        {isLoading ? (
          <div className="text-text-muted">Memuat daftar cabang...</div>
        ) : branches.length === 0 ? (
          <div className="rounded-lg border border-border/50 bg-bg-main/30 p-4 text-center text-text-muted">Belum ada cabang.</div>
        ) : (
          <div className="space-y-3">
            {branches.map((branch) => (
              <article key={branch.id} className="rounded-lg border border-border/50 bg-bg-main/30 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-text-main">{branch.name}</p>
                    <p className="text-xs text-text-muted">code: {branch.code}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className="rounded-lg border border-border bg-bg-main p-2 text-sm text-text-main outline-none focus:border-accent"
                      value={branch.status}
                      onChange={(event) => handleUpdateBranchStatus(branch, event.target.value)}
                      disabled={!canAdministerTenant}
                    >
                      <option value="active">active</option>
                      <option value="inactive">inactive</option>
                    </select>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default Branches
