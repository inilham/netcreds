
// =============================================================
// NETVAULT — app.js  (Phase 1: UI Behavior, no crypto)
// =============================================================

// =============================================================
// === STATE ===
// =============================================================

const state = {
  vaultFileHandle: null,       // FileSystemFileHandle (File System Access API)
  masterKey: null,             // Master password string — used for re-encryption
  vaultEnvelope: null,         // Last encrypted envelope (for reference)
  vault: null,                 // Decrypted vault object — set after unlock
  selectedCustomerId: null,    // Currently selected customer ID
  editingCustomerId: null,     // Customer being edited in modal (null = new)
  editingCredentialId: null,   // Credential being edited in modal (null = new)
  unsaved: false,              // Unsaved changes flag
  idleTimer: null,             // Auto-lock timer handle
  AUTO_LOCK_MINUTES: 15,       // Default auto-lock timeout
};

// Dummy vault data for UI development (Phase 1 only — removed in Phase 2)
const DUMMY_VAULT = {
  meta: { created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  customers: [
    {
      id: 'cust-1',
      name: 'PT. Telkom Indonesia',
      tags: ['telco', 'cisco'],
      access: {
        method: 'vpn+jumphost',
        vpn: { type: 'AnyConnect', server: 'vpn.telkom.co.id', group: 'NOC' },
        jumphost: { host: '10.1.1.254', port: 22, username: 'netops' },
        pam: null,
        general_notes: 'VPN aktif 24/7. Jumphost reboot setiap Minggu 02:00 WIB.'
      },
      credentials: [
        { id: 'cred-1', label: 'Admin Account', username: 'admin_telkom', password: 'p@ssw0rd!123', tags: ['cisco', 'enable'], notes: 'Untuk ASR 9000 dan NCS series.' },
        { id: 'cred-2', label: 'Read Only', username: 'monitor_tlkm', password: 'readonly#456', tags: ['monitoring'], notes: '' },
      ]
    },
    {
      id: 'cust-2',
      name: 'Bank BCA',
      tags: ['banking', 'f5', 'juniper'],
      access: {
        method: 'pam',
        vpn: null,
        jumphost: null,
        pam: { url: 'https://pam.bca.co.id', notes: 'Login dengan AD account' },
        general_notes: ''
      },
      credentials: [
        { id: 'cred-3', label: 'F5 Admin', username: 'admin_f5', password: 'secureF5!789', tags: ['f5', 'ltm'], notes: '' },
      ]
    },
    {
      id: 'cust-3',
      name: 'PT. XL Axiata',
      tags: ['telco', 'huawei'],
      access: {
        method: 'vpn',
        vpn: { type: 'GlobalProtect', server: 'vpn.xl.co.id', group: 'Engineer' },
        jumphost: null,
        pam: null,
        general_notes: ''
      },
      credentials: [
        { id: 'cred-4', label: 'Huawei NE40', username: 'engineer_xl', password: 'xl#engineer!', tags: ['huawei'], notes: '' },
      ]
    },
  ]
};


// =============================================================
// === HELPERS ===
// =============================================================

function generateId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseTags(str) {
  if (!str) return [];
  return str.split(',').map(t => t.trim()).filter(Boolean);
}

function tagsToString(arr) {
  return (arr || []).join(', ');
}

function debounce(fn, delay = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

async function copyToClipboard(text, btnEl) {
  try {
    await navigator.clipboard.writeText(text);
    const icon = btnEl.querySelector('i[data-lucide]');
    const originalIcon = icon ? icon.getAttribute('data-lucide') : 'copy';
    btnEl.classList.add('copy-success');
    if (icon) {
      icon.setAttribute('data-lucide', 'check');
      lucide.createIcons({ nodes: [icon] });
    }
    showToast('Copied!', 'success');
    setTimeout(() => {
      btnEl.classList.remove('copy-success');
      if (icon) {
        icon.setAttribute('data-lucide', originalIcon);
        lucide.createIcons({ nodes: [icon] });
      }
    }, 1500);
  } catch {
    showToast('Failed to copy', 'error');
  }
}


// =============================================================
// === TOAST ===
// =============================================================

function showToast(message, type = 'info', duration = 2500) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'status');
  const icons = { success: 'check-circle', error: 'x-circle', info: 'info' };
  toast.innerHTML = `<i data-lucide="${icons[type] || 'info'}" style="width:1em;height:1em;flex-shrink:0;margin-right:.5rem;"></i>${escapeHtml(message)}`;
  toast.style.display = 'flex';
  toast.style.alignItems = 'center';
  container.appendChild(toast);
  lucide.createIcons({ nodes: [toast] });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 320);
  }, duration);
}


// =============================================================
// === VIEW SWITCHING ===
// =============================================================

const VIEWS = ['view-unlock', 'view-create-vault', 'view-main'];

function showView(id) {
  VIEWS.forEach(v => {
    const el = document.getElementById(v);
    if (el) el.classList.toggle('view--hidden', v !== id);
  });
}


// =============================================================
// === MODAL MANAGEMENT ===
// =============================================================

const MODALS = ['modal-customer', 'modal-credential', 'modal-settings', 'modal-confirm'];

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.hidden = false;
  // Focus first focusable element
  const focusable = modal.querySelector('button, input, textarea, select, [tabindex]:not([tabindex="-1"])');
  if (focusable) setTimeout(() => focusable.focus(), 50);
  document.addEventListener('keydown', handleModalKeydown);
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.hidden = true;
  document.removeEventListener('keydown', handleModalKeydown);
}

function closeAllModals() {
  MODALS.forEach(id => closeModal(id));
}

function handleModalKeydown(e) {
  if (e.key === 'Escape') closeAllModals();
}

// Close modal when clicking backdrop (not modal content)
document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
  backdrop.addEventListener('mousedown', e => {
    if (e.target === backdrop) closeModal(backdrop.id);
  });
});

// Close buttons via data-close-modal attribute
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-close-modal]');
  if (btn) closeModal(btn.dataset.closeModal);
});


// =============================================================
// === THEME TOGGLE ===
// =============================================================
(function initTheme() {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = prefersDark ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcons(theme);
})();

function updateThemeIcons(theme) {
  document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
    const icon = btn.querySelector('i[data-lucide]');
    if (!icon) return;
    icon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
    btn.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
  });
  lucide.createIcons();
}

function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  updateThemeIcons(next);
}

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-theme-toggle]');
  if (!btn) return;
  toggleTheme();
});

// =============================================================
// === SETTINGS BUTTONS ===
// =============================================================
function openSettingsFromButton() {
  openModal('modal-settings');
}

document.addEventListener('click', e => {
  const btn = e.target.closest('#btn-open-settings, #btn-open-settings-mobile');
  if (!btn) return;
  openSettingsFromButton();
});


// =============================================================
// === SIDEBAR TOGGLE (mobile) ===
// =============================================================

const sidebar = document.getElementById('sidebar');
const btnSidebarToggle = document.getElementById('btn-sidebar-toggle');

let sidebarOverlay = null;

