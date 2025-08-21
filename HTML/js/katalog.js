// katalog.js - Enhanced Catalog with Modern Performance and UX
import { AppConfig } from "./config.js";
import {
  Logger,
  UIUtils,
  ValidationUtils,
  CurrencyFormatter,
  APIClient,
  StorageUtils,
  UpdateManager,
} from "./utils.js";
import { supabase } from "./utils.js";

class ProductState {
  constructor() {
    this.products = [];
    this.filteredProducts = [];
    this.cart = new Map();
    this.searchTerm = "";
    this.sortConfig = { field: "nama", order: "asc" };
    this.filterConfig = { category: "all", priceRange: null };
    this.listeners = new Set();
    this.lastUpdate = null;

    // Performance tracking
    this.performanceMetrics = {
      renderTime: 0,
      searchTime: 0,
      sortTime: 0,
    };
  }

  setProducts(products) {
    const startTime = performance.now();

    this.products = products.map((product) => ({
      ...product,
      id: String(product.id),
      harga: Number(product.harga) || 0,
      sisa_stok: Number(product.sisa_stok) || 0,
      searchableText: this.createSearchableText(product),
    }));

    this.lastUpdate = Date.now();
    this.applyFiltersAndSort();
    this.notifyListeners("products-updated");

    // Performance tracking
    this.performanceMetrics.renderTime = performance.now() - startTime;
    Logger.debug("Products set", {
      count: this.products.length,
      renderTime: this.performanceMetrics.renderTime,
    });
  }

  createSearchableText(product) {
    return [product.nama, product.unit, product.kategori, product.deskripsi]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  setSearchTerm(term) {
    const startTime = performance.now();

    this.searchTerm = ValidationUtils.sanitizeInput(term).toLowerCase();
    this.applyFiltersAndSort();
    this.notifyListeners("search-updated");

    this.performanceMetrics.searchTime = performance.now() - startTime;
  }

  setSortConfig(field, order) {
    const startTime = performance.now();

    this.sortConfig = { field, order };
    this.applyFiltersAndSort();
    this.notifyListeners("sort-updated");

    this.performanceMetrics.sortTime = performance.now() - startTime;
  }

  setFilterConfig(config) {
    this.filterConfig = { ...this.filterConfig, ...config };
    this.applyFiltersAndSort();
    this.notifyListeners("filter-updated");
  }

  updateCartItem(productId, quantity) {
    const product = this.products.find((p) => p.id === productId);
    if (!product) return false;

    // Validate quantity
    const validatedQty = Math.max(0, Math.min(quantity, product.sisa_stok));

    if (validatedQty > 0) {
      this.cart.set(productId, {
        ...product,
        qty: validatedQty,
        addedAt: Date.now(),
      });
    } else {
      this.cart.delete(productId);
    }

    // Save to storage with debouncing
    this.debouncedSaveCart();
    this.notifyListeners("cart-updated", { productId, quantity: validatedQty });

    return true;
  }

  debouncedSaveCart = UIUtils.debounce(() => {
    const cartArray = Array.from(this.cart.values());
    StorageUtils.setItem(AppConfig.STORAGE_KEYS.CART, cartArray);
  }, 500);

  getCartItem(productId) {
    return this.cart.get(productId);
  }

  getCartTotal() {
    return Array.from(this.cart.values()).reduce(
      (sum, item) => sum + item.qty,
      0
    );
  }

  getCartValue() {
    return Array.from(this.cart.values()).reduce(
      (sum, item) => sum + item.qty * item.harga_jual,
      0
    );
  }

  loadCartFromStorage() {
    const savedCart = StorageUtils.getItem(AppConfig.STORAGE_KEYS.CART, []);
    this.cart.clear();

    savedCart.forEach((item) => {
      if (item.id && item.qty > 0) {
        // Verify product still exists and has sufficient stock
        const currentProduct = this.products.find((p) => p.id === item.id);
        if (currentProduct && currentProduct.sisa_stok >= item.qty) {
          this.cart.set(item.id, {
            ...currentProduct,
            qty: item.qty,
            addedAt: item.addedAt || Date.now(),
          });
        }
      }
    });
    this.notifyListeners("cart-loaded-and-ready-to-render");
    this.notifyListeners("cart-loaded");
  }

  applyFiltersAndSort() {
    let filtered = [...this.products];

    // Apply search filter
    if (this.searchTerm) {
      filtered = filtered.filter((product) =>
        product.searchableText.includes(this.searchTerm)
      );
    }

    // Apply category filter
    if (this.filterConfig.category !== "all") {
      filtered = filtered.filter(
        (product) => product.kategori === this.filterConfig.category
      );
    }

    // Apply price range filter
    if (this.filterConfig.priceRange) {
      const [min, max] = this.filterConfig.priceRange;
      filtered = filtered.filter(
        (product) => product.harga >= min && product.harga <= max
      );
    }

    // Separate available and out of stock products
    const availableProducts = filtered.filter((p) => p.sisa_stok > 0);
    const outOfStockProducts = filtered.filter((p) => p.sisa_stok <= 0);

    // Sort available products
    availableProducts.sort((a, b) => {
      let valA = a[this.sortConfig.field];
      let valB = b[this.sortConfig.field];

      if (typeof valA === "string") {
        const comparison = valA.localeCompare(valB);
        return this.sortConfig.order === "asc" ? comparison : -comparison;
      }

      const comparison = valA - valB;
      return this.sortConfig.order === "asc" ? comparison : -comparison;
    });

    // Combine: available first, then out of stock
    this.filteredProducts = [...availableProducts, ...outOfStockProducts];
  }

  getCategories() {
    const categories = new Set(
      this.products.map((p) => p.kategori).filter(Boolean)
    );
    return Array.from(categories).sort();
  }

  getPriceRange() {
    const prices = this.products.map((p) => p.harga).filter((p) => p > 0);
    return {
      min: Math.min(...prices),
      max: Math.max(...prices),
      avg: prices.reduce((sum, price) => sum + price, 0) / prices.length,
    };
  }

  getStats() {
    return {
      totalProducts: this.products.length,
      availableProducts: this.products.filter((p) => p.sisa_stok > 0).length,
      outOfStockProducts: this.products.filter((p) => p.sisa_stok <= 0).length,
      cartItems: this.cart.size,
      cartTotal: this.getCartTotal(),
      cartValue: this.getCartValue(),
      categories: this.getCategories().length,
      priceRange: this.getPriceRange(),
      lastUpdate: this.lastUpdate,
      performance: this.performanceMetrics,
    };
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
        Logger.error("State listener error", { event, error: error.message });
      }
    });
  }
}

