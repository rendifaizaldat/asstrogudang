class AdminModalManager {
  constructor(state) {
    this.state = state;
    this.currentEditIndex = null;
    this.initializeModals();
  }

  initializeModals() {
    this.createEditBarangMasukModal();
  }

  createEditBarangMasukModal() {
    const existingModal = document.getElementById("editBarangMasukModal");
    if (existingModal) return;

    const modalHTML = `
      <div class="modal fade" id="editBarangMasukModal" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">
                <i class="bi bi-pencil me-2"></i>Edit Barang Masuk
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <form id="editBarangMasukForm">
                <div class="mb-3">
                  <label for="editNamaBarang" class="form-label">Nama Barang</label>
                  <input type="text" class="form-control" id="editNamaBarang" readonly>
                </div>
                <div class="row">
                  <div class="col-6">
                    <label for="editQty" class="form-label">Quantity</label>
                    <input type="number" class="form-control" id="editQty" min="1" required>
                  </div>
                  <div class="col-6">
                    <label for="editHarga" class="form-label">Harga per Unit</label>
                    <input type="number" class="form-control" id="editHarga" min="1" required>
                  </div>
                </div>
                <div class="mt-3">
                  <strong>Total: <span id="editTotal">Rp 0</span></strong>
                </div>
              </form>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Batal</button>
              <button type="submit" form="editBarangMasukForm" class="btn btn-primary" id="saveEditBtn">
                <i class="bi bi-check me-1"></i>Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHTML);
    this.setupEditModalListeners();
  }

  setupEditModalListeners() {
    const editForm = document.getElementById("editBarangMasukForm");
    const editQty = document.getElementById("editQty");
    const editHarga = document.getElementById("editHarga");
    const editTotal = document.getElementById("editTotal");

    const updateTotal = () => {
      const qty = Number(editQty.value) || 0;
      const harga = Number(editHarga.value) || 0;
      const total = qty * harga;
      editTotal.textContent = `Rp ${total.toLocaleString("id-ID")}`;
    };

    editQty.addEventListener("input", updateTotal);
    editHarga.addEventListener("input", updateTotal);

    editForm.addEventListener("submit", (e) => {
      e.preventDefault();
      this.saveEdit();
    });
  }

  showEditModal(index) {
    const barangMasukList = this.state.getData("barangMasukList");
    const item = barangMasukList[index];
    if (!item) return;

    this.currentEditIndex = index;
    document.getElementById("editNamaBarang").value = item.nama_barang;
    document.getElementById("editQty").value = item.qty;
    document.getElementById("editHarga").value = item.harga;

    const total = item.qty * item.harga;
    document.getElementById(
      "editTotal"
    ).textContent = `Rp ${total.toLocaleString("id-ID")}`;

    const modal = new bootstrap.Modal(
      document.getElementById("editBarangMasukModal")
    );
    modal.show();
  }

  saveEdit() {
    if (this.currentEditIndex === null) return;

    const qty = Number(document.getElementById("editQty").value);
    const harga = Number(document.getElementById("editHarga").value);

    if (!qty || !harga) return;

    const updates = { qty, harga };
    this.state.updateBarangMasuk(this.currentEditIndex, updates);

    const modal = bootstrap.Modal.getInstance(
      document.getElementById("editBarangMasukModal")
    );
    modal.hide();
    this.currentEditIndex = null;
  }
}

export { AdminModalManager };
