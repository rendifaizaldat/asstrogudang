// HTML/js/admin/renderer.js

import { AdminAnimationController } from "./animations.js";
import { CurrencyFormatter } from "../utils.js";

class AdminRenderer {
  constructor(state) {
    this.state = state;
    this.animationController = new AdminAnimationController();
  }

  renderSummaryCards(data) {
    const container = document.getElementById("summary-cards");
    if (!container) return;

    const cards = [
      {
        title: "Produk Habis",
        value: data.produkHabis,
        icon: "bi-exclamation-triangle",
        color: data.produkHabis > 0 ? "danger" : "success",
        alert: data.produkHabis > 0,
        width: "col-6 col-lg-2 card-small",
      },
      {
        title: "Stok Rendah",
        value: data.produkStokRendah,
        icon: "bi-exclamation-circle",
        color: data.produkStokRendah > 0 ? "warning" : "success",
        alert: data.produkStokRendah > 0,
        width: "col-6 col-lg-2 card-small",
      },
      {
        title: "Piutang Outlet",
        value: CurrencyFormatter.format(data.totalPiutang),
        icon: "bi-cash-coin",
        color: "warning",
        trend: data.trends?.piutangGrowth,
        width: "col-6 col-lg-3 card-medium",
      },
      {
        title: "Hutang Vendor",
        value: CurrencyFormatter.format(data.totalHutang),
        icon: "bi-credit-card",
        color: "info",
        trend: data.trends?.hutangGrowth,
        width: "col-6 col-lg-3 card-medium",
      },
      {
        title: "Total Transaksi",
        value: data.totalTransaksi,
        icon: "bi-graph-up",
        color: "success",
        trend: data.trends?.transaksiGrowth,
        width: "col-6 col-lg-2 card-small",
      },
      {
        title: "Total Produk",
        value: data.totalProduk,
        icon: "bi-boxes",
        color: "primary",
        width: "col-6 col-lg-2 card-small",
      },
    ];

    container.innerHTML = cards
      .map((card, index) => {
        let targetTab = null;
        if (card.title.includes("Produk") || card.title.includes("Stok"))
          targetTab = "#master-produk";
        if (card.title.includes("Piutang")) targetTab = "#piutang-outlet";
        if (card.title.includes("Hutang")) targetTab = "#hutang-vendor";
        if (card.title.includes("Transaksi")) targetTab = "#analytics";

        return `
  <div class="${card.width} col-md-4 col-sm-6 mb-4">
    <div class="summary-card-wrapper">
      <div class="summary-card-icon-wrapper">
        <i class="bi ${card.icon} text-${card.color} ${
          card.alert ? "pulse-animation" : ""
        }"></i>
      </div>
      <div 
        class="card glass-card h-100 summary-card ${
          targetTab ? "interactive-card" : ""
        } ${card.alert ? "border-" + card.color : ""}" 
        style="animation-delay: ${index * 0.1}s"
        ${targetTab ? `data-target-tab="${targetTab}"` : ""}
      >
        <div class="card-body">
          <h6 class="card-subtitle mb-2 text-muted small">${card.title}</h6>
          <h4 class="card-title fw-bold text-${card.color} mb-0">${
          card.value
        }</h4>
        </div>
      </div>
    </div>
  </div>
`;
      })
      .join("");

    this.animationController.animateCards(
      container.querySelectorAll(".summary-card")
    );
  }

  renderPiutangTable(data, isLoading = false, isError = false) {
    const container = document.getElementById("piutang-outlet-container");
    if (!container) return;

    if (isLoading) {
      container.innerHTML = `<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-2">Memuat data...</p></div>`;
      return;
    }
    if (isError) {
      container.innerHTML = `<div class="text-center text-danger py-5"><i class="bi bi-exclamation-triangle fs-2"></i><p>Gagal memuat data.</p></div>`;
      return;
    }
    if (!data || data.length === 0) {
      container.innerHTML = `<div class="text-center text-muted py-5"><i class="bi bi-inbox fs-2"></i><p>Tidak ada data piutang ditemukan.</p></div>`;
      return;
    }

    const groupedByOutlet = data.reduce((acc, p) => {
      const key = p.outlet_name || "Tanpa Nama Outlet";
      if (!acc[key]) {
        acc[key] = { items: [], totalLunas: 0, totalBelumLunas: 0 };
      }
      acc[key].items.push(p);
      if (this.isLunas(p.status)) {
        acc[key].totalLunas += p.total_tagihan;
      } else {
        acc[key].totalBelumLunas += p.total_tagihan;
      }
      return acc;
    }, {});

    let html = Object.entries(groupedByOutlet)
      .map(([outletName, groupData]) => {
        const totalKeseluruhan =
          groupData.totalLunas + groupData.totalBelumLunas;
        return `
              <div class="card glass-card mb-4 outlet-group" data-outlet-name="${outletName}">
                  <div class="card-header bg-light d-flex justify-content-between align-items-center flex-wrap p-2">
                      <h6 class="mb-0 fw-bold"><i class="bi bi-shop me-2"></i>${outletName}</h6>
                      <div class="d-flex align-items-center gap-2 mt-2 mt-md-0">
                          <div class="outlet-totals small me-2">
                              <span class="badge bg-success">Lunas: ${CurrencyFormatter.format(
                                groupData.totalLunas
                              )}</span>
                              <span class="badge bg-warning text-dark">Belum: ${CurrencyFormatter.format(
                                groupData.totalBelumLunas
                              )}</span>
                              <span class="badge bg-primary">Total: ${CurrencyFormatter.format(
                                totalKeseluruhan
                              )}</span>
                          </div>
                      </div>
                  </div>
                  <div class="table-responsive">
                      <table class="table table-hover mb-0" style="font-size: 0.85rem;">
                          <thead>
                              <tr>
                                  <th>ID Invoice</th>
                                  <th>Tanggal</th>
                                  <th class="text-end">Total</th>
                                  <th>Status</th>
                                  <th>Bukti</th>
                                  <th style="width: 200px;" class="text-center">Aksi</th>
                              </tr>
                          </thead>
                          <tbody>
                              ${groupData.items
                                .map((p) => this.createPiutangRow(p))
                                .join("")}
                          </tbody>
                      </table>
                  </div>
              </div>
          `;
      })
      .join("");

    container.innerHTML = html;
  }