class ProductRenderer {
  constructor(container, state) {
    this.container = container;
    this.state = state;
    this.renderedProducts = new Map();
    this.intersectionObserver = null;
    this.imageObserver = null;
    this.animationController = new ProductAnimationController();

    this.setupObservers();
    this.setupVirtualScrolling();
  }

  setupObservers() {
    if ("IntersectionObserver" in window) {
      // Observer #1: Untuk animasi saat produk masuk layar
      this.intersectionObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const cardElement = entry.target.querySelector(".product-card");
              if (cardElement) {
                cardElement.classList.add("product-card-enter-active");
              }
              this.intersectionObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.1 }
      );

      // Observer #2: Untuk lazy loading gambar (DIKEMBALIKAN)
      this.imageObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              this.loadImage(entry.target);
              this.imageObserver.unobserve(entry.target);
            }
          });
        },
        { rootMargin: "200px" } // Memuat gambar sedikit lebih awal sebelum terlihat
      );
    }
  }

  setupVirtualScrolling() {
    // For large product lists, implement virtual scrolling
    this.virtualScrollEnabled =
      this.state.products.length > AppConfig.CONSTANTS.VIRTUAL_SCROLL_THRESHOLD;

    if (this.virtualScrollEnabled) {
      this.setupVirtualScrollContainer();
    }
  }

  setupVirtualScrollContainer() {
    // Virtual scrolling implementation for better performance with large datasets
    this.virtualScroll = {
      itemHeight: 300, // Approximate item height
      containerHeight: window.innerHeight,
      scrollTop: 0,
      startIndex: 0,
      endIndex: 0,
      visibleItems: Math.ceil(window.innerHeight / 300) + 2,
    };

    window.addEventListener(
      "scroll",
      AppConfig.throttle(() => {
        this.updateVirtualScroll();
      }, 16)
    ); // 60fps
  }

  updateVirtualScroll() {
    if (!this.virtualScrollEnabled) return;

    const scrollTop = window.pageYOffset;
    this.virtualScroll.scrollTop = scrollTop;

    const startIndex = Math.floor(scrollTop / this.virtualScroll.itemHeight);
    const endIndex = Math.min(
      startIndex + this.virtualScroll.visibleItems,
      this.state.filteredProducts.length
    );

    if (
      startIndex !== this.virtualScroll.startIndex ||
      endIndex !== this.virtualScroll.endIndex
    ) {
      this.virtualScroll.startIndex = startIndex;
      this.virtualScroll.endIndex = endIndex;
      this.renderVirtualItems();
    }
  }

  render(products) {
    // Clear container
    this.container.innerHTML = "";
    this.renderedProducts.clear();

    if (products.length === 0) {
      this.renderEmptyState();
      return;
    }

    if (this.virtualScrollEnabled) {
      this.updateVirtualScroll(); // <-- TAMBAHKAN BARIS INI
      this.renderVirtualItems();
    } else {
      this.renderAllItems(products);
    }
  }

  renderAllItems(products) {
    const fragment = document.createDocumentFragment();

    products.forEach((product, index) => {
      const productElement = this.createProductElement(product, index);
      fragment.appendChild(productElement);
      this.renderedProducts.set(product.id, productElement);

      if (this.intersectionObserver) {
        this.intersectionObserver.observe(productElement);
      }

      // AKTIFKAN KEMBALI BLOK DI BAWAH INI
      const img = productElement.querySelector("img[data-src]");
      if (img && this.imageObserver) {
        this.imageObserver.observe(img);
      }
    });

    this.container.appendChild(fragment);
  }

  renderVirtualItems() {
    const fragment = document.createDocumentFragment();
    const { startIndex, endIndex } = this.virtualScroll;

    // Add spacer elements for virtual scrolling
    const topSpacer = document.createElement("div");
    topSpacer.style.height = `${startIndex * this.virtualScroll.itemHeight}px`;
    fragment.appendChild(topSpacer);

    for (let i = startIndex; i < endIndex; i++) {
      const product = this.state.filteredProducts[i];
      if (product) {
        const productElement = this.createProductElement(product, i);
        fragment.appendChild(productElement);
        this.renderedProducts.set(product.id, productElement);
      }
    }

    const bottomSpacer = document.createElement("div");
    const remainingItems = this.state.filteredProducts.length - endIndex;
    bottomSpacer.style.height = `${
      remainingItems * this.virtualScroll.itemHeight
    }px`;
    fragment.appendChild(bottomSpacer);

    this.container.appendChild(fragment);
  }

  renderEmptyState() {
    this.container.innerHTML = `
      <div class="col-12 text-center py-5">
        <div class="card glass-card">
          <div class="card-body p-5">
            <div class="empty-state-animation">
              <i class="bi bi-search fs-1 text-muted"></i>
            </div>
            <h4 class="mt-3">Produk tidak ditemukan</h4>
            <p class="text-muted">Coba ubah kata kunci pencarian atau filter Anda.</p>
            <button class="btn btn-primary" onclick="window.location.reload()">
              <i class="bi bi-arrow-clockwise me-2"></i>Muat Ulang
            </button>
          </div>
        </div>
      </div>
    `;

    // Add empty state animation
    const emptyIcon = this.container.querySelector(".empty-state-animation i");
    if (emptyIcon && AppConfig.device.supportsAnimations) {
      emptyIcon.style.animation = "emptyStatePulse 2s ease-in-out infinite";
    }
  }

  createProductElement(product, index) {
    const cartItem = this.state.getCartItem(product.id);
    const currentQty = cartItem ? cartItem.qty : 0;
    const isOutOfStock = product.sisa_stok <= 0;
    const isLowStock = product.sisa_stok <= 5 && product.sisa_stok > 0;
    const isMobile = window.innerWidth < 768;

    const col = document.createElement("div");
    col.className = "col";
    col.style.animationDelay = `${index * 0.05}s`;

    const card = document.createElement("div");
    card.className = `card product-card ${!isMobile ? "h-100" : ""} ${
      isOutOfStock ? "disabled-card" : ""
    } product-card-enter`;
    card.dataset.productId = product.id;

    // Header (Desktop) - tidak berubah
    const cardHeader = document.createElement("div");
    cardHeader.className = "card-header product-header-desktop";
    const productNameHeader = document.createElement("h5");
    productNameHeader.className = "product-name";
    productNameHeader.title = product.nama;
    productNameHeader.textContent = product.nama;
    if (isLowStock) {
      const lowStockBadge = document.createElement("span");
      lowStockBadge.className = "badge bg-warning ms-2";
      lowStockBadge.textContent = "Stok Sedikit";
      productNameHeader.appendChild(lowStockBadge);
    }
    cardHeader.appendChild(productNameHeader);

    // Info (Mobile) - tidak berubah
    const mobileInfo = document.createElement("div");
    mobileInfo.className = "product-info-mobile";
    const productNameMobile = document.createElement("h5");
    productNameMobile.className = "product-name-mobile";
    productNameMobile.textContent = product.nama;
    mobileInfo.appendChild(productNameMobile);

    // Image Container
    const imageContainer = document.createElement("div");
    imageContainer.className = "card-image-container";
    imageContainer.innerHTML = `
      <img data-src="${
        product.foto || "https://via.placeholder.com/300?text=Gambar"
      }" 
           src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Crect width='100%25' height='100%25' fill='%23f8f9fa'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23dee2e6'%3EMemuat...%3C/text%3E%3C/svg%3E"
           class="product-image" 
           alt="${product.nama}"
           loading="lazy"
           onerror="this.src='https://via.placeholder.com/300?text=Error'">
      ${
        isOutOfStock
          ? '<div class="sold-out-overlay"><span>Habis</span></div>'
          : ""
      }
      <div class="desktop-overlay">
        <div class="product-overlay-content">
          <span class="product-stock fw-bold small"><i class="bi bi-box-seam"></i> Sisa: ${
            product.sisa_stok
          }</span>
          <div class="d-flex justify-content-between align-items-center mt-2">
            <span class="product-unit small">${product.unit || "pcs"}</span>
            <span class="product-price fw-bold">${CurrencyFormatter.format(
              product.harga_jual
            )}</span>              
          </div>
          ${
            product.kategori
              ? `<span class="product-category small text-muted">${product.kategori}</span>`
              : ""
          }
        </div>
      </div>
      <div class="mobile-badges">
        <span class="stock-badge-mobile ${
          isLowStock ? "bg-warning" : ""
        }"><i class="bi bi-box-seam"></i> ${product.sisa_stok}</span>
      </div>
    `;

    // Price & Unit (Mobile)
    const mobilePrice = document.createElement("div");
    mobilePrice.className = "product-price-mobile";
    mobilePrice.innerHTML = `
        <span class="price-value">${CurrencyFormatter.format(
          product.harga_jual
        )}</span>
        <span class="unit-text"> / ${product.unit || "pcs"}</span>
    `;

    // Susun elemen-elemen utama kartu
    card.appendChild(cardHeader);
    card.appendChild(mobileInfo);
    card.appendChild(imageContainer);
    card.appendChild(mobilePrice);

    // Card Footer (Kontrol Kuantitas) - HANYA DITAMBAHKAN JIKA STOK TERSEDIA
    if (!isOutOfStock) {
      const cardFooter = document.createElement("div");
      cardFooter.className = "card-footer";
      cardFooter.innerHTML = `
        <div class="quantity-control ${currentQty > 0 ? "has-items" : ""}">
          <button class="btn-qty btn-qty-decrease" data-action="decrease" data-product-id="${
            product.id
          }" ${
        currentQty <= 0 || isOutOfStock ? "disabled" : ""
      } aria-label="Kurangi jumlah"><i class="bi bi-dash"></i></button>
          <span class="qty-display" data-product-id="${
            product.id
          }">${currentQty}</span>
          <button class="btn-qty btn-qty-increase" data-action="increase" data-product-id="${
            product.id
          }" ${
        currentQty >= product.sisa_stok || isOutOfStock ? "disabled" : ""
      } aria-label="Tambah jumlah"><i class="bi bi-plus"></i></button>
        </div>
        ${
          currentQty > 0
            ? `
          <div class="item-total mt-2 text-center d-none d-md-block">
            <small class="text-muted">Subtotal: <strong>${CurrencyFormatter.format(
              currentQty * product.harga_jual
            )}</strong></small>
          </div>`
            : ""
        }
      `;
      card.appendChild(cardFooter);
    }

    col.appendChild(card);
    return col;
  }

  loadImage(img) {
    if (img.dataset.src) {
      const tempImg = new Image();
      tempImg.onload = () => {
        img.src = tempImg.src;
        img.classList.add("loaded");
        delete img.dataset.src;
      };
      tempImg.onerror = () => {
        img.src = "https://via.placeholder.com/300?text=Error";
        delete img.dataset.src;
      };
      tempImg.src = img.dataset.src;
    }
  }

  updateProductQuantity(productId, quantity) {
    const productElement = this.renderedProducts.get(productId);
    if (!productElement) return;

    const product = this.state.products.find((p) => p.id === productId);
    if (!product) return;

    // Update quantity display
    const qtyDisplay = productElement.querySelector(
      `[data-product-id="${productId}"].qty-display`
    );
    if (qtyDisplay) {
      qtyDisplay.textContent = quantity;

      // Add animation
      if (AppConfig.device.supportsAnimations) {
        qtyDisplay.style.animation = "quantityUpdate 0.3s ease-out";
        setTimeout(() => {
          qtyDisplay.style.animation = "";
        }, 300);
      }
    }

    // Update button states
    const decreaseBtn = productElement.querySelector(
      `[data-action="decrease"][data-product-id="${productId}"]`
    );
    const increaseBtn = productElement.querySelector(
      `[data-action="increase"][data-product-id="${productId}"]`
    );
    const quantityControl = productElement.querySelector(".quantity-control");

    if (decreaseBtn) {
      decreaseBtn.disabled = quantity <= 0 || product.sisa_stok <= 0;
    }

    if (increaseBtn) {
      increaseBtn.disabled =
        quantity >= product.sisa_stok || product.sisa_stok <= 0;
    }

    // Update control styling
    if (quantityControl) {
      if (quantity > 0) {
        quantityControl.classList.add("has-items");
      } else {
        quantityControl.classList.remove("has-items");
      }
    }

    // Update subtotal
    const subtotalContainer = productElement.querySelector(".item-total");
    if (quantity > 0) {
      const subtotal = quantity * product.harga_jual;
      if (!subtotalContainer) {
        const cardFooter = productElement.querySelector(".card-footer");
        const subtotalEl = document.createElement("div");
        subtotalEl.className = "item-total mt-2 text-center d-none d-md-block";
        subtotalEl.innerHTML = `
          <small class="text-muted">
            Subtotal: <strong>${CurrencyFormatter.format(subtotal)}</strong>
          </small>
        `;
        cardFooter.appendChild(subtotalEl);
      } else {
        subtotalContainer.querySelector("strong").textContent =
          CurrencyFormatter.format(subtotal);
      }
    } else if (subtotalContainer) {
      subtotalContainer.remove();
    }
  }

  destroy() {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
    if (this.imageObserver) {
      this.imageObserver.disconnect();
    }
    this.renderedProducts.clear();
    this.animationController.cleanup();
  }
}

