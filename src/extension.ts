import * as vscode from 'vscode';
import * as keytar from 'keytar';

// 常量
const MASK_PATTERN = /<!MASK-SMITH:([^>]+)>/g;
const DEBOUNCE_DELAY = 300; // 防抖延迟（毫秒）
const SUPPORTED_LANGUAGES = ['plaintext', 'markdown']; // 支持的文件类型
const SERVICE_NAME = 'mask-smith'; // 服务名称
const DEFAULT_KEY = 'default'; // 默认Key

// 用于存储当前显示原文的装饰器
let currentDecoration: vscode.TextEditorDecorationType | undefined;
// 存储当前Key
let currentKey: string | null = null;

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

// 获取默认Key
async function getDefaultKey(): Promise<string | null> {
    try {
        const defaultKey = currentKey || await keytar.getPassword(SERVICE_NAME, DEFAULT_KEY);
        return defaultKey;
    } catch (error) {
        console.error('获取默认Key失败:', error);
    }
    return null;
}

// 读取密码
async function readPassword(keyBase64: string): Promise<PasswordData> {
    try {
        const passwordBase64 = await keytar.getPassword(SERVICE_NAME, keyBase64);
        if (passwordBase64) {
            const keyBuffer = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0));
            const valueBuffer = Uint8Array.from(atob(passwordBase64), c => c.charCodeAt(0));
            return {
                keyBuffer,
                valueBuffer,
                keyBase64,
            };
        }
    } catch (error) {
        console.error('获取密码失败:', error);
    }
    return await inputPassword();
}

// 输入密码
async function inputPassword(): Promise<PasswordData> {
    const newPassword = await vscode.window.showInputBox({
        prompt: '请输入加密密码',
        password: true,
        ignoreFocusOut: true
    });
    if (newPassword) {
        const confirmPassword = await vscode.window.showInputBox({
            prompt: '请再次输入密码以确认',
            password: true,
            ignoreFocusOut: true
        });
        if (newPassword === confirmPassword) {
            const result = await savePassword(newPassword);
            if (result) {
                return result;
            } else {
                vscode.window.showErrorMessage('保存密码失败。');
            }
        } else {
            vscode.window.showErrorMessage('两次输入的密码不一致。');
        }
    } else {
        vscode.window.showErrorMessage('未输入密码。');
    }
    return null;
}

// 保存密码
async function savePassword(password: string): Promise<PasswordData> {
    try {
        const encoder = new TextEncoder();
        const passwordBuffer = encoder.encode(password);
        const valueBuffer = await crypto.subtle.digest('SHA-256', passwordBuffer);
        const keyBuffer = (await crypto.subtle.digest('SHA-256', valueBuffer)).slice(0, 4);
        const valueBase64 = btoa(String.fromCharCode(...new Uint8Array(valueBuffer)));
        const keyBase64 = btoa(String.fromCharCode(...new Uint8Array(keyBuffer)));
        await keytar.setPassword(SERVICE_NAME, keyBase64, valueBase64);
        await keytar.setPassword(SERVICE_NAME, DEFAULT_KEY, keyBase64);
        currentKey = keyBase64;
        return {
            keyBuffer,
            valueBuffer,
            keyBase64,
        };
    }
    catch (error) {
        console.error('设置密码失败:', error);
    }
    return null;
}

// 加密文本
async function encryptText(text: string): Promise<string | null> {
    try {
        const defaultKey = await getDefaultKey();
        const passwordData = defaultKey ? await readPassword(defaultKey) : await inputPassword();
        if (!passwordData) {
            vscode.window.showErrorMessage('密码无效，无法加密文本。');
            return null;
        }
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
        const encryptedBase64 = btoa(String.fromCharCode(
            ...new Uint8Array(passwordData.keyBuffer),
            ...new Uint8Array(hashBuffer),
            ...new Uint8Array(encryptedBuffer)
        ));
        return encryptedBase64;
    } catch (error) {
        console.error('加密失败:', error);
        vscode.window.showErrorMessage('加密失败，请检查密码或文本。');
    }
    return null;
}

// 解密文本
async function decryptText(encryptedBase64: string): Promise<string | null> {
    try {
        const encryptedBuffer = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
        const keyBuffer = encryptedBuffer.slice(0, 4);
        const hashBuffer = encryptedBuffer.slice(4, 16);
        const cipherText = encryptedBuffer.slice(16);
        const keyBase64 = btoa(String.fromCharCode(...keyBuffer));
        const passwordData = await readPassword(keyBase64) || await inputPassword();
        if (!passwordData || passwordData.keyBase64 !== keyBase64) {
            vscode.window.showErrorMessage('密码无效，无法解密文本。');
            return null;
        }
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
            vscode.window.showErrorMessage('解密失败，密码可能不正确。');
            return null;
        }
        const decoder = new TextDecoder();
        return decoder.decode(decryptedBuffer);
    } catch (error) {
        console.error('解密失败:', error);
        vscode.window.showErrorMessage('解密失败，请检查密码或文本。');
    }
    return null;
}

// 获取按钮装饰器（单例模式）
function getcurrentDecoration(): vscode.TextEditorDecorationType {
    if (!currentDecoration) {
        currentDecoration = vscode.window.createTextEditorDecorationType({
            after: {
                contentText: "[🔐 已加密]",
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

    const visibleRanges = editor.visibleRanges;
    const ranges: vscode.Range[] = [];

    // 仅扫描可见区域
    for (const visibleRange of visibleRanges) {
        const text = editor.document.getText(visibleRange);
        let match;
        while ((match = MASK_PATTERN.exec(text)) !== null) {
            const startPos = editor.document.positionAt(
                match.index + editor.document.offsetAt(visibleRange.start)
            );
            const endPos = editor.document.positionAt(
                match.index + match[0].length + editor.document.offsetAt(visibleRange.start)
            );
            ranges.push(new vscode.Range(startPos, endPos));
        }
        MASK_PATTERN.lastIndex = 0; // 重置正则表达式
    }

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
        vscode.window.showWarningMessage('Mask Smith 插件仅支持 txt 和 markdown 文件');
        return;
    }

    const selection = editor.selection;
    if (selection.isEmpty) {
        vscode.window.showWarningMessage('请先选择要加密的文本');
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
    vscode.window.showInformationMessage('已复制到剪贴板');
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
            
            mdString.appendMarkdown(`[📋 复制到剪贴板](command:mask-smith.copyContent?${encodeURIComponent(JSON.stringify(encoded))})`);
            
            return new vscode.Hover(mdString);
        }
    }
    return null;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('mask-smith插件已激活！');

    // 注册Mask Selection命令
    let disposable = vscode.commands.registerCommand('mask-smith.maskSelection', maskSelection);

    // 注册复制内容命令
    let copyCommand = vscode.commands.registerCommand('mask-smith.copyContent', copyDecodedContent);

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

    // 监听编辑器可见范围变化
    const onVisibleRangesChanged = vscode.window.onDidChangeTextEditorVisibleRanges(event => {
        if (event.textEditor === vscode.window.activeTextEditor &&
            SUPPORTED_LANGUAGES.includes(event.textEditor.document.languageId)) {
            debouncedUpdateDecoration(event.textEditor);
        }
    });

    context.subscriptions.push(
        disposable,
        hoverProvider,
        onActiveEditorChanged,
        copyCommand,
        onTextChanged,
        onVisibleRangesChanged
    );
}

export function deactivate() {
    if (currentDecoration) {
        currentDecoration.dispose();
        currentDecoration = undefined;
    }
}