  // Tambahkan fungsi pembantu ini di dalam kelas AdminRenderer
  createPiutangRow(p) {
    const statusClass = this.getStatusBadgeClass(p.status);
    return `
        <tr class="table-row">
            <td><span class="fw-semibold">${p.invoice_id}</span></td>
            <td>${this.formatDate(p.tanggal_pengiriman)}</td>
            <td>${p.outlet_name}</td>
            <td class="text-end fw-bold">${CurrencyFormatter.format(
              p.total_tagihan
            )}</td>
            <td><span class="badge ${statusClass} rounded-pill">${
      p.status || "Belum Lunas"
    }</span></td>
            <td>${this.renderBuktiTransfer(
              p.bukti_transfer,
              p.id,
              "piutang"
            )}</td>
            <td class="text-center">
                <div class="d-flex justify-content-center align-items-center">
                    <div class="form-check form-switch me-2" title="Ubah Status Lunas">
                        <input class="form-check-input status-toggle" type="checkbox" ${
                          this.isLunas(p.status) ? "checked" : ""
                        } data-type="piutang" data-id="${p.id}">
                    </div>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-secondary btn-print-invoice" data-id="${
                          p.id
                        }" title="Cetak Ulang Nota"><i class="bi bi-printer"></i></button>
                        <button class="btn btn-outline-primary btn-edit-transaction" data-id="${
                          p.id
                        }" data-type="piutang"><i class="bi bi-pencil-square"></i></button>
                        <button class="btn btn-outline-danger btn-delete-transaction" data-id="${
                          p.id
                        }" data-type="piutang"><i class="bi bi-trash"></i></button>
                    </div>
                </div>
            </td>
        </tr>`;
  }

  filterPiutangTable(outletGroup, status) {
    const rows = outletGroup.querySelectorAll("tbody tr");
    rows.forEach((row) => {
      if (status === "all" || row.dataset.status === status) {
        row.style.display = "";
      } else {
        row.style.display = "none";
      }
    });
    // Update active button style
    outletGroup.querySelectorAll(".piutang-filter-btn").forEach((b) => {
      b.classList.remove("active");
    });
    outletGroup
      .querySelector(`.piutang-filter-btn[data-status="${status}"]`)
      .classList.add("active");
  }