class ProductAnimationController {
  constructor() {
    this.animatedElements = new Set();
    this.addAnimationStyles();
  }

  animateEntry(element) {
    if (
      this.animatedElements.has(element) ||
      !AppConfig.device.supportsAnimations
    ) {
      return;
    }

    this.animatedElements.add(element);
    element.classList.add("product-enter");

    // Staggered animation based on position
    const rect = element.getBoundingClientRect();
    const delay = Math.min((rect.top / window.innerHeight) * 200, 400);

    setTimeout(() => {
      element.classList.add("product-enter-active");
    }, delay);
  }

  addAnimationStyles() {
    if (document.getElementById("product-animations")) return;

    const styles = document.createElement("style");
    styles.id = "product-animations";
    styles.textContent = `
      .product-card-enter {
        opacity: 0;
        transform: translateY(20px) scale(0.95);
        transition: opacity 0.6s ease, transform 0.6s var(--bounce);
      }

      .product-card-enter-active {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    `;
    document.head.appendChild(styles);
  }

  cleanup() {
    this.animatedElements.clear();
  }
}

class FilterManager {
  constructor(state) {
    this.state = state;
    this.elements = {};
    this.setupFilters();
  }

  setupFilters() {
    this.createFilterElements();
    this.bindFilterEvents();
  }

