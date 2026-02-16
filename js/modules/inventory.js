// Inventory Module
App.inventory = {
    renderItems() {
        if (App.currentState.inventory.length === 0) {
            return '<div class="placeholder-msg" style="grid-column: 1/-1;">Belum ada barang di inventaris. Silakan tambah barang baru.</div>';
        }

        return App.currentState.inventory.map(item => `
            <div class="item-card" data-id="${item.id}">
                <div class="item-img">
                    <img src="${item.image || 'https://via.placeholder.com/300x200?text=No+Image'}" alt="${item.name}">
                    <span class="item-badge ${item.stock > 0 ? 'badge-ready' : 'badge-low'}">
                        ${item.stock > 0 ? 'Available' : 'Out of Stock'}
                    </span>
                    <div class="item-actions">
                        <button class="action-btn edit" onclick="App.inventory.editItem(${item.id})"><i class="fas fa-edit"></i></button>
                        <button class="action-btn delete" onclick="App.inventory.deleteItem(${item.id})"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
                <div class="item-info">
                    <span class="item-category">${item.category}</span>
                    <h4>${item.name}</h4>
                    <div class="item-details">
                        <span class="price">Rp ${parseInt(item.price).toLocaleString()} <small>/hari</small></span>
                        <span class="stock">Stok: ${item.stock}</span>
                    </div>
                </div>
            </div>
        `).join('');
    },

    renderCategories() {
        return App.currentState.categories.map((cat, idx) => `
            <div class="cat-item">
                <span>${cat}</span>
                <button class="delete-cat" onclick="App.inventory.deleteCategory(${idx})">&times;</button>
            </div>
        `).join('');
    },

    render() {
        return `
            <div class="section-header">
                <div>
                    <h3>Daftar Barang</h3>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">Kelola stok, harga, dan kategori peralatan.</p>
                </div>
                <div class="header-actions">
                    <button class="secondary-btn" id="manage-cats-btn">
                        <i class="fas fa-tags"></i> Kategori
                    </button>
                    <button class="primary-btn" id="add-item-btn">
                        <i class="fas fa-plus"></i> Tambah Barang
                    </button>
                </div>
            </div>
            
            <div class="inventory-grid" id="inventory-list">
                ${this.renderItems()}
            </div>

            <!-- Modal Tambah/Edit Barang -->
            <div class="modal" id="item-modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 id="modal-title">Tambah Barang Baru</h3>
                        <button class="close-modal" data-modal="item-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="item-form">
                            <div class="form-group">
                                <label>Nama Barang</label>
                                <input type="text" id="item-name" placeholder="Contoh: Tenda Dome 4P" required>
                            </div>
                            <div class="form-group" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                                <div>
                                    <label>Kategori</label>
                                    <select id="item-category">
                                        ${App.currentState.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
                                    </select>
                                </div>
                                <div>
                                    <label>Stok Awal</label>
                                    <input type="number" id="item-stock" value="1" min="1" required>
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Harga Sewa / Hari (Rp)</label>
                                <input type="number" id="item-price" placeholder="25000" required>
                            </div>
                            <div class="form-group">
                                <label>Gambar Barang</label>
                                <div class="image-upload-box" id="image-upload-trigger">
                                    <i class="fas fa-cloud-upload-alt"></i>
                                    <p>Klik untuk upload gambar</p>
                                    <img id="preview-img" class="image-preview">
                                    <input type="file" id="item-image-input" style="display: none;" accept="image/*">
                                </div>
                            </div>
                            <button type="submit" class="primary-btn" style="width: 100%; justify-content: center; margin-top: 10px;">
                                <span id="submit-btn-text">Simpan Barang</span>
                            </button>
                        </form>
                    </div>
                </div>
            </div>

            <!-- Modal Kelola Kategori -->
            <div class="modal" id="category-modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Kelola Kategori</h3>
                        <button class="close-modal" data-modal="category-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="cat-list" id="cat-list-items" style="margin-bottom: 20px;">
                            ${this.renderCategories()}
                        </div>
                        <div class="form-group">
                            <label>Tambah Kategori Baru</label>
                            <div style="display: flex; gap: 10px;">
                                <input type="text" id="new-cat-name" placeholder="Nama kategori...">
                                <button class="primary-btn" id="save-cat-btn">Simpan</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    editItem(id) {
        const item = App.currentState.inventory.find(i => i.id === id);
        if (!item) return;

        App.currentState.editMode = { active: true, itemId: id };

        const itemModal = document.getElementById('item-modal');
        if (!itemModal) return;

        document.getElementById('modal-title').innerText = 'Edit Barang';
        document.getElementById('submit-btn-text').innerText = 'Update Barang';

        document.getElementById('item-name').value = item.name;
        document.getElementById('item-category').value = item.category;
        document.getElementById('item-stock').value = item.stock;
        document.getElementById('item-price').value = item.price;

        const previewImg = document.getElementById('preview-img');
        const uploadTrigger = document.getElementById('image-upload-trigger');
        const uploadIcon = uploadTrigger.querySelector('i');
        const uploadText = uploadTrigger.querySelector('p');

        if (item.image) {
            previewImg.src = item.image;
            previewImg.style.display = 'block';
            uploadIcon.style.display = 'none';
            uploadText.style.display = 'none';
            if (!uploadTrigger.querySelector('.change-hint')) {
                const hint = document.createElement('div');
                hint.className = 'change-hint';
                hint.innerHTML = '<i class="fas fa-camera"></i> Ganti Gambar';
                uploadTrigger.appendChild(hint);
            }
        } else {
            previewImg.style.display = 'none';
            uploadIcon.style.display = 'block';
            uploadText.style.display = 'block';
            const hint = uploadTrigger.querySelector('.change-hint');
            if (hint) hint.remove();
        }

        itemModal.classList.add('active');
    },

    deleteItem(id) {
        if (confirm('Apakah Anda yakin ingin menghapus barang ini?')) {
            App.currentState.inventory = App.currentState.inventory.filter(i => i.id !== id);
            localStorage.setItem('avia_inventory', JSON.stringify(App.currentState.inventory));
            App.loadPage('inventory');
        }
    },

    deleteCategory(index) {
        if (confirm('Hapus kategori ini?')) {
            App.currentState.categories.splice(index, 1);
            localStorage.setItem('avia_categories', JSON.stringify(App.currentState.categories));
            App.loadPage('inventory');
            setTimeout(() => {
                document.getElementById('category-modal').classList.add('active');
            }, 600);
        }
    },

    initEvents() {
        const itemModal = document.getElementById('item-modal');
        const catModal = document.getElementById('category-modal');
        const addBtn = document.getElementById('add-item-btn');
        const manageCatsBtn = document.getElementById('manage-cats-btn');
        const closeBtns = document.querySelectorAll('.close-modal');
        const itemForm = document.getElementById('item-form');
        const uploadTrigger = document.getElementById('image-upload-trigger');
        const fileInput = document.getElementById('item-image-input');
        const previewImg = document.getElementById('preview-img');
        const saveCatBtn = document.getElementById('save-cat-btn');

        addBtn?.addEventListener('click', () => {
            App.currentState.editMode = { active: false, itemId: null };
            document.getElementById('modal-title').innerText = 'Tambah Barang Baru';
            document.getElementById('submit-btn-text').innerText = 'Simpan Barang';
            itemForm.reset();
            previewImg.style.display = 'none';
            uploadTrigger.querySelector('i').style.display = 'block';
            uploadTrigger.querySelector('p').style.display = 'block';
            itemModal.classList.add('active');
        });

        manageCatsBtn?.addEventListener('click', () => catModal.classList.add('active'));

        closeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-modal');
                document.getElementById(target).classList.remove('active');
            });
        });

        uploadTrigger?.addEventListener('click', () => fileInput.click());

        fileInput?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    previewImg.src = event.target.result;
                    previewImg.style.display = 'block';
                    uploadTrigger.querySelector('i').style.display = 'none';
                    uploadTrigger.querySelector('p').style.display = 'none';
                };
                reader.readAsDataURL(file);
            }
        });

        itemForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            const itemData = {
                id: App.currentState.editMode.active ? App.currentState.editMode.itemId : Date.now(),
                name: document.getElementById('item-name').value,
                category: document.getElementById('item-category').value,
                stock: parseInt(document.getElementById('item-stock').value),
                price: document.getElementById('item-price').value,
                image: previewImg.src || ''
            };

            if (App.currentState.editMode.active) {
                const index = App.currentState.inventory.findIndex(i => i.id === itemData.id);
                App.currentState.inventory[index] = itemData;
            } else {
                App.currentState.inventory.push(itemData);
            }

            localStorage.setItem('avia_inventory', JSON.stringify(App.currentState.inventory));
            itemModal.classList.remove('active');
            App.loadPage('inventory');
        });

        saveCatBtn?.addEventListener('click', () => {
            const newCat = document.getElementById('new-cat-name').value;
            if (newCat) {
                App.currentState.categories.push(newCat);
                localStorage.setItem('avia_categories', JSON.stringify(App.currentState.categories));
                document.getElementById('new-cat-name').value = '';
                App.loadPage('inventory');
                setTimeout(() => {
                    document.getElementById('category-modal').classList.add('active');
                }, 600);
            }
        });
    }
};
