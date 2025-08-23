import { SecurityValidator } from "./security.js";
import { AdminAnalytics } from "./analytics.js";

class LocalDataManager {
  constructor() {
    this.db = null;
    this.dbName = "gudang-data-cache";
    this.stores = ["products", "receivables", "payables", "vendors"];
  }

  async init() {
    return new Promise((resolve, reject) => {
      if (this.db) return resolve(this.db);
      const request = indexedDB.open(this.dbName, 1);
      request.onerror = () =>
        reject("Gagal membuka IndexedDB untuk data cache.");
      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        this.stores.forEach((storeName) => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: "id" });
          }
        });
      };
    });
  }

  async syncAllData(data) {
    if (!this.db) await this.init();
    const transaction = this.db.transaction(this.stores, "readwrite");
    const promises = [];

    for (const storeName in data) {
      if (this.stores.includes(storeName)) {
        const store = transaction.objectStore(storeName);
        store.clear(); // Hapus data lama
        data[storeName].forEach((item) => {
          store.put(item); // Masukkan data baru
        });
      }
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        localStorage.setItem("lastSyncTimestamp", new Date().toISOString());
        resolve();
      };
      transaction.onerror = (event) =>
        reject("Gagal sinkronisasi: " + event.target.error);
    });
  }

  async getData(storeName) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      store.getAll().onsuccess = (event) => resolve(event.target.result);
      store.getAll().onerror = (event) =>
        reject("Gagal mengambil data dari cache: " + event.target.error);
    });
  }
}
export const localData = new LocalDataManager();

class AdminState {
  constructor() {
    this.data = {
      products: [],
      receivables: [],
      payables: [],
      vendors: [],
      barangMasukList: [],
      purchaseOrderList: [],
      returnList: [],
    };
    this.user = null;
    this.isOffline = !navigator.onLine;
    this.listeners = new Set();
    this.isLoading = false;
    this.currentNotaSession = null;
    this.analytics = new AdminAnalytics();
    this.currentPOSession = null;
    this.currentReturnSession = null;
    this.activeDateRange = { start: null, end: null };
    this.productFilter = { status: "all" };
    window.addEventListener("online", () => this.handleConnectionChange(true));
    window.addEventListener("offline", () =>
      this.handleConnectionChange(false)
    );
  }
  // **** START: RETURN MANAGEMENT METHODS ****
  startReturnSession(sessionData) {
    if (this.data.returnList.length > 0) {
      throw new Error("Selesaikan sesi retur sebelumnya atau reset form.");
    }
    this.currentReturnSession = { ...sessionData, items: [] };
    this.notifyListeners("return-session-started", this.currentReturnSession);
  }

  addReturnItem(item) {
    if (!this.currentReturnSession) {
      throw new Error("Mulai sesi retur terlebih dahulu.");
    }
    const existingIndex = this.data.returnList.findIndex(
      (i) => i.product_id === item.product_id
    );
    if (existingIndex > -1) {
      this.data.returnList[existingIndex].quantity += item.quantity;
    } else {
      this.data.returnList.push(item);
    }
    this.notifyListeners("return-item-added", { item });
  }

  removeReturnItem(index) {
    if (this.data.returnList[index]) {
      const removed = this.data.returnList.splice(index, 1)[0];
      this.notifyListeners("return-item-removed", { item: removed });
      return true;
    }
    return false;
  }

  clearReturnList() {
    this.data.returnList = [];
    this.currentReturnSession = null;
    this.notifyListeners("return-cleared");
  }

  getCurrentReturnSession() {
    return this.currentReturnSession;
  }
  // **** END: RETURN MANAGEMENT METHODS ****
  // --- TAMBAHKAN FUNGSI BARU DI BAWAH INI ---
  async handleConnectionChange(isOnline) {
    this.isOffline = !isOnline;
    this.notifyListeners("connection-changed", { isOnline });
    if (isOnline) {
      UIUtils.createToast("success", "Koneksi internet kembali pulih.");
      // Coba sinkronisasi data di latar belakang
      // (Ini akan diimplementasikan di app.js)
    } else {
      UIUtils.createToast(
        "warning",
        "Anda sekarang offline. Beberapa fitur mungkin terbatas.",
        8000
      );
    }
  }

