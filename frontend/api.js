/**
 * AssignHub API Client
 * Handles all communication with the backend REST API
 */
(function (window) {
  'use strict';

  // IMPORTANT: For Android APK builds, change this to your computer's local Wi-Fi IP (e.g., 'http://192.168.1.5:5000/api') 
  // or your live deployed server URL (e.g., 'https://your-app-name.onrender.com/api').
  // When running locally in the browser, it will automatically use '/api'.
  const isLocalFile = window.location.protocol === 'file:' || window.location.protocol === 'capacitor:';
  const BASE = 'https://assignhub-z1to.onrender.com/api'; // Automatically configured for Mobile APK

  // ── Token management ──────────────────────────────────────────
  const Auth = {
    getToken: () => localStorage.getItem('ah_token'),
    setToken: (t) => localStorage.setItem('ah_token', t),
    removeToken: () => localStorage.removeItem('ah_token'),
    getUser: () => { try { return JSON.parse(localStorage.getItem('ah_user') || 'null'); } catch { return null; } },
    setUser: (u) => localStorage.setItem('ah_user', JSON.stringify(u)),
    removeUser: () => localStorage.removeItem('ah_user'),
    isLoggedIn: () => !!localStorage.getItem('ah_token'),
    isAdmin: () => { const u = Auth.getUser(); return u && u.role === 'admin'; },
    isStudent: () => { const u = Auth.getUser(); return u && u.role === 'student'; },
    logout: () => {
      Auth.removeToken();
      Auth.removeUser();
      window.location.href = '/login.html';
    },
  };

  // ── Theme management ──────────────────────────────────────────
  const Theme = {
    init: () => {
      const savedTheme = localStorage.getItem('ah_theme') || 'light';
      Theme.apply(savedTheme);
    },
    apply: (theme) => {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        let style = document.getElementById('ah-dark-style');
        if (!style) {
          style = document.createElement('style');
          style.id = 'ah-dark-style';
          style.innerHTML = `
            html.dark { filter: invert(1) hue-rotate(180deg); background: #111; }
            html.dark img, html.dark iconify-icon, html.dark video { filter: invert(1) hue-rotate(180deg); }
          `;
          document.head.appendChild(style);
        }
      } else {
        document.documentElement.classList.remove('dark');
        const style = document.getElementById('ah-dark-style');
        if (style) style.remove();
      }
    },
    set: (theme) => {
      localStorage.setItem('ah_theme', theme);
      Theme.apply(theme);
    }
  };

  // Run immediately to prevent flash
  Theme.init();

  // ── i18n Translation Engine ─────────────────────────────────────
  const I18n = {
    dict: {
      'Hindi': {
        'Dashboard': 'डैशबोर्ड',
        'Registrations': 'पंजीकरण',
        'Assignments': 'असाइनमेंट',
        'Submissions': 'प्रस्तुतियाँ',
        'Students': 'छात्र',
        'Analytics': 'एनालिटिक्स',
        'Notifications': 'सूचनाएं',
        'Settings': 'सेटिंग्स',
        'Logout': 'लॉग आउट',
        'Search...': 'खोजें...',
        'Platform Settings': 'प्लेटफ़ॉर्म सेटिंग्स',
        'Public Profile': 'सार्वजनिक प्रोफ़ाइल',
        'Platform Preferences': 'प्लेटफ़ॉर्म प्राथमिकताएं',
        'Danger Zone': 'डेंजर जोन',
        'Full Name': 'पूरा नाम',
        'Email Address': 'ईमेल पता',
        'Department': 'विभाग',
        'Job Title': 'पद नाम',
        'Save Profile Changes': 'परिवर्तन सहेजें',
        'Interface Theme': 'इंटरफ़ेस थीम',
        'Language': 'भाषा',
        'Timezone': 'समय क्षेत्र'
      },
      'Spanish': {
        'Dashboard': 'Tablero',
        'Registrations': 'Inscripciones',
        'Assignments': 'Tareas',
        'Submissions': 'Entregas',
        'Students': 'Estudiantes',
        'Analytics': 'Análisis',
        'Notifications': 'Notificaciones',
        'Settings': 'Ajustes',
        'Logout': 'Cerrar sesión',
        'Search...': 'Buscar...',
        'Platform Settings': 'Ajustes de Plataforma',
        'Public Profile': 'Perfil Público',
        'Platform Preferences': 'Preferencias',
        'Danger Zone': 'Zona de Peligro',
        'Full Name': 'Nombre Completo',
        'Email Address': 'Correo Electrónico',
        'Department': 'Departamento',
        'Job Title': 'Título',
        'Save Profile Changes': 'Guardar Cambios',
        'Interface Theme': 'Tema de Interfaz',
        'Language': 'Idioma',
        'Timezone': 'Zona Horaria'
      }
    },
    apply: () => {
      const prefsStr = localStorage.getItem('ah_admin_platform');
      if (!prefsStr) return;
      try {
        const prefs = JSON.parse(prefsStr);
        const lang = prefs.lang;
        if (!lang || lang === 'English (US)') return;
        const translations = I18n.dict[lang];
        if (!translations) return;

        // Walk text nodes and translate exact matches
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while (node = walker.nextNode()) {
          const txt = node.nodeValue.trim();
          if (translations[txt]) {
            node.nodeValue = node.nodeValue.replace(txt, translations[txt]);
          }
        }

        // Translate placeholders
        document.querySelectorAll('input, textarea').forEach(el => {
          if (el.placeholder && translations[el.placeholder]) {
            el.placeholder = translations[el.placeholder];
          }
        });
      } catch (e) { }
    }
  };

  document.addEventListener('DOMContentLoaded', I18n.apply);

  // ── Core fetch wrapper ────────────────────────────────────────
  async function apiFetch(endpoint, options = {}) {
    const token = Auth.getToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // Remove Content-Type for FormData (browser sets it with boundary)
    if (options.body instanceof FormData) {
      delete headers['Content-Type'];
    }

    const res = await fetch(`${BASE}${endpoint}`, { ...options, headers });
    const data = await res.json().catch(() => ({ success: false, message: 'Invalid server response' }));

    if (res.status === 401) {
      Auth.logout();
      return data;
    }

    return { ...data, _status: res.status, _ok: res.ok };
  }

  // ── Route guards ─────────────────────────────────────────────
  function safePopulate() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => populateUserInfo(Auth.getUser()));
    } else {
      populateUserInfo(Auth.getUser());
    }
  }

  function guardAuth() {
    if (!Auth.isLoggedIn()) {
      window.location.href = '/login.html';
      return false;
    }
    safePopulate();
    return true;
  }

  function guardAdmin() {
    if (!Auth.isLoggedIn() || !Auth.isAdmin()) {
      window.location.href = '/login.html';
      return false;
    }
    safePopulate();
    return true;
  }

  function guardStudent() {
    if (!Auth.isLoggedIn() || !Auth.isStudent()) {
      window.location.href = '/login.html';
      return false;
    }
    safePopulate();
    return true;
  }

  // ── Auth API ──────────────────────────────────────────────────
  const AuthAPI = {
    login: (identifier, password) => apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    }),
    register: (data) => apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    me: () => apiFetch('/auth/me'),
    forgotPassword: (identifier) => apiFetch('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ identifier }),
    }),
    verifyResetToken: (identifier, token) => apiFetch('/auth/verify-reset-token', {
      method: 'POST',
      body: JSON.stringify({ identifier, token }),
    }),
    resetPassword: (identifier, token, password) => apiFetch('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ identifier, token, password }),
    }),
    updateProfile: (data) => apiFetch('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
    changePassword: (current, newPwd) => apiFetch('/auth/change-password', {
      method: 'PUT',
      body: JSON.stringify({ current_password: current, new_password: newPwd }),
    }),
  };

  // ── Assignments API ───────────────────────────────────────────
  const AssignmentsAPI = {
    list: (params = {}) => apiFetch('/assignments?' + new URLSearchParams(params)),
    get: (id) => apiFetch(`/assignments/${id}`),
    create: (formData) => apiFetch('/assignments', { method: 'POST', body: formData }),
    update: (id, formData) => apiFetch(`/assignments/${id}`, { method: 'PUT', body: formData }),
    delete: (id) => apiFetch(`/assignments/${id}`, { method: 'DELETE' }),
    downloadUrl: (id) => `/api/assignments/${id}/download?token=${Auth.getToken()}`,
  };

  // ── Submissions API ───────────────────────────────────────────
  const SubmissionsAPI = {
    list: (params = {}) => apiFetch('/submissions?' + new URLSearchParams(params)),
    get: (id) => apiFetch(`/submissions/${id}`),
    submit: (formData) => apiFetch('/submissions', { method: 'POST', body: formData }),
    grade: (id, score, feedback) => apiFetch(`/submissions/${id}/grade`, {
      method: 'PUT',
      body: JSON.stringify({ score, feedback }),
    }),
    downloadUrl: (id) => `/api/submissions/${id}/download?token=${Auth.getToken()}`,
  };

  // ── Users API ─────────────────────────────────────────────────
  const UsersAPI = {
    list: (params = {}) => apiFetch('/users?' + new URLSearchParams(params)),
    get: (id) => apiFetch(`/users/${id}`),
    create: (data) => apiFetch('/users', { method: 'POST', body: JSON.stringify(data) }),
    stats: () => apiFetch('/users/stats'),
    studentStats: () => apiFetch('/users/student-stats'),
    pendingRegistrations: (params = {}) => apiFetch('/users/pending-registrations?' + new URLSearchParams(params)),
    updateAvatar: (base64) => apiFetch('/users/me/avatar', { method: 'PUT', body: JSON.stringify({ avatar_url: base64 }) }),
    updateProfile: (data) => apiFetch('/users/me', { method: 'PUT', body: JSON.stringify(data) }),
    updateStatus: (id, status) => apiFetch(`/users/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
    delete: (id) => apiFetch(`/users/${id}`, { method: 'DELETE' }),
  };

  // ── Notifications API ─────────────────────────────────────────
  const NotificationsAPI = {
    list: (params = {}) => apiFetch('/notifications?' + new URLSearchParams(params)),
    unreadCount: () => apiFetch('/notifications/unread-count'),
    markRead: (id) => apiFetch(`/notifications/${id}/read`, { method: 'PATCH' }),
    markAllRead: () => apiFetch('/notifications/mark-all-read', { method: 'PATCH' }),
    delete: (id) => apiFetch(`/notifications/${id}`, { method: 'DELETE' }),
    broadcast: (data) => apiFetch('/notifications/broadcast', { method: 'POST', body: JSON.stringify(data) }),
  };

  // ── Analytics API ─────────────────────────────────────────────
  const AnalyticsAPI = {
    overview: () => apiFetch('/analytics/overview'),
    assignment: (id) => apiFetch(`/analytics/assignment/${id}`),
  };

  // ── Utility helpers ───────────────────────────────────────────
  function avatarUrl(seed) {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed || 'default')}`;
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '—';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;

    let tz = undefined;
    try {
      const prefs = JSON.parse(localStorage.getItem('ah_admin_platform'));
      if (prefs && prefs.tz && prefs.tz !== '(GMT+05:30) Mumbai, Kolkata' && !prefs.tz.includes('GMT')) {
        tz = prefs.tz;
      } else if (prefs && prefs.tz === '(GMT+05:30) Mumbai, Kolkata') {
        tz = 'Asia/Kolkata';
      }
    } catch (e) { }
    return new Date(dateStr).toLocaleDateString('en-US', { timeZone: tz });
  }

  function formatDate(dateStr, opts = {}) {
    if (!dateStr) return '—';
    let tz = undefined;
    try {
      const prefs = JSON.parse(localStorage.getItem('ah_admin_platform'));
      // Fallback mapping for the old value
      if (prefs && prefs.tz && prefs.tz !== '(GMT+05:30) Mumbai, Kolkata' && !prefs.tz.includes('GMT')) {
        tz = prefs.tz;
      } else if (prefs && prefs.tz === '(GMT+05:30) Mumbai, Kolkata') {
        tz = 'Asia/Kolkata';
      }
    } catch (e) { }
    return new Date(dateStr).toLocaleString('en-US', {
      timeZone: tz,
      day: 'numeric', month: 'short', year: 'numeric', ...opts
    });
  }

  function daysLeft(deadline) {
    const diff = new Date(deadline) - Date.now();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days < 0) return 'Expired';
    if (days === 0) return 'Today';
    if (days === 1) return '1 Day Left';
    return `${days} Days Left`;
  }

  function populateUserInfo(user) {
    if (!user) return;

    // Names
    document.querySelectorAll('[data-ah-name], p.text-sm.font-semibold.truncate, p.text-sm.font-bold.text-gray-900').forEach(el => {
      if (el.hasAttribute('data-ah-name') || el.textContent.includes('Meera') || el.textContent.includes('Aarav')) {
        el.textContent = user.full_name || '';
      }
    });

    // Avatars
    document.querySelectorAll('[data-ah-avatar], img[src*="dicebear"], img[src^="data:image"], img[src^="http"]').forEach(el => {
      // Don't replace random external images, only avatars
      if (el.hasAttribute('data-ah-avatar') || el.src.includes('dicebear') || el.src.includes('data:image') || el.src.includes('unsplash')) {
        el.src = user.avatar_url || avatarUrl(user.avatar_seed || user.full_name);
      }
    });

    // Roles and Emails
    document.querySelectorAll('[data-ah-role], p.text-xs.text-gray-400.truncate').forEach(el => {
      if (el.hasAttribute('data-ah-role') || el.textContent.includes('Administrator') || el.textContent.includes('Student')) {
        el.textContent = (user.role === 'admin' ? (user.job_title || 'Administrator') : 'Student');
      }
    });

    // Roll, Dept, Email specific targets
    document.querySelectorAll('[data-ah-roll]').forEach(el => el.textContent = user.roll_number || '');
    document.querySelectorAll('[data-ah-email]').forEach(el => el.textContent = user.email || '');
    document.querySelectorAll('[data-ah-dept]').forEach(el => el.textContent = user.department || '');
  }

  // ── Expose global ─────────────────────────────────────────────
  window.AHApi = {
    Auth, AuthAPI, AssignmentsAPI, SubmissionsAPI, UsersAPI, NotificationsAPI, AnalyticsAPI,
    guardAuth, guardAdmin, guardStudent,
    avatarUrl, timeAgo, formatDate, daysLeft, populateUserInfo, Theme,
  };

  // ── Global Badge Updater ──────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async function () {
    var user = Auth.getUser();

    // 1. Notification Bell Click & Badge Logic
    if (user) {
      document.querySelectorAll('header button, .top-bar button').forEach(btn => {
        if (btn.innerHTML.includes('lucide:bell')) {
          // Make it redirect
          btn.addEventListener('click', () => {
            window.location.href = user.role === 'admin' ? 'admin-notifications.html' : 'student-notifications.html';
          });

          // Make relative for absolute badge positioning
          btn.style.position = 'relative';

          // Fetch unread count and show badge
          NotificationsAPI.unreadCount().then(res => {
            if (res.success && res.count > 0) {
              const badge = document.createElement('span');
              badge.className = 'absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white';
              btn.appendChild(badge);
            }
          }).catch(e => { });
        }
      });
    }

    // 1.5 Header Profile Pic -> Settings
    if (user) {
      document.querySelectorAll('header img').forEach(img => {
        if (img.src.includes('dicebear') || img.alt === 'Avatar' || img.hasAttribute('data-ah-avatar')) {
          let container = img.closest('div.border-l') || img.parentElement;
          if (container) {
            container.style.cursor = 'pointer';
            container.classList.add('hover:opacity-80', 'transition-all');
            container.addEventListener('click', () => {
              window.location.href = user.role === 'admin' ? 'admin-settings.html' : 'student-settings.html';
            });
          }
        }
      });
    }

    // 2. Pending Registrations Badge
    if (window.location.pathname.includes('admin-') || window.location.pathname === '/' || window.location.pathname === '') {
      if (user && user.role === 'admin') {
        try {
          var res = await UsersAPI.pendingRegistrations();
          var usersList = res.users || res.registrations;
          if (res.success && usersList) {
            var badges = document.querySelectorAll('#nav-registrations span.bg-red-500');
            badges.forEach(b => {
              if (usersList.length > 0) {
                b.style.display = 'inline-block';
                b.textContent = usersList.length;
              } else {
                b.style.display = 'none';
              }
            });
          }
        } catch (e) { }
      }
    }
  });

})(window);