function createSidebarOverlay() {
  if (sidebarOverlay) return;
  sidebarOverlay = document.createElement('div');
  sidebarOverlay.className = 'sidebar-overlay';
  document.body.appendChild(sidebarOverlay);
  sidebarOverlay.addEventListener('click', closeSidebar);
}

function openSidebar() {
  createSidebarOverlay();
  sidebar?.classList.add('is-open');
  sidebarOverlay?.classList.add('is-visible');
  btnSidebarToggle?.setAttribute('aria-expanded', 'true');
}

function closeSidebar() {
  sidebar?.classList.remove('is-open');
  sidebarOverlay?.classList.remove('is-visible');
  btnSidebarToggle?.setAttribute('aria-expanded', 'false');
}

btnSidebarToggle?.addEventListener('click', () => {
  const isOpen = sidebar?.classList.contains('is-open');
  isOpen ? closeSidebar() : openSidebar();
});

// Close sidebar when clicking outside on mobile
document.addEventListener('click', e => {
  if (window.innerWidth >= 768) return;
  if (!sidebar?.contains(e.target) && !btnSidebarToggle?.contains(e.target)) {
    closeSidebar();
  }
});

document.getElementById('btn-bottom-sheet')?.addEventListener('click', () => {
  const sidebar = document.getElementById('sidebar');
  const isExpanded = sidebar.classList.toggle('is-expanded');
  document.getElementById('btn-bottom-sheet')
    .setAttribute('aria-expanded', isExpanded);
});

function setSidebarCollapsed(collapsed) {
  sidebar?.classList.toggle('is-collapsed', collapsed);
  btnSidebarToggle?.setAttribute('aria-expanded', String(!collapsed));
}

btnSidebarToggle?.addEventListener('click', () => {
  if (window.innerWidth < 768) {
    setSidebarCollapsed(!sidebar?.classList.contains('is-collapsed'));
    return;
  }
  const isOpen = sidebar?.classList.contains('is-open');
  isOpen ? closeSidebar() : openSidebar();
});
// =============================================================
// === PASSWORD REVEAL TOGGLE ===
// =============================================================

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-target]');
  if (!btn || !btn.classList.contains('btn-reveal')) return;
  const targetId = btn.dataset.target;
  if (!targetId) return;
  const input = document.getElementById(targetId);
  if (!input) return;
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  const icon = btn.querySelector('i[data-lucide]');
  if (icon) {
    icon.setAttribute('data-lucide', isHidden ? 'eye-off' : 'eye');
    lucide.createIcons({ nodes: [icon] });
  }
  btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
});


// =============================================================
// === PASSWORD STRENGTH METER ===
// =============================================================

function measurePasswordStrength(password) {
  let score = 0;
  if (!password) return { score: 0, label: '' };
  if (password.length >= 8)  score++;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const levels = [
    { label: '', pct: 0, color: 'transparent' },
    { label: 'Very weak', pct: 14, color: 'var(--color-error)' },
    { label: 'Weak', pct: 28, color: 'var(--color-warning)' },
    { label: 'Fair', pct: 50, color: 'var(--color-orange)' },
    { label: 'Good', pct: 70, color: 'var(--color-primary)' },
    { label: 'Strong', pct: 85, color: 'var(--color-success)' },
    { label: 'Very strong', pct: 100, color: 'var(--color-success)' },
  ];

  const idx = Math.min(score, levels.length - 1);
  return levels[idx];
}

document.getElementById('input-new-password')?.addEventListener('input', e => {
  const fill = document.getElementById('strength-fill');
  const label = document.getElementById('strength-label');
  const result = measurePasswordStrength(e.target.value);
  if (fill) { fill.style.width = result.pct + '%'; fill.style.background = result.color; }
  if (label) label.textContent = result.label;
});


// =============================================================
// === UNLOCK SCREEN ===
// =============================================================

document.getElementById('btn-create-vault')?.addEventListener('click', () => showView('view-create-vault'));
document.getElementById('btn-back-to-unlock')?.addEventListener('click', () => showView('view-unlock'));

// Open vault file (Phase 1: just shows filename, no actual decryption yet)
document.getElementById('btn-open-vault-file')?.addEventListener('click', async () => {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'NetVault file', accept: { 'application/octet-stream': ['.vault'] } }],
        multiple: false,
      });
      state.vaultFileHandle = handle;
      setVaultFileLabel(handle.name);
    } catch (err) {
      if (err.name !== 'AbortError') showToast('Could not open file', 'error');
    }
  } else {
    // Fallback: hidden file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.vault';
    input.onchange = () => {
      if (input.files[0]) {
        state.vaultFileHandle = input.files[0]; // File object as fallback
        setVaultFileLabel(input.files[0].name);
      }
    };
    input.click();
  }
});

function setVaultFileLabel(name) {
  const label = document.getElementById('unlock-file-label');
  if (label) label.textContent = name || 'Vault file selected';
  const status = document.getElementById('unlock-file-status');
  if (status) {
    status.classList.remove('file-status--none');
    status.classList.add('file-status--ok');
  }
}

// Unlock form — real AES-GCM decryption (Phase 2)
document.getElementById('form-unlock')?.addEventListener('submit', async e => {
  e.preventDefault();
  const pw    = document.getElementById('input-master-password')?.value || '';
  const errEl = document.getElementById('unlock-error');
  if (!pw) return;

  if (!state.vaultFileHandle) {
    if (errEl) errEl.textContent = 'Please open a vault file first.';
    return;
  }

  const btn = document.getElementById('btn-unlock');
  btn.disabled = true;
  btn.textContent = 'Unlocking…';
  if (errEl) errEl.textContent = '';

  try {
    const file     = state.vaultFileHandle.getFile
      ? await state.vaultFileHandle.getFile()   // FileSystemFileHandle
      : state.vaultFileHandle;                  // fallback File object
    const envelope = await readVaultFile(file);
    const vault    = await decryptVault(envelope, pw);
    state.vault        = vault;
    state.masterKey    = pw;   // store password for re-encryption on save
    state.vaultEnvelope = envelope;
    enterMainView();
  } catch (err) {
    if (errEl) errEl.textContent = err.message || 'Failed to unlock vault.';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="unlock"></i> Unlock';
    lucide.createIcons({ nodes: [btn] });
  }
});

