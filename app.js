// ── NetCreds app.js — PWA + IndexedDB Edition ──

// ════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════
const state = {
  masterKey: null,
  vaultEnvelope: null,
  vault: null,
  selectedCustomerId: null,
  editingCustomerId: null,
  editingCredentialId: null,
  editingAccessIdx: null,
  unsaved: false,
  idleTimer: null,
  AUTOLOCKMINUTES: 15,
};

// ════════════════════════════════════════════
// INDEXEDDB HELPERS
// ════════════════════════════════════════════
const DB_NAME  = 'netcreds-db';
const DB_STORE = 'vaults';
const DB_KEY   = 'default';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(DB_STORE);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function saveVaultToDB(envelope) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(envelope, DB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror    = e => reject(e.target.error);
  });
}

async function loadVaultFromDB() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get(DB_KEY);
    req.onsuccess = e => resolve(e.target.result ?? null);
    req.onerror   = e => reject(e.target.error);
  });
}

async function deleteVaultFromDB() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(DB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror    = e => reject(e.target.error);
  });
}

// ════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════
function generateId() {
  return crypto.randomUUID?.() ?? (Date.now().toString(36) + Math.random().toString(36).slice(2));
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
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

async function copyToClipboard(text, btnEl) {
  try {
    await navigator.clipboard.writeText(text);
    const icon = btnEl.querySelector('i[data-lucide]');
    const originalIcon = icon?.getAttribute('data-lucide') ?? 'copy';
    btnEl.classList.add('copy-success');
    if (icon) { icon.setAttribute('data-lucide', 'check'); lucide.createIcons({ nodes: [icon] }); }
    showToast('Copied!', 'success');
    setTimeout(() => {
      btnEl.classList.remove('copy-success');
      if (icon) { icon.setAttribute('data-lucide', originalIcon); lucide.createIcons({ nodes: [icon] }); }
    }, 1500);
  } catch { showToast('Failed to copy', 'error'); }
}

// ════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════
function showToast(message, type = 'info', duration = 2500) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'status');
  const icons = { success: 'check-circle', error: 'x-circle', info: 'info' };
  toast.innerHTML = `<i data-lucide="${icons[type] ?? 'info'}" style="width:1em;height:1em;flex-shrink:0;margin-right:.5rem"></i>${escapeHtml(message)}`;
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

// ════════════════════════════════════════════
// VIEW SWITCHING
// ════════════════════════════════════════════
const VIEWS = ['view-unlock', 'view-create-vault', 'view-main'];
function showView(id) {
  VIEWS.forEach(v => {
    const el = document.getElementById(v);
    if (el) el.classList.toggle('view--hidden', v !== id);
  });
}

// ════════════════════════════════════════════
// MODAL MANAGEMENT
// ════════════════════════════════════════════
const MODALS = ['modal-customer', 'modal-credential', 'modal-settings', 'modal-confirm', 'modal-access'];

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.hidden = false;
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

function closeAllModals() { MODALS.forEach(id => closeModal(id)); }

function handleModalKeydown(e) { if (e.key === 'Escape') closeAllModals(); }

document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
  backdrop.addEventListener('mousedown', e => { if (e.target === backdrop) closeModal(backdrop.id); });
});

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-close-modal]');
  if (btn) closeModal(btn.dataset.closeModal);
});

// ════════════════════════════════════════════
// THEME TOGGLE
// ════════════════════════════════════════════
function initTheme() {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = prefersDark ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcon(theme);
}

function updateThemeIcon(theme) {
  const btn = document.querySelector('[data-theme-toggle]');
  if (!btn) return;
  const icon = btn.querySelector('i[data-lucide]');
  if (!icon) return;
  icon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
  btn.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
  lucide.createIcons({ nodes: [icon] });
}

document.querySelector('[data-theme-toggle]')?.addEventListener('click', () => {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  updateThemeIcon(next);
});

// ════════════════════════════════════════════
// BOTTOM SHEET (Mobile Portrait)
// ════════════════════════════════════════════
document.getElementById('btn-bottom-sheet')?.addEventListener('click', () => {
  const sidebar = document.getElementById('sidebar');
  const btn = document.getElementById('btn-bottom-sheet');
  const isExpanded = sidebar.classList.toggle('is-expanded');
  btn?.setAttribute('aria-expanded', String(isExpanded));
});

// Auto-expand saat search di-tap di mobile portrait
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

// ════════════════════════════════════════════
// PASSWORD REVEAL TOGGLE
// ════════════════════════════════════════════
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-target]');
  if (!btn || !btn.classList.contains('btn-reveal')) return;
  const input = document.getElementById(btn.dataset.target);
  if (!input) return;
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  const icon = btn.querySelector('i[data-lucide]');
  if (icon) { icon.setAttribute('data-lucide', isHidden ? 'eye-off' : 'eye'); lucide.createIcons({ nodes: [icon] }); }
  btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
});

