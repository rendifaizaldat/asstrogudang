export class AppConfig {
  static SUPABASE_URL = "https://wgtzyblrvlemzhphujjp.supabase.co"; // <-- GANTI DENGAN URL PROYEK ANDA
  static SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndndHp5YmxydmxlbXpocGh1ampwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ2MjMyODksImV4cCI6MjA3MDE5OTI4OX0.g1OhVX8Qjjlgd0gA1TexWjbuADtnCSOkHakLR2Vof3A"; // <-- GANTI DENGAN KUNCI ANON ANDA

  static CONSTANTS = {
    MAX_RETRY_ATTEMPTS: 3,
    REQUEST_TIMEOUT: 15000,
    CACHE_DURATION: 5 * 60 * 1000,
    DEBOUNCE_DELAY: 300,
    VIRTUAL_SCROLL_THRESHOLD: 100,
  };

  static STORAGE_KEYS = {
    USER: "warehouse_app_user",
    CART: "warehouse_app_cart",
    LAST_TRANSACTION: "warehouse_app_last_transaction",
    LAST_TRANSACTION_DATE: "warehouse_app_last_transaction_date",
    USER_FOR_INVOICE: "warehouse_app_user_for_invoice",
  };

  static ROUTES = {
    LOGIN: "index.html",
    CATALOG: "katalog.html",
    CART: "keranjang.html",
    INVOICE: "invoice.html",
    ADMIN: "js/admin/admin.html",
  };

  // Properti `device` juga statis
  static device = {
    isMobile: false,
    isTablet: false,
    isDesktop: false,
    hasTouch: false,
    supportsWebP: false,
    supportsAnimations: true,
  };

  // Semua metode sekarang statis
  static init() {
    this.detectDevice();
    this.setupGlobalErrorHandler();
  }

  static detectDevice() {
    const width = window.innerWidth;
    this.device.isMobile = width < 768;
    this.device.isTablet = width >= 768 && width < 1024;
    this.device.isDesktop = width >= 1024;
    this.device.hasTouch = "ontouchstart" in window;
    this.device.supportsAnimations = !window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
  }

  static setupGlobalErrorHandler() {
    window.addEventListener("error", (event) => {
      // Di sini kita tidak bisa menggunakan Logger karena bisa terjadi circular dependency
      // Cukup log ke console
      console.error("[GLOBAL JS ERROR]", {
        message: event.message,
        filename: event.filename,
        line: event.lineno,
        error: event.error,
      });
    });

    window.addEventListener("unhandledrejection", (event) => {
      console.error("[UNHANDLED PROMISE REJECTION]", {
        reason: event.reason,
      });
      event.preventDefault();
    });
  }
}

// Panggil metode init statis secara langsung
AppConfig.init();


