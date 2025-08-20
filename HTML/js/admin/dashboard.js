class DashboardManager {
  constructor(state, renderer) {
    this.state = state;
    this.renderer = renderer;
  }

  refreshDashboard() {
    const summaryData = this.state.getSummaryData();
    const detailsData = this.state.getDashboardDetails();
    this.renderer.renderSummaryCards(summaryData);
    this.renderer.renderDashboardDetails(detailsData);
  }

  generateAlerts() {
    return this.state.generateAlerts();
  }

  getSummaryData() {
    return this.state.getSummaryData();
  }
}

export { DashboardManager };
