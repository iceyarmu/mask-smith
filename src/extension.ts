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
        before: {
            contentText: "点击查看",
            backgroundColor: new vscode.ThemeColor('button.background'),
            color: new vscode.ThemeColor('button.foreground'),
            margin: '0 0 0 3px',
            width: 'fit-content',
            height: '20px'
        },
        textDecoration: 'none; display: none;' // 隐藏原文本
    });
}

// 创建原文显示装饰器
function createOriginalTextDecoration(text: string): vscode.TextEditorDecorationType {
    return vscode.window.createTextEditorDecorationType({
        before: {
            contentText: text,
            backgroundColor: new vscode.ThemeColor('editor.selectionBackground'),
            color: new vscode.ThemeColor('editor.foreground'),
            margin: '0 0 0 3px'
        },
        textDecoration: 'none; display: none;' // 隐藏加密文本
    });
}

export function activate(context: vscode.ExtensionContext) {
    console.log('mask-smith插件已激活！');

    // 注册Mask Selection命令
    let disposable = vscode.commands.registerCommand('mask-smith.maskSelection', async () => {
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
        const maskedText = `<!MASK-SMITH:${encoded}/>`;

        // 替换选中文本
        await editor.edit(editBuilder => {
            editBuilder.replace(selection, maskedText);
        });

        // 应用按钮装饰器
        updateDecoration(editor);
    });

    // 处理鼠标点击事件
    vscode.window.onDidChangeTextEditorSelection(event => {
        const editor = event.textEditor;
        const position = editor.selection.active;
        const line = editor.document.lineAt(position.line);
        const text = line.text;

        // 检查光标是否在加密文本上
        const regex = /<!MASK-SMITH:([^/>]+)\/>/;
        const match = regex.exec(text);
        if (match && isPositionInMatch(position, line, match)) {
            const encoded = match[1];
            const decoded = decodeText(encoded);

            // 移除之前的装饰器
            if (currentDecoration) {
                currentDecoration.dispose();
            }

            // 创建并应用原文显示装饰器
            currentDecoration = createOriginalTextDecoration(decoded);
            const range = new vscode.Range(
                position.line,
                text.indexOf(match[0]),
                position.line,
                text.indexOf(match[0]) + match[0].length
            );
            editor.setDecorations(currentDecoration, [range]);
        } else {
            // 当光标不在加密文本上时，更新装饰器
            updateDecoration(editor);
        }
    });

    context.subscriptions.push(disposable);
}

// 检查光标位置是否在匹配的文本范围内
function isPositionInMatch(position: vscode.Position, line: vscode.TextLine, match: RegExpExecArray): boolean {
    const startIndex = line.text.indexOf(match[0]);
    const endIndex = startIndex + match[0].length;
    return position.character >= startIndex && position.character <= endIndex;
}

// 更新文档中所有加密文本的装饰器
function updateDecoration(editor: vscode.TextEditor) {
    // 移除之前的装饰器
    if (currentDecoration) {
        currentDecoration.dispose();
    }

    const text = editor.document.getText();
    const regex = /<!MASK-SMITH:([^/>]+)\/>/g;
    const ranges: vscode.Range[] = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
        const startPos = editor.document.positionAt(match.index);
        const endPos = editor.document.positionAt(match.index + match[0].length);
        ranges.push(new vscode.Range(startPos, endPos));
    }

    // 创建并应用按钮装饰器
    currentDecoration = createButtonDecoration();
    editor.setDecorations(currentDecoration, ranges);
}

export function deactivate() {
    if (currentDecoration) {
        currentDecoration.dispose();
    }
}
