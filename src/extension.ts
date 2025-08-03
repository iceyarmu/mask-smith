import * as vscode from 'vscode';
import { t } from './locales';
import * as Z85 from './Z85';

// Constants
const MASK_PATTERN = /<!MASK-SMITH:([^>]+)>/g;
const DEBOUNCE_DELAY = 300; // Debounce delay in milliseconds
const SUPPORTED_LANGUAGES = ['plaintext', 'markdown'] as const;
const DEFAULT_KEY = 'default-key';
const ENCRYPTION_VERSION = 0x00;
const KEY_SIZE = 3; // Key buffer size in bytes
const IV_SIZE = 12; // Initialization vector size in bytes

// Global state
let currentDecoration: vscode.TextEditorDecorationType | undefined;
let currentKey: string | null = null;
let context: vscode.ExtensionContext;

// Singleton instances for better performance
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// Type definitions
interface PasswordData {
    keyBase64: string;
    keyBuffer: ArrayBuffer;
    valueBuffer: ArrayBuffer;
}

type PasswordDataOrNull = PasswordData | null;

// Custom error class for better error handling
class MaskSmithError extends Error {
    constructor(message: string, public readonly code: string) {
        super(message);
        this.name = 'MaskSmithError';
    }
}

// Utility function: Debounce implementation
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

// Utility function: Compare two ArrayBuffers for equality
function compareArrayBuffers(buf1: ArrayBuffer, buf2: ArrayBuffer): boolean {
    if (buf1.byteLength !== buf2.byteLength) {return false;}
  
    const view1 = new Uint8Array(buf1);
    const view2 = new Uint8Array(buf2);
  
    for (let i = 0; i < view1.length; i++) {
      if (view1[i] !== view2[i]) {return false;}
    }
  
    return true;
}

// Utility function: Clear sensitive data from memory
function clearSensitiveData(buffer: ArrayBuffer): void {
    try {
        const view = new Uint8Array(buffer);
        crypto.getRandomValues(view); // Overwrite with random data
        view.fill(0); // Then fill with zeros
    } catch (error) {
        // Best effort - some environments may not allow this
        console.debug('Could not clear sensitive data from memory');
    }
}

// Utility function: Enhanced encodeURIComponent for special characters
function fixedEncodeURIComponent(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*%]/g, function(c) {
    return '%' + c.charCodeAt(0).toString(16);
  });
}

// Utility function: Validate encrypted text format
function isValidEncryptedFormat(text: string): boolean {
    const match = text.match(/^<!MASK-SMITH:([^>]+)>$/);
    if (!match || !match[1]) {return false;}
    
    try {
        // Try to decode to validate format
        Z85.decode(match[1]);
        return true;
    } catch {
        return false;
    }
}

// Security: Read password from secure storage
async function readPassword(keyBase64: string): Promise<PasswordDataOrNull> {
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
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(t('errors.getPasswordFailed'), errorMessage);
        throw new MaskSmithError(t('errors.getPasswordFailed'), 'READ_PASSWORD_FAILED');
    }
    return null;
}

