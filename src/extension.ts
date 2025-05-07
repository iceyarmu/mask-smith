import * as vscode from 'vscode';

// 常量
const MASK_PATTERN = /<!MASK-SMITH:([^>]+)>/g;
const DEBOUNCE_DELAY = 300; // 防抖延迟（毫秒）
const SUPPORTED_LANGUAGES = ['plaintext', 'markdown']; // 支持的文件类型

// 用于存储当前显示原文的装饰器
let currentDecoration: vscode.TextEditorDecorationType | undefined;

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

// Base64编码函数
function encodeText(text: string): string {
    return Buffer.from(text, 'utf8').toString('base64');
}

// Base64解码函数
function decodeText(encoded: string): string {
    return Buffer.from(encoded, 'base64').toString('utf8');
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
    const encoded = encodeText(text);
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
    const decoded = decodeText(encoded);
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
