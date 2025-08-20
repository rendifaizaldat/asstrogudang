// keranjang.js - Enhanced Cart with Improved State Management and UX
import { supabase } from "./utils.js";
import { AppConfig } from "./config.js";
import {
  Logger,
  UIUtils,
  CurrencyFormatter,
  APIClient,
  StorageUtils,
} from "./utils.js";

class CartState {
  constructor() {
    this.items = new Map();
    this.user = null;
    this.deliveryDate = null;
    this.listeners = new Set();
  }

  loadFromStorage() {
    const userProfileAndSession = StorageUtils.getItem(
      AppConfig.STORAGE_KEYS.USER
    );
    this.user = userProfileAndSession; // Simpan seluruh objek gabungan

    // Load cart items (bagian ini sudah benar)
    const cartItems = StorageUtils.getItem(AppConfig.STORAGE_KEYS.CART, []);
    this.items.clear();

    cartItems.forEach((item) => {
      if (this.validateCartItem(item)) {
        this.items.set(item.id, item);
      }
    });

    this.notifyListeners("cart-loaded");
  }

  validateCartItem(item) {
    return (
      item &&
      item.id &&
      item.nama &&
      typeof item.qty === "number" &&
      item.qty > 0 &&
      typeof item.harga_jual === "number" &&
      item.harga_jual > 0
    );
  }

  updateItem(itemId, quantity) {
    const item = this.items.get(itemId);
    if (!item) return false;

    const validatedQty = Math.max(0, Math.min(quantity, item.sisa_stok));

    if (validatedQty > 0) {
      this.items.set(itemId, { ...item, qty: validatedQty });
    } else {
      this.items.delete(itemId);
    }

    this.saveToStorage();

    if (validatedQty > 0) {
      // Jika kuantitas masih ada, kirim sinyal 'update'
      this.notifyListeners("item-updated", { itemId, quantity: validatedQty });
    } else {
      // Jika kuantitas 0, kirim sinyal 'hapus'
      this.notifyListeners("item-removed", { itemId, item: item });
    }

    return true;
  }

  removeItem(itemId) {
    const item = this.items.get(itemId);
    if (item) {
      this.items.delete(itemId);
      this.saveToStorage();
      this.notifyListeners("item-removed", { itemId, item });
      return true;
    }
    return false;
  }

  setDeliveryDate(date) {
    this.deliveryDate = date;
    this.notifyListeners("delivery-date-updated", { date });
  }

  getTotal() {
    return Array.from(this.items.values()).reduce((sum, item) => {
      return sum + item.harga_jual * item.qty;
    }, 0);
  }

  getItemCount() {
    return Array.from(this.items.values()).reduce(
      (sum, item) => sum + item.qty,
      0
    );
  }

  isEmpty() {
    return this.items.size === 0;
  }

  clear() {
    this.items.clear();
    this.saveToStorage();
    this.notifyListeners("cart-cleared");
  }

  saveToStorage() {
    const cartArray = Array.from(this.items.values());
    StorageUtils.setItem(AppConfig.STORAGE_KEYS.CART, cartArray);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners(event, data = null) {
    this.listeners.forEach((listener) => {
      try {
        listener(event, data);
      } catch (error) {
        Logger.error("Cart state listener error", {
          event,
          error: error.message,
        });
      }
    });
  }
}

class CartRenderer {
  constructor(container, state, outlets = []) {
    this.container = container;
    this.state = state;
    this.outlets = outlets;
  }

  render() {
    if (this.state.isEmpty()) {
      this.renderEmptyCart();
      return;
    }
    this.renderCartItems();
  }

  renderEmptyCart() {
    this.container.innerHTML = `
      <div class="text-center p-5 card glass-card">
        <i class="bi bi-cart-x" style="font-size: 5rem; color: var(--secondary);"></i>
        <h3 class="mt-3">Keranjang Anda kosong</h3>
        <p class="text-muted">Sepertinya Anda belum menambahkan produk apapun.</p>
        <a href="${AppConfig.ROUTES.CATALOG}" class="btn btn-primary mt-2 mx-auto" style="max-width: 200px;">
          <i class="bi bi-shop"></i> Mulai Belanja
        </a>
      </div>
    `;
  }

