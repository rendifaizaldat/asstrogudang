class MasterProdukManager {
  constructor(state, renderer) {
    this.state = state;
    this.renderer = renderer;
  }

  renderInventarisTable(searchTerm = "") {
    this.renderer.renderInventarisTable(searchTerm);
  }

  handleStokInputChange(input) {
    const originalValue = input.dataset.originalValue;
    const currentValue = input.value;
    const productId = input.dataset.productId;
    const saveBtn = document.querySelector(
      `.save-stok-btn[data-product-id="${productId}"]`
    );

    if (currentValue !== originalValue && currentValue.trim() !== "") {
      input.classList.add("changed");
      if (saveBtn) saveBtn.disabled = false;
    } else {
      input.classList.remove("changed");
      if (saveBtn) saveBtn.disabled = true;
    }
  }

  async handleSaveStok(saveBtn) {
    const productId = saveBtn.dataset.productId;
    const input = document.querySelector(
      `.stok-input[data-product-id="${productId}"]`
    );
    const newStock = parseFloat(input.value);

    if (isNaN(newStock) || newStock < 0) return;

    this.state.updateStokProduk(productId, newStock);
    input.dataset.originalValue = newStock;
    input.classList.remove("changed");
    saveBtn.disabled = true;
  }
}

export { MasterProdukManager };
