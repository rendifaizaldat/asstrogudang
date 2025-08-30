import { AppConfig } from "./config.js";
import { Logger, UIUtils, CurrencyFormatter, StorageUtils } from "./utils.js";

// Logika asli untuk menampilkan satu struk/invoice dari localStorage
class StrukController {
  constructor() {
    this.data = this.loadDataFromStorage();
    if (this.data) {
      this.render();
      this.setupEventListeners();
    } else {
      this.renderError();
    }
  }

  loadDataFromStorage() {
    const urlParams = new URLSearchParams(window.location.search);
    const isReprint = urlParams.get("reprint") === "true";
    let rawData;

    if (isReprint) {
      rawData = JSON.parse(localStorage.getItem("reprint_transaction_data"));
      localStorage.removeItem("reprint_transaction_data"); // Hapus setelah dibaca
    } else {
      // Logika fallback jika halaman ini diakses langsung
      return null;
    }

    if (!rawData) return null;

    // Memformat data agar konsisten
    return {
      outlet_name: rawData.outlet_name,
      invoice_id: rawData.invoice_id,
      tanggal_pengiriman: rawData.tanggal_pengiriman,
      items: rawData.transaction_items.map((item) => ({
        nama: item.products ? item.products.nama : "N/A",
        unit: item.products ? item.products.unit : "pcs",
        qty: item.quantity,
        harga_jual: item.price_per_unit,
      })),
      total: rawData.total_tagihan,
    };
  }

  render() {
    document.getElementById(
      "invoiceTimestamp"
    ).textContent = `${new Date().toLocaleString("id-ID")} | ${
      this.data.invoice_id
    }`;
    document.getElementById(
      "infoOutlet"
    ).innerHTML = `<strong>Ditagihkan Kepada:</strong><br>${
      this.data.outlet_name
    }<br><strong>Tanggal Kirim:</strong> ${new Date(
      this.data.tanggal_pengiriman
    ).toLocaleDateString("id-ID")}`;

    const tbody = document.getElementById("invoiceBody");
    tbody.innerHTML = this.data.items
      .map((item) => {
        const itemTotal = (item.harga_jual || 0) * (item.qty || 0);
        return `
                <tr>
                    <td>
                        <div class="fw-bold">${item.nama}</div>
                        <small class="text-muted">${CurrencyFormatter.format(
                          item.harga_jual || 0
                        )} / ${item.unit}</small>
                    </td>
                    <td class="text-center align-middle">${item.qty}</td>
                    <td class="text-end align-middle fw-bold">${CurrencyFormatter.format(
                      itemTotal
                    )}</td>
                </tr>`;
      })
      .join("");

    document.getElementById("totalHarga").textContent =
      CurrencyFormatter.format(this.data.total);
  }

  renderError() {
    document.getElementById("invoice-wrapper").innerHTML = `
            <div class="text-center p-5 card glass-card">
                <i class="bi bi-file-earmark-x" style="font-size: 5rem;"></i>
                <h3 class="mt-3">Data Cetak Tidak Ditemukan</h3>
                <p class="text-muted">Data untuk mencetak invoice ini tidak tersedia. Silakan coba lagi dari halaman riwayat tagihan.</p>
                <a href="katalog.html" class="btn btn-primary mt-2">Kembali ke Katalog</a>
            </div>`;
  }

  setupEventListeners() {
    document
      .getElementById("downloadPdfBtn")
      ?.addEventListener("click", () => this.downloadAs("pdf"));
  }

  async downloadAs(format) {
    const button = document.getElementById("downloadPdfBtn");
    UIUtils.setLoadingState(button, true, `Membuat PDF...`);
    try {
      const invoiceEl = document.getElementById("invoice-container");
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({
        unit: "pt",
        format: "a4",
        orientation: "portrait",
      });
      await doc.html(invoiceEl, {
        callback: (doc) => doc.save(`invoice_${this.data.invoice_id}.pdf`),
        margin: [40, 30, 40, 30],
        autoPaging: "text",
        width: 535,
        windowWidth: 1000,
      });
    } catch (e) {
      UIUtils.createToast("error", "Gagal mengunduh PDF.");
    } finally {
      UIUtils.setLoadingState(button, false);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new StrukController();
});
