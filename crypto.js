
// =============================================================
// NETVAULT — crypto.js  (Phase 2: AES-256-GCM + File I/O)
// =============================================================

// =============================================================
// === CRYPTO CONSTANTS ===
// =============================================================

const CRYPTO = {
  KDF:        'PBKDF2',
  KDF_HASH:   'SHA-256',
  ITERATIONS: 250_000,
  SALT_BYTES: 32,
  IV_BYTES:   12,
  ALGO:       'AES-GCM',
  KEY_BITS:   256,
  VAULT_VER:  1,
};


// =============================================================
// === ENCODE / DECODE HELPERS ===
// =============================================================

function bufToB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b64ToBuf(b64) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function strToBytes(str) {
  return new TextEncoder().encode(str);
}

function bytesToStr(buf) {
  return new TextDecoder().decode(buf);
}


// =============================================================
// === KEY DERIVATION (PBKDF2) ===
// =============================================================

/**
 * Derive an AES-GCM CryptoKey from a master password + salt.
 * @param {string} password
 * @param {ArrayBuffer} salt
 * @returns {Promise<CryptoKey>}
 */
async function deriveKey(password, salt) {
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    strToBytes(password),
    { name: CRYPTO.KDF },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name:       CRYPTO.KDF,
      salt:       salt,
      iterations: CRYPTO.ITERATIONS,
      hash:       CRYPTO.KDF_HASH,
    },
    keyMaterial,
    { name: CRYPTO.ALGO, length: CRYPTO.KEY_BITS },
    false,           // not extractable
    ['encrypt', 'decrypt']
  );
}


// =============================================================
// === ENCRYPT ===
// =============================================================

/**
 * Encrypt a plain JS object into the vault envelope format.
 * @param {object} vaultData  Plain vault object (will be JSON-stringified)
 * @param {string} password   Master password
 * @returns {Promise<object>} Vault envelope (safe to JSON.stringify + save)
 */
async function encryptVault(vaultData, password) {
  const salt = window.crypto.getRandomValues(new Uint8Array(CRYPTO.SALT_BYTES));
  const iv   = window.crypto.getRandomValues(new Uint8Array(CRYPTO.IV_BYTES));
  const key  = await deriveKey(password, salt);

  const plaintext  = strToBytes(JSON.stringify(vaultData));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: CRYPTO.ALGO, iv },
    key,
    plaintext
  );

  return {
    version:    CRYPTO.VAULT_VER,
    kdf: {
      name:       CRYPTO.KDF,
      hash:       CRYPTO.KDF_HASH,
      iterations: CRYPTO.ITERATIONS,
      salt:       bufToB64(salt),
    },
    crypto: {
      name: CRYPTO.ALGO,
      iv:   bufToB64(iv),
    },
    ciphertext: bufToB64(ciphertext),
  };
}


// =============================================================
// === DECRYPT ===
// =============================================================

/**
 * Decrypt a vault envelope with the given password.
 * Throws if password is wrong or data is corrupt.
 * @param {object} envelope   Parsed vault envelope JSON
 * @param {string} password   Master password
 * @returns {Promise<object>} Decrypted vault data object
 */
async function decryptVault(envelope, password) {
  if (!envelope || envelope.version !== CRYPTO.VAULT_VER) {
    throw new Error('Unsupported vault format or version.');
  }

  const salt       = b64ToBuf(envelope.kdf.salt);
  const iv         = b64ToBuf(envelope.crypto.iv);
  const ciphertext = b64ToBuf(envelope.ciphertext);
  const key        = await deriveKey(password, salt);

  let plaintext;
  try {
    plaintext = await window.crypto.subtle.decrypt(
      { name: CRYPTO.ALGO, iv },
      key,
      ciphertext
    );
  } catch {
    throw new Error('Incorrect password or corrupted vault file.');
  }

  return JSON.parse(bytesToStr(plaintext));
}


// =============================================================
// === RE-ENCRYPT (change master password) ===
// =============================================================

/**
 * Re-encrypt the current vault with a new password.
 * Old key is discarded; new envelope is returned.
 * @param {object} vaultData   Current decrypted vault object
 * @param {string} newPassword New master password
 * @returns {Promise<object>}  New vault envelope
 */
async function reEncryptVault(vaultData, newPassword) {
  return encryptVault(vaultData, newPassword);
}


// =============================================================
// === FILE I/O ===
// =============================================================

const FILE_OPTS = {
  types: [{
    description: 'NetVault encrypted file',
    accept: { 'application/octet-stream': ['.vault'] },
  }],
};

/**
 * Open a .vault file via File System Access API (Chrome/Edge).
 * Falls back to a hidden <input type="file"> on Firefox.
 * @returns {Promise<{ handle: FileSystemFileHandle|null, file: File }>}
 */
async function openVaultFilePicker() {
  if (window.showOpenFilePicker) {
    const [handle] = await window.showOpenFilePicker({ ...FILE_OPTS, multiple: false });
    const file = await handle.getFile();
    return { handle, file };
  }
  // Fallback: file input
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.vault';
    input.onchange = () => {
      if (input.files[0]) resolve({ handle: null, file: input.files[0] });
      else reject(new Error('No file selected'));
    };
    input.oncancel = () => reject(new DOMException('User cancelled', 'AbortError'));
    input.click();
  });
}

/**
 * Read and parse a vault file.
 * @param {File} file
 * @returns {Promise<object>} Parsed vault envelope JSON
 */
async function readVaultFile(file) {
  const text = await file.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Vault file is not valid JSON. It may be corrupted.');
  }
}

/**
 * Save the vault envelope to disk.
 * Uses File System Access API writable stream if handle available,
 * otherwise triggers a browser download.
 * @param {object} envelope   Vault envelope to save
 * @param {FileSystemFileHandle|null} handle  Existing file handle (or null)
 * @param {string} suggestedName  Filename for Save As dialog
 * @returns {Promise<FileSystemFileHandle|null>} Updated handle (if API available)
 */
async function saveVaultFile(envelope, handle, suggestedName = 'netvault.vault') {
  const content = JSON.stringify(envelope);

  // --- File System Access API path (Chrome / Edge) ---
  if (window.showSaveFilePicker) {
    let fileHandle = handle;
    if (!fileHandle) {
      fileHandle = await window.showSaveFilePicker({
        ...FILE_OPTS,
        suggestedName,
      });
    }
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    return fileHandle;
  }

  // --- Fallback: download ---
  const blob = new Blob([content], { type: 'application/octet-stream' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = suggestedName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return null; // no handle available via download
}
