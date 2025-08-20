import { supabase } from "./utils.js";
import { AppConfig } from "./config.js";
import { UIUtils } from "./utils.js";

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  const showSignup = document.getElementById("showSignup");
  const showLogin = document.getElementById("showLogin");
  const loginButton = document.getElementById("loginButton");

  // Form submission handlers
  loginForm.addEventListener("submit", handleLogin);
  signupForm.addEventListener("submit", handleSignup);

  // Form toggle handlers
  showSignup.addEventListener("click", (e) => {
    e.preventDefault();
    loginForm.style.display = "none";
    signupForm.style.display = "block";
  });
  showLogin.addEventListener("click", (e) => {
    e.preventDefault();
    signupForm.style.display = "none";
    loginForm.style.display = "block";
  });

  async function handleLogin(e) {
    e.preventDefault();
    UIUtils.setLoadingState(loginButton, true, "Mencari data...");
    const loginInput = document.getElementById("loginID").value;
    const password = document.getElementById("password").value;
    let userEmail = loginInput; // Asumsikan input adalah email

    // Cek jika input TIDAK mengandung '@', berarti itu adalah nama
    if (!loginInput.includes("@")) {
      // Cari email berdasarkan nama pengguna di tabel 'users'
      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("email") // Ambil kolom email
        .eq("nama", loginInput) // Cari yang namanya cocok
        .single(); // Ambil satu hasil saja

      if (profileError || !profile) {
        UIUtils.createToast(
          "error",
          "Login Gagal: Nama pengguna tidak ditemukan."
        );
        UIUtils.setLoadingState(loginButton, false);
        return;
      }
      // Jika nama ditemukan, gunakan email yang sesuai
      userEmail = profile.email;
    }

    UIUtils.setLoadingState(loginButton, true, "Logging in...");
    // Lanjutkan proses login menggunakan email
    const { data, error } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: password,
    });

    if (error) {
      UIUtils.createToast("error", "Login Gagal: " + error.message);
      UIUtils.setLoadingState(loginButton, false);
      return;
    }

    await redirectUser(data.user);
  }

  async function handleSignup(e) {
    e.preventDefault();
    const signupButton = document.getElementById("signupButton");
    UIUtils.setLoadingState(signupButton, true, "Mendaftarkan...");

    const nama = document.getElementById("signup_nama").value;
    const email = document.getElementById("signup_email").value;
    const password = document.getElementById("signup_password").value;

    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          nama: nama,
          outlet: nama, // Secara default, nama outlet sama dengan nama pendaftar
        },
      },
    });

    if (error) {
      UIUtils.createToast("error", "Pendaftaran Gagal: " + error.message);
    } else {
      UIUtils.createToast(
        "success",
        "Pendaftaran berhasil! Silakan cek email Anda untuk verifikasi."
      );
      // Arahkan kembali ke form login
      signupForm.style.display = "none";
      loginForm.style.display = "block";
    }
    UIUtils.setLoadingState(signupButton, false);
  }

  async function redirectUser(user) {
    const { data: profile, error } = await supabase
      .from("users")
      .select("role, nama, outlet")
      .eq("id", user.id)
      .single();

    if (error || !profile) {
      UIUtils.createToast("error", "Gagal mendapatkan data profil pengguna.");
      UIUtils.setLoadingState(loginButton, false);
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const userProfileAndSession = {
      ...session,
      custom_profile: {
        role: profile.role,
        nama: profile.nama,
        outlet: profile.outlet,
      },
    };

    localStorage.setItem(
      AppConfig.STORAGE_KEYS.USER,
      JSON.stringify(userProfileAndSession)
    );

    const userRole = (profile.role || "user").toLowerCase();
    const choiceModal = new bootstrap.Modal(
      document.getElementById("adminChoiceModal")
    );
    const adminPanelBtn = document.getElementById("goToAdminPanelBtn");
    const catalogBtn = document.getElementById("goToCatalogBtn");

    if (userRole === "admin") {
      adminPanelBtn.innerHTML =
        '<i class="bi bi-shield-lock me-2"></i>Masuk ke Admin Panel';
    } else {
      // Untuk pengguna biasa, tombol ini hanya untuk melihat laporan.
      adminPanelBtn.innerHTML =
        '<i class="bi bi-layout-text-sidebar-reverse me-2"></i>Lihat Panel Laporan';
    }
    adminPanelBtn.onclick = () => {
      window.location.href = AppConfig.ROUTES.ADMIN;
    };
    catalogBtn.onclick = () => {
      window.location.href = AppConfig.ROUTES.CATALOG;
    };

    choiceModal.show();
  }
});