// Create vault form — real encryption + save (Phase 2)
document.getElementById('form-create-vault')?.addEventListener('submit', async e => {
  e.preventDefault();
  const pw    = document.getElementById('input-new-password')?.value || '';
  const cpw   = document.getElementById('input-confirm-password')?.value || '';
  const errEl = document.getElementById('create-vault-error');

  if (pw.length < 12) {
    if (errEl) errEl.textContent = 'Password must be at least 12 characters.';
    return;
  }
  if (pw !== cpw) {
    if (errEl) errEl.textContent = 'Passwords do not match.';
    return;
  }
  if (errEl) errEl.textContent = '';

  const btn = document.getElementById('btn-save-new-vault');
  btn.disabled = true;
  btn.textContent = 'Creating…';

  try {
    const emptyVault = {
      meta: { created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      customers: [],
    };
    const envelope = await encryptVault(emptyVault, pw);
    const handle   = await saveVaultFile(envelope, null, 'netvault.vault');

    state.vault         = emptyVault;
    state.masterKey     = pw;
    state.vaultEnvelope = envelope;
    state.vaultFileHandle = handle;
    if (handle) setVaultFileLabel(handle.name);
    enterMainView();
    showToast('New vault created and saved!', 'success');
  } catch (err) {
    if (err.name === 'AbortError') return; // user cancelled save dialog
    if (errEl) errEl.textContent = err.message || 'Failed to create vault.';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="shield-check"></i> Create Vault';
    lucide.createIcons({ nodes: [btn] });
  }
});

function enterMainView() {
  showView('view-main');
  injectSidebarActions();
  renderCustomerList();
  renderDetailEmpty();
  updateSettingsInfo();
  resetIdleTimer();
  lucide.createIcons();

  if (window.innerWidth < 768 && window.matchMedia('(orientation: portrait)').matches) {
    const sidebar = document.getElementById('sidebar');
    const btn = document.getElementById('btn-bottom-sheet');
    sidebar?.classList.add('is-expanded');
    btn?.setAttribute('aria-expanded', 'true');
    lucide.createIcons({ nodes: [btn] });
  }

  // Auto-expand sidebar saat search bar di-tap di mobile portrait
  document.getElementById('input-search')?.addEventListener('focus', () => {
    const isPortrait = window.matchMedia('(max-width: 767px) and (orientation: portrait)').matches;
    if (!isPortrait) return;

    const sidebar = document.getElementById('sidebar');
    const btn = document.getElementById('btn-bottom-sheet');

    if (!sidebar.classList.contains('is-expanded')) {
      sidebar.classList.add('is-expanded');
      btn?.setAttribute('aria-expanded', 'true');
    }
  });
}

function injectSidebarActions() {
  const footer = document.querySelector('.sidebar-footer');
  if (!footer || footer.querySelector('.sidebar-actions')) return;

  const actionsRow = document.createElement('div');
  actionsRow.className = 'sidebar-actions';

  // Save button — icon only
  const saveBtn = document.createElement('button');
  saveBtn.id = 'btn-save-sidebar';
  saveBtn.className = 'btn btn-ghost btn-sm';
  saveBtn.innerHTML = '<i data-lucide="save"></i>';
  saveBtn.title = 'Save vault (Ctrl+S)';
  saveBtn.setAttribute('aria-label', 'Save vault');
  saveBtn.addEventListener('click', saveVaultDummy);

  // Lock button — icon only
  const lockBtn = document.createElement('button');
  lockBtn.className = 'btn btn-ghost btn-sm';
  lockBtn.innerHTML = '<i data-lucide="lock"></i>';
  lockBtn.title = 'Lock vault';
  lockBtn.setAttribute('aria-label', 'Lock vault');
  lockBtn.addEventListener('click', lockVault);

  actionsRow.appendChild(saveBtn);
  actionsRow.appendChild(lockBtn);
  footer.appendChild(actionsRow);
}


// =============================================================
// === LOCK VAULT ===
// =============================================================

document.getElementById('btn-lock-vault')?.addEventListener('click', lockVault);

function lockVault() {
  state.vault = null;
  state.masterKey = null;
  state.vaultEnvelope = null;
  state.selectedCustomerId = null;
  state.unsaved = false;
  clearIdleTimer();
  // Clear sensitive DOM fields
  const pwInput = document.getElementById('input-master-password');
  if (pwInput) pwInput.value = '';
  // Remove sidebar actions (will be re-injected on next unlock)
  document.querySelector('.sidebar-actions')?.remove();
  showView('view-unlock');
  lucide.createIcons();
  showToast('Vault locked', 'info');
}


// =============================================================
// === IDLE AUTO-LOCK ===
// =============================================================

function resetIdleTimer() {
  clearIdleTimer();
  state.idleTimer = setTimeout(() => {
    lockVault();
    showToast('Vault locked due to inactivity', 'info', 4000);
  }, state.AUTO_LOCK_MINUTES * 60 * 1000);
}

function clearIdleTimer() {
  if (state.idleTimer) clearTimeout(state.idleTimer);
  state.idleTimer = null;
}

['click', 'keydown', 'mousemove', 'touchstart'].forEach(evt =>
  document.addEventListener(evt, () => { if (state.vault) resetIdleTimer(); }, { passive: true })
);


// =============================================================
// === CTRL+S TO SAVE ===
// =============================================================

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    if (state.vault) saveVaultDummy(); // Phase 2: replace with real save
  }
});


// =============================================================
// === SAVE VAULT (Phase 1 stub) ===
// =============================================================

async function saveVaultDummy() {
  if (!state.vault || !state.masterKey) {
    showToast('Vault not unlocked', 'error');
    return;
  }
  try {
    state.vault.meta.updated_at = new Date().toISOString();
    const envelope = await encryptVault(state.vault, state.masterKey);
    const handle   = await saveVaultFile(envelope, state.vaultFileHandle);
    if (handle) {
      state.vaultFileHandle = handle;
      setVaultFileLabel(handle.name);
    }
    state.vaultEnvelope = envelope;
    markSaved();
    showToast('Vault saved', 'success');
  } catch (err) {
    if (err.name === 'AbortError') return;
    showToast('Save failed: ' + (err.message || 'unknown error'), 'error');
  }
}

function markUnsaved() {
  state.unsaved = true;
  // Add dot indicator to all save buttons
  document.getElementById('btn-save-vault-as')?.classList.add('has-changes');
  document.getElementById('btn-save-sidebar')?.classList.add('has-changes');
}

function markSaved() {
  state.unsaved = false;
  document.querySelectorAll('.has-changes').forEach(el => el.classList.remove('has-changes'));
  if (state.vault?.meta) state.vault.meta.updated_at = new Date().toISOString();
  updateSettingsInfo();
}


// =============================================================
// === RENDER: CUSTOMER LIST (Sidebar) ===
// =============================================================

const debouncedSearch = debounce(filterCustomerList, 200);

document.getElementById('input-search')?.addEventListener('input', e => {
  const val = e.target.value;
  const clearBtn = document.getElementById('btn-clear-search');
  if (clearBtn) clearBtn.hidden = !val;
  debouncedSearch(val);
});

document.getElementById('btn-clear-search')?.addEventListener('click', () => {
  const input = document.getElementById('input-search');
  if (input) { input.value = ''; input.dispatchEvent(new Event('input')); }
});

function filterCustomerList(query = '') {
  const q = query.toLowerCase().trim();
  const customers = state.vault?.customers || [];
  const filtered = q
    ? customers.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.tags || []).some(t => t.toLowerCase().includes(q)) ||
        (c.credentials || []).some(cr => cr.username?.toLowerCase().includes(q) || cr.label?.toLowerCase().includes(q))
      )
    : customers;

  renderCustomerList(filtered);

  const noResults = document.getElementById('customer-list-no-results');
  if (noResults) noResults.hidden = !(q && filtered.length === 0);
}

