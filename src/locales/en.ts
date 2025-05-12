export default {
    messages: {
        activation: 'mask-smith extension activated!',
        errors: {
            getDefaultKeyFailed: 'Failed to get default key:',
            getPasswordFailed: 'Failed to get password:',
            savePasswordFailed: 'Failed to save password.',
            passwordNotMatch: 'Passwords do not match.',
            noPassword: 'No password entered.',
            invalidPassword: 'Invalid password, cannot encrypt text.',
            encryptionFailed: 'Encryption failed, decrypted result does not match original text.',
            encryptionError: 'Encryption failed, please check password or text.',
            invalidPasswordDecrypt: 'Invalid password, cannot decrypt text.',
            decryptionFailed: 'Decryption failed, password may be incorrect.',
            decryptionError: 'Decryption failed, please check password or text.',
            setPasswordFailed: 'Failed to set password:',
            unsupportedFileType: 'Mask Smith extension only supports txt and markdown files',
            selectText: 'Please select text to encrypt',
            unsupportedVersion: 'Unsupported version, please update to the latest version.',
        },
        prompts: {
            enterPassword: 'Enter encryption password',
            confirmPassword: 'Re-enter password to confirm',
            useLassPassword: 'Do you want to use the last password for encryption?',
            confirm: 'Yes',
            cancel: 'No',
        },
        ui: {
            encrypted: '[🔐Encrypted]',
            copyToClipboard: '📋 Copy to Clipboard',
            copiedToClipboard: 'Copied to clipboard'
        }
    }
};