// Dashboard Module
App.dashboard = {
    calculateStats() {
        const available = App.currentState.inventory.reduce((sum, item) => sum + parseInt(item.stock), 0);
        const activeRentals = App.currentState.rentals.filter(r => r.status === 'Active').length;
        const itemsOut = App.currentState.rentals
            .filter(r => r.status === 'Active')
            .reduce((sum, r) => sum + r.items.reduce((iSum, item) => iSum + item.qty, 0), 0);
        const revenue = App.currentState.rentals.reduce((sum, r) => sum + r.total, 0);

        return { available, activeRentals, itemsOut, revenue };
    },

    renderRecentRentals() {
        const recent = [...App.currentState.rentals].reverse().slice(0, 5);
        if (recent.length === 0) {
            return '<div class="placeholder-msg">Belum ada data terbaru.</div>';
        }

        return `
            <table class="recent-table">
                <thead>
                    <tr>
                        <th>Pelanggan</th>
                        <th>Barang</th>
                        <th>Status</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${recent.map(r => `
                        <tr>
                            <td>
                                <strong>${r.customer.name}</strong><br>
                                <small>${r.customer.phone}</small>
                            </td>
                            <td>${r.items.map(i => `${i.name} (${i.qty})`).join(', ')}</td>
                            <td><span class="status-badge ${r.status.toLowerCase()}">${r.status}</span></td>
                            <td>Rp ${r.total.toLocaleString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    },

    render() {
        const stats = this.calculateStats();
        return `
            <div class="welcome-banner">
                <h2>Sistem Rental AviaOutdoor</h2>
                <p>Pusat kendali operasional persewaan alat camping & hiking.</p>
            </div>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="icon" style="background: rgba(46, 204, 113, 0.2); color: #2ecc71;"><i class="fas fa-check-circle"></i></div>
                    <div class="info">
                        <span class="label">Stok Tersedia</span>
                        <span class="value">${stats.available}</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="icon" style="background: rgba(230, 126, 34, 0.2); color: #e67e22;"><i class="fas fa-clock"></i></div>
                    <div class="info">
                        <span class="label">Penyewaan Aktif</span>
                        <span class="value">${stats.activeRentals}</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="icon" style="background: rgba(231, 76, 60, 0.2); color: #e74c3c;"><i class="fas fa-exclamation-triangle"></i></div>
                    <div class="info">
                        <span class="label">Barang Keluar</span>
                        <span class="value">${stats.itemsOut}</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="icon" style="background: rgba(52, 152, 219, 0.2); color: #3498db;"><i class="fas fa-wallet"></i></div>
                    <div class="info">
                        <span class="label">Pendapatan</span>
                        <span class="value">Rp ${stats.revenue.toLocaleString()}</span>
                    </div>
                </div>
            </div>
            <div class="recent-section">
                <h3>Penyewaan Terbaru</h3>
                <p style="color: var(--text-muted); font-size: 0.9rem;">Daftar transaksi terakhir.</p>
                <div class="recent-list">
                    ${this.renderRecentRentals()}
                </div>
            </div>
        `;
    }
};