  async loadDataFromCache() {
    this.setLoading(true, "Memuat data dari cache lokal...");
    try {
      const [products, receivables, payables, vendors] = await Promise.all([
        localData.getData("products"),
        localData.getData("receivables"),
        localData.getData("payables"),
        localData.getData("vendors"),
      ]);
      this.setData("products", products || []);
      this.setData("receivables", receivables || []);
      this.setData("payables", payables || []);
      this.setData("vendors", vendors || []);
    } catch (error) {
      console.error("Gagal memuat dari cache:", error);
    } finally {
      this.setLoading(false);
    }
  }

  setData(key, value) {
    if (this.data.hasOwnProperty(key)) {
      this.data[key] = value;
      this.notifyListeners("data-updated", { key, value });
    }
  }

  getData(key) {
    return this.data[
      key
        .replace("piutang", "receivables")
        .replace("hutang", "payables")
        .replace("inventaris", "products")
    ];
  }

  /**
   * Menyimpan rentang tanggal aktif dan memberitahu listeners.
   * @param {Date|null} startDate - Tanggal mulai.
   * @param {Date|null} endDate - Tanggal selesai.
   */
  setActiveDateRange(startDate, endDate) {
    this.activeDateRange = { start: startDate, end: endDate };
    this.notifyListeners("date-range-updated", this.activeDateRange);
  }

  /**
   * Helper internal untuk memfilter array data berdasarkan rentang tanggal.
   * @param {Array} dataArray - Array yang akan difilter.
   * @param {string} dateField - Nama properti yang berisi tanggal (e.g., 'tanggal_pengiriman').
   * @returns {Array} - Array yang sudah difilter.
   */
  _filterDataByDate(dataArray, dateField) {
    const { start, end } = this.activeDateRange;
    if (!start || !end || !dataArray) {
      return dataArray || []; // Kembalikan data asli jika tidak ada filter
    }

    // Pastikan tanggal akhir mencakup keseluruhan hari
    const inclusiveEndDate = new Date(end);
    inclusiveEndDate.setHours(23, 59, 59, 999);

    return dataArray.filter((item) => {
      const itemDate = new Date(item[dateField]);
      return itemDate >= start && itemDate <= inclusiveEndDate;
    });
  }

  startNotaSession(vendor, noNota, tanggalNota, tanggalJatuhTempo) {
    if (this.data.barangMasukList.length > 0) {
      throw new Error(
        "Selesaikan nota sebelumnya terlebih dahulu atau reset form"
      );
    }

    const validation = SecurityValidator.validateInput(vendor, "string", {
      required: true,
      min: 2,
    });
    if (!validation.valid)
      throw new Error(`Vendor tidak valid: ${validation.error}`);

    const notaValidation = SecurityValidator.validateInput(noNota, "string", {
      required: true,
      min: 3,
    });
    if (!notaValidation.valid)
      throw new Error(`No Nota tidak valid: ${notaValidation.error}`);

    this.currentNotaSession = {
      vendor: SecurityValidator.sanitizeInput(vendor),
      noNota: SecurityValidator.sanitizeInput(noNota),
      tanggalNota,
      tanggalJatuhTempo,
      startTime: Date.now(),
    };
    this.analytics.recordActivity(
      "nota_session_started",
      this.currentNotaSession
    );
    this.notifyListeners("nota-session-started", this.currentNotaSession);
  }

  endNotaSession() {
    if (this.currentNotaSession) {
      this.analytics.recordActivity("nota_session_ended", {
        ...this.currentNotaSession,
        duration: Date.now() - this.currentNotaSession.startTime,
        itemCount: this.data.barangMasukList.length,
      });
    }
    const ended = this.currentNotaSession;
    this.currentNotaSession = null;
    this.notifyListeners("barang-masuk-cleared");
    this.analytics.recordActivity("incoming_goods_session_ended", {
      ...ended,
      duration: Date.now() - (ended?.startTime || Date.now()),
      itemCount: this.getData("barangMasukList")?.length || 0,
    });
  }

  getCurrentNotaSession() {
    return this.currentNotaSession;
  }