function renderCustomerList(customers) {
  const list = document.getElementById('customer-list');
  const emptyEl = document.getElementById('customer-list-empty');
  if (!list) return;

  const source = customers ?? state.vault?.customers ?? [];

  // Remove existing items (keep empty/no-results placeholders)
  list.querySelectorAll(':scope > li').forEach(el => el.remove());

  if (emptyEl) emptyEl.hidden = source.length > 0;

  const template = document.getElementById('template-customer-item');
  source.forEach(customer => {
    const clone = template.content.cloneNode(true);
    const btn = clone.querySelector('.customer-item');
    btn.dataset.customerId = customer.id;
    btn.setAttribute('aria-current', customer.id === state.selectedCustomerId ? 'true' : 'false');

    clone.querySelector('.customer-item-name').textContent = customer.name;
    const credCount = customer.credentials?.length || 0;
    const methods = Array.isArray(customer.access) ? customer.access : (customer.access ? [customer.access] : []);
    const methodCount = methods.length;
    clone.querySelector('.customer-item-meta').textContent =
      `${credCount} credential${credCount !== 1 ? 's' : ''}` +
      (methodCount ? ` · ${methodCount} access method${methodCount !== 1 ? 's' : ''}` : '');

    // badge removed

    btn.addEventListener('click', () => {
      selectCustomer(customer.id);
      if (window.innerWidth < 768) closeSidebar();
    });

    list.appendChild(clone);
  });

  lucide.createIcons({ nodes: [list] });
}


// =============================================================
// === ACCESS METHOD HELPERS ===
// =============================================================

function accessMethodLabel(method) {
  const map = { vpn: 'VPN Only', 'vpn+jumphost': 'VPN + Jumphost', pam: 'PAM', direct: 'Direct' };
  return map[method] || method || '—';
}

function accessMethodShort(method) {
  const map = { vpn: 'VPN', 'vpn+jumphost': 'VPN+JH', pam: 'PAM', direct: 'Direct' };
  return map[method] || method || '?';
}

function accessMethodBadgeClass(method) {
  const map = { vpn: '', 'vpn+jumphost': 'access-badge--jumphost', pam: 'access-badge--pam', direct: '' };
  return map[method] || '';
}


// =============================================================
// === SELECT CUSTOMER ===
// =============================================================

function selectCustomer(id) {
  state.selectedCustomerId = id;
  const customer = state.vault?.customers?.find(c => c.id === id);
  if (!customer) { renderDetailEmpty(); return; }

  // Update sidebar active state
  document.querySelectorAll('.customer-item').forEach(btn => {
    btn.setAttribute('aria-current', btn.dataset.customerId === id ? 'true' : 'false');
  });

  renderDetailContent(customer);
}


// =============================================================
// === RENDER: DETAIL PANEL ===
// =============================================================

function renderDetailEmpty() {
  document.getElementById('detail-empty').hidden = false;
  document.getElementById('detail-content').hidden = true;
}

function renderDetailContent(customer) {
  document.getElementById('detail-empty').hidden = true;
  const content = document.getElementById('detail-content');
  content.hidden = false;

  // Header
  document.getElementById('detail-customer-name').textContent = customer.name;
  const tagsEl = document.getElementById('detail-customer-tags');
  tagsEl.innerHTML = '';
  (customer.tags || []).forEach(tag => {
    const span = document.createElement('span');
    span.className = 'tag';
    span.textContent = tag;
    tagsEl.appendChild(span);
  });

  renderAccessMethod(customer.access);
  renderCredentials(customer.credentials || []);

  lucide.createIcons({ nodes: [content] });
}


// =============================================================
// === RENDER: ACCESS METHOD ===
// =============================================================

function renderAccessMethod(access) {
  const section = document.getElementById('access-method-section');
  if (!section) return;

  // Support both legacy single-object and new array format
  const methods = Array.isArray(access) ? access : (access ? [access] : []);

  if (methods.length === 0) {
    section.innerHTML = `
      <div class="section-title-row">
        <h3 class="section-title" style="margin:0"><i data-lucide="network"></i> Access Method</h3>
        <button class="btn btn-ghost btn-sm" id="btn-add-access"><i data-lucide="plus"></i> Add</button>
      </div>
      <p class="empty-hint">No access method defined.</p>`;
    document.getElementById('btn-add-access')?.addEventListener('click', () => openAddAccessModal());
    return;
  }

  // Build path breadcrumb from first/primary method
  const primary = methods[0];
  const pathSteps = buildAccessPath(primary);
  const pathHTML  = pathSteps.map((s, i) =>
    (i > 0 ? `<span class="access-arrow"><i data-lucide="chevron-right"></i></span>` : '') +
    `<span class="access-badge ${s.cls}">${s.label}</span>`
  ).join('');

  section.innerHTML = `
    <div class="section-title-row">
      <h3 class="section-title" style="margin:0"><i data-lucide="network"></i> Access Method</h3>
      <button class="btn btn-ghost btn-sm" id="btn-add-access"><i data-lucide="plus"></i> Add</button>
    </div>
    <div class="table-wrapper">
      <table class="access-table" aria-label="Access methods">
        <thead>
          <tr>
            <th>Method</th>
            <th>Type</th>
            <th>Host</th>
            <th>Details</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="access-table-body"></tbody>
      </table>
    </div>`;

  document.getElementById('btn-add-access')?.addEventListener('click', () => openAddAccessModal());

  const tbody = document.getElementById('access-table-body');
  methods.forEach((acc, idx) => {
    const tr = document.createElement('tr');
    tr.dataset.accessIdx = idx;

    const { label, typeText, hostText, detailsHTML } = buildAccessRowData(acc);

    tr.innerHTML = `
      <td><span class="access-badge access-badge--${acc.method || ''}">${escapeHtml(label)}</span></td>
      <td><span class="cred-value">${escapeHtml(typeText)}</span></td>
      <td>
        <div class="cred-field-cell">
          <span class="cred-value">${escapeHtml(hostText)}</span>
          ${hostText !== '—' ? `<button class="btn-copy btn-sm" data-copy-value="${escapeHtml(hostText)}" aria-label="Copy host"><i data-lucide="copy"></i></button>` : ''}
        </div>
      </td>
      <td>
        <div class="access-details-text">${detailsHTML}</div>
      </td>
      <td>
        <div class="cred-row-actions">
          <button class="btn-icon btn-sm" data-action="edit-access" aria-label="Edit access"><i data-lucide="pencil"></i></button>
          <button class="btn-icon btn-sm btn-icon--danger" data-action="delete-access" aria-label="Delete access"><i data-lucide="trash-2"></i></button>
        </div>
      </td>`;

    tr.querySelector('[data-action="edit-access"]')?.addEventListener('click', () => openEditAccessModal(acc, idx));
    tr.querySelector('[data-action="delete-access"]')?.addEventListener('click', () => confirmDeleteAccess(idx));
    tbody.appendChild(tr);
  });
}

