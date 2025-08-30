import { AppConfig } from "./config.js";
import {
  Logger,
  UIUtils,
  CurrencyFormatter,
  APIClient,
  StorageUtils,
} from "./utils.js";

class InvoiceHistoryController {
  constructor() {
    this.elements = {
      container: document.getElementById("invoice-list-container"),
      loader: document.getElementById("loader"),
    };
    this.invoices = [];
    this.init();
  }
  handleReprint(invoiceId) {
    const invoiceData = this.invoices.find((inv) => inv.id == invoiceId);
    if (!invoiceData) {
      UIUtils.createToast(
        "error",
        "Data invoice untuk dicetak tidak ditemukan."
      );
      return;
    }

    // Simpan data ke localStorage agar bisa dibaca oleh halaman invoice
    localStorage.setItem(
      "reprint_transaction_data",
      JSON.stringify(invoiceData)
    );

    // Buka halaman invoice di tab baru dengan parameter reprint
    const reprintUrl = `struk.html?reprint=true`;
    window.open(reprintUrl, "_blank");
  }

  handleExportToExcel(invoiceId) {
    const invoiceData = this.invoices.find((inv) => inv.id == invoiceId);
    if (!invoiceData) {
      UIUtils.createToast(
        "error",
        "Data invoice untuk diekspor tidak ditemukan."
      );
      return;
    }

    // 1. Siapkan Data untuk Excel
    // Header Laporan
    const reportHeader = [
      ["INVOICE:", invoiceData.invoice_id],
      [
        "Tanggal Kirim:",
        new Date(invoiceData.tanggal_pengiriman).toLocaleDateString("id-ID"),
      ],
      ["Total Tagihan:", invoiceData.total_tagihan],
      ["Status:", invoiceData.status || "Belum Lunas"],
    ];

    // Header Tabel Item
    const itemHeader = [
      "Nama Produk",
      "Qty",
      "Unit",
      "Harga Satuan",
      "Subtotal",
    ];

    // Baris Data Item
    const itemRows = invoiceData.transaction_items.map((item) => [
      item.products ? item.products.nama : "N/A",
      item.quantity,
      item.products ? item.products.unit : "N/A",
      item.price_per_unit,
      item.subtotal,
    ]);

    // 2. Buat Worksheet menggunakan SheetJS
    const ws = XLSX.utils.aoa_to_sheet([
      ...reportHeader,
      [], // Baris kosong sebagai pemisah
      itemHeader,
      ...itemRows,
    ]);

    // 3. Atur Lebar Kolom (Opsional tapi membuat rapi)
    ws["!cols"] = [
      { wch: 40 }, // Lebar kolom A (Nama Produk)
      { wch: 10 }, // Lebar kolom B (Qty)
      { wch: 10 }, // Lebar kolom C (Unit)
      { wch: 20 }, // Lebar kolom D (Harga Satuan)
      { wch: 20 }, // Lebar kolom E (Subtotal)
    ];

    // Format sel angka agar menjadi tipe Number di Excel
    // Mulai dari baris ke-7 (setelah header laporan dan header tabel)
    for (let i = 0; i < itemRows.length; i++) {
      const rowIndex = 6 + i; // Index di sheet (dimulai dari 0)
      // Kolom B (Qty), D (Harga), E (Subtotal)
      ws[`B${rowIndex + 1}`].t = "n";
      ws[`D${rowIndex + 1}`].t = "n";
      ws[`E${rowIndex + 1}`].t = "n";
    }
    // Format sel total tagihan
    ws["B3"].t = "n";
    ws["B3"].z = '"Rp"#,##0'; // Format mata uang

    // 4. Buat Workbook dan Unduh File
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rincian Invoice"); // Nama sheet di Excel

    XLSX.writeFile(wb, `${invoiceData.invoice_id}.xlsx`); // Nama file .xlsx
  }
  async init() {
    if (!this.checkAuth()) return;

    try {
      const { data, error } = await APIClient.get("get-user-data");
      if (error) throw error;

      this.invoices = (data.receivables || []).sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );
      this.render();
      this.elements.container.addEventListener("click", (e) => {
        const reprintBtn = e.target.closest(".btn-reprint-invoice");
        if (reprintBtn) {
          this.handleReprint(reprintBtn.dataset.invoiceId);
          return;
        }

        const exportBtn = e.target.closest(".btn-export-excel");
        if (exportBtn) {
          this.handleExportToExcel(exportBtn.dataset.invoiceId);
          return;
        }
      });
    } catch (error) {
      Logger.error("Failed to load invoice history", error);
      this.renderError("Gagal memuat riwayat tagihan. Silakan coba lagi.");
    }
  }

  checkAuth() {
    const session = StorageUtils.getItem(AppConfig.STORAGE_KEYS.USER);
    if (!session || !session.user || !session.user.email) {
      this.renderError("Sesi Anda tidak valid. Silakan login kembali.");
      setTimeout(() => {
        window.location.href = AppConfig.ROUTES.LOGIN;
      }, 3000);
      return false;
    }
    return true;
  }

  render() {
    if (this.elements.loader) {
      this.elements.loader.style.display = "none";
    }

    if (this.invoices.length === 0) {
      this.renderEmpty();
      return;
    }

    const accordionHTML = this.invoices
      .map((invoice, index) => this.createInvoiceAccordionItem(invoice, index))
      .join("");
    this.elements.container.innerHTML = `
            <div class="accordion" id="invoiceAccordion">
                ${accordionHTML}
            </div>
        `;
  }

  createInvoiceAccordionItem(invoice, index) {
    const isLunas = (invoice.status || "Belum Lunas").toLowerCase() === "lunas";
    const statusBadge = `<span class="badge ${
      isLunas ? "bg-success" : "bg-warning"
    }">${invoice.status || "Belum Lunas"}</span>`;

    return `
            <div class="accordion-item glass-card mb-3">
                <h2 class="accordion-header" id="heading${index}">
                    <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapse${index}" aria-expanded="false" aria-controls="collapse${index}">
                        <div class="w-100 d-flex justify-content-between align-items-center pe-3">
    <div class="fw-bold">${invoice.invoice_id}</div>
    <div class="text-muted small d-none d-md-block">${new Date(
      invoice.tanggal_pengiriman
    ).toLocaleDateString("id-ID")}</div>
    <div class="fw-bold text-primary">${CurrencyFormatter.format(
      invoice.total_tagihan
    )}</div>

    <div class="d-flex align-items-center gap-2">
        ${statusBadge}
        <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary btn-reprint-invoice" title="Cetak Ulang Nota" data-invoice-id="${
              invoice.id
            }">
                <i class="bi bi-printer"></i>
            </button>
            <button class="btn btn-outline-success btn-export-excel" title="Export ke Excel" data-invoice-id="${
              invoice.id
            }">
                <i class="bi bi-file-earmark-excel"></i>
            </button>
        </div>
    </div>
</div>
                    </button>
                </h2>
                <div id="collapse${index}" class="accordion-collapse collapse" aria-labelledby="heading${index}" data-bs-parent="#invoiceAccordion">
                    <div class="accordion-body">
                       ${
                         invoice.transaction_items &&
                         invoice.transaction_items.length > 0
                           ? `
    <table class="table table-sm table-borderless">
        <thead>
            <tr>
                <th>Produk</th>
                <th class="text-center">Qty</th>
                <th class="text-end">Harga Satuan</th>
                <th class="text-end">Subtotal</th>
            </tr>
        </thead>
        <tbody>
            ${invoice.transaction_items
              .map(
                (item) => `
                <tr>
                    <td>${
                      item.products ? item.products.nama : "Produk Dihapus"
                    }</td>
                    <td class="text-center">${item.quantity} ${
                  item.products ? item.products.unit : ""
                }</td>
                    <td class="text-end">${CurrencyFormatter.format(
                      item.price_per_unit
                    )}</td>
                    <td class="text-end fw-bold">${CurrencyFormatter.format(
                      item.subtotal
                    )}</td>
                </tr>
            `
              )
              .join("")}
        </tbody>
    </table>
    `
                           : '<p class="text-muted fst-italic">Tidak ada data rincian item untuk transaksi ini.</p>'
                       }
                       </div>
                </div>
            </div>
        `;
  }

  renderEmpty() {
    this.elements.container.innerHTML = `
            <div class="text-center p-5 card glass-card">
                <i class="bi bi-inbox" style="font-size: 5rem; color: var(--secondary);"></i>
                <h3 class="mt-3">Belum Ada Tagihan</h3>
                <p class="text-muted">Riwayat transaksi Anda akan muncul di sini setelah Anda melakukan pemesanan.</p>
            </div>`;
  }

  renderError(message) {
    if (this.elements.loader) {
      this.elements.loader.style.display = "none";
    }
    this.elements.container.innerHTML = `
             <div class="text-center p-5 card glass-card">
                <i class="bi bi-exclamation-triangle" style="font-size: 5rem; color: var(--danger);"></i>
                <h3 class="mt-3">Terjadi Kesalahan</h3>
                <p class="text-muted">${message}</p>
            </div>`;
  }
}

// Initialize controller
document.addEventListener("DOMContentLoaded", () => {
  new InvoiceHistoryController();
});
