import * as vscode from 'vscode';
import { t } from './locales';
import * as Z85 from './Z85';

// 常量
const MASK_PATTERN = /<!MASK-SMITH:([^>]+)>/g;
const DEBOUNCE_DELAY = 300; // 防抖延迟（毫秒）
const SUPPORTED_LANGUAGES = ['plaintext', 'markdown']; // 支持的文件类型
const DEFAULT_KEY = 'default-key'; // 默认Key

// 用于存储当前显示原文的装饰器
let currentDecoration: vscode.TextEditorDecorationType | undefined;
// 存储当前Key
let currentKey: string | null = null;
// VSCode扩展上下文
let context: vscode.ExtensionContext;

// 存储密码数据
type PasswordData = {
    keyBase64: string;
    keyBuffer: ArrayBuffer;
    valueBuffer: ArrayBuffer;
} | null;

// 防抖函数
function debounce<T extends (...args: any[]) => any>(
    func: T,
    delay: number
): (...args: Parameters<T>) => void {
    let timeoutId: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func(...args), delay);
    };
}

// 比较两个ArrayBuffer是否相等
function compareArrayBuffers(buf1: ArrayBuffer, buf2: ArrayBuffer): boolean {
    if (buf1.byteLength !== buf2.byteLength) return false;
  
    const view1 = new Uint8Array(buf1);
    const view2 = new Uint8Array(buf2);
  
    for (let i = 0; i < view1.length; i++) {
      if (view1[i] !== view2[i]) return false;
    }
  
    return true;
}

// 修复encodeURIComponent函数
function fixedEncodeURIComponent(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, function(c) {
    return '%' + c.charCodeAt(0).toString(16);
  });
}

// 从KeyChain中读取密码
async function readPassword(keyBase64: string): Promise<PasswordData> {
    try {
        const passwordBase64 = await context.secrets.get(keyBase64);
        if (passwordBase64) {
            const keyBuffer = Z85.decode(keyBase64);
            const valueBuffer = Z85.decode(passwordBase64);
            return {
                keyBuffer,
                valueBuffer,
                keyBase64,
            };
        }
    } catch (error) {
        console.error(t('errors.getPasswordFailed'), error);
    }
    return null;
}

// 输入密码
async function inputPassword(checkKeyBase64: string | null): Promise<PasswordData> {
    try {
        // 询问用户是否使用上次的Key
        if (!checkKeyBase64) {
            const defaultKey = await context.secrets.get(DEFAULT_KEY);
            if (defaultKey) {
                const lastPasswordData = await readPassword(defaultKey);
                if (lastPasswordData) {
                    const useLastPassword = await vscode.window.showInformationMessage(
                        t('prompts.useLassPassword'),
                        { modal: true },
                        { title: t('prompts.confirm'), isCloseAffordance: false },
                        { title: t('prompts.cancel'), isCloseAffordance: false }
                    );
                    if (useLastPassword && useLastPassword.title === t('prompts.confirm')) {
                        return lastPasswordData;
                    } else if (useLastPassword === undefined) {
                        return null;
                    }
                }
            }
        }

        // 输入密码
        const password = await vscode.window.showInputBox({
            prompt: t('prompts.enterPassword'),
            password: true,
            ignoreFocusOut: true
        });

        // 用户取消输入
        if (!password) {
            vscode.window.showErrorMessage(t('errors.noPassword'));
            return null;
        }
        
        const encoder = new TextEncoder();
        const passwordBuffer = encoder.encode(password);
        const valueBuffer = await crypto.subtle.digest('SHA-256', passwordBuffer);
        const keyBuffer = (await crypto.subtle.digest('SHA-256', valueBuffer)).slice(0, 3);
        const keyBase64 = Z85.encode(keyBuffer);

        // 检查密码是否一致
        if (checkKeyBase64 && checkKeyBase64 !== keyBase64) {
            vscode.window.showErrorMessage(t('errors.passwordKeyMismatch'));
            return null;
        }

        // 如果已经存过密码，则不用再输一次
        const passwordData = await readPassword(keyBase64);
        if (passwordData && compareArrayBuffers(passwordData.valueBuffer, valueBuffer)) {
            //保存成上次的Key
            if (!checkKeyBase64) {
                await context.secrets.store(DEFAULT_KEY, keyBase64);
            }
            return passwordData;
        }

        // 再次确认密码
        if (!checkKeyBase64) {
            const confirmPassword = await vscode.window.showInputBox({
                prompt: t('prompts.confirmPassword'),
                password: true,
                ignoreFocusOut: true
            });
            if (password !== confirmPassword) {
                vscode.window.showErrorMessage(t('errors.passwordNotMatch'));
                return null;
            }

            //保存成上次的Key
            await context.secrets.store(DEFAULT_KEY, keyBase64);
        }

        // 保存密码
        const valueBase64 = Z85.encode(valueBuffer);
        await context.secrets.store(keyBase64, valueBase64);
        currentKey = keyBase64;
        return {
            keyBuffer,
            valueBuffer,
            keyBase64,
        };
    } catch (error) {
        console.error(t('errors.setPasswordFailed'), error);
        return null;
    }
}

