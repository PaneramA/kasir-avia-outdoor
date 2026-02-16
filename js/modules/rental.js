// Rental Module
App.rental = {
    renderItems(category = 'all') {
        let items = App.currentState.inventory;
        if (category !== 'all') {
            items = items.filter(i => i.category === category);
        }

        if (items.length === 0) {
            return '<div class="placeholder-msg">Barang tidak ditemukan.</div>';
        }

        return items.map(item => `
            <div class="rental-card ${item.stock <= 0 ? 'disabled' : ''}" onclick="App.rental.addToCart(${item.id})">
                <div class="rc-img">
                    <img src="${item.image || 'https://via.placeholder.com/150'}" alt="${item.name}">
                    ${item.stock <= 0 ? '<div class="status-overlay">Habis</div>' : ''}
                </div>
                <div class="rc-info">
                    <h5>${item.name}</h5>
                    <span class="price">Rp ${parseInt(item.price).toLocaleString()} <small>/hari</small></span>
                    <span class="stock-info">Tersedia: ${item.stock}</span>
                </div>
            </div>
        `).join('');
    },

    renderCart() {
        if (App.currentState.cart.length === 0) {
            return '<div class="cart-empty">Belum ada barang dipilih.</div>';
        }

        return App.currentState.cart.map((item, idx) => `
            <div class="cart-item-wrapper">
                <div class="cart-item">
                    <div class="details">
                        <span>${item.name}</span>
                        <small>Rp ${parseInt(item.price).toLocaleString()} x ${item.qty}</small>
                    </div>
                    <div class="qty-actions">
                        <button onclick="App.rental.updateCartQty(${idx}, -1)">-</button>
                        <span>${item.qty}</span>
                        <button onclick="App.rental.updateCartQty(${idx}, 1)">+</button>
                        <button class="remove" onclick="App.rental.removeFromCart(${idx})">&times;</button>
                    </div>
                </div>
                <div class="item-notes">
                    <textarea placeholder="Catatan (kondisi, kelengkapan...)" oninput="App.rental.updateCartNote(${idx}, this.value)">${item.notes || ''}</textarea>
                </div>
            </div>
        `).join('');
    },

    render() {
        return `
            <div class="rental-layout">
                <div class="selection-area">
                    <div class="section-header">
                        <h3>Pilih Barang</h3>
                        <div class="filter-group">
                            <select id="rent-cat-filter">
                                <option value="all">Semua Kategori</option>
                                ${App.currentState.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="rental-grid" id="rental-item-list">
                        ${this.renderItems()}
                    </div>
                </div>
                
                <div class="checkout-sidebar">
                    <div class="sidebar-card">
                        <h4>Detail Penyewa</h4>
                        <div class="form-group">
                            <label>Nama Pelanggan</label>
                            <input type="text" id="cust-name" placeholder="Nama lengkap..." required>
                        </div>
                        <div class="form-group">
                            <label>Nomor HP</label>
                            <input type="text" id="cust-phone" placeholder="0812...">
                        </div>
                        <div class="form-group">
                            <label>Jaminan</label>
                            <select id="cust-guarantee" onchange="App.rental.toggleOtherGuarantee(this.value)">
                                <option value="KTP">KTP</option>
                                <option value="SIM">SIM</option>
                                <option value="Paspor">Paspor</option>
                                <option value="Lainnya">Lainnya</option>
                            </select>
                        </div>
                        <div class="form-group" id="other-guarantee-box" style="display: none;">
                            <label>Sebutkan Jaminan Lainnya</label>
                            <input type="text" id="cust-guarantee-other" placeholder="Contoh: STNK, Kartu Pelajar...">
                        </div>
                        
                        <div class="form-group">
                            <label>Nomor Identitas (Sesuai Jaminan)</label>
                            <input type="text" id="cust-id-number" placeholder="Nomor KTP/SIM... (Isi 0 untuk random)" required>
                        </div>
                        
                        <div class="divider"></div>
                        
                        <h4>Keranjang Sewa</h4>
                        <div class="cart-items" id="cart-list">
                            ${this.renderCart()}
                        </div>
                        
                        <div class="rental-duration">
                            <div class="form-group">
                                <label>Durasi (Hari)</label>
                                <input type="number" id="rent-duration" value="1" min="1">
                            </div>
                        </div>
                        
                        <div class="total-section">
                            <div class="row">
                                <span>Total Sewa</span>
                                <h3 id="total-price">Rp 0</h3>
                            </div>
                            <button class="primary-btn checkout-btn" id="checkout-btn" style="width: 100%; margin-top: 15px; justify-content: center;">
                                <i class="fas fa-shopping-cart"></i> Konfirmasi Sewa
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    addToCart(id) {
        const item = App.currentState.inventory.find(i => i.id === id);
        if (!item || item.stock <= 0) return;

        const cartItem = App.currentState.cart.find(c => c.id === id);
        if (cartItem) {
            if (cartItem.qty < item.stock) {
                cartItem.qty++;
            } else {
                alert('Stok tidak mencukupi');
                return;
            }
        } else {
            App.currentState.cart.push({ ...item, qty: 1, notes: '' });
        }
        this.updateUI();
    },

    updateCartNote(index, note) {
        App.currentState.cart[index].notes = note;
    },

    toggleOtherGuarantee(value) {
        const otherBox = document.getElementById('other-guarantee-box');
        if (otherBox) {
            otherBox.style.display = value === 'Lainnya' ? 'block' : 'none';
        }
    },

    updateCartQty(index, delta) {
        const item = App.currentState.cart[index];
        const invItem = App.currentState.inventory.find(i => i.id === item.id);
        const newQty = item.qty + delta;
        if (newQty > 0 && newQty <= invItem.stock) {
            item.qty = newQty;
            this.updateUI();
        } else if (newQty > invItem.stock) {
            alert('Stok tidak mencukupi');
        }
    },

    removeFromCart(index) {
        App.currentState.cart.splice(index, 1);
        this.updateUI();
    },

    updateUI() {
        const cartList = document.getElementById('cart-list');
        if (cartList) cartList.innerHTML = this.renderCart();
        this.updateTotal();
    },

    updateTotal() {
        const duration = parseInt(document.getElementById('rent-duration')?.value || 1);
        const total = App.currentState.cart.reduce((sum, item) => sum + (item.price * item.qty * duration), 0);
        const totalEl = document.getElementById('total-price');
        if (totalEl) totalEl.innerText = `Rp ${total.toLocaleString()}`;
    },

    processCheckout() {
        const name = document.getElementById('cust-name').value;
        const phone = document.getElementById('cust-phone').value;
        const guaranteeType = document.getElementById('cust-guarantee').value;
        const guaranteeOther = document.getElementById('cust-guarantee-other')?.value || '';
        const duration = parseInt(document.getElementById('rent-duration').value);

        if (!name || App.currentState.cart.length === 0) {
            alert('Lengkapi data pelanggan dan pilih barang!');
            return;
        }

        let idNumber = document.getElementById('cust-id-number')?.value || '';
        if (idNumber === '0') {
            idNumber = 'RNDM-' + Math.floor(100000 + Math.random() * 900000);
        }
                
        const transaction = {
            id: 'TX-' + Date.now(),
            customer: {
                name,
                phone,
                guarantee: guaranteeType === 'Lainnya' ? guaranteeOther : guaranteeType,
                idNumber: idNumber
            },
            items: [...App.currentState.cart],
            duration: duration,
            total: App.currentState.cart.reduce((sum, item) => sum + (item.price * item.qty * duration), 0),
            status: 'Active',
            date: new Date().toISOString()
        };

        App.currentState.cart.forEach(cartItem => {
            const invItem = App.currentState.inventory.find(i => i.id === cartItem.id);
            if (invItem) invItem.stock -= cartItem.qty;
        });

        App.currentState.rentals.push(transaction);
        App.currentState.cart = [];

        localStorage.setItem('avia_inventory', JSON.stringify(App.currentState.inventory));
        localStorage.setItem('avia_rentals', JSON.stringify(App.currentState.rentals));

        alert('Transaksi berhasil disimpan!');
        App.loadPage('dashboard');
    },

    initEvents() {
        const catFilter = document.getElementById('rent-cat-filter');
        const durationInput = document.getElementById('rent-duration');
        const checkoutBtn = document.getElementById('checkout-btn');

        catFilter?.addEventListener('change', (e) => {
            document.getElementById('rental-item-list').innerHTML = this.renderItems(e.target.value);
        });

        durationInput?.addEventListener('input', () => this.updateTotal());
        checkoutBtn?.addEventListener('click', () => this.processCheckout());
    }
};
