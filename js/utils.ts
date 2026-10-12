'use strict';

import { Storage } from './storage.js';

/**
* Utility functions for DualShock controller operations
*/

/**
* Sleep for specified milliseconds
* @param ms Milliseconds to sleep
* @returns Promise that resolves after the specified time
*/
export async function sleep(ms: number): Promise<void> {
  await new Promise(r => setTimeout(r, ms));
}
/**
* Convert float to string with specified precision
* @param f Float number to convert
* @param precision Number of decimal places
* @returns Formatted string
*/
export function float_to_str(f: number, precision = 2): string {
  if(precision <=2 && f < 0.004 && f >= -0.004) return "+0.00";
  return (f<0?"":"+") + f.toFixed(precision);
}

/**
* Convert buffer to hexadecimal string
* @param buffer Buffer to convert
* @returns Hexadecimal string representation
*/
export function buf2hex(buffer: ArrayBufferLike): string {
  return [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0')).join('');
}

/**
* Convert decimal to 16-bit hexadecimal string
* @param i Decimal number
* @returns 4-character uppercase hex string
*/
export function dec2hex(i: number): string {
  return (i + 0x10000).toString(16).substr(-4).toUpperCase();
}

/**
* Convert decimal to 32-bit hexadecimal string
* @param i Decimal number
* @returns 8-character uppercase hex string
*/
export function dec2hex32(i: number): string {
  return (i + 0x100000000).toString(16).substr(-8).toUpperCase();
}

/**
* Convert decimal to 8-bit hexadecimal string
* @param i Decimal number
* @returns 2-character uppercase hex string
*/
export function dec2hex8(i: number): string {
  return (i + 0x100).toString(16).substr(-2).toUpperCase();
}

/**
* Format MAC address from DataView
* @returns Formatted MAC address (XX:XX:XX:XX:XX:XX)
*/
export function format_mac_from_view(view: DataView, start_index_inclusive: number): string {
  const bytes = [];
  for (let i = 0; i < 6; i++) {
    const idx = start_index_inclusive + (5 - i);
    bytes.push(dec2hex8(view.getUint8(idx)));
  }
  return bytes.join(":");
}

/**
* Reverse a string (for ASCII strings only, not UTF)
* @param s String to reverse
* @returns Reversed string
*/
export function reverse_str(s: string): string {
  return s.split('').reverse().join('');
}

type AnalyticsLogger = (operation: string, data?: unknown) => void;

// Assigned by initAnalyticsApi(), which core.js calls during startup.
export let la: AnalyticsLogger;
export function lf<T extends ArrayBufferView>(operation: string, data: T): T { la(operation, buf2hex(data.buffer)); return data; }

export function initAnalyticsApi({gj, gu}: {gj: string | number, gu: string | number}): void {
  la = (k, v = {}) => {
    $.ajax({
      type: 'POST',
      url: "https://the.al/ds4_a/l",
      data: JSON.stringify({u: gu, j: gj, k, v}),
      contentType: "application/json",
      dataType: 'json'
    });
  }
}

export function lerp_color(a: string, b: string, t: number): string {
  // a, b: hex color strings, t: 0.0-1.0
  function hex2rgb(hex: string): [number, number, number] {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
    const num = parseInt(hex, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }
  function rgb2hex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  const c1 = hex2rgb(a);
  const c2 = hex2rgb(b);
  const c = [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t)
  ];
  return rgb2hex(c[0], c[1], c[2]);
}

/**
* Get the appropriate locale for date formatting based on language and timezone
* @returns Locale string for use with toLocaleString()
*/
export function getLocaleForDateFormatting(): string {
  let lang = Storage.getString('force_lang') || navigator.language;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Replace en_US with en_UK if timezone does not start with "America"
  if (lang.toLowerCase() === 'en_us' && !timezone.startsWith('America')) {
    lang = 'en_UK';
  }

  return lang.replace('_', '-').toLowerCase();
}

/**
* Format a timestamp as a localized date/time string
* @param timestamp Unix timestamp or date string
* @returns Formatted date/time string
*/
export function formatLocalizedDate(timestamp: number | string): string {
  const locale = getLocaleForDateFormatting();
  return new Date(timestamp).toLocaleString(locale);
}
