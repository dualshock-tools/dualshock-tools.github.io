'use strict';

/**
* Utility functions for DualShock controller operations
*/

/**
* Sleep for specified milliseconds
* @param {number} ms Milliseconds to sleep
* @returns {Promise} Promise that resolves after the specified time
*/
export async function sleep(ms) {
  await new Promise(r => setTimeout(r, ms));
}
/**
* Convert float to string with specified precision
* @param {number} f Float number to convert
* @param {number} precision Number of decimal places
* @returns {string} Formatted string
*/
export function float_to_str(f, precision = 2) {
  if(precision <=2 && f < 0.004 && f >= -0.004) return "+0.00";
  return (f<0?"":"+") + f.toFixed(precision);
}

/**
* Convert buffer to hexadecimal string
* @param {ArrayBuffer} buffer Buffer to convert
* @returns {string} Hexadecimal string representation
*/
export function buf2hex(buffer) {
  return [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0')).join('');
}

/**
* Convert decimal to 16-bit hexadecimal string
* @param {number} i Decimal number
* @returns {string} 4-character uppercase hex string
*/
export function dec2hex(i) {
  return (i + 0x10000).toString(16).substr(-4).toUpperCase();
}

/**
* Convert decimal to 32-bit hexadecimal string
* @param {number} i Decimal number
* @returns {string} 8-character uppercase hex string
*/
export function dec2hex32(i) {
  return (i + 0x100000000).toString(16).substr(-8).toUpperCase();
}

/**
* Convert decimal to 8-bit hexadecimal string
* @param {number} i Decimal number
* @returns {string} 2-character uppercase hex string
*/
export function dec2hex8(i) {
  return (i + 0x100).toString(16).substr(-2).toUpperCase();
}

/**
* Format MAC address from DataView
* @returns {string} Formatted MAC address (XX:XX:XX:XX:XX:XX)
*/
export function format_mac_from_view(view, start_index_inclusive) {
  const bytes = [];
  for (let i = 0; i < 6; i++) {
    const idx = start_index_inclusive + (5 - i);
    bytes.push(dec2hex8(view.getUint8(idx, false)));
  }
  return bytes.join(":");
}

/**
* Reverse a string (for ASCII strings only, not UTF)
* @param {string} s String to reverse
* @returns {string} Reversed string
*/
export function reverse_str(s) {
  return s.split('').reverse().join('');
}

export let la = undefined;
export function lf(operation, data) { la(operation, buf2hex(data.buffer)); return data; }

export function initAnalyticsApi({gj, gu}) {
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

export function lerp_color(a, b, t) {
  // a, b: hex color strings, t: 0.0-1.0
  function hex2rgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
    const num = parseInt(hex, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }
  function rgb2hex(r, g, b) {
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
* Create a cookie with specified name, value, and expiration days
* @param {string} name Cookie name
* @param {string} value Cookie value
* @param {number} days Number of days until expiration
*/
export function createCookie(name, value, days) {
  const expires = days ? "; expires=" + new Date(Date.now() + days * 24 * 60 * 60 * 1000).toGMTString() : "";
  document.cookie = encodeURIComponent(name) + "=" + encodeURIComponent(value) + expires + "; path=/";
}

/**
* Read a cookie value by name
* @param {string} name Cookie name
* @returns {string|null} Cookie value or null if not found
*/
export function readCookie(name) {
  const nameEQ = encodeURIComponent(name) + "=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ')
      c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0)
      return decodeURIComponent(c.substring(nameEQ.length, c.length));
  }
  return null;
}

/**
* Delete a cookie by setting its expiration to the past
* @param {string} name Cookie name to delete
*/
export function eraseCookie(name) {
  createCookie(name, "", -1);
}