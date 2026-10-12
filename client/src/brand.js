const logoSvg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 192 192\">\n  <circle cx=\"96\" cy=\"96\" r=\"82\" fill=\"none\" stroke=\"#082F4F\" stroke-width=\"8\"/>\n  <circle cx=\"96\" cy=\"96\" r=\"72\" fill=\"none\" stroke=\"#159AA5\" stroke-width=\"3\"/>\n  <path d=\"M132 54 A52 52 0 1 0 132 138\" fill=\"none\" stroke=\"#082F4F\" stroke-width=\"10\" stroke-linecap=\"round\"/>\n  <path d=\"M78 72 V126 M112 72 V126 M62 99 H132\" fill=\"none\" stroke=\"#082F4F\" stroke-width=\"9\" stroke-linecap=\"round\"/>\n  <path d=\"M125 76 L129 84 L137 88 L129 92 L125 100 L121 92 L113 88 L121 84 Z\" fill=\"#159AA5\"/>\n  <path d=\"M84 112 C98 104 108 121 122 120 C132 120 140 115 148 108 C141 123 129 130 116 128 C102 126 94 114 84 112 Z\" fill=\"#159AA5\"/>\n</svg>";
const faviconSvg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 192 192\">\n  <rect width=\"192\" height=\"192\" rx=\"28\" fill=\"#fff\"/>\n  \n  <circle cx=\"96\" cy=\"96\" r=\"82\" fill=\"none\" stroke=\"#082F4F\" stroke-width=\"8\"/>\n  <circle cx=\"96\" cy=\"96\" r=\"72\" fill=\"none\" stroke=\"#159AA5\" stroke-width=\"3\"/>\n  <path d=\"M132 54 A52 52 0 1 0 132 138\" fill=\"none\" stroke=\"#082F4F\" stroke-width=\"10\" stroke-linecap=\"round\"/>\n  <path d=\"M78 72 V126 M112 72 V126 M62 99 H132\" fill=\"none\" stroke=\"#082F4F\" stroke-width=\"9\" stroke-linecap=\"round\"/>\n  <path d=\"M125 76 L129 84 L137 88 L129 92 L125 100 L121 92 L113 88 L121 84 Z\" fill=\"#159AA5\"/>\n  <path d=\"M84 112 C98 104 108 121 122 120 C132 120 140 115 148 108 C141 123 129 130 116 128 C102 126 94 114 84 112 Z\" fill=\"#159AA5\"/>\n\n</svg>";

export const OFFICIAL_LOGO =
  "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(logoSvg);

export const FAVICON_LOGO =
  "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(faviconSvg);

export function installBrandIcon() {
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = "image/svg+xml";
  link.href = FAVICON_LOGO;
}
