class AutocompleteInput {
  constructor(inputId, resultsId, dataSource) {
    this.inputEl = document.getElementById(inputId);
    this.resultsEl = document.getElementById(resultsId);
    this.dataSource = dataSource;
    this.selectedItem = null;

    this.inputEl.addEventListener("input", () => this.onInput());
    this.inputEl.addEventListener("blur", () => this.onBlur());

    // Tambahkan event listener untuk keyboard
    this.inputEl.addEventListener("keydown", (e) => this.onKeydown(e));
  }

  onKeydown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      const firstItem = this.getFirstItem();
      if (firstItem) {
        this.selectItem(firstItem.id);
        // Kirim event custom untuk memberitahu app.js
        this.inputEl.dispatchEvent(new Event("item-selected-by-enter"));
      }
    }
  }

  onInput() {
    const query = this.inputEl.value.toLowerCase();
    this.selectedItem = null;

    if (query.length < 2) {
      this.hideResults();
      return;
    }

    const filteredData = this.dataSource.filter(
      (item) =>
        item.nama.toLowerCase().includes(query) ||
        (item.kode_produk && item.kode_produk.toLowerCase().includes(query))
    );

    this.renderResults(filteredData, query);
  }

  renderResults(data, query) {
    if (data.length === 0) {
      this.hideResults();
      return;
    }

    this.resultsEl.innerHTML = data
      .slice(0, 10)
      .map(
        (item) => `
      <div class="autocomplete-item" data-id="${item.id}">
        ${this.highlightMatch(item.nama, query)}
        <small class="d-block text-muted">Kode: ${this.highlightMatch(
          item.kode_produk || "",
          query
        )} | Stok: ${item.sisa_stok}</small>
      </div>
    `
      )
      .join("");

    this.resultsEl.style.display = "block";
    this.setupResultListeners();
  }

  highlightMatch(text, query) {
    if (!text) return "";
    const regex = new RegExp(`(${query})`, "gi");
    return text.replace(regex, "<strong>$1</strong>");
  }

  setupResultListeners() {
    this.resultsEl.querySelectorAll(".autocomplete-item").forEach((itemEl) => {
      itemEl.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this.selectItem(itemEl.dataset.id);
      });
    });
  }

  selectItem(selectedId) {
    this.selectedItem = this.dataSource.find((item) => item.id == selectedId);
    if (this.selectedItem) {
      this.inputEl.value = this.selectedItem.nama;
    }
    this.hideResults();
  }

  getFirstItem() {
    const firstItemEl = this.resultsEl.querySelector(".autocomplete-item");
    if (firstItemEl) {
      const firstItemId = firstItemEl.dataset.id;
      return this.dataSource.find((item) => item.id == firstItemId);
    }
    return null;
  }

  getSelectedItem() {
    return this.selectedItem;
  }

  onBlur() {
    setTimeout(() => this.hideResults(), 200);
  }

  hideResults() {
    this.resultsEl.style.display = "none";
    this.resultsEl.innerHTML = "";
  }
}

export { AutocompleteInput };
