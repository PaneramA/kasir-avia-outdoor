import React, { useCallback, useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import {
  createOrUpdateBranchAccess,
  createOrUpdateTenantMembership,
  createTenantUserAccount,
  fetchBranchAccess,
  fetchBranches,
  fetchTenantMemberships,
  fetchTenantUsers,
  getActiveTenantContext,
  getStoredSession,
  removeBranchAccess,
  updateTenantMembership,
} from '../lib/api'
import { APP_CACHE_KEYS } from '../lib/appCache'

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

const initialTenantUserForm = {
  username: '',
  password: '',
  tenantRole: 'kasir',
}

const TeamSettings = () => {
  const currentUser = getStoredSession().user
  const tenantId = getActiveTenantContext().tenantId || 'current'

  const [membershipForm, setMembershipForm] = useState(initialMembershipForm)
  const [accessForm, setAccessForm] = useState(initialAccessForm)
  const [tenantUserForm, setTenantUserForm] = useState(initialTenantUserForm)

  const [isSubmittingMembership, setIsSubmittingMembership] = useState(false)
  const [isSubmittingAccess, setIsSubmittingAccess] = useState(false)
  const [isSubmittingTenantUser, setIsSubmittingTenantUser] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const branchQuery = useSWR(APP_CACHE_KEYS.branches(tenantId), () => fetchBranches(tenantId))
  const membershipQuery = useSWR(
    APP_CACHE_KEYS.tenantMemberships(tenantId),
    () => fetchTenantMemberships(tenantId),
  )
  const accessQuery = useSWR(APP_CACHE_KEYS.branchAccess(tenantId), () => fetchBranchAccess(tenantId))
  const userQuery = useSWR(APP_CACHE_KEYS.tenantUsers(tenantId), () => fetchTenantUsers(tenantId))
  const branches = useMemo(() => (Array.isArray(branchQuery.data) ? branchQuery.data : []), [branchQuery.data])
  const memberships = useMemo(
    () => (Array.isArray(membershipQuery.data) ? membershipQuery.data : []),
    [membershipQuery.data],
  )
  const accesses = useMemo(() => (Array.isArray(accessQuery.data) ? accessQuery.data : []), [accessQuery.data])
  const users = useMemo(() => (Array.isArray(userQuery.data) ? userQuery.data : []), [userQuery.data])
  const isLoading = branchQuery.isLoading || membershipQuery.isLoading || accessQuery.isLoading || userQuery.isLoading
  const queryError = branchQuery.error || membershipQuery.error || accessQuery.error || userQuery.error
  const displayedErrorMessage = errorMessage || (queryError instanceof Error ? queryError.message : '')

  useEffect(() => {
    setMembershipForm((prev) => ({ ...prev, userId: prev.userId || users[0]?.id || '' }))
    setAccessForm((prev) => ({
      ...prev,
      userId: prev.userId || users[0]?.id || '',
      branchId: prev.branchId || branches[0]?.id || '',
    }))
  }, [branches, users])

  const membershipUsers = useMemo(() => {
    const existingUserIds = new Set(memberships.map((item) => item.userId))
    return users.filter((user) => !existingUserIds.has(user.id))
  }, [memberships, users])

  const currentMembership = useMemo(() => (
    memberships.find((membership) => membership.userId === currentUser?.id) || null
  ), [memberships, currentUser?.id])

  const canAdministerTenant = useMemo(() => {
    if (!currentMembership || currentMembership.status !== 'active') {
      return false
    }

    return currentMembership.role === 'owner' || currentMembership.role === 'admin'
  }, [currentMembership])

  const canManageOwnerMembership = useMemo(() => (
    currentMembership?.status === 'active' && currentMembership?.role === 'owner'
  ), [currentMembership])

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
        throw new Error('Hanya owner tenant yang dapat menambah role owner.')
      }
      const saved = await createOrUpdateTenantMembership(membershipForm)
      await membershipQuery.mutate((current = []) => {
        const exists = current.some((membership) => membership.id === saved.id)
        return exists
          ? current.map((membership) => (membership.id === saved.id ? saved : membership))
          : [...current, saved]
      }, { revalidate: false })
      setMessage('Membership tenant berhasil disimpan.')
      setMembershipForm((prev) => ({
        ...initialMembershipForm,
        userId: membershipUsers[0]?.id || prev.userId,
      }))
      void membershipQuery.mutate()
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
      const updated = await updateTenantMembership(membershipId, payload)
      await membershipQuery.mutate((current = []) => current.map((membership) => (
        membership.id === membershipId ? updated : membership
      )), { revalidate: false })
      setMessage('Membership tenant berhasil diperbarui.')
      void membershipQuery.mutate()
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Gagal update membership.'
      setErrorMessage(messageText)
    }
  }

  const handleCreateTenantUser = async (event) => {
    event.preventDefault()
    setMessage('')
    setErrorMessage('')

    if (!canAdministerTenant) {
      setErrorMessage('Hanya owner/admin tenant aktif yang bisa membuat user toko.')
      return
    }

    try {
      setIsSubmittingTenantUser(true)
      await createTenantUserAccount(tenantUserForm)
      setMessage('User toko baru berhasil dibuat dan langsung aktif di tenant ini.')
      setTenantUserForm(initialTenantUserForm)
      void Promise.all([userQuery.mutate(), membershipQuery.mutate()])
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Gagal membuat user toko baru.'
      setErrorMessage(messageText)
    } finally {
      setIsSubmittingTenantUser(false)
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
      const saved = await createOrUpdateBranchAccess(accessForm)
      await accessQuery.mutate((current = []) => {
        const exists = current.some((access) => access.id === saved.id)
        return exists ? current.map((access) => (access.id === saved.id ? saved : access)) : [...current, saved]
      }, { revalidate: false })
      setMessage('Akses cabang user berhasil disimpan.')
      void accessQuery.mutate()
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
      await accessQuery.mutate((current = []) => current.filter((item) => item.id !== access.id), { revalidate: false })
      void accessQuery.mutate()
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Gagal menghapus akses cabang.'
      setErrorMessage(messageText)
    }
  }

  return (
    <div className="space-y-6 pt-0 pb-4 sm:pb-5">
      {message && (
        <div className="rounded-lg border border-[#2ecc71]/40 bg-[#2ecc71]/10 p-3 text-sm text-[#6ee7a8]">{message}</div>
      )}

      {displayedErrorMessage && (
        <div className="rounded-lg border border-[#e74c3c]/40 bg-[#e74c3c]/10 p-3 text-sm text-[#f3b2ad]">{displayedErrorMessage}</div>
      )}

      <section className="rounded-DEFAULT border border-border bg-sidebar-bg/60 p-4 sm:p-6">
        <h3 className="mb-1 text-[1rem] font-bold text-text-main">Ringkasan Tim Tenant</h3>
        <p className="text-sm text-text-muted">
          Role global: <span className="font-semibold text-text-main">{currentUser?.role || '-'}</span>
          {' '}| Role tenant aktif: <span className="font-semibold text-text-main">{currentMembership?.role || '-'}</span>
          {' '}({currentMembership?.status || 'no-membership'})
        </p>
        <p className="mt-2 text-xs text-text-muted">
          Area ini dipakai owner/admin tenant untuk mengatur user toko, membership tenant, dan izin akses ke masing-masing cabang.
        </p>
        {!canAdministerTenant && (
          <p className="mt-2 text-xs text-[#f3b2ad]">
            Kamu belum punya role owner/admin aktif di tenant ini, jadi aksi manajemen tim dibatasi.
          </p>
        )}
      </section>

      <section className="rounded-DEFAULT border border-border bg-sidebar-bg/60 p-4 sm:p-6">
        <h3 className="mb-1 text-[1.1rem] font-bold text-text-main">Buat User Toko</h3>
        <p className="mb-5 text-sm text-text-muted">Owner/admin tenant bisa langsung membuat akun kasir/admin untuk toko ini. Kuota user aktif mengikuti paket tenant.</p>

        <form onSubmit={handleCreateTenantUser} className="grid grid-cols-1 items-end gap-4 md:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-[0.85rem] text-text-muted">Username</label>
            <input
              className="w-full rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
              placeholder="kasir.bandung"
              value={tenantUserForm.username}
              onChange={(event) => setTenantUserForm((prev) => ({ ...prev, username: event.target.value }))}
              required
              disabled={!canAdministerTenant}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[0.85rem] text-text-muted">Password Awal</label>
            <input
              type="password"
              className="w-full rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
              placeholder="Minimal 8 karakter"
              value={tenantUserForm.password}
              onChange={(event) => setTenantUserForm((prev) => ({ ...prev, password: event.target.value }))}
              required
              minLength={8}
              disabled={!canAdministerTenant}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[0.85rem] text-text-muted">Role Tenant</label>
            <select
              className="w-full rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
              value={tenantUserForm.tenantRole}
              onChange={(event) => setTenantUserForm((prev) => ({ ...prev, tenantRole: event.target.value }))}
              disabled={!canAdministerTenant}
            >
              <option value="kasir">kasir</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={isSubmittingTenantUser || !canAdministerTenant}
            className="min-h-11 rounded-lg bg-accent px-5 py-2.5 font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {isSubmittingTenantUser ? 'Menyimpan...' : 'Buat User Toko'}
          </button>
        </form>
      </section>

      <section className="rounded-DEFAULT border border-border bg-sidebar-bg/60 p-4 sm:p-6">
        <h3 className="mb-1 text-[1.1rem] font-bold text-text-main">Membership Tenant</h3>
        <p className="mb-5 text-sm text-text-muted">Daftarkan user agar menjadi bagian tenant toko ini dan tentukan role tenant-nya.</p>

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

        {isLoading ? (
          <div className="mt-5 text-text-muted">Memuat membership tenant...</div>
        ) : memberships.length === 0 ? (
          <div className="mt-5 rounded-lg border border-border/50 bg-bg-main/30 p-4 text-center text-text-muted">Belum ada membership tenant.</div>
        ) : (
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
        )}
      </section>

      <section className="rounded-DEFAULT border border-border bg-sidebar-bg/60 p-4 sm:p-6">
        <h3 className="mb-1 text-[1.1rem] font-bold text-text-main">Akses User ke Cabang</h3>
        <p className="mb-5 text-sm text-text-muted">Tentukan user mana yang boleh bekerja di cabang tertentu.</p>

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

        {isLoading ? (
          <div className="mt-5 text-text-muted">Memuat akses cabang...</div>
        ) : accesses.length === 0 ? (
          <div className="mt-5 rounded-lg border border-border/50 bg-bg-main/30 p-4 text-center text-text-muted">Belum ada akses cabang yang diatur.</div>
        ) : (
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
        )}
      </section>
    </div>
  )
}

export default TeamSettings
