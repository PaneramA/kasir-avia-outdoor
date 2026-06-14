import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { APP_ROUTES } from '../lib/routes'

function formatDateTime(dateValue) {
  if (!dateValue) {
    return '-'
  }

  const parsed = new Date(dateValue)
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

const AdminOverview = ({
  currentUser,
  tenantOptions = [],
}) => {
  const normalizedRole = String(currentUser?.role || '').trim().toLowerCase()
  const isPlatformAdmin = normalizedRole === 'admin' || normalizedRole === 'superuser'

  const pendingTenants = useMemo(
    () => tenantOptions.filter((tenant) => String(tenant?.status || '').trim().toLowerCase() !== 'active'),
    [tenantOptions],
  )

  const summaryCards = useMemo(() => {
    const cards = [
      {
        title: 'Approval Pendaftaran',
        value: `${pendingTenants.length} menunggu approval`,
        description: 'Lihat toko baru yang mendaftar lalu aktifkan setelah verifikasi pembayaran atau onboarding.',
        icon: 'fas fa-user-clock',
        route: APP_ROUTES.adminRegistrations,
        cta: 'Buka Approval Tenant',
      },
      {
        title: 'Paket & Limit',
        value: `${tenantOptions.length} tenant terdaftar`,
        description: 'Siapkan kontrol paket, kuota, dan fitur yang nantinya membatasi tenant secara otomatis.',
        icon: 'fas fa-layer-group',
        route: APP_ROUTES.adminPlans,
        cta: 'Buka Paket & Limit',
      },
      {
        title: 'Akun Platform',
        value: currentUser?.username || '-',
        description: 'Kelola akun login platform yang kamu pakai untuk approve tenant dan mengatur paket.',
        icon: 'fas fa-user-shield',
        route: APP_ROUTES.adminAccount,
        cta: 'Buka Akun Saya',
      },
    ]

    return cards
  }, [currentUser?.username, pendingTenants.length, tenantOptions.length])

  return (
    <div className="space-y-6 pt-0 pb-5">
      <section className="overflow-hidden rounded-DEFAULT border border-border bg-[linear-gradient(135deg,rgba(230,126,34,0.18),rgba(20,26,26,0.96))] p-5 sm:p-6">
        <p className="text-[0.76rem] font-semibold uppercase tracking-[0.16em] text-accent">/admin</p>
        <h2 className="mt-2 text-[1.5rem] font-bold text-text-main sm:text-[1.8rem]">
          Panel admin untuk approval tenant dan kontrol platform
        </h2>
        <p className="mt-2 max-w-[760px] text-sm leading-relaxed text-text-muted">
          Fokus area ini adalah approval tenant baru, pemantauan tenant aktif, dan persiapan modul paket platform.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {summaryCards.map((card) => (
          <article
            key={card.title}
            className="rounded-DEFAULT border border-border bg-sidebar-bg/60 p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-text-muted">{card.title}</p>
                <p className="mt-2 text-[1.2rem] font-bold text-text-main">{card.value}</p>
              </div>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
                <i className={card.icon}></i>
              </span>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-text-muted">{card.description}</p>

            <Link
              to={card.route}
              className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover"
            >
              {card.cta}
            </Link>
          </article>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-DEFAULT border border-border bg-sidebar-bg/60 p-5 sm:p-6">
          <h3 className="text-[1.05rem] font-bold text-text-main">Alur admin platform yang sedang dibentuk</h3>
          <div className="mt-4 space-y-3 text-sm text-text-muted">
            <div className="rounded-lg border border-border/50 bg-bg-main/30 p-4">
              <p className="font-semibold text-text-main">1. Approve toko yang baru daftar</p>
              <p className="mt-1">Tenant hasil register akan masuk status suspended, lalu kamu aktifkan dari panel admin setelah verifikasi.</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-bg-main/30 p-4">
              <p className="font-semibold text-text-main">2. Tenant mengatur cabangnya sendiri</p>
              <p className="mt-1">Setelah toko aktif, owner tenant yang akan mengelola cabang, user toko, dan operasional mereka dari area self-service.</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-bg-main/30 p-4">
              <p className="font-semibold text-text-main">3. Paket dan limit diatur dari platform</p>
              <p className="mt-1">Kuota cabang, item, transaksi, dan fitur tenant nantinya dikontrol dari modul paket dan limit.</p>
            </div>
          </div>
        </article>

        <article className="rounded-DEFAULT border border-border bg-sidebar-bg/60 p-5 sm:p-6">
          <h3 className="text-[1.05rem] font-bold text-text-main">Tenant Perlu Approval</h3>
          <p className="mt-1 text-sm text-text-muted">
            Tenant self-register yang belum aktif akan muncul di sini.
          </p>

          <div className="mt-4 space-y-3">
            {(isPlatformAdmin ? pendingTenants : []).slice(0, 5).map((tenant) => (
              <div key={tenant.id} className="rounded-lg border border-border/50 bg-bg-main/30 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-text-main">{tenant.name}</p>
                    <p className="mt-1 text-xs text-text-muted">slug: {tenant.slug}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-wide ${
                    String(tenant.status || '').toLowerCase() === 'active'
                      ? 'bg-[#2ecc71]/12 text-[#6ee7a8]'
                      : 'bg-[#e67e22]/12 text-accent'
                  }`}
                  >
                    {tenant.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-text-muted">Dibuat: {formatDateTime(tenant.createdAt)}</p>
              </div>
            ))}

            {(!isPlatformAdmin || pendingTenants.length === 0) && (
              <div className="rounded-lg border border-border/50 bg-bg-main/30 p-4 text-sm text-text-muted">
                {isPlatformAdmin
                  ? 'Belum ada tenant baru yang menunggu approval.'
                  : 'Belum ada data tenant untuk ditampilkan.'}
              </div>
            )}
          </div>
        </article>
      </section>
    </div>
  )
}

export default AdminOverview
