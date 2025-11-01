// HTML/js/admin/app.js

import { supabase } from "../utils.js";
import { AppConfig } from "../config.js";
import {
  Logger,
  UIUtils,
  CurrencyFormatter,
  StorageUtils,
  APIClient,
  UpdateManager,
} from "../utils.js";
import { PrintUtils } from "./print-utils.js";
import { SecurityValidator } from "./security.js";
import { AdminState } from "./state.js";
import { localData } from "./state.js";
import { AdminAnalytics } from "./analytics.js";
import { AdminRenderer } from "./renderer.js";
import { AdminModalManager } from "./barangMasuk.js";
import { AdminUploadManager } from "./uploadManager.js";
import { AdminNavigationManager } from "./navigationManager.js";
import { AutocompleteInput } from "./autocomplete.js";
import { ExcelUtils } from "./excel-utils.js";

class AdminController {
  constructor() {
    this.isInitialized = false;
    this.state = new AdminState();
    this.renderer = new AdminRenderer(this.state);
    this.modalManager = new AdminModalManager(this.state);
    this.uploadManager = new AdminUploadManager(this.state, this.renderer, this);
    this.navigationManager = new AdminNavigationManager();
    this.elements = {};
    this.barangAutocomplete = null;
    this.passwordProtectedActionTarget = null;
    this.userList = [];
    this.poBarangAutocomplete = null;
    this.productPagination = {
      currentPage: 1,
      limit: 20,
      totalProducts: 0,
      searchTerm: "",
    };
    this.returBarangAutocomplete = null;
    this.editTransactionAutocomplete = null;
    this.activePiutangFilter = {};
    this.activeHutangFilter = {};
    this.debouncedLoadFilteredPiutang = UIUtils.debounce(
      () => this.loadFilteredPiutang(true),
      300
    );
    this.debouncedLoadFilteredHutang = UIUtils.debounce(
      () => this.loadFilteredHutang(true),
      300
    );
  }

  async init() {
    try {
      if (this.isInitialized) return;
      this.showLoader(true, "Menginisialisasi Panel...");
      this.checkAuth();
      this.bindElements();
      this.setupEventListeners();
      await this.loadInitialData();
      this.handleResumeNotaSession();
      const defaultFilterButton = document.querySelector(
        '#date-range-presets .btn[data-range="30"]'
      );
      if (defaultFilterButton) {
        this.handleDashboardPresetFilter(defaultFilterButton);
      }
      this.isInitialized = true;
    } catch (error) {
      Logger.error("Inisialisasi Admin Panel Gagal Total", error);
      this.showLoader(false, "Inisialisasi Gagal", true);
    } finally {
      this.showLoader(false);
    }
  }

  checkAuth() {
    const sessionData = StorageUtils.getItem(AppConfig.STORAGE_KEYS.USER);
    const userRole = sessionData?.custom_profile?.role?.toLowerCase();

    // Perubahan: Izinkan 'user' masuk, tapi berikan batasan nanti
    if (!userRole) {
      Logger.warn("Akses ditolak. Pengguna tidak login.");
      UIUtils.createToast("error", "Anda tidak memiliki akses ke halaman ini.");
      setTimeout(
        () => (window.location.href = "../../" + AppConfig.ROUTES.LOGIN),
        2000
      );
      return false;
    }

    this.state.setUser(sessionData.user);
    const adminGreeting = document.getElementById("admin-greeting");
    if (adminGreeting) {
      adminGreeting.textContent = sessionData.custom_profile.nama || "Pengguna";
    }

    // Terapkan batasan untuk role 'user'
    if (userRole === "user") {
      this.applyUserRoleRestrictions();
    }

    return true;
  }

  applyUserRoleRestrictions() {
    // Sembunyikan semua tab navigasi kecuali Piutang Outlet
    const navLinks = document.querySelectorAll(
      "#admin-nav .nav-link, #admin-nav-mobile .nav-link"
    );
    navLinks.forEach((link) => {
      const target = link.getAttribute("data-bs-target");
      if (target !== "#piutang-outlet") {
        link.parentElement.style.display = "none";
      } else {
        // Pastikan tab piutang aktif
        link.classList.add("active");
        link.setAttribute("aria-selected", "true");
        const correspondingPane = document.querySelector(target);
        if (correspondingPane) {
          correspondingPane.classList.add("show", "active");
        }
      }
    });

    // Sembunyikan dashboard yang aktif by default
    const dashboardTab = document.querySelector(
      'button[data-bs-target="#dashboard"]'
    );
    const dashboardPane = document.getElementById("dashboard");
    if (dashboardTab && dashboardPane) {
      dashboardTab.classList.remove("active");
      dashboardTab.setAttribute("aria-selected", "false");
      dashboardPane.classList.remove("show", "active");
    }

    // Nonaktifkan semua tombol kecuali yang diizinkan di tab Piutang
    document.addEventListener("DOMContentLoaded", () => {
      const piutangTabContent = document.getElementById("piutang-outlet");
      if (piutangTabContent) {
        // Nonaktifkan semua tombol di dalam tab piutang
        const allButtons = piutangTabContent.querySelectorAll("button");
        allButtons.forEach((btn) => {
          // Izinkan tombol 'Buat Tagihan' dan 'Print'
          if (
            !btn.classList.contains("btn-print-invoice") &&
            btn.id !== "buatTagihanBtn"
          ) {
            btn.disabled = true;
            btn.style.pointerEvents = "none";
            btn.title = "Akses terbatas";
          }
        });

        // Sembunyikan tombol-tombol yang tidak seharusnya ada
        const statusToggles =
          piutangTabContent.querySelectorAll(".status-toggle");
        const editButtons = piutangTabContent.querySelectorAll(
          ".btn-edit-transaction"
        );
        const deleteButtons = piutangTabContent.querySelectorAll(
          ".btn-delete-transaction"
        );

        statusToggles.forEach((el) => el.parentElement.parentElement.remove());
        editButtons.forEach((el) => el.remove());
        deleteButtons.forEach((el) => el.remove());
      }
    });
  }

  bindElements() {
    this.elements = {
      totalPiutangCard: document.getElementById("total-piutang-card"),
      totalHutangCard: document.getElementById("total-hutang-card"),
      jumlahProdukCard: document.getElementById("jumlah-produk-card"),
      stokHabisCard: document.getElementById("stok-habis-card"),
      refreshDataBtn: document.getElementById("refreshDataBtn"),
      vendorSelect: document.getElementById("vendorSelect"),
      noNotaInput: document.getElementById("noNota"),
      tanggalNotaInput: document.getElementById("tanggalNota"),
      tanggalJatuhTempoInput: document.getElementById("tanggalJatuhTempo"),
      startNotaSessionBtn: document.getElementById("startNotaSessionBtn"),
      formTambahItem: document.getElementById("formTambahItem"),
      barangSearchInput: document.getElementById("barangSearchInput"),
      itemQty: document.getElementById("itemQty"),
      itemHarga: document.getElementById("itemHarga"),
      addItemBtn: document.getElementById("addItemBtn"),
      previewTableBody: document.getElementById("tabelBarangMasukPreview"),
      simpanSemuaBtn: document.getElementById("simpanSemuaBtn"),
      hapusSemuaBtn: document.getElementById("hapusSemuaBtn"),
      loader: document.getElementById("loader"),
      mainContent: document.getElementById("main-content-tabs"),
      // Purchase Order Elements
      poBarangSearchInput: document.getElementById("poBarangSearchInput"),
      poItemQty: document.getElementById("poItemQty"),
      addPOItemBtn: document.getElementById("addPOItemBtn"),
    };
  }