// ════════════════════════════════════════════
// PASSWORD STRENGTH METER
// ════════════════════════════════════════════
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
    { label: '',            pct: 0,   color: 'transparent' },
    { label: 'Very weak',  pct: 14,  color: 'var(--color-error)' },
    { label: 'Weak',       pct: 28,  color: 'var(--color-warning)' },
    { label: 'Fair',       pct: 50,  color: 'var(--color-orange)' },
    { label: 'Good',       pct: 70,  color: 'var(--color-primary)' },
    { label: 'Strong',     pct: 85,  color: 'var(--color-success)' },
    { label: 'Very strong',pct: 100, color: 'var(--color-success)' },
  ];
  return levels[Math.min(score, levels.length - 1)];
}

document.getElementById('input-new-password')?.addEventListener('input', e => {
  const fill   = document.getElementById('strength-fill');
  const label  = document.getElementById('strength-label');
  const result = measurePasswordStrength(e.target.value);
  if (fill)  { fill.style.width = result.pct + '%'; fill.style.background = result.color; }
  if (label) label.textContent = result.label;
});

// ════════════════════════════════════════════
// UNLOCK SCREEN — check IndexedDB on load
// ════════════════════════════════════════════
async function checkExistingVault() {
  try {
    const envelope = await loadVaultFromDB();
    const statusEl = document.getElementById('unlock-file-status');
    const labelEl  = document.getElementById('unlock-file-label');
    if (envelope) {
      if (labelEl)  labelEl.textContent = 'Vault found in storage';
      if (statusEl) { statusEl.classList.remove('file-status--none'); statusEl.classList.add('file-status--ok'); }
    } else {
      if (labelEl)  labelEl.textContent = 'No vault in storage — import a .vault file';
    }
  } catch { /* ignore */ }
}

// Import vault from .vault file into IndexedDB
document.getElementById('btn-open-vault-file')?.addEventListener('click', async () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.vault';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const envelope = JSON.parse(text);
      await saveVaultToDB(envelope);
      state.vaultEnvelope = envelope;
      const labelEl  = document.getElementById('unlock-file-label');
      const statusEl = document.getElementById('unlock-file-status');
      if (labelEl)  labelEl.textContent = file.name + ' imported';
      if (statusEl) { statusEl.classList.remove('file-status--none'); statusEl.classList.add('file-status--ok'); }
      showToast('Vault imported — enter password to unlock', 'success', 3500);
    } catch (err) {
      showToast('Invalid vault file: ' + err.message, 'error');
    }
  };
  input.click();
});

// Unlock form — read from IndexedDB
document.getElementById('form-unlock')?.addEventListener('submit', async e => {
  e.preventDefault();
  const pw    = document.getElementById('input-master-password')?.value;
  const errEl = document.getElementById('unlock-error');
  if (!pw) return;
  const btn = document.getElementById('btn-unlock');
  btn.disabled = true;
  btn.textContent = 'Unlocking…';
  if (errEl) errEl.textContent = '';
  try {
    const envelope = await loadVaultFromDB();
    if (!envelope) throw new Error('No vault found. Import a .vault file first.');
    const vault = await decryptVault(envelope, pw);
    state.vault         = vault;
    state.masterKey     = pw;
    state.vaultEnvelope = envelope;
    enterMainView();
  } catch (err) {
    if (errEl) errEl.textContent = err.message || 'Failed to unlock vault.';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="lock-open"></i> Unlock';
    lucide.createIcons({ nodes: [btn] });
  }
});

// Create vault — save to IndexedDB
document.getElementById('form-create-vault')?.addEventListener('submit', async e => {
  e.preventDefault();
  const pw    = document.getElementById('input-new-password')?.value;
  const cpw   = document.getElementById('input-confirm-password')?.value;
  const errEl = document.getElementById('create-vault-error');
  if (pw.length < 12) { if (errEl) errEl.textContent = 'Password must be at least 12 characters.'; return; }
  if (pw !== cpw)     { if (errEl) errEl.textContent = 'Passwords do not match.'; return; }
  if (errEl) errEl.textContent = '';
  const btn = document.getElementById('btn-save-new-vault');
  btn.disabled = true;
  btn.textContent = 'Creating…';
  try {
    const emptyVault = { meta: { createdat: new Date().toISOString(), updatedat: new Date().toISOString() }, customers: [] };
    const envelope   = await encryptVault(emptyVault, pw);
    await saveVaultToDB(envelope);
    state.vault         = emptyVault;
    state.masterKey     = pw;
    state.vaultEnvelope = envelope;
    enterMainView();
    showToast('New vault created!', 'success');
  } catch (err) {
    if (errEl) errEl.textContent = err.message || 'Failed to create vault.';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="shield-check"></i> Create Vault';
    lucide.createIcons({ nodes: [btn] });
  }
});

document.getElementById('btn-create-vault')?.addEventListener('click', () => showView('view-create-vault'));
document.getElementById('btn-back-to-unlock')?.addEventListener('click', () => showView('view-unlock'));