// Security: Handle password input and validation
async function inputPassword(checkKeyBase64: string | null): Promise<PasswordDataOrNull> {
    try {
        // Ask if user wants to use the last key
        if (!checkKeyBase64) {
            const defaultKey = await context.secrets.get(DEFAULT_KEY);
            if (defaultKey) {
                const lastPasswordData = await readPassword(defaultKey);
                if (lastPasswordData) {
                    const useLastPassword = await vscode.window.showInformationMessage(
                        t('prompts.useLastPassword'),
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

        // Enter password
        const password = await vscode.window.showInputBox({
            prompt: t('prompts.enterPassword'),
            password: true,
            ignoreFocusOut: true
        });

        // User cancelled input
        if (!password) {
            vscode.window.showErrorMessage(t('errors.noPassword'));
            return null;
        }
        
        const passwordBuffer = textEncoder.encode(password);
        const valueBuffer = await crypto.subtle.digest('SHA-256', passwordBuffer);
        const keyBuffer = (await crypto.subtle.digest('SHA-256', valueBuffer)).slice(0, KEY_SIZE);
        const keyBase64 = Z85.encode(keyBuffer);
        
        // Clear sensitive password buffer from memory
        clearSensitiveData(passwordBuffer);

        // Check if password matches
        if (checkKeyBase64 && checkKeyBase64 !== keyBase64) {
            vscode.window.showErrorMessage(t('errors.passwordKeyMismatch'));
            return null;
        }

        // If password already exists, no need to re-enter
        const passwordData = await readPassword(keyBase64);
        if (passwordData && compareArrayBuffers(passwordData.valueBuffer, valueBuffer)) {
            // Save as the last used key
            if (!checkKeyBase64) {
                await context.secrets.store(DEFAULT_KEY, keyBase64);
            }
            // Clear temporary buffers
            clearSensitiveData(valueBuffer);
            clearSensitiveData(keyBuffer);
            return passwordData;
        }

        // Confirm password
        if (!checkKeyBase64) {
            const confirmPassword = await vscode.window.showInputBox({
                prompt: t('prompts.confirmPassword'),
                password: true,
                ignoreFocusOut: true
            });
            if (password !== confirmPassword) {
                vscode.window.showErrorMessage(t('errors.passwordNotMatch'));
                // Clear sensitive buffers on error
                clearSensitiveData(valueBuffer);
                clearSensitiveData(keyBuffer);
                return null;
            }

            // Save as the last used key
            await context.secrets.store(DEFAULT_KEY, keyBase64);
        }

        // Save password
        const valueBase64 = Z85.encode(valueBuffer);
        await context.secrets.store(keyBase64, valueBase64);
        currentKey = keyBase64;
        return {
            keyBuffer,
            valueBuffer,
            keyBase64,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(t('errors.setPasswordFailed'), errorMessage);
        throw new MaskSmithError(t('errors.setPasswordFailed'), 'SET_PASSWORD_FAILED');
        return null;
    }
}

// Encryption: Encrypt text using AES-GCM
async function encryptText(text: string): Promise<string | null> {
    if (!text || text.length === 0) {
        vscode.window.showWarningMessage(t('errors.emptyText') || 'Cannot encrypt empty text');
        return null;
    }
    
    try {
        const passwordData = await inputPassword(null);
        if (!passwordData) {return null;}
        const textBuffer = textEncoder.encode(text);
        const hashBuffer = (await crypto.subtle.digest('SHA-256', textBuffer)).slice(0, IV_SIZE);
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
            [ENCRYPTION_VERSION],
            encryptedBuffer
        );
        // Verify encryption by decrypting
        const decryptedText = await decryptText(encryptedBase64);
        if (decryptedText !== text) {
            vscode.window.showErrorMessage(t('errors.encryptionFailed'));
            // Clear sensitive buffers on error
            clearSensitiveData(textBuffer);
            clearSensitiveData(hashBuffer);
            return null;
        }
        // Clear sensitive buffers after successful encryption
        clearSensitiveData(textBuffer);
        clearSensitiveData(hashBuffer);
        return encryptedBase64;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(t('errors.encryptionError'), errorMessage);
        
        if (error instanceof MaskSmithError) {
            vscode.window.showErrorMessage(error.message);
        } else {
            vscode.window.showErrorMessage(t('errors.encryptionError'));
        }
    }
    return null;
}

// Decryption: Decrypt text using AES-GCM
async function decryptText(encryptedBase64: string): Promise<string | null> {
    if (!encryptedBase64 || encryptedBase64.length === 0) {
        return null;
    }
    
    try {
        const encryptedBuffer = Z85.decode(encryptedBase64);
        const hashBuffer = encryptedBuffer.slice(0, IV_SIZE);
        const keyBuffer = encryptedBuffer.slice(IV_SIZE, IV_SIZE + KEY_SIZE);
        const versionBuffer = new Uint8Array(encryptedBuffer.slice(IV_SIZE + KEY_SIZE, IV_SIZE + KEY_SIZE + 1));
        if (versionBuffer[0] !== ENCRYPTION_VERSION) {
            vscode.window.showErrorMessage(t('errors.unsupportedVersion'));
            return null;
        }
        const cipherText = encryptedBuffer.slice(IV_SIZE + KEY_SIZE + 1);
        const keyBase64 = Z85.encode(keyBuffer);
        const passwordData = await readPassword(keyBase64) || await inputPassword(keyBase64);
        if (!passwordData) {return null;}
        const decryptKey = await crypto.subtle.importKey('raw', passwordData.valueBuffer, 'AES-GCM', false, ['decrypt']);
        const decryptedBuffer = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: hashBuffer,
            },
            decryptKey,
            cipherText
        );
        const decryptedHash = (await crypto.subtle.digest('SHA-256', decryptedBuffer)).slice(0, IV_SIZE);
        if (!compareArrayBuffers(decryptedHash, hashBuffer)) {
            vscode.window.showErrorMessage(t('errors.decryptionFailed'));
            // Clear sensitive buffer on error
            clearSensitiveData(decryptedBuffer);
            return null;
        }
        const result = textDecoder.decode(decryptedBuffer);
        // Clear sensitive buffer after use
        clearSensitiveData(decryptedBuffer);
        return result;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(t('errors.decryptionError'), errorMessage);
        
        if (error instanceof MaskSmithError) {
            vscode.window.showErrorMessage(error.message);
        } else if (error instanceof DOMException && error.name === 'OperationError') {
            vscode.window.showErrorMessage(t('errors.wrongPassword') || 'Incorrect password');
        } else {
            vscode.window.showErrorMessage(t('errors.decryptionError'));
        }
    }
    return null;
}

// UI: Get or create decoration for encrypted text (singleton pattern)
function getCurrentDecoration(): vscode.TextEditorDecorationType {
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
            textDecoration: 'none; display: none;' // Hide original text
        });
    }
    return currentDecoration;
}