  createFilterElements() {
    const filterSection = document.getElementById("filter-section");
    if (!filterSection) return;

    const categories = this.state.getCategories();
    const priceRange = this.state.getPriceRange();
    const isMobile = window.innerWidth < 768;

    let filterHTML = "";

    if (isMobile) {
      // Tampilan 2 Baris KHUSUS MOBILE
      filterHTML = `
            <div class="d-flex flex-wrap align-items-center gap-3">
                <div class="d-flex align-items-center gap-2 w-100">
                    <span class="fw-bold">Urutkan:</span>
                    <button class="btn btn-sm btn-outline-primary sort-btn active" data-sort="nama">Nama</button>
                    <button class="btn btn-sm btn-outline-primary sort-btn" data-sort="harga">Harga</button>
                    <button class="btn btn-sm btn-outline-primary sort-btn" data-sort="sisa_stok">Stok</button>
                </div>
                <div class="d-flex justify-content-between align-items-center w-100 gap-3">
                    <div class="d-flex align-items-center gap-2 flex-grow-1">
                        <span class="fw-bold">Harga:</span>
                        <input type="range" class="form-range" id="priceRange" min="${
                          priceRange.min
                        }" max="${priceRange.max}" value="${priceRange.max}">
                        <span id="priceValue" class="small text-muted" style="min-width: 90px;">Max: ${CurrencyFormatter.format(
                          priceRange.max
                        )}</span>
                    </div>
                    <button class="btn btn-sm btn-outline-secondary flex-shrink-0" id="clearFilters">
                        <i class="bi bi-x-circle"></i> Reset
                    </button>
                </div>
            </div>
        `;
    } else {
      // Tampilan Asli untuk DESKTOP
      filterHTML = `
            <div class="d-flex flex-wrap align-items-center gap-3">
                <div class="d-flex align-items-center gap-2">
                    <span class="fw-bold">Urutkan:</span>
                    <button class="btn btn-sm btn-outline-primary sort-btn active" data-sort="nama">Nama A-Z</button>
                    <button class="btn btn-sm btn-outline-primary sort-btn" data-sort="harga">Harga</button>
                    <button class="btn btn-sm btn-outline-primary sort-btn" data-sort="sisa_stok">Stok</button>
                </div>
                <div class="d-flex align-items-center gap-2">
                    <span class="fw-bold">Harga:</span>
                    <input type="range" class="form-range" id="priceRange" min="${
                      priceRange.min
                    }" max="${priceRange.max}" value="${
        priceRange.max
      }" style="width: 120px;">
                    <span id="priceValue" class="small text-muted">Max: ${CurrencyFormatter.format(
                      priceRange.max
                    )}</span>
                </div>
                <button class="btn btn-sm btn-outline-secondary" id="clearFilters">
                    <i class="bi bi-x-circle me-1"></i>Reset
                </button>
            </div>
        `;
    }

    filterSection.innerHTML = filterHTML;

    this.elements = {
      sortButtons: filterSection.querySelectorAll(".sort-btn"),
      priceRange: filterSection.querySelector("#priceRange"),
      priceValue: filterSection.querySelector("#priceValue"),
      clearFilters: filterSection.querySelector("#clearFilters"),
    };
  }

