import { AppConfig } from "../config.js";
import {
  Logger,
  UIUtils,
  APIClient,
  StorageUtils,
  CurrencyFormatter,
} from "../utils.js";
import { AdminState } from "./state.js";
import { AdminRenderer } from "./renderer.js";
import { AdminNavigationManager } from "./navigationManager.js";
import { AutocompleteInput } from "./autocomplete.js";

class UserPanelController {
  constructor() {
    this.isInitialized = false;
    this.state = new AdminState();
    this.renderer = new AdminRenderer(this.state);
    this.navigationManager = new AdminNavigationManager();
    this.poBarangAutocomplete = null;
    this.returBarangAutocomplete = null;

    // Subscribe to state changes to automatically update the UI
    this.state.subscribe(this.handleStateUpdate.bind(this));
  }

  async init() {
    if (this.isInitialized) return;
    try {
      this.showLoader(true, "Memuat Panel...");
      this.checkAuth();
      this.setupEventListeners();
      await this.loadUserData();
      this.isInitialized = true;
    } catch (error) {
      Logger.error("Inisialisasi User Panel Gagal", error);
      this.showLoader(false, "Gagal memuat data.", true);
    } finally {
      this.showLoader(false);
    }
  }

  checkAuth() {
    const sessionData = StorageUtils.getItem(AppConfig.STORAGE_KEYS.USER);
    if (!sessionData?.user) {
      window.location.href = "../../" + AppConfig.ROUTES.LOGIN;
      throw new Error("Sesi tidak valid.");
    }
    const userGreeting = document.getElementById("admin-greeting");
    if (userGreeting) {
      userGreeting.textContent = sessionData.custom_profile.nama || "Pengguna";
    }
  }

  async loadUserData() {
    this.showLoader(true, "Mengambil data Anda...");
    try {
      const { data: userData, error } = await APIClient.get("get-user-data");
      if (error) throw error;

      this.state.setData("products", userData.products || []);
      this.state.setData("receivables", userData.receivables || []);

      const triggerTab = document.querySelector("#piutang-outlet-tab");
      if (triggerTab) {
        const tab = new bootstrap.Tab(triggerTab);
        tab.show();
      }
    } catch (error) {
      UIUtils.createToast("error", "Gagal memuat data: " + error.message);
      throw error;
    }
  }

