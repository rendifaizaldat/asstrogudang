import { CurrencyFormatter } from "../utils.js";

export class ExcelUtils {
  /**
   * Membuat dan mengunduh file Excel untuk laporan Piutang Outlet.
   * @param {Array} invoices - Data invoice yang sudah difilter.
   * @param {string} outletName - Nama outlet yang dipilih ('Semua Outlet' atau spesifik).
   * @param {Array} allProducts - Daftar semua produk untuk mapping nama.
   */
  static exportPiutangToExcel(invoices, outletName, allProducts) {
    const wb = XLSX.utils.book_new();
    const reportDate = new Date().toLocaleDateString("id-ID");

    // --- SHEET 1: RINGKASAN ---
    const summaryHeader = [
      ["Laporan Piutang Outlet"],
      ["Outlet", outletName],
      ["Tanggal Laporan", reportDate],
      [],
    ];
    const tableHeader = [
      "Tgl. Kirim",
      "Invoice",
      "Outlet",
      "Status",
      "Total Tagihan",
      "Catatan",
    ];

    let totalOverall = 0;
    const tableRows = invoices.map((inv) => {
      totalOverall += Number(inv.total) || 0;
      return [
        new Date(inv.tanggal_pengiriman).toLocaleDateString("id-ID"),
        inv.invoice_id,
        inv.outlet_name,
        inv.status || "Belum Lunas",
        Number(inv.total) || 0,
        inv.notes || "",
      ];
    });

    const summaryFooter = [
      [],
      ["", "", "", "Total Keseluruhan:", totalOverall],
    ];

    const ws_summary = XLSX.utils.aoa_to_sheet([
      ...summaryHeader,
      tableHeader,
      ...tableRows,
      ...summaryFooter,
    ]);

    // Styling
    ws_summary["A1"].s = { font: { bold: true, sz: 16 } };
    ws_summary["E" + (tableRows.length + 7)].s = {
      font: { bold: true },
      numFmt: '"Rp"#,##0',
    };
    ws_summary["!cols"] = [
      { wch: 12 },
      { wch: 25 },
      { wch: 20 },
      { wch: 15 },
      { wch: 18 },
      { wch: 40 },
    ];

    XLSX.utils.book_append_sheet(wb, ws_summary, "Ringkasan Piutang");

    // --- SHEET 2: RINCIAN INVOICE ---
    const rincianData = [
      ["Rincian Item per Invoice"],
      ["Tanggal Laporan", reportDate],
      [],
    ];

    invoices.forEach((inv) => {
      const returnedItemsMap = new Map();
      if (inv.return_details) {
        inv.return_details.forEach((item) =>
          returnedItemsMap.set(item.product_id, item.quantity)
        );
      }

      rincianData.push([
        `Invoice: ${inv.invoice_id}`,
        `Outlet: ${inv.outlet_name}`,
        `Total Akhir: ${CurrencyFormatter.format(inv.total)}`,
      ]);
      rincianData.push(["Produk Diterima", "Qty", "Unit", "Harga", "Subtotal"]);

      (inv.transaction_items || []).forEach((item) => {
        const product = allProducts.find((p) => p.id === item.product_id);
        const returnedQty = returnedItemsMap.get(item.product_id) || 0;
        const finalQty = item.quantity - returnedQty;

        rincianData.push([
          product ? product.nama : "Produk Dihapus",
          finalQty,
          product ? product.unit : "-",
          item.price_per_unit,
          finalQty * item.price_per_unit,
        ]);
      });

      if (inv.return_details) {
        rincianData.push(["--- Rincian Retur ---"]);
        rincianData.push(["Produk Diretur", "Qty", "Nilai Retur"]);
        inv.return_details.forEach((ret) => {
          const product = allProducts.find((p) => p.id === ret.product_id);
          rincianData.push([
            product ? product.nama : "Produk Dihapus",
            ret.quantity,
            -ret.subtotal,
          ]);
        });
      }
      rincianData.push([]); // Baris kosong pemisah
    });

    const ws_rincian = XLSX.utils.aoa_to_sheet(rincianData);
    ws_rincian["!cols"] = [
      { wch: 40 },
      { wch: 15 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(wb, ws_rincian, "Rincian Item");

    // Unduh file
    XLSX.writeFile(
      wb,
      `Laporan_Piutang_${outletName.replace(" ", "_")}_${reportDate}.xlsx`
    );
  }

  /**
   * Membuat dan mengunduh file Excel untuk laporan Hutang Vendor.
   * @param {Array} payables - Data hutang yang sudah difilter.
   */
  static exportHutangToExcel(payables) {
    const wb = XLSX.utils.book_new();
    const reportDate = new Date().toLocaleDateString("id-ID");

    const reportHeader = [
      ["Laporan Hutang Vendor"],
      ["Tanggal Laporan", reportDate],
      [],
    ];

    const tableHeader = [
      "Tgl. Nota",
      "Vendor",
      "No. Rekening",
      "Bank",
      "Atas Nama",
      "Status",
      "Total Transaksi",
    ];

    let totalOverall = 0;
    const tableRows = payables.map((item) => {
      totalOverall += Number(item.total) || 0;
      return [
        new Date(item.tanggal_nota).toLocaleDateString("id-ID"),
        item.nama_vendor,
        item.rekening || "-",
        item.bank || "-",
        item.atas_nama || "-",
        item.status || "Belum Lunas",
        Number(item.total) || 0,
      ];
    });

    const summaryFooter = [
      [],
      ["", "", "", "", "", "Total Keseluruhan:", totalOverall],
    ];

    const ws = XLSX.utils.aoa_to_sheet([
      ...reportHeader,
      tableHeader,
      ...tableRows,
      ...summaryFooter,
    ]);

    // Styling
    ws["A1"].s = { font: { bold: true, sz: 16 } };
    ws["G" + (tableRows.length + 6)].s = {
      font: { bold: true },
      numFmt: '"Rp"#,##0',
    };
    ws["!cols"] = [
      { wch: 12 },
      { wch: 25 },
      { wch: 20 },
      { wch: 15 },
      { wch: 20 },
      { wch: 15 },
      { wch: 18 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Laporan Hutang");
    XLSX.writeFile(wb, `Laporan_Hutang_Vendor_${reportDate}.xlsx`);
  }
}