function buildAccessPath(acc) {
  const steps = [];
  if (!acc) return steps;
  if (acc.method === 'vpn' || acc.method === 'vpn+jumphost') steps.push({ label: 'VPN', cls: '' });
  if (acc.method === 'vpn+jumphost') steps.push({ label: 'Jumphost', cls: 'access-badge--jumphost' });
  if (acc.method === 'pam') steps.push({ label: 'PAM', cls: 'access-badge--pam' });
  if (acc.method === 'direct') steps.push({ label: 'Direct', cls: '' });
  steps.push({ label: 'Device', cls: 'access-badge-target' });
  return steps;
}

function buildAccessRowData(acc) {
  let label = (acc.method || '').toUpperCase() || '—';
  let typeText = '—', hostText = '—', detailsHTML = '';

  if (acc.method === 'vpn' || acc.method === 'vpn+jumphost') {
    label    = 'VPN';
    typeText = acc.vpn?.type || '—';
    hostText = acc.vpn?.server || '—';
    const parts = [];
    if (acc.vpn?.group)   parts.push(`<span class="access-detail-chip">Group: ${escapeHtml(acc.vpn.group)}</span>`);
    if (acc.method === 'vpn+jumphost' && acc.jumphost?.host)
      parts.push(`<span class="access-detail-chip"><i data-lucide="terminal" style="width:.85em;height:.85em"></i> ${escapeHtml(acc.jumphost.host)}:${acc.jumphost.port || 22}<button class="btn-copy btn-sm" data-copy-value="${escapeHtml(acc.jumphost.host)}" aria-label="Copy jumphost"><i data-lucide="copy"></i></button></span>`);
    if (acc.jumphost?.username) parts.push(`<span class="access-detail-chip">User: ${escapeHtml(acc.jumphost.username)}</span>`);
    if (acc.general_notes) parts.push(`<span class="access-detail-chip" title="${escapeHtml(acc.general_notes)}"><i data-lucide="info" style="width:.85em;height:.85em"></i> Note</span>`);
    detailsHTML = parts.join(' ');
  } else if (acc.method === 'pam') {
    label    = 'PAM';
    typeText = acc.pam?.provider || '—';
    hostText = acc.pam?.url || '—';
    if (acc.pam?.url) detailsHTML = `<button class="btn-copy btn-sm" data-copy-value="${escapeHtml(acc.pam.url)}" aria-label="Copy URL"><i data-lucide="copy"></i></button>`;
    if (acc.general_notes) detailsHTML += ` <span class="access-detail-chip">${escapeHtml(acc.general_notes)}</span>`;
  } else if (acc.method === 'direct') {
    label    = 'Direct';
    typeText = 'SSH / Telnet';
    hostText = '—';
    if (acc.general_notes) detailsHTML = `<span class="access-detail-chip">${escapeHtml(acc.general_notes)}</span>`;
  }

  return { label, typeText, hostText, detailsHTML };
}

// ── ACCESS METHOD CRUD ──

function openAddAccessModal() {
  state.editingAccessIdx = null;
  populateAccessForm(null);
  document.getElementById('modal-access-title').textContent = 'Add Access Method';
  openModal('modal-access');
  initCustomSelects();
  lucide.createIcons();
}

function openEditAccessModal(acc, idx) {
  state.editingAccessIdx = idx;
  populateAccessForm(acc);
  document.getElementById('modal-access-title').textContent = 'Edit Access Method';
  openModal('modal-access');
  initCustomSelects();
  lucide.createIcons();
}

function confirmDeleteAccess(idx) {
  confirmDelete(
    'Remove this access method? This cannot be undone.',
    () => {
      const customer = state.vault.customers.find(c => c.id === state.selectedCustomerId);
      if (!customer) return;
      const methods = Array.isArray(customer.access) ? customer.access : (customer.access ? [customer.access] : []);
      methods.splice(idx, 1);
      customer.access = methods;
      markUnsaved();
      renderAccessMethod(customer.access);
      lucide.createIcons({ nodes: [document.getElementById('access-method-section')] });
      showToast('Access method deleted', 'success');
    }
  );
}

function populateAccessForm(acc) {
  const form = document.getElementById('form-access');
  if (!form) return;
  form.reset();
  const method = acc?.method || 'vpn';

  // Set radio tile
  const radio = form.querySelector(`[name="method"][value="${method}"]`);
  if (radio) radio.checked = true;

  // VPN Type dropdown
  // Sync custom select for vpn_type
  const vpnTypeHidden = form.querySelector('input[name="vpn_type"]');
  if (vpnTypeHidden) {
    const v = acc?.vpn?.type || 'Anyconnect';
    vpnTypeHidden.value = v;
    const wrapper = document.getElementById('access-vpn-type-wrapper');
    if (wrapper) {
      const valueEl = wrapper.querySelector('.custom-select-value');
      if (valueEl) valueEl.textContent = v;
      wrapper.querySelectorAll('.custom-select-option').forEach(o => {
        o.classList.toggle('is-selected', o.dataset.value === v);
      });
    }
  }

  const set = (name, val) => { const el = form.querySelector(`[name="${name}"]`); if (el) el.value = val ?? ''; };
  set('vpn_server',    acc?.vpn?.server);
  set('vpn_group',     acc?.vpn?.group);
  set('jh_host',       acc?.jumphost?.host);
  set('jh_port',       acc?.jumphost?.port || 22);
  set('jh_user',       acc?.jumphost?.username);
  set('pam_provider',  acc?.pam?.provider);
  set('pam_url',       acc?.pam?.url);
  set('general_notes', acc?.general_notes);

  updateAccessFormVisibility(method);
}

function updateAccessFormVisibility(method) {
  const form = document.getElementById('form-access');
  if (!form) return;
  const m = method || form.querySelector('[name="method"]:checked')?.value || 'vpn';
  form.querySelector('.access-fields-vpn').hidden      = !['vpn','vpn+jumphost'].includes(m);
  form.querySelector('.access-fields-jumphost').hidden  = m !== 'vpn+jumphost';
  form.querySelector('.access-fields-pam').hidden      = m !== 'pam';
}

document.getElementById('form-access')?.addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  const method = form.querySelector('[name="method"]:checked')?.value || 'vpn';
  const acc = {
    method,
    general_notes: form.querySelector('[name="general_notes"]').value.trim() || undefined,
  };
  if (method === 'vpn' || method === 'vpn+jumphost') {
    acc.vpn = {
      type:   form.querySelector('[name="vpn_type"]').value.trim(),
      server: form.querySelector('[name="vpn_server"]').value.trim(),
      group:  form.querySelector('[name="vpn_group"]').value.trim() || undefined,
    };
  }
  if (method === 'vpn+jumphost') {
    acc.jumphost = {
      host:     form.querySelector('[name="jh_host"]').value.trim(),
      port:     parseInt(form.querySelector('[name="jh_port"]').value) || 22,
      username: form.querySelector('[name="jh_user"]').value.trim() || undefined,
    };
  }
  if (method === 'pam') {
    acc.pam = {
      provider: form.querySelector('[name="pam_provider"]').value.trim(),
      url:      form.querySelector('[name="pam_url"]').value.trim(),
    };
  }

  const customer = state.vault.customers.find(c => c.id === state.selectedCustomerId);
  if (!customer) return;
  let methods = Array.isArray(customer.access) ? customer.access : (customer.access ? [customer.access] : []);
  if (state.editingAccessIdx !== null && state.editingAccessIdx >= 0) {
    methods[state.editingAccessIdx] = acc;
  } else {
    methods.push(acc);
  }
  customer.access = methods;
  markUnsaved();
  closeModal('modal-access');
  renderAccessMethod(customer.access);
  lucide.createIcons({ nodes: [document.getElementById('access-method-section')] });
  showToast(state.editingAccessIdx !== null ? 'Access method updated' : 'Access method added', 'success');
});