  renderCartItems() {
    const items = Array.from(this.state.items.values());
    const total = this.state.getTotal();

    const desktopItemsHTML = items
      .map((item) => this.createDesktopCartItemHTML(item))
      .join("");
    const mobileItemsHTML = items
      .map((item) => this.createMobileCartItemHTML(item))
      .join("");

    this.container.innerHTML = `
      <div class="card glass-card p-3">
        <div class="d-none d-md-flex row fw-bold mb-2 border-bottom pb-2 text-muted">
          <div class="col-md-6">PRODUK</div>
          <div class="col-md-4 text-center">KUANTITAS</div>
          <div class="col-md-2 text-end">AKSI</div>
        </div>
        <div class="cart-items-container-desktop d-none d-md-block">${desktopItemsHTML}</div>
        <div class="cart-items-container-mobile d-md-none">${mobileItemsHTML}</div>
        <div class="d-flex justify-content-end align-items-center mt-3 pt-3 border-top">
          <span class="fs-5 me-3">Total Belanja:</span>
          <span class="fs-4 fw-bold text-primary">${CurrencyFormatter.format(
            total
          )}</span>
        </div>
      </div>
      ${this.createDeliveryDateSection()}
      ${this.createOutletSelectionSection()}
      ${this.createCheckoutSection()}
    `;

    this.setupItemEventListeners();
  }

  createDesktopCartItemHTML(item) {
    return `
      <div class="cart-item-desktop row py-3 align-items-center" data-item-id="${
        item.id
      }">
        <div class="col-md-6 d-flex align-items-center">
          <img src="${item.foto || "https://via.placeholder.com/80"}" alt="${
      item.nama
    }" class="img-fluid rounded me-3" style="width: 80px; height: 80px; object-fit: cover;">
          <div>
            <strong class="d-block mb-1">${item.nama}</strong>
            <small class="text-muted d-block">Sisa Stok: ${
              item.sisa_stok
            }</small>
            <span class="fw-bold mt-1">${CurrencyFormatter.format(
              item.harga_jual
            )}</span>
          </div>
        </div>
        <div class="col-md-4 d-flex align-items-center justify-content-center">
          <div class="quantity-control" style="width: 150px;">
            <button class="btn btn-light btn-qty-decrease" data-item-id="${
              item.id
            }"><i class="bi bi-dash"></i></button>
            <input type="text" inputmode="decimal" class="form-control text-center qty-input" value="${
              item.qty
            }" data-item-id="${item.id}">
            <button class="btn btn-light btn-qty-increase" data-item-id="${
              item.id
            }"><i class="bi bi-plus"></i></button>
          </div>
        </div>
        <div class="col-md-2 text-end">
          <button class="btn btn-link text-danger p-0 btn-remove" data-item-id="${
            item.id
          }"><i class="bi bi-trash-fill fs-5"></i> Hapus</button>
        </div>
      </div>
    `;
  }

  createMobileCartItemHTML(item) {
    return `
      <div class="mobile-cart-item" data-item-id="${item.id}">
        <img src="${item.foto || "https://via.placeholder.com/60"}" alt="${
      item.nama
    }" class="cart-item-image">
        <div class="cart-item-details">
          <strong class="cart-item-name">${item.nama}</strong>
          <small class="cart-item-price-per-piece text-muted">${CurrencyFormatter.format(
            item.harga_jual
          )} / pcs</small>
        </div>
        <div class="quantity-control">
            <button class="btn btn-light btn-qty-decrease" data-item-id="${
              item.id
            }"><i class="bi bi-dash"></i></button>
            <input type="text" inputmode="decimal" class="form-control text-center qty-input" value="${
              item.qty
            }" data-item-id="${item.id}">
            <button class="btn btn-light btn-qty-increase" data-item-id="${
              item.id
            }"><i class="bi bi-plus"></i></button>
        </div>
        <button class="btn btn-link text-danger p-0 btn-remove" data-item-id="${
          item.id
        }">
          <i class="bi bi-trash-fill fs-5"></i>
        </button>
      </div>
    `;
  }

