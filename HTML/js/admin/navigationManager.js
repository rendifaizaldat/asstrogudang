class AdminNavigationManager {
  constructor() {}

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
      const tab = new bootstrap.Tab(navButton);
      tab.show();
    } else {
      console.error("Gagal menemukan tombol navigasi untuk target:", tabId);
    }
  }
}

export { AdminNavigationManager };
