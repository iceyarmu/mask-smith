export default {
    messages: {
        activation: 'mask-smith插件已激活！',
        errors: {
            getDefaultKeyFailed: '获取默认Key失败:',
            getPasswordFailed: '获取密码失败:',
            savePasswordFailed: '保存密码失败。',
            passwordNotMatch: '两次输入的密码不一致。',
            noPassword: '未输入密码。',
            invalidPassword: '密码无效，无法加密文本。',
            encryptionFailed: '加密失败，解密结果与原文本不一致。',
            encryptionError: '加密失败，请检查密码或文本。',
            invalidPasswordDecrypt: '密码无效，无法解密文本。',
            decryptionFailed: '解密失败，密码可能不正确。',
            decryptionError: '解密失败，请检查密码或文本。',
            setPasswordFailed: '设置密码失败:',
            unsupportedFileType: 'Mask Smith 插件仅支持 txt 和 markdown 文件',
            selectText: '请先选择要加密的文本',
            unsupportedVersion: '不支持的版本，请更新到最新版本。',
        },
        prompts: {
            enterPassword: '请输入加密密码',
            confirmPassword: '请再次输入密码以确认'
        },
        ui: {
            encrypted: '[🔐已加密]',
            copyToClipboard: '📋 复制到剪贴板',
            copiedToClipboard: '已复制到剪贴板'
        }
    }
};