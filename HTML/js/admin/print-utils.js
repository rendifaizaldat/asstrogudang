// HTML/js/admin/print-utils.js

import { CurrencyFormatter } from "../utils.js";

export class PrintUtils {
  static populateTemplate(
    templateContent,
    data,
    reportType,
    allProducts,
    outletName
  ) {
    if (!templateContent) {
      throw new Error(
        "Template laporan kosong. Harap buat template di menu Settings terlebih dahulu."
      );
    }

    let populated = templateContent.replace(
      /{{tanggal_laporan}}/g,
      new Date().toLocaleDateString("id-ID")
    );

    populated = populated.replace(/{{nama_outlet}}/g, outletName);

    // PERBAIKAN: Menggunakan 'item.total_tagihan' untuk kalkulasi yang benar
    const totalSemuaTagihan = data.reduce(
      (sum, item) => sum + (Number(item.total) || 0),
      0
    );
    populated = populated.replace(
      /{{total_semua_tagihan}}/g,
      CurrencyFormatter.format(totalSemuaTagihan)
    );

    if (reportType === "piutang") {
      const outletTableHTML = this.generateOutletSummaryTable(data);
      const detailedInvoicesHTML = this.generateDetailedInvoices(
        data,
        allProducts
      );

      populated = populated.replace(
        /{{tabel_tagihan_outlet}}/g,
        outletTableHTML
      );
      populated = populated.replace(
        /{{rincian_semua_invoice}}/g,
        detailedInvoicesHTML
      );
    } else if (reportType === "hutang") {
      const vendorTableHTML = this.generateVendorReportTable(data);
      populated = populated.replace(
        /{{tabel_laporan_vendor}}/g,
        vendorTableHTML
      );
    }

    return populated;
  }

  static generateVendorReportTable(payables) {
    const sortedPayables = [...payables].sort((a, b) =>
      a.nama_vendor.localeCompare(b.nama_vendor)
    );

    let htmlRows = "";
    let subtotal = 0;
    let currentVendor = null;

    sortedPayables.forEach((item, index) => {
      if (currentVendor === null) {
        currentVendor = item.nama_vendor;
      }

      if (item.nama_vendor !== currentVendor) {
        const previousItem = sortedPayables[index - 1];
        htmlRows += `
        <tr style="background-color:#f9f9f9;font-weight:bold;">
          <td colspan="2" style="padding:8px;text-align:right;">Subtotal ${currentVendor}</td>
          <td style="padding:8px;text-align:right;">${CurrencyFormatter.format(
            subtotal
          )}</td>
          <td style="padding:8px;">${previousItem.rekening || "-"}</td>
          <td style="padding:8px;">${previousItem.bank || "-"}</td>
          <td style="padding:8px;">${previousItem.atas_nama || "-"}</td>
        </tr>`;
        subtotal = 0;
        currentVendor = item.nama_vendor;
      }

      // PERBAIKAN: Menggunakan 'item.total_tagihan' untuk kalkulasi yang benar
      const amount = Number(item.total) || 0;
      subtotal += amount;

      htmlRows += `
      <tr>
        <td style="padding:6px;">${new Date(
          item.tanggal_nota
        ).toLocaleDateString("id-ID")}</td>
        <td style="padding:6px;">${item.nama_vendor}</td>
        <td style="padding:6px;text-align:right;">${CurrencyFormatter.format(
          amount
        )}</td>
        <td style="padding:6px;"></td>
        <td style="padding:6px;"></td>
        <td style="padding:6px;"></td>
      </tr>
    `;

      if (index === sortedPayables.length - 1) {
        htmlRows += `
        <tr style="background-color:#f9f9f9;font-weight:bold;">
          <td colspan="2" style="padding:8px;text-align:right;">Subtotal ${currentVendor}</td>
          <td style="padding:8px;text-align:right;">${CurrencyFormatter.format(
            subtotal
          )}</td>
          <td style="padding:8px;">${item.rekening || "-"}</td>
          <td style="padding:8px;">${item.bank || "-"}</td>
          <td style="padding:8px;">${item.atas_nama || "-"}</td>
        </tr>`;
      }
    });

    return `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background-color:#f2f2f2;">
          <th style="padding:8px;">Tgl. Nota</th>
          <th style="padding:8px;">Vendor</th>
          <th style="padding:8px;text-align:right;">Total Transaksi</th>
          <th style="padding:8px;">No. Rekening</th>
          <th style="padding:8px;">Bank</th>
          <th style="padding:8px;">Atas Nama</th>
        </tr>
      </thead>
      <tbody>
        ${htmlRows}
      </tbody>
    </table>
  `;
  }

