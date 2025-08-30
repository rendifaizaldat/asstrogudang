class AdminAnimationController {
  constructor() {
    this.addAnimationStyles();
  }

  animateCards(cards) {
    cards.forEach((card, index) => {
      card.style.opacity = "0";
      card.style.transform = "translateY(20px)";
      setTimeout(() => {
        card.style.transition =
          "all 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)";
        card.style.opacity = "1";
        card.style.transform = "translateY(0)";
      }, index * 100);
    });
  }

  addAnimationStyles() {
    if (document.getElementById("admin-animations")) return;

    const styles = document.createElement("style");
    styles.id = "admin-animations";
    styles.textContent = `
      .summary-card {
        transform: translateY(20px);
        opacity: 0;
        animation: cardEnter 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards;
      }
      
      @keyframes cardEnter {
        to { transform: translateY(0); opacity: 1; }
      }
      
      .table-row-enter {
        animation: rowSlideIn 0.4s ease-out forwards;
        opacity: 0;
        transform: translateX(-20px);
      }
      
      @keyframes rowSlideIn {
        to { opacity: 1; transform: translateX(0); }
      }
      
      .table-row:hover {
        background-color: rgba(99, 102, 241, 0.05);
        transform: scale(1.01);
        transition: all 0.2s ease;
      }
      
      .pulse-animation {
        animation: pulse 2s ease-in-out infinite;
      }
      
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; transform: scale(1.05); }
      }
      
      .trend-indicator {
        font-size: 0.75rem;
        padding: 0.25rem 0.5rem;
        border-radius: 1rem;
        font-weight: 600;
        animation: fadeInUp 0.6s ease-out;
      }
      
      .trend-indicator.positive {
        background: rgba(16, 185, 129, 0.1);
        color: #10b981;
      }
      
      .trend-indicator.negative {
        background: rgba(239, 68, 68, 0.1);
        color: #ef4444;
      }
      
      @keyframes fadeInUp {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      .glass-card {
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        transition: all 0.3s ease;
      }
      
      .glass-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
      }
      
      .status-toggle:checked {
        background-color: var(--bs-success);
        border-color: var(--bs-success);
      }
      
      .btn-group-sm .btn {
        transition: all 0.2s ease;
      }
      
      .btn-group-sm .btn:hover {
        transform: scale(1.1);
      }
      
      .stok-input.changed {
        border-color: #ffc107;
        background-color: #fff3cd;
        transition: all 0.3s ease;
      }
      
      .save-stok-btn:disabled {
        opacity: 0.5;
      }
      
      .upload-bukti-btn:hover {
        transform: translateY(-1px);
      }
      
      .alert {
        animation: slideInDown 0.5s ease-out;
      }
      
      @keyframes slideInDown {
        from { opacity: 0; transform: translateY(-20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      .form-control:focus {
        border-color: #6366f1;
        box-shadow: 0 0 0 0.2rem rgba(99, 102, 241, 0.25);
      }
      
      .btn-primary {
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
        border: none;
        transition: all 0.3s ease;
      }
      
      .btn-primary:hover {
        background: linear-gradient(135deg, #5856eb 0%, #7c3aed 100%);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
      }
    `;

    document.head.appendChild(styles);
  }
}

export { AdminAnimationController };
