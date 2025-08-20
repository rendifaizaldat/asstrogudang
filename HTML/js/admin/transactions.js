class TransactionsManager {
  constructor(state, renderer) {
    this.state = state;
    this.renderer = renderer;
  }

  renderPiutangTable(searchTerm = "", statusFilter = "all") {
    this.renderer.renderPiutangTable(searchTerm, statusFilter);
  }

  renderHutangTable(searchTerm = "", statusFilter = "all") {
    this.renderer.renderHutangTable(searchTerm, statusFilter);
  }

  getStatusBadgeClass(status) {
    return this.renderer.getStatusBadgeClass(status);
  }

  isLunas(status) {
    return this.renderer.isLunas(status);
  }

  renderBuktiTransfer(buktiTransfer, id, type) {
    return this.renderer.renderBuktiTransfer(buktiTransfer, id, type);
  }

  async handleStatusToggle(toggle) {
    const type = toggle.dataset.type;
    const id = toggle.dataset.id;
    const newStatus = toggle.checked ? "Lunas" : "Belum Lunas";

    this.state.updateItemStatus(type, id, newStatus);
  }
}

export { TransactionsManager };
