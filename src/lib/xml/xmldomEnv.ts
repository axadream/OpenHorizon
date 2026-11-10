import { DOMParser as XmldomParser } from '@xmldom/xmldom';
import { ParseError, type XmlEnv } from './dom';

/**
 * XML environment backed by @xmldom/xmldom, for contexts without a native DOMParser
 * (the service worker, Node tests). Imported statically ONLY from `sw.ts` and tests so
 * xmldom never lands in the page bundle, and so the service worker bundle contains no
 * dynamic import (Vite's preload helper uses `import.meta`, which a classic worker rejects).
 */
export function createXmldomEnv(): XmlEnv {
  return {
    parse(text, mime) {
      const fatal: string[] = [];
      const doc = new XmldomParser({
        onError: (level: string, msg: string) => {
          if (level === 'fatalError' || (mime === 'text/xml' && level === 'error')) fatal.push(String(msg));
        },
      }).parseFromString(text, mime) as unknown as Document;
      if (mime === 'text/xml' && fatal.length > 0) throw new ParseError(fatal[0] ?? 'Invalid XML');
      return doc;
    },
  };
}
