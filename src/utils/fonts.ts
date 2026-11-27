import architectsWoff2Url from '@fontsource/architects-daughter/files/architects-daughter-latin-400-normal.woff2?url';
import jetbrainsWoff2Url from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2?url';

let cachedFontCssPromise: Promise<string> | null = null;

async function fetchAsBase64DataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return `data:font/woff2;base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

/**
 * Loads bundled WOFF2 fonts as embedded `@font-face` rules so standalone SVG exports
 * render identically offline and outside the app shell.
 */
export function getEmbeddedSvgFontStyle(): Promise<string> {
  if (!cachedFontCssPromise) {
    cachedFontCssPromise = (async () => {
      const [sketchData, monoData] = await Promise.all([
        fetchAsBase64DataUrl(architectsWoff2Url),
        fetchAsBase64DataUrl(jetbrainsWoff2Url),
      ]);

      const rules: string[] = [];
      if (sketchData) {
        rules.push(
          `@font-face{font-family:"Architects Daughter";font-style:normal;font-weight:400;src:url("${sketchData}") format("woff2");}`
        );
      }
      if (monoData) {
        rules.push(
          `@font-face{font-family:"JetBrains Mono";font-style:normal;font-weight:400;src:url("${monoData}") format("woff2");}`
        );
      }
      return rules.join('\n');
    })();
  }
  return cachedFontCssPromise;
}