// ════════════════════════════════════════════
// ENTER MAIN VIEW
// ════════════════════════════════════════════
function enterMainView() {
  showView('view-main');
  injectSidebarActions();
  renderCustomerList();
  renderDetailEmpty();
  updateSettingsInfo();
  resetIdleTimer();
  lucide.createIcons();

  // Default expanded di mobile portrait
  if (window.matchMedia('(max-width: 767px) and (orientation: portrait)').matches) {
    const sidebar = document.getElementById('sidebar');
    const btn     = document.getElementById('btn-bottom-sheet');
    sidebar?.classList.add('is-expanded');
    btn?.setAttribute('aria-expanded', 'true');
  }
}

// ════════════════════════════════════════════
// INJECT SIDEBAR ACTIONS (Save + Lock — icon only)
// ════════════════════════════════════════════
function injectSidebarActions() {
  const footer = document.querySelector('.sidebar-footer');
  if (!footer || footer.querySelector('.sidebar-actions')) return;

  const actionsRow = document.createElement('div');
  actionsRow.className = 'sidebar-actions';

  const saveBtn = document.createElement('button');
  saveBtn.id        = 'btn-save-sidebar';
  saveBtn.className = 'btn btn-ghost btn-sm';
  saveBtn.innerHTML = '<i data-lucide="save"></i>';
  saveBtn.title     = 'Save vault (Ctrl+S)';
  saveBtn.setAttribute('aria-label', 'Save vault');
  saveBtn.addEventListener('click', saveVault);

  const lockBtn = document.createElement('button');
  lockBtn.className = 'btn btn-ghost btn-sm';
  lockBtn.innerHTML = '<i data-lucide="lock"></i>';
  lockBtn.title     = 'Lock vault';
  lockBtn.setAttribute('aria-label', 'Lock vault');
  lockBtn.addEventListener('click', lockVault);

  actionsRow.appendChild(saveBtn);
  actionsRow.appendChild(lockBtn);
  footer.appendChild(actionsRow);
}

// ════════════════════════════════════════════
// LOCK VAULT
// ════════════════════════════════════════════
function lockVault() {
  state.vault             = null;
  state.masterKey         = null;
  state.vaultEnvelope     = null;
  state.selectedCustomerId = null;
  state.unsaved           = false;
  clearIdleTimer();
  const pwInput = document.getElementById('input-master-password');
  if (pwInput) pwInput.value = '';
  document.querySelector('.sidebar-actions')?.remove();
  showView('view-unlock');
  lucide.createIcons();
  showToast('Vault locked', 'info');
}

// ════════════════════════════════════════════
// SAVE VAULT — to IndexedDB
// ════════════════════════════════════════════
async function saveVault() {
  if (!state.vault || !state.masterKey) { showToast('Vault not unlocked', 'error'); return; }
  try {
    state.vault.meta.updatedat = new Date().toISOString();
    const envelope = await encryptVault(state.vault, state.masterKey);
    await saveVaultToDB(envelope);
    state.vaultEnvelope = envelope;
    markSaved();
    showToast('Vault saved', 'success');
  } catch (err) {
    showToast('Save failed: ' + err.message, 'error');
  }
}

// Export vault as .vault file (download)
async function exportVault() {
  if (!state.vault || !state.masterKey) return;
  try {
    state.vault.meta.updatedat = new Date().toISOString();
    const envelope = await encryptVault(state.vault, state.masterKey);
    const ts       = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `netcreds-${ts}.vault`;
    const blob     = new Blob([JSON.stringify(envelope)], { type: 'application/octet-stream' });
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    showToast('Vault exported as ' + filename, 'success');
  } catch (err) {
    showToast('Export failed: ' + err.message, 'error');
  }
}

document.getElementById('btn-save-vault-as')?.addEventListener('click', exportVault);

// Import vault (Switch Vault = import new .vault)
document.getElementById('btn-switch-vault')?.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.vault';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const text     = await file.text();
      const envelope = JSON.parse(text);
      await saveVaultToDB(envelope);
      lockVault();
      showToast('New vault imported — unlock to continue', 'info', 3500);
    } catch (err) {
      showToast('Invalid vault file: ' + err.message, 'error');
    }
  };
  input.click();
});

// ════════════════════════════════════════════
// MARK SAVED / UNSAVED
// ════════════════════════════════════════════
function markUnsaved() {
  state.unsaved = true;
  document.getElementById('btn-save-vault-as')?.classList.add('has-changes');
  document.getElementById('btn-save-sidebar')?.classList.add('has-changes');
}

function markSaved() {
  state.unsaved = false;
  document.querySelectorAll('.has-changes').forEach(el => el.classList.remove('has-changes'));
  if (state.vault?.meta) state.vault.meta.updatedat = new Date().toISOString();
  updateSettingsInfo();
}

// ════════════════════════════════════════════
// IDLE AUTO-LOCK
// ════════════════════════════════════════════
function resetIdleTimer() {
  clearIdleTimer();
  state.idleTimer = setTimeout(() => {
    lockVault();
    showToast('Vault locked due to inactivity', 'info', 4000);
  }, state.AUTOLOCKMINUTES * 60 * 1000);
}

function clearIdleTimer() {
  if (state.idleTimer) { clearTimeout(state.idleTimer); state.idleTimer = null; }
}

['click', 'keydown', 'mousemove', 'touchstart'].forEach(evt => {
  document.addEventListener(evt, () => { if (state.vault) resetIdleTimer(); }, { passive: true });
});

