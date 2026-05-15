import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createTenant,
  createBranch,
  createOrUpdateBranchAccess,
  createOrUpdateTenantMembership,
  fetchBranchAccess,
  fetchBranches,
  fetchTenants,
  fetchTenantMemberships,
  fetchUsers,
  removeBranchAccess,
  updateTenant,
  updateBranch,
  updateTenantMembership,
  getStoredSession,
} from '../lib/api'

const initialBranchForm = {
  code: '',
  name: '',
  status: 'active',
}

const initialMembershipForm = {
  userId: '',
  role: 'kasir',
  status: 'active',
}

const initialAccessForm = {
  userId: '',
  branchId: '',
  role: 'kasir',
}

const initialTenantForm = {
  name: '',
  slug: '',
  status: 'active',
  ownerUserId: '',
  initialBranchCode: 'pusat',
  initialBranchName: 'Toko Pusat',
}

const Branches = () => {
  const currentUser = getStoredSession().user
  const [branches, setBranches] = useState([])
  const [memberships, setMemberships] = useState([])
  const [accesses, setAccesses] = useState([])
  const [users, setUsers] = useState([])
  const [tenants, setTenants] = useState([])

  const [branchForm, setBranchForm] = useState(initialBranchForm)
  const [membershipForm, setMembershipForm] = useState(initialMembershipForm)
  const [accessForm, setAccessForm] = useState(initialAccessForm)
  const [tenantForm, setTenantForm] = useState(initialTenantForm)

  const [isLoading, setIsLoading] = useState(true)
  const [isSubmittingBranch, setIsSubmittingBranch] = useState(false)
  const [isSubmittingMembership, setIsSubmittingMembership] = useState(false)
  const [isSubmittingAccess, setIsSubmittingAccess] = useState(false)
  const [isSubmittingTenant, setIsSubmittingTenant] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage('')

    try {
      const [branchesData, membershipsData, accessData, usersData, tenantsData] = await Promise.all([
        fetchBranches('current'),
        fetchTenantMemberships('current'),
        fetchBranchAccess('current'),
        fetchUsers(),
        fetchTenants(),
      ])

      const safeBranches = Array.isArray(branchesData) ? branchesData : []
      const safeMemberships = Array.isArray(membershipsData) ? membershipsData : []
      const safeAccesses = Array.isArray(accessData) ? accessData : []
      const safeUsers = Array.isArray(usersData) ? usersData : []
      const safeTenants = Array.isArray(tenantsData) ? tenantsData : []

      setBranches(safeBranches)
      setMemberships(safeMemberships)
      setAccesses(safeAccesses)
      setUsers(safeUsers)
      setTenants(safeTenants)

      setMembershipForm((prev) => ({
        ...prev,
        userId: prev.userId || safeUsers[0]?.id || '',
      }))
      setAccessForm((prev) => ({
        ...prev,
        userId: prev.userId || safeUsers[0]?.id || '',
        branchId: prev.branchId || safeBranches[0]?.id || '',
      }))
      setTenantForm((prev) => ({
        ...prev,
        ownerUserId: prev.ownerUserId || safeUsers[0]?.id || '',
      }))
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Gagal memuat data cabang dan akses.'
      setErrorMessage(messageText)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const membershipUsers = useMemo(() => {
    const existingUserIds = new Set(memberships.map((item) => item.userId))
    return users.filter((user) => !existingUserIds.has(user.id))
  }, [memberships, users])

  const availableTenantOwners = useMemo(() => users, [users])

  const isSuperuser = useMemo(() => (
    String(currentUser?.role || '').trim().toLowerCase() === 'superuser'
  ), [currentUser?.role])

  const currentMembership = useMemo(() => (
    memberships.find((membership) => membership.userId === currentUser?.id) || null
  ), [memberships, currentUser?.id])

  const canAdministerTenant = useMemo(() => {
    if (isSuperuser) {
      return true
    }

    if (!currentMembership || currentMembership.status !== 'active') {
      return false
    }

    return currentMembership.role === 'owner' || currentMembership.role === 'admin'
  }, [isSuperuser, currentMembership])

  const canManageOwnerMembership = useMemo(() => {
    if (isSuperuser) {
      return true
    }

    return currentMembership?.status === 'active' && currentMembership?.role === 'owner'
  }, [isSuperuser, currentMembership])

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

  const handleCreateMembership = async (event) => {
    event.preventDefault()
    setMessage('')
    setErrorMessage('')

    if (!membershipForm.userId) {
      setErrorMessage('Pilih user terlebih dahulu.')
      return
    }

    try {
      setIsSubmittingMembership(true)
      if (membershipForm.role === 'owner' && !canManageOwnerMembership) {
        throw new Error('Hanya owner tenant atau superuser yang dapat menambah role owner.')
      }
      await createOrUpdateTenantMembership(membershipForm)
      setMessage('Membership tenant berhasil disimpan.')
      setMembershipForm((prev) => ({
        ...initialMembershipForm,
        userId: membershipUsers[0]?.id || prev.userId,
      }))
      await loadData()
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Gagal menyimpan membership.'
      setErrorMessage(messageText)
    } finally {
      setIsSubmittingMembership(false)
    }
  }

  const handleUpdateMembership = async (membershipId, payload) => {
    setMessage('')
    setErrorMessage('')

    try {
      await updateTenantMembership(membershipId, payload)
      setMessage('Membership tenant berhasil diperbarui.')
      await loadData()
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Gagal update membership.'
      setErrorMessage(messageText)
    }
  }

  const handleCreateTenant = async (event) => {
    event.preventDefault()
    setMessage('')
    setErrorMessage('')

    if (!isSuperuser) {
      setErrorMessage('Hanya superuser yang bisa membuat tenant baru.')
      return
    }

    try {
      setIsSubmittingTenant(true)
      await createTenant({
        ...tenantForm,
        ownerUserId: tenantForm.ownerUserId || undefined,
        slug: tenantForm.slug.trim() || undefined,
      })
      setMessage('Tenant baru berhasil dibuat.')
      setTenantForm((prev) => ({
        ...initialTenantForm,
        ownerUserId: prev.ownerUserId || '',
      }))
      await loadData()
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Gagal membuat tenant baru.'
      setErrorMessage(messageText)
    } finally {
      setIsSubmittingTenant(false)
    }
  }

  const handleUpdateTenantStatus = async (tenant, nextStatus) => {
    setMessage('')
    setErrorMessage('')

    if (!isSuperuser) {
      setErrorMessage('Hanya superuser yang bisa mengubah status tenant.')
      return
    }

    try {
      await updateTenant(tenant.id, { status: nextStatus })
      setMessage(`Status tenant ${tenant.name} diperbarui ke ${nextStatus}.`)
      await loadData()
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Gagal memperbarui status tenant.'
      setErrorMessage(messageText)
    }
  }

  const getNextMembershipRole = useCallback((currentRole) => {
    const normalizedRole = String(currentRole || '').trim().toLowerCase()
    if (normalizedRole === 'owner') {
      return canManageOwnerMembership ? 'kasir' : 'owner'
    }

    if (normalizedRole === 'admin') {
      return canManageOwnerMembership ? 'owner' : 'kasir'
    }

    return 'admin'
  }, [canManageOwnerMembership])

  const handleCreateAccess = async (event) => {
    event.preventDefault()
    setMessage('')
    setErrorMessage('')

    if (!accessForm.userId || !accessForm.branchId) {
      setErrorMessage('Pilih user dan cabang terlebih dahulu.')
      return
    }

    try {
      setIsSubmittingAccess(true)
      await createOrUpdateBranchAccess(accessForm)
      setMessage('Akses cabang user berhasil disimpan.')
      await loadData()
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Gagal menyimpan akses cabang.'
      setErrorMessage(messageText)
    } finally {
      setIsSubmittingAccess(false)
    }
  }

  const handleRemoveAccess = async (access) => {
    if (!window.confirm(`Hapus akses ${access.username} ke cabang ${access.branchName}?`)) {
      return
    }

    setMessage('')
    setErrorMessage('')

    try {
      await removeBranchAccess(access.id)
      setMessage('Akses cabang berhasil dihapus.')
      await loadData()
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Gagal menghapus akses cabang.'
      setErrorMessage(messageText)
    }
  }

  return (
    <div className="space-y-6 py-4 sm:py-5">
      {message && (
        <div className="rounded-lg border border-[#2ecc71]/40 bg-[#2ecc71]/10 p-3 text-sm text-[#6ee7a8]">{message}</div>
      )}

      {errorMessage && (
        <div className="rounded-lg border border-[#e74c3c]/40 bg-[#e74c3c]/10 p-3 text-sm text-[#f3b2ad]">{errorMessage}</div>
      )}

      <section className="rounded-DEFAULT border border-border bg-sidebar-bg/60 p-4 sm:p-6">
        <h3 className="mb-1 text-[1rem] font-bold text-text-main">Hak Akses Kamu</h3>
        <p className="text-sm text-text-muted">
          Role global: <span className="font-semibold text-text-main">{currentUser?.role || '-'}</span>
          {' '}| Role tenant aktif: <span className="font-semibold text-text-main">{currentMembership?.role || '-'}</span>
          {' '}({currentMembership?.status || 'no-membership'})
        </p>
        {!canAdministerTenant && (
          <p className="mt-2 text-xs text-[#f3b2ad]">
            Kamu belum punya role owner/admin aktif di tenant ini, jadi aksi manajemen tenant dibatasi.
          </p>
        )}
      </section>

      {isSuperuser && (
        <section className="rounded-DEFAULT border border-border bg-sidebar-bg/60 p-4 sm:p-6">
          <h3 className="mb-1 text-[1.1rem] font-bold text-text-main">Onboarding Tenant Baru</h3>
          <p className="mb-5 text-sm text-text-muted">Buat toko/tenant baru lengkap dengan cabang awal dan owner.</p>

          <form onSubmit={handleCreateTenant} className="grid grid-cols-1 items-end gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-[0.85rem] text-text-muted">Nama Tenant</label>
              <input
                className="w-full rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
                value={tenantForm.name}
                onChange={(event) => setTenantForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Outdoor Bogor"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[0.85rem] text-text-muted">Slug (opsional)</label>
              <input
                className="w-full rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
                value={tenantForm.slug}
                onChange={(event) => setTenantForm((prev) => ({ ...prev, slug: event.target.value }))}
                placeholder="outdoor-bogor"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[0.85rem] text-text-muted">Status</label>
              <select
                className="w-full rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
                value={tenantForm.status}
                onChange={(event) => setTenantForm((prev) => ({ ...prev, status: event.target.value }))}
              >
                <option value="active">active</option>
                <option value="suspended">suspended</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[0.85rem] text-text-muted">Owner User</label>
              <select
                className="w-full rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
                value={tenantForm.ownerUserId}
                onChange={(event) => setTenantForm((prev) => ({ ...prev, ownerUserId: event.target.value }))}
              >
                <option value="">Tanpa owner dulu</option>
                {availableTenantOwners.map((user) => (
                  <option key={user.id} value={user.id}>{user.username}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[0.85rem] text-text-muted">Kode Cabang Awal</label>
              <input
                className="w-full rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
                value={tenantForm.initialBranchCode}
                onChange={(event) => setTenantForm((prev) => ({ ...prev, initialBranchCode: event.target.value }))}
                placeholder="pusat"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[0.85rem] text-text-muted">Nama Cabang Awal</label>
              <input
                className="w-full rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
                value={tenantForm.initialBranchName}
                onChange={(event) => setTenantForm((prev) => ({ ...prev, initialBranchName: event.target.value }))}
                placeholder="Toko Pusat"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isSubmittingTenant}
              className="min-h-11 rounded-lg bg-accent px-5 py-2.5 font-semibold text-white hover:bg-accent-hover disabled:opacity-60 md:col-span-3"
            >
              {isSubmittingTenant ? 'Menyimpan...' : 'Buat Tenant Baru'}
            </button>
          </form>

          <div className="mt-5 space-y-2">
            {tenants.map((tenant) => (
              <article key={tenant.id} className="rounded-lg border border-border/50 bg-bg-main/30 p-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium text-text-main">{tenant.name}</p>
                    <p className="text-xs text-text-muted">slug: {tenant.slug}</p>
                  </div>
                  <select
                    className="rounded-lg border border-border bg-bg-main p-2 text-sm text-text-main outline-none focus:border-accent"
                    value={tenant.status}
                    onChange={(event) => handleUpdateTenantStatus(tenant, event.target.value)}
                  >
                    <option value="active">active</option>
                    <option value="suspended">suspended</option>
                  </select>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-DEFAULT border border-border bg-sidebar-bg/60 p-4 sm:p-6">
        <h3 className="mb-1 text-[1.1rem] font-bold text-text-main">Tambah Cabang</h3>
        <p className="mb-5 text-sm text-text-muted">Cabang dipakai untuk memisahkan operasional dan akses user.</p>

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
        <p className="mb-5 text-sm text-text-muted">Ubah status cabang aktif/nonaktif untuk kontrol operasional.</p>

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

      <section className="rounded-DEFAULT border border-border bg-sidebar-bg/60 p-4 sm:p-6">
        <h3 className="mb-1 text-[1.1rem] font-bold text-text-main">Membership Tenant</h3>
        <p className="mb-5 text-sm text-text-muted">Daftarkan user agar bisa jadi bagian tenant toko ini.</p>

        <form onSubmit={handleCreateMembership} className="grid grid-cols-1 items-end gap-4 md:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-[0.85rem] text-text-muted">User</label>
            <select
              className="w-full rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
              value={membershipForm.userId}
              onChange={(event) => setMembershipForm((prev) => ({ ...prev, userId: event.target.value }))}
              required
              disabled={!canAdministerTenant}
            >
              <option value="">Pilih user</option>
              {membershipUsers.map((user) => (
                <option key={user.id} value={user.id}>{user.username}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[0.85rem] text-text-muted">Role</label>
            <select
              className="w-full rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
              value={membershipForm.role}
              onChange={(event) => setMembershipForm((prev) => ({ ...prev, role: event.target.value }))}
              disabled={!canAdministerTenant}
            >
              <option value="kasir">kasir</option>
              <option value="admin">admin</option>
              <option value="owner" disabled={!canManageOwnerMembership}>owner</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[0.85rem] text-text-muted">Status</label>
            <select
              className="w-full rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
              value={membershipForm.status}
              onChange={(event) => setMembershipForm((prev) => ({ ...prev, status: event.target.value }))}
              disabled={!canAdministerTenant}
            >
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={isSubmittingMembership || !canAdministerTenant}
            className="min-h-11 rounded-lg bg-accent px-5 py-2.5 font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {isSubmittingMembership ? 'Menyimpan...' : 'Tambah Membership'}
          </button>
        </form>

        <div className="mt-5 space-y-2">
          {memberships.map((membership) => (
            <article key={membership.id} className="rounded-lg border border-border/50 bg-bg-main/30 p-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-medium text-text-main">{membership.username}</p>
                  <p className="text-xs text-text-muted">{membership.role} • {membership.status}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded border border-border bg-sidebar-bg px-3 py-1.5 text-xs text-text-main hover:border-accent"
                    onClick={() => handleUpdateMembership(membership.id, {
                      status: membership.status === 'active' ? 'inactive' : 'active',
                    })}
                    disabled={!canAdministerTenant || (membership.role === 'owner' && !canManageOwnerMembership)}
                  >
                    {membership.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}
                  </button>
                  <button
                    className="rounded border border-border bg-sidebar-bg px-3 py-1.5 text-xs text-text-main hover:border-accent"
                    onClick={() => {
                      const nextRole = getNextMembershipRole(membership.role)
                      handleUpdateMembership(membership.id, { role: nextRole })
                    }}
                    disabled={!canAdministerTenant || (membership.role === 'owner' && !canManageOwnerMembership)}
                  >
                    Ganti Role
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-DEFAULT border border-border bg-sidebar-bg/60 p-4 sm:p-6">
        <h3 className="mb-1 text-[1.1rem] font-bold text-text-main">Akses User ke Cabang</h3>
        <p className="mb-5 text-sm text-text-muted">User hanya bisa melihat data cabang yang punya akses.</p>

        <form onSubmit={handleCreateAccess} className="grid grid-cols-1 items-end gap-4 md:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-[0.85rem] text-text-muted">User</label>
            <select
              className="w-full rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
              value={accessForm.userId}
              onChange={(event) => setAccessForm((prev) => ({ ...prev, userId: event.target.value }))}
              required
              disabled={!canAdministerTenant}
            >
              <option value="">Pilih user</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>{user.username}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[0.85rem] text-text-muted">Cabang</label>
            <select
              className="w-full rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
              value={accessForm.branchId}
              onChange={(event) => setAccessForm((prev) => ({ ...prev, branchId: event.target.value }))}
              required
              disabled={!canAdministerTenant}
            >
              <option value="">Pilih cabang</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[0.85rem] text-text-muted">Role Cabang</label>
            <select
              className="w-full rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
              value={accessForm.role}
              onChange={(event) => setAccessForm((prev) => ({ ...prev, role: event.target.value }))}
              disabled={!canAdministerTenant}
            >
              <option value="kasir">kasir</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={isSubmittingAccess || !canAdministerTenant}
            className="min-h-11 rounded-lg bg-accent px-5 py-2.5 font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {isSubmittingAccess ? 'Menyimpan...' : 'Simpan Akses'}
          </button>
        </form>

        <div className="mt-5 space-y-2">
          {accesses.map((access) => (
            <article key={access.id} className="rounded-lg border border-border/50 bg-bg-main/30 p-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-medium text-text-main">{access.username}</p>
                  <p className="text-xs text-text-muted">{access.branchName} ({access.branchCode}) • role: {access.role}</p>
                </div>
                <button
                  className="rounded border border-[#e74c3c]/40 bg-[#e74c3c]/10 px-3 py-1.5 text-xs text-[#f3b2ad] hover:bg-[#e74c3c]/20"
                  onClick={() => handleRemoveAccess(access)}
                  disabled={!canAdministerTenant}
                >
                  Hapus Akses
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

export default Branches