  addBarangMasuk(item) {
    if (!this.currentNotaSession) {
      throw new Error("Silakan isi informasi vendor dan nota terlebih dahulu");
    }

    const enhancedItem = {
      ...item,
      nama_vendor: this.currentNotaSession.vendor,
      no_nota_vendor: this.currentNotaSession.noNota,
    };

    const validation = SecurityValidator.validateBarangMasukData(enhancedItem);
    if (!validation.valid) {
      throw new Error("Data tidak valid: " + validation.errors.join(", "));
    }

    const existingItemIndex = this.data.barangMasukList.findIndex(
      (existing) => existing.id_barang === item.id_barang
    );

    if (existingItemIndex > -1) {
      const existingItem = this.data.barangMasukList[existingItemIndex];
      const newQty = Number(existingItem.qty) + Number(item.qty);
      this.updateBarangMasuk(existingItemIndex, {
        qty: newQty,
        harga: item.harga,
      });
      return { status: "merged" };
    }

    const finalItem = {
      ...enhancedItem,
      id: `BM-${Date.now()}`,
      total: Number(item.qty) * Number(item.harga),
    };

    this.data.barangMasukList.push(finalItem);
    this.analytics.recordActivity("barang_masuk_added", finalItem);
    this.notifyListeners("barang-masuk-added", { item: finalItem });
    return { status: "added" };
  }

  updateBarangMasukQuantity(itemId, additionalQty, newHarga) {
    const index = this.data.barangMasukList.findIndex(
      (item) => item.id === itemId
    );
    if (index === -1) return false;

    const item = this.data.barangMasukList[index];
    const totalQty = Number(item.qty) + Number(additionalQty);
    const finalHarga = newHarga || item.harga;

    const updates = {
      qty: totalQty,
      harga: finalHarga,
      total: totalQty * finalHarga,
      lastModified: new Date().toISOString(),
    };

    return this.updateBarangMasuk(index, updates);
  }

  removeBarangMasuk(index) {
    if (index >= 0 && index < this.data.barangMasukList.length) {
      const removed = this.data.barangMasukList.splice(index, 1)[0];
      this.analytics.recordActivity("barang_masuk_removed", removed);
      this.notifyListeners("barang-masuk-removed", { index, item: removed });
      return true;
    }
    return false;
  }

  updateBarangMasuk(index, updates) {
    if (index >= 0 && index < this.data.barangMasukList.length) {
      const item = this.data.barangMasukList[index];

      if (updates.qty !== undefined) {
        const qtyValidation = SecurityValidator.validateInput(
          updates.qty,
          "number",
          { min: 0.01 }
        );
        if (!qtyValidation.valid)
          throw new Error(`Quantity tidak valid: ${qtyValidation.error}`);
      }

      if (updates.harga !== undefined) {
        const hargaValidation = SecurityValidator.validateInput(
          updates.harga,
          "number",
          { min: 1 }
        );
        if (!hargaValidation.valid)
          throw new Error(`Harga tidak valid: ${hargaValidation.error}`);
      }

      Object.assign(item, updates, {
        total: (updates.qty || item.qty) * (updates.harga || item.harga),
        lastModified: new Date().toISOString(),
      });

      this.analytics.recordActivity("barang_masuk_updated", { index, updates });
      this.notifyListeners("barang-masuk-updated", { index, item });
      return true;
    }
    return false;
  }

  clearBarangMasuk() {
    const count = this.data.barangMasukList.length;
    this.data.barangMasukList = [];
    this.endNotaSession();
    this.analytics.recordActivity("barang_masuk_cleared", { count });
    this.notifyListeners("barang-masuk-cleared");
  }

  updateItemStatus(type, id, status) {
    const dataKey = type === "piutang" ? "piutang" : "hutang";
    const items = this.getData(dataKey);
    const index = items.findIndex((item) => item.id == id);

    if (index !== -1) {
      items[index].status = status;
      this.setData(dataKey, items);
      this.analytics.recordActivity("status_updated", { type, id, status });
      return true;
    }
    return false;
  }

  updateItemBuktiTransfer(type, id, url) {
    const dataKey = type === "piutang" ? "piutang" : "hutang";
    const items = this.getData(dataKey);
    const index = items.findIndex((item) => item.id == id);

    if (index !== -1) {
      items[index].bukti_transfer = url;
      this.setData(dataKey, items);
      this.analytics.recordActivity("file_uploaded", { type, id });
      return true;
    }
    return false;
  }