  static generateOutletSummaryTable(invoices) {
    const sortedInvoices = [...invoices].sort((a, b) =>
      a.outlet_name.localeCompare(b.outlet_name)
    );

    let htmlRows = "";
    let subtotal = 0;
    let currentOutlet = null;

    sortedInvoices.forEach((item, index) => {
      if (currentOutlet === null) {
        currentOutlet = item.outlet_name;
      }

      if (item.outlet_name !== currentOutlet) {
        htmlRows += `
          <tr style="background-color:#f9f9f9; font-weight:bold;">
            <td colspan="3" style="border: 1px solid #333; padding: 8px; text-align:right;">Subtotal ${currentOutlet}</td>
            <td style="border: 1px solid #333; padding: 8px; text-align:right;">${CurrencyFormatter.format(
              subtotal
            )}</td>
          </tr>
        `;
        subtotal = 0;
        currentOutlet = item.outlet_name;
      }

      // PERBAIKAN: Menggunakan 'item.total_tagihan' untuk kalkulasi yang benar
      const amount = Number(item.total) || 0;
      subtotal += amount;

      htmlRows += `
        <tr>
          <td style="border: 1px solid #333; padding: 8px;">${new Date(
            item.tanggal_pengiriman
          ).toLocaleDateString("id-ID")}</td>
          <td style="border: 1px solid #333; padding: 8px;">${
            item.invoice_id
          }</td>
          <td style="border: 1px solid #333; padding: 8px;">${
            item.outlet_name
          }</td>
          <td style="border: 1px solid #333; padding: 8px; text-align:right;">${CurrencyFormatter.format(
            amount
          )}</td>
        </tr>
      `;

      if (index === sortedInvoices.length - 1) {
        htmlRows += `
          <tr style="background-color:#f9f9f9; font-weight:bold;">
            <td colspan="3" style="border: 1px solid #333; padding: 8px; text-align:right;">Subtotal ${currentOutlet}</td>
            <td style="border: 1px solid #333; padding: 8px; text-align:right;">${CurrencyFormatter.format(
              subtotal
            )}</td>
          </tr>
        `;
      }
    });

    return `
      <table style="width:100%; border-collapse: collapse; font-size: 12px;">
        <thead>
          <tr style="background-color: #f2f2f2;">
            <th style="border: 1px solid #333; padding: 8px;">Tgl. Kirim</th>
            <th style="border: 1px solid #333; padding: 8px;">Invoice</th>
            <th style="border: 1px solid #333; padding: 8px;">Outlet</th>
            <th style="border: 1px solid #333; padding: 8px; text-align:right;">Total Tagihan</th>
          </tr>
        </thead>
        <tbody>
          ${htmlRows}
        </tbody>
      </table>
    `;
  }

  static generateDetailedInvoices(invoices, allProducts) {
    return invoices
      .map((invoice) => {
        const invoiceTotal = (invoice.transaction_items || []).reduce(
          (sum, item) => sum + (Number(item.subtotal) || 0),
          0
        );
        const itemsTable = `
        <table style="width:100%; border-collapse: collapse; font-size: 12px; margin-top: 5px;">
          <thead>
            <tr style="background-color: #f8f9fa;">
              <th style="border: 1px solid #333; padding: 8px;">Produk</th>
              <th style="border: 1px solid #333; padding: 8px; text-align:center;">Qty</th>
              <th style="border: 1px solid #333; padding: 8px; text-align:center;">Unit</th>
              <th style="border: 1px solid #333; padding: 8px; text-align:right;">Harga</th>
              <th style="border: 1px solid #333; padding: 8px; text-align:right;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${(invoice.transaction_items || [])
              .map((item) => {
                const product = allProducts.find(
                  (p) => p.id === item.product_id
                );
                const productName = product ? product.nama : "Produk Dihapus";
                const productUnit = product ? product.unit : "-";

                return `
                <tr>
                  <td style="border: 1px solid #333; padding: 8px;">${productName}</td>
                  <td style="border: 1px solid #333; padding: 8px; text-align:center;">${
                    item.quantity
                  }</td>
                  <td style="border: 1px solid #333; padding: 8px; text-align:center;">${productUnit}</td>
                  <td style="border: 1px solid #333; padding: 8px; text-align:right;">${CurrencyFormatter.format(
                    item.price_per_unit
                  )}</td>
                  <td style="border: 1px solid #333; padding: 8px; text-align:right;">${CurrencyFormatter.format(
                    item.subtotal
                  )}</td>
                </tr>
              `;
              })
              .join("")}
          </tbody>
        </table>
      `;

        return `
        <div style="margin-top: 25px; padding-top: 15px; border-top: 2px dashed #ccc;">
          <h4 style="margin-bottom: 10px;">Rincian Invoice: ${
            invoice.invoice_id
          }</h4>
          <p style="font-size: 12px; margin-bottom: 10px;">
            <strong>Outlet:</strong> ${invoice.outlet_name} | 
            <strong>Tgl. Kirim:</strong> ${new Date(
              invoice.tanggal_pengiriman
            ).toLocaleDateString("id-ID")} | 
            <strong>Total:</strong> ${CurrencyFormatter.format(invoiceTotal)}
          </p>
          ${itemsTable}
        </div>
      `;
      })
      .join("");
  }

  static printDocument(htmlContent) {
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
          <title>Cetak Laporan</title>
          <style>
            body { font-family: sans-serif; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
          </style>
        </head>
        <body>
          ${htmlContent}
        </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    } else {
      console.error("Gagal membuka jendela cetak.");
    }
  }
}