document.querySelectorAll('#form-access [name="method"]').forEach(radio => {
  radio.addEventListener('change', e => updateAccessFormVisibility(e.target.value));
});



// =============================================================
// === RENDER: CREDENTIALS ===
// =============================================================

function renderCredentials(credentials) {
  const container = document.getElementById('credential-list');
  const emptyEl   = document.getElementById('credential-list-empty');
  if (!container) return;

  if (emptyEl) emptyEl.hidden = credentials.length > 0;

  if (credentials.length === 0) {
    container.innerHTML = '';
    return;
  }

  // Build table
  const hasNotes = credentials.some(c => c.notes);
  container.innerHTML = `
    <table class="cred-table" aria-label="Credentials">
      <thead>
        <tr>
          <th class="cred-col-label">Label</th>
          <th class="cred-col-username">Username</th>
          <th class="cred-col-password">Password</th>
          ${hasNotes ? '<th class="cred-col-notes">Notes</th>' : ''}
          <th class="cred-col-actions"></th>
        </tr>
      </thead>
      <tbody id="cred-table-body"></tbody>
    </table>`;

  const tbody = container.querySelector('#cred-table-body');

  credentials.forEach(cred => {
    const tr = document.createElement('tr');
    tr.className = 'cred-row';
    tr.dataset.credentialId = cred.id;

    // Tags as small badges after label
    const tagHTML = (cred.tags || []).map(t =>
      `<span class="tag tag--sm">${escapeHtml(t)}</span>`).join('');

    tr.innerHTML = `
      <td class="cred-col-label">
        <span class="cred-label-text">${escapeHtml(cred.label)}</span>
        ${tagHTML ? `<div class="cred-tags">${tagHTML}</div>` : ''}
      </td>
      <td class="cred-col-username">
        <div class="cred-field-cell">
          <span class="cred-value" data-field-value="username">${escapeHtml(cred.username || '—')}</span>
          ${cred.username ? `<button class="btn-copy btn-sm" data-copy-value="${escapeHtml(cred.username)}" aria-label="Copy username"><i data-lucide="copy"></i></button>` : ''}
        </div>
      </td>
      <td class="cred-col-password">
        <div class="cred-field-cell">
          <span class="cred-value cred-value--masked" data-field-value="password" data-plaintext="${escapeHtml(cred.password || '')}" data-masked="true">••••••••••</span>
          <button class="btn-reveal btn-sm" data-reveal-field="password" aria-label="Show password"><i data-lucide="eye"></i></button>
          ${cred.password ? `<button class="btn-copy btn-sm" data-copy-value="${escapeHtml(cred.password)}" aria-label="Copy password"><i data-lucide="copy"></i></button>` : ''}
        </div>
      </td>
      ${hasNotes ? `<td class="cred-col-notes"><span class="cred-notes-text">${escapeHtml(cred.notes || '')}</span></td>` : ''}
      <td class="cred-col-actions">
        <div class="cred-row-actions">
          <button class="btn-icon btn-sm" data-action="edit-credential" aria-label="Edit"><i data-lucide="pencil"></i></button>
          <button class="btn-icon btn-sm btn-icon--danger" data-action="delete-credential" aria-label="Delete"><i data-lucide="trash-2"></i></button>
        </div>
      </td>`;

    // Reveal button event
    const revealBtn = tr.querySelector('[data-reveal-field="password"]');
    const pwEl      = tr.querySelector('[data-field-value="password"]');
    revealBtn?.addEventListener('click', () => {
      const masked = pwEl.dataset.masked === 'true';
      pwEl.textContent  = masked ? pwEl.dataset.plaintext : '••••••••••';
      pwEl.dataset.masked = masked ? 'false' : 'true';
      pwEl.classList.toggle('cred-value--masked', !masked);
      revealBtn.setAttribute('aria-label', masked ? 'Hide password' : 'Show password');
      revealBtn.innerHTML = masked
        ? '<i data-lucide="eye-off"></i>'
        : '<i data-lucide="eye"></i>';
      lucide.createIcons({ nodes: [revealBtn] });
    });

    // Copy buttons — use data-copy-value directly
    tr.querySelectorAll('[data-copy-value]').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.copyValue).then(() => {
          btn.classList.add('copy-success');
          const orig = btn.innerHTML;
          btn.innerHTML = '<i data-lucide="check"></i>';
          lucide.createIcons({ nodes: [btn] });
          setTimeout(() => {
            btn.classList.remove('copy-success');
            btn.innerHTML = orig;
            lucide.createIcons({ nodes: [btn] });
          }, 1500);
        });
      });
    });

    // Edit / delete
    tr.querySelector('[data-action="edit-credential"]')?.addEventListener('click', () => openEditCredentialModal(cred.id));
    tr.querySelector('[data-action="delete-credential"]')?.addEventListener('click', () => confirmDeleteCredential(cred.id));

    tbody.appendChild(tr);
  });
  lucide.createIcons();
}



function attachCredentialCardEvents(fragment, cred) {
  // Reveal password
  const revealBtn = fragment.querySelector('[data-reveal-field="password"]');
  revealBtn?.addEventListener('click', () => {
    const pwEl = fragment.ownerDocument
      ? fragment.querySelector('[data-field-value="password"]')
      : revealBtn.closest('.credential-card')?.querySelector('[data-field-value="password"]');
    // After clone is appended, look up from DOM
    const card = document.querySelector(`[data-credential-id="${cred.id}"]`);
    if (!card) return;
    const pwValueEl = card.querySelector('[data-field-value="password"]');
    const icon = revealBtn.querySelector('i[data-lucide]');
    const isMasked = pwValueEl.dataset.masked === 'true';
    if (isMasked) {
      pwValueEl.textContent = pwValueEl.dataset.plaintext;
      pwValueEl.dataset.masked = 'false';
      if (icon) { icon.setAttribute('data-lucide', 'eye-off'); lucide.createIcons({ nodes: [icon] }); }
    } else {
      pwValueEl.textContent = '••••••••••';
      pwValueEl.dataset.masked = 'true';
      if (icon) { icon.setAttribute('data-lucide', 'eye'); lucide.createIcons({ nodes: [icon] }); }
    }
  });

  // Copy username
  const copyUserBtn = fragment.querySelector('[data-copy-field="username"]');
  copyUserBtn?.addEventListener('click', async () => {
    await copyToClipboard(cred.username || '', copyUserBtn);
  });

  // Copy password
  const copyPwBtn = fragment.querySelector('[data-copy-field="password"]');
  copyPwBtn?.addEventListener('click', async () => {
    await copyToClipboard(cred.password || '', copyPwBtn);
  });

  // Edit credential
  const editBtn = fragment.querySelector('[data-action="edit-credential"]');
  editBtn?.addEventListener('click', () => openEditCredentialModal(cred.id));

  // Delete credential
  const deleteBtn = fragment.querySelector('[data-action="delete-credential"]');
  deleteBtn?.addEventListener('click', () => confirmDeleteCredential(cred.id, cred.label));
}