  updateStokProduk(productId, newStok) {
    const validation = SecurityValidator.validateInput(newStok, "integer", {
      min: 0,
    });
    if (!validation.valid)
      throw new Error(`Stok tidak valid: ${validation.error}`);

    const inventaris = this.getData("inventaris");
    const index = inventaris.findIndex((item) => item.id === productId);

    if (index !== -1) {
      const oldStok = inventaris[index].stok_awal;
      inventaris[index].stok_awal = Number(newStok);
      inventaris[index].sisa_stok = Number(newStok);
      inventaris[index].lastUpdated = new Date().toISOString();
      this.setData("inventaris", inventaris);
      this.analytics.recordActivity("stok_updated", {
        productId,
        oldStok,
        newStok,
      });
      return true;
    }
    return false;
  }

  searchData(query, dataType, filters = {}) {
    let data = this.getData(dataType);
    if (!data) return [];

    const lowercaseQuery = query
      ? SecurityValidator.sanitizeInput(query.toLowerCase())
      : "";

    // Terapkan filter terlebih dahulu
    let filteredData = data;
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== "all") {
        filteredData = filteredData.filter((item) => {
          if (key === "status" && dataType !== "inventaris") {
            // Filter status untuk piutang/hutang
            return (
              (item.status || "Belum Lunas").toLowerCase() ===
              value.toLowerCase()
            );
          }
          // Jangan filter status produk di sini, kita akan gabungkan di bawah
          if (key !== "status") {
            return String(item[key])
              .toLowerCase()
              .includes(value.toLowerCase());
          }
          return true;
        });
      }
    });

    // Kemudian terapkan pencarian DAN filter status produk dari hasil yang sudah difilter
    if (
      lowercaseQuery ||
      (dataType === "inventaris" && filters.status && filters.status !== "all")
    ) {
      filteredData = filteredData.filter((item) => {
        let matchesSearch = true;
        if (lowercaseQuery) {
          let searchableContent = "";
          if (dataType === "inventaris") {
            searchableContent = `${item.nama || ""} ${
              item.kode_produk || ""
            }`.toLowerCase();
          } else {
            searchableContent = `${item.invoice_id || ""} ${
              item.no_nota_vendor || ""
            } ${item.outlet_name || ""} ${
              item.nama_vendor || ""
            }`.toLowerCase();
          }
          matchesSearch = searchableContent.includes(lowercaseQuery);
        }

        let matchesStatus = true;
        if (
          dataType === "inventaris" &&
          filters.status &&
          filters.status !== "all"
        ) {
          const stok = Number(item.sisa_stok);
          if (filters.status === "habis") {
            matchesStatus = stok <= 0;
          } else if (filters.status === "rendah") {
            matchesStatus = stok > 0 && stok <= 5;
          }
        }

        return matchesSearch && matchesStatus;
      });
    }

    return filteredData;
  }

  getSummaryData() {
    const allReceivables = this.getData("receivables");
    const allPayables = this.getData("payables");
    const allProducts = this.getData("inventaris");

    // --- START LOGIKA FILTER ---
    const { start, end } = this.dashboardDateRange;
    let filteredReceivables = allReceivables;
    let filteredPayables = allPayables;

    if (start && end) {
      const startDate = new Date(start);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(end);
      endDate.setHours(23, 59, 59, 999);

      filteredReceivables = allReceivables.filter((item) => {
        const itemDate = new Date(item.tanggal_pengiriman || item.created_at);
        return itemDate >= startDate && itemDate <= endDate;
      });

      filteredPayables = allPayables.filter((item) => {
        const itemDate = new Date(item.tanggal_nota || item.created_at);
        return itemDate >= startDate && itemDate <= endDate;
      });
    }
    // --- END LOGIKA FILTER ---

    const summary = {
      totalProduk: allProducts.length,
      produkHabis: allProducts.filter((p) => Number(p.sisa_stok) <= 0).length,
      produkStokRendah: allProducts.filter((p) => {
        const stok = Number(p.sisa_stok);
        return stok > 0 && stok <= 5;
      }).length,
      // Gunakan data yang sudah difilter untuk kalkulasi
      totalPiutang: filteredReceivables
        .filter((p) => (p.status || "belum lunas").toLowerCase() !== "lunas")
        .reduce((sum, p) => sum + (Number(p.total_tagihan) || 0), 0),
      totalHutang: filteredPayables
        .filter((h) => (h.status || "belum lunas").toLowerCase() !== "lunas")
        .reduce((sum, h) => sum + (Number(h.total_tagihan) || 0), 0),
      totalTransaksi: filteredReceivables.length,
      // Kalkulasi lain tetap menggunakan data yang sudah difilter
      piutangOverdue: this.getOverdueItems(filteredReceivables),
      hutangOverdue: this.getOverdueItems(filteredPayables),
      rata2Transaksi:
        filteredReceivables.length > 0
          ? filteredReceivables.reduce(
              (sum, p) => sum + (Number(p.total_tagihan) || 0),
              0
            ) / filteredReceivables.length
          : 0,
    };

    summary.trends = this.calculateTrends(
      filteredReceivables,
      filteredPayables
    ); // Kirim data terfilter ke tren
    return summary;
  }

  getOverdueItems(items) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);

    return items.filter((item) => {
      const itemDate = new Date(item.created_at || item.timestamp);
      if (isNaN(itemDate.getTime())) {
        return false;
      }

      const isNotLunas =
        (item.status || "belum lunas").toLowerCase() !== "lunas";

      itemDate.setHours(0, 0, 0, 0);

      return isNotLunas && itemDate < thirtyDaysAgo;
    });
  }
  setDashboardDateRange(start, end) {
    this.dashboardDateRange = { start, end };
    this.productFilter = { status: "all" };
    this.notifyListeners("dashboard-filter-changed");
  }

  calculateTrends(piutang, hutang) {
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const lastMonth = new Date(thisMonth);
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    const thisMonthPiutang = piutang.filter(
      (p) => new Date(p.created_at) >= thisMonth
    );
    const lastMonthPiutang = piutang.filter((p) => {
      const date = new Date(p.created_at);
      return date >= lastMonth && date < thisMonth;
    });

    const thisMonthHutang = hutang.filter(
      (h) => new Date(h.created_at) >= thisMonth
    );
    const lastMonthHutang = hutang.filter((h) => {
      const date = new Date(h.created_at);
      return date >= lastMonth && date < thisMonth;
    });

    return {
      piutangGrowth: this.calculateGrowthRate(
        lastMonthPiutang.length,
        thisMonthPiutang.length
      ),
      hutangGrowth: this.calculateGrowthRate(
        lastMonthHutang.length,
        thisMonthHutang.length
      ),
      transaksiGrowth: this.calculateGrowthRate(
        lastMonthPiutang.length,
        thisMonthPiutang.length
      ),
    };
  }

  calculateGrowthRate(oldValue, newValue) {
    if (oldValue === 0) return newValue > 0 ? 100 : 0;
    return ((newValue - oldValue) / oldValue) * 100;
  }

  getDashboardDetails() {
    // Data produk tidak difilter
    const inventaris = this.getData("inventaris");

    // Filter data piutang dan hutang
    const piutang = this._filterDataByDate(
      this.getData("piutang"),
      "tanggal_pengiriman"
    );
    const hutang = this._filterDataByDate(
      this.getData("hutang"),
      "tanggal_nota"
    );

    const produkHabis = inventaris
      .filter((p) => Number(p.sisa_stok) <= 0)
      .slice(0, 10);

    const produkStokRendah = inventaris
      .filter((p) => {
        const stok = Number(p.sisa_stok);
        return stok > 0 && stok <= 5;
      })
      .slice(0, 10);

    const hutangJatuhTempo = hutang
      .filter((h) => (h.status || "belum lunas").toLowerCase() !== "lunas")
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .slice(0, 10);

    const piutangJatuhTempo = piutang
      .filter((p) => (p.status || "belum lunas").toLowerCase() !== "lunas")
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .slice(0, 10);

    const alerts = this.generateAlerts(); // generateAlerts sekarang akan menggunakan data terfilter dari getSummaryData

    return {
      produkHabis,
      produkStokRendah,
      hutangJatuhTempo,
      piutangJatuhTempo,
      alerts,
    };
  }

  generateAlerts() {
    const alerts = [];
    const summary = this.getSummaryData();

    if (summary.produkHabis > 0) {
      alerts.push({
        type: "danger",
        title: "Stok Habis",
        message: `${summary.produkHabis} produk kehabisan stok`,
        action: "Lihat Produk",
        target: "#master-produk",
        priority: "high",
      });
    }

    if (summary.produkStokRendah > 0) {
      alerts.push({
        type: "warning",
        title: "Stok Rendah",
        message: `${summary.produkStokRendah} produk stok hampir habis`,
        action: "Periksa Stok",
        target: "#master-produk",
        priority: "medium",
      });
    }

    if (summary.piutangOverdue.length > 0) {
      alerts.push({
        type: "info",
        title: "Piutang Jatuh Tempo",
        message: `${summary.piutangOverdue.length} piutang perlu ditagih`,
        action: "Lihat Piutang",
        target: "#piutang-outlet",
        priority: "medium",
      });
    }

    if (summary.hutangOverdue.length > 0) {
      alerts.push({
        type: "warning",
        title: "Hutang Jatuh Tempo",
        message: `${summary.hutangOverdue.length} hutang perlu dibayar`,
        action: "Lihat Hutang",
        target: "#hutang-vendor",
        priority: "high",
      });
    }

    const priorityOrder = { high: 3, medium: 2, low: 1 };
    return alerts
      .sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority])
      .slice(0, 5);
  }
  /**
   * Mengatur informasi pengguna dan meneruskannya ke modul analytics.
   * @param {object} user - Objek pengguna dari Supabase.
   */
  setUser(user) {
    this.user = user;
    this.analytics.setUser(user);
  }

  /**
   * Metode delegasi untuk mendapatkan laporan dari modul analytics.
   * @returns {object} - Laporan analytics.
   */
  getAnalytics() {
    return this.analytics.getReport();
  }

  setLoading(loading) {
    this.isLoading = loading;
    this.notifyListeners("loading-changed", { loading });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners(event, data = null) {
    this.listeners.forEach((listener) => {
      try {
        listener(event, data);
      } catch (error) {}
    });
  }
  startPOSession(sessionData) {
    if (this.data.purchaseOrderList.length > 0) {
      throw new Error("Selesaikan PO sebelumnya atau reset form.");
    }
    this.currentPOSession = { ...sessionData, items: [] };
    this.notifyListeners("po-session-started", this.currentPOSession);
  }

  getCurrentPOSession() {
    return this.currentPOSession;
  }
  removePOItem(index) {
    if (!this.currentPOSession || !this.currentPOSession.items[index]) {
      return false;
    }
    const removed = this.currentPOSession.items.splice(index, 1)[0];
    this.notifyListeners("po-item-removed", { item: removed });
    return true;
  }

  addPOItem(item) {
    if (!this.currentPOSession) {
      throw new Error("Mulai sesi PO terlebih dahulu.");
    }
    if (item.qty > item.sisa_stok) {
      throw new Error(
        `Stok ${item.nama} tidak mencukupi (sisa: ${item.sisa_stok})`
      );
    }
    const existingIndex = this.currentPOSession.items.findIndex(
      (i) => i.product_id === item.product_id
    );
    if (existingIndex > -1) {
      this.currentPOSession.items[existingIndex].qty += item.qty;
    } else {
      this.currentPOSession.items.push(item);
    }
    this.notifyListeners("po-item-added", { item });
  }

  clearPurchaseOrder() {
    this.currentPOSession = null;
    this.notifyListeners("po-cleared");
  }
  getFinancialSummary(data) {
    if (!data) {
      return { lunas: 0, belumLunas: 0, total: 0 };
    }

    return data.reduce(
      (summary, item) => {
        const totalTagihan = Number(item.total_tagihan) || 0;
        const isLunas =
          (item.status || "belum lunas").toLowerCase() === "lunas";

        if (isLunas) {
          summary.lunas += totalTagihan;
        } else {
          summary.belumLunas += totalTagihan;
        }
        summary.total += totalTagihan;
        return summary;
      },
      { lunas: 0, belumLunas: 0, total: 0 }
    );
  }
}

export { AdminState };
