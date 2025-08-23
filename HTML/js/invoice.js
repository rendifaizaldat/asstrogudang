import { AppConfig } from "./config.js";
import { Logger, UIUtils, CurrencyFormatter, StorageUtils } from "./utils.js";

class InvoiceData {
  constructor() {
    this.user = null;
    this.transactionItems = [];
    this.transactionDate = null;
    this.invoiceNumber = null;
    this.total = 0;
  }

  loadFromStorage() {
    const urlParams = new URLSearchParams(window.location.search);
    const isReprint = urlParams.get("reprint") === "true";

    if (isReprint) {
      const reprintData = JSON.parse(
        localStorage.getItem("reprint_transaction_data")
      );
      if (reprintData) {
        this.user = { outlet: reprintData.outlet_name };
        this.transactionItems = reprintData.transaction_items.map((item) => ({
          ...item.products,
          qty: item.quantity,
          harga_jual: item.price_per_unit,
        }));
        this.transactionDate = reprintData.tanggal_pengiriman;
        localStorage.removeItem("reprint_transaction_data");
      }
    } else {
      this.user = StorageUtils.getItem(AppConfig.STORAGE_KEYS.USER_FOR_INVOICE);
      if (!this.user) {
        const session = StorageUtils.getItem(AppConfig.STORAGE_KEYS.USER);
        if (session && session.custom_profile) {
          this.user = session.custom_profile;
        }
      }
      this.transactionItems = StorageUtils.getItem(
        AppConfig.STORAGE_KEYS.LAST_TRANSACTION,
        []
      );
      this.transactionDate = StorageUtils.getItem(
        AppConfig.STORAGE_KEYS.LAST_TRANSACTION_DATE
      );
    }

    if (this.isValid()) {
      this.generateInvoiceNumber();
      this.calculateTotal();
      return true;
    }
    return false;
  }

  // --- PERBAIKAN: Fungsi isValid() dipindahkan ke dalam kelas ---
  isValid() {
    return (
      this.user && this.transactionItems && this.transactionItems.length > 0
    );
  }

  generateInvoiceNumber() {
    const timestamp = Date.now().toString();
    const outletCode = (this.user?.outlet || "OUTLET")
      .substring(0, 3)
      .toUpperCase();
    this.invoiceNumber = `INV-${outletCode}-${timestamp.slice(-8)}`;
  }

  calculateTotal() {
    this.total = this.transactionItems.reduce((sum, item) => {
      const itemTotal = (item.harga_jual || 0) * (item.qty || 0);
      return sum + itemTotal;
    }, 0);
  }

  getFormattedDate() {
    if (!this.transactionDate) return new Date().toLocaleDateString("id-ID");
    return new Date(this.transactionDate).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }

  getTimestamp() {
    return new Date().toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}

class InvoiceRenderer {
  constructor(data) {
    this.data = data;
  }

  render() {
    const wrapper = document.getElementById("invoice-wrapper");
    if (!this.data.isValid()) {
      this.renderErrorState(wrapper);
      return;
    }
    this.renderInvoice();
  }

  renderErrorState(wrapper) {
    wrapper.innerHTML = `
      <div class="text-center p-5 card glass-card">
        <i class="bi bi-file-earmark-x" style="font-size: 5rem; color: var(--secondary);"></i>
        <h3 class="mt-3">Data Invoice Tidak Ditemukan</h3>
        <p class="text-muted">Tidak ada data transaksi terakhir. Silakan lakukan pemesanan atau coba lagi.</p>
        <div class="d-grid gap-2 mt-4" style="max-width: 300px; margin: 0 auto;">
          <a href="${AppConfig.ROUTES.CATALOG}" class="btn btn-primary"><i class="bi bi-arrow-left me-2"></i>Kembali ke Katalog</a>
        </div>
      </div>`;
  }

