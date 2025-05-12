import en from './en';
import zhCN from './zh-CN';
import * as vscode from 'vscode';

type LocaleMessages = typeof en.messages;

const locales: { [key: string]: { messages: LocaleMessages } } = {
    'en': en,
    'zh-cn': zhCN
};

function getLocale(): string {
    // 获取VS Code显示语言
    const vsCodeLocale = vscode.env.language.toLowerCase();
    
    // 检查是否支持当前语言
    if (locales[vsCodeLocale]) {
        return vsCodeLocale;
    }
    
    // 回退到英文
    return 'en';
}

export function t(path: string): string {
    const locale = getLocale();
    const messages = locales[locale].messages;
    
    // 根据路径获取消息
    return path.split('.').reduce((obj: any, key: string) => obj && obj[key], messages) || '';
}

export function tp(path: string, params: { [key: string]: string }): string {
    let message = t(path);
    
    // 替换参数
    Object.entries(params).forEach(([key, value]) => {
        message = message.replace(`{${key}}`, value);
    });
    
    return message;
}