  setupItemEventListeners() {
    this.container.addEventListener("click", (e) => {
      const target = e.target;

      const removeButton = target.closest(".btn-remove");
      if (removeButton) {
        const itemId = removeButton.dataset.itemId;
        this.handleItemRemove(itemId);
        return;
      }

      const decreaseButton = target.closest(".btn-qty-decrease");
      if (decreaseButton) {
        const itemId = decreaseButton.dataset.itemId;
        const item = this.state.items.get(itemId);
        if (item) {
          this.state.updateItem(itemId, item.qty - 1);
        }
        return;
      }

      const increaseButton = target.closest(".btn-qty-increase");
      if (increaseButton) {
        const itemId = increaseButton.dataset.itemId;
        const item = this.state.items.get(itemId);
        if (item) {
          const newQty = item.qty + 1;
          if (newQty > item.sisa_stok) {
            UIUtils.createToast(
              "warning",
              `Stok ${item.nama} hanya ${item.sisa_stok}.`
            );
          } else {
            this.state.updateItem(itemId, newQty);
          }
        }
        return;
      }
    });

    const handleDebouncedUpdate = UIUtils.debounce((value, itemId) => {
      const newQty = parseFloat(value.replace(",", "."));
      if (!isNaN(newQty)) {
        const item = this.state.items.get(itemId);
        if (item && newQty > item.sisa_stok) {
          UIUtils.createToast(
            "warning",
            `Stok ${item.nama} hanya ${item.sisa_stok}.`
          );
          const qtyInput = this.container.querySelector(
            `.qty-input[data-item-id="${itemId}"]`
          );
          if (qtyInput) qtyInput.value = item.sisa_stok;
          this.state.updateItem(itemId, item.sisa_stok);
        } else {
          this.state.updateItem(itemId, newQty);
        }
      }
    }, 500);

    this.container.addEventListener("input", (e) => {
      if (e.target.classList.contains("qty-input")) {
        const itemId = e.target.dataset.itemId;
        handleDebouncedUpdate(e.target.value, itemId);
      }
    });
  }

  handleItemRemove(itemId) {
    const item = this.state.items.get(itemId);
    if (!item) return;
    const confirmModalEl = document.getElementById("confirmModal");

    // --- PERBAIKAN BUG 2 DI SINI ---
    // Gunakan getOrCreateInstance untuk mencegah backdrop tertinggal
    const confirmModal = bootstrap.Modal.getOrCreateInstance(confirmModalEl);

    const confirmMessage = document.getElementById("confirmMessage");
    const confirmAction = document.getElementById("confirmAction");
    confirmMessage.textContent = `Yakin ingin menghapus "${item.nama}" dari keranjang?`;

    const newConfirmAction = confirmAction.cloneNode(true);
    confirmAction.parentNode.replaceChild(newConfirmAction, confirmAction);

    newConfirmAction.addEventListener(
      "click",
      () => {
        this.state.removeItem(itemId);
        UIUtils.createToast("info", `${item.nama} dihapus dari keranjang.`);
        confirmModal.hide();
      },
      { once: true }
    );

    confirmModal.show();
  }

  createDeliveryDateSection() {
    const user = this.state.user;
    let minDateAttribute = "";
    const isAdmin = user?.custom_profile?.role?.toLowerCase() === "admin";

    if (!isAdmin) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      minDateAttribute = `min="${tomorrow.toISOString().split("T")[0]}"`;
    }

    return `
      <div class="card glass-card p-3 mt-4">
        <div class="row align-items-center">
          <div class="col-md-4"><label for="tanggalKirim" class="form-label fw-bold"><i class="bi bi-calendar-event me-2"></i>Pilih Tanggal Pengiriman:</label></div>
          <div class="col-md-8">
            <input type="date" class="form-control" id="tanggalKirim" ${minDateAttribute} required>
            <div class="form-text">${
              isAdmin
                ? "Admin dapat memilih tanggal lampau."
                : "Pengiriman minimal H+1 dari hari pemesanan."
            }</div>
          </div>
        </div>
      </div>
    `;
  }

