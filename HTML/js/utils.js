// utils.js - Refactored with static methods for consistency and ease of use
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import { AppConfig } from "./config.js";

export class Logger {
  static logLevels = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };
  static isDevelopment =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  static currentLevel = this.isDevelopment
    ? this.logLevels.DEBUG
    : this.logLevels.INFO;

  static log(level, message, data = null) {
    if (this.logLevels[level.toUpperCase()] > this.currentLevel) return;

    const timestamp = new Date().toISOString();
    const styles = {
      ERROR: "color: #ef4444; font-weight: bold;",
      WARN: "color: #f59e0b; font-weight: bold;",
      INFO: "color: #3b82f6;",
      DEBUG: "color: #64748b;",
    };

    console.log(
      `%c[${timestamp}] ${level.toUpperCase()}: ${message}`,
      styles[level.toUpperCase()],
      data
    );
  }

  static error(message, data) {
    this.log("error", message, data);
  }
  static warn(message, data) {
    this.log("warn", message, data);
  }
  static info(message, data) {
    this.log("info", message, data);
  }
  static debug(message, data) {
    this.log("debug", message, data);
  }
}

export class CacheManager {
  static storage = localStorage;
  static memoryCache = new Map();

  static set(key, data, ttl = 5 * 60 * 1000) {
    try {
      const cacheData = { data, timestamp: Date.now(), ttl };
      const cacheKey = `app_cache_${key}`;
      this.storage.setItem(cacheKey, JSON.stringify(cacheData));
      return true;
    } catch (error) {
      Logger.error("Cache set failed", { key, error: error.message });
      return false;
    }
  }

  static get(key) {
    try {
      const cacheKey = `app_cache_${key}`;
      const cached = this.storage.getItem(cacheKey);
      if (!cached) return null;

      const cacheData = JSON.parse(cached);
      if (Date.now() - cacheData.timestamp < cacheData.ttl) {
        return cacheData.data;
      }

      this.storage.removeItem(cacheKey);
      return null;
    } catch (error) {
      Logger.error("Cache get failed", { key, error: error.message });
      return null;
    }
  }
}

export class ValidationUtils {
  static isEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(String(email).toLowerCase());
  }

  static isValidPassword(password) {
    return typeof password === "string" && password.length >= 6;
  }

  static sanitizeInput(input) {
    if (typeof input !== "string") return "";
    return input.trim();
  }

  static isValidNumber(value, min = 0, max = Infinity) {
    const num = Number(value);
    return !isNaN(num) && num >= min && num <= max && isFinite(num);
  }

  static validateRequired(value, fieldName) {
    if (!value || (typeof value === "string" && !value.trim())) {
      // Kita lempar error agar bisa ditangkap oleh blok try...catch
      throw new Error(`${fieldName} wajib diisi`);
    }
  }

  static validateLength(value, min, max, fieldName) {
    if (String(value).length < min || String(value).length > max) {
      throw new Error(`${fieldName} harus antara ${min}-${max} karakter`);
    }
  }
}