// UI: Update decorations for encrypted text
function updateDecoration(editor: vscode.TextEditor): void {
    // Early return if editor is invalid
    if (!editor || !editor.document) {
        return;
    }

    const ranges: vscode.Range[] = [];
    const text = editor.document.getText();
    let match;

    // Scan entire document for encrypted patterns
    while ((match = MASK_PATTERN.exec(text)) !== null) {
        const startPos = editor.document.positionAt(match.index);
        const endPos = editor.document.positionAt(match.index + match[0].length);
        ranges.push(new vscode.Range(startPos, endPos));
    }
    MASK_PATTERN.lastIndex = 0; // Reset regex state

    // Reuse or create decoration
    const decoration = getCurrentDecoration();
    
    // Only update decorations when necessary
    if (ranges.length > 0) {
        editor.setDecorations(decoration, ranges);
    } else {
        editor.setDecorations(decoration, []);
    }
}

// UI: Debounced decoration update
const debouncedUpdateDecoration = debounce(updateDecoration, DEBOUNCE_DELAY);

// Command: Encrypt selected text
async function maskSelection(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    // Validate file type
    if (!SUPPORTED_LANGUAGES.includes(editor.document.languageId as typeof SUPPORTED_LANGUAGES[number])) {
        vscode.window.showWarningMessage(`${t('errors.unsupportedFileType')} (${editor.document.languageId})`);
        return;
    }

    const selection = editor.selection;
    if (selection.isEmpty) {
        vscode.window.showWarningMessage(t('errors.selectText'));
        return;
    }

    const text = editor.document.getText(selection);
    
    // Validate text length
    if (text.length > 10000) {
        const confirm = await vscode.window.showWarningMessage(
            t('warnings.largeText') || 'The selected text is very large. Encryption may take a while. Continue?',
            { modal: true },
            'Yes',
            'No'
        );
        if (confirm !== 'Yes') {return;}
    }
    
    const encoded = await encryptText(text);
    if (!encoded) {return;}
    const maskedText = `<!MASK-SMITH:${encoded}>`;

    // Replace selected text with encrypted version
    await editor.edit(editBuilder => {
        editBuilder.replace(selection, maskedText);
    });

    // Apply decoration
    updateDecoration(editor);
}

