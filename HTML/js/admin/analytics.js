class AdminAnalytics {
  constructor() {
    this.activities = [];
    this.user = null;
    this.sessionStart = Date.now();
  }

  setUser(user) {
    this.user = user;
  }

  recordActivity(type, data = {}) {
    const activity = {
      id: `act-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      data: JSON.stringify(data),
      timestamp: new Date().toISOString(),
      user: this.user?.email || "unknown",
    };
    this.activities.unshift(activity);
    if (this.activities.length > 200) {
      this.activities = this.activities.slice(0, 200);
    }
  }

  getRecentActivities(limit = 10) {
    return this.activities.slice(0, limit).map((activity) => ({
      ...activity,
      timeAgo: this.getTimeAgo(new Date(activity.timestamp)),
      icon: this.getActivityIcon(activity.type),
      color: this.getActivityColor(activity.type),
    }));
  }

  getActivityIcon(type) {
    const icons = {
      session_started: "bi-person-check",
      login: "bi-person-check",
      logout: "bi-person-x",
      nota_session_started: "bi-receipt",
      nota_session_ended: "bi-receipt-cutoff",
      barang_masuk_added: "bi-box-arrow-in-down",
      barang_masuk_removed: "bi-trash",
      barang_masuk_updated: "bi-pencil",
      barang_masuk_cleared: "bi-x-circle",
      status_updated: "bi-check-circle",
      stok_updated: "bi-boxes",
      file_uploaded: "bi-upload",
      data_exported: "bi-download",
      search_performed: "bi-search",
      error: "bi-exclamation-triangle",
    };
    return icons[type] || "bi-info-circle";
  }

  getActivityColor(type) {
    const colors = {
      session_started: "success",
      login: "success",
      logout: "secondary",
      nota_session_started: "info",
      nota_session_ended: "info",
      barang_masuk_added: "primary",
      barang_masuk_removed: "warning",
      barang_masuk_updated: "info",
      barang_masuk_cleared: "danger",
      status_updated: "success",
      stok_updated: "primary",
      file_uploaded: "success",
      data_exported: "info",
      search_performed: "secondary",
      error: "danger",
    };
    return colors[type] || "secondary";
  }

  getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Baru saja";
    if (diffMins < 60) return `${diffMins} menit lalu`;
    if (diffHours < 24) return `${diffHours} jam lalu`;
    if (diffDays < 7) return `${diffDays} hari lalu`;
    return date.toLocaleDateString("id-ID");
  }

  getReport() {
    const sessionDuration = Date.now() - this.sessionStart;
    return {
      totalActivities: this.activities.length,
      sessionDuration: Math.floor(sessionDuration / 1000 / 60),
      recentActivities: this.getRecentActivities(5),
      userInfo: {
        email: this.user?.email,
        role: this.user?.role,
        sessionStart: new Date(this.sessionStart).toISOString(),
      },
    };
  }
}

export { AdminAnalytics };
