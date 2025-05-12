# Mask Smith

A VS Code extension for protecting sensitive information using AES-GCM encryption.

## ✨ Features

- 🔒 Strong encryption using AES-GCM algorithm
- 🎯 Quick text encryption with selection
- 👀 User-friendly visual indicators for encrypted content
- 📋 One-click decryption to clipboard
- 🔑 Secure password management

## 🚀 Quick Start

1. Open a text file (`.txt`) or Markdown file (`.md`) in VS Code
2. Select the text you want to encrypt
3. Trigger encryption using either:
   - Keyboard shortcut: `Cmd+Alt+M` (Mac) / `Ctrl+Alt+M` (Windows/Linux)
   - Right-click context menu: "Mask Selection"
4. Enter and confirm your encryption password when prompted (first time only)
5. Selected text will be encrypted and marked with a special indicator

## 💡 Usage Guide

### Encrypting Text
1. Select the text you want to encrypt
2. Use the keyboard shortcut or context menu to trigger encryption
3. Encrypted text will be displayed as `<!MASK-SMITH:...>` with a 🔐 indicator

### Viewing Decrypted Content
1. Hover over the encrypted text
2. Click the "📋 Copy to Clipboard" button in the hover tooltip
3. Decrypted content will be copied to your clipboard

## ⚙️ Supported File Types

- Plain text files (`.txt`)
- Markdown files (`.md`)

## 🔒 Security Features

- AES-GCM encryption algorithm for data security
- SHA-256 hashing for password processing
- Secure key storage using system keychain
- Encryption verification to ensure data integrity

## 🛡️ Privacy Statement

- All encryption operations are performed locally
- Passwords are stored only in system keychain
- No network communication
- No user data collection

## 📝 Release Notes

### 0.0.1
- Initial release
- Text encryption/decryption support
- Basic UI interactions
- System keychain integration

## 🤝 Contributing

Issues and PRs are welcome to help improve this extension!

## 📄 License

See the [LICENSE](LICENSE) file for details.

## 🌏 Languages

- [简体中文](README_CN.md)