// =============================================================
// === COPY BUTTONS: ACCESS CARDS ===
// =============================================================

document.addEventListener('click', async e => {
  const btn = e.target.closest('[data-copy-target]');
  if (!btn) return;
  const targetId = btn.dataset.copyTarget;
  const targetEl = document.getElementById(targetId);
  if (!targetEl) return;
  await copyToClipboard(targetEl.textContent.trim(), btn);
});


// =============================================================
// === CUSTOMER MODAL: ADD / EDIT ===
// =============================================================

document.getElementById('btn-add-customer')?.addEventListener('click', openAddCustomerModal);
document.getElementById('btn-edit-customer')?.addEventListener('click', () => {
  if (state.selectedCustomerId) openEditCustomerModal(state.selectedCustomerId);
});

function openAddCustomerModal() {
  state.editingCustomerId = null;
  document.getElementById('modal-customer-title').textContent = 'Add Customer';
  resetCustomerForm();
  openModal('modal-customer');
}

function openEditCustomerModal(id) {
  const customer = state.vault?.customers?.find(c => c.id === id);
  if (!customer) return;
  state.editingCustomerId = id;
  document.getElementById('modal-customer-title').textContent = 'Edit Customer';
  populateCustomerForm(customer);
  openModal('modal-customer');
}

function resetCustomerForm() {
  document.getElementById('form-customer')?.reset();
  document.querySelectorAll('.conditional-fields').forEach(f => f.hidden = true);
}

function populateCustomerForm(customer) {
  resetCustomerForm();
  document.getElementById('customer-name').value = customer.name || '';
  document.getElementById('customer-tags').value = tagsToString(customer.tags);
}
function updateAccessFields(method) {
  document.getElementById('vpn-fields').hidden = !(method === 'vpn' || method === 'vpn+jumphost');
  document.getElementById('jumphost-fields').hidden = method !== 'vpn+jumphost';
  document.getElementById('pam-fields').hidden = method !== 'pam';
}

document.getElementById('form-customer')?.addEventListener('submit', e => {
  e.preventDefault();
  const name = document.getElementById('customer-name')?.value?.trim();
  if (!name) {
    document.getElementById('customer-name-error').textContent = 'Customer name is required.';
    return;
  }
  document.getElementById('customer-name-error').textContent = '';
  const method = document.querySelector('input[name="access-type"]:checked')?.value || 'direct';

  const customer = {
    id: state.editingCustomerId || generateId(),
    name,
    tags: parseTags(document.getElementById('customer-tags')?.value),
    access: {
      method,
      vpn: (method === 'vpn' || method === 'vpn+jumphost') ? {
        type: document.getElementById('vpn-type-input')?.value?.trim(),
        server: document.getElementById('vpn-server-input')?.value?.trim(),
        group: document.getElementById('vpn-group-input')?.value?.trim(),
      } : null,
      jumphost: method === 'vpn+jumphost' ? {
        host: document.getElementById('jumphost-host-input')?.value?.trim(),
        port: parseInt(document.getElementById('jumphost-port-input')?.value) || 22,
        username: document.getElementById('jumphost-user-input')?.value?.trim(),
      } : null,
      pam: method === 'pam' ? {
        url: document.getElementById('pam-url-input')?.value?.trim(),
        notes: document.getElementById('pam-notes-input')?.value?.trim(),
      } : null,
      general_notes: document.getElementById('access-notes-input')?.value?.trim(),
    },
    credentials: state.editingCustomerId
      ? state.vault.customers.find(c => c.id === state.editingCustomerId)?.credentials || []
      : [],
  };

  if (state.editingCustomerId) {
    const idx = state.vault.customers.findIndex(c => c.id === state.editingCustomerId);
    if (idx !== -1) state.vault.customers[idx] = customer;
    showToast('Customer updated', 'success');
  } else {
    state.vault.customers.push(customer);
    showToast('Customer added', 'success');
  }

  markUnsaved();
  renderCustomerList();
  closeModal('modal-customer');
  selectCustomer(customer.id);
});


// =============================================================
// === DELETE CUSTOMER ===
// =============================================================

document.getElementById('btn-delete-customer')?.addEventListener('click', () => {
  const id = state.selectedCustomerId;
  const customer = state.vault?.customers?.find(c => c.id === id);
  if (!customer) return;
  confirmDelete(
    `Delete "${customer.name}"? This will also remove all its credentials. This cannot be undone.`,
    () => {
      state.vault.customers = state.vault.customers.filter(c => c.id !== id);
      state.selectedCustomerId = null;
      markUnsaved();
      renderCustomerList();
      renderDetailEmpty();
      showToast('Customer deleted', 'info');
    }
  );
});


// =============================================================
// === CREDENTIAL MODAL: ADD / EDIT ===
// =============================================================

document.getElementById('btn-add-credential')?.addEventListener('click', openAddCredentialModal);

function openAddCredentialModal() {
  state.editingCredentialId = null;
  document.getElementById('modal-credential-title').textContent = 'Add Credential';
  document.getElementById('form-credential')?.reset();
  openModal('modal-credential');
}

function openEditCredentialModal(credId) {
  const customer = state.vault?.customers?.find(c => c.id === state.selectedCustomerId);
  const cred = customer?.credentials?.find(cr => cr.id === credId);
  if (!cred) return;
  state.editingCredentialId = credId;
  document.getElementById('modal-credential-title').textContent = 'Edit Credential';
  document.getElementById('cred-label').value = cred.label || '';
  document.getElementById('cred-username').value = cred.username || '';
  document.getElementById('cred-password').value = cred.password || '';
  document.getElementById('cred-tags').value = tagsToString(cred.tags);
  document.getElementById('cred-notes').value = cred.notes || '';
  openModal('modal-credential');
}

document.getElementById('form-credential')?.addEventListener('submit', e => {
  e.preventDefault();
  const label = document.getElementById('cred-label')?.value?.trim();
  const password = document.getElementById('cred-password')?.value;
  if (!label) { document.getElementById('cred-label-error').textContent = 'Label is required.'; return; }
  if (!password) { document.getElementById('cred-password-error').textContent = 'Password is required.'; return; }
  document.getElementById('cred-label-error').textContent = '';
  document.getElementById('cred-password-error').textContent = '';

  const customer = state.vault?.customers?.find(c => c.id === state.selectedCustomerId);
  if (!customer) return;

  const cred = {
    id: state.editingCredentialId || generateId(),
    label,
    username: document.getElementById('cred-username')?.value?.trim(),
    password,
    tags: parseTags(document.getElementById('cred-tags')?.value),
    notes: document.getElementById('cred-notes')?.value?.trim(),
  };

  if (state.editingCredentialId) {
    const idx = customer.credentials.findIndex(cr => cr.id === state.editingCredentialId);
    if (idx !== -1) customer.credentials[idx] = cred;
    showToast('Credential updated', 'success');
  } else {
    customer.credentials.push(cred);
    showToast('Credential added', 'success');
  }

  markUnsaved();
  closeModal('modal-credential');
  renderCredentials(customer.credentials);
  lucide.createIcons();
});