// Command: Copy decrypted content to clipboard
async function copyDecodedContent(encoded: string): Promise<void> {
    const decoded = await decryptText(encoded);
    if (!decoded) {return;}
    await vscode.env.clipboard.writeText(decoded);
    vscode.window.showInformationMessage(t('ui.copiedToClipboard'));
}

// UI: Provide hover information for encrypted text
function provideMaskHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | null {
    const range = document.getWordRangeAtPosition(position, /<!MASK-SMITH:[^>]+>/);
    if (range) {
        const text = document.getText(range);
        const match = text.match(/<!MASK-SMITH:([^>]+)>/);
        if (match) {
            const encoded = match[1];
            
            // Validate encrypted format
            if (!encoded || encoded.length === 0) {
                return null;
            }
            
            // Create Markdown content with copy button
            const mdString = new vscode.MarkdownString();
            mdString.isTrusted = true; // Allow command links
            mdString.supportHtml = true; // Allow HTML
            const md = `[${t('ui.copyToClipboard')}](command:mask-smith.copyContent?${fixedEncodeURIComponent(JSON.stringify(encoded))})`;
            mdString.appendMarkdown(md);
            
            return new vscode.Hover(mdString);
        }
    }
    return null;
}

// Command: Handle copy operation with automatic decryption
async function handleCopy(text: string): Promise<boolean> {
    if (!text || text.length === 0) {return false;}
    
    let decryptedText = text;
    let hasEncryptedContent = false;
    for (const match of text.matchAll(MASK_PATTERN)) {
        const encoded = match[1];
        if (encoded) {
            hasEncryptedContent = true;
            const decoded = await decryptText(encoded);
            if (decoded) {
                decryptedText = decryptedText.replace(match[0], decoded);
            }
        }
    }
    // Only write to clipboard if encrypted content was found
    if (hasEncryptedContent && decryptedText !== text) {
        await vscode.env.clipboard.writeText(decryptedText);
        vscode.window.showInformationMessage(t('ui.copiedToClipboard'));
        return true;
    }
    return false;
}

export function activate(_context: vscode.ExtensionContext) {
    context = _context;
    console.log(t('messages.activation') || 'Mask Smith extension activated');
    
    // Validate environment
    if (!crypto || !crypto.subtle) {
        vscode.window.showErrorMessage('Crypto API not available. This extension requires a secure context.');
        return;
    }
    
    // Register mask selection command
    let disposable = vscode.commands.registerCommand('mask-smith.maskSelection', maskSelection);

    // Register copy content command
    let copyCommand = vscode.commands.registerCommand('mask-smith.copyContent', copyDecodedContent);

    // Register enhanced copy command
    const copySubscription = vscode.commands.registerTextEditorCommand('mask-smith.copy', async (editor) => {
        const selection = editor.selection;
        if (!selection.isEmpty) {
            const text = editor.document.getText(selection);
            if (text && await handleCopy(text)) {return;}
        }
        await vscode.commands.executeCommand('editor.action.clipboardCopyAction');
    });

    // Register hover provider
    const hoverProvider = vscode.languages.registerHoverProvider(SUPPORTED_LANGUAGES, {
        provideHover(document, position) {
            return provideMaskHover(document, position);
        }
    });

    // Initialize decorations for current editor
    if (vscode.window.activeTextEditor) {
        updateDecoration(vscode.window.activeTextEditor);
    }

    // Listen for editor changes to update decorations
    const onActiveEditorChanged = vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && SUPPORTED_LANGUAGES.includes(editor.document.languageId as typeof SUPPORTED_LANGUAGES[number])) {
            updateDecoration(editor);
        }
    });

    // Listen for document changes with debounced decoration update
    const onTextChanged = vscode.workspace.onDidChangeTextDocument(event => {
        const editor = vscode.window.activeTextEditor;
        if (editor && event.document === editor.document &&
            SUPPORTED_LANGUAGES.includes(event.document.languageId as typeof SUPPORTED_LANGUAGES[number])) {
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
    // Clean up decorations
    if (currentDecoration) {
        currentDecoration.dispose();
        currentDecoration = undefined;
    }
    
    // Clear any cached key
    currentKey = null;
}

