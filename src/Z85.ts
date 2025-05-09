/*
 * Copyright (c) 2018-2020 the original author or authors.
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

declare function define(deps: any[], factory: () => any): void;
declare namespace define {
    const amd: boolean;
}

(function (root: any, factory: () => any) {
    if (typeof exports === 'object') {
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else {
        root.org = root.org || {};
        root.org.cometd = root.org.cometd || {};
        root.org.cometd.Z85 = factory();
    }
})(this, () => {
    const _z85EncodeTable: string[] = [
        '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
        'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j',
        'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't',
        'u', 'v', 'w', 'x', 'y', 'z', 'A', 'B', 'C', 'D',
        'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N',
        'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X',
        'Y', 'Z', '.', '-', ':', '+', '=', '^', '!', '/',
        '*', '?', '&', '<', '_', '(', ')', '[', ']', '{',
        '}', '@', '%', '$', '#'
    ];

    const _z85DecodeTable: number[] = [
        0x00, 0x44, 0x00, 0x54, 0x53, 0x52, 0x48, 0x00,
        0x4B, 0x4C, 0x46, 0x41, 0x00, 0x3F, 0x3E, 0x45,
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
        0x08, 0x09, 0x40, 0x00, 0x49, 0x42, 0x00, 0x47,
        0x51, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2A,
        0x2B, 0x2C, 0x2D, 0x2E, 0x2F, 0x30, 0x31, 0x32,
        0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A,
        0x3B, 0x3C, 0x3D, 0x4D, 0x00, 0x4E, 0x43, 0x4A,
        0x00, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10,
        0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
        0x19, 0x1A, 0x1B, 0x1C, 0x1D, 0x1E, 0x1F, 0x20,
        0x21, 0x22, 0x23, 0x4F, 0x00, 0x50, 0x00, 0x00
    ];

    return {
        encode: (...byteArrays: (ArrayBuffer | ArrayLike<number>)[]): string => {
            // 如果没有参数，返回空字符串
            if (byteArrays.length === 0) {
                return '';
            }

            // 将所有参数转换为Uint8Array并计算总长度
            const arrays: Uint8Array[] = [];
            let totalLength = 0;

            for (const bytes of byteArrays) {
                let buffer: ArrayBuffer;
                if (bytes instanceof ArrayBuffer) {
                    buffer = bytes;
                } else if ((bytes as any).buffer instanceof ArrayBuffer) {
                    buffer = (bytes as any).buffer;
                } else if (Array.isArray(bytes)) {
                    buffer = new Uint8Array(bytes).buffer;
                } else {
                    throw new Error('Cannot Z85 encode ' + bytes);
                }
                const array = new Uint8Array(buffer);
                arrays.push(array);
                totalLength += array.length;
            }

            // 创建合并后的buffer
            const buffer = new ArrayBuffer(totalLength);
            const mergedArray = new Uint8Array(buffer);
            let offset = 0;
            for (const array of arrays) {
                mergedArray.set(array, offset);
                offset += array.length;
            }

            const length = buffer.byteLength;
            const remainder = length % 4;
            const padding = 4 - (remainder === 0 ? 4 : remainder);
            const dataView = new DataView(buffer);
            let result = '';
            let value = 0;

            for (let i = 0; i < length + padding; ++i) {
                const isPadding = i >= length;
                value = value * 256 + (isPadding ? 0 : dataView.getUint8(i));
                if ((i + 1) % 4 === 0) {
                    let divisor = 85 * 85 * 85 * 85;
                    for (let j = 5; j > 0; --j) {
                        if (!isPadding || j > padding) {
                            const code = Math.floor(value / divisor) % 85;
                            result += _z85EncodeTable[code];
                        }
                        divisor /= 85;
                    }
                    value = 0;
                }
            }

            return result;
        },

        decode: (string: string): ArrayBuffer => {
            const remainder = string.length % 5;
            const padding = 5 - (remainder === 0 ? 5 : remainder);

            for (let p = 0; p < padding; ++p) {
                string += _z85EncodeTable[_z85EncodeTable.length - 1];
            }

            const length = string.length;
            const buffer = new ArrayBuffer((length * 4 / 5) - padding);
            const view = new DataView(buffer);
            let value = 0;
            let charIdx = 0;
            let byteIdx = 0;

            for (let i = 0; i < length; ++i) {
                const code = string.charCodeAt(charIdx++) - 32;
                value = value * 85 + _z85DecodeTable[code];
                if (charIdx % 5 === 0) {
                    let divisor = 256 * 256 * 256;
                    while (divisor >= 1) {
                        if (byteIdx < view.byteLength) {
                            view.setUint8(byteIdx++, Math.floor(value / divisor) % 256);
                        }
                        divisor /= 256;
                    }
                    value = 0;
                }
            }

            return buffer;
        }
    };
});