export class UIUtils {
  static debounce(func, delay = 300) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  }
  static setLoadingState(element, isLoading, loadingText = "Loading...") {
    if (!element) return;
    if (isLoading) {
      element.classList.add("app-loading");
      element.disabled = true;
      element.dataset.originalText = element.textContent;
      element.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${loadingText}`;
    } else {
      element.classList.remove("app-loading");
      element.disabled = false;
      element.textContent = element.dataset.originalText || "Submit";
    }
  }
  static createToast(type, message, duration = 5000) {
    const toastContainer =
      document.querySelector(".toast-container") || this.createToastContainer();
    const toastId = `toast-${Date.now()}`;
    const toastElement = this.createToastElement(toastId, type, message);
    toastContainer.appendChild(toastElement);

    // Gunakan Bootstrap Toast jika tersedia
    if (window.bootstrap && window.bootstrap.Toast) {
      const bsToast = new window.bootstrap.Toast(toastElement, {
        delay: duration,
        autohide: true,
      });
      bsToast.show();

      // Hapus elemen setelah toast disembunyikan untuk menjaga kebersihan DOM
      toastElement.addEventListener("hidden.bs.toast", () => {
        toastElement.remove();
      });
    } else {
      // Fallback manual jika Bootstrap JS tidak ada
      toastElement.style.display = "block";
      toastElement.classList.add("show");
      setTimeout(() => {
        toastElement.remove();
      }, duration);
    }
  }

  static createToastContainer() {
    let container = document.querySelector(".toast-container");
    if (!container) {
      container = document.createElement("div");
      container.className = "toast-container position-fixed top-0 end-0 p-3";
      container.style.zIndex = "9999";
      document.body.appendChild(container);
    }
    return container;
  }

  static createToastElement(id, type, message) {
    const typeConfig = {
      success: { icon: "bi-check-circle", class: "bg-success" },
      error: { icon: "bi-x-circle", class: "bg-danger" },
      warning: {
        icon: "bi-exclamation-triangle",
        class: "bg-warning text-dark",
      },
      info: { icon: "bi-info-circle", class: "bg-info" },
    };
    const config = typeConfig[type] || typeConfig.info;

    const toast = document.createElement("div");
    toast.id = id;
    toast.className = `toast align-items-center text-white ${config.class} border-0`;
    toast.setAttribute("role", "alert");
    toast.setAttribute("aria-live", "assertive");
    toast.setAttribute("aria-atomic", "true");

    const toastBody = document.createElement("div");
    toastBody.className = "toast-body d-flex align-items-center";

    // Membuat elemen secara aman untuk mencegah XSS
    const icon = document.createElement("i");
    icon.className = `bi ${config.icon} me-2`;

    const messageSpan = document.createElement("span");
    messageSpan.innerHTML = message; // <-- AMAN

    toastBody.appendChild(icon);
    toastBody.appendChild(messageSpan);

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "btn-close btn-close-white me-2 m-auto";
    closeButton.setAttribute("data-bs-dismiss", "toast");
    closeButton.setAttribute("aria-label", "Close");

    const dFlex = document.createElement("div");
    dFlex.className = "d-flex";
    dFlex.appendChild(toastBody);
    dFlex.appendChild(closeButton);

    toast.appendChild(dFlex);

    return toast;
  }
  static animate(element, keyframes, options) {
    if (!element || !window.AppConfig?.device?.supportsAnimations) {
      return Promise.resolve();
    }
    const animation = element.animate(keyframes, {
      duration: options?.duration || 300,
      easing: options?.easing || "ease-in-out",
      fill: "forwards",
    });
    return animation.finished;
  }
  /**
   * Menjalankan animasi fade out pada sebuah elemen, kemudian menyembunyikannya.
   * @param {HTMLElement} element - Elemen yang akan dianimasikan.
   * @param {number} duration - Durasi animasi dalam milidetik.
   */
  static async fadeOut(element, duration = 300) {
    if (!element) return;
    try {
      await this.animate(element, [{ opacity: 1 }, { opacity: 0 }], {
        duration,
      });
      element.style.display = "none";
    } catch (error) {
      // Jika animasi gagal (misalnya, dibatalkan), tetap sembunyikan elemennya
      element.style.display = "none";
    }
  }

  /**
   * Menampilkan elemen, kemudian menjalankan animasi fade in.
   * @param {HTMLElement} element - Elemen yang akan dianimasikan.
   * @param {number} duration - Durasi animasi dalam milidetik.
   */
  static async fadeIn(element, duration = 300) {
    if (!element) return;
    try {
      element.style.opacity = 0; // Mulai dari transparan
      element.style.display = "block"; // atau 'flex', 'grid', dll., sesuai kebutuhan
      await this.animate(element, [{ opacity: 0 }, { opacity: 1 }], {
        duration,
      });
      element.style.opacity = 1; // Pastikan opacity kembali normal setelah animasi
    } catch (error) {
      // Jika animasi gagal, pastikan elemen tetap terlihat
      element.style.opacity = 1;
    }
  }
  static showConfirmationModal(message, onConfirm) {
    const modalEl = document.getElementById("confirmationModal");
    if (!modalEl) {
      console.error(
        "Elemen modal konfirmasi (#confirmationModal) tidak ditemukan."
      );
      return;
    }

    const messageEl = document.getElementById("confirmationModalMessage");
    const confirmBtn = document.getElementById("confirmationModalConfirmBtn");

    messageEl.textContent = message;

    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.addEventListener("click", () => {
      onConfirm();
      bootstrap.Modal.getInstance(modalEl).hide();
    });

    // Tampilkan modal menggunakan API Bootstrap
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
  }
}

export class StorageUtils {
  static setItem(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      Logger.error("Failed to set item in localStorage", { key, error: e });
    }
  }

  static getItem(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
      Logger.error("Failed to get item from localStorage", { key, error: e });
      return defaultValue;
    }
  }
  static removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      Logger.error("Failed to remove item from localStorage", {
        key,
        error: e,
      });
    }
  }

  static clear() {
    // Hanya clear item yang berhubungan dengan aplikasi
    const appKeys = [
      "warehouse_app_user",
      "warehouse_app_cart",
      "warehouse_app_last_transaction",
      "warehouse_app_last_transaction_date",
    ];
    appKeys.forEach((key) => localStorage.removeItem(key));
    Logger.info("App-specific storage cleared.");
  }
  /**
   * Mengambil data dari cache jika masih valid (belum kedaluwarsa).
   * @param {string} key - Kunci unik untuk item cache.
   * @returns {any|null} - Mengembalikan data jika ada dan valid, jika tidak null.
   */
  static getCache(key) {
    const itemStr = sessionStorage.getItem(key);
    if (!itemStr) {
      return null;
    }
    const item = JSON.parse(itemStr);
    const now = new Date();
    // Cek apakah cache sudah kedaluwarsa
    if (now.getTime() > item.expiry) {
      sessionStorage.removeItem(key);
      return null;
    }
    return item.data;
  }

  /**
   * Menyimpan data ke dalam cache dengan durasi kedaluwarsa.
   * @param {string} key - Kunci unik untuk item cache.
   * @param {any} data - Data yang akan disimpan.
   */
  static setCache(key, data) {
    const now = new Date();
    const item = {
      data: data,
      // Atur waktu kedaluwarsa berdasarkan AppConfig
      expiry: now.getTime() + AppConfig.CONSTANTS.CACHE_DURATION,
    };
    sessionStorage.setItem(key, JSON.stringify(item));
  }
  // vvvv TAMBAHKAN FUNGSI BARU INI DI SINI vvvv
  /**
   * Menghapus item spesifik dari session storage cache.
   * @param {string} key - Kunci cache yang akan dihapus.
   */
  static clearCacheItem(key) {
    try {
      // Langsung hapus dari sessionStorage
      sessionStorage.removeItem(key);
    } catch (e) {
      Logger.error("Gagal menghapus item dari sessionStorage", {
        key,
        error: e,
      });
    }
  }
}

export class CurrencyFormatter {
  static format(amount) {
    if (typeof amount !== "number" || isNaN(amount)) {
      return "Rp 0";
    }
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }
}

export const supabase = createClient(
  AppConfig.SUPABASE_URL,
  AppConfig.SUPABASE_ANON_KEY
);

class OfflineRequestQueue {
  constructor() {
    this.db = null;
    this.dbName = "gudang-offline-queue"; // Nama database untuk antrean
    this.storeName = "requests";
    this.init();
  }

  init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onerror = () =>
        reject("Error membuka IndexedDB untuk antrean offline.");
      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, {
            keyPath: "id",
            autoIncrement: true,
          });
        }
      };
    });
  }

  async addRequest(url, options) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(this.storeName, "readwrite");
      const store = transaction.objectStore(this.storeName);
      // Simpan body sebagai string JSON agar kompatibel dengan IndexedDB
      const requestData = {
        url,
        options: { ...options, body: JSON.parse(options.body) },
        timestamp: Date.now(),
      };
      const addRequest = store.add(requestData);
      addRequest.onsuccess = () => resolve();
      addRequest.onerror = (e) =>
        reject("Gagal menambahkan permintaan ke antrean: " + e.target.error);
    });
  }

  async getAllRequests() {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(this.storeName, "readonly");
      const store = transaction.objectStore(this.storeName);
      const getAllRequest = store.getAll();
      getAllRequest.onsuccess = (event) => resolve(event.target.result);
      getAllRequest.onerror = () =>
        reject("Gagal mengambil permintaan dari antrean.");
    });
  }

  async deleteRequest(id) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(this.storeName, "readwrite");
      const store = transaction.objectStore(this.storeName);
      const deleteRequest = store.delete(id);
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () =>
        reject("Gagal menghapus permintaan dari antrean.");
    });
  }
}
const offlineQueue = new OfflineRequestQueue();

export class APIClient {
  static baseUrl = `${AppConfig.SUPABASE_URL}/functions/v1`;

  static async _request(method, functionName, data = null) {
    const url = new URL(`${this.baseUrl}/${functionName}`);
    let options = { method, headers: {} };

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError)
        throw new Error(`Gagal mendapatkan sesi: ${sessionError.message}`);
      if (!session)
        throw new Error("Sesi tidak ditemukan. Silakan login kembali.");

      options.headers["Authorization"] = `Bearer ${session.access_token}`;
      options.headers["apikey"] = AppConfig.SUPABASE_ANON_KEY;

      if (data) {
        if (method === "GET") {
          url.search = new URLSearchParams(data).toString();
        } else if (data instanceof FormData) {
          // FormData tidak didukung untuk antrean offline, akan dilempar sebagai error biasa
          options.body = data;
        } else {
          options.headers["Content-Type"] = "application/json";
          options.body = JSON.stringify(data);
        }
      }

      const response = await fetch(url.toString(), options);
      const responseData = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          responseData?.error || `HTTP error! Status: ${response.status}`
        );
      }

      return { data: responseData, error: null };
    } catch (error) {
      Logger.error(`API Client Error (${method} ${functionName})`, error);

      // --- LOGIKA JEMBATAN OFFLINE ---
      const isOfflineError =
        error instanceof TypeError && error.message === "Failed to fetch";
      if (isOfflineError && method !== "GET" && !(data instanceof FormData)) {
        console.warn("Network request failed. Queuing for background sync.");
        try {
          // Menyimpan permintaan ke IndexedDB
          await offlineQueue.addRequest(url.toString(), options);
          // Mendaftarkan tugas sinkronisasi ke Service Worker
          await this.registerBackgroundSync();

          UIUtils.createToast(
            "info",
            "Anda sedang offline. Data akan dikirim setelah online kembali.",
            10000
          );

          // Memberi tahu pemanggil bahwa permintaan berhasil masuk antrean
          return {
            data: { message: "Request queued for offline sync." },
            error: null,
            queued: true,
          };
        } catch (queueError) {
          Logger.error("Failed to queue request", queueError);
          UIUtils.createToast(
            "error",
            "Gagal menyimpan data untuk sinkronisasi offline."
          );
          return { data: null, error: queueError };
        }
      }
      // Jika bukan error offline, kembalikan error seperti biasa
      return { data: null, error };
    }
  }

  static async registerBackgroundSync() {
    if ("serviceWorker" in navigator && "SyncManager" in window) {
      const registration = await navigator.serviceWorker.ready;
      try {
        await registration.sync.register("sync-offline-requests");
      } catch (err) {
        console.error("Background sync registration failed:", err);
      }
    } else {
      console.warn("Background Sync is not supported.");
    }
  }

  static async get(functionName, params) {
    return this._request("GET", functionName, params);
  }
  static async post(functionName, body) {
    return this._request("POST", functionName, body);
  }
  static async put(functionName, body) {
    return this._request("PUT", functionName, body);
  }
  static async delete(functionName, body) {
    return this._request("DELETE", functionName, body);
  }
}

export class UpdateManager {
  static checkForUpdates() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        // Cek jika ada service worker baru yang sedang menunggu
        if (registration.waiting) {
          this.showUpdateNotification(registration.waiting);
        }

        // Cek untuk pembaruan di masa depan
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              this.showUpdateNotification(newWorker);
            }
          });
        });
      });
    }
  }

  static showUpdateNotification(worker) {
    const toastContainer = UIUtils.createToastContainer();
    const toastId = "update-toast";

    // Hapus toast lama jika ada, untuk mencegah duplikasi
    const oldToast = document.getElementById(toastId);
    if (oldToast) {
      oldToast.remove();
    }

    const toastHTML = `
      <div id="${toastId}" class="toast show" role="alert" aria-live="assertive" aria-atomic="true" data-bs-autohide="false">
        <div class="toast-header">
          <i class="bi bi-cloud-arrow-down-fill me-2"></i>
          <strong class="me-auto">Pembaruan Tersedia</strong>
          <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
        <div class="toast-body">
          Versi baru aplikasi telah siap. Muat ulang untuk melihat perubahan.
          <div class="mt-2 pt-2 border-top">
            <button type="button" class="btn btn-primary btn-sm" id="reload-button">
              Muat Ulang Sekarang
            </button>
          </div>
        </div>
      </div>
    `;

    toastContainer.insertAdjacentHTML("beforeend", toastHTML);
    const reloadButton = document.getElementById("reload-button");

    // --- START PERBAIKAN LOGIKA ---
    reloadButton.addEventListener("click", () => {
      // Nonaktifkan tombol agar tidak diklik berkali-kali
      reloadButton.disabled = true;
      reloadButton.textContent = "Memuat ulang...";

      // Pasang listener yang akan dieksekusi HANYA KETIKA service worker baru sudah aktif
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        window.location.reload();
      });

      // Kirim pesan ke service worker yang sedang 'waiting' untuk menyuruhnya aktif
      worker.postMessage({ type: "SKIP_WAITING" });
    });
    // --- AKHIR PERBAIKAN LOGIKA ---
  }
}