  setupEventListeners() {
    this.state.subscribe(this.handleStateUpdate.bind(this));
    this.navigationManager.setupNavigation();
    const mainContent = document.getElementById("main-content-tabs");
    const inventarisSearch = document.getElementById("inventaris-search");
    const inventarisClearBtn = document.getElementById(
      "inventaris-clear-search"
    );

    document.getElementById("userForm")?.addEventListener("input", () => {
      this.updateUserFormState();
    });

    document
      .getElementById("showAddUserModalBtn")
      ?.addEventListener("click", () => this.showUserModal());

    document
      .getElementById("userForm")
      ?.addEventListener("submit", (e) => this.handleSaveUser(e));

    document
      .getElementById("showAddVendorModalBtn")
      ?.addEventListener("click", () => this.showVendorModal());

    document
      .getElementById("vendorForm")
      ?.addEventListener("submit", (e) => this.handleSaveVendor(e));

    const notaFormInputs = [
      this.elements.vendorSelect,
      this.elements.noNotaInput,
      this.elements.tanggalNotaInput,
      this.elements.tanggalJatuhTempoInput,
    ];

    notaFormInputs.forEach((input) => {
      if (input) {
        input.addEventListener("change", () => this.checkNotaFormState());
        input.addEventListener("input", () => this.checkNotaFormState());
      }
    });

    document
      .getElementById("saveTransactionChangesBtn")
      ?.addEventListener("click", () => this.handleUpdateTransaction());

    document
      .getElementById("formAddItemToTransaction")
      ?.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleAddItemToTransaction();
      });

    document
      .getElementById("editTransactionItemsBody")
      ?.addEventListener("click", (e) => {
        if (e.target.closest(".btn-remove-item")) {
          e.target.closest("tr").remove();
          this.updateEditModalTotal();
        }
      });

    document
      .getElementById("editTransactionItemsBody")
      ?.addEventListener("input", (e) => {
        if (e.target.classList.contains("edit-item-input")) {
          this.updateEditModalTotal();
        }
      });

    const inventarisSearchInput = document.getElementById("inventaris-search");
    const debouncedProductSearch = UIUtils.debounce(() => {
      this.productPagination.searchTerm = inventarisSearchInput.value;
      this.loadPaginatedProducts(1); // Selalu mulai dari halaman 1 saat mencari
    }, 500);
    inventarisSearchInput?.addEventListener("input", debouncedProductSearch);

    document
      .getElementById("inventaris-clear-search")
      ?.addEventListener("click", () => {
        inventarisSearchInput.value = "";
        this.productPagination.searchTerm = "";
        this.loadPaginatedProducts(1);
      });

    document
      .getElementById("pagination-controls")
      ?.addEventListener("click", (e) => {
        if (e.target.tagName === "BUTTON") {
          const page = parseInt(e.target.dataset.page, 10);
          if (page) {
            this.loadPaginatedProducts(page);
          }
        }
      });

    inventarisClearBtn?.addEventListener("click", () => {
      inventarisSearch.value = "";
      this.renderer.renderInventarisTable();
    });

    this.elements.refreshDataBtn?.addEventListener("click", () =>
      this.refreshDashboard()
    );

    this.elements.formTambahItem?.addEventListener("submit", (e) => {
      e.preventDefault();
      this.handleAddItem();
    });

    this.elements.startNotaSessionBtn?.addEventListener("click", () =>
      this.handleStartNotaSession()
    );

    this.elements.simpanSemuaBtn?.addEventListener("click", () =>
      this.handleSubmitBarangMasuk()
    );

    this.elements.hapusSemuaBtn?.addEventListener("click", () => {
      if (confirm("Yakin ingin menghapus semua item dari daftar?")) {
        this.state.clearBarangMasuk();
      }
    });

    document
      .getElementById("addProductForm")
      ?.addEventListener("submit", (e) => this.handleAddNewProduct(e));

    document
      .getElementById("editProductForm")
      ?.addEventListener("submit", (e) => this.handleUpdateProduct(e));

    document.addEventListener("click", (e) => {
      this.handleProtectedActionClick(e);
      this.handleDynamicClicks(e);
    });

    document.addEventListener("input", (e) => {
      if (e.target.classList.contains("stok-input")) {
        this.handleStokInputChange(e.target);
      }
    });

    document.addEventListener("shown.bs.tab", (e) =>
      this.handleTabChange(e.target)
    );

    document.body.addEventListener("click", async (e) => {
      if (e.target.closest("#logoutBtn")) {
        if (confirm("Yakin ingin logout dari panel admin?")) {
          UIUtils.createToast("info", "Logging out...");
          await supabase.auth.signOut();
          StorageUtils.clear();
          window.location.href = "../../" + AppConfig.ROUTES.LOGIN;
        }
      }
      if (e.target.closest("#profileBtn")) {
        UIUtils.createToast("info", "Fitur Profil akan segera tersedia.");
      }
      if (e.target.closest("#resetNotaSession")) {
        this.state.clearBarangMasuk();
        this.toggleNotaForm(true);
        this.toggleItemForm(false);
        document.getElementById("formNotaVendor")?.reset();
        this.checkNotaFormState();
        UIUtils.createToast("info", "Sesi nota direset.");
        return;
      }
    });

    document
      .getElementById("passwordForm")
      ?.addEventListener("submit", (e) => this.handlePasswordVerification(e));

    document
      .getElementById("closeHistoryBtn")
      ?.addEventListener("click", () => {
        const dashboardTab = new bootstrap.Tab(
          document.querySelector('button[data-bs-target="#dashboard"]')
        );
        dashboardTab.show();
      });
    document
      .getElementById("templateLaporanBtn")
      ?.addEventListener("click", () => this.showTemplateEditor());
    document
      .getElementById("closeTemplateBtn")
      ?.addEventListener("click", () => this.hideTemplateEditor());

    document.getElementById("buatTagihanBtn")?.addEventListener("click", () => {
      document.getElementById("reportType").value = "piutang";
      document.getElementById("reportAction").value = "print"; // Set aksi menjadi print
      document
        .getElementById("outletFilterContainer")
        .classList.remove("d-none");
      this.populateOutletFilterForModal();
      const modal = new bootstrap.Modal(
        document.getElementById("dateRangeModal")
      );
      modal.show();
    });

    // Modifikasi listener yang sudah ada untuk "Buat Laporan Vendor"
    document
      .getElementById("buatLaporanVendorBtn")
      ?.addEventListener("click", () => {
        document.getElementById("reportType").value = "hutang";
        document.getElementById("reportAction").value = "print"; // Set aksi menjadi print
        document
          .getElementById("outletFilterContainer")
          .classList.add("d-none");
        const modal = new bootstrap.Modal(
          document.getElementById("dateRangeModal")
        );
        modal.show();
      });

    document
      .getElementById("dateRangeForm")
      ?.addEventListener("submit", (e) => this.handleReportGeneration(e));
    document
      .getElementById("saveOutletTemplateBtn")
      ?.addEventListener("click", () => {
        this.handleSaveTemplate(
          "outlet_invoice",
          "outletInvoiceTemplateEditor"
        );
      });
    document
      .getElementById("saveVendorTemplateBtn")
      ?.addEventListener("click", () => {
        this.handleSaveTemplate("vendor_report", "vendorReportTemplateEditor");
      });
    document
      .getElementById("formPODetail")
      ?.addEventListener("input", () => this.checkPOFormState());
    document
      .getElementById("startPOSessionBtn")
      ?.addEventListener("click", () => this.handleStartPOSession());
    document
      .getElementById("formTambahPOItem")
      ?.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleAddPOItem();
      });
    document
      .getElementById("simpanPOBtn")
      ?.addEventListener("click", () => this.handleSubmitPurchaseOrder());
    document
      .getElementById("hapusSemuaPOBtn")
      ?.addEventListener("click", () => {
        if (confirm("Yakin ingin menghapus semua item dari daftar PO?")) {
          this.state.clearPurchaseOrder();
        }
      });

    // **** START: UX Improvement for Purchase Order ****
    if (this.elements.poBarangSearchInput) {
      this.elements.poBarangSearchInput.addEventListener(
        "item-selected-by-enter",
        () => {
          this.elements.poItemQty.focus();
        }
      );
    }

    if (this.elements.poItemQty) {
      this.elements.poItemQty.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.elements.addPOItemBtn.click();
        }
      });
    }
    // **** END: UX Improvement for Purchase Order ****
    const piutangFilters = [
      "piutang-outlet-filter",
      "piutang-month-filter",
      "piutang-year-filter",
    ];
    piutangFilters.forEach((id) => {
      document
        .getElementById(id)
        ?.addEventListener("change", () => this.loadFilteredPiutang());
    });
    document
      .getElementById("piutang-filter-reset")
      ?.addEventListener("click", () => {
        document.getElementById("piutang-outlet-filter").value = "";
        this.populateDateFilters("piutang-month-filter", "piutang-year-filter");
        this.loadFilteredPiutang();
      });

    const debouncedPiutangSearch = UIUtils.debounce(async () => {
      const searchTerm = document.getElementById("piutang-search").value;
      if (searchTerm.length < 3) {
        this.loadFilteredPiutang(); // Kembali ke filter jika search dihapus
        return;
      }
      this.renderer.renderPiutangTable([], true); // Tampilkan loader
      try {
        const { data, error } = await APIClient.get("manage-transactions", {
          type: "piutang",
          search_term: searchTerm,
        });
        if (error) throw error;
        this.renderer.renderPiutangTable(data);
      } catch (err) {
        this.renderer.renderPiutangTable([], false, true);
      }
    }, 500);
    document
      .getElementById("piutang-search")
      ?.addEventListener("input", debouncedPiutangSearch);

    const dashboardHeader = document.querySelector(
      "#dashboard .admin-page-header"
    );
    if (dashboardHeader) {
      dashboardHeader.addEventListener("click", (e) => {
        const button = e.target.closest("button");
        if (!button) return;

        if (button.parentElement.id === "date-range-presets") {
          this.handleDashboardPresetFilter(button);
        } else if (button.id === "applyCustomDate") {
          this.handleDashboardCustomFilter();
        } else if (button.id === "custom-range-btn") {
          this.toggleCustomDateInputs();
        }
      });
    }

    const hutangFilters = ["hutang-month-filter", "hutang-year-filter"];
    hutangFilters.forEach((id) => {
      document
        .getElementById(id)
        ?.addEventListener("change", () => this.loadFilteredHutang());
    });
    document
      .getElementById("hutang-filter-reset")
      ?.addEventListener("click", () => {
        this.populateDateFilters("hutang-month-filter", "hutang-year-filter");
        this.loadFilteredHutang();
      });

    const debouncedHutangSearch = UIUtils.debounce(async () => {
      const searchTerm = document.getElementById("hutang-search").value;
      if (searchTerm.length < 3) {
        this.loadFilteredHutang(); // Kembali ke filter jika search dihapus
        return;
      }
      this.renderer.renderHutangTable([], true);
      try {
        const { data, error } = await APIClient.get("manage-transactions", {
          type: "hutang",
          search_term: searchTerm,
        });
        if (error) throw error;
        this.renderer.renderHutangTable(data);
      } catch (err) {
        this.renderer.renderHutangTable([], false, true);
      }
    }, 500);
    document
      .getElementById("hutang-search")
      ?.addEventListener("input", debouncedHutangSearch);
    if (this.elements.barangSearchInput) {
      this.elements.barangSearchInput.addEventListener(
        "item-selected-by-enter",
        () => {
          this.elements.itemQty.focus();
        }
      );
    }

    if (this.elements.itemQty) {
      this.elements.itemQty.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.elements.itemHarga.focus(); // Pindah ke input harga
        }
      });
    }

    if (this.elements.itemHarga) {
      this.elements.itemHarga.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.elements.addItemBtn.click(); // Klik tombol tambah item
        }
      });
    }
    // **** START: RETURN EVENT LISTENERS ****
    document
      .getElementById("formReturHeader")
      ?.addEventListener("input", () => this.checkReturFormState());
    document
      .getElementById("startReturSessionBtn")
      ?.addEventListener("click", () => this.handleStartReturnSession());
    document
      .getElementById("formTambahReturItem")
      ?.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleAddReturnItem();
      });
    document
      .getElementById("simpanReturBtn")
      ?.addEventListener("click", () => this.handleSubmitReturn());
    document
      .getElementById("hapusSemuaReturBtn")
      ?.addEventListener("click", () => {
        if (confirm("Yakin ingin menghapus semua item dari daftar retur?")) {
          this.state.clearReturnList();
        }
      });
    const mobileNavContainer = document.getElementById("mobileSidebar");
    if (mobileNavContainer) {
      mobileNavContainer.addEventListener("click", (e) => {
        if (e.target.closest(".nav-link")) {
          const offcanvasInstance =
            bootstrap.Offcanvas.getInstance(mobileNavContainer);
          if (offcanvasInstance) {
            offcanvasInstance.hide();
          }
        }
      });
    }
    document
      .getElementById("exportPiutangBtn")
      ?.addEventListener("click", () => {
        document.getElementById("reportType").value = "piutang";
        document.getElementById("reportAction").value = "export"; // Set aksi menjadi export
        document
          .getElementById("outletFilterContainer")
          .classList.remove("d-none");
        this.populateOutletFilterForModal();
        const modal = new bootstrap.Modal(
          document.getElementById("dateRangeModal")
        );
        modal.show();
      });

    document
      .getElementById("exportHutangBtn")
      ?.addEventListener("click", () => {
        document.getElementById("reportType").value = "hutang";
        document.getElementById("reportAction").value = "export"; // Set aksi menjadi export
        document
          .getElementById("outletFilterContainer")
          .classList.add("d-none");
        const modal = new bootstrap.Modal(
          document.getElementById("dateRangeModal")
        );
        modal.show();
      });
  }

  handleStateUpdate(event, data) {
    if (event === "dashboard-filter-changed") {
      this.refreshDashboard();
    }
    if (
      event === "return-session-started" ||
      event === "return-item-added" ||
      event === "return-item-removed" ||
      event === "return-cleared"
    ) {
      this.renderer.renderReturnPreview();
    }
    if (
      event === "barang-masuk-updated" ||
      event === "barang-masuk-added" ||
      event === "barang-masuk-removed" ||
      event === "barang-masuk-cleared"
    ) {
      this.renderer.renderBarangMasukPreview();
    }
    if (event === "data-updated") {
      this.refreshDashboard();
      if (data.key === "inventaris") {
        this.setupBarangAutocomplete(data.value);
        const masterProdukTab = document.querySelector(
          "#master-produk-tab.active"
        );
        if (masterProdukTab) {
          this.renderer.renderInventarisTable();
        }
      }
      if (data.key === "vendors") {
        this.renderer.renderVendorOptions(data.value);
        this.renderer.renderVendorsTable();
      }
      if (data.key === "receivables") {
        const piutangTab = document.querySelector("#piutang-outlet-tab.active");
        if (piutangTab) {
          this.renderer.renderPiutangTable();
        }
      }
      if (data.key === "hutang") {
        const hutangTab = document.querySelector("#hutang-vendor-tab.active");
        if (hutangTab) {
          this.renderer.renderHutangTable();
        }
      }
    }
    if (
      event === "po-updated" ||
      event === "po-item-added" ||
      event === "po-item-removed" ||
      event === "po-cleared"
    ) {
      this.renderer.renderPurchaseOrderPreview();
    }
    if (event === "connection-changed") {
      const onlineOnlyButtons = document.querySelectorAll(
        ".upload-bukti-btn, #refreshDataBtn"
      );
      onlineOnlyButtons.forEach((btn) => {
        btn.disabled = !data.isOnline;
        btn.title = data.isOnline
          ? ""
          : "Fitur ini memerlukan koneksi internet";
      });
      return;
    }
  }

  async loadInitialData() {
    this.showLoader(true, "Mencoba sinkronisasi data...");
    try {
      if (this.state.isOffline) {
        throw new Error("Sedang offline, memuat dari cache.");
      }
      const { data: adminData, error } = await APIClient.get("get-admin-data");
      if (error) throw error;

      await localData.syncAllData(adminData);
      UIUtils.createToast("success", "Data berhasil disinkronkan.");
    } catch (error) {
      UIUtils.createToast("info", "Memuat data dari penyimpanan lokal...");
    } finally {
      await this.state.loadDataFromCache();
      this.showLoader(false);
    }
  }

  refreshDashboard() {
    const summaryData = this.state.getSummaryData();
    const detailsData = this.state.getDashboardDetails();
    this.renderer.renderSummaryCards(summaryData);
    this.renderer.renderDashboardDetails(detailsData);
  }

  setupBarangAutocomplete(inventaris) {
    this.barangAutocomplete = new AutocompleteInput(
      "barangSearchInput",
      "barangAutocompleteResults",
      inventaris
    );
  }

  handleAddItem() {
    if (!this.state.getCurrentNotaSession()) {
      UIUtils.createToast("error", "Harap mulai sesi nota terlebih dahulu.");
      return;
    }

    const selectedProduct = this.barangAutocomplete.getSelectedItem();
    const searchInputValue = this.elements.barangSearchInput.value;
    if (!selectedProduct && searchInputValue) {
      UIUtils.showConfirmationModal(
        `Produk "${searchInputValue}" tidak ada di master. Tambahkan sebagai produk baru?`,
        () => {
          const addProductModal = new bootstrap.Modal(
            document.getElementById("addProductModal")
          );
          document.getElementById("addNamaProduk").value = searchInputValue;
          addProductModal.show();
        }
      );
      return;
    }

    if (!selectedProduct) {
      UIUtils.createToast(
        "warning",
        "Pilih produk dari daftar saran terlebih dahulu."
      );
      return;
    }

    const newItem = {
      id_barang: selectedProduct.id,
      nama_barang: selectedProduct.nama,
      unit: selectedProduct.unit,
      qty: Number(this.elements.itemQty.value),
      harga: Number(this.elements.itemHarga.value),
    };

    try {
      const result = this.state.addBarangMasuk(newItem);
      if (result.status === "added" || result.status === "merged") {
        this.elements.formTambahItem.reset();
        this.elements.barangSearchInput.value = "";
        this.elements.barangSearchInput.focus();
      }
    } catch (error) {
      UIUtils.createToast("error", error.message);
    }
  }

  async handleSubmitBarangMasuk() {
    const itemsToSubmit = this.state.getData("barangMasukList");
    if (itemsToSubmit.length === 0) return;

    const currentSession = this.state.getCurrentNotaSession();

    const payload = {
      action: "process-incoming-goods",
      items: itemsToSubmit.map((item) => ({
        id_barang: parseInt(item.id_barang, 10),
        qty: item.qty,
        harga: item.harga,
        total: item.total,
      })),
      vendor: { nama_vendor: currentSession.vendor },
      noNota: currentSession.noNota,
      tanggalNota: currentSession.tanggalNota,
      tanggalJatuhTempo: currentSession.tanggalJatuhTempo,
    };

    UIUtils.setLoadingState(this.elements.simpanSemuaBtn, true, "Menyimpan...");
    try {
      const { data, error } = await APIClient.post(
        "manage-transactions",
        payload
      );
      if (error) throw error;

      UIUtils.createToast(
        "success",
        data.message || "Barang masuk berhasil disimpan!"
      );

      this.state.clearBarangMasuk();
      this.toggleNotaForm(true);
      this.toggleItemForm(false);
      document.getElementById("formNotaVendor")?.reset();
      this.checkNotaFormState();
      await this.loadInitialData();
      this.showLoader(false);
    } catch (error) {
      UIUtils.createToast("error", error.message || "Gagal menyimpan data.");
    } finally {
      UIUtils.setLoadingState(this.elements.simpanSemuaBtn, false);
    }
  }

  async handleStartNotaSession() {
    const sessionData = {
      vendor: this.elements.vendorSelect.value,
      noNota: this.elements.noNotaInput.value,
      tanggalNota: this.elements.tanggalNotaInput.value,
      tanggalJatuhTempo: this.elements.tanggalJatuhTempoInput.value,
    };

    const startButton = this.elements.startNotaSessionBtn;
    UIUtils.setLoadingState(startButton, true, "Memvalidasi...");

    try {
      const { data: validation, error: validationError } = await APIClient.post(
        "validate-invoice",
        {
          noNota: sessionData.noNota,
          vendor: sessionData.vendor,
        }
      );

      if (validationError) throw validationError;

      if (validation.exists) {
        throw new Error(
          `Nota "${sessionData.noNota}" dari ${sessionData.vendor} sudah ada.`
        );
      }

      this.state.startNotaSession(
        sessionData.vendor,
        sessionData.noNota,
        sessionData.tanggalNota,
        sessionData.tanggalJatuhTempo
      );

      this.toggleNotaForm(false);
      this.toggleItemForm(true);

      UIUtils.createToast(
        "success",
        `Nota untuk <strong>${sessionData.vendor}</strong> dimulai. Silakan tambah item.`,
        4000
      );

      this.elements.barangSearchInput.focus();
    } catch (error) {
      Logger.error("Gagal memulai sesi nota", error);
      UIUtils.createToast("error", error.message);
    } finally {
      UIUtils.setLoadingState(startButton, false); // Kembalikan state tombol
    }
  }

  toggleNotaForm(enable) {
    this.elements.vendorSelect.disabled = !enable;
    this.elements.noNotaInput.disabled = !enable;
    this.elements.tanggalNotaInput.disabled = !enable;
    this.elements.tanggalJatuhTempoInput.disabled = !enable;
    this.elements.startNotaSessionBtn.disabled = !enable;
  }

  toggleItemForm(enable) {
    const form = this.elements.formTambahItem;
    if (form) {
      const itemInputs = form.querySelectorAll("input, button");
      itemInputs.forEach((input) => {
        input.disabled = !enable;
      });
    }
  }

  checkNotaFormState() {
    const isVendorSelected = this.elements.vendorSelect.value;
    const isNoNotaFilled = this.elements.noNotaInput.value.trim() !== "";
    const isTanggalNotaFilled = this.elements.tanggalNotaInput.value;
    const isJatuhTempoFilled = this.elements.tanggalJatuhTempoInput.value;

    const isFormComplete =
      isVendorSelected &&
      isNoNotaFilled &&
      isTanggalNotaFilled &&
      isJatuhTempoFilled;

    if (this.elements.startNotaSessionBtn) {
      this.elements.startNotaSessionBtn.disabled = !isFormComplete;
    }
  }

  handleTabChange(tabElement) {
    const tabId = tabElement.getAttribute("data-bs-target");

    switch (tabId) {
      case "#piutang-outlet":
        this.populateDateFilters("piutang-month-filter", "piutang-year-filter");
        this.populateOutletFilterForTab().then(() => {
          this.loadFilteredPiutang();
        });
        break;
      case "#hutang-vendor":
        this.populateDateFilters("hutang-month-filter", "hutang-year-filter");
        this.loadFilteredHutang();
        break;
      case "#master-produk":
        const productStatus = this.state.productFilter.status;
        if (productStatus !== "all") {
          // Jika ada filter aktif dari dashboard, tampilkan data yang sudah difilter dari state
          const filteredProducts = this.state.searchData("", "inventaris", {
            status: productStatus,
          });
          this.renderer.renderInventarisTable(
            filteredProducts,
            false,
            false,
            null
          ); // Kirim null agar paginasi tidak muncul

          // Reset filter agar navigasi manual berikutnya kembali normal
          this.state.productFilter.status = "all";
        } else {
          // Jika tidak ada filter, jalankan pemuatan data normal dengan paginasi
          this.loadPaginatedProducts(1);
        }
        break;
      case "#analytics":
        this.renderer.renderAnalytics();
        break;
      case "#manajemen-vendor":
        this.renderer.renderVendorsTable();
        break;
      case "#manajemen-pengguna":
        this.loadUsersTab();
        break;
      case "#template-editor":
        this.initAndLoadTemplateEditor();
        break;
      case "#history-arsip":
        this.loadArchivedData();
        break;
      case "#purchase-order":
        this.setupPOAutocomplete(this.state.getData("inventaris"));
        this.populateOutletSelect();
        break;
      case "#barang-masuk":
        this.renderer.renderVendorOptions(this.state.getData("vendors")); // TAMBAHKAN BARIS INI
        this.setupBarangAutocomplete(this.state.getData("inventaris"));
        break;
      case "#retur-barang":
        this.setupReturAutocomplete(this.state.getData("inventaris"));
        this.populateReturOutletSelect();
        break;
      default:
        break;
    }
  }

  async loadUsersTab() {
    const tbody = document.getElementById("users-table-body");
    tbody.innerHTML =
      '<tr><td colspan="5" class="text-center py-4">Memuat data pengguna...</td></tr>';
    try {
      const { data: users, error } = await APIClient.post("manage-users", {
        action: "get",
      });
      if (error) throw error;
      this.userList = users;
      this.renderer.renderUsersTable(users);
    } catch (err) {
      UIUtils.createToast(
        "error",
        err.message || "Gagal memuat data transaksi."
      );
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-center text-danger py-4">Gagal memuat data.</td></tr>';
    }
  }

  updateUserFormState() {
    const isEditing = !!document.getElementById("userId").value;
    const namaInput = document.getElementById("userNama");
    const emailInput = document.getElementById("userEmail");
    const passwordInput = document.getElementById("userPassword");
    const passwordHelp = document.getElementById("passwordHelpBlock");
    const outletInput = document.getElementById("userOutlet");
    const roleSelect = document.getElementById("userRole");
    const saveBtn = document.getElementById("saveUserBtn");

    const isNamaValid = namaInput.value.trim().length > 0;
    emailInput.disabled = !isNamaValid;

    const isEmailValid =
      emailInput.value.includes("@") && emailInput.value.includes(".");
    passwordInput.disabled = !isEmailValid;

    const passwordLength = passwordInput.value.length;
    if (passwordLength > 0 && passwordLength < 6) {
      passwordHelp.classList.remove("d-none");
    } else {
      passwordHelp.classList.add("d-none");
    }

    const isPasswordValid = isEditing || passwordLength >= 6;
    outletInput.disabled = !isPasswordValid;

    const isOutletValid = outletInput.value.trim().length > 0;
    roleSelect.disabled = !isOutletValid;

    const canSave =
      isNamaValid && isEmailValid && isPasswordValid && isOutletValid;
    saveBtn.disabled = !canSave;
  }

  showUserModal(user = null) {
    const modalEl = document.getElementById("userModal");
    const modalTitle = document.getElementById("userModalLabel");
    const form = document.getElementById("userForm");
    form.reset();

    const passwordInput = document.getElementById("userPassword");

    if (user) {
      modalTitle.textContent = "Edit Pengguna";
      document.getElementById("userId").value = user.id;
      document.getElementById("userNama").value = user.nama;
      document.getElementById("userEmail").value = user.email;
      document.getElementById("userEmail").disabled = true;
      document.getElementById("userOutlet").value = user.outlet;
      document.getElementById("userRole").value = user.role;
      passwordInput.required = false;
    } else {
      modalTitle.textContent = "Tambah Pengguna Baru";
      document.getElementById("userId").value = "";
      document.getElementById("userEmail").disabled = false;
      passwordInput.required = true;
    }

    const modal = new bootstrap.Modal(modalEl);
    modal.show();
    this.updateUserFormState();
  }

  async handleSaveUser(event) {
    event.preventDefault();
    const submitBtn = document.getElementById("saveUserBtn");
    const id = document.getElementById("userId").value;
    const isEditing = !!id;
    const payload = {
      nama: document.getElementById("userNama").value,
      email: document.getElementById("userEmail").value,
      password: document.getElementById("userPassword").value,
      outlet: document.getElementById("userOutlet").value,
      role: document.getElementById("userRole").value,
    };

    if (isEditing) {
      payload.id = id;
      if (!payload.password) delete payload.password;
    }

    UIUtils.setLoadingState(submitBtn, true, "Menyimpan...");
    try {
      const { error } = await APIClient.post("manage-users", {
        action: isEditing ? "update" : "add",
        payload,
      });
      if (error) throw error;
      UIUtils.createToast(
        "success",
        `Pengguna berhasil ${isEditing ? "diperbarui" : "ditambahkan"}.`
      );
      bootstrap.Modal.getInstance(document.getElementById("userModal")).hide();
      this.loadUsersTab();
    } catch (err) {
      UIUtils.createToast(
        "error",
        err.message || "Gagal memuat data transaksi."
      );
    } finally {
      UIUtils.setLoadingState(submitBtn, false);
    }
  }

  showVendorModal(vendor = null) {
    const modalEl = document.getElementById("vendorModal");
    const modalTitle = document.getElementById("vendorModalLabel");
    const form = document.getElementById("vendorForm");
    form.reset();

    if (vendor) {
      modalTitle.textContent = "Edit Vendor";
      document.getElementById("vendorId").value = vendor.id;
      document.getElementById("vendorNama").value = vendor.nama_vendor;
      document.getElementById("vendorBank").value = vendor.bank || "";
      document.getElementById("vendorRekening").value = vendor.rekening || "";
      document.getElementById("vendorAtasNama").value = vendor.atas_nama || "";
    } else {
      modalTitle.textContent = "Tambah Vendor Baru";
      document.getElementById("vendorId").value = "";
    }

    const modal = new bootstrap.Modal(modalEl);
    modal.show();
  }

  async handleSaveVendor(event) {
    event.preventDefault();
    const submitBtn = document.getElementById("saveVendorBtn");
    const id = document.getElementById("vendorId").value;
    const isEditing = !!id;
    const payload = {
      nama_vendor: document.getElementById("vendorNama").value,
      bank: document.getElementById("vendorBank").value,
      rekening: document.getElementById("vendorRekening").value,
      atas_nama: document.getElementById("vendorAtasNama").value,
    };
    if (isEditing) payload.id = id;

    UIUtils.setLoadingState(submitBtn, true, "Menyimpan...");
    try {
      const { error } = await APIClient.post("manage-vendors", {
        action: isEditing ? "update" : "add",
        payload,
      });
      if (error) throw error;
      UIUtils.createToast(
        "success",
        `Vendor berhasil ${isEditing ? "diperbarui" : "ditambahkan"}.`
      );
      bootstrap.Modal.getInstance(
        document.getElementById("vendorModal")
      ).hide();
      await this.loadInitialData();
      this.showLoader(false);
    } catch (err) {
      UIUtils.createToast(
        "error",
        err.message || "Gagal memuat data transaksi."
      );
    } finally {
      UIUtils.setLoadingState(submitBtn, false);
    }
  }

  handleDynamicClicks(e) {
    const interactiveCard = e.target.closest(".interactive-card");
    if (interactiveCard) {
      const targetTabId = interactiveCard.dataset.targetTab;
      const cardTitle = interactiveCard
        .querySelector(".card-subtitle")
        .textContent.toLowerCase();

      // Logika baru untuk mengatur state filter
      if (targetTabId === "#master-produk") {
        if (cardTitle.includes("habis")) {
          this.state.productFilter.status = "habis";
        } else if (cardTitle.includes("rendah")) {
          this.state.productFilter.status = "rendah";
        } else {
          this.state.productFilter.status = "all";
        }
      }

      if (targetTabId) {
        this.navigationManager.navigateToTab(targetTabId);
      }
      return;
    }
    const removeReturItemBtn = e.target.closest(".remove-retur-item-btn");
    if (removeReturItemBtn) {
      const index = parseInt(removeReturItemBtn.dataset.index, 10);
      this.state.removeReturnItem(index);
      return;
    }
    const stockHistoryBtn = e.target.closest(".btn-stock-history");
    if (stockHistoryBtn) {
      const productId = stockHistoryBtn.dataset.productId;
      console.log("Tombol Riwayat diklik untuk Produk ID:", productId); // <-- TAMBAHKAN INI
      this.showStockHistoryModal(productId);
      return;
    }
    const removePOItemBtn = e.target.closest(".remove-po-item-btn");
    if (removePOItemBtn) {
      const index = parseInt(removePOItemBtn.dataset.index, 10);
      if (confirm("Hapus item ini dari pesanan?")) {
        this.state.removePOItem(index);
      }
      return;
    }
    const editVendorBtn = e.target.closest(".btn-edit-vendor");
    if (editVendorBtn) {
      const vendorId = editVendorBtn.dataset.id;
      const vendor = this.state
        .getData("vendors")
        .find((v) => v.id == vendorId);
      if (vendor) this.showVendorModal(vendor);
      return;
    }

    const deleteVendorBtn = e.target.closest(".btn-delete-vendor");
    if (deleteVendorBtn) {
      this.handleDeleteVendor(
        deleteVendorBtn.dataset.id,
        deleteVendorBtn.dataset.name
      );
      return;
    }

    const editUserBtn = e.target.closest(".btn-edit-user");
    if (editUserBtn) {
      const userId = editUserBtn.dataset.id;
      const userToEdit = this.userList.find((user) => user.id === userId);
      if (userToEdit) {
        this.showUserModal(userToEdit);
      }
      return;
    }

    const deleteUserBtn = e.target.closest(".btn-delete-user");
    if (deleteUserBtn) {
      this.handleDeleteUser(
        deleteUserBtn.dataset.id,
        deleteUserBtn.dataset.name
      );
      return;
    }

    const removeBarangBtn = e.target.closest(".remove-barang-btn");
    if (removeBarangBtn) {
      const index = parseInt(removeBarangBtn.dataset.index);
      if (confirm("Hapus item ini dari daftar?")) {
        this.state.removeBarangMasuk(index);
      }
      return;
    }

    const editBarangBtn = e.target.closest(".edit-barang-btn");
    if (editBarangBtn) {
      const index = parseInt(editBarangBtn.dataset.index);
      this.modalManager.showEditModal(index);
      return;
    }

    const statusToggle = e.target.closest(".status-toggle");
    if (statusToggle) {
      this.handleStatusToggle(statusToggle);
      return;
    }

    const editTransactionBtn = e.target.closest(".btn-edit-transaction");
    if (editTransactionBtn) {
      this.showEditTransactionModal(
        editTransactionBtn.dataset.type,
        editTransactionBtn.dataset.id
      );
      return;
    }

    const deleteTransactionBtn = e.target.closest(".btn-delete-transaction");
    if (deleteTransactionBtn) {
      this.handleDeleteTransaction(
        deleteTransactionBtn.dataset.type,
        deleteTransactionBtn.dataset.id
      );
      return;
    }

    const saveStokBtn = e.target.closest(".save-stok-btn");
    if (saveStokBtn) {
      this.handleSaveStok(saveStokBtn);
      return;
    }

    const editProductBtn = e.target.closest(".btn-edit-product");
    if (editProductBtn) {
      this.showEditProductModal(editProductBtn.dataset.productId);
      return;
    }

    const deleteProductBtn = e.target.closest(".btn-delete-product");
    if (deleteProductBtn) {
      this.handleDeleteProduct(deleteProductBtn.dataset.productId);
      return;
    }

    const downloadBtn = e.target.closest(".btn-download-bukti");
    if (downloadBtn) {
      const url = downloadBtn.dataset.url;
      const filename = downloadBtn.dataset.filename;
      this.handleDownloadBukti(url, filename);
      return;
    }

    const deleteBuktiBtn = e.target.closest(".btn-delete-bukti");
    if (deleteBuktiBtn) {
      this.handleDeleteBukti(deleteBuktiBtn);
      return;
    }
    const printInvoiceBtn = e.target.closest(".btn-print-invoice");
    if (printInvoiceBtn) {
      this.handlePrintInvoice(printInvoiceBtn.dataset.id);
      return;
    }
    const unarchiveBtn = e.target.closest(".btn-unarchive");
    if (unarchiveBtn) {
      const type = unarchiveBtn.dataset.type;
      const id = unarchiveBtn.dataset.id;
      this.handleUnarchive(type, id);
      return;
    }
  }
  handleStokInputChange(input) {
    const originalValue = input.dataset.originalValue;
    const currentValue = input.value;
    const productId = input.dataset.productId;
    const saveBtn = document.querySelector(
      `.save-stok-btn[data-product-id="${productId}"]`
    );

    // Aktifkan tombol HANYA jika nilai saat ini berbeda dari nilai asli
    // dan input tidak kosong.
    if (saveBtn) {
      if (currentValue !== originalValue && currentValue.trim() !== "") {
        input.classList.add("changed");
        saveBtn.disabled = false;
      } else {
        input.classList.remove("changed");
        saveBtn.disabled = true;
      }
    }
  }
  async handleDeleteBukti(button) {
    const id = button.dataset.id;
    const type = button.dataset.type;
    const buktiUrl = button.dataset.url;

    if (
      !confirm(
        "Yakin ingin menghapus bukti pembayaran ini? Status akan dikembalikan ke 'Belum Lunas'."
      )
    ) {
      return;
    }
    UIUtils.setLoadingState(button, true);
    try {
      const { error } = await APIClient.delete("manage-proofs", {
        type,
        id,
        buktiUrl,
      });
      if (error) throw error;

      this.state.updateItemBuktiTransfer(type, id, null);
      this.state.updateItemStatus(type, id, "Belum Lunas");

      UIUtils.createToast("success", "Bukti berhasil dihapus.");
    } catch (err) {
      UIUtils.createToast("error", err.message || "Gagal menghapus bukti.");
    } finally {
      UIUtils.setLoadingState(button, false);
    }
  }

  async handleDeleteUser(userId, userName) {
    if (!confirm(`Yakin ingin menghapus pengguna "${userName}"?`)) return;
    UIUtils.createToast("info", `Menghapus ${userName}...`);
    try {
      const { error } = await APIClient.post("manage-users", {
        action: "delete",
        payload: { id: userId },
      });
      if (error) throw error;
      UIUtils.createToast(
        "success",
        `Pengguna "${userName}" berhasil dihapus.`
      );
      this.loadUsersTab();
    } catch (err) {
      UIUtils.createToast(
        "error",
        err.message || "Gagal memuat data transaksi."
      );
    }
  }

  async handleDeleteVendor(vendorId, vendorName) {
    if (!confirm(`Yakin ingin menghapus vendor "${vendorName}"?`)) return;
    UIUtils.createToast("info", `Menghapus ${vendorName}...`);
    try {
      const { error } = await APIClient.post("manage-vendors", {
        action: "delete",
        payload: { id: vendorId, nama_vendor: vendorName },
      });
      if (error) throw error;
      UIUtils.createToast(
        "success",
        `Vendor "${vendorName}" berhasil dihapus.`
      );
      await this.loadInitialData();
      this.showLoader(false);
    } catch (err) {
      UIUtils.createToast(
        "error",
        err.message || "Gagal memuat data transaksi."
      );
    }
  }

  async showEditTransactionModal(type, id) {
    const modalEl = document.getElementById("editTransactionModal");
    if (!modalEl) return;

    // Inisialisasi Autocomplete jika belum ada
    if (!this.editTransactionAutocomplete) {
      this.editTransactionAutocomplete = new AutocompleteInput(
        "editItemSearch",
        "editItemAutocompleteResults",
        this.state.getData("inventaris")
      );

      // Tambahkan event listener untuk mengisi harga otomatis
      document
        .getElementById("editItemSearch")
        .addEventListener("item-selected", (e) => {
          const selectedProduct = e.detail;
          if (selectedProduct) {
            document.getElementById("editItemQty").focus();
          }
        });
    }

    const modal = new bootstrap.Modal(modalEl);
    const title = document.getElementById("editTransactionModalLabel");
    const itemsBody = document.getElementById("editTransactionItemsBody");
    const totalEl = document.getElementById("editTransactionNewTotal");

    title.textContent = "Memuat data transaksi...";
    itemsBody.innerHTML =
      '<tr><td colspan="5" class="text-center">Memuat...</td></tr>';
    totalEl.textContent = "Rp 0";
    modal.show();

    try {
      const { data, error } = await APIClient.get("manage-transactions", {
        id,
        type,
      });
      if (error) throw error;
      const header = data;
      const items = data.transaction_items || [];
      document.getElementById("editTransactionId").value = header.id;
      document.getElementById("editTransactionType").value = type;

      if (type === "piutang") {
        title.textContent = `Edit Piutang: ${header.invoice_id}`;
        document.getElementById("editTransactionName").value =
          header.outlet_name;
        document.getElementById("editTransactionDate").value = new Date(
          header.tanggal_pengiriman
        )
          .toISOString()
          .split("T")[0];
      } else {
        title.textContent = `Edit Hutang: ${header.no_nota_vendor}`;
        document.getElementById("editTransactionName").value =
          header.nama_vendor;
        document.getElementById("editTransactionDate").value = new Date(
          header.tanggal_nota
        )
          .toISOString()
          .split("T")[0];
      }

      itemsBody.innerHTML = items
        .map((item) => this.createEditTransactionItemRow(item))
        .join("");

      this.updateEditModalTotal();
    } catch (err) {
      UIUtils.createToast(
        "error",
        err.message || "Gagal memuat data transaksi."
      );
      modal.hide();
    }
  }

  async handleDeleteTransaction(type, id) {
    const itemIdentifier = type === "piutang" ? `Invoice ID` : `Nota`;
    if (
      !confirm(
        `Yakin ingin mengarsipkan transaksi ini? Stok akan disesuaikan secara otomatis.`
      )
    ) {
      return;
    }

    UIUtils.createToast("info", "Mengarsipkan transaksi...");
    try {
      const { error } = await APIClient.delete("manage-transactions", {
        type,
        id,
      });
      if (error) throw error;

      UIUtils.createToast("success", "Transaksi berhasil diarsipkan.");
      if (transactionType === "piutang") {
        this.loadFilteredPiutang();
      } else {
        this.loadFilteredHutang();
      }
      this.showLoader(false);
    } catch (err) {
      UIUtils.createToast(
        "error",
        err.message || "Gagal memuat data transaksi."
      );
    }
  }

  updateEditModalTotal() {
    const itemsBody = document.getElementById("editTransactionItemsBody");
    let newTotal = 0;
    itemsBody.querySelectorAll("tr").forEach((row) => {
      const qtyValue = row
        .querySelector('input[data-field="quantity"]')
        .value.replace(",", ".");
      const priceValue = row
        .querySelector('input[data-field="price"]')
        .value.replace(",", ".");

      const qty = parseFloat(qtyValue) || 0;
      const price = parseFloat(priceValue) || 0;
      const subtotal = qty * price;
      newTotal += subtotal;
      row.querySelector(".subtotal").textContent =
        CurrencyFormatter.format(subtotal);
    });
    document.getElementById("editTransactionNewTotal").textContent =
      CurrencyFormatter.format(newTotal);
  }

  showLoader(show, message = "Memuat data...") {
    if (this.elements.loader) {
      this.elements.loader.querySelector("p").textContent = message;
      this.elements.loader.classList.toggle("d-none", !show);
    }
    this.elements.mainContent?.classList.toggle("d-none", show);
  }
  async handlePrintInvoice(id) {
    UIUtils.createToast("info", "Membuka nota untuk dicetak ulang...");
    try {
      // Langkah 1: Ambil data detail invoice dari backend.
      const { data: invoiceData, error } = await APIClient.get(
        "manage-transactions",
        {
          id: id,
          type: "piutang",
        }
      );

      if (error) throw error;
      if (!invoiceData) throw new Error("Data invoice tidak ditemukan.");

      localStorage.setItem(
        "reprint_transaction_data",
        JSON.stringify(invoiceData)
      );

      const invoiceUrl = "../../struk.html?reprint=true";
      window.open(invoiceUrl, "_blank");
    } catch (err) {
      UIUtils.createToast("error", err.message || "Gagal membuka nota.");
    }
  }
  async handleUpdateTransaction() {
    const submitBtn = document.getElementById("saveTransactionChangesBtn");
    UIUtils.setLoadingState(submitBtn, true, "Menyimpan...");

    try {
      // 1. Kumpulkan semua data dari form modal
      const transactionId = document.getElementById("editTransactionId").value;
      const transactionType = document.getElementById(
        "editTransactionType"
      ).value;

      const newHeaderData = {
        name: document.getElementById("editTransactionName").value,
        date: document.getElementById("editTransactionDate").value,
      };

      const newItems = [];
      document
        .getElementById("editTransactionItemsBody")
        .querySelectorAll("tr")
        .forEach((row) => {
          const qtyValue = row
            .querySelector('input[data-field="quantity"]')
            .value.replace(",", ".");
          const priceValue = row
            .querySelector('input[data-field="price"]')
            .value.replace(",", ".");

          newItems.push({
            product_id: parseInt(row.dataset.itemId, 10),
            quantity: parseFloat(qtyValue),
            price_per_unit: parseFloat(priceValue),
          });
        });

      const payload = {
        action: "update-full-transaction",
        transactionId: parseInt(transactionId, 10),
        transactionType: transactionType,
        newHeaderData: newHeaderData,
        newItems: newItems,
      };

      const { error } = await APIClient.put("manage-transactions", payload);
      if (error) throw error;

      UIUtils.createToast("success", "Transaksi berhasil diperbarui.");
      const modalEl = document.getElementById("editTransactionModal");
      if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
      }
      if (transactionType === "piutang") {
        this.loadFilteredPiutang();
      } else {
        this.loadFilteredHutang();
      }
      this.showLoader(false);
    } catch (err) {
      UIUtils.createToast(
        "error",
        err.message || "Gagal memperbarui transaksi."
      );
    } finally {
      UIUtils.setLoadingState(submitBtn, false, "Simpan Perubahan");
    }
  }
  showEditProductModal(productId) {
    const modalEl = document.getElementById("editProductModal");
    if (!modalEl) return;

    const product = this.state
      .getData("inventaris")
      .find((p) => p.id == productId);
    if (!product) {
      UIUtils.createToast("error", "Produk tidak ditemukan.");
      return;
    }

    // Isi form modal dengan data produk yang ada
    document.getElementById("editProductId").value = product.id;
    document.getElementById("editNamaProduk").value = product.nama;
    document.getElementById("editKodeProduk").value = product.kode_produk;
    document.getElementById("editUnit").value = product.unit;
    document.getElementById("editHargaBeli").value = product.harga_beli;
    document.getElementById("editFotoUrl").value = product.foto || "";

    const modal = new bootstrap.Modal(modalEl);
    modal.show();
  }

  async handleAddNewProduct(event) {
    event.preventDefault();
    const form = event.target;
    const submitBtn = document.getElementById("addProductBtn");
    UIUtils.setLoadingState(submitBtn, true, "Menyimpan...");

    const payload = {
      nama: document.getElementById("addNamaProduk").value,
      kode_produk: document.getElementById("addKodeProduk").value,
      unit: document.getElementById("addUnit").value,
      harga_beli: parseFloat(document.getElementById("addHargaBeli").value),
      sisa_stok: parseFloat(document.getElementById("addStokAwal").value) || 0,
      foto: document.getElementById("addFotoUrl").value,
    };

    try {
      const { error } = await APIClient.post("manage-products", payload);
      if (error) throw error;

      UIUtils.createToast(
        "success",
        `Produk "${payload.nama}" berhasil ditambahkan.`
      );
      bootstrap.Modal.getInstance(form.closest(".modal")).hide();
      form.reset();
      await this.loadInitialData();
      this.showLoader(false); // Muat ulang data untuk menampilkan produk baru
    } catch (err) {
      UIUtils.createToast("error", err.message);
    } finally {
      UIUtils.setLoadingState(submitBtn, false, "Simpan Produk");
    }
  }

  async handleUpdateProduct(event) {
    event.preventDefault();
    const form = event.target;
    const submitBtn = document.getElementById("updateProductBtn");
    UIUtils.setLoadingState(submitBtn, true, "Memperbarui...");

    const productId = parseInt(document.getElementById("editProductId").value, 10);
    const oldProduct = this.state.getData("inventaris").find((p) => p.id === productId);
    if (!oldProduct) {
      UIUtils.createToast(
        "error",
        "Produk lama tidak ditemukan di state. Pembatalan update."
      );
      UIUtils.setLoadingState(submitBtn, false, "Simpan Perubahan");
      return;
    }
    const oldProductClone = structuredClone(oldProduct);
    const newNama = document.getElementById("editNamaProduk").value;
    const newUnit = document.getElementById("editUnit").value;
    const newHargaBeli = parseFloat(
      document.getElementById("editHargaBeli").value
    );
    const newFoto = document.getElementById("editFotoUrl").value;
    const updatesPayload = {
      nama: newNama,
      unit: newUnit,
      harga_beli: newHargaBeli,
      foto: newFoto,
    };
    if (parseFloat(oldProductClone.harga_beli) === newHargaBeli) {
      updatesPayload.harga_jual = parseFloat(oldProductClone.harga_jual);
    } else {
    }
    console.info("[UpdateProduct Payload]", {
      productId: productId,
      updates: updatesPayload,
    });
    const payload = {
      productId: productId,
      updates: updatesPayload,
    };
    try {
      const { error } = await APIClient.put("manage-products", payload);
      if (error) throw error;

      UIUtils.createToast(
        "success",
        `Produk "${payload.updates.nama}" berhasil diperbarui.`
      );
      bootstrap.Modal.getInstance(form.closest(".modal")).hide();
      await this.loadInitialData(); // Muat ulang semua data
      this.showLoader(false); // Pastikan loader disembunyikan
    } catch (err) {
      UIUtils.createToast("error", err.message);
    } finally {
      UIUtils.setLoadingState(submitBtn, false, "Simpan Perubahan");
    }
  }

  async handleDeleteProduct(productId) {
    const product = this.state
      .getData("inventaris")
      .find((p) => p.id == productId);
    if (!product) return;

    if (
      !confirm(`Yakin ingin menghapus (mengarsipkan) produk "${product.nama}"?`)
    ) {
      return;
    }

    try {
      const { error } = await APIClient.delete("manage-products", {
        productId: parseInt(productId, 10),
      });
      if (error) throw error;

      UIUtils.createToast(
        "success",
        `Produk "${product.nama}" berhasil diarsipkan.`
      );
      await this.loadInitialData();
      this.showLoader(false); // Muat ulang data untuk menghapus produk dari tampilan
    } catch (err) {
      UIUtils.createToast("error", err.message);
    }
  }
  async handleSaveStok(saveBtn) {
    const productId = parseInt(saveBtn.dataset.productId, 10);
    const input = document.querySelector(
      `.stok-input[data-product-id="${productId}"]`
    );
    if (!input) return;

    const newStock = parseFloat(input.value);

    if (isNaN(newStock) || newStock < 0) {
      UIUtils.createToast("error", "Nilai stok tidak valid.");
      return;
    }

    UIUtils.setLoadingState(saveBtn, true, "..."); // Tampilkan loading singkat

    const payload = {
      productId: productId,
      updates: {
        sisa_stok: newStock,
      },
    };

    try {
      const { error } = await APIClient.put("manage-products", payload);
      if (error) throw error;

      // Setelah berhasil, nonaktifkan kembali tombol dan perbarui state
      input.dataset.originalValue = newStock;
      input.classList.remove("changed");
      saveBtn.disabled = true;

      // Update state lokal agar tampilan konsisten tanpa perlu reload semua
      const inventaris = this.state.getData("inventaris");
      const productIndex = inventaris.findIndex((p) => p.id === productId);
      if (productIndex > -1) {
        inventaris[productIndex].sisa_stok = newStock;
        this.state.setData("inventaris", inventaris);
      }

      UIUtils.createToast("success", "Stok berhasil diperbarui.");
    } catch (err) {
      UIUtils.createToast("error", err.message);
      input.value = input.dataset.originalValue; // Kembalikan ke nilai semula jika gagal
    } finally {
      UIUtils.setLoadingState(saveBtn, false, "Simpan");
    }
  }
  async handleReportGeneration(event) {
    event.preventDefault();
    const form = event.target;
    const reportType = document.getElementById("reportType").value;
    const reportAction = document.getElementById("reportAction").value; // 'print' atau 'export'
    const startDate = document.getElementById("reportStartDate").value;
    const endDate = document.getElementById("reportEndDate").value;
    const outletSel = document.getElementById("reportOutletSelect");
    const outlet = outletSel ? outletSel.value : "all";
    const outletName =
      outletSel && outletSel.value !== "all"
        ? outletSel.options[outletSel.selectedIndex].text
        : "Semua Outlet";

    const statusSel = document.getElementById("reportStatusSelect");
    const statusFilter = statusSel ? statusSel.value : "all";

    UIUtils.createToast("info", `Mempersiapkan data untuk ${reportAction}...`);
    bootstrap.Modal.getInstance(form.closest(".modal")).hide();

    try {
      const { data: responseData, error: dataError } = await APIClient.post(
        "manage-reports",
        {
          action: "get-finance-report",
          report_type: reportType,
          start_date: startDate,
          end_date: endDate,
          outlet_name: outlet,
          status_filter: statusFilter,
        }
      );
      if (dataError) throw dataError;

      let dataForReport =
        reportType === "piutang" ? responseData.piutang : responseData.hutang;

      if (!dataForReport || dataForReport.length === 0) {
        UIUtils.createToast(
          "warning",
          "Tidak ada data pada rentang tanggal tersebut."
        );
        return;
      }

      const allProducts = this.state.getData("inventaris");

      if (reportAction === "export") {
        if (reportType === "piutang") {
          ExcelUtils.exportPiutangToExcel(
            dataForReport,
            outletName,
            allProducts
          );
        } else {
          ExcelUtils.exportHutangToExcel(dataForReport);
        }
      } else {
        // Asumsi default adalah 'print'
        const templateName =
          reportType === "piutang" ? "outlet_invoice" : "vendor_report";
        const { data: templateData, error: templateError } =
          await APIClient.post("manage-reports", {
            action: "get-template",
            template_name: templateName,
          });
        if (templateError) throw templateError;

        const populatedHtml = PrintUtils.populateTemplate(
          templateData.template_content,
          dataForReport,
          reportType,
          allProducts,
          outletName
        );
        PrintUtils.printDocument(populatedHtml);
      }
    } catch (err) {
      UIUtils.createToast(
        "error",
        err.message || `Gagal membuat ${reportAction}.`
      );
    }
  }

  showTemplateEditor() {
    // Gunakan Bootstrap untuk beralih tab secara programatis
    const templateTab = new bootstrap.Tab(
      document.querySelector('button[data-bs-target="#template-editor"]')
    );
    templateTab.show();
  }

  hideTemplateEditor() {
    // Kembali ke dashboard
    const dashboardTab = new bootstrap.Tab(
      document.querySelector('button[data-bs-target="#dashboard"]')
    );
    dashboardTab.show();
  }
  async initAndLoadTemplateEditor() {
    if (tinymce.get("outletInvoiceTemplateEditor")) {
      // Jika sudah ada, cukup muat ulang datanya.
      await this.loadAllTemplatesForEditor();
      return;
    }

    try {
      // Konfigurasi dasar untuk kedua editor
      const baseConfig = {
        plugins: "code lists link image table wordcount",
        toolbar:
          "undo redo | blocks | bold italic | alignleft aligncenter alignright | bullist numlist outdent indent | link image | code",
        height: 500,
        setup: (editor) => {
          editor.on("init", () => {
            this.loadAllTemplatesForEditor();
          });
        },
      };
      await tinymce.init({
        selector: "#outletInvoiceTemplateEditor",
        ...baseConfig,
      });

      await tinymce.init({
        selector: "#vendorReportTemplateEditor",
        ...baseConfig,
      });
    } catch (err) {
      UIUtils.createToast("error", "Gagal memuat editor teks.");
    }
  }
  async loadAllTemplatesForEditor() {
    // Ambil referensi ke elemen UI
    const outletEditor = tinymce.get("outletInvoiceTemplateEditor");
    const vendorEditor = tinymce.get("vendorReportTemplateEditor");
    const saveOutletBtn = document.getElementById("saveOutletTemplateBtn");
    const saveVendorBtn = document.getElementById("saveVendorTemplateBtn");
    if (!outletEditor || !vendorEditor) {
      return;
    }

    try {
      // 1. Tampilkan status loading dan nonaktifkan tombol
      if (saveOutletBtn) saveOutletBtn.disabled = true;
      if (saveVendorBtn) saveVendorBtn.disabled = true;
      if (outletEditor)
        outletEditor.setContent("<p><em>Memuat template outlet...</em></p>");
      if (vendorEditor)
        vendorEditor.setContent("<p><em>Memuat template vendor...</em></p>");

      // 2. Ambil kedua template dari backend secara paralel untuk efisiensi
      const [outletRes, vendorRes] = await Promise.all([
        APIClient.post("manage-reports", {
          action: "get-template",
          template_name: "outlet_invoice",
        }),
        APIClient.post("manage-reports", {
          action: "get-template",
          template_name: "vendor_report",
        }),
      ]);

      // 3. Periksa jika ada error dari salah satu permintaan
      if (outletRes.error)
        throw new Error(`Template Outlet: ${outletRes.error.message}`);
      if (vendorRes.error)
        throw new Error(`Template Vendor: ${vendorRes.error.message}`);

      // 4. Masukkan konten template ke editor masing-masing
      if (outletEditor) {
        outletEditor.setContent(outletRes.data.template_content || "");
      }
      if (vendorEditor) {
        vendorEditor.setContent(vendorRes.data.template_content || "");
      }
    } catch (err) {
      // 5. Tangani jika terjadi error selama proses
      UIUtils.createToast(
        "error",
        err.message || "Gagal memuat template editor."
      );
      if (outletEditor)
        outletEditor.setContent(
          '<p class="text-danger">Gagal memuat template.</p>'
        );
      if (vendorEditor)
        vendorEditor.setContent(
          '<p class="text-danger">Gagal memuat template.</p>'
        );
    } finally {
      // 6. Apapun hasilnya (sukses/gagal), aktifkan kembali tombol simpan
      if (saveOutletBtn) saveOutletBtn.disabled = false;
      if (saveVendorBtn) saveVendorBtn.disabled = false;
    }
  }

  // FUNGSI BARU 1: Khusus untuk dropdown di dalam modal "Buat Tagihan"
  async populateOutletFilterForModal() {
    const selectEl = document.getElementById("reportOutletSelect");
    if (!selectEl) return;

    selectEl.innerHTML = "<option>Memuat outlet...</option>";
    try {
      const { data: outlets, error } = await APIClient.get("get-outlets");
      if (error) throw error;

      selectEl.innerHTML =
        '<option value="all" selected>🏢 Semua Outlet</option>';
      outlets.forEach((outlet) => {
        const option = document.createElement("option");
        option.value = outlet;
        option.textContent = outlet;
        selectEl.appendChild(option);
      });
    } catch (err) {
      selectEl.innerHTML = '<option value="all">Gagal memuat</option>';
      UIUtils.createToast("error", "Gagal memuat daftar outlet.");
    }
  }

  // FUNGSI BARU 2: Khusus untuk filter di tab Piutang
  async populateOutletFilterForTab() {
    const outletSelect = document.getElementById("piutang-outlet-filter");
    if (!outletSelect) return;

    // Cek jika sudah terisi untuk menghindari load berulang
    if (outletSelect.options.length > 1 && outletSelect.options[0].value !== "")
      return;

    outletSelect.innerHTML = '<option value="">Memuat...</option>';
    try {
      const { data: outlets, error } = await APIClient.get("get-outlets");
      if (error) throw error;
      outletSelect.innerHTML =
        '<option value="">🏢 Semua Outlet</option>' +
        outlets.map((o) => `<option value="${o}">${o}</option>`).join("");
    } catch (err) {
      outletSelect.innerHTML = '<option value="">Gagal memuat</option>';
    }
  }

  async handleSaveTemplate(templateName, editorId) {
    const editor = tinymce.get(editorId);
    if (!editor) {
      UIUtils.createToast("error", "Editor tidak ditemukan.");
      return;
    }

    const content = editor.getContent();
    UIUtils.createToast("info", `Menyimpan template ${templateName}...`);

    try {
      const { error } = await APIClient.post("manage-reports", {
        action: "save-template",
        template_name: templateName,
        template_content: content,
      });

      if (error) throw error;

      UIUtils.createToast("success", "Template berhasil disimpan.");
    } catch (err) {
      UIUtils.createToast("error", err.message || "Gagal menyimpan template.");
    }
  }
  async handleStatusToggle(toggle) {
    const type = toggle.dataset.type;
    const id = parseInt(toggle.dataset.id, 10);
    const newStatus = toggle.checked ? "Lunas" : "Belum Lunas";
    toggle.disabled = true;

    try {
      const dataKey = type === "piutang" ? "piutang" : "hutang";
      const dataList = this.state.getData(dataKey);
      const currentItem = dataList.find((item) => item.id === id);
      const buktiUrl = currentItem ? currentItem.bukti_transfer : null;
      const { error } = await APIClient.put("manage-transactions", {
        action: "update-status",
        type: type,
        id: id,
        newStatus: newStatus,
        buktiUrl: buktiUrl,
      });

      if (error) throw error;

      // Update state di frontend
      this.state.updateItemStatus(type, id, newStatus);
      if (newStatus === "Belum Lunas") {
        this.state.updateItemBuktiTransfer(type, id, null);
      }
      if (type === "piutang") {
        this.debouncedLoadFilteredPiutang();
      } else {
        this.debouncedLoadFilteredHutang();
      }

      UIUtils.createToast(
        "success",
        `Status berhasil diubah menjadi ${newStatus}.`
      );
    } catch (err) {
      UIUtils.createToast("error", err.message || "Gagal mengubah status.");
      toggle.checked = !toggle.checked;
    } finally {
      toggle.disabled = false;
    }
  }
  handleProtectedActionClick(e) {
    const historyBtn = e.target.closest("#historyBtn");
    if (historyBtn) {
      this.passwordProtectedActionTarget = "history-arsip";
      return;
    }

    const userManagementBtn = e.target.closest("#userManagementBtn");
    if (userManagementBtn) {
      this.passwordProtectedActionTarget = "manajemen-pengguna";
      return;
    }
  }

  async handlePasswordVerification(event) {
    event.preventDefault();
    const passwordInput = document.getElementById("superAdminPassword");
    const password = passwordInput.value;
    const modalEl = document.getElementById("passwordModal");
    const modal = bootstrap.Modal.getInstance(modalEl);

    UIUtils.createToast("info", "Memverifikasi...");

    try {
      const { data, error } = await APIClient.post("verify-super-admin", {
        password: password,
      });

      if (error) {
        throw error;
      }

      if (data.success) {
        UIUtils.createToast("success", "Verifikasi berhasil.");
        modal.hide();

        setTimeout(() => {
          if (this.passwordProtectedActionTarget) {
            const targetTab = new bootstrap.Tab(
              document.querySelector(
                `button[data-bs-target="#${this.passwordProtectedActionTarget}"]`
              )
            );
            targetTab.show();
          }
        }, 200);
      } else {
        UIUtils.createToast("error", "Password salah. Coba lagi.");
      }
    } catch (err) {
      UIUtils.createToast(
        "error",
        err.message || "Terjadi kesalahan saat verifikasi."
      );
    } finally {
      passwordInput.value = "";
    }
  }
  async loadArchivedData() {
    const payablesBody = document.getElementById("archived-payables-body");
    const receivablesBody = document.getElementById(
      "archived-receivables-body"
    );

    // Tampilkan pesan loading di kedua tabel
    payablesBody.innerHTML =
      '<tr><td colspan="4" class="text-center">Memuat arsip hutang...</td></tr>';
    receivablesBody.innerHTML =
      '<tr><td colspan="4" class="text-center">Memuat arsip piutang...</td></tr>';

    try {
      // Panggil endpoint BARU dengan metode GET yang lebih sesuai untuk mengambil data
      const { data, error } = await APIClient.get("get-archived-data");

      if (error) throw error; // Jika ada error, lempar ke blok catch

      // Panggil renderer untuk menampilkan data yang berhasil didapat
      this.renderer.renderArchivedPayables(data.payables || []);
      this.renderer.renderArchivedReceivables(data.receivables || []);
    } catch (err) {
      // Tangani jika terjadi error saat memuat data
      UIUtils.createToast("error", "Gagal memuat data arsip.");
      payablesBody.innerHTML =
        '<tr><td colspan="4" class="text-center text-danger">Gagal memuat data.</td></tr>';
      receivablesBody.innerHTML =
        '<tr><td colspan="4" class="text-center text-danger">Gagal memuat data.</td></tr>';
    }
  }
  async handleUnarchive(type, id) {
    if (
      !confirm(
        "Yakin ingin mengaktifkan kembali transaksi ini? Stok akan disesuaikan kembali."
      )
    ) {
      return;
    }

    UIUtils.createToast("info", "Mengembalikan transaksi dari arsip...");
    try {
      const { error } = await APIClient.delete("manage-transactions", {
        type: type,
        id: parseInt(id, 10),
      });
      if (error) throw error;
      UIUtils.createToast("success", "Transaksi berhasil diaktifkan kembali.");
      await this.loadArchivedData();
      await this.loadInitialData();
      this.showLoader(false);
    } catch (err) {
      UIUtils.createToast(
        "error",
        err.message || "Gagal mengembalikan transaksi."
      );
    }
  }
  setupPOAutocomplete(inventaris) {
    if (!this.poBarangAutocomplete) {
      this.poBarangAutocomplete = new AutocompleteInput(
        "poBarangSearchInput",
        "poBarangAutocompleteResults",
        inventaris
      );
    }
  }

  async populateOutletSelect() {
    const selectEl = document.getElementById("poOutletSelect");
    if (!selectEl) return;
    if (selectEl.options.length > 1) return; // Sudah diisi

    selectEl.innerHTML = "<option>Memuat outlet...</option>";
    try {
      const { data: outlets, error } = await APIClient.get("get-outlets");
      if (error) throw error;
      selectEl.innerHTML =
        '<option value="" selected disabled>Pilih Outlet...</option>';
      outlets.forEach((outlet) => {
        const option = document.createElement("option");
        option.value = outlet;
        option.textContent = outlet;
        selectEl.appendChild(option);
      });
    } catch (err) {
      selectEl.innerHTML = '<option value="">Gagal memuat</option>';
      UIUtils.createToast("error", "Gagal memuat daftar outlet.");
    }
  }

  checkPOFormState() {
    const isOutletSelected = document.getElementById("poOutletSelect").value;
    const isTanggalKirimFilled =
      document.getElementById("poTanggalKirim").value;
    const isFormComplete = isOutletSelected && isTanggalKirimFilled;
    document.getElementById("startPOSessionBtn").disabled = !isFormComplete;
  }

  handleStartPOSession() {
    const sessionData = {
      outlet: document.getElementById("poOutletSelect").value,
      tanggalKirim: document.getElementById("poTanggalKirim").value,
      // Hapus tanggal jatuh tempo dari sini
    };
    try {
      this.state.startPOSession(sessionData);
      this.togglePOForm(false);
      this.togglePOItemForm(true);
      UIUtils.createToast(`success`, `PO untuk ${sessionData.outlet} dimulai.`);
      document.getElementById("poBarangSearchInput").focus();
    } catch (error) {
      UIUtils.createToast("error", error.message);
    }
  }

  handleAddPOItem() {
    const selectedProduct = this.poBarangAutocomplete.getSelectedItem();
    if (!selectedProduct) {
      UIUtils.createToast("warning", "Pilih produk dari daftar.");
      return;
    }
    const newItem = {
      product_id: selectedProduct.id,
      nama: selectedProduct.nama,
      unit: selectedProduct.unit,
      harga_jual: selectedProduct.harga_jual,
      sisa_stok: selectedProduct.sisa_stok,
      qty: Number(document.getElementById("poItemQty").value),
    };
    try {
      this.state.addPOItem(newItem);
      document.getElementById("formTambahPOItem").reset();
      document.getElementById("poBarangSearchInput").focus();
    } catch (error) {
      UIUtils.createToast("error", error.message);
    }
  }

  async handleSubmitPurchaseOrder() {
    const poData = this.state.getCurrentPOSession();
    if (!poData || poData.items.length === 0) return;

    const payload = {
      action: "create_purchase_order",
      ...poData,
    };

    const btn = document.getElementById("simpanPOBtn");
    UIUtils.setLoadingState(btn, true, "Menyimpan...");
    try {
      const { data, error } = await APIClient.post(
        "manage-transactions",
        payload
      );
      if (error) throw error;
      UIUtils.createToast(
        "success",
        data.message || "Purchase Order berhasil disimpan!"
      );
      this.state.clearPurchaseOrder();
      this.togglePOForm(true);
      this.togglePOItemForm(false);
      document.getElementById("formPODetail").reset();
      await this.loadInitialData();
      this.showLoader(false); // Refresh data piutang
    } catch (error) {
      UIUtils.createToast("error", error.message || "Gagal menyimpan PO.");
    } finally {
      UIUtils.setLoadingState(btn, false);
    }
  }

  togglePOForm(enable) {
    document.getElementById("poOutletSelect").disabled = !enable;
    document.getElementById("poTanggalKirim").disabled = !enable;
    document.getElementById("startPOSessionBtn").disabled = !enable;
  }

  togglePOItemForm(enable) {
    document.getElementById("poBarangSearchInput").disabled = !enable;
    document.getElementById("poItemQty").disabled = !enable;
    document.getElementById("addPOItemBtn").disabled = !enable;
  }
  handleDashboardPresetFilter(clickedButton) {
    // Nonaktifkan semua tombol preset dan aktifkan yang diklik
    document
      .querySelectorAll("#date-range-presets .btn")
      .forEach((btn) => btn.classList.remove("active"));
    clickedButton.classList.add("active");

    const range = clickedButton.dataset.range;
    let startDate = null;
    let endDate = new Date(); // Hari ini

    if (range === "all") {
      startDate = null;
      endDate = null;
    } else {
      startDate = new Date();
      if (range === "7") {
        startDate.setDate(endDate.getDate() - 7);
      } else if (range === "30") {
        startDate.setDate(endDate.getDate() - 30);
      } else if (range === "month") {
        startDate.setDate(1); // Tanggal 1 bulan ini
      }
    }

    // Atur tanggal ke format YYYY-MM-DD jika tidak null
    const start = startDate ? startDate.toISOString().split("T")[0] : null;
    const end = endDate ? endDate.toISOString().split("T")[0] : null;

    this.state.setDashboardDateRange(start, end);

    // Sembunyikan input custom jika sedang tidak dipakai
    this.toggleCustomDateInputs(false);
  }

  handleDashboardCustomFilter() {
    const start = document.getElementById("startDate").value;
    const end = document.getElementById("endDate").value;
    if (!start || !end) {
      UIUtils.createToast(
        "warning",
        "Harap isi tanggal mulai dan tanggal selesai."
      );
      return;
    }
    this.state.setDashboardDateRange(start, end);
  }

  toggleCustomDateInputs(forceShow = null) {
    const container = document.getElementById("custom-date-range-container");
    const customBtn = document.getElementById("custom-range-btn");

    const shouldShow =
      forceShow !== null ? forceShow : container.style.display === "none";

    if (shouldShow) {
      container.style.display = "flex";
      customBtn.classList.add("active");
    } else {
      container.style.display = "none";
      customBtn.classList.remove("active");
    }
  }
  async showStockHistoryModal(productId) {
    const modalEl = document.getElementById("stockHistoryModal");
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    this.renderer.renderStockHistory([], true);
    modal.show();

    try {
      // Panggil Edge Function yang baru kita buat
      const { data, error } = await APIClient.get("get-stock-history", {
        product_id: productId,
      });
      if (error) throw error;

      // Kirim data yang berhasil didapat ke renderer
      this.renderer.renderStockHistory(data, false, productId);
    } catch (err) {
      UIUtils.createToast("error", `Gagal memuat riwayat: ${err.message}`);
      this.renderer.renderStockHistory([], false, productId, true); // Panggil renderer dengan status error
    }
  }
  populateDateFilters(monthSelectorId, yearSelectorId) {
    const monthSelect = document.getElementById(monthSelectorId);
    const yearSelect = document.getElementById(yearSelectorId);
    const months = [
      "Januari",
      "Februari",
      "Maret",
      "April",
      "Mei",
      "Juni",
      "Juli",
      "Agustus",
      "September",
      "Oktober",
      "November",
      "Desember",
    ];
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    // Populate months
    monthSelect.innerHTML = months
      .map((month, index) => `<option value="${index + 1}">🗓️${month}</option>`)
      .join("");
    monthSelect.value = currentMonth;

    // Populate years
    yearSelect.innerHTML = "";
    for (let i = 0; i < 5; i++) {
      const year = currentYear - i;
      yearSelect.innerHTML += `<option value="${year}">🗓️${year}</option>`;
    }
    yearSelect.value = currentYear;
  }

  async loadFilteredPiutang(useStoredFilter = false) {
    let outlet, month, year;

    if (useStoredFilter) {
      ({ outlet, month, year } = this.activePiutangFilter);
    } else {
      outlet = document.getElementById("piutang-outlet-filter").value;
      month = document.getElementById("piutang-month-filter").value;
      year = document.getElementById("piutang-year-filter").value;
      this.activePiutangFilter = { outlet, month, year };
    }

    this.renderer.renderPiutangTable([], true);
    try {
      const { data, error } = await APIClient.get("manage-transactions", {
        type: "piutang",
        month,
        year,
        outlet_name: outlet || null,
      });
      if (error) throw error;
      this.renderer.renderPiutangTable(data);
    } catch (err) {
      UIUtils.createToast("error", `Gagal memuat data piutang: ${err.message}`);
      this.renderer.renderPiutangTable([], false, true); // Tampilkan error
    }
  }

  async loadFilteredHutang(useStoredFilter = false) {
    let month, year;

    if (useStoredFilter) {
      ({ month, year } = this.activeHutangFilter);
    } else {
      month = document.getElementById("hutang-month-filter").value;
      year = document.getElementById("hutang-year-filter").value;
      // Simpan filter terbaru
      this.activeHutangFilter = { month, year };
    }
    this.renderer.renderHutangTable([], true); // Tampilkan loader
    try {
      const { data, error } = await APIClient.get("manage-transactions", {
        type: "hutang",
        month,
        year,
      });
      if (error) throw error;
      this.renderer.renderHutangTable(data);
    } catch (err) {
      UIUtils.createToast("error", `Gagal memuat data hutang: ${err.message}`);
      this.renderer.renderHutangTable([], false, true); // Tampilkan error
    }
  }
  async loadPaginatedProducts(page = 1) {
    this.productPagination.currentPage = page;
    const { limit, searchTerm } = this.productPagination;

    // Tampilkan status loading di tabel
    this.renderer.renderInventarisTable([], true);

    try {
      const params = { page, limit };
      if (searchTerm) {
        params.search = searchTerm;
      }

      const { data, error } = await APIClient.get("manage-products", params);
      if (error) throw error;

      this.productPagination.totalProducts = data.total_products;

      // Kirim data produk, info paginasi, dan status loading=false ke renderer
      this.renderer.renderInventarisTable(
        data.products,
        false,
        false,
        this.productPagination
      );
    } catch (err) {
      UIUtils.createToast("error", `Gagal memuat produk: ${err.message}`);
      this.renderer.renderInventarisTable([], false, true); // Tampilkan error
    }
  }
  // **** START: RETURN CONTROLLER METHODS ****
  setupReturAutocomplete(inventaris) {
    if (!this.returBarangAutocomplete) {
      this.returBarangAutocomplete = new AutocompleteInput(
        "returBarangSearchInput",
        "returBarangAutocompleteResults",
        inventaris
      );
    }
  }

  async populateReturOutletSelect() {
    const selectEl = document.getElementById("returOutletSelect");
    if (!selectEl || selectEl.options.length > 1) return;

    selectEl.innerHTML = "<option>Memuat outlet...</option>";
    try {
      const { data: outlets, error } = await APIClient.get("get-outlets");
      if (error) throw error;
      selectEl.innerHTML =
        '<option value="" selected disabled>Pilih Outlet...</option>';
      outlets.forEach((outlet) => {
        const option = document.createElement("option");
        option.value = outlet;
        option.textContent = outlet;
        selectEl.appendChild(option);
      });
    } catch (err) {
      selectEl.innerHTML = '<option value="">Gagal memuat</option>';
    }
  }

  checkReturFormState() {
    const isOutletSelected = document.getElementById("returOutletSelect").value;
    const isTanggalFilled = document.getElementById("returTanggal").value;
    document.getElementById("startReturSessionBtn").disabled =
      !isOutletSelected || !isTanggalFilled;
  }

  toggleReturForm(enable) {
    document.getElementById("returOutletSelect").disabled = !enable;
    document.getElementById("returTanggal").disabled = !enable;
    document.getElementById("returCatatan").disabled = !enable;
    document.getElementById("startReturSessionBtn").disabled = !enable;

    document.getElementById("returBarangSearchInput").disabled = enable;
    document.getElementById("returItemQty").disabled = enable;
    document.getElementById("addReturItemBtn").disabled = enable;
  }

  handleStartReturnSession() {
    const sessionData = {
      outlet: document.getElementById("returOutletSelect").value,
      tanggal: document.getElementById("returTanggal").value,
      catatan: document.getElementById("returCatatan").value,
    };
    this.state.startReturnSession(sessionData);
    this.toggleReturForm(false);
    UIUtils.createToast(
      `success`,
      `Sesi retur untuk ${sessionData.outlet} dimulai.`
    );
    document.getElementById("returBarangSearchInput").focus();
  }

  handleAddReturnItem() {
    const selectedProduct = this.returBarangAutocomplete.getSelectedItem();
    if (!selectedProduct) {
      UIUtils.createToast("warning", "Pilih produk dari daftar.");
      return;
    }
    const newItem = {
      product_id: selectedProduct.id,
      nama: selectedProduct.nama,
      unit: selectedProduct.unit,
      price_per_unit: selectedProduct.harga_jual, // Harga saat retur adalah harga jual
      quantity: Number(document.getElementById("returItemQty").value),
      subtotal:
        Number(document.getElementById("returItemQty").value) *
        selectedProduct.harga_jual,
    };
    this.state.addReturnItem(newItem);
    document.getElementById("formTambahReturItem").reset();
    document.getElementById("returBarangSearchInput").focus();
  }

  async handleSubmitReturn() {
    const returnSession = this.state.getCurrentReturnSession();
    const returnList = this.state.getData("returnList");
    if (!returnSession || returnList.length === 0) return;

    const payload = {
      header: {
        outlet: returnSession.outlet,
        tanggal: returnSession.tanggal,
        catatan: returnSession.catatan,
      },
      items: returnList.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        price_per_unit: item.price_per_unit,
      })),
    };

    const btn = document.getElementById("simpanReturBtn");
    UIUtils.setLoadingState(btn, true, "Menyimpan...");
    try {
      const { data, error } = await APIClient.post("manage-returns", payload);
      if (error) throw error;
      UIUtils.createToast(
        "success",
        data.message || "Retur berhasil disimpan!"
      );
      this.state.clearReturnList();
      this.toggleReturForm(true);
      document.getElementById("formReturHeader").reset();
      await this.loadInitialData();
      this.showLoader(false); // Refresh data piutang & stok
    } catch (error) {
      UIUtils.createToast("error", error.message || "Gagal menyimpan retur.");
    } finally {
      UIUtils.setLoadingState(btn, false);
    }
  }
  // **** END: RETURN CONTROLLER METHODS ****
  createEditTransactionItemRow(item) {
    return `
    <tr data-item-id="${item.product_id}">
      <td>${item.products.nama}</td>
      <td><input type="text" inputmode="decimal" class="form-control form-control-sm edit-item-input" data-field="quantity" value="${String(
        item.quantity
      ).replace(".", ",")}"></td>
      <td><input type="text" inputmode="decimal" class="form-control form-control-sm edit-item-input" data-field="price" value="${String(
        item.price_per_unit
      ).replace(".", ",")}"></td>
      <td class="text-end subtotal">${CurrencyFormatter.format(
        item.subtotal
      )}</td>
      <td class="text-center">
        <button type="button" class="btn btn-sm btn-outline-danger btn-remove-item"><i class="bi bi-trash"></i></button>
      </td>
    </tr>`;
  }

  handleAddItemToTransaction() {
    const selectedProduct = this.editTransactionAutocomplete.getSelectedItem();
    if (!selectedProduct) {
      UIUtils.createToast(
        "warning",
        "Pilih produk dari daftar terlebih dahulu."
      );
      return;
    }

    const qty = parseFloat(
      document.getElementById("editItemQty").value.replace(",", ".")
    );
    const transactionType = document.getElementById(
      "editTransactionType"
    ).value;
    const price =
      transactionType === "piutang"
        ? selectedProduct.harga_jual
        : selectedProduct.harga_beli;

    if (isNaN(qty) || qty <= 0) {
      UIUtils.createToast(
        "error",
        "Kuantitas harus diisi dengan angka yang valid."
      );
      return;
    }

    const itemsBody = document.getElementById("editTransactionItemsBody");

    // Cek jika item sudah ada, update kuantitasnya
    const existingRow = itemsBody.querySelector(
      `tr[data-item-id="${selectedProduct.id}"]`
    );
    if (existingRow) {
      const qtyInput = existingRow.querySelector(
        'input[data-field="quantity"]'
      );
      const currentQty = parseFloat(qtyInput.value.replace(",", ".")) || 0;
      qtyInput.value = String(currentQty + qty).replace(".", ",");
    } else {
      // Jika belum ada, tambahkan baris baru
      const newItemData = {
        product_id: selectedProduct.id,
        products: { nama: selectedProduct.nama, unit: selectedProduct.unit },
        quantity: qty,
        price_per_unit: price,
        subtotal: qty * price,
      };
      itemsBody.insertAdjacentHTML(
        "beforeend",
        this.createEditTransactionItemRow(newItemData)
      );
    }

    this.updateEditModalTotal();
    document.getElementById("formAddItemToTransaction").reset();
    this.editTransactionAutocomplete.clear();
    document.getElementById("editItemSearch").focus();
  }
  handleResumeNotaSession() {
    if (this.state.loadNotaSessionFromStorage()) {
      const session = this.state.getCurrentNotaSession();
      // Gunakan konfirmasi modal yang ada
      UIUtils.showConfirmationModal(
        `Ada sesi input barang yang belum selesai untuk nota "${session.noNota}" dari vendor "${session.vendor}". Apakah Anda ingin melanjutkannya?`,
        () => {
          // Jika user klik "Ya, Lanjutkan"
          this.navigationManager.navigateToTab("#barang-masuk");
          this.toggleNotaForm(false);
          this.toggleItemForm(true);
          this.renderer.renderBarangMasukPreview();
          UIUtils.createToast("info", "Sesi sebelumnya berhasil dilanjutkan.");
        },
        () => {
          // Jika user klik "Batal"
          this.state.clearBarangMasuk();
          UIUtils.createToast("warning", "Sesi sebelumnya telah dibatalkan.");
        }
      );
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    const app = new AdminController();
    UpdateManager.checkForUpdates();
    app.init().catch((error) => {
      Logger.error("Inisialisasi Admin Panel Gagal Total", error);
      document.body.innerHTML =
        "<h1>Error Kritis</h1><p>Gagal memuat aplikasi. Cek console untuk detail.</p>";
    });
    window.adminApp = app;
  }, 100);
});