  renderHutangTable(data, isLoading = false, isError = false) {
    const container = document.getElementById("hutang-vendor-container");
    const summaryContainer = document.getElementById("hutang-summary-cards");
    if (!container || !summaryContainer) return;

    if (isLoading) {
      container.innerHTML = `<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-2">Memuat data...</p></div>`;
      summaryContainer.innerHTML = "";
      return;
    }
    if (isError) {
      container.innerHTML = `<div class="text-center text-danger py-5"><i class="bi bi-exclamation-triangle fs-2"></i><p>Gagal memuat data.</p></div>`;
      summaryContainer.innerHTML = "";
      return;
    }

    // Hitung total keseluruhan untuk summary cards
    const totalSummary = data.reduce(
      (acc, item) => {
        const amount = item.total_tagihan || 0;
        acc.total += amount;
        if (this.isLunas(item.status)) {
          acc.lunas += amount;
        } else {
          acc.belumLunas += amount;
        }
        return acc;
      },
      { total: 0, lunas: 0, belumLunas: 0 }
    );

    this.renderFinancialSummaryCards(
      "hutang-summary-cards",
      totalSummary,
      "Hutang"
    );

    if (!data || data.length === 0) {
      container.innerHTML = `<div class="text-center text-muted py-5"><i class="bi bi-inbox fs-2"></i><p>Tidak ada data hutang ditemukan.</p></div>`;
      return;
    }

    const groupedByVendor = data.reduce((acc, p) => {
      const key = p.nama_vendor || "Tanpa Nama Vendor";
      if (!acc[key]) {
        acc[key] = { items: [], total: 0 };
      }
      acc[key].items.push(p);
      acc[key].total += p.total_tagihan;
      return acc;
    }, {});

    const tableHTML = Object.entries(groupedByVendor)
      .map(
        ([vendorName, groupData]) => `
      <div class="card glass-card mb-4">
          <div class="card-header bg-light d-flex justify-content-between align-items-center">
              <h6 class="mb-0 fw-bold"><i class="bi bi-truck me-2"></i>${vendorName}</h6>
              <span class="badge bg-primary">Total: ${CurrencyFormatter.format(
                groupData.total
              )}</span>
          </div>
          <div class="table-responsive">
              <table class="table table-hover mb-0">
                  <thead class="table-light">
                      <tr>
                          <th>No Nota</th>
                          <th>Tanggal</th>
                          <th class="text-end">Total</th>
                          <th>Status</th>
                          <th>Bukti</th>
                          <th class="text-center" style="width: 200px;">Aksi</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${groupData.items
                        .map((h) => this.createHutangRow(h))
                        .join("")}
                  </tbody>
              </table>
          </div>
      </div>
    `
      )
      .join("");

    container.innerHTML = tableHTML;
  }

  createHutangRow(h) {
    const statusClass = this.getStatusBadgeClass(h.status);
    return `
          <tr class="table-row">
              <td><span class="fw-semibold">${
                h.no_nota_vendor || "-"
              }</span></td>
              <td>${this.formatDate(h.tanggal_nota)}</td>
              <td class="text-end fw-bold">${CurrencyFormatter.format(
                h.total_tagihan
              )}</td>
              <td><span class="badge ${statusClass} rounded-pill">${
      h.status || "Belum Lunas"
    }</span></td>
              <td>${this.renderBuktiTransfer(
                h.bukti_transfer,
                h.id,
                "hutang"
              )}</td>
              <td class="text-center">
                  <div class="d-flex justify-content-center align-items-center">
                      <div class="form-check form-switch me-2" title="Ubah Status Lunas">
                          <input class="form-check-input status-toggle" type="checkbox" ${
                            this.isLunas(h.status) ? "checked" : ""
                          } data-type="hutang" data-id="${h.id}">
                      </div>
                      <div class="btn-group btn-group-sm">
                          <button class="btn btn-outline-primary btn-edit-transaction" data-id="${
                            h.id
                          }" data-type="hutang"><i class="bi bi-pencil-square"></i></button>
                          <button class="btn btn-outline-danger btn-delete-transaction" data-id="${
                            h.id
                          }" data-type="hutang"><i class="bi bi-trash"></i></button>
                      </div>
                  </div>
              </td>
          </tr>`;
  }

