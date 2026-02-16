/**
 * AviaOutdoor App - Core Controller
 * Handles routing, state, and module coordination.
 */
const App = {
    currentState: {
        activePage: 'dashboard',
        isLoaded: false,
        inventory: JSON.parse(localStorage.getItem('avia_inventory')) || [],
        categories: JSON.parse(localStorage.getItem('avia_categories')) || ['Tenda', 'Carrier', 'Alat Masak', 'Lainnya'],
        rentals: JSON.parse(localStorage.getItem('avia_rentals')) || [],
        cart: [],
        editMode: { active: false, itemId: null }
    },

    init() {
        console.log("AviaOutdoor Rental System Initialized");
        this.bindGlobalEvents();
        this.loadPage('dashboard');
    },

    bindGlobalEvents() {
        document.querySelectorAll('.sidebar-nav li').forEach(item => {
            item.addEventListener('click', (e) => {
                const page = e.currentTarget.getAttribute('data-page');
                if (page) {
                    this.loadPage(page);
                }
            });
        });
    },

    loadPage(pageId) {
        // Update UI state
        document.querySelectorAll('.sidebar-nav li').forEach(li => li.classList.remove('active'));
        const activeLi = document.querySelector(`.sidebar-nav li[data-page="${pageId}"]`);
        if (activeLi) activeLi.classList.add('active');

        // Update titles
        const titles = {
            'dashboard': { title: 'Dashboard', subtitle: 'Status inventaris dan penyewaan hari ini.' },
            'rental': { title: 'Sewa Barang', subtitle: 'Proses transaksi peminjaman baru.' },
            'return': { title: 'Pengembalian', subtitle: 'Kembalikan barang dan hitung denda.' },
            'inventory': { title: 'Inventaris', subtitle: 'Kelola stok peralatan outdoor.' },
            'history': { title: 'Riwayat', subtitle: 'Data transaksi penyewaan sebelumnya.' }
        };

        const titleInfo = titles[pageId] || titles['dashboard'];
        document.getElementById('page-title').innerText = titleInfo.title;
        document.getElementById('page-subtitle').innerText = titleInfo.subtitle;

        // Show loading
        const container = document.getElementById('content-view');
        container.innerHTML = '<div class="dashboard-loading"><div class="spinner"></div></div>';

        // Simulate page loading
        setTimeout(() => {
            this.renderPage(pageId, container);
        }, 500);
    },

    renderPage(pageId, container) {
        let html = '';

        switch (pageId) {
            case 'dashboard':
                html = this.dashboard.render();
                break;
            case 'inventory':
                html = this.inventory.render();
                break;
            case 'rental':
                html = this.rental.render();
                break;
            default:
                html = `
                    <div class="placeholder-content">
                        <i class="fas fa-tools"></i>
                        <h2>Halaman ${pageId.charAt(0).toUpperCase() + pageId.slice(1)}</h2>
                        <p>Sedang dalam tahap pengembangan.</p>
                    </div>
                `;
        }

        container.innerHTML = html;
        this.initPageEvents(pageId);
    },

    initPageEvents(pageId) {
        if (pageId === 'inventory' && this.inventory.initEvents) {
            this.inventory.initEvents();
        } else if (pageId === 'rental' && this.rental.initEvents) {
            this.rental.initEvents();
        }
    }
};

// Make App globally accessible
window.App = App;

document.addEventListener('DOMContentLoaded', () => App.init());
