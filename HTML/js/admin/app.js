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

class AdminController {
  constructor() {
    this.isInitialized = false;
    this.state = new AdminState();
    this.renderer = new AdminRenderer(this.state);
    this.modalManager = new AdminModalManager(this.state);
    this.uploadManager = new AdminUploadManager(this.state, this.renderer);
    this.navigationManager = new AdminNavigationManager();
    this.elements = {};
    this.barangAutocomplete = null;
    this.passwordProtectedActionTarget = null;
    this.userList = [];
    this.poBarangAutocomplete = null;
  }

  async init() {
    try {
      if (this.isInitialized) return;
      this.showLoader(true, "Menginisialisasi Panel...");
      this.checkAuth();
      this.bindElements();
      this.setupEventListeners();
      await this.loadInitialData();
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

    if (userRole !== "admin") {
      Logger.warn("Akses ditolak. Pengguna bukan admin atau tidak login.");
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
      adminGreeting.textContent = sessionData.custom_profile.nama || "Admin";
    }
    return true;
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
      .getElementById("editTransactionForm")
      ?.addEventListener("submit", (e) => this.handleUpdateTransaction(e));

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

    const applyInventarisSearch = UIUtils.debounce(() => {
      this.renderer.renderInventarisTable(inventarisSearch.value);
    }, 300);

    inventarisSearch?.addEventListener("input", applyInventarisSearch);

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

    mainContent?.addEventListener(
      "input",
      UIUtils.debounce((e) => {
        const targetId = e.target.id;
        if (targetId === "piutang-search" || targetId === "hutang-search") {
          const type = targetId.split("-")[0];
          const searchTerm = e.target.value;
          const statusFilter = document.getElementById(
            `${type}-status-filter`
          ).value;
          if (type === "piutang")
            this.renderer.renderPiutangTable(searchTerm, statusFilter);
          if (type === "hutang")
            this.renderer.renderHutangTable(searchTerm, statusFilter);
        }
      }, 300)
    );

    mainContent?.addEventListener("change", (e) => {
      const targetId = e.target.id;
      if (
        targetId === "piutang-status-filter" ||
        targetId === "hutang-status-filter"
      ) {
        const type = targetId.split("-")[0];
        const statusFilter = e.target.value;
        const searchTerm = document.getElementById(`${type}-search`).value;
        if (type === "piutang")
          this.renderer.renderPiutangTable(searchTerm, statusFilter);
        if (type === "hutang")
          this.renderer.renderHutangTable(searchTerm, statusFilter);
      }
    });

    mainContent?.addEventListener("click", (e) => {
      if (
        e.target.id === "piutang-clear-filter" ||
        e.target.id === "hutang-clear-filter"
      ) {
        const type = e.target.id.split("-")[0];
        document.getElementById(`${type}-search`).value = "";
        document.getElementById(`${type}-status-filter`).value = "all";
        if (type === "piutang") this.renderer.renderPiutangTable();
        if (type === "hutang") this.renderer.renderHutangTable();
      }
    });

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
      // 1. Set tipe laporan menjadi 'piutang'
      document.getElementById("reportType").value = "piutang";

      // 2. Tampilkan filter outlet
      document
        .getElementById("outletFilterContainer")
        .classList.remove("d-none");

      // 3. Panggil fungsi untuk mengisi dropdown dengan daftar outlet
      this.populateOutletFilter();
    });