// Ctrl+S to save
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    if (state.vault) saveVault();
  }
});

// ════════════════════════════════════════════
// RENDER CUSTOMER LIST
// ════════════════════════════════════════════
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

function filterCustomerList(query) {
  const q         = query.toLowerCase().trim();
  const customers = state.vault?.customers ?? [];
  const filtered  = q ? customers.filter(c =>
    c.name.toLowerCase().includes(q) ||
    (c.tags || []).some(t => t.toLowerCase().includes(q)) ||
    (c.credentials || []).some(cr => cr.username?.toLowerCase().includes(q) || cr.label?.toLowerCase().includes(q))
  ) : customers;
  renderCustomerList(filtered);
  const noResults = document.getElementById('customer-list-no-results');
  if (noResults) noResults.hidden = !(q && filtered.length === 0);
}

function renderCustomerList(customers) {
  const list    = document.getElementById('customer-list');
  const emptyEl = document.getElementById('customer-list-empty');
  if (!list) return;
  const source = customers ?? state.vault?.customers ?? [];
  // Fix: remove <li> wrappers, not just .customer-item buttons
  list.querySelectorAll(':scope > li').forEach(el => el.remove());
  if (emptyEl) emptyEl.hidden = source.length > 0;
  const template = document.getElementById('template-customer-item');
  source.forEach(customer => {
    const clone   = template.content.cloneNode(true);
    const btn     = clone.querySelector('.customer-item');
    btn.dataset.customerId = customer.id;
    btn.setAttribute('aria-current', customer.id === state.selectedCustomerId ? 'true' : 'false');
    clone.querySelector('.customer-item-name').textContent = customer.name;
    const credCount   = customer.credentials?.length ?? 0;
    const methods     = Array.isArray(customer.access) ? customer.access : (customer.access ? [customer.access] : []);
    const methodCount = methods.length;
    clone.querySelector('.customer-item-meta').textContent =
      `${credCount} credential${credCount !== 1 ? 's' : ''}${methodCount ? ` · ${methodCount} access method${methodCount !== 1 ? 's' : ''}` : ''}`;
    btn.addEventListener('click', () => selectCustomer(customer.id));
    list.appendChild(clone);
  });
  lucide.createIcons({ nodes: [list] });
}

// ════════════════════════════════════════════
// ACCESS METHOD HELPERS
// ════════════════════════════════════════════
function accessMethodLabel(method) {
  return { vpn: 'VPN Only', vpnjumphost: 'VPN + Jumphost', pam: 'PAM', direct: 'Direct' }[method] ?? method;
}

function accessMethodBadgeClass(method) {
  return { vpnjumphost: 'access-badge--jumphost', pam: 'access-badge--pam' }[method] ?? '';
}

// ════════════════════════════════════════════
// SELECT CUSTOMER
// ════════════════════════════════════════════
function selectCustomer(id) {
  state.selectedCustomerId = id;
  const customer = state.vault?.customers?.find(c => c.id === id);
  if (!customer) { renderDetailEmpty(); return; }
  document.querySelectorAll('.customer-item').forEach(btn => {
    btn.setAttribute('aria-current', btn.dataset.customerId === id ? 'true' : 'false');
  });
  renderDetailContent(customer);

  // Collapse sidebar di mobile portrait saat customer dipilih
  if (window.matchMedia('(max-width: 767px) and (orientation: portrait)').matches) {
    const sidebar = document.getElementById('sidebar');
    const btn     = document.getElementById('btn-bottom-sheet');
    sidebar?.classList.remove('is-expanded');
    btn?.setAttribute('aria-expanded', 'false');
  }
}

// ════════════════════════════════════════════
// RENDER DETAIL PANEL
// ════════════════════════════════════════════
function renderDetailEmpty() {
  document.getElementById('detail-empty').hidden  = false;
  document.getElementById('detail-content').hidden = true;
}