  setupEventListeners() {
    this.navigationManager.setupNavigation();
    document.addEventListener("shown.bs.tab", (e) =>
      this.handleTabChange(e.target)
    );

    const mainContent = document.getElementById("main-content-tabs");
    if (mainContent) {
      mainContent.addEventListener("click", (e) => {
        const reprintBtn = e.target.closest(".btn-print-invoice");
        if (reprintBtn) {
          this.handleReprintInvoice(reprintBtn.dataset.id);
          return;
        }

        const removeReturnItemBtn = e.target.closest(".remove-retur-item-btn");
        if (removeReturnItemBtn) {
          const index = parseInt(removeReturnItemBtn.dataset.index, 10);
          this.state.removeReturnItem(index);
          return;
        }
      });
    }

    // Purchase Order Listeners
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
    document.getElementById("poItemQty")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.handleAddPOItem();
      }
    });

    // Retur Barang Listeners
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
      .getElementById("returItemQty")
      ?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.handleAddReturnItem();
        }
      });
  }

  // This function is triggered by the state subscription
  handleStateUpdate(event, data) {
    if (event.startsWith("po-")) {
      this.renderer.renderPurchaseOrderPreview();
    }
    if (event.startsWith("return-")) {
      this.renderer.renderReturnPreview();
    }
  }

  handleTabChange(tabElement) {
    const tabId = tabElement.getAttribute("data-bs-target");
    switch (tabId) {
      case "#purchase-order":
        this.setupPOAutocomplete(this.state.getData("products"));
        this.renderer.renderPurchaseOrderPreview();
        break;
      case "#retur-barang":
        this.setupReturAutocomplete(this.state.getData("products"));
        this.renderer.renderReturnPreview();
        break;
      case "#piutang-outlet":
        this.renderUserPiutang(); // Use a custom renderer function
        break;
    }
  }

  // --- BUG FIX #4: Custom Renderer for User's Piutang View ---
  renderUserPiutang() {
    const container = document.getElementById("piutang-outlet-container");
    if (!container) return;

    const receivables = this.state.getData("receivables");

    if (!receivables || receivables.length === 0) {
      container.innerHTML = `<div class="text-center text-muted py-5"><i class="bi bi-inbox fs-2"></i><p>Tidak ada data tagihan ditemukan.</p></div>`;
      return;
    }

    const tableHTML = `
            <div class="card glass-card">
                <div class="table-responsive">
                    <table class="table table-hover mb-0">
                        <thead class="table-light">
                            <tr>
                                <th>ID Invoice</th>
                                <th>Tanggal</th>
                                <th class="text-end">Total</th>
                                <th>Status</th>
                                <th class="text-center">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${receivables
                              .map((p) => {
                                const isLunas =
                                  (p.status || "Belum Lunas").toLowerCase() ===
                                  "lunas";
                                const statusClass = isLunas
                                  ? "bg-success"
                                  : "bg-warning";

                                // Show "Lihat Bukti" only if "Lunas" and has proof
                                const buktiButton =
                                  isLunas && p.bukti_transfer
                                    ? `<a href="${p.bukti_transfer}" target="_blank" class="btn btn-sm btn-outline-info" title="Lihat Bukti Transfer"><i class="bi bi-eye"></i></a>`
                                    : "";

                                return `
                                    <tr>
                                        <td><span class="fw-semibold">${
                                          p.invoice_id
                                        }</span></td>
                                        <td>${new Date(
                                          p.tanggal_pengiriman
                                        ).toLocaleDateString("id-ID")}</td>
                                        <td class="text-end fw-bold">${CurrencyFormatter.format(
                                          p.total_tagihan
                                        )}</td>
                                        <td><span class="badge ${statusClass}">${
                                  p.status || "Belum Lunas"
                                }</span></td>
                                        <td class="text-center">
                                            <div class="btn-group btn-group-sm">
                                                <button class="btn btn-outline-secondary btn-print-invoice" data-id="${
                                                  p.id
                                                }" title="Cetak Ulang Nota"><i class="bi bi-printer"></i></button>
                                                ${buktiButton}
                                            </div>
                                        </td>
                                    </tr>
                                `;
                              })
                              .join("")}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    container.innerHTML = tableHTML;
  }
  // --- Purchase Order (PO) Functions ---
  setupPOAutocomplete(products) {
    if (!this.poBarangAutocomplete) {
      this.poBarangAutocomplete = new AutocompleteInput(
        "poBarangSearchInput",
        "poBarangAutocompleteResults",
        products
      );
      // --- BUG FIX #2: Keyboard Shortcut ---
      document
        .getElementById("poBarangSearchInput")
        .addEventListener("item-selected", () => {
          document.getElementById("poItemQty").focus();
        });
    }
    const outletSelect = document.getElementById("poOutletSelect");
    if (outletSelect) {
      outletSelect.parentElement.style.display = "none";
    }
  }

  handleStartPOSession() {
    const sessionData = {
      tanggalKirim: document.getElementById("poTanggalKirim").value,
    };
    if (!sessionData.tanggalKirim) {
      UIUtils.createToast("warning", "Tanggal pengiriman wajib diisi.");
      return;
    }
    this.state.startPOSession(sessionData); // Start session in state
    document.getElementById("poTanggalKirim").disabled = true;
    document.getElementById("startPOSessionBtn").disabled = true;
    document.getElementById("poBarangSearchInput").disabled = false;
    document.getElementById("poItemQty").disabled = false;
    document.getElementById("addPOItemBtn").disabled = false;
    document.getElementById("poBarangSearchInput").focus();
    UIUtils.createToast("success", `Sesi PO dimulai. Silakan tambah item.`);
  }

  // --- BUG FIX #1: Add PO Item Logic ---
  handleAddPOItem() {
    const selectedProduct = this.poBarangAutocomplete.getSelectedItem();
    if (!selectedProduct) {
      UIUtils.createToast("warning", "Pilih produk yang valid dari daftar.");
      return;
    }
    const qty = parseFloat(document.getElementById("poItemQty").value);
    if (isNaN(qty) || qty <= 0) {
      UIUtils.createToast("warning", "Masukkan jumlah kuantitas yang valid.");
      return;
    }
    if (qty > selectedProduct.sisa_stok) {
      UIUtils.createToast(
        "error",
        `Stok tidak mencukupi. Sisa stok: ${selectedProduct.sisa_stok}`
      );
      return;
    }
    const newItem = {
      product_id: selectedProduct.id,
      nama: selectedProduct.nama,
      unit: selectedProduct.unit,
      harga_jual: selectedProduct.harga_jual,
      sisa_stok: selectedProduct.sisa_stok,
      qty: qty,
    };
    this.state.addPOItem(newItem);
    document.getElementById("formTambahPOItem").reset();
    this.poBarangAutocomplete.clear();
    document.getElementById("poBarangSearchInput").focus();
  }

  async handleSubmitPurchaseOrder() {
    const poSession = this.state.getCurrentPOSession();
    if (!poSession || poSession.items.length === 0) {
      UIUtils.createToast("warning", "Tidak ada item untuk disimpan.");
      return;
    }
    const payload = {
      action: "create_receivable_from_cart",
      cart_items: poSession.items.map((item) => ({
        id: item.product_id,
        qty: item.qty,
      })),
      delivery_date: poSession.tanggalKirim,
    };
    const btn = document.getElementById("simpanPOBtn");
    UIUtils.setLoadingState(btn, true, "Menyimpan...");
    try {
      const { error } = await APIClient.post("manage-transactions", payload);
      if (error) throw error;
      UIUtils.createToast("success", "Purchase Order berhasil disimpan!");

      // Reset form
      this.state.clearPurchaseOrder();
      document.getElementById("poTanggalKirim").disabled = false;
      document.getElementById("poTanggalKirim").value = "";
      document.getElementById("startPOSessionBtn").disabled = false;

      // Muat ulang data DAN pastikan loader disembunyikan setelahnya
      await this.loadUserData();
      this.showLoader(false); // <-- BARIS KUNCI PERBAIKAN
    } catch (error) {
      UIUtils.createToast("error", "Gagal menyimpan PO: " + error.message);
    } finally {
      UIUtils.setLoadingState(btn, false);
    }
  }

  // --- Retur Barang Functions ---
  setupReturAutocomplete(products) {
    if (!this.returBarangAutocomplete) {
      this.returBarangAutocomplete = new AutocompleteInput(
        "returBarangSearchInput",
        "returBarangAutocompleteResults",
        products
      );
      // --- BUG FIX #2: Keyboard Shortcut ---
      document
        .getElementById("returBarangSearchInput")
        .addEventListener("item-selected", () => {
          document.getElementById("returItemQty").focus();
        });
    }
  }

  handleStartReturnSession() {
    const sessionData = {
      tanggal: document.getElementById("returTanggal").value,
      catatan: document.getElementById("returCatatan").value,
    };
    if (!sessionData.tanggal) {
      UIUtils.createToast("warning", "Tanggal retur wajib diisi.");
      return;
    }
    this.state.startReturnSession(sessionData);
    document.getElementById("returTanggal").disabled = true;
    document.getElementById("returCatatan").disabled = true;
    document.getElementById("startReturSessionBtn").disabled = true;
    document.getElementById("returBarangSearchInput").disabled = false;
    document.getElementById("returItemQty").disabled = false;
    document.getElementById("addReturItemBtn").disabled = false;
    document.getElementById("returBarangSearchInput").focus();
    UIUtils.createToast("success", `Sesi retur dimulai. Silakan tambah item.`);
  }

  handleAddReturnItem() {
    const selectedProduct = this.returBarangAutocomplete.getSelectedItem();
    if (!selectedProduct) {
      UIUtils.createToast("warning", "Pilih produk dari daftar.");
      return;
    }
    const qty = parseFloat(document.getElementById("returItemQty").value);
    if (isNaN(qty) || qty <= 0) {
      UIUtils.createToast("warning", "Masukkan jumlah kuantitas yang valid.");
      return;
    }
    const newItem = {
      product_id: selectedProduct.id,
      nama: selectedProduct.nama,
      unit: selectedProduct.unit,
      price_per_unit: selectedProduct.harga_jual,
      quantity: qty,
      subtotal: qty * selectedProduct.harga_jual,
    };
    this.state.addReturnItem(newItem);
    document.getElementById("formTambahReturItem").reset();
    this.returBarangAutocomplete.clear();
    document.getElementById("returBarangSearchInput").focus();
  }

  async handleSubmitReturn() {
    const returnSession = this.state.getCurrentReturnSession();
    const returnList = this.state.getData("returnList");

    if (!returnSession || returnList.length === 0) {
      UIUtils.createToast("warning", "Tidak ada item retur untuk disimpan.");
      return;
    }

    // For user panel, outlet is determined by the backend from the user's session
    const payload = {
      header: {
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
      document.getElementById("returTanggal").disabled = false;
      document.getElementById("returCatatan").disabled = false;
      document.getElementById("startReturSessionBtn").disabled = false;
      document.getElementById("formReturHeader").reset();
      this.loadUserData();
    } catch (error) {
      UIUtils.createToast("error", "Gagal menyimpan retur: " + error.message);
    } finally {
      UIUtils.setLoadingState(btn, false);
    }
  }

  async handleReprintInvoice(invoiceId) {
    UIUtils.createToast("info", "Mempersiapkan nota untuk dicetak...");
    try {
      const { data: fullInvoiceData, error } = await APIClient.get(
        "manage-transactions",
        {
          id: invoiceId,
          type: "piutang",
        }
      );
      if (error) throw error;

      localStorage.setItem(
        "reprint_transaction_data",
        JSON.stringify(fullInvoiceData)
      );
      const reprintUrl = `../../struk.html?reprint=true`;
      window.open(reprintUrl, "_blank");
    } catch (err) {
      UIUtils.createToast("error", err.message || "Gagal membuka nota.");
    }
  }

  showLoader(show, message = "Memuat...") {
    const loader = document.getElementById("loader");
    const mainContent = document.getElementById("main-content-tabs");
    if (loader && mainContent) {
      loader.querySelector("p").textContent = message;
      loader.classList.toggle("d-none", !show);
      mainContent.classList.toggle("d-none", show);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const app = new UserPanelController();
  app.init();
  window.userPanelApp = app;
});
