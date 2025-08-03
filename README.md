# Mask Smith

<div align="center">

![Version](https://img.shields.io/badge/version-0.0.5-blue.svg)
![VS Code](https://img.shields.io/badge/VS%20Code-^1.99.0-brightgreen.svg)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

A powerful VS Code extension for protecting sensitive information using AES-256-GCM encryption

[中文文档](README_CN.md)

</div>

## 🎯 Overview

Mask Smith is a VS Code extension designed to protect sensitive information in your documents. It allows you to encrypt selected text directly within your editor using industry-standard AES-256-GCM encryption, keeping your sensitive data secure while maintaining document readability.

## ✨ Features

- **🔐 Strong Encryption**: Uses AES-256-GCM encryption with SHA-256 hashing for maximum security
- **👁️ Visual Masking**: Encrypted content is visually masked in the editor with a clear indicator
- **🔄 Seamless Integration**: Works directly within VS Code with context menu and keyboard shortcuts
- **🔑 Smart Password Management**: Securely stores passwords in VS Code's secret storage with option to reuse previous passwords
- **📋 Smart Copy**: Automatically decrypts masked content when copying to clipboard
- **🌍 Multi-language Support**: Available in English and Chinese
- **📝 File Type Support**: Works with plain text and Markdown files

## 📦 Installation

### From VS Code Marketplace

1. Open VS Code
2. Press `Ctrl+P` / `Cmd+P` to open the Quick Open dialog
3. Type `ext install Yarmu.mask-smith` and press Enter
4. Click Install

### From VSIX File

1. Download the `.vsix` file from the [releases page](https://github.com/iceyarmu/mask-smith/releases)
2. Open VS Code
3. Press `Ctrl+Shift+P` / `Cmd+Shift+P`
4. Type "Install from VSIX" and select it
5. Browse to the downloaded `.vsix` file

## 🚀 Usage

### Encrypting Text

1. **Select the text** you want to encrypt in a supported file (`.txt` or `.md`)
2. Use one of the following methods:
   - **Right-click** and select "Mask Selection" from the context menu
   - Press **`Ctrl+Alt+M`** (Windows/Linux) or **`Cmd+Alt+M`** (Mac)
   - Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run "Mask Smith: Mask Selection"
3. **Enter your password** when prompted
   - For first-time encryption, you'll need to confirm the password
   - The extension will offer to reuse your last password for convenience
4. The selected text will be replaced with encrypted content like: `<!MASK-SMITH:encrypted_data>`

### Viewing Encrypted Content

- **Hover** over any encrypted text to see a "Copy to Clipboard" button
- Click the button to decrypt and copy the original text to your clipboard

### Copying Encrypted Content

When you select and copy text containing encrypted content:
- Press **`Ctrl+C`** (Windows/Linux) or **`Cmd+C`** (Mac)
- The extension automatically decrypts any masked content before copying
- You'll see a notification confirming the decrypted content was copied

## ⌨️ Keyboard Shortcuts

| Action | Windows/Linux | Mac |
|--------|--------------|-----|
| Mask Selection | `Ctrl+Alt+M` | `Cmd+Alt+M` |
| Copy (with auto-decrypt) | `Ctrl+C` | `Cmd+C` |

## 🔒 Security Features

### Encryption Details

- **Algorithm**: AES-256-GCM (Galois/Counter Mode)
- **Key Derivation**: SHA-256 hash of user password
- **Initialization Vector**: First 12 bytes of SHA-256 hash of plaintext
- **Key Storage**: Passwords are hashed and stored securely in VS Code's secret storage
- **Verification**: Each encryption is immediately verified by decryption to ensure data integrity

### Security Best Practices

1. **Use strong passwords**: Combine uppercase, lowercase, numbers, and special characters
2. **Different passwords for different sensitivity levels**: Use unique passwords for highly sensitive data
3. **Regular password updates**: Change passwords periodically for enhanced security
4. **Secure file storage**: Store files with encrypted content in secure locations
5. **Backup considerations**: Keep secure backups of your passwords

## 🎨 Visual Indicators

- **Encrypted Content**: Displayed as `<!MASK-SMITH:...>` with a visual "🔒 Encrypted" badge
- **Hover Actions**: Interactive buttons appear when hovering over encrypted content
- **Status Messages**: Clear notifications for all operations (encryption, decryption, copying)

## 🛠️ Configuration

Currently, Mask Smith works out of the box with no configuration required. The extension automatically:
- Manages password storage securely
- Applies visual decorations to encrypted content
- Handles clipboard operations intelligently

## 📝 Supported File Types

- Plain Text files (`.txt`)
- Markdown files (`.md`)

## ⚠️ Important Notes

1. **Password Recovery**: There is no way to recover encrypted data if you forget your password. Keep your passwords safe!
2. **File Sharing**: When sharing files with encrypted content, recipients will need Mask Smith and the correct password to decrypt
3. **Version Control**: Encrypted content is safe to commit to version control as it appears as encoded text
4. **Performance**: Large amounts of encrypted content may impact editor performance

## 🐛 Troubleshooting

### Common Issues

**"Unsupported file type" error**
- Ensure you're working in a `.txt` or `.md` file
- Check that the file is properly saved with the correct extension

**"Password key mismatch" error**
- You're trying to decrypt with a different password than was used for encryption
- Enter the correct password that was used during encryption

**Encrypted content not displaying correctly**
- Ensure the encrypted content format hasn't been altered
- The format must be exactly: `<!MASK-SMITH:encrypted_data>`

**Copy to clipboard not working**
- Check VS Code has clipboard access permissions
- Try using the keyboard shortcut instead of the hover button

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Yarmu**

- GitHub: [@iceyarmu](https://github.com/iceyarmu)
- Repository: [mask-smith](https://github.com/iceyarmu/mask-smith)

## 🙏 Acknowledgments

- VS Code Extension API for providing secure storage capabilities
- The Web Crypto API for robust encryption support
- Z85 encoding for efficient binary-to-text encoding
- All contributors and users of this extension

## 📈 Changelog

### Version 0.0.5
- Added support for reusing previous passwords
- Improved password management with default key storage
- Enhanced user experience with password confirmation options
- Bug fixes and performance improvements

### Version 0.0.4
- Added smart copy functionality with automatic decryption
- Improved clipboard integration
- Enhanced error handling

### Version 0.0.3
- Added hover actions for encrypted content
- Improved visual indicators
- Performance optimizations

### Version 0.0.2
- Added multi-language support (English and Chinese)
- Enhanced security with verification after encryption
- Improved error messages

### Version 0.0.1
- Initial release
- Basic encryption/decryption functionality
- Context menu integration
- Keyboard shortcuts

---

<div align="center">
Made with ❤️ for developers who value security
</div>