    // Listener untuk tombol "Buat Laporan" di tab Hutang
    document
      .getElementById("buatLaporanVendorBtn")
      ?.addEventListener("click", () => {
        // 1. Set tipe laporan menjadi 'hutang'
        document.getElementById("reportType").value = "hutang";

        // 2. Sembunyikan filter outlet karena tidak relevan untuk laporan vendor
        document
          .getElementById("outletFilterContainer")
          .classList.add("d-none");
      });
    document
      .getElementById("dateRangeForm")
      ?.addEventListener("submit", (e) =>
        this.handleGeneratePrintableReport(e)
      );
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
  }

  handleStateUpdate(event, data) {
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
      if (data.key === "piutang") {
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
    } catch (error) {
      UIUtils.createToast("error", error.message || "Gagal menyimpan data.");
    } finally {
      UIUtils.setLoadingState(this.elements.simpanSemuaBtn, false);
    }
  }

  handleStartNotaSession() {
    const sessionData = {
      vendor: this.elements.vendorSelect.value,
      noNota: this.elements.noNotaInput.value,
      tanggalNota: this.elements.tanggalNotaInput.value,
      tanggalJatuhTempo: this.elements.tanggalJatuhTempoInput.value,
    };

    try {
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
        this.renderer.renderPiutangTable();
        break;
      case "#hutang-vendor":
        this.renderer.renderHutangTable();
        break;
      case "#master-produk":
        this.renderer.renderInventarisTable();
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
        this.setupBarangAutocomplete(this.state.getData("inventaris"));
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

      // Render rincian item
      itemsBody.innerHTML = items
        .map(
          (item) => `
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
    </tr>
  `
        )
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
      await this.loadInitialData();
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

      const invoiceUrl = "../../invoice.html?reprint=true";
      window.open(invoiceUrl, "_blank");
    } catch (err) {
      UIUtils.createToast("error", err.message || "Gagal membuka nota.");
    }
  }
  async handleUpdateTransaction(event) {
    event.preventDefault();

    const form = event.target;
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
      bootstrap.Modal.getInstance(form.closest(".modal")).hide();

      await this.loadInitialData();
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
      await this.loadInitialData(); // Muat ulang data untuk menampilkan produk baru
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

    const payload = {
      productId: parseInt(document.getElementById("editProductId").value, 10),
      updates: {
        nama: document.getElementById("editNamaProduk").value,
        unit: document.getElementById("editUnit").value,
        harga_beli: parseFloat(document.getElementById("editHargaBeli").value),
        foto: document.getElementById("editFotoUrl").value,
      },
    };

    try {
      const { error } = await APIClient.put("manage-products", payload);
      if (error) throw error;

      UIUtils.createToast(
        "success",
        `Produk "${payload.updates.nama}" berhasil diperbarui.`
      );
      bootstrap.Modal.getInstance(form.closest(".modal")).hide();
      await this.loadInitialData(); // Muat ulang data untuk menampilkan perubahan
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
      await this.loadInitialData(); // Muat ulang data untuk menghapus produk dari tampilan
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
  async handleGeneratePrintableReport(event) {
    event.preventDefault();
    const form = event.target;
    const reportType = document.getElementById("reportType").value;
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

    UIUtils.createToast("info", "Mempersiapkan data laporan untuk dicetak...");
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

      // --- gunakan let agar bisa diubah ---
      let dataForReport =
        reportType === "piutang" ? responseData.piutang : responseData.hutang;

      if (!dataForReport || dataForReport.length === 0) {
        UIUtils.createToast(
          "warning",
          "Tidak ada data pada rentang tanggal tersebut."
        );
        return;
      }

      // filter status hanya untuk hutang
      if (statusFilter !== "all") {
        dataForReport = (dataForReport || []).filter(
          (item) =>
            (item.status || "").toLowerCase() === statusFilter.toLowerCase()
        );
      }

      if (!dataForReport || dataForReport.length === 0) {
        UIUtils.createToast(
          "warning",
          "Tidak ada data dengan status tersebut."
        );
        return;
      }

      const templateName =
        reportType === "piutang" ? "outlet_invoice" : "vendor_report";

      const { data: templateData, error: templateError } = await APIClient.post(
        "manage-reports",
        {
          action: "get-template",
          template_name: templateName,
        }
      );
      if (templateError) throw templateError;

      const allProducts = this.state.getData("inventaris");
      const populatedHtml = PrintUtils.populateTemplate(
        templateData.template_content,
        dataForReport,
        reportType,
        allProducts,
        outletName
      );
      PrintUtils.printDocument(populatedHtml);
    } catch (err) {
      UIUtils.createToast(
        "error",
        err.message || "Gagal membuat laporan cetak."
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
  async populateOutletFilter() {
    const selectEl = document.getElementById("reportOutletSelect");
    if (!selectEl) return;

    selectEl.innerHTML = "<option>Memuat outlet...</option>";
    try {
      // Panggil endpoint yang mengambil daftar outlet unik
      const { data: outlets, error } = await APIClient.get("get-outlets");
      if (error) throw error;

      // Isi dropdown dengan data yang diterima
      selectEl.innerHTML = '<option value="all" selected>Semua Outlet</option>';
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
      await this.loadInitialData(); // Refresh data piutang
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