  renderInvoice() {
    document.getElementById(
      "invoiceTimestamp"
    ).textContent = `${this.data.getTimestamp()} | ${this.data.invoiceNumber}`;
    document.getElementById("infoOutlet").innerHTML = `
      <strong>Ditagihkan Kepada:</strong><br>
      ${this.data.user.outlet || "-"}<br>
      <strong>Tanggal Kirim:</strong> ${this.data.getFormattedDate()}`;

    const tbody = document.getElementById("invoiceBody");
    tbody.innerHTML = this.data.transactionItems
      .map((item) => {
        const itemTotal = (item.harga_jual || 0) * (item.qty || 0);
        return `
          <tr>
            <td>
              <div class="fw-bold">${item.nama || "Unknown Item"}</div>
              <small class="text-muted">${CurrencyFormatter.format(
                item.harga_jual || 0
              )} / ${item.unit || "pcs"}</small>
            </td>
            <td class="text-center align-middle">${item.qty || 0}</td>
            <td class="text-end align-middle fw-bold">${CurrencyFormatter.format(
              itemTotal
            )}</td>
          </tr>`;
      })
      .join("");

    document.getElementById("totalHarga").textContent =
      CurrencyFormatter.format(this.data.total);
  }
}

class InvoiceDownloader {
  constructor(data) {
    this.data = data;
    this.isDownloading = false;
  }

  async downloadAs(format) {
    if (this.isDownloading) return;
    this.isDownloading = true;

    const buttonId = format === "pdf" ? "downloadPdfBtn" : "downloadJpgBtn";
    const button = document.getElementById(buttonId);
    UIUtils.setLoadingState(button, true, `Membuat ${format.toUpperCase()}...`);

    try {
      const invoiceEl = document.getElementById("invoice-container");
      if (!invoiceEl) throw new Error("Elemen invoice tidak ditemukan.");

      if (format === "pdf") {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
          unit: "pt",
          format: "a4",
          orientation: "portrait",
        });
        await doc.html(invoiceEl, {
          callback: (doc) => doc.save(this.generateFileName("pdf")),
          margin: [40, 30, 40, 30],
          autoPaging: "text",
          width: 535,
          windowWidth: 1000,
        });
      } else {
        // JPG
        const canvas = await html2canvas(invoiceEl, {
          scale: 3,
          useCORS: true,
        });
        const link = document.createElement("a");
        link.download = this.generateFileName("jpg");
        link.href = canvas.toDataURL("image/jpeg", 0.9);
        link.click();
      }
      UIUtils.createToast(
        "success",
        `Invoice (${format.toUpperCase()}) berhasil diunduh.`
      );
    } catch (error) {
      Logger.error(`Download ${format.toUpperCase()} failed`, error);
      UIUtils.createToast("error", `Gagal mengunduh: ${error.message}`);
    } finally {
      this.isDownloading = false;
      UIUtils.setLoadingState(button, false);
    }
  }

  generateFileName(extension) {
    const outlet = (this.data.user.outlet || "outlet").replace(/\s/g, "_");
    const date = new Date().toISOString().slice(0, 10);
    return `invoice_${outlet}_${date}.${extension}`;
  }
}

class InvoiceController {
  constructor() {
    this.data = new InvoiceData();
    this.renderer = null;
    this.downloader = null;
  }

  init() {
    if (this.data.loadFromStorage()) {
      this.renderer = new InvoiceRenderer(this.data);
      this.downloader = new InvoiceDownloader(this.data);

      this.renderer.render();
      this.setupEventListeners();
      Logger.info("Invoice controller initialized successfully.");
    } else {
      this.renderer = new InvoiceRenderer(this.data);
      this.renderer.render(); // Ini akan memanggil renderErrorState
      Logger.warn("Invoice initialization failed: No valid data.");
    }
  }

  setupEventListeners() {
    document
      .getElementById("downloadPdfBtn")
      ?.addEventListener("click", () => this.downloader.downloadAs("pdf"));
    document
      .getElementById("downloadJpgBtn")
      ?.addEventListener("click", () => this.downloader.downloadAs("jpg"));

    // Setup print on Ctrl+P
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        window.print();
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const app = new InvoiceController();
  app.init();
});