// 加密文本
async function encryptText(text: string): Promise<string | null> {
    try {
        const passwordData = await inputPassword(null);
        if (!passwordData) return null;
        const encoder = new TextEncoder();
        const textBuffer = encoder.encode(text);
        const hashBuffer = (await crypto.subtle.digest('SHA-256', textBuffer)).slice(0, 12);
        const encryptKey = await crypto.subtle.importKey('raw', passwordData.valueBuffer, 'AES-GCM', false, ['encrypt']);
        const encryptedBuffer = await crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: hashBuffer
            },
            encryptKey,
            textBuffer
        );
        const encryptedBase64 = Z85.encode(
            hashBuffer,
            passwordData.keyBuffer,
            [0x00],
            encryptedBuffer
        );
        // 验证解密
        const decryptedText = await decryptText(encryptedBase64);
        if (decryptedText !== text) {
            vscode.window.showErrorMessage(t('errors.encryptionFailed'));
            return null;
        }
        return encryptedBase64;
    } catch (error) {
        console.error(t('errors.encryptionError'), error);
        vscode.window.showErrorMessage(t('errors.encryptionError'));
    }
    return null;
}

// 解密文本
async function decryptText(encryptedBase64: string): Promise<string | null> {
    try {
        const encryptedBuffer = Z85.decode(encryptedBase64);
        const hashBuffer = encryptedBuffer.slice(0, 12);
        const keyBuffer = encryptedBuffer.slice(12, 15);
        const versionBuffer = new Uint8Array(encryptedBuffer.slice(15, 16));
        if (versionBuffer[0] !== 0x00) {
            vscode.window.showErrorMessage(t('errors.unsupportedVersiopn'));
            return null;
        }
        const cipherText = encryptedBuffer.slice(16);
        const keyBase64 = Z85.encode(keyBuffer);
        const passwordData = await readPassword(keyBase64) || await inputPassword(keyBase64);
        if (!passwordData) return null;
        const decryptKey = await crypto.subtle.importKey('raw', passwordData.valueBuffer, 'AES-GCM', false, ['decrypt']);
        const decryptedBuffer = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: hashBuffer,
            },
            decryptKey,
            cipherText
        );
        const decryptedHash = (await crypto.subtle.digest('SHA-256', decryptedBuffer)).slice(0, 12);
        if (!compareArrayBuffers(decryptedHash, hashBuffer)) {
            vscode.window.showErrorMessage(t('errors.decryptionFailed'));
            return null;
        }
        const decoder = new TextDecoder();
        return decoder.decode(decryptedBuffer);
    } catch (error) {
        console.error(t('errors.decryptionError'), error);
        vscode.window.showErrorMessage(t('errors.decryptionError'));
    }
    return null;
}

// 获取按钮装饰器（单例模式）
function getcurrentDecoration(): vscode.TextEditorDecorationType {
    if (!currentDecoration) {
        currentDecoration = vscode.window.createTextEditorDecorationType({
            after: {
                contentText: t('ui.encrypted'),
                backgroundColor: new vscode.ThemeColor('button.background'),
                color: new vscode.ThemeColor('button.foreground'),
                margin: '0 0 0 3px',
                width: 'fit-content',
                height: '20px'
            },
            textDecoration: 'none; display: none;' // 隐藏原文本
        });
    }
    return currentDecoration;
}

// 优化的装饰器更新函数
function updateDecoration(editor: vscode.TextEditor) {
    // 如果编辑器无效，直接返回
    if (!editor || !editor.document) {
        return;
    }

    const ranges: vscode.Range[] = [];
    const text = editor.document.getText();
    let match;

    // 扫描整个文档
    while ((match = MASK_PATTERN.exec(text)) !== null) {
        const startPos = editor.document.positionAt(match.index);
        const endPos = editor.document.positionAt(match.index + match[0].length);
        ranges.push(new vscode.Range(startPos, endPos));
    }
    MASK_PATTERN.lastIndex = 0; // 重置正则表达式

    // 复用或创建装饰器
    const decoration = getcurrentDecoration();
    
    // 仅当有变化时才更新装饰
    if (ranges.length > 0) {
        editor.setDecorations(decoration, ranges);
    } else {
        editor.setDecorations(decoration, []);
    }
}