  createOutletSelectionSection() {
    const user = this.state.user;
    const isAdmin = user?.custom_profile?.role?.toLowerCase() === "admin";
    if (!isAdmin || this.outlets.length === 0) {
      return "";
    }

    const options = this.outlets
      .map((outlet) => `<option value="${outlet}">${outlet}</option>`)
      .join("");
    return `
      <div class="card glass-card p-3 mt-4">
        <div class="row align-items-center">
          <div class="col-md-4"><label for="outletSelector" class="form-label fw-bold"><i class="bi bi-shop-window me-2"></i>Pilih Outlet Customer:</label></div>
          <div class="col-md-8">
            <select class="form-select" id="outletSelector" required>
              <option value="" disabled selected>-- Atas Nama Outlet --</option>
              ${options}
            </select>
            <div class="form-text">Admin membuat pesanan atas nama outlet yang dipilih.</div>
          </div>
        </div>
      </div>
    `;
  }

  createCheckoutSection() {
    return `
      <div class="d-flex justify-content-end mt-4">
        <button id="checkoutButton" class="btn btn-primary btn-lg">
          <i class="bi bi-check-circle me-2"></i>Checkout Sekarang
        </button>
      </div>
    `;
  }

  /**
   * Memperbarui tampilan satu item spesifik di keranjang secara efisien.
   * @param {string} itemId ID produk yang akan diperbarui.
   */
  /**
   * Memperbarui tampilan satu item spesifik di keranjang secara efisien.
   * @param {string} itemId ID produk yang akan diperbarui.
   */
  updateItemDisplay(itemId) {
    const item = this.state.items.get(itemId);

    const itemElements = this.container.querySelectorAll(
      `[data-item-id="${itemId}"]`
    );

    if (!item) {
      if (itemElements.length > 0) {
        this.removeItemElement(itemId);
      }
      return;
    }

    if (itemElements.length === 0) return;

    // Lakukan update untuk setiap elemen yang ditemukan
    itemElements.forEach((itemElement) => {
      const qtyInput = itemElement.querySelector(".qty-input");
      if (qtyInput) {
        qtyInput.value = item.qty;
      }
      const decreaseBtn = itemElement.querySelector(".btn-qty-decrease");
      if (decreaseBtn) {
        decreaseBtn.disabled = item.qty <= 1;
      }
      const increaseBtn = itemElement.querySelector(".btn-qty-increase");
      if (increaseBtn) {
        increaseBtn.disabled = item.qty >= item.sisa_stok;
      }
    });

    this.updateTotal();
  }

  removeItemElement(itemId) {
    const itemElements = this.container.querySelectorAll(
      `[data-item-id="${itemId}"]`
    );
    itemElements.forEach((element) => {
      element.style.transition = "opacity 0.3s, transform 0.3s";
      element.style.opacity = "0";
      element.style.transform = "translateX(-20px)";
      setTimeout(() => {
        element.remove();
        if (this.state.isEmpty()) {
          this.renderEmptyCart();
        } else {
          this.updateTotal();
        }
      }, 300);
    });
  }

  updateTotal() {
    const totalElement = this.container.querySelector(
      ".fs-4.fw-bold.text-primary"
    );
    if (totalElement) {
      totalElement.textContent = CurrencyFormatter.format(
        this.state.getTotal()
      );
    }
  }
}

