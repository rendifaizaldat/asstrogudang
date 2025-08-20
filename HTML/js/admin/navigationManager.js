/**
 * @file navigationManager.js
 * @description Modul untuk mengelola navigasi antar tab di panel admin.
 * Memungkinkan navigasi programatik dari berbagai bagian UI.
 */

/**
 * @class AdminNavigationManager
 * @description Mengelola logika untuk berpindah antar tab secara dinamis,
 * misalnya saat mengklik tombol aksi pada kartu peringatan.
 */
class AdminNavigationManager {
  constructor() {
    // Konstruktor tidak memerlukan parameter karena kelas ini
    // berinteraksi langsung dengan DOM dan tidak bergantung pada state atau renderer.
  }

  /**
   * Menyiapkan event listener global untuk menangani klik pada elemen navigasi.
   * Metode ini harus dipanggil sekali saat aplikasi diinisialisasi.
   */
  setupNavigation() {
    // Menambahkan satu event listener ke body untuk menangani semua klik (event delegation)
    document.addEventListener("click", (e) => {
      // Cek apakah elemen yang diklik atau parent-nya adalah tombol aksi alert
      const alertButton = e.target.closest(".alert-action-btn");
      if (alertButton) {
        e.preventDefault(); // Mencegah perilaku default dari tag <a>
        const targetTabId = alertButton.getAttribute("href");
        if (targetTabId) {
          this.navigateToTab(targetTabId);
        }
      }
    });
  }

  /**
   * Berpindah ke tab yang ditentukan secara programatik menggunakan Bootstrap.
   * @param {string} tabId - ID dari target tab (contoh: "#piutang-outlet").
   */
  navigateToTab(tabId) {
    // Cari tombol di dalam navigasi yang memiliki atribut data-bs-target sesuai dengan tabId
    const navButton = document.querySelector(
      `button[data-bs-target="${tabId}"]`
    );

    if (navButton) {
      // Buat instance baru dari Bootstrap Tab dan panggil metode show()
      const tab = new bootstrap.Tab(navButton);
      tab.show();
    } else {
      // Log error jika tombol navigasi tidak ditemukan
      console.error("Gagal menemukan tombol navigasi untuk target:", tabId);
    }
  }
}

// Ekspor kelas agar bisa diimpor di file lain (app.js)
export { AdminNavigationManager };
