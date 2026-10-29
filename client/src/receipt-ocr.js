// Receipt reference OCR, adapted to the Water POS scan flow.
// Images are processed in the cashier's browser; only saved payment submissions
// send the attached receipt image to the authenticated Laundry POS API.
const OCR_SCRIPT = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
let scriptPromise = null;
let workerPromise = null;
let scanQueue = Promise.resolve();

const labelExpressions = {
  GCASH: [
    /\b(?:transaction\s+)?ref(?:erence)?(?:erence)?\s*(?:no\.?|number|#|id)?\s*[:#-]?\s*/i,
    /\b(?:transaction|payment)\s+id\s*[:#-]?\s*/i,
  ],
  MAYA: [
    /\breference\s+id\s*[:#-]?\s*/i,
    /\breceipt\s+(?:no\.?|number)\s*[:#-]?\s*/i,
  ],
  MARIBANK: [
    /\btransaction\s+(?:reference|ref(?:erence)?|id)\s*(?:number|no\.?|#)?\s*[:#-]?\s*/i,
  ],
  GOTYME: [
    /\b(?:transfer|transaction)\s+reference\s*(?:no\.?|number|#)?\s*[:#-]?\s*/i,
  ],
  BPI: [
    /\btrace\s*(?:id|number|no\.?)\s*[:#-]?\s*/i,
    /\b(?:acknowledg(?:e)?ment|confirmation)\s*(?:no\.?|number|id)\s*[:#-]?\s*/i,
  ],
};
const shared = [
  /\b(?:transaction\s*)?ref(?:erence)?\s*(?:no\.?|number|#|id)?\s*[:#-]?\s*/i,
  /\b(?:transfer|transaction)\s*(?:number|no\.?|id)\s*[:#-]\s*/i,
];

function clean(value, provider) {
  const raw = String(value || "").toUpperCase().replace(/[^A-Z0-9-]/g,"").replace(/-+/g,"-").replace(/^-|-$/g,"");
  return provider === "GCASH" ? raw.replace(/\D/g,"") : raw;
}
function plausible(value, provider) {
  const length = value.length;
  if (length < 6 || length > (provider === "GCASH" ? 18 : 40)) return false;
  if (/^09\d{9}$/.test(value)) return false; // mobile number
  if (/^(?:20\d{2})(?:0[1-9]|1[0-2])(?:[0-3]\d)$/.test(value)) return false; // calendar date
  if (/^(?:000000+|111111+|999999+)$/.test(value)) return false;
  if (/^[A-Z]+$/.test(value)) return false; // "SUCCESSFUL", etc.
  return true;
}
function possibleValues(segment, provider) {
  const upper=String(segment||"").toUpperCase().split(/\s{3,}|[|,;]+/)[0];
  // Include grouped codes as used by Maya and some bank transfer receipts.
  const matches=upper.match(/[A-Z0-9]{2,20}(?:[ -][A-Z0-9]{2,20}){0,4}/g)||[];
  const values=[];
  for(const value of matches){
    const normalized=clean(value,provider);
    if(plausible(normalized,provider)) values.push(normalized);
  }
  return [...new Set(values)];
}
function score(value,provider){
  let weight=value.length;
  if (provider==="MAYA" && value.length===12) weight+=65;
  if (provider==="GCASH" && /^\d{9,13}$/.test(value)) weight+=30;
  if (/[A-Z]/.test(value)&&/\d/.test(value)) weight+=24;
  return weight;
}

/**
 * Extract only values adjacent to a recognizable Reference/Transaction label.
 * Do not guess from unrelated numeric amounts, phone numbers, or dates.
 */
export function extractPaymentReference(text, method = "GCASH", provider = "MAYA") {
  const selected = method === "GCASH" ? "GCASH" : String(provider || "MAYA").toUpperCase();
  const labels=[...(labelExpressions[selected] || []),...shared];
  const lines=String(text||"").replace(/\u00a0/g," ").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  for(let i=0;i<lines.length;i++){
    for(const expression of labels){
      const match=expression.exec(lines[i]);
      if(!match) continue;
      const suffix=lines[i].slice(match.index+match[0].length).replace(/^[\s:#.\-]+/,"").trim();
      const candidates = possibleValues(suffix,selected);
      if(candidates.length){
        candidates.sort((a,b)=>score(b,selected)-score(a,selected));
        return candidates[0];
      }
      // OCR commonly puts the value underneath its label, sometimes after one empty/heading line.
      for(let offset=1;offset<=2 && i+offset<lines.length;offset++){
        const next=lines[i+offset];
        if (/\b(?:amount|date|time|recipient|sender|total|fee|mobile)\b/i.test(next)) break;
        const below=possibleValues(next,selected);
        if(below.length){
          below.sort((a,b)=>score(b,selected)-score(a,selected));
          return below[0];
        }
      }
    }
  }
  return "";
}

function loadLibrary() {
  if (window.Tesseract?.createWorker) return Promise.resolve(window.Tesseract);
  if (!scriptPromise) {
    scriptPromise=new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src=OCR_SCRIPT;
      script.async=true;
      script.crossOrigin="anonymous";
      script.onload=()=>window.Tesseract?.createWorker ? resolve(window.Tesseract) : reject(new Error("OCR scanner failed to initialize."));
      script.onerror=()=>reject(new Error("Scanner library could not load. Check the internet connection."));
      document.head.append(script);
    }).catch(error=>{scriptPromise=null;throw error;});
  }
  return scriptPromise;
}
async function getWorker() {
  if(!workerPromise){
    workerPromise=loadLibrary().then(async lib=>{
      const worker=await lib.createWorker("eng",1);
      await worker.setParameters({tessedit_pageseg_mode:"11",preserve_interword_spaces:"1"});
      return worker;
    }).catch(error=>{workerPromise=null;throw error;});
  }
  return workerPromise;
}
async function renderForOcr(dataUrl, enhanced=false) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const max=enhanced?1450:1280;
  const scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const context=canvas.getContext("2d",{willReadFrequently:enhanced});
  if(!context) throw new Error("Image processing is unavailable on this device.");
  context.fillStyle="#fff";
  context.fillRect(0,0,canvas.width,canvas.height);
  context.filter=enhanced?"contrast(1.8) grayscale(1) brightness(1.15)":"contrast(1.12) grayscale(1)";
  context.drawImage(img,0,0,canvas.width,canvas.height);
  return canvas;
}

/** Tesseract worker is shared and scans are serialized to avoid overlapping camera captures. */
export function scanPaymentReference(dataUrl, method, provider, onProgress = () => {}) {
  const work=async()=>{
    const worker=await getWorker();
    onProgress("Reading reference from receipt…");
    const quick=await renderForOcr(dataUrl);
    const first=await worker.recognize(quick);
    let reference=extractPaymentReference(first.data?.text,method,provider);
    if(!reference){
      onProgress("Enhancing photo and checking the reference area…");
      const enhanced=await renderForOcr(dataUrl,true);
      const second=await worker.recognize(enhanced);
      reference=extractPaymentReference(second.data?.text,method,provider);
    }
    return reference;
  };
  const running=scanQueue.then(work,work);
  scanQueue=running.catch(()=>{});
  return running;
}