// =============================================================
// === DELETE CREDENTIAL ===
// =============================================================

function confirmDeleteCredential(credId, label) {
  confirmDelete(
    `Delete credential "${label}"? This cannot be undone.`,
    () => {
      const customer = state.vault?.customers?.find(c => c.id === state.selectedCustomerId);
      if (!customer) return;
      customer.credentials = customer.credentials.filter(cr => cr.id !== credId);
      markUnsaved();
      renderCredentials(customer.credentials);
      renderCustomerList();
      showToast('Credential deleted', 'info');
    }
  );
}


// =============================================================
// === CONFIRM MODAL (generic) ===
// =============================================================

let _confirmCallback = null;

function confirmDelete(message, onConfirm) {
  _confirmCallback = onConfirm;
  document.getElementById('modal-confirm-message').textContent = message;
  openModal('modal-confirm');
}

document.getElementById('btn-confirm-delete')?.addEventListener('click', () => {
  if (typeof _confirmCallback === 'function') _confirmCallback();
  _confirmCallback = null;
  closeModal('modal-confirm');
});


// =============================================================
// === SETTINGS MODAL ===
// =============================================================

document.getElementById('btn-open-settings')?.addEventListener('click', () => {
  updateSettingsInfo();
  openModal('modal-settings');
});

function updateSettingsInfo() {
  const customers = state.vault?.customers || [];
  const credCount = customers.reduce((sum, c) => sum + (c.credentials?.length || 0), 0);
  const el = id => document.getElementById(id);
  if (el('settings-customer-count')) el('settings-customer-count').textContent = customers.length;
  if (el('settings-credential-count')) el('settings-credential-count').textContent = credCount;
  if (el('settings-vault-filename')) el('settings-vault-filename').textContent = state.vaultFileHandle?.name || '—';
  if (el('settings-last-saved')) {
    const ts = state.vault?.meta?.updated_at;
    el('settings-last-saved').textContent = ts ? new Date(ts).toLocaleString() : 'Never';
  }
}

// Save Vault As (Phase 1 stub)
document.getElementById('btn-save-vault-as')?.addEventListener('click', async () => {
  if (!state.vault || !state.masterKey) return;
  try {
    state.vault.meta.updated_at = new Date().toISOString();
    const envelope = await encryptVault(state.vault, state.masterKey);
    // Force Save As dialog by passing null handle
    const handle = await saveVaultFile(envelope, null, state.vaultFileHandle?.name || 'netvault.vault');
    if (handle) {
      state.vaultFileHandle = handle;
      setVaultFileLabel(handle.name);
    }
    state.vaultEnvelope = envelope;
    markSaved();
    showToast('Vault saved', 'success');
  } catch (err) {
    if (err.name === 'AbortError') return;
    showToast('Save failed: ' + (err.message || ''), 'error');
  }
});

// Switch vault file
document.getElementById('btn-switch-vault')?.addEventListener('click', () => {
  closeAllModals();
  lockVault();
});

// Clear all data
document.getElementById('btn-clear-vault')?.addEventListener('click', () => {
  confirmDelete(
    'This will permanently delete ALL customers and credentials. Are you sure?',
    () => {
      state.vault.customers = [];
      state.selectedCustomerId = null;
      markUnsaved();
      renderCustomerList();
      renderDetailEmpty();
      showToast('All data cleared', 'info');
    }
  );
});

// Change master password — real re-encryption (Phase 2)
document.getElementById('form-change-password')?.addEventListener('submit', async e => {
  e.preventDefault();
  const current  = document.getElementById('settings-current-password')?.value || '';
  const newPw    = document.getElementById('settings-new-password')?.value || '';
  const confirm  = document.getElementById('settings-confirm-password')?.value || '';
  const errEl    = document.getElementById('settings-password-error');

  if (current !== state.masterKey) {
    if (errEl) errEl.textContent = 'Current password is incorrect.';
    return;
  }
  if (newPw.length < 12) {
    if (errEl) errEl.textContent = 'New password must be at least 12 characters.';
    return;
  }
  if (newPw !== confirm) {
    if (errEl) errEl.textContent = 'Passwords do not match.';
    return;
  }
  if (errEl) errEl.textContent = '';

  try {
    const envelope = await reEncryptVault(state.vault, newPw);
    const handle   = await saveVaultFile(envelope, state.vaultFileHandle);
    if (handle) state.vaultFileHandle = handle;
    state.masterKey     = newPw;
    state.vaultEnvelope = envelope;
    markSaved();
    document.getElementById('form-change-password')?.reset();
    showToast('Master password changed and vault re-saved', 'success');
  } catch (err) {
    if (err.name === 'AbortError') return;
    if (errEl) errEl.textContent = err.message || 'Failed to change password.';
  }
});


// =============================================================
// === INIT ===
// =============================================================

// =============================================================
// === CUSTOM SELECT DROPDOWN ===
// =============================================================

function initCustomSelects() {
  document.querySelectorAll('.custom-select').forEach(wrapper => {
    const trigger  = wrapper.querySelector('.custom-select-trigger');
    const dropdown = wrapper.querySelector('.custom-select-dropdown');
    const hidden   = wrapper.querySelector('input[type="hidden"]');
    const valueEl  = wrapper.querySelector('.custom-select-value');
    const options  = wrapper.querySelectorAll('.custom-select-option');

    if (!trigger || !dropdown) return;

    trigger.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = dropdown.classList.contains('is-open');
      closeAllCustomSelects();
      if (!isOpen) {
        dropdown.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
        lucide.createIcons({ nodes: [trigger] });
      }
    });

    options.forEach(opt => {
      opt.addEventListener('click', () => {
        const val = opt.dataset.value;
        if (hidden)   hidden.value = val;
        if (valueEl)  valueEl.textContent = opt.textContent;
        options.forEach(o => o.classList.remove('is-selected'));
        opt.classList.add('is-selected');
        dropdown.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        lucide.createIcons({ nodes: [trigger] });
      });
    });
  });
}

function closeAllCustomSelects() {
  document.querySelectorAll('.custom-select-dropdown.is-open').forEach(dd => {
    dd.classList.remove('is-open');
    const trigger = dd.closest('.custom-select')?.querySelector('.custom-select-trigger');
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
      lucide.createIcons({ nodes: [trigger] });
    }
  });
}

// Close on outside click
document.addEventListener('click', () => closeAllCustomSelects());

// Close on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeAllCustomSelects();
});


function init() {
  showView('view-unlock');
  lucide.createIcons();

  // Warn if unsaved changes on page close
  window.addEventListener('beforeunload', e => {
    if (state.unsaved) {
      e.preventDefault();
      e.returnValue = 'You have unsaved changes. Close anyway?';
    }
  });
}

// Wait for DOM + Lucide to be ready before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
