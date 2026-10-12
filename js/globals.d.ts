// Globals provided by the page rather than by an import.

declare global {
  interface Window {
    /** Templates and SVGs inlined into index.html by the production build (see gulpfile.js). */
    BUNDLED_ASSETS?: {
      templates: Record<string, string>;
      svg: Record<string, string>;
    };
    /** Safari < 14.1 */
    webkitAudioContext?: typeof AudioContext;
  }
}

export {};
