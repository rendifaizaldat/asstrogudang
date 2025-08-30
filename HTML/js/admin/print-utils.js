// Ganti seluruh isi file print-utils.js dengan kode ini

import { CurrencyFormatter } from "../utils.js";

export class PrintUtils {
  static populateTemplate(
    templateContent,
    data,
    reportType,
    allProducts, // Parameter ini sudah benar dikirim dari app.js
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

    const totalSemuaTagihan = data.reduce(
      (sum, item) => sum + (Number(item.total) || 0),
      0
    );
    populated = populated.replace(
      /{{total_semua_tagihan}}/g,
      CurrencyFormatter.format(totalSemuaTagihan)
    );

    if (reportType === "piutang") {
      // V V V PERUBAHAN DI SINI V V V
      // Sekarang kita meneruskan 'allProducts' ke generateOutletSummaryTable
      const outletTableHTML = this.generateOutletSummaryTable(
        data,
        allProducts,
        outletName
      );
      const detailedInvoicesHTML = this.generateDetailedInvoices(
        data,
        allProducts
      );
      // ^ ^ ^ AKHIR PERUBAHAN ^ ^ ^

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

  // Ganti fungsi generateOutletSummaryTable yang lama dengan yang ini
  static generateOutletSummaryTable(invoices, allProducts, outletName) {
    // Tambahkan outletName sebagai parameter
    const sortedInvoices = [...invoices].sort((a, b) =>
      a.outlet_name.localeCompare(b.outlet_name)
    );

    let htmlRows = "";
    let subtotal = 0;
    let currentOutlet = null;
    let totalOverall = 0;

    const allReturnedItems = {};
    invoices.forEach((invoice) => {
      if (invoice.return_details && invoice.return_details.length > 0) {
        invoice.return_details.forEach((returnedItem) => {
          const product = allProducts.find(
            (p) => p.id === returnedItem.product_id
          );
          const productName = product ? product.nama : "Produk Dihapus";

          if (!allReturnedItems[returnedItem.product_id]) {
            allReturnedItems[returnedItem.product_id] = {
              name: productName,
              details: [], // Ubah menjadi array untuk menyimpan detail per outlet
            };
          }
          allReturnedItems[returnedItem.product_id].details.push({
            outlet: returnedItem.outlet_name, // Simpan nama outlet
            qty: returnedItem.quantity,
            value: returnedItem.subtotal,
          });
        });
      }
    });

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
        totalOverall += subtotal;
        subtotal = 0;
        currentOutlet = item.outlet_name;
      }

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
          <td style="border: 1px solid #333; padding: 8px; text-align:right;">
            ${CurrencyFormatter.format(amount)}
            ${
              item.notes
                ? `<br><small style="color:red;font-style:italic;white-space:pre-wrap;">(${item.notes})</small>`
                : ""
            }
          </td>
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
        totalOverall += subtotal;
      }
    });

    // --- V V V BLOK PERUBAHAN LOGIKA TABEL RETUR V V V ---
    let returnedItemsSummaryTable = "";
    const isAllOutletsReport = outletName === "Semua Outlet";
    const returnedProducts = Object.values(allReturnedItems);

    if (returnedProducts.length > 0) {
      returnedItemsSummaryTable = `
            <h4 style="margin-top: 25px; margin-bottom: 10px; font-size: 14px;">Ringkasan Retur</h4>
            <table style="width:100%; border-collapse: collapse; font-size: 12px;">
                <thead>
                    <tr style="background-color: #ffe0e0;">
                        <th style="border: 1px solid #333; padding: 8px; color: #d9534f;">Produk Diretur</th>
                        ${
                          isAllOutletsReport
                            ? '<th style="border: 1px solid #333; padding: 8px; color: #d9534f;">Outlet</th>'
                            : ""
                        }
                        <th style="border: 1px solid #333; padding: 8px; text-align:center; color: #d9534f;">Qty</th>
                        <th style="border: 1px solid #333; padding: 8px; text-align:right; color: #d9534f;">Nilai Retur</th>
                    </tr>
                </thead>
                <tbody>
                    ${Object.entries(allReturnedItems)
                      .map(([productId, productData]) =>
                        productData.details
                          .map(
                            (detail) => `
                            <tr style="color: #d9534f;">
                                <td style="border: 1px solid #333; padding: 8px;">${
                                  productData.name
                                }</td>
                                ${
                                  isAllOutletsReport
                                    ? `<td style="border: 1px solid #333; padding: 8px;">${detail.outlet}</td>`
                                    : ""
                                }
                                <td style="border: 1px solid #333; padding: 8px; text-align:center;">${
                                  detail.qty
                                }</td>
                                <td style="border: 1px solid #333; padding: 8px; text-align:right;">-${CurrencyFormatter.format(
                                  detail.value
                                )}</td>
                            </tr>
                        `
                          )
                          .join("")
                      )
                      .join("")}
                </tbody>
            </table>
        `;
    }
    // --- ^ ^ ^ AKHIR BLOK PERUBAHAN ^ ^ ^ ---

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
      <div style="text-align: right; margin-top: 10px; padding-top: 10px; border-top: 2px solid #333;">
          <h3 style="font-size: 16px;">Total Tagihan Keseluruhan: ${CurrencyFormatter.format(
            totalOverall
          )}</h3>
      </div>
      ${returnedItemsSummaryTable}
    `;
  }

  // Ganti fungsi generateDetailedInvoices yang lama dengan yang ini
  static generateDetailedInvoices(invoices, allProducts) {
    return invoices
      .map((invoice) => {
        // Buat Peta (Map) untuk item yang diretur agar mudah diakses
        const returnedItemsMap = new Map();
        if (invoice.return_details) {
          invoice.return_details.forEach((item) => {
            returnedItemsMap.set(item.product_id, item.quantity);
          });
        }

        // Proses item invoice asli dan sesuaikan kuantitasnya
        const adjustedTransactionItems = (invoice.transaction_items || []).map(
          (item) => {
            const returnedQty = returnedItemsMap.get(item.product_id) || 0;
            const finalQty = item.quantity - returnedQty;

            return {
              ...item,
              quantity: finalQty, // Kuantitas baru
              subtotal: finalQty * item.price_per_unit, // Subtotal baru
            };
          }
        );

        // Buat Tabel Invoice yang Sudah Disesuaikan
        const itemsTable = `
        <table style="width:100%; border-collapse: collapse; font-size: 12px; margin-top: 5px;">
          <thead>
            <tr style="background-color: #f8f9fa;">
              <th style="border: 1px solid #333; padding: 8px;">Produk Diterima</th>
              <th style="border: 1px solid #333; padding: 8px; text-align:center;">Qty</th>
              <th style="border: 1px solid #333; padding: 8px; text-align:center;">Unit</th>
              <th style="border: 1px solid #333; padding: 8px; text-align:right;">Harga</th>
              <th style="border: 1px solid #333; padding: 8px; text-align:right;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${adjustedTransactionItems
              .map((item) => {
                const product = allProducts.find(
                  (p) => p.id === item.product_id
                );
                const productName = product ? product.nama : "Produk Dihapus";
                const productUnit = product ? product.unit : "-";
                // Tentukan warna font: merah jika kuantitas 0 atau kurang
                const fontColor = item.quantity <= 0 ? "#d9534f" : "black";

                return `
                <tr style="color: ${fontColor};">
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
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
        `;

        return `
        <div style="margin-top: 25px; padding-top: 15px; border-top: 2px dashed #ccc; page-break-before: auto;">
          <h4 style="margin-bottom: 10px;">Rincian Invoice: ${
            invoice.invoice_id
          }</h4>
          <p style="font-size: 12px; margin-bottom: 10px;">
            <strong>Outlet:</strong> ${invoice.outlet_name} | 
            <strong>Tgl. Kirim:</strong> ${new Date(
              invoice.tanggal_pengiriman
            ).toLocaleDateString("id-ID")} | 
            <strong>Total Akhir:</strong> ${CurrencyFormatter.format(
              invoice.total
            )}
          </p>
          ${itemsTable}
        </div>
      `;
      })
      .join("");
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
            @media print {
                .page-break { page-break-before: always; }
            }
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