function renderDetailContent(customer) {
  document.getElementById('detail-empty').hidden  = true;
  const content = document.getElementById('detail-content');
  content.hidden = false;
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

// ════════════════════════════════════════════
// RENDER ACCESS METHOD
// ════════════════════════════════════════════
function renderAccessMethod(access) {
  const section = document.getElementById('access-method-section');
  if (!section) return;
  const methods = Array.isArray(access) ? access : (access ? [access] : []);

  if (methods.length === 0) {
    section.innerHTML = `
      <div class="section-title-row">
        <h3 class="section-title" style="margin:0"><i data-lucide="network"></i> Access Method</h3>
        <button class="btn btn-ghost btn-sm" id="btn-add-access"><i data-lucide="plus"></i> Add</button>
      </div>
      <p class="empty-hint">No access method defined.</p>`;
    document.getElementById('btn-add-access')?.addEventListener('click', openAddAccessModal);
    return;
  }

  section.innerHTML = `
    <div class="section-title-row">
      <h3 class="section-title" style="margin:0"><i data-lucide="network"></i> Access Method</h3>
      <button class="btn btn-ghost btn-sm" id="btn-add-access"><i data-lucide="plus"></i> Add</button>
    </div>
    <div class="table-wrapper">
      <table class="access-table" aria-label="Access methods">
        <thead><tr><th>Method</th><th>Type</th><th>Host</th><th>Details</th><th></th></tr></thead>
        <tbody id="access-table-body"></tbody>
      </table>
    </div>`;

  document.getElementById('btn-add-access')?.addEventListener('click', openAddAccessModal);
  const tbody = document.getElementById('access-table-body');

  methods.forEach((acc, idx) => {
    const { label, typeText, hostText, detailsHTML } = buildAccessRowData(acc);
    const tr = document.createElement('tr');
    tr.dataset.accessIdx = idx;
    tr.innerHTML = `
      <td><span class="access-badge ${accessMethodBadgeClass(acc.method)}">${escapeHtml(label)}</span></td>
      <td><span class="cred-value">${escapeHtml(typeText)}</span></td>
      <td><div class="cred-field-cell">
        <span class="cred-value">${escapeHtml(hostText)}</span>
        ${hostText ? `<button class="btn-copy btn-sm" data-copy-value="${escapeHtml(hostText)}" aria-label="Copy host"><i data-lucide="copy"></i></button>` : ''}
      </div></td>
      <td><div class="access-details-text">${detailsHTML}</div></td>
      <td><div class="cred-row-actions">
        <button class="btn-icon btn-sm" data-action="edit-access" aria-label="Edit"><i data-lucide="pencil"></i></button>
        <button class="btn-icon btn-sm btn-icon--danger" data-action="delete-access" aria-label="Delete"><i data-lucide="trash-2"></i></button>
      </div></td>`;
    tr.querySelector('[data-action="edit-access"]')?.addEventListener('click', () => openEditAccessModal(acc, idx));
    tr.querySelector('[data-action="delete-access"]')?.addEventListener('click', () => confirmDeleteAccess(idx));
    tbody.appendChild(tr);
  });
}

function buildAccessRowData(acc) {
  let label = (acc.method || '').toUpperCase(), typeText = '', hostText = '', detailsHTML = '';
  if (acc.method === 'vpn' || acc.method === 'vpnjumphost') {
    label    = 'VPN';
    typeText = acc.vpn?.type ?? '';
    hostText = acc.vpn?.server ?? '';
    const parts = [];
    if (acc.vpn?.group) parts.push(`<span class="access-detail-chip">Group ${escapeHtml(acc.vpn.group)}</span>`);
    if (acc.method === 'vpnjumphost' && acc.jumphost?.host) {
      parts.push(`<span class="access-detail-chip"><i data-lucide="terminal" style="width:.85em;height:.85em"></i> ${escapeHtml(acc.jumphost.host)}:${acc.jumphost.port ?? 22}
        <button class="btn-copy btn-sm" data-copy-value="${escapeHtml(acc.jumphost.host)}" aria-label="Copy jumphost"><i data-lucide="copy"></i></button></span>`);
    }
    if (acc.jumphost?.username) parts.push(`<span class="access-detail-chip">User ${escapeHtml(acc.jumphost.username)}</span>`);
    if (acc.generalnotes)       parts.push(`<span class="access-detail-chip" title="${escapeHtml(acc.generalnotes)}"><i data-lucide="info" style="width:.85em;height:.85em"></i> Note</span>`);
    detailsHTML = parts.join('');
  } else if (acc.method === 'pam') {
    label    = 'PAM';
    typeText = acc.pam?.provider ?? '';
    hostText = acc.pam?.url ?? '';
    if (acc.pam?.url) detailsHTML += `<button class="btn-copy btn-sm" data-copy-value="${escapeHtml(acc.pam.url)}" aria-label="Copy URL"><i data-lucide="copy"></i></button>`;
    if (acc.generalnotes) detailsHTML += `<span class="access-detail-chip">${escapeHtml(acc.generalnotes)}</span>`;
  } else if (acc.method === 'direct') {
    label    = 'Direct';
    typeText = 'SSH/Telnet';
    if (acc.generalnotes) detailsHTML = `<span class="access-detail-chip">${escapeHtml(acc.generalnotes)}</span>`;
  }
  return { label, typeText, hostText, detailsHTML };
}

// ════════════════════════════════════════════
// ACCESS METHOD CRUD
// ════════════════════════════════════════════
function openAddAccessModal() {
  state.editingAccessIdx = null;
  populateAccessForm(null);
  document.getElementById('modal-access-title').textContent = 'Add Access Method';
  openModal('modal-access');
}

function openEditAccessModal(acc, idx) {
  state.editingAccessIdx = idx;
  populateAccessForm(acc);
  document.getElementById('modal-access-title').textContent = 'Edit Access Method';
  openModal('modal-access');
}

function confirmDeleteAccess(idx) {
  confirmDelete('Remove this access method? This cannot be undone.', () => {
    const customer = state.vault.customers.find(c => c.id === state.selectedCustomerId);
    if (!customer) return;
    const methods = Array.isArray(customer.access) ? customer.access : (customer.access ? [customer.access] : []);
    methods.splice(idx, 1);
    customer.access = methods;
    markUnsaved();
    renderAccessMethod(customer.access);
    lucide.createIcons({ nodes: [document.getElementById('access-method-section')] });
    showToast('Access method deleted', 'success');
  });
}

function populateAccessForm(acc) {
  const form = document.getElementById('form-access');
  if (!form) return;
  form.reset();
  const method = acc?.method ?? 'vpn';
  const radio  = form.querySelector(`[name="method"][value="${method}"]`);
  if (radio) radio.checked = true;
  const set = (name, val) => { const el = form.querySelector(`[name="${name}"]`); if (el) el.value = val ?? ''; };
  set('vpnserver',   acc?.vpn?.server);
  set('vpngroup',    acc?.vpn?.group);
  set('jhhost',      acc?.jumphost?.host);
  set('jhport',      acc?.jumphost?.port ?? 22);
  set('jhuser',      acc?.jumphost?.username);
  set('pamprovider', acc?.pam?.provider);
  set('pamurl',      acc?.pam?.url);
  set('generalnotes',acc?.generalnotes);
  updateAccessFormVisibility(method);
}

function updateAccessFormVisibility(method) {
  const form = document.getElementById('form-access');
  if (!form) return;
  const m = method ?? form.querySelector('[name="method"]:checked')?.value;
  const vpn = ['vpn','vpnjumphost'].includes(m);
  form.querySelector('.access-fields-vpn').hidden      = !vpn;
  form.querySelector('.access-fields-jumphost').hidden = m !== 'vpnjumphost';
  form.querySelector('.access-fields-pam').hidden      = m !== 'pam';
}

document.getElementById('form-access')?.addEventListener('submit', e => {
  e.preventDefault();
  const form   = e.target;
  const method = form.querySelector('[name="method"]:checked')?.value ?? 'vpn';
  const acc    = { method, generalnotes: form.querySelector('[name="generalnotes"]').value.trim() || undefined };
  if (method === 'vpn' || method === 'vpnjumphost') {
    acc.vpn = { type: form.querySelector('[name="vpntype"]').value.trim(), server: form.querySelector('[name="vpnserver"]').value.trim(), group: form.querySelector('[name="vpngroup"]').value.trim() || undefined };
  }
  if (method === 'vpnjumphost') {
    acc.jumphost = { host: form.querySelector('[name="jhhost"]').value.trim(), port: parseInt(form.querySelector('[name="jhport"]').value) || 22, username: form.querySelector('[name="jhuser"]').value.trim() || undefined };
  }
  if (method === 'pam') {
    acc.pam = { provider: form.querySelector('[name="pamprovider"]').value.trim(), url: form.querySelector('[name="pamurl"]').value.trim() };
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

document.querySelectorAll('[name="method"]').forEach(radio => {
  radio.addEventListener('change', e => updateAccessFormVisibility(e.target.value));
});

// ════════════════════════════════════════════
// RENDER CREDENTIALS
// ════════════════════════════════════════════
function renderCredentials(credentials) {
  const container = document.getElementById('credential-list');
  const emptyEl   = document.getElementById('credential-list-empty');
  if (!container) return;
  if (emptyEl) emptyEl.hidden = credentials.length > 0;
  if (credentials.length === 0) { container.innerHTML = ''; return; }

  const hasNotes = credentials.some(c => c.notes);
  container.innerHTML = `
    <table class="cred-table" aria-label="Credentials">
      <thead><tr>
        <th class="cred-col-label">Label</th>
        <th class="cred-col-username">Username</th>
        <th class="cred-col-password">Password</th>
        ${hasNotes ? '<th class="cred-col-notes">Notes</th>' : ''}
        <th class="cred-col-actions"></th>
      </tr></thead>
      <tbody id="cred-table-body"></tbody>
    </table>`;

  const tbody = container.querySelector('#cred-table-body');
  credentials.forEach(cred => {
    const tr = document.createElement('tr');
    tr.className = 'cred-row';
    tr.dataset.credentialId = cred.id;
    const tagHTML = (cred.tags || []).map(t => `<span class="tag tag--sm">${escapeHtml(t)}</span>`).join('');
    tr.innerHTML = `
      <td class="cred-col-label">
        <span class="cred-label-text">${escapeHtml(cred.label)}</span>
        ${tagHTML ? `<div class="cred-tags">${tagHTML}</div>` : ''}
      </td>
      <td class="cred-col-username">
        <div class="cred-field-cell">
          <span class="cred-value" data-field-value="username">${escapeHtml(cred.username)}</span>
          ${cred.username ? `<button class="btn-copy btn-sm" data-copy-value="${escapeHtml(cred.username)}" aria-label="Copy username"><i data-lucide="copy"></i></button>` : ''}
        </div>
      </td>
      <td class="cred-col-password">
        <div class="cred-field-cell">
          <span class="cred-value cred-value--masked" data-field-value="password" data-plaintext="${escapeHtml(cred.password)}" data-masked="true"></span>
          <button class="btn-reveal btn-sm" data-reveal-field="password" aria-label="Show password"><i data-lucide="eye"></i></button>
          ${cred.password ? `<button class="btn-copy btn-sm" data-copy-value="${escapeHtml(cred.password)}" aria-label="Copy password"><i data-lucide="copy"></i></button>` : ''}
        </div>
      </td>
      ${hasNotes ? `<td class="cred-col-notes"><span class="cred-notes-text">${escapeHtml(cred.notes)}</span></td>` : ''}
      <td class="cred-col-actions">
        <div class="cred-row-actions">
          <button class="btn-icon btn-sm" data-action="edit-credential" aria-label="Edit"><i data-lucide="pencil"></i></button>
          <button class="btn-icon btn-sm btn-icon--danger" data-action="delete-credential" aria-label="Delete"><i data-lucide="trash-2"></i></button>
        </div>
      </td>`;

    // Reveal toggle
    const revealBtn = tr.querySelector('[data-reveal-field="password"]');
    const pwEl      = tr.querySelector('[data-field-value="password"]');
    revealBtn?.addEventListener('click', () => {
      const masked = pwEl.dataset.masked === 'true';
      pwEl.textContent    = masked ? pwEl.dataset.plaintext : '';
      pwEl.dataset.masked = masked ? 'false' : 'true';
      pwEl.classList.toggle('cred-value--masked', !masked);
      revealBtn.setAttribute('aria-label', masked ? 'Hide password' : 'Show password');
      revealBtn.innerHTML = masked ? '<i data-lucide="eye-off"></i>' : '<i data-lucide="eye"></i>';
      lucide.createIcons({ nodes: [revealBtn] });
    });

    // Copy buttons
    tr.querySelectorAll('[data-copy-value]').forEach(btn => {
      btn.addEventListener('click', () => copyToClipboard(btn.dataset.copyValue, btn));
    });

    // Edit / Delete
    tr.querySelector('[data-action="edit-credential"]')?.addEventListener('click', () => openEditCredentialModal(cred.id));
    tr.querySelector('[data-action="delete-credential"]')?.addEventListener('click', () => confirmDeleteCredential(cred.id, cred.label));

    tbody.appendChild(tr);
  });
}

// ════════════════════════════════════════════
// CUSTOMER MODAL
// ════════════════════════════════════════════
document.getElementById('btn-add-customer')?.addEventListener('click', openAddCustomerModal);
document.getElementById('btn-edit-customer')?.addEventListener('click', () => {
  if (state.selectedCustomerId) openEditCustomerModal(state.selectedCustomerId);
});

function openAddCustomerModal() {
  state.editingCustomerId = null;
  document.getElementById('modal-customer-title').textContent = 'Add Customer';
  document.getElementById('form-customer')?.reset();
  openModal('modal-customer');
}

function openEditCustomerModal(id) {
  const customer = state.vault?.customers?.find(c => c.id === id);
  if (!customer) return;
  state.editingCustomerId = id;
  document.getElementById('modal-customer-title').textContent = 'Edit Customer';
  document.getElementById('customer-name').value = customer.name;
  document.getElementById('customer-tags').value = tagsToString(customer.tags);
  openModal('modal-customer');
}

document.getElementById('form-customer')?.addEventListener('submit', e => {
  e.preventDefault();
  const name = document.getElementById('customer-name')?.value?.trim();
  if (!name) { document.getElementById('customer-name-error').textContent = 'Customer name is required.'; return; }
  document.getElementById('customer-name-error').textContent = '';
  const customer = {
    id:          state.editingCustomerId ?? generateId(),
    name,
    tags:        parseTags(document.getElementById('customer-tags')?.value),
    access:      state.editingCustomerId ? state.vault.customers.find(c => c.id === state.editingCustomerId)?.access : [],
    credentials: state.editingCustomerId ? state.vault.customers.find(c => c.id === state.editingCustomerId)?.credentials : [],
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

document.getElementById('btn-delete-customer')?.addEventListener('click', () => {
  const id       = state.selectedCustomerId;
  const customer = state.vault?.customers?.find(c => c.id === id);
  if (!customer) return;
  confirmDelete(`Delete ${customer.name}? This will also remove all its credentials. This cannot be undone.`, () => {
    state.vault.customers       = state.vault.customers.filter(c => c.id !== id);
    state.selectedCustomerId    = null;
    markUnsaved();
    renderCustomerList();
    renderDetailEmpty();
    showToast('Customer deleted', 'info');
  });
});

// ════════════════════════════════════════════
// CREDENTIAL MODAL
// ════════════════════════════════════════════
document.getElementById('btn-add-credential')?.addEventListener('click', openAddCredentialModal);

function openAddCredentialModal() {
  state.editingCredentialId = null;
  document.getElementById('modal-credential-title').textContent = 'Add Credential';
  document.getElementById('form-credential')?.reset();
  openModal('modal-credential');
}

function openEditCredentialModal(credId) {
  const customer = state.vault?.customers?.find(c => c.id === state.selectedCustomerId);
  const cred     = customer?.credentials?.find(cr => cr.id === credId);
  if (!cred) return;
  state.editingCredentialId = credId;
  document.getElementById('modal-credential-title').textContent = 'Edit Credential';
  document.getElementById('cred-label').value    = cred.label;
  document.getElementById('cred-username').value = cred.username;
  document.getElementById('cred-password').value = cred.password;
  document.getElementById('cred-tags').value     = tagsToString(cred.tags);
  document.getElementById('cred-notes').value    = cred.notes ?? '';
  openModal('modal-credential');
}

document.getElementById('form-credential')?.addEventListener('submit', e => {
  e.preventDefault();
  const label    = document.getElementById('cred-label')?.value?.trim();
  const password = document.getElementById('cred-password')?.value;
  if (!label)    { document.getElementById('cred-label-error').textContent    = 'Label is required.';    return; }
  if (!password) { document.getElementById('cred-password-error').textContent = 'Password is required.'; return; }
  document.getElementById('cred-label-error').textContent    = '';
  document.getElementById('cred-password-error').textContent = '';
  const customer = state.vault?.customers?.find(c => c.id === state.selectedCustomerId);
  if (!customer) return;
  const cred = {
    id:       state.editingCredentialId ?? generateId(),
    label,
    username: document.getElementById('cred-username')?.value?.trim(),
    password,
    tags:     parseTags(document.getElementById('cred-tags')?.value),
    notes:    document.getElementById('cred-notes')?.value?.trim(),
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

function confirmDeleteCredential(credId, label) {
  confirmDelete(`Delete credential "${label}"? This cannot be undone.`, () => {
    const customer = state.vault?.customers?.find(c => c.id === state.selectedCustomerId);
    if (!customer) return;
    customer.credentials = customer.credentials.filter(cr => cr.id !== credId);
    markUnsaved();
    renderCredentials(customer.credentials);
    renderCustomerList();
    showToast('Credential deleted', 'info');
  });
}

// ════════════════════════════════════════════
// CONFIRM MODAL
// ════════════════════════════════════════════
let confirmCallback = null;
function confirmDelete(message, onConfirm) {
  confirmCallback = onConfirm;
  document.getElementById('modal-confirm-message').textContent = message;
  openModal('modal-confirm');
}

document.getElementById('btn-confirm-delete')?.addEventListener('click', () => {
  if (typeof confirmCallback === 'function') confirmCallback();
  confirmCallback = null;
  closeModal('modal-confirm');
});

// ════════════════════════════════════════════
// SETTINGS MODAL
// ════════════════════════════════════════════
document.getElementById('btn-open-settings')?.addEventListener('click', () => {
  updateSettingsInfo();
  openModal('modal-settings');
});

function updateSettingsInfo() {
  const customers  = state.vault?.customers ?? [];
  const credCount  = customers.reduce((sum, c) => sum + (c.credentials?.length ?? 0), 0);
  const el = id => document.getElementById(id);
  if (el('settings-customer-count'))  el('settings-customer-count').textContent  = customers.length;
  if (el('settings-credential-count')) el('settings-credential-count').textContent = credCount;
  if (el('settings-vault-filename'))  el('settings-vault-filename').textContent  = 'IndexedDB (local storage)';
  if (el('settings-last-saved')) {
    const ts = state.vault?.meta?.updatedat;
    el('settings-last-saved').textContent = ts ? new Date(ts).toLocaleString() : 'Never';
  }
}

document.getElementById('btn-clear-vault')?.addEventListener('click', () => {
  confirmDelete('This will permanently delete ALL customers and credentials. Are you sure?', () => {
    state.vault.customers    = [];
    state.selectedCustomerId = null;
    markUnsaved();
    renderCustomerList();
    renderDetailEmpty();
    showToast('All data cleared', 'info');
  });
});

document.getElementById('form-change-password')?.addEventListener('submit', async e => {
  e.preventDefault();
  const current = document.getElementById('settings-current-password')?.value;
  const newPw   = document.getElementById('settings-new-password')?.value;
  const confirm = document.getElementById('settings-confirm-password')?.value;
  const errEl   = document.getElementById('settings-password-error');
  if (current !== state.masterKey) { if (errEl) errEl.textContent = 'Current password is incorrect.'; return; }
  if (newPw.length < 12)           { if (errEl) errEl.textContent = 'New password must be at least 12 characters.'; return; }
  if (newPw !== confirm)           { if (errEl) errEl.textContent = 'Passwords do not match.'; return; }
  if (errEl) errEl.textContent = '';
  try {
    const envelope = await encryptVault(state.vault, newPw);
    await saveVaultToDB(envelope);
    state.masterKey     = newPw;
    state.vaultEnvelope = envelope;
    markSaved();
    document.getElementById('form-change-password')?.reset();
    showToast('Master password changed and vault re-saved', 'success');
  } catch (err) {
    if (errEl) errEl.textContent = err.message || 'Failed to change password.';
  }
});

// ════════════════════════════════════════════
// SERVICE WORKER REGISTRATION
// ════════════════════════════════════════════
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {/* silent */});
  });
}

// ════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════
function init() {
  initTheme();
  showView('view-unlock');
  lucide.createIcons();
  checkExistingVault();

  window.addEventListener('beforeunload', e => {
    if (state.unsaved) { e.preventDefault(); e.returnValue = 'You have unsaved changes. Close anyway?'; }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