// 防抖后的装饰器更新函数
const debouncedUpdateDecoration = debounce(updateDecoration, DEBOUNCE_DELAY);

// 加密选中的文本
async function maskSelection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    // 检查文件类型
    if (!SUPPORTED_LANGUAGES.includes(editor.document.languageId)) {
        vscode.window.showWarningMessage(`${t('errors.unsupportedFileType')} (${editor.document.languageId})`);
        return;
    }

    const selection = editor.selection;
    if (selection.isEmpty) {
        vscode.window.showWarningMessage(t('errors.selectText'));
        return;
    }

    const text = editor.document.getText(selection);
    const encoded = await encryptText(text);
    if (!encoded) return;
    const maskedText = `<!MASK-SMITH:${encoded}>`;

    // 替换选中文本
    await editor.edit(editBuilder => {
        editBuilder.replace(selection, maskedText);
    });

    // 应用按钮装饰器
    updateDecoration(editor);
}

// 复制解密内容到剪贴板
async function copyDecodedContent(encoded: string) {
    const decoded = await decryptText(encoded);
    if (!decoded) return;
    await vscode.env.clipboard.writeText(decoded);
    vscode.window.showInformationMessage(t('ui.copiedToClipboard'));
}

// 处理加密文本的Hover显示
function provideMaskHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | null {
    const range = document.getWordRangeAtPosition(position, /<!MASK-SMITH:[^>]+>/);
    if (range) {
        const text = document.getText(range);
        const match = text.match(/<!MASK-SMITH:([^>]+)>/);
        if (match) {
            const encoded = match[1];
            
            // 创建带有复制按钮的Markdown内容
            const mdString = new vscode.MarkdownString();
            mdString.isTrusted = true; // 允许命令链接
            mdString.supportHtml = true; // 允许HTML
            const md = `[${t('ui.copyToClipboard')}](command:mask-smith.copyContent?${fixedEncodeURIComponent(JSON.stringify(encoded))})`
            mdString.appendMarkdown(md);
            
            return new vscode.Hover(mdString);
        }
    }
    return null;
}

// 处理加密内容复制
async function handleCopy(text: string): Promise<boolean> {
    let decryptedText = text;
    for (const match of text.matchAll(MASK_PATTERN)) {
        const encoded = match[1];
        if (encoded) {
            const decoded = await decryptText(encoded);
            if (decoded) {
                decryptedText = decryptedText.replace(match[0], decoded);
            }
        }
    }
    // 只有在有加密内容时才写入剪贴板
    if (decryptedText !== text) {
        await vscode.env.clipboard.writeText(decryptedText);
        vscode.window.showInformationMessage(t('ui.copiedToClipboard'));
        return true;
    }
    return false;
}

export function activate(_context: vscode.ExtensionContext) {
    context = _context;
    console.log(t('messages.activation'));
    
    // 注册Mask Selection命令
    let disposable = vscode.commands.registerCommand('mask-smith.maskSelection', maskSelection);

    // 注册复制内容命令
    let copyCommand = vscode.commands.registerCommand('mask-smith.copyContent', copyDecodedContent);

    // 注册新的复制命令
    const copySubscription = vscode.commands.registerTextEditorCommand('mask-smith.copy', async (editor) => {
        const selection = editor.selection;
        if (!selection.isEmpty) {
            const text = editor.document.getText(selection);
            if (text && await handleCopy(text)) return;
        }
        await vscode.commands.executeCommand('editor.action.clipboardCopyAction');
    });

    // 注册Hover Provider
    const hoverProvider = vscode.languages.registerHoverProvider(SUPPORTED_LANGUAGES, {
        provideHover(document, position) {
            return provideMaskHover(document, position);
        }
    });

    // 初始化当前编辑器的装饰器
    if (vscode.window.activeTextEditor) {
        updateDecoration(vscode.window.activeTextEditor);
    }

    // 监听编辑器变化，更新装饰器
    const onActiveEditorChanged = vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && SUPPORTED_LANGUAGES.includes(editor.document.languageId)) {
            updateDecoration(editor);
        }
    });

    // 监听文档内容变化，使用防抖更新装饰器
    const onTextChanged = vscode.workspace.onDidChangeTextDocument(event => {
        const editor = vscode.window.activeTextEditor;
        if (editor && event.document === editor.document &&
            SUPPORTED_LANGUAGES.includes(event.document.languageId)) {
            debouncedUpdateDecoration(editor);
        }
    });

    context.subscriptions.push(
        disposable,
        hoverProvider,
        onActiveEditorChanged,
        copyCommand,
        onTextChanged,
        copySubscription
    );
}

export function deactivate() {
    if (currentDecoration) {
        currentDecoration.dispose();
        currentDecoration = undefined;
    }
}