class CheckoutManager {
  constructor(state) {
    this.state = state;
    this.isProcessing = false;
  }
  async processCheckout(deliveryDate) {
    if (
      !this.state.user ||
      !this.state.user.user ||
      !this.state.user.user.email
    ) {
      UIUtils.createToast(
        "error",
        "Sesi Anda telah berakhir. Harap login kembali untuk melanjutkan."
      );
      setTimeout(() => {
        window.location.href = AppConfig.ROUTES.LOGIN;
      }, 3000);
      return;
    }
    if (this.isProcessing) return;
    const validationErrors = this.validateCheckout(deliveryDate);
    if (validationErrors.length > 0) {
      UIUtils.createToast("error", validationErrors[0]);
      return;
    }
    this.isProcessing = true;
    const checkoutButton = document.getElementById("checkoutButton");
    UIUtils.setLoadingState(checkoutButton, true, "Memproses...");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user)
        throw new Error("Sesi pengguna tidak ditemukan. Silakan login ulang.");
      const payload = {
        action: "process-checkout",
        cart_items: Array.from(this.state.items.values()).map((item) => ({
          id: item.id,
          qty: item.qty,
        })),
        user_id: user.id,
        delivery_date: deliveryDate,
        selected_outlet_name:
          document.getElementById("outletSelector")?.value || null,
      };

      const { data, error } = await APIClient.post(
        "manage-transactions",
        payload
      );
      if (error) throw error;

      this.handleCheckoutSuccess(deliveryDate, data);
    } catch (error) {
      Logger.error("Checkout failed", error);
      UIUtils.createToast("error", `Checkout gagal: ${error.message}`);
    } finally {
      this.isProcessing = false;
      UIUtils.setLoadingState(checkoutButton, false);
    }
  }
  validateCheckout(deliveryDate) {
    const errors = [];
    if (this.state.isEmpty()) errors.push("Keranjang belanja kosong!");
    if (!deliveryDate) errors.push("Silakan pilih tanggal pengiriman.");
    const user = this.state.user;
    const outletSelector = document.getElementById("outletSelector");
    if (
      user?.custom_profile?.role?.toLowerCase() === "admin" &&
      (!outletSelector || !outletSelector.value)
    ) {
      errors.push("Admin harus memilih outlet customer.");
    }
    return errors;
  }
  handleCheckoutSuccess(deliveryDate, serverResponse) {
    const userForInvoice = {
      outlet: this.state.user.custom_profile.outlet,
      nama: this.state.user.custom_profile.nama,
    };
    StorageUtils.setItem(
      AppConfig.STORAGE_KEYS.LAST_TRANSACTION,
      Array.from(this.state.items.values())
    );
    StorageUtils.setItem(
      AppConfig.STORAGE_KEYS.LAST_TRANSACTION_DATE,
      deliveryDate
    );
    StorageUtils.setItem(
      AppConfig.STORAGE_KEYS.USER_FOR_INVOICE,
      userForInvoice
    );
    this.state.clear();
    UIUtils.createToast(
      "success",
      "Checkout berhasil! Mengalihkan ke invoice..."
    );
    setTimeout(() => {
      window.location.href = AppConfig.ROUTES.INVOICE;
    }, 2000);
  }
}

class CartController {
  constructor() {
    this.state = new CartState();
    this.renderer = null;
    this.checkoutManager = null;
    this.elements = {};
    this.isInitialized = false;
    this.unsubscribeState = null;
    this.outletList = [];
  }
  updateSummary() {
    const summaryEl = document.getElementById("cart-summary");
    if (summaryEl) {
      const itemCount = this.state.getItemCount();
      summaryEl.textContent = `${itemCount} item`;
    }
  }
  async init() {
    if (this.isInitialized) return;
    try {
      if (!this.checkAuth()) return;
      const userProfileAndSession = StorageUtils.getItem(
        AppConfig.STORAGE_KEYS.USER
      );
      const isAdmin =
        userProfileAndSession?.custom_profile?.role?.toLowerCase() === "admin";
      if (isAdmin) {
        await this.fetchOutletList();
      }
      this.bindElements();
      this.setupRenderer();
      this.setupCheckoutManager();
      this.setupStateSubscription();
      this.setupEventListeners();
      this.state.loadFromStorage();
      this.isInitialized = true;
      Logger.info("Cart controller initialized");
    } catch (error) {
      Logger.error("Cart initialization failed", error);
      UIUtils.createToast("error", "Gagal menginisialisasi halaman keranjang");
    }
  }

