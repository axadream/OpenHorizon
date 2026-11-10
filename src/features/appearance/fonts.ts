/*
 * OpenDyslexic (SIL Open Font License 1.1, see node_modules/@fontsource/opendyslexic/LICENSE).
 * Only the latin subset and the 400 and 700 weights are imported. Vite bundles the woff2 files into
 * the build, so the service worker precache (glob **\/*.woff2) keeps them for offline use.
 * Imported once from useAppearanceSync; the browser downloads the face only when text uses it.
 */
import '@fontsource/opendyslexic/latin-400.css';
import '@fontsource/opendyslexic/latin-700.css';

export {};