  bindFilterEvents() {
    // Sort buttons
    this.elements.sortButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        this.handleSortChange(btn);
      });
    });

    // Category filter
    if (this.elements.categoryFilter) {
      this.elements.categoryFilter.addEventListener("change", (e) => {
        this.state.setFilterConfig({ category: e.target.value });
      });
    }

    // Price range
    if (this.elements.priceRange) {
      const debouncedPriceFilter = UIUtils.debounce((value) => {
        const priceRange = this.state.getPriceRange();
        this.state.setFilterConfig({
          priceRange: [priceRange.min, parseInt(value)],
        });
      }, 300);

      this.elements.priceRange.addEventListener("input", (e) => {
        const value = e.target.value;
        this.elements.priceValue.textContent = `Max: ${CurrencyFormatter.format(
          value
        )}`;
        debouncedPriceFilter(value);
      });
    }

    // Clear filters
    if (this.elements.clearFilters) {
      this.elements.clearFilters.addEventListener("click", () => {
        this.clearAllFilters();
      });
    }
  }

  handleSortChange(button) {
    const field = button.dataset.sort;
    const currentActive = document.querySelector(".sort-btn.active");

    // Remove active class from current button
    if (currentActive) {
      currentActive.classList.remove("active");
    }

    // Add active class to clicked button
    button.classList.add("active");

    // Determine sort order
    let order = "asc";
    if (this.state.sortConfig.field === field) {
      order = this.state.sortConfig.order === "asc" ? "desc" : "asc";
    }

    this.state.setSortConfig(field, order);

    // Update button text to show sort direction
    const baseText = button.textContent.replace(/ ↑| ↓/g, "");
    button.textContent = `${baseText} ${order === "asc" ? "↑" : "↓"}`;
  }

  clearAllFilters() {
    // Reset category filter
    if (this.elements.categoryFilter) {
      this.elements.categoryFilter.value = "all";
    }

    // Reset price range
    if (this.elements.priceRange) {
      const priceRange = this.state.getPriceRange();
      this.elements.priceRange.value = priceRange.max;
      this.elements.priceValue.textContent = `Max: ${CurrencyFormatter.format(
        priceRange.max
      )}`;
    }

    // Reset state
    this.state.setFilterConfig({
      category: "all",
      priceRange: null,
    });

    UIUtils.createToast("info", "Filter direset", 2000);
  }
}

class CatalogController {
  constructor() {
    this.state = new ProductState();
    this.renderer = null;
    this.filterManager = null;
    this.elements = {};
    this.isInitialized = false;
    this.unsubscribeState = null;
    this.performanceMonitor = new PerformanceMonitor();
  }