  renderBarangMasukPreview() {
    const barangMasukList = this.state.getData("barangMasukList");
    const tbody = document.getElementById("tabelBarangMasukPreview");
    const currentSession = this.state.getCurrentNotaSession();
    const sessionInfo = document.getElementById("nota-session-info");
    const totalElement = document.getElementById("barang-masuk-total");
    const saveButton = document.getElementById("simpanSemuaBtn");

    if (!tbody) return;

    if (sessionInfo) {
      if (currentSession) {
        sessionInfo.innerHTML = `
          <div class="alert alert-info">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <strong>Nota Aktif:</strong> ${currentSession.noNota} - ${currentSession.vendor}
              </div>
              <button class="btn btn-sm btn-outline-danger" id="resetNotaSession">
                <i class="bi bi-x-circle me-1"></i>Reset
              </button>
            </div>
          </div>
        `;
      } else {
        sessionInfo.innerHTML = "";
      }
    }

    if (barangMasukList.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-4 text-muted">
            <i class="bi bi-inbox fs-3 d-block mb-2"></i>
            Silakan isi informasi vendor dan nota terlebih dahulu
          </td>
        </tr>
      `;
      // Kosongkan juga area total
      if (totalElement) {
        totalElement.innerHTML = "";
      }
      // Nonaktifkan tombol simpan
      if (saveButton) {
        saveButton.disabled = true;
      }
      // Reset form detail nota secara eksplisit
      const formNotaVendor = document.getElementById("formNotaVendor");
      if (formNotaVendor) {
        formNotaVendor.reset();
      }
      return; // Selesai, keluar dari fungsi
    }

    // --- AKHIR PERUBAHAN ---

    // Kode di bawah ini hanya berjalan jika barangMasukList TIDAK kosong
    const fragment = document.createDocumentFragment();
    barangMasukList.forEach((item, idx) => {
      const tr = document.createElement("tr");
      tr.className = "table-row";
      tr.innerHTML = `
        <td>
          <div class="d-flex align-items-center">
            <i class="bi bi-box me-2 text-primary"></i>
            <div>
              <div class="fw-semibold">${item.nama_barang}</div>
              <small class="text-muted">${item.nama_vendor} - ${
        item.no_nota_vendor
      }</small>
            </div>
          </div>
        </td>
        <td class="text-center">
          <span class="badge bg-primary rounded-pill">${item.qty}</span>
        </td>
        <td class="text-end">${CurrencyFormatter.format(item.harga)}</td>
        <td class="text-end fw-bold text-success">${CurrencyFormatter.format(
          item.total
        )}</td>
        <td class="text-center">
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary edit-barang-btn" data-index="${idx}" title="Edit">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-outline-danger remove-barang-btn" data-index="${idx}" title="Hapus">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </td>
      `;
      fragment.appendChild(tr);
    });

    tbody.innerHTML = ""; // Bersihkan dulu sebelum menambahkan
    tbody.appendChild(fragment);

    const total = barangMasukList.reduce((sum, item) => sum + item.total, 0);
    if (totalElement) {
      totalElement.innerHTML = `
        <div class="alert alert-success mb-0">
          <div class="row">
            <div class="col-md-6">
              <strong>Total: ${CurrencyFormatter.format(total)}</strong>
            </div>
            <div class="col-md-6 text-md-end">
              <small>Jumlah item: ${barangMasukList.length}</small>
            </div>
          </div>
        </div>
      `;
    }

    if (saveButton) {
      saveButton.disabled = false;
    }
    this.animateTableRows(tbody);
  }
  renderGenericTable(config) {
    const {
      dataType,
      searchTerm = "",
      statusFilter = "all",
      tbodyId,
      columns,
      rowGenerator,
      emptyMessage,
    } = config;

    const data = this.state.searchData(searchTerm, dataType, {
      status: statusFilter,
    });
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    if (!data || data.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="${columns}" class="text-center text-muted py-4">
            <i class="bi bi-search me-2"></i>
            ${
              searchTerm
                ? `Tidak ada hasil untuk "${searchTerm}"`
                : emptyMessage
            }
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = data.map(rowGenerator).join("");
    this.animateTableRows(tbody);
  }

  renderInventarisTable(
    products,
    isLoading = false,
    isError = false,
    pagination = null
  ) {
    const status = this.state.productFilter.status;
    const tbody = document.getElementById("inventaris-table-body");
    const paginationControls = document.getElementById("pagination-controls");
    const paginationInfo = document.getElementById("pagination-info");
    if (!tbody || !paginationControls || !paginationInfo) return;

    // Bersihkan konten sebelumnya
    tbody.innerHTML = "";
    paginationControls.innerHTML = "";
    paginationInfo.innerHTML = "";

    if (isLoading) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-5"><div class="spinner-border text-primary"></div></td></tr>`;
      return;
    }
    if (isError) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-5">Gagal memuat data produk.</td></tr>`;
      return;
    }
    if (!products || products.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-5">Tidak ada produk ditemukan.</td></tr>`;
      return;
    }

    tbody.innerHTML = products
      .map((item) => {
        return `
        <tr class="table-row">
            <td><span class="fw-semibold">${
              item.kode_produk || item.id
            }</span></td>
            <td>${item.nama}</td>
            <td><span class="badge bg-light text-dark border">${
              item.unit
            }</span></td>
            <td><input type="number" class="form-control form-control-sm stok-input" value="${
              item.sisa_stok
            }" min="0" data-product-id="${item.id}" data-original-value="${
          item.sisa_stok
        }"></td>
            <td class="text-center">
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-primary save-stok-btn" data-product-id="${
                      item.id
                    }" disabled><i class="bi bi-check-lg"></i> Simpan</button>
                    <button class="btn btn-outline-secondary btn-edit-product" data-product-id="${
                      item.id
                    }" title="Edit Detail Produk"><i class="bi bi-pencil-square"></i></button>
                    <button class="btn btn-outline-danger btn-delete-product" data-product-id="${
                      item.id
                    }" title="Hapus Produk"><i class="bi bi-trash"></i></button>
                    <button class="btn btn-outline-info btn-stock-history" data-product-id="${
                      item.id
                    }" title="Lihat Riwayat Stok"><i class="bi bi-clock-history"></i></button>
                </div>
            </td>
        </tr>`;
      })
      .join("");

