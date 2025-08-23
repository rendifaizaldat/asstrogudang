class VendorManagementManager {
  constructor(renderer) {
    this.renderer = renderer;
  }

  renderVendorsTable() {
    this.renderer.renderVendorsTable();
  }

  renderVendorOptions(vendors) {
    this.renderer.renderVendorOptions(vendors);
  }

  showVendorModal(vendor = null) {
    const modalEl = document.getElementById("vendorModal");
    const modalTitle = document.getElementById("vendorModalLabel");
    const form = document.getElementById("vendorForm");
    form.reset();

    if (vendor) {
      modalTitle.textContent = "Edit Vendor";
      document.getElementById("vendorId").value = vendor.id;
      document.getElementById("vendorNama").value = vendor.nama_vendor;
      document.getElementById("vendorBank").value = vendor.bank || "";
      document.getElementById("vendorRekening").value = vendor.rekening || "";
      document.getElementById("vendorAtasNama").value = vendor.atas_nama || "";
    } else {
      modalTitle.textContent = "Tambah Vendor Baru";
      document.getElementById("vendorId").value = "";
    }

    const modal = new bootstrap.Modal(modalEl);
    modal.show();
  }
}

export { VendorManagementManager };