  async init() {
    if (this.isInitialized) return;
    try {
      this.performanceMonitor.start("catalogInit");
      if (!this.checkAuth()) return;
      this.bindElements();
      this.setupRenderer();
      this.setupEventListeners();
      this.setupStateSubscription();
      this.updateStats();
      await this.loadProducts();
      this.filterManager = new FilterManager(this.state);
      this.isInitialized = true;
      this.performanceMonitor.end("catalogInit");
      Logger.info("Catalog controller initialized", {
        performance: this.performanceMonitor.getMetrics(),
      });
    } catch (error) {
      Logger.error("Catalog initialization failed", error);
      this.showErrorState("Gagal menginisialisasi katalog");
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
    const requiredElements = {
      productList: "product-list",
      loader: "loader",
      searchInput: "searchInput",
      searchInputMobile: "searchInputMobile",
      cartBadge: "cart-badge",
      filterSection: "filter-section",
    };

    Object.entries(requiredElements).forEach(([key, id]) => {
      this.elements[key] = document.getElementById(id);
      if (!this.elements[key]) {
        throw new Error(`Required element not found: ${id}`);
      }
    });
  }

  setupRenderer() {
    this.renderer = new ProductRenderer(this.elements.productList, this.state);
  }

  setupEventListeners() {
    const debouncedSearch = UIUtils.debounce((value) => {
      this.performanceMonitor.start("search");
      this.state.setSearchTerm(value);
      this.performanceMonitor.end("search");
      this.setupInstallButton();
    }, AppConfig.CONSTANTS.DEBOUNCE_DELAY);

    const searchHandler = (e) => {
      const searchTerm = e.target.value;
      debouncedSearch(searchTerm);

      if (e.target.id === "searchInput") {
        this.elements.searchInputMobile.value = searchTerm;
      } else {
        this.elements.searchInput.value = searchTerm;
      }
    };

    this.elements.searchInput.addEventListener("input", searchHandler);
    this.elements.searchInputMobile.addEventListener("input", searchHandler);

    this.elements.productList.addEventListener("click", (e) => {
      const button = e.target.closest("[data-action]");
      if (button) {
        this.handleQuantityChange(button);
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case "k":
            e.preventDefault();
            this.elements.searchInput.focus();
            break;
          case "r":
            e.preventDefault();
            this.refreshProducts();
            break;
        }
      }
    });

    const cartLink = document.querySelector('a[href="keranjang.html"]');
    if (cartLink) {
      cartLink.addEventListener("click", (e) => {
        if (this.state.getCartTotal() === 0) {
          e.preventDefault();
          UIUtils.createToast(
            "info",
            "Keranjang masih kosong. Tambahkan produk terlebih dahulu."
          );
        }
      });
    }

    document.querySelectorAll("#logoutButton").forEach((button) => {
      button.addEventListener("click", async (e) => {
        e.preventDefault();
        if (confirm("Yakin ingin logout?")) {
          const { error } = await supabase.auth.signOut();
          if (error) {
            UIUtils.createToast("error", "Gagal logout: " + error.message);
          } else {
            localStorage.removeItem(AppConfig.STORAGE_KEYS.USER);
            window.location.href = AppConfig.ROUTES.LOGIN;
          }
        }
      });
    });

    this.setupAutoRefresh();
    this.setupInstallButton();
  }
  setupInstallButton() {
    let deferredPrompt;
    const installButton = document.getElementById("installAppBtn");

    if (!installButton) return;

    window.addEventListener("beforeinstallprompt", (e) => {
      // Mencegah browser menampilkan prompt instalasi standarnya
      e.preventDefault();
      // Simpan event agar bisa dipicu nanti
      deferredPrompt = e;
      // Tampilkan tombol instalasi kustom kita
      installButton.style.display = "flex";
    });

    installButton.addEventListener("click", async () => {
      if (deferredPrompt) {
        // Tampilkan prompt instalasi yang disimpan
        deferredPrompt.prompt();
        // Tunggu pengguna merespons prompt
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") {
          UIUtils.createToast("success", "Aplikasi berhasil diinstal!");
        } else {
          UIUtils.createToast("info", "Instalasi dibatalkan.");
        }
        // Reset prompt, karena hanya bisa digunakan sekali
        deferredPrompt = null;
        // Sembunyikan tombol setelah digunakan
        installButton.style.display = "none";
      }
    });

