import React, { useEffect, useRef, useState } from 'react'
import { createUserAccount, fetchUsers, getStoredSession, removeUserAccount, resetUserPassword, updateUserAccount } from '../lib/api'

const Users = () => {
    const [users, setUsers] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isSavingEdit, setIsSavingEdit] = useState(false)
    const [deletingUserId, setDeletingUserId] = useState('')
    const [message, setMessage] = useState('')
    const [errorMessage, setErrorMessage] = useState('')
    const [editingUserId, setEditingUserId] = useState('')
    const latestLoadRequestRef = useRef(0)
    const usersSyncChannelRef = useRef(null)
    const isBackgroundSyncingRef = useRef(false)
    const [form, setForm] = useState({
        username: '',
        password: '',
        role: 'kasir',
    })
    const [editForm, setEditForm] = useState({
        username: '',
        role: 'kasir',
    })
    const currentUser = getStoredSession().user

    const loadUsers = async () => {
        const requestId = latestLoadRequestRef.current + 1
        latestLoadRequestRef.current = requestId
        setIsLoading(true)
        setErrorMessage('')

        try {
            const data = await fetchUsers()
            if (requestId !== latestLoadRequestRef.current) {
                return
            }
            setUsers(data)
        } catch (error) {
            if (requestId !== latestLoadRequestRef.current) {
                return
            }
            const messageText = error instanceof Error ? error.message : 'Gagal memuat daftar user.'
            setErrorMessage(messageText)
        } finally {
            if (requestId === latestLoadRequestRef.current) {
                setIsLoading(false)
            }
        }
    }

    useEffect(() => {
        loadUsers()
    }, [])

    const notifyUsersChanged = () => {
        const payload = {
            type: 'users-changed',
            at: Date.now(),
        }

        if (typeof BroadcastChannel !== 'undefined') {
            if (!usersSyncChannelRef.current) {
                usersSyncChannelRef.current = new BroadcastChannel('avia-users-sync')
            }

            usersSyncChannelRef.current.postMessage(payload)
        }

        try {
            localStorage.setItem('avia-users-sync', JSON.stringify(payload))
        } catch {
            // Ignore quota/storage errors.
        }
    }

    useEffect(() => {
        if (typeof BroadcastChannel !== 'undefined' && !usersSyncChannelRef.current) {
            usersSyncChannelRef.current = new BroadcastChannel('avia-users-sync')
        }

        const handleSync = async () => {
            if (isBackgroundSyncingRef.current || editingUserId) {
                return
            }

            isBackgroundSyncingRef.current = true
            try {
                await loadUsers()
            } finally {
                isBackgroundSyncingRef.current = false
            }
        }

        const channel = usersSyncChannelRef.current
        const onChannelMessage = (event) => {
            if (event?.data?.type === 'users-changed') {
                void handleSync()
            }
        }

        const onStorage = (event) => {
            if (event.key === 'avia-users-sync' && event.newValue) {
                void handleSync()
            }
        }

        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                void handleSync()
            }
        }

        const onFocus = () => {
            void handleSync()
        }

        const intervalId = window.setInterval(() => {
            if (document.visibilityState === 'visible') {
                void handleSync()
            }
        }, 15000)

        if (channel) {
            channel.addEventListener('message', onChannelMessage)
        }
        window.addEventListener('storage', onStorage)
        window.addEventListener('focus', onFocus)
        document.addEventListener('visibilitychange', onVisibilityChange)

        return () => {
            if (channel) {
                channel.removeEventListener('message', onChannelMessage)
            }
            window.removeEventListener('storage', onStorage)
            window.removeEventListener('focus', onFocus)
            document.removeEventListener('visibilitychange', onVisibilityChange)
            window.clearInterval(intervalId)
        }
    }, [editingUserId])

    useEffect(() => () => {
        if (usersSyncChannelRef.current) {
            usersSyncChannelRef.current.close()
            usersSyncChannelRef.current = null
        }
    }, [])

    const handleCreateUser = async (event) => {
        event.preventDefault()
        setMessage('')
        setErrorMessage('')

        try {
            setIsSubmitting(true)
            await createUserAccount(form)
            setForm({ username: '', password: '', role: 'kasir' })
            setMessage('User baru berhasil dibuat.')
            await loadUsers()
            notifyUsersChanged()
        } catch (error) {
            const messageText = error instanceof Error ? error.message : 'Gagal membuat user.'
            setErrorMessage(messageText)
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleResetPassword = async (user) => {
        const newPassword = window.prompt(`Masukkan password baru untuk ${user.username} (minimal 8 karakter):`)

        if (!newPassword) {
            return
        }

        if (newPassword.length < 8) {
            window.alert('Password minimal 8 karakter.')
            return
        }

        setMessage('')
        setErrorMessage('')

        try {
            await resetUserPassword(user.id, newPassword)
            setMessage(`Password untuk ${user.username} berhasil direset.`)
        } catch (error) {
            const messageText = error instanceof Error ? error.message : 'Gagal reset password.'
            setErrorMessage(messageText)
        }
    }

    const handleStartEdit = (user) => {
        setEditingUserId(user.id)
        setEditForm({
            username: user.username,
            role: user.role,
        })
        setMessage('')
        setErrorMessage('')
    }

    const handleCancelEdit = () => {
        setEditingUserId('')
        setEditForm({
            username: '',
            role: 'kasir',
        })
    }

    const handleSaveEdit = async (userId) => {
        setMessage('')
        setErrorMessage('')

        try {
            setIsSavingEdit(true)
            await updateUserAccount(userId, editForm)
            setMessage('Data user berhasil diperbarui.')
            setEditingUserId('')
            await loadUsers()
            notifyUsersChanged()
        } catch (error) {
            const messageText = error instanceof Error ? error.message : 'Gagal memperbarui user.'
            setErrorMessage(messageText)
        } finally {
            setIsSavingEdit(false)
        }
    }

    const handleDeleteUser = async (user) => {
        if (!window.confirm(`Yakin ingin menghapus user ${user.username}?`)) {
            return
        }

        setMessage('')
        setErrorMessage('')

        try {
            setDeletingUserId(user.id)
            await removeUserAccount(user.id)
            setMessage(`User ${user.username} berhasil dihapus.`)
            await loadUsers()
            notifyUsersChanged()
        } catch (error) {
            const messageText = error instanceof Error ? error.message : 'Gagal menghapus user.'
            setErrorMessage(messageText)
        } finally {
            setDeletingUserId('')
        }
    }

    return (
        <div className="space-y-6 py-4 sm:py-5">
            <section className="rounded-DEFAULT border border-border bg-sidebar-bg/60 p-4 sm:p-6">
                <h3 className="text-[1.1rem] font-bold text-text-main mb-1">Tambah User Baru</h3>
                <p className="text-text-muted text-sm mb-5">Buat akun admin atau kasir untuk akses aplikasi.</p>

                <form onSubmit={handleCreateUser} className="grid grid-cols-1 items-end gap-4 md:grid-cols-4">
                    <div className="md:col-span-1">
                        <label className="block mb-1.5 text-[0.85rem] text-text-muted">Username</label>
                        <input
                            className="w-full bg-bg-main border border-border p-2.5 rounded-lg text-text-main outline-none focus:border-accent"
                            value={form.username}
                            onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
                            placeholder="username"
                            required
                        />
                    </div>
                    <div className="md:col-span-1">
                        <label className="block mb-1.5 text-[0.85rem] text-text-muted">Password</label>
                        <input
                            type="password"
                            className="w-full bg-bg-main border border-border p-2.5 rounded-lg text-text-main outline-none focus:border-accent"
                            value={form.password}
                            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                            placeholder="minimal 8 karakter"
                            required
                        />
                    </div>
                    <div className="md:col-span-1">
                        <label className="block mb-1.5 text-[0.85rem] text-text-muted">Role</label>
                        <select
                            className="w-full bg-bg-main border border-border p-2.5 rounded-lg text-text-main outline-none focus:border-accent"
                            value={form.role}
                            onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
                        >
                            <option value="kasir">Kasir</option>
                            <option value="admin">Admin</option>
                            <option value="superuser">Superuser</option>
                        </select>
                    </div>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="min-h-11 rounded-lg bg-accent px-5 py-2.5 font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
                    >
                        {isSubmitting ? 'Menyimpan...' : 'Buat User'}
                    </button>
                </form>
            </section>

            {message && (
                <div className="rounded-lg border border-[#2ecc71]/40 bg-[#2ecc71]/10 p-3 text-sm text-[#6ee7a8]">{message}</div>
            )}

            {errorMessage && (
                <div className="rounded-lg border border-[#e74c3c]/40 bg-[#e74c3c]/10 p-3 text-sm text-[#f3b2ad]">{errorMessage}</div>
            )}

            <section className="rounded-DEFAULT border border-border bg-sidebar-bg/60 p-4 sm:p-6">
                <h3 className="text-[1.1rem] font-bold text-text-main mb-1">Daftar User</h3>
                <p className="text-text-muted text-sm mb-5">Reset password, edit role, dan hapus user dari tabel ini.</p>

                {isLoading ? (
                    <div className="text-text-muted">Memuat daftar user...</div>
                ) : (
                    <>
                        <div className="space-y-3 md:hidden">
                            {users.map((user) => (
                                <article key={user.id} className="rounded-lg border border-border/50 bg-bg-main/30 p-4">
                                    <div className="mb-3">
                                        {editingUserId === user.id ? (
                                            <input
                                                className="w-full rounded-lg border border-border bg-bg-main p-2 text-text-main outline-none focus:border-accent"
                                                value={editForm.username}
                                                onChange={(event) => setEditForm((prev) => ({ ...prev, username: event.target.value }))}
                                            />
                                        ) : (
                                            <p className="font-semibold text-text-main">{user.username}</p>
                                        )}
                                        <p className="mt-1 text-xs text-text-muted">Dibuat: {new Date(user.createdAt).toLocaleString('id-ID')}</p>
                                    </div>

                                    <div className="mb-3">
                                        {editingUserId === user.id ? (
                                            <select
                                                className="w-full rounded-lg border border-border bg-bg-main p-2 text-text-main outline-none focus:border-accent"
                                                value={editForm.role}
                                                onChange={(event) => setEditForm((prev) => ({ ...prev, role: event.target.value }))}
                                            >
                                                <option value="kasir">Kasir</option>
                                                <option value="admin">Admin</option>
                                                <option value="superuser">Superuser</option>
                                            </select>
                                        ) : (
                                            <span className="text-sm capitalize text-text-muted">Role: {user.role}</span>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        {editingUserId === user.id ? (
                                            <>
                                                <button
                                                    className="min-h-11 rounded bg-accent px-3 py-2 text-sm text-white hover:bg-accent-hover disabled:opacity-60"
                                                    onClick={() => handleSaveEdit(user.id)}
                                                    disabled={isSavingEdit}
                                                >
                                                    {isSavingEdit ? 'Menyimpan...' : 'Simpan'}
                                                </button>
                                                <button
                                                    className="min-h-11 rounded border border-border bg-sidebar-bg px-3 py-2 text-sm text-text-main hover:border-accent"
                                                    onClick={handleCancelEdit}
                                                >
                                                    Batal
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    className="min-h-11 rounded border border-border bg-sidebar-bg px-3 py-2 text-sm text-text-main hover:border-accent"
                                                    onClick={() => handleStartEdit(user)}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    className="min-h-11 rounded border border-border bg-sidebar-bg px-3 py-2 text-sm text-text-main hover:border-accent"
                                                    onClick={() => handleResetPassword(user)}
                                                    disabled={deletingUserId === user.id}
                                                >
                                                    Reset Password
                                                </button>
                                                <button
                                                    className="min-h-11 rounded border border-[#e74c3c]/50 bg-[#e74c3c]/10 px-3 py-2 text-sm text-[#f3b2ad] hover:bg-[#e74c3c]/20 disabled:opacity-60"
                                                    onClick={() => handleDeleteUser(user)}
                                                    disabled={deletingUserId === user.id || currentUser?.id === user.id}
                                                    title={currentUser?.id === user.id ? 'Akun yang sedang dipakai tidak bisa dihapus.' : ''}
                                                >
                                                    {deletingUserId === user.id ? 'Menghapus...' : 'Hapus User'}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </article>
                            ))}
                        </div>

                        <div className="hidden overflow-x-auto md:block">
                            <table className="w-full min-w-[760px] border-collapse">
                                <thead>
                                    <tr>
                                        <th className="border-b border-border p-3 text-left text-xs uppercase tracking-wider text-text-muted">Username</th>
                                        <th className="border-b border-border p-3 text-left text-xs uppercase tracking-wider text-text-muted">Role</th>
                                        <th className="border-b border-border p-3 text-left text-xs uppercase tracking-wider text-text-muted">Dibuat</th>
                                        <th className="border-b border-border p-3 text-right text-xs uppercase tracking-wider text-text-muted">Aksi</th>
                                        <th className="border-b border-border p-3 text-right text-xs uppercase tracking-wider text-text-muted">Hapus</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((user) => (
                                        <tr key={user.id} className="hover:bg-white/5">
                                            <td className="border-b border-border/40 p-3 font-medium text-text-main">
                                                {editingUserId === user.id ? (
                                                    <input
                                                        className="w-full rounded-lg border border-border bg-bg-main p-2 text-text-main outline-none focus:border-accent"
                                                        value={editForm.username}
                                                        onChange={(event) => setEditForm((prev) => ({ ...prev, username: event.target.value }))}
                                                    />
                                                ) : (
                                                    user.username
                                                )}
                                            </td>
                                            <td className="border-b border-border/40 p-3 capitalize text-text-muted">
                                                {editingUserId === user.id ? (
                                                    <select
                                                        className="w-full rounded-lg border border-border bg-bg-main p-2 text-text-main outline-none focus:border-accent"
                                                        value={editForm.role}
                                                        onChange={(event) => setEditForm((prev) => ({ ...prev, role: event.target.value }))}
                                                    >
                                                        <option value="kasir">Kasir</option>
                                                        <option value="admin">Admin</option>
                                                        <option value="superuser">Superuser</option>
                                                    </select>
                                                ) : (
                                                    user.role
                                                )}
                                            </td>
                                            <td className="border-b border-border/40 p-3 text-sm text-text-muted">{new Date(user.createdAt).toLocaleString('id-ID')}</td>
                                            <td className="border-b border-border/40 p-3 text-right">
                                                <div className="flex justify-end gap-2">
                                                    {editingUserId === user.id ? (
                                                        <>
                                                            <button
                                                                className="rounded bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent-hover disabled:opacity-60"
                                                                onClick={() => handleSaveEdit(user.id)}
                                                                disabled={isSavingEdit}
                                                            >
                                                                {isSavingEdit ? 'Menyimpan...' : 'Simpan'}
                                                            </button>
                                                            <button
                                                                className="rounded border border-border bg-sidebar-bg px-3 py-1.5 text-sm text-text-main hover:border-accent"
                                                                onClick={handleCancelEdit}
                                                            >
                                                                Batal
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button
                                                                className="rounded border border-border bg-sidebar-bg px-3 py-1.5 text-sm text-text-main hover:border-accent"
                                                                onClick={() => handleStartEdit(user)}
                                                            >
                                                                Edit
                                                            </button>
                                                            <button
                                                                className="rounded border border-border bg-sidebar-bg px-3 py-1.5 text-sm text-text-main hover:border-accent"
                                                                onClick={() => handleResetPassword(user)}
                                                                disabled={deletingUserId === user.id}
                                                            >
                                                                Reset Password
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="border-b border-border/40 p-3 text-right">
                                                <button
                                                    className="rounded border border-[#e74c3c]/50 bg-[#e74c3c]/10 px-3 py-1.5 text-sm text-[#f3b2ad] hover:bg-[#e74c3c]/20 disabled:opacity-60"
                                                    onClick={() => handleDeleteUser(user)}
                                                    disabled={deletingUserId === user.id || currentUser?.id === user.id || editingUserId === user.id}
                                                    title={currentUser?.id === user.id ? 'Akun yang sedang dipakai tidak bisa dihapus.' : ''}
                                                >
                                                    {deletingUserId === user.id ? 'Menghapus...' : 'Hapus User'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </section>
        </div>
    )
}

export default Users
