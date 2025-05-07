import * as vscode from 'vscode';

// 用于存储当前显示原文的装饰器
let currentDecoration: vscode.TextEditorDecorationType | undefined;

// Base64编码函数
function encodeText(text: string): string {
    return Buffer.from(text, 'utf8').toString('base64');
}

// Base64解码函数
function decodeText(encoded: string): string {
    return Buffer.from(encoded, 'base64').toString('utf8');
}

// 创建按钮装饰器
function createButtonDecoration(): vscode.TextEditorDecorationType {
    return vscode.window.createTextEditorDecorationType({
        after: {
            contentText: "🔐悬停查看",
            backgroundColor: new vscode.ThemeColor('button.background'),
            color: new vscode.ThemeColor('button.foreground'),
            margin: '0 0 0 3px',
            width: 'fit-content',
            height: '20px'
        },
        textDecoration: 'none; display: none;' // 隐藏原文本
    });
}

// 更新文档中所有加密文本的装饰器
function updateDecoration(editor: vscode.TextEditor) {
    // 移除之前的装饰器
    if (currentDecoration) {
        currentDecoration.dispose();
        currentDecoration = undefined;
    }

    const text = editor.document.getText();
    const regex = /<!MASK-SMITH:([^>]+)>/g;
    const ranges: vscode.Range[] = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
        const startPos = editor.document.positionAt(match.index);
        const endPos = editor.document.positionAt(match.index + match[0].length);
        ranges.push(new vscode.Range(startPos, endPos));
    }

    // 创建并应用按钮装饰器
    if (ranges.length > 0) {
        currentDecoration = createButtonDecoration();
        editor.setDecorations(currentDecoration, ranges);
    }
}

// 加密选中的文本
async function maskSelection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
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

// 处理加密文本的Hover显示
function provideMaskHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | null {
    const range = document.getWordRangeAtPosition(position, /<!MASK-SMITH:[^>]+>/);
    if (range) {
        const text = document.getText(range);
        const match = text.match(/<!MASK-SMITH:([^>]+)>/);
        if (match) {
            const encoded = match[1];
            const decoded = decodeText(encoded);
            return new vscode.Hover(decoded);
        }
    }
    return null;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('mask-smith插件已激活！');

    // 注册Mask Selection命令
    let disposable = vscode.commands.registerCommand('mask-smith.maskSelection', maskSelection);

    // 注册Hover Provider
    const hoverProvider = vscode.languages.registerHoverProvider('*', {
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
        if (editor) {
            updateDecoration(editor);
        }
    });

    context.subscriptions.push(disposable, hoverProvider, onActiveEditorChanged);
}

export function deactivate() {
    if (currentDecoration) {
        currentDecoration.dispose();
        currentDecoration = undefined;
    }
}