  async fetchOutletList() {
    try {
      const { data: outletData, error } = await APIClient.get("get-outlets");
      if (error) throw error;

      if (Array.isArray(outletData)) {
        this.outletList = outletData;
        Logger.info("Outlet list loaded", { count: this.outletList.length });
      } else {
        throw new Error("Format data outlet tidak valid");
      }
    } catch (error) {
      Logger.error("Failed to fetch outlet list", error);
      UIUtils.createToast(
        "error",
        `Gagal memuat daftar outlet: ${error.message}`
      );
    }
  }

  checkAuth() {
    const session = StorageUtils.getItem(AppConfig.STORAGE_KEYS.USER);
    if (!session || !session.user || !session.user.email) {
      UIUtils.createToast("error", "Sesi tidak valid. Silakan login kembali.");
      StorageUtils.removeItem(AppConfig.STORAGE_KEYS.USER);
      setTimeout(() => {
        window.location.href = AppConfig.ROUTES.LOGIN;
      }, 2000);
      return false;
    }
    return true;
  }
  bindElements() {
    const requiredElements = { cartContent: "cart-content", loader: "loader" };
    Object.entries(requiredElements).forEach(([key, id]) => {
      this.elements[key] = document.getElementById(id);
      if (!this.elements[key]) {
        throw new Error(`Required element not found: ${id}`);
      }
    });
  }
  setupRenderer() {
    this.renderer = new CartRenderer(
      this.elements.cartContent.querySelector("#cart-items") ||
        this.elements.cartContent,
      this.state,
      this.outletList
    );
  }
  setupCheckoutManager() {
    this.checkoutManager = new CheckoutManager(this.state);
  }
  setupStateSubscription() {
    this.unsubscribeState = this.state.subscribe((event, data) => {
      this.updateSummary();
      switch (event) {
        case "cart-loaded":
          this.hideLoader();
          this.renderer.render();
          break;
        case "item-updated":
          if (data) {
            this.renderer.updateItemDisplay(data.itemId);
          }
          break;
        case "item-removed":
          if (data) {
            this.renderer.removeItemElement(data.itemId);
          }
          break;
        case "cart-cleared":
          this.renderer.render();
          break;
      }
    });
  }
  setupEventListeners() {
    this.elements.cartContent.addEventListener("click", (e) => {
      if (
        e.target.id === "checkoutButton" ||
        e.target.closest("#checkoutButton")
      ) {
        this.handleCheckout();
      }
    });
    this.elements.cartContent.addEventListener("change", (e) => {
      if (e.target.id === "tanggalKirim") {
        this.state.setDeliveryDate(e.target.value);
      }
    });
  }
  clearCart() {
    this.state.clear();
    UIUtils.createToast("info", "Keranjang berhasil dikosongkan.");
  }
  async handleCheckout() {
    const deliveryDateInput = document.getElementById("tanggalKirim");
    const deliveryDate = deliveryDateInput ? deliveryDateInput.value : null;
    await this.checkoutManager.processCheckout(deliveryDate);
  }
  hideLoader() {
    this.elements.loader.classList.add("d-none");
    const cartItems = this.elements.cartContent.querySelector("#cart-items");
    if (cartItems) {
      cartItems.classList.remove("d-none");
    }
  }
  destroy() {
    if (this.unsubscribeState) {
      this.unsubscribeState();
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const cartController = new CartController();
  cartController.init().catch((error) => {
    Logger.error("Failed to initialize cart controller", error);
  });
  window.addEventListener("beforeunload", () => {
    if (window.cartController) {
      window.cartController.destroy();
    }
  });
  window.cartController = cartController;
});

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  const cartController = new CartController();
  cartController.init().catch((error) => {
    Logger.error("Failed to initialize cart controller", error);
  });

  // Cleanup on page unload
  window.addEventListener("beforeunload", () => {
    if (window.cartController) {
      window.cartController.destroy();
    }
  });

  // Store controller globally for debugging
  window.cartController = cartController;
});