    window.addEventListener("appinstalled", () => {
      UIUtils.createToast(
        "success",
        "Aplikasi telah terpasang di perangkat Anda."
      );
      installButton.style.display = "none";
    });
  }
  setupAutoRefresh() {
    setInterval(() => {
      if (document.visibilityState === "visible") {
        this.refreshProducts(true);
      }
    }, 5 * 60 * 1000);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.state.lastUpdate) {
        const timeSinceUpdate = Date.now() - this.state.lastUpdate;
        if (timeSinceUpdate > 2 * 60 * 1000) {
          this.refreshProducts(true);
        }
      }
    });
  }

  setupStateSubscription() {
    this.unsubscribeState = this.state.subscribe((event, data) => {
      switch (event) {
        case "products-updated":
          this.hideLoader();
          this.showFilterSection();
          this.renderer.render(this.state.filteredProducts);
          this.updateStats();
          break;
        case "search-updated":
        case "sort-updated":
        case "filter-updated":
          this.renderer.render(this.state.filteredProducts);
          this.updateStats();
          break;
        case "cart-updated":
          this.updateStats();
          if (data) {
            this.renderer.updateProductQuantity(data.productId, data.quantity);
            this.showCartUpdateFeedback(data);
          }
          break;
        case "cart-loaded":
          this.updateStats();
          break;
        case "cart-loaded-and-ready-to-render":
          this.updateStats();
          for (const [productId, item] of this.state.cart.entries()) {
            this.renderer.updateProductQuantity(productId, item.qty);
          }
          break;
      }
    });
  }

  async loadProducts() {
    try {
      this.showLoader();
      this.performanceMonitor.start("loadProducts");
      const { data: productsData, error } = await APIClient.get(
        "manage-products"
      );
      if (error) throw error;

      if (productsData) {
        this.state.setProducts(productsData);
        this.state.loadCartFromStorage();

        this.performanceMonitor.end("loadProducts");
        Logger.info("Products loaded successfully", {
          count: productsData.length,
          performance: this.performanceMonitor.getMetrics(),
        });
      } else {
        throw new Error("Invalid data format from API");
      }
    } catch (error) {
      Logger.error("Failed to load products", error);
      this.showErrorState(
        "Gagal memuat produk. Periksa koneksi internet Anda."
      );
    }
  }

  async refreshProducts(silent = false) {
    try {
      if (!silent) {
        UIUtils.createToast("info", "Memperbarui data produk...", 2000);
      }

      // Menggunakan APIClient baru untuk refresh
      const productsData = await APIClient.get("manage-products");

      if (productsData) {
        this.state.setProducts(productsData);
        if (!silent) {
          UIUtils.createToast(
            "success",
            "Data produk berhasil diperbarui",
            3000
          );
        }
      }
    } catch (error) {
      Logger.error("Failed to refresh products", error);
      if (!silent) {
        UIUtils.createToast("error", "Gagal memperbarui data produk");
      }
    }
  }

  handleQuantityChange(button) {
    const productId = button.dataset.productId;
    const action = button.dataset.action;

    if (!productId || !action) return;

    const currentItem = this.state.getCartItem(productId);
    const currentQty = currentItem ? currentItem.qty : 0;

    let newQty = currentQty;
    if (action === "increase") {
      newQty = currentQty + 1;
    } else if (action === "decrease") {
      newQty = Math.max(0, currentQty - 1);
    }

    const product = this.state.products.find((p) => p.id === productId);
    if (product && newQty > product.sisa_stok) {
      this.showStockLimitMessage(product);
      return;
    }

    if (AppConfig.device.hasTouch && navigator.vibrate) {
      navigator.vibrate(50);
    }

    this.state.updateCartItem(productId, newQty);
  }

  showStockLimitMessage(product) {
    UIUtils.createToast(
      "warning",
      `Stok ${product.nama} hanya tersisa ${product.sisa_stok}`,
      4000
    );
  }

  showCartUpdateFeedback(data) {
    const product = this.state.products.find((p) => p.id === data.productId);
    if (!product) return;

    const action =
      data.quantity > (data.previousQuantity || 0)
        ? "ditambahkan ke"
        : "dikurangi dari";
    const message = `${product.nama} ${action} keranjang`;

    // Create floating feedback near the button
    this.createFloatingFeedback(data.productId, message);
  }

  createFloatingFeedback(productId, message) {
    const productElement = this.renderer.renderedProducts.get(productId);
    if (!productElement) return;

    const feedback = document.createElement("div");
    feedback.className = "floating-feedback";
    feedback.textContent = message;
    feedback.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: var(--primary);
      color: white;
      padding: 0.5rem 1rem;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 600;
      z-index: 1000;
      pointer-events: none;
      animation: floatingFeedback 2s ease-out forwards;
    `;

    productElement.style.position = "relative";
    productElement.appendChild(feedback);

    setTimeout(() => {
      if (feedback.parentNode) {
        feedback.parentNode.removeChild(feedback);
      }
    }, 2000);
  }

  updateCartBadge() {
    const totalItems = this.state.getCartTotal();

    if (totalItems > 0) {
      this.elements.cartBadge.textContent =
        totalItems > 99 ? "99+" : totalItems;
      this.elements.cartBadge.style.display = "block";

      // Add pulse animation for new items
      if (AppConfig.device.supportsAnimations) {
        this.elements.cartBadge.style.animation = "cartPulse 0.3s ease-out";
        setTimeout(() => {
          this.elements.cartBadge.style.animation = "";
        }, 300);
      }
    } else {
      this.elements.cartBadge.style.display = "none";
    }
  }

  updateCartValue() {
    const cartValueElement = document.getElementById("cart-value");
    if (cartValueElement) {
      const totalValue = this.state.getCartValue();
      cartValueElement.textContent = CurrencyFormatter.format(totalValue);
    }
  }

  updateStats() {
    const stats = this.state.getStats();
    const productCountEl = document.getElementById("product-count");
    const cartItemsEl = document.getElementById("cart-items");
    const cartValueEl = document.getElementById("cart-value");
    const lastUpdateEl = document.getElementById("last-update");

    if (productCountEl)
      productCountEl.textContent = `${stats.totalProducts} produk`;
    if (cartItemsEl) cartItemsEl.textContent = `${stats.cartTotal} item`;
    if (cartValueEl)
      cartValueEl.textContent = CurrencyFormatter.format(stats.cartValue);

    const cartBadgeEl = document.getElementById("cart-badge");
    if (cartBadgeEl) {
      if (stats.cartTotal > 0) {
        cartBadgeEl.textContent =
          stats.cartTotal > 99 ? "99+" : stats.cartTotal;
        cartBadgeEl.style.display = "block";
      } else {
        cartBadgeEl.style.display = "none";
      }
    }

    if (lastUpdateEl && stats.lastUpdate) {
      lastUpdateEl.textContent = new Date(stats.lastUpdate).toLocaleDateString(
        "id-ID"
      );
    }
  }

  showLoader() {
    this.elements.loader.style.display = "block";
    this.elements.filterSection.classList.add("d-none");
  }

  hideLoader() {
    this.elements.loader.style.display = "none";
  }

  showFilterSection() {
    this.elements.filterSection.classList.remove("d-none");
  }

  showErrorState(message) {
    this.hideLoader();
    this.elements.productList.innerHTML = `
      <div class="col-12 text-center py-5">
        <div class="card glass-card">
          <div class="card-body p-5">
            <div class="error-animation">
              <i class="bi bi-wifi-off fs-1 text-danger"></i>
            </div>
            <h4 class="mt-3">Gagal Memuat Produk</h4>
            <p class="text-muted">${message}</p>
            <div class="d-flex gap-2 justify-content-center flex-wrap">
              <button class="btn btn-primary" onclick="location.reload()">
                <i class="bi bi-arrow-clockwise me-2"></i>Coba Lagi
              </button>
              <button class="btn btn-outline-secondary" onclick="window.history.back()">
                <i class="bi bi-arrow-left me-2"></i>Kembali
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Add error animation
    const errorIcon =
      this.elements.productList.querySelector(".error-animation i");
    if (errorIcon && AppConfig.device.supportsAnimations) {
      errorIcon.style.animation = "errorShake 0.5s ease-in-out infinite";
    }
  }

  // Public methods for external access
  getState() {
    return this.state.getStats();
  }

  clearCart() {
    this.state.cart.clear();
    this.state.debouncedSaveCart();
    this.updateCartBadge();
    this.updateCartValue();
    UIUtils.createToast("info", "Keranjang dikosongkan");
  }

  exportCartData() {
    const cartData = Array.from(this.state.cart.values());
    const dataStr = JSON.stringify(cartData, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(dataBlob);
    link.download = `cart_${new Date().toISOString().split("T")[0]}.json`;
    link.click();

    UIUtils.createToast("success", "Data keranjang berhasil diekspor");
  }

  destroy() {
    if (this.unsubscribeState) {
      this.unsubscribeState();
    }
    if (this.renderer) {
      this.renderer.destroy();
    }
    if (this.performanceMonitor) {
      this.performanceMonitor.cleanup();
    }
  }
}

