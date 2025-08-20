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
        title: "Total Produk",
        value: data.totalProduk,
        icon: "bi-boxes",
        color: "primary",
      },
      {
        title: "Produk Habis",
        value: data.produkHabis,
        icon: "bi-exclamation-triangle",
        color: data.produkHabis > 0 ? "danger" : "success",
        alert: data.produkHabis > 0,
      },
      {
        title: "Stok Rendah",
        value: data.produkStokRendah,
        icon: "bi-exclamation-circle",
        color: data.produkStokRendah > 0 ? "warning" : "success",
        alert: data.produkStokRendah > 0,
      },
      {
        title: "Piutang Outlet",
        value: CurrencyFormatter.format(data.totalPiutang),
        icon: "bi-cash-coin",
        color: "warning",
        trend: data.trends?.piutangGrowth,
      },
      {
        title: "Hutang Vendor",
        value: CurrencyFormatter.format(data.totalHutang),
        icon: "bi-credit-card",
        color: "info",
        trend: data.trends?.hutangGrowth,
      },
      {
        title: "Total Transaksi",
        value: data.totalTransaksi,
        icon: "bi-graph-up",
        color: "success",
        trend: data.trends?.transaksiGrowth,
      },
    ];

    container.innerHTML = cards
      .map(
        (card, index) => `
      <div class="col-lg-2 col-md-4 col-sm-6 mb-4">
        <div class="card glass-card h-100 summary-card ${
          card.alert ? "border-" + card.color : ""
        }" style="animation-delay: ${index * 0.1}s">
          <div class="card-body text-center">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <i class="bi ${card.icon} fs-2 text-${card.color} ${
          card.alert ? "pulse-animation" : ""
        }"></i>
              ${
                card.trend !== null && card.trend !== undefined
                  ? `
                <div class="trend-indicator ${
                  card.trend >= 0 ? "positive" : "negative"
                }">
                  <i class="bi bi-arrow-${card.trend >= 0 ? "up" : "down"}"></i>
                  <small>${Math.abs(card.trend).toFixed(1)}%</small>
                </div>
              `
                  : ""
              }
            </div>
            <h6 class="card-subtitle mb-2 text-muted small">${card.title}</h6>
            <h4 class="card-title fw-bold text-${card.color} mb-0">${
          card.value
        }</h4>
            ${
              card.alert
                ? `<small class="text-${card.color}"><i class="bi bi-exclamation-circle"></i> Perlu Perhatian</small>`
                : ""
            }
          </div>
        </div>
      </div>
    `
      )
      .join("");

    this.animationController.animateCards(
      container.querySelectorAll(".summary-card")
    );
  }

  renderPiutangTable(searchTerm = "", statusFilter = "all") {
    const allPiutang = this.state.getData("piutang");
    const piutangSummary = this.state.getFinancialSummary(allPiutang);
    this.renderFinancialSummaryCards(
      "piutang-summary-cards",
      piutangSummary,
      "Piutang"
    );
    this.renderGenericTable({
      dataType: "piutang",
      searchTerm,
      statusFilter,
      tbodyId: "piutang-table-body",
      columns: 8,
      emptyMessage: "Tidak ada data piutang",
      rowGenerator: (p) => {
        const isOverdue = this.isOverdue(p.created_at);
        const statusClass = this.getStatusBadgeClass(p.status);

        return `
          <tr class="table-row ${isOverdue ? "table-warning" : ""}">
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
            <td>
              <div class="form-check form-switch"><input class="form-check-input status-toggle" type="checkbox" ${
                this.isLunas(p.status) ? "checked" : ""
              } data-type="piutang" data-id="${p.id}"></div>
            </td>
            <td>
              <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-primary btn-edit-transaction" data-id="${
                  p.id
                }" data-type="piutang"><i class="bi bi-pencil-square"></i></button>
                <button class="btn btn-outline-danger btn-delete-transaction" data-id="${
                  p.id
                }" data-type="piutang"><i class="bi bi-trash"></i></button>
                <button class="btn btn-outline-secondary btn-print-invoice" data-id="${
                  p.id
                }" title="Cetak Ulang Nota"><i class="bi bi-printer"></i></button>
              </div>
            </td>
          </tr>
        `;
      },
    });
  }

  renderHutangTable(searchTerm = "", statusFilter = "all") {
    const allHutang = this.state.getData("hutang");
    const hutangSummary = this.state.getFinancialSummary(allHutang);
    this.renderFinancialSummaryCards(
      "hutang-summary-cards",
      hutangSummary,
      "Hutang"
    );
    this.renderGenericTable({
      dataType: "hutang",
      searchTerm,
      statusFilter,
      tbodyId: "hutang-table-body",
      columns: 8,
      emptyMessage: "Tidak ada data hutang",
      rowGenerator: (h) => {
        // Pemeriksaan keamanan: Jika objek h tidak valid, jangan render baris ini
        if (!h) return "";

        const statusClass = this.getStatusBadgeClass(h.status);
        return `
              <tr class="table-row">
                <td><span class="fw-semibold">${
                  h.no_nota_vendor || "-"
                }</span></td>
                <td>${this.formatDate(h.tanggal_nota)}</td>
                <td>${h.nama_vendor || "Vendor Dihapus"}</td>
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
                <td>
                  <div class="form-check form-switch"><input class="form-check-input status-toggle" type="checkbox" ${
                    this.isLunas(h.status) ? "checked" : ""
                  } data-type="hutang" data-id="${h.id}"></div>
                </td>
                <td>
                  <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary btn-edit-transaction" data-id="${
                      h.id
                    }" data-type="hutang"><i class="bi bi-pencil-square"></i></button>
                    <button class="btn btn-outline-danger btn-delete-transaction" data-id="${
                      h.id
                    }" data-type="hutang"><i class="bi bi-trash"></i></button>
                  </div>
                </td>
              </tr>
            `;
      },
    });
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

  renderInventarisTable(searchTerm = "") {
    this.renderGenericTable({
      dataType: "inventaris",
      searchTerm,
      tbodyId: "inventaris-table-body",
      columns: 7,
      emptyMessage: "Tidak ada data inventaris",
      rowGenerator: (item) => {
        const stokStatus = this.getStokStatus(item.sisa_stok);

        return `
    <tr class="table-row">
      <td><span class="fw-semibold">${item.kode_produk || item.id}</span></td>
      <td>${item.nama}</td>
      <td><span class="badge bg-light text-dark border">${item.unit}</span></td>
      <td>
        <input 
          type="number" 
          class="form-control form-control-sm stok-input" 
          value="${item.sisa_stok}" 
          min="0" 
          data-product-id="${item.id}" 
          data-original-value="${item.sisa_stok}"
        >
      </td>
      <td class="text-center">
        <div class="btn-group btn-group-sm">
          <button 
            class="btn btn-primary save-stok-btn" 
            data-product-id="${item.id}" 
            disabled
          >
            <i class="bi bi-check-lg"></i> Simpan
          </button>
          <button 
            class="btn btn-outline-secondary btn-edit-product" 
            data-product-id="${item.id}" 
            title="Edit Detail Produk"
          >
            <i class="bi bi-pencil-square"></i>
          </button>
          <button 
            class="btn btn-outline-danger btn-delete-product" 
            data-product-id="${item.id}" 
            title="Hapus Produk"
          >
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `;
      },
    });
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

    this.renderTable(
      "dashboard-hutang-vendor-body",
      details.hutangJatuhTempo.filter(Boolean),
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

    this.renderAlerts(details.alerts);
  }

  renderAlerts(alerts) {
    const container = document.getElementById("dashboard-alerts");
    if (!container || !alerts.length) return;

    container.innerHTML = `
      <div class="card glass-card">
        <div class="card-header">
          <h6 class="mb-0"><i class="bi bi-bell me-2"></i>Peringatan</h6>
        </div>
        <div class="card-body p-0">
          ${alerts
            .map(
              (alert) => `
            <div class="alert alert-${alert.type} border-0 rounded-0 mb-0">
              <div class="d-flex justify-content-between align-items-center">
                <div>
                  <strong>${alert.title}</strong>
                  <div class="small">${alert.message}</div>
                </div>
                <a href="${alert.target}" class="btn btn-sm btn-outline-${alert.type} alert-action-btn">
                  ${alert.action}
                </a>
              </div>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `;
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
}

export { AdminRenderer };
