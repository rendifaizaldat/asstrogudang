class SecurityValidator {
  static validateInput(value, type = "string", options = {}) {
    const {
      min = 0,
      max = Infinity,
      required = false,
      pattern = null,
    } = options;

    if (required && (value === undefined || value === null || value === "")) {
      return { valid: false, error: "Field is required" };
    }

    if (!required && (value === undefined || value === null || value === "")) {
      return { valid: true };
    }

    switch (type) {
      case "string":
        if (typeof value !== "string")
          return { valid: false, error: "Must be a string" };
        if (value.length < min)
          return { valid: false, error: `Minimum length is ${min}` };
        if (value.length > max)
          return { valid: false, error: `Maximum length is ${max}` };
        if (pattern && !pattern.test(value))
          return { valid: false, error: "Invalid format" };
        break;

      case "number":
        const num = Number(value);
        if (isNaN(num)) return { valid: false, error: "Must be a number" };
        if (num < min)
          return { valid: false, error: `Minimum value is ${min}` };
        if (num > max)
          return { valid: false, error: `Maximum value is ${max}` };
        break;

      case "integer":
        const int = Number(value);
        if (isNaN(int) || !Number.isInteger(int))
          return { valid: false, error: "Must be an integer" };
        if (int < min)
          return { valid: false, error: `Minimum value is ${min}` };
        if (int > max)
          return { valid: false, error: `Maximum value is ${max}` };
        break;

      case "email":
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(value))
          return { valid: false, error: "Invalid email format" };
        break;

      case "date":
        const date = new Date(value);
        if (isNaN(date.getTime()))
          return { valid: false, error: "Invalid date" };
        break;
    }

    return { valid: true };
  }

  static sanitizeInput(input) {
    if (typeof input !== "string") return input;
    return input.replace(/[<>\"'&]/g, (match) => {
      const entities = {
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#x27;",
        "&": "&amp;",
      };
      return entities[match];
    });
  }

  static validateBarangMasukData(data) {
    const errors = [];
    const vendorValidation = this.validateInput(data.nama_vendor, "string", {
      required: true,
      min: 2,
      max: 100,
    });
    if (!vendorValidation.valid)
      errors.push(`Vendor: ${vendorValidation.error}`);

    const notaValidation = this.validateInput(data.no_nota_vendor, "string", {
      required: true,
      min: 3,
      max: 50,
    });
    if (!notaValidation.valid) errors.push(`No Nota: ${notaValidation.error}`);

    const itemValidation = this.validateInput(data.nama_barang, "string", {
      required: true,
      min: 2,
      max: 100,
    });
    if (!itemValidation.valid)
      errors.push(`Nama Barang: ${itemValidation.error}`);

    const qtyValidation = this.validateInput(data.qty, "number", {
      required: true,
      min: 0.01,
      max: 999999,
    });
    if (!qtyValidation.valid) errors.push(`Quantity: ${qtyValidation.error}`);

    const hargaValidation = this.validateInput(data.harga, "number", {
      required: true,
      min: 1,
      max: 999999999,
    });
    if (!hargaValidation.valid) errors.push(`Harga: ${hargaValidation.error}`);

    return { valid: errors.length === 0, errors };
  }
}

export { SecurityValidator };