    if (pagination) {
      this.renderPaginationControls(pagination);
    }
    this.animateTableRows(tbody);
  }

  renderDashboardDetails(details) {
    this.renderTable(
      "dashboard-produk-habis-body",
      details.produkHabis,
      (p) => `
      <tr>
        <td><i class="bi bi-box text-danger me-2"></i>${p.kode_produk}</td>
        <td>${p.nama}</td>
      </tr>
    `,
      '<tr><td colspan="2" class="text-center text-success"><i class="bi bi-check-circle me-2"></i>Semua produk tersedia!</td></tr>'
    );

    this.renderTable(
      "dashboard-produk-stok-rendah-body",
      details.produkStokRendah,
      (p) => `
      <tr>
        <td><i class="bi bi-exclamation-triangle text-warning me-2"></i>${p.kode_produk}</td>
        <td>${p.nama}</td>
        <td><span class="badge bg-warning">${p.sisa_stok}</span></td>
      </tr>
    `,
      '<tr><td colspan="3" class="text-center text-success"><i class="bi bi-check-circle me-2"></i>Stok aman!</td></tr>'
    );

    // Data ini sudah difilter oleh state.js sebelum sampai ke sini
    this.renderTable(
      "dashboard-hutang-vendor-body",
      details.hutangJatuhTempo,
      (h) => `
      <tr>
        <td>${this.formatDate(h.created_at)}</td>
        <td><i class="bi bi-truck me-2"></i>${h.nama_vendor}</td>
        <td class="text-end fw-bold">${CurrencyFormatter.format(
          h.total_tagihan
        )}</td>
      </tr>
    `,
      '<tr><td colspan="3" class="text-center text-success"><i class="bi bi-check-circle me-2"></i>Tidak ada hutang!</td></tr>'
    );

    // Data ini juga sudah difilter oleh state.js
    this.renderTable(
      "dashboard-piutang-outlet-body",
      details.piutangJatuhTempo,
      (p) => `
      <tr>
        <td>${this.formatDate(p.created_at)}</td>
        <td><i class="bi bi-shop me-2"></i>${p.outlet_name}</td>
        <td class="text-end fw-bold">${CurrencyFormatter.format(
          p.total_tagihan
        )}</td>
      </tr>
    `,
      '<tr><td colspan="3" class="text-center text-success"><i class="bi bi-check-circle me-2"></i>Tidak ada piutang!</td></tr>'
    );
  }

  renderVendorsTable() {
    const vendors = this.state.getData("vendors");
    const tbody = document.getElementById("vendors-table-body");
    if (!tbody) return;

    if (!vendors || vendors.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-center text-muted py-4">Belum ada data vendor.</td></tr>';
      return;
    }

    tbody.innerHTML = vendors
      .map(
        (v) => `
      <tr>
        <td class="fw-bold">${v.nama_vendor}</td>
        <td>${v.bank || "-"}</td>
        <td>${v.rekening || "-"}</td>
        <td>${v.atas_nama || "-"}</td>
        <td class="text-center">
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary btn-edit-vendor" data-id="${
              v.id
            }" title="Edit"><i class="bi bi-pencil-square"></i></button>
            <button class="btn btn-outline-danger btn-delete-vendor" data-id="${
              v.id
            }" data-name="${
          v.nama_vendor
        }" title="Hapus"><i class="bi bi-trash"></i></button>
          </div>
        </td>
      </tr>
    `
      )
      .join("");
  }

  renderUsersTable(users) {
    const tbody = document.getElementById("users-table-body");
    if (!tbody) return;

    if (!users || users.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-center text-muted py-4">Belum ada data pengguna.</td></tr>';
      return;
    }

    tbody.innerHTML = users
      .map(
        (user) => `
      <tr>
        <td>${user.nama}</td>
        <td>${user.email}</td>
        <td><span class="badge bg-light text-dark border">${
          user.outlet || "-"
        }</span></td>
        <td><span class="badge bg-primary">${user.role}</span></td>
        <td class="text-center">
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary btn-edit-user" data-id="${
              user.id
            }" title="Edit"><i class="bi bi-pencil-square"></i></button>
            <button class="btn btn-outline-danger btn-delete-user" data-id="${
              user.id
            }" data-name="${
          user.nama
        }" title="Hapus"><i class="bi bi-trash"></i></button>
          </div>
        </td>
      </tr>
    `
      )
      .join("");
  }

  renderTable(tbodyId, data, rowGenerator, emptyStateHtml) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    if (!data || data.length === 0) {
      tbody.innerHTML =
        emptyStateHtml ||
        '<tr><td colspan="10" class="text-center text-muted py-4"><i class="bi bi-inbox me-2"></i>Tidak ada data</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(rowGenerator).join("");
    this.animateTableRows(tbody);
  }

  renderVendorOptions(vendors) {
    const vendorSelect = document.getElementById("vendorSelect");
    if (!vendorSelect) return;

    vendorSelect.innerHTML =
      '<option value="" selected disabled>Pilih Vendor...</option>';
    vendors.forEach((vendor) => {
      if (vendor && vendor.nama_vendor) {
        const option = document.createElement("option");
        option.value = vendor.nama_vendor;
        option.textContent = vendor.nama_vendor;
        vendorSelect.appendChild(option);
      }
    });
  }

  renderSearchAndFilter(containerId, dataType) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const filterOptions = this.getFilterOptions(dataType);
    container.innerHTML = `
      <div class="card glass-card mb-4">
        <div class="card-body">
          <div class="row g-3">
            <div class="col-md-6">
              <div class="input-group">
                <span class="input-group-text"><i class="bi bi-search"></i></span>
                <input type="text" class="form-control" id="${dataType}-search" placeholder="Cari ${dataType}...">
              </div>
            </div>
            <div class="col-md-3">
              <select class="form-select" id="${dataType}-status-filter">
                <option value="all">Semua Status</option>
                ${filterOptions
                  .map(
                    (option) =>
                      `<option value="${option.value}">${option.label}</option>`
                  )
                  .join("")}
              </select>
            </div>
            <div class="col-md-3">
              <button class="btn btn-outline-secondary w-100" id="${dataType}-clear-filter">
                <i class="bi bi-x-circle me-1"></i>Reset Filter
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  getFilterOptions(dataType) {
    const commonOptions = [
      { value: "lunas", label: "Lunas" },
      { value: "belum lunas", label: "Belum Lunas" },
      { value: "dibatalkan", label: "Dibatalkan" },
    ];

    switch (dataType) {
      case "piutang":
      case "hutang":
        return commonOptions;
      default:
        return [];
    }
  }

  renderAnalytics() {
    const analyticsContent = document.getElementById("analytics-content");
    if (!analyticsContent) return;

    const report = this.state.getAnalytics();
    if (!report) {
      analyticsContent.innerHTML =
        '<p class="text-muted">Gagal memuat data analytics.</p>';
      return;
    }

    analyticsContent.innerHTML = `
      <div class="row g-4">
        <div class="col-lg-4">
          <div class="card glass-card h-100">
            <div class="card-header"><h6 class="mb-0"><i class="bi bi-person-circle me-2"></i>Info Sesi</h6></div>
            <div class="card-body">
              <p><strong>User:</strong> ${report.userInfo.email}</p>
              <p><strong>Role:</strong> ${report.userInfo.role}</p>
              <p class="mb-0"><strong>Durasi Sesi:</strong> ${report.sessionDuration} menit</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  getStokStatus(stok) {
    const stokNum = Number(stok);
    if (stokNum <= 0) return { color: "danger", alert: true };
    if (stokNum <= 5) return { color: "warning", alert: true };
    return { color: "success", alert: false };
  }

  isOverdue(timestamp) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return new Date(timestamp) < thirtyDaysAgo;
  }

  animateTableRows(tbody) {
    const rows = tbody.querySelectorAll("tr");
    rows.forEach((row, index) => {
      row.style.animationDelay = `${index * 0.05}s`;
      row.classList.add("table-row-enter");
    });
  }

  formatDate(timestamp) {
    try {
      return new Date(timestamp).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch (error) {
      return "Invalid Date";
    }
  }

  getStatusBadgeClass(status) {
    return this.isLunas(status) ? "bg-success" : "bg-warning";
  }

  isLunas(status) {
    return (status || "").toLowerCase() === "lunas";
  }

  renderBuktiTransfer(buktiTransfer, id, type) {
    if (buktiTransfer) {
      return `
        <div class="btn-group btn-group-sm">
          <a href="${buktiTransfer}" target="_blank" class="btn btn-outline-info" title="Lihat Bukti">
            <i class="bi bi-eye"></i>
          </a>
          <button class="btn btn-outline-danger btn-delete-bukti" data-id="${id}" data-type="${type}" data-url="${buktiTransfer}" title="Hapus Bukti">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      `;
    } else {
      return `<button class="btn btn-sm btn-outline-secondary upload-bukti-btn" data-id="${id}" data-type="${type}" data-bs-toggle="modal" data-bs-target="#uploadModal"><i class="bi bi-upload me-1"></i>Upload</button>`;
    }
  }
  renderArchivedPayables(payables) {
    const tbody = document.getElementById("archived-payables-body");
    if (!tbody) return;

    if (!payables || payables.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="4" class="text-center text-muted py-3">Tidak ada arsip hutang vendor.</td></tr>';
      return;
    }

    tbody.innerHTML = payables
      .map(
        (p) => `
        <tr>
            <td>${p.no_nota_vendor}</td>
            <td>${p.nama_vendor}</td>
            <td class="text-end">${CurrencyFormatter.format(
              p.total_tagihan
            )}</td>
            <td class="text-center">
                <button class="btn btn-sm btn-outline-success btn-unarchive" data-type="hutang" data-id="${
                  p.id
                }">
                    <i class="bi bi-arrow-counterclockwise me-1"></i> Aktifkan Kembali
                </button>
            </td>
        </tr>
    `
      )
      .join("");
  }

  renderArchivedReceivables(receivables) {
    const tbody = document.getElementById("archived-receivables-body");
    if (!tbody) return;

    if (!receivables || receivables.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="4" class="text-center text-muted py-3">Tidak ada arsip piutang outlet.</td></tr>';
      return;
    }

    tbody.innerHTML = receivables
      .map(
        (r) => `
        <tr>
            <td>${r.invoice_id}</td>
            <td>${r.outlet_name}</td>
            <td class="text-end">${CurrencyFormatter.format(
              r.total_tagihan
            )}</td>
            <td class="text-center">
                <button class="btn btn-sm btn-outline-success btn-unarchive" data-type="piutang" data-id="${
                  r.id
                }">
                    <i class="bi bi-arrow-counterclockwise me-1"></i> Aktifkan Kembali
                </button>
            </td>
        </tr>
    `
      )
      .join("");
  }
  renderPurchaseOrderPreview() {
    const poSession = this.state.getCurrentPOSession();
    const tbody = document.getElementById("tabelPOPreview");
    const totalElement = document.getElementById("po-total");
    const saveButton = document.getElementById("simpanPOBtn");
    const resetButton = document.getElementById("hapusSemuaPOBtn");
    const sessionInfo = document.getElementById("po-session-info");

    if (!poSession) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-center py-4 text-muted">Mulai sesi PO untuk menambah item.</td></tr>';
      totalElement.innerHTML = "";
      saveButton.disabled = true;
      resetButton.disabled = true;
      sessionInfo.innerHTML = "";
      return;
    }

    sessionInfo.innerHTML = `
          <div class="alert alert-info">
            <div class="d-flex justify-content-between align-items-center">
              <div><strong>PO untuk:</strong> ${poSession.outlet} | <strong>Tgl Kirim:</strong> ${poSession.tanggalKirim}</div>
            </div>
          </div>
        `;

    if (poSession.items.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-center py-4 text-muted">Belum ada item ditambahkan.</td></tr>';
      totalElement.innerHTML = "";
      saveButton.disabled = true;
      resetButton.disabled = false;
      return;
    }

    tbody.innerHTML = poSession.items
      .map(
        (item, idx) => `
            <tr>
                <td>
                    <div class="fw-semibold">${item.nama}</div>
                    <small class="text-muted">Stok: ${item.sisa_stok}</small>
                </td>
                <td class="text-center">${item.qty} ${item.unit}</td>
                <td class="text-end">${CurrencyFormatter.format(
                  item.harga_jual
                )}</td>
                <td class="text-end fw-bold">${CurrencyFormatter.format(
                  item.harga_jual * item.qty
                )}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-outline-danger remove-po-item-btn" data-index="${idx}"><i class="bi bi-trash"></i></button>
                </td>
            </tr>
        `
      )
      .join("");

    const total = poSession.items.reduce(
      (sum, item) => sum + item.harga_jual * item.qty,
      0
    );
    totalElement.innerHTML = `<div class="alert alert-success"><strong>Total Pesanan: ${CurrencyFormatter.format(
      total
    )}</strong></div>`;
    saveButton.disabled = false;
    resetButton.disabled = false;
  }
  // **** START: RENDER RETURN PREVIEW ****
  renderReturnPreview() {
    const returnList = this.state.getData("returnList");
    const tbody = document.getElementById("tabelReturPreview");
    const totalElement = document.getElementById("retur-total");
    const saveButton = document.getElementById("simpanReturBtn");
    const resetButton = document.getElementById("hapusSemuaReturBtn");

    if (!tbody) return;

    if (returnList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">Belum ada item retur ditambahkan.</td></tr>`;
      totalElement.innerHTML = "";
      saveButton.disabled = true;
      resetButton.disabled = true;
      return;
    }

    tbody.innerHTML = returnList
      .map(
        (item, idx) => `
        <tr class="table-row">
            <td><div class="fw-semibold">${item.nama}</div></td>
            <td class="text-center">${item.quantity} ${item.unit}</td>
            <td class="text-end">${CurrencyFormatter.format(
              item.price_per_unit
            )}</td>
            <td class="text-end fw-bold">${CurrencyFormatter.format(
              item.subtotal
            )}</td>
            <td class="text-center">
                <button class="btn btn-sm btn-outline-danger remove-retur-item-btn" data-index="${idx}"><i class="bi bi-trash"></i></button>
            </td>
        </tr>
    `
      )
      .join("");

    const total = returnList.reduce((sum, item) => sum + item.subtotal, 0);
    totalElement.innerHTML = `<div class="alert alert-success"><strong>Total Nilai Retur: ${CurrencyFormatter.format(
      total
    )}</strong></div>`;
    saveButton.disabled = false;
    resetButton.disabled = false;
    this.animateTableRows(tbody);
  }
  // **** END: RENDER RETURN PREVIEW ****
  renderFinancialSummaryCards(containerId, summaryData, type) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const cards = [
      {
        title: `Total ${type}`,
        value: summaryData.total,
        icon: "bi-journal-text",
        color: "primary",
      },
      {
        title: "Sudah Lunas",
        value: summaryData.lunas,
        icon: "bi-check-circle-fill",
        color: "success",
      },
      {
        title: "Belum Lunas",
        value: summaryData.belumLunas,
        icon: "bi-exclamation-circle-fill",
        color: "warning",
      },
    ];

    container.innerHTML = cards
      .map(
        (card) => `
        <div class="col-md-4">
            <div class="card glass-card h-100">
                <div class="card-body">
                    <div class="d-flex align-items-center">
                        <div class="flex-shrink-0">
                            <i class="bi ${card.icon} fs-2 text-${
          card.color
        }"></i>
                        </div>
                        <div class="flex-grow-1 ms-3">
                            <h6 class="card-subtitle text-muted small">${
                              card.title
                            }</h6>
                            <h4 class="card-title fw-bold mb-0">${CurrencyFormatter.format(
                              card.value
                            )}</h4>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `
      )
      .join("");

    this.animationController.animateCards(container.querySelectorAll(".card"));
  }
  renderPaginationControls(pagination) {
    const { currentPage, totalProducts, limit } = pagination;
    const totalPages = Math.ceil(totalProducts / limit);
    const infoEl = document.getElementById("pagination-info");
    const controlsEl = document.getElementById("pagination-controls");

    if (totalPages <= 1) {
      infoEl.innerHTML = `Total ${totalProducts} produk`;
      controlsEl.innerHTML = "";
      return;
    }

    const startItem = (currentPage - 1) * limit + 1;
    const endItem = Math.min(currentPage * limit, totalProducts);
    infoEl.innerHTML = `Menampilkan ${startItem} - ${endItem} dari ${totalProducts} produk`;

    let buttons = "";

    // Tombol Previous
    buttons += `<button class="btn btn-sm btn-outline-secondary" data-page="${
      currentPage - 1
    }" ${currentPage === 1 ? "disabled" : ""}>&laquo;</button>`;

    // Tombol Halaman
    // Logika untuk menampilkan halaman secara dinamis (misal: 1 ... 4 5 6 ... 10)
    let pageNumbers = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
    } else {
      pageNumbers.push(1);
      if (currentPage > 3) pageNumbers.push("...");

      let startPage = Math.max(2, currentPage - 1);
      let endPage = Math.min(totalPages - 1, currentPage + 1);

      for (let i = startPage; i <= endPage; i++) {
        pageNumbers.push(i);
      }

      if (currentPage < totalPages - 2) pageNumbers.push("...");
      pageNumbers.push(totalPages);
    }

    pageNumbers.forEach((num) => {
      if (num === "...") {
        buttons += `<span class="btn btn-sm disabled">...</span>`;
      } else {
        buttons += `<button class="btn btn-sm ${
          num === currentPage ? "btn-primary" : "btn-outline-secondary"
        }" data-page="${num}">${num}</button>`;
      }
    });

    buttons += `<button class="btn btn-sm btn-outline-secondary" data-page="${
      currentPage + 1
    }" ${currentPage === totalPages ? "disabled" : ""}>&raquo;</button>`;

    controlsEl.innerHTML = `<div class="btn-group btn-group-sm">${buttons}</div>`;
  }
  renderStockHistory(
    historyData,
    isLoading = false,
    productId = null,
    isError = false
  ) {
    const tbody = document.getElementById("stockHistoryTableBody");
    const titleEl = document.getElementById("stockHistoryProductName");
    if (!tbody || !titleEl) return;

    // Atur judul modal
    if (productId) {
      const product = this.state
        .getData("inventaris")
        .find((p) => p.id == productId);
      titleEl.textContent = product
        ? `Riwayat Stok untuk: ${product.nama}`
        : "Riwayat Stok";
    }

    if (isLoading) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-5"><div class="spinner-border spinner-border-sm"></div></td></tr>`;
      return;
    }

    if (isError) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">Gagal memuat riwayat.</td></tr>`;
      return;
    }

    if (historyData.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">Tidak ada riwayat untuk produk ini.</td></tr>`;
      return;
    }

    tbody.innerHTML = historyData
      .map((item) => {
        const typeMap = {
          barang_masuk: {
            text: "Masuk",
            class: "text-success",
            icon: "bi-arrow-down-circle-fill",
          },
          penjualan: {
            text: "Keluar",
            class: "text-danger",
            icon: "bi-arrow-up-circle-fill",
          },
          penyesuaian: {
            text: "Manual",
            class: "text-info",
            icon: "bi-pencil-fill",
          },
          retur: {
            text: "Retur",
            class: "text-primary",
            icon: "bi-arrow-return-left",
          },
        };
        const typeInfo = typeMap[item.type] || {
          text: item.type,
          class: "",
          icon: "bi-question-circle-fill",
        };
        const changeAmount = Number(item.change_amount);

        return `
            <tr>
                <td>${this.formatDate(item.created_at)}</td>
                <td><i class="bi ${typeInfo.icon} ${typeInfo.class} me-2"></i>${
          typeInfo.text
        }</td>
                <td class="fw-bold ${
                  changeAmount > 0 ? "text-success" : "text-danger"
                }">
                    ${changeAmount > 0 ? "+" : ""}${changeAmount}
                </td>
                <td class="fw-bold">${item.stock_after}</td>
                <td><small class="text-muted">${
                  item.reference || "-"
                }</small></td>
            </tr>
        `;
      })
      .join("");
  }
}

export { AdminRenderer };
