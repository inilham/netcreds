# 🔐 NetVault

A local-first credential manager built for network engineers.
Store customer credentials, access methods, and network device
information — all encrypted and saved as a local `.vault` file
on your own device.

No cloud sync. No server. Your data stays with you.

---

## ✨ Features

- **Customer-based organization** — Group credentials and access
  methods per customer/client
- **AES-GCM encryption** — Vault file encrypted with your master
  password using Web Crypto API
- **Local file storage** — Vault saved as `.vault` file on your
  device via File System Access API
- **Multiple access method support** — VPN, VPN + Jumphost, PAM,
  and Direct access
- **Credential management** — Store username, password, tags, and
  notes per credential
- **Drag to reorder** — Reorder credentials and access methods
  via drag handle (SortableJS)
- **One-click copy** — Copy username, password, or host address
  to clipboard
- **Password masking** — Passwords hidden by default with reveal
  toggle
- **Auto-lock** — Vault automatically locks after 15 minutes of
  inactivity
- **Search & filter** — Real-time search by customer name, tag,
  or credential label
- **Dark / light theme** — Toggle between themes, preference
  saved locally
- **Keyboard shortcut** — `Ctrl+S` / `Cmd+S` to save vault
- **Mobile-friendly** — Responsive layout with slide-in sidebar
  drawer on small screens
- **Unsaved changes indicator** — Visual indicator on save button
  when there are pending changes

---

## 🚀 Getting Started

### Prerequisites

No build tools or dependencies required. NetVault runs entirely
in the browser.

### Running Locally

1. Clone or download this repository
2. Open `index.html` in a modern browser (Chrome or Edge recommended)
3. Click **Create New Vault** to create your first vault
4. Set a master password (minimum 12 characters)
5. Save the `.vault` file to your preferred location

### Opening an Existing Vault

1. Open the app
2. Click **Open Vault File** and select your `.vault` file
3. Enter your master password to unlock

---

## 🛡️ Security Notes

- Encryption uses **AES-GCM 256-bit** via the browser's native
  Web Crypto API — no third-party crypto library
- Master password is never stored anywhere — it only exists in
  memory while the vault is unlocked
- Vault auto-locks after **15 minutes** of inactivity
- All data processing happens **client-side only** — nothing is
  sent to any server
- Closing the browser tab immediately clears all sensitive data
  from memory

> ⚠️ **If you forget your master password, the vault cannot be
> recovered.** There is no reset or recovery mechanism by design.

---

## 💾 Local Storage Usage

NetVault stores minimal non-sensitive data in `localStorage`:

| Key | Content |
|---|---|
| `netcreds-theme` | Last selected theme (`dark` / `light`) |

All vault data is stored exclusively in the `.vault` file on
your local filesystem.

---

## 🌐 Browser Compatibility

| Browser | Support |
|---|---|
| Chrome 86+ | ✅ Full support (File System Access API) |
| Edge 86+ | ✅ Full support |
| Firefox | ⚠️ Partial — file picker fallback only |
| Safari | ⚠️ Partial — file picker fallback only |
| Mobile Chrome | ✅ Responsive layout supported |

> File System Access API enables direct read/write to local files.
> On unsupported browsers, a standard file input fallback is used.

---

## 📦 Dependencies

All loaded via CDN — no npm or build step required.

| Library | Version | Purpose |
|---|---|---|
| [Lucide Icons](https://lucide.dev) | latest | UI icons |
| [SortableJS](https://sortablejs.com) | 1.15.2 | Drag-to-reorder rows |

---

## 📄 License

MIT License. Use freely, modify freely, but keep your vault
file safe.
