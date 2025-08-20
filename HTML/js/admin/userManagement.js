class UserManagementManager {
  constructor() {}

  renderUsersTable(users) {
    const tbody = document.getElementById("users-table-body");
    if (!tbody) return;

    if (!users || users.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-center text-muted py-4">Belum ada data pengguna.</td></tr>';
      return;
    }

    tbody.innerHTML = users
      .map(
        (user) => `
      <tr>
        <td>${user.nama}</td>
        <td>${user.email}</td>
        <td><span class="badge bg-light text-dark border">${
          user.outlet || "-"
        }</span></td>
        <td><span class="badge bg-primary">${user.role}</span></td>
        <td class="text-center">
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary btn-edit-user" data-id="${
              user.id
            }" title="Edit"><i class="bi bi-pencil-square"></i></button>
            <button class="btn btn-outline-danger btn-delete-user" data-id="${
              user.id
            }" data-name="${
          user.nama
        }" title="Hapus"><i class="bi bi-trash"></i></button>
          </div>
        </td>
      </tr>
    `
      )
      .join("");
  }

  updateUserFormState() {
    const isEditing = !!document.getElementById("userId").value;
    const namaInput = document.getElementById("userNama");
    const emailInput = document.getElementById("userEmail");
    const passwordInput = document.getElementById("userPassword");
    const passwordHelp = document.getElementById("passwordHelpBlock");
    const outletInput = document.getElementById("userOutlet");
    const roleSelect = document.getElementById("userRole");
    const saveBtn = document.getElementById("saveUserBtn");

    const isNamaValid = namaInput.value.trim().length > 0;
    emailInput.disabled = !isNamaValid;

    const isEmailValid =
      emailInput.value.includes("@") && emailInput.value.includes(".");
    passwordInput.disabled = !isEmailValid;

    const passwordLength = passwordInput.value.length;
    if (passwordLength > 0 && passwordLength < 6) {
      passwordHelp.classList.remove("d-none");
    } else {
      passwordHelp.classList.add("d-none");
    }

    const isPasswordValid = isEditing || passwordLength >= 6;
    outletInput.disabled = !isPasswordValid;

    const isOutletValid = outletInput.value.trim().length > 0;
    roleSelect.disabled = !isOutletValid;

    const canSave =
      isNamaValid && isEmailValid && isPasswordValid && isOutletValid;
    saveBtn.disabled = !canSave;
  }

  showUserModal(user = null) {
    const modalEl = document.getElementById("userModal");
    const modalTitle = document.getElementById("userModalLabel");
    const form = document.getElementById("userForm");
    form.reset();

    const passwordInput = document.getElementById("userPassword");

    if (user) {
      modalTitle.textContent = "Edit Pengguna";
      document.getElementById("userId").value = user.id;
      document.getElementById("userNama").value = user.nama;
      document.getElementById("userEmail").value = user.email;
      document.getElementById("userEmail").disabled = true;
      document.getElementById("userOutlet").value = user.outlet;
      document.getElementById("userRole").value = user.role;
      passwordInput.required = false;
    } else {
      modalTitle.textContent = "Tambah Pengguna Baru";
      document.getElementById("userId").value = "";
      document.getElementById("userEmail").disabled = false;
      passwordInput.required = true;
    }

    const modal = new bootstrap.Modal(modalEl);
    modal.show();
    this.updateUserFormState();
  }
}

export { UserManagementManager };