class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.startTimes = new Map();
  }

  start(label) {
    this.startTimes.set(label, performance.now());
  }

  end(label) {
    const startTime = this.startTimes.get(label);
    if (startTime) {
      const duration = performance.now() - startTime;
      this.metrics.set(label, duration);
      this.startTimes.delete(label);
      return duration;
    }
    return 0;
  }

  getMetrics() {
    return Object.fromEntries(this.metrics);
  }

  cleanup() {
    this.metrics.clear();
    this.startTimes.clear();
  }
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  const catalogController = new CatalogController();
  catalogController.init().catch((error) => {
    Logger.error("Failed to initialize catalog controller", error);
  });
  UpdateManager.checkForUpdates();

  // Store controller globally for debugging and external access
  window.catalogController = catalogController;

  // Cleanup on page unload
  window.addEventListener("beforeunload", () => {
    if (window.catalogController) {
      window.catalogController.destroy();
    }
  });

  // Add global styles for animations
  const styles = document.createElement("style");
  styles.textContent = `
    @keyframes cartPulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.2); }
      100% { transform: scale(1); }
    }

    @keyframes stockLimitWarning {
      0%, 100% { border-color: transparent; }
      50% { border-color: var(--warning); box-shadow: 0 0 10px rgba(245, 158, 11, 0.5); }
    }

    @keyframes floatingFeedback {
      0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
      20% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      80% { opacity: 1; transform: translate(-50%, -70%) scale(1); }
      100% { opacity: 0; transform: translate(-50%, -90%) scale(0.8); }
    }

    @keyframes errorShake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-5px); }
      75% { transform: translateX(5px); }
    }

    /* Loading placeholder styles */
    .loading-placeholder {
      background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
      background-size: 200% 100%;
      animation: loading 1.5s infinite;
    }

    @keyframes loading {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    @media (min-width: 800px) and (max-width: 991.98px) {
      #product-list {
        grid-template-columns: repeat(4, 1fr);
        gap: 1rem;
      }
    }

    @media (min-width: 992px) {
      #product-list {
        grid-template-columns: repeat(5, 1fr);
        gap: 1rem;
      }
    }

    /* Accessibility improvements */
    @media (prefers-reduced-motion: reduce) {
      .product-card,
      .floating-feedback,
      .cart-badge {
        animation: none !important;
        transition: none !important;
      }
    }

    /* High contrast mode */
    @media (prefers-contrast: high) {
      .product-card {
        border: 2px solid;
      }
      
      .btn-qty {
        border: 2px solid;
      }
    }

    /* Print styles */
    @media print {
      .floating-feedback,
      .cart-badge,
      .btn-qty,
      .navbar,
      .filter-section {
        display: none !important;
      }
    }
      @media (max-width: 575.98px) {
  .desktop-overlay {
    display: none;
  }
}
  @media (min-width: 768px) {
  .product-price-mobile {
    display: none;
  }
}
  `;
  document.head.appendChild(styles);
});

// Service Worker registration
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("sw.js")
      .then((registration) => {
        Logger.info("SW registered", registration);
      })
      .catch((registrationError) => {
        Logger.warn("SW registration failed", registrationError);
      });
  });
}
