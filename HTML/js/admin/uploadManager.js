/**
 * @file uploadManager.js
 * @description Modul untuk mengelola semua fungsionalitas unggah file.
 * Mengisolasi logika untuk modal upload, pengiriman form, dan pembaruan state.
 */

// Mengimpor utilitas yang diperlukan dari file lain
import { UIUtils, APIClient } from "../utils.js";

/**
 * @class AdminUploadManager
 * @description Mengelola proses upload bukti transfer, termasuk interaksi
 * dengan modal UI dan komunikasi dengan API.
 */
class AdminUploadManager {
  /**
   * @param {AdminState} state - Instance dari state manager aplikasi.
   * @param {AdminRenderer} renderer - Instance dari renderer aplikasi untuk menampilkan notifikasi.
   */
  constructor(state, renderer) {
    this.state = state;
    this.renderer = renderer; // Renderer diperlukan untuk menampilkan toast error yang lebih informatif
    this.currentUploadData = null; // Menyimpan data (id, type) dari item yang akan diunggah
    this.setupUploadModal();
  }

  /**
   * Menyiapkan event listener untuk modal upload.
   * Metode ini dipanggil sekali saat kelas diinisialisasi.
   */
  setupUploadModal() {
    const uploadForm = document.getElementById("uploadForm");
    if (uploadForm) {
      // Menggunakan .bind(this) untuk memastikan 'this' di dalam handleUploadSubmit
      // merujuk ke instance kelas AdminUploadManager.
      uploadForm.addEventListener("submit", this.handleUploadSubmit.bind(this));
    }

    const uploadModal = document.getElementById("uploadModal");
    if (uploadModal) {
      // Event listener ini berjalan setiap kali modal akan ditampilkan.
      uploadModal.addEventListener("show.bs.modal", (event) => {
        const button = event.relatedTarget; // Tombol yang memicu modal
        if (button) {
          // Simpan data dari tombol ke properti kelas
          this.currentUploadData = {
            id: button.dataset.id,
            type: button.dataset.type,
          };

          // Update judul modal agar lebih informatif
          const modalTitle = uploadModal.querySelector(".modal-title");
          const dataKey =
            this.currentUploadData.type === "piutang" ? "piutang" : "hutang";
          const item = this.state
            .getData(dataKey)
            .find((d) => d.id == this.currentUploadData.id);
          const displayId = item
            ? item.invoice_id || item.no_nota_vendor
            : this.currentUploadData.id;
          modalTitle.textContent = `Unggah Bukti untuk ${displayId}`;
        }
      });
    }
  }

  /**
   * Menangani event submit dari form upload.
   * @param {Event} event - Objek event dari form submission.
   */
  async handleUploadSubmit(event) {
    event.preventDefault(); // Mencegah reload halaman
    const form = event.target;
    const fileInput = form.querySelector('input[type="file"]');
    const submitBtn = form.querySelector('button[type="submit"]');

    if (fileInput.files.length === 0) {
      UIUtils.createToast("warning", "Silakan pilih file untuk diunggah.");
      return;
    }

    const formData = new FormData();
    formData.append("file", fileInput.files[0]);
    formData.append("id", this.currentUploadData.id);
    formData.append("type", this.currentUploadData.type);

    UIUtils.setLoadingState(submitBtn, true, "Mengunggah...");
    try {
      // Memanggil API untuk mengunggah file
      const { data, error } = await APIClient.post("manage-proofs", formData);
      if (error) throw error;

      // Jika berhasil, perbarui state lokal
      this.state.updateItemBuktiTransfer(
        this.currentUploadData.type,
        this.currentUploadData.id,
        data.url
      );
      this.state.updateItemStatus(
        this.currentUploadData.type,
        this.currentUploadData.id,
        data.newStatus
      );

      UIUtils.createToast(
        "success",
        "Bukti diunggah & status diubah menjadi Lunas."
      );
      bootstrap.Modal.getInstance(form.closest(".modal")).hide();
      form.reset();

      // Memicu render ulang tabel yang relevan
      if (this.currentUploadData.type === "piutang") {
        this.renderer.renderPiutangTable();
      } else if (this.currentUploadData.type === "hutang") {
        this.renderer.renderHutangTable();
      }
    } catch (err) {
      // Gunakan renderer untuk menampilkan toast error yang lebih baik
      UIUtils.createToast(
        "error",
        err?.message || "Terjadi kesalahan di Upload Data."
      );
    } finally {
      UIUtils.setLoadingState(submitBtn, false);
    }
  }
}

// Ekspor kelas agar bisa diimpor di file lain (app.js)
export { AdminUploadManager };
