import React from 'react'
import { useSearchParams } from 'react-router'
import Account from './Account.jsx'
import Branches from './Branches.jsx'
import TeamSettings from './TeamSettings.jsx'

const SECTION_ALIASES = {
  akun: 'profil',
  account: 'profil',
  profil: 'profil',
  toko: 'toko',
  identitas: 'toko',
  transaksi: 'transaksi',
  sewa: 'transaksi',
  keuangan: 'keuangan',
  struk: 'struk',
  cabang: 'cabang',
  branches: 'cabang',
  tim: 'tim',
  team: 'tim',
  paket: 'paket',
  fitur: 'paket',
}

function normalizeSectionId(value) {
  return SECTION_ALIASES[String(value || '').trim().toLowerCase()] || ''
}

function formatEnabled(value) {
  return value === false ? 'Tidak aktif' : 'Aktif'
}

const Settings = ({
  currentUser,
  tenantSettings,
  branchSettings,
  subscriptionSummary,
  isSubscriptionLoading = false,
  subscriptionErrorMessage = '',
  onUpdateTenantSettings,
  onUpdateBranchSettings,
  userId = '',
  tenantId = '',
  branchId = '',
}) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedSection = normalizeSectionId(searchParams.get('bagian'))
  const features = subscriptionSummary?.features || {}
  const canManageBranches = features.canManageBranches !== false
  const canManageStaff = features.canManageStaff !== false
  const canUseFinancialRecap = features.canUseFinancialRecap !== false

  const setRequestedSection = (sectionId) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (sectionId) {
        next.set('bagian', sectionId)
      } else {
        next.delete('bagian')
      }
      return next
    }, { replace: true })
  }

  const toggleSection = (sectionId) => {
    setRequestedSection(sectionId === requestedSection ? '' : sectionId)
  }

  const commonAccountProps = {
    currentUser,
    tenantSettings,
    branchSettings,
    subscriptionSummary,
    isSubscriptionLoading,
    subscriptionErrorMessage,
    onUpdateTenantSettings,
    onUpdateBranchSettings,
    embedded: true,
  }

  const sections = [
    {
      id: 'profil',
      icon: 'fas fa-user-shield',
      title: 'Profil & Keamanan',
      summary: currentUser?.username ? `${currentUser.username} - ${currentUser.role || 'staff'}` : 'Akun login dan password',
      body: (
        <Account
          {...commonAccountProps}
          visibleSections={['accountInfo', 'password']}
        />
      ),
    },
    {
      id: 'toko',
      icon: 'fas fa-store',
      title: 'Identitas Toko',
      summary: tenantSettings?.storeName || 'Nama toko, nama dashboard, alamat, dan kontak',
      body: (
        <Account
          {...commonAccountProps}
          hideSectionHeading
          visibleSections={['tenantIdentity']}
        />
      ),
    },
    {
      id: 'transaksi',
      icon: 'fas fa-clock',
      title: 'Transaksi Sewa',
      summary: 'Atur cara hitung hari sewa dan cut-off operasional',
      body: (
        <Account
          {...commonAccountProps}
          hideSectionHeading
          visibleSections={['rentalPolicy']}
        />
      ),
    },
    {
      id: 'keuangan',
      icon: 'fas fa-chart-simple',
      title: 'Keuangan',
      summary: canUseFinancialRecap ? 'Tanggal tutup buku dan periode laporan' : 'Fitur keuangan tidak aktif di paket ini',
      enabled: canUseFinancialRecap,
      body: (
        <Account
          {...commonAccountProps}
          hideSectionHeading
          visibleSections={['financialPolicy']}
        />
      ),
    },
    {
      id: 'struk',
      icon: 'fas fa-receipt',
      title: 'Struk & Preview',
      summary: 'Atur header, footer, dan preview WhatsApp/print',
      body: (
        <Account
          {...commonAccountProps}
          hideSectionHeading
          visibleSections={['receiptPolicy', 'branchStore']}
        />
      ),
    },
    {
      id: 'cabang',
      icon: 'fas fa-code-branch',
      title: 'Cabang Toko',
      summary: canManageBranches ? 'Tambah cabang dan atur status operasional' : 'Fitur cabang tidak aktif di paket ini',
      enabled: canManageBranches,
      body: <Branches userId={userId} tenantId={tenantId} branchId={branchId} />,
    },
    {
      id: 'tim',
      icon: 'fas fa-users-gear',
      title: 'Tim & Akses',
      summary: canManageStaff ? 'Buat user, role tenant, dan akses per cabang' : 'Fitur tim tidak aktif di paket ini',
      enabled: canManageStaff,
      body: <TeamSettings userId={userId} tenantId={tenantId} branchId={branchId} />,
    },
    {
      id: 'paket',
      icon: 'fas fa-tags',
      title: 'Paket & Fitur',
      summary: `${subscriptionSummary?.subscription?.plan?.name || 'Paket belum terbaca'} - ${formatEnabled(subscriptionSummary?.subscription?.status !== 'active' ? false : true)}`,
      body: (
        <Account
          {...commonAccountProps}
          hideSectionHeading
          visibleSections={['subscription']}
        />
      ),
    },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden pt-0 pb-4 sm:pb-5">
      <div className="mb-4 shrink-0">
        <p className="text-sm text-text-muted">
          Semua pengaturan toko dikumpulkan di sini. Buka bagian yang ingin diubah, lalu simpan per bagian.
        </p>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
        <div data-testid="settings-card-grid" className="grid w-full grid-cols-1 gap-2.5 xl:grid-cols-2">
          {sections.map((section) => {
            const isOpen = requestedSection === section.id
            const isEnabled = section.enabled !== false

            return (
              <section key={section.id} className={`rounded-md border border-border bg-card-bg transition-colors ${isOpen ? 'xl:col-span-2' : ''}`}>
                <button
                  type="button"
                  className="group flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition-colors hover:border-accent hover:bg-accent sm:px-5"
                  aria-expanded={isOpen ? 'true' : 'false'}
                  aria-controls={`settings-panel-${section.id}`}
                  onClick={() => toggleSection(section.id)}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span data-testid={`settings-card-icon-${section.id}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-white transition-colors group-hover:bg-white group-hover:text-accent">
                      <i className={`${section.icon} text-sm`}></i>
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[1rem] font-bold text-text-main transition-colors group-hover:text-white">{section.title}</span>
                      <span className="mt-0.5 block truncate text-sm text-text-muted transition-colors group-hover:text-white/80">{section.summary}</span>
                    </span>
                  </span>
                  <i className={`fas ${isOpen ? 'fa-chevron-up' : 'fa-chevron-down'} text-sm text-text-muted transition-colors group-hover:text-white`}></i>
                </button>

                {isOpen && (
                  <div id={`settings-panel-${section.id}`} className="border-t border-border px-4 py-4 sm:px-5">
                    {isEnabled ? (
                      section.body
                    ) : (
                      <div className="rounded-md border border-border bg-bg-main p-4 text-sm text-text-muted">
                        Bagian ini belum aktif untuk paket toko saat ini.
                      </div>
                    )}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default Settings
