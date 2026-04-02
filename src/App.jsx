import React, { useState } from 'react';

// ─── Scoring weights for classification ──────────────────────────────────────
const scoreText = (ocrText) => {
  const t = ocrText.toUpperCase();
  let s1 = 0, s2 = 0;

  if (/(01200|0120|0080|9010)\d{4,}/.test(t)) s1 += 20;
  if (/SHG\s*MBK\s*ID/i.test(t))              s1 += 15;
  if (/MBK\s*ID/i.test(t))                    s1 += 10;
  if (/ANNEXURE/i.test(t))                     s1 += 8;
  ['అనుభందం', 'సభ్యుల స్థాయి', 'అప్పు రికవరీ'].forEach(k => {
    if (t.includes(k.toUpperCase())) s1 += 6;
  });
  ['సభ్యుల', 'అప్పు', 'లావాదేవీలు', 'SHG', 'MBK'].forEach(k => {
    if (t.includes(k.toUpperCase())) s1 += 1;
  });

  if (/VOA\s*సంతకం/i.test(t) || /VOA/i.test(t))        s2 += 15;
  if (/SHG\s*స్టాంప్/i.test(t) || /స్టాంప్/i.test(t))  s2 += 12;
  if (/రివాల్వింగ్/i.test(t))                            s2 += 10;
  if (/గత\s*నెల/i.test(t))                               s2 += 10;
  if (/బ్యాంక్\s*నిల్వ/i.test(t))                       s2 += 10;
  if (/అధర్/i.test(t))                                   s2 += 8;
  if (/డిపాజిట్/i.test(t))                               s2 += 6;
  if (/మొత్తం\s*రూ/i.test(t))                            s2 += 5;
  if (/ఆదాయాలు/i.test(t))                                s2 += 5;
  if (/జరిమానాలు/i.test(t))                              s2 += 5;
  if (/గౌరవేతనం/i.test(t))                               s2 += 5;
  if (/ఇతర\s*ఖర్చులు/i.test(t))                          s2 += 4;
  if (/ఆడిట్\s*ఫీజు/i.test(t))                           s2 += 4;
  if (/సభ్యుల\s*సంతకాలు/i.test(t))                       s2 += 8;
  ['సంఘం', 'లావాదేవీలు', 'నగదు', 'బ్యాంకు'].forEach(k => {
    if (t.includes(k.toUpperCase())) s2 += 1;
  });

  return { s1, s2 };
};

// Rotation scoring — Doc1 uses MBK ID pattern (original reference code)
//                  — Doc2 uses CUMULATIVE keyword hits so upright orientation
//                    always beats upside-down (more readable words = higher score)
const rotationScore = (cleanText, docType) => {
  let score = 0;
  if (docType === 'DOC1') {
    // Original reference code — unchanged
    if (/(01200|0120|0080|9010)\d+/.test(cleanText)) score += 2000;
    ["SHG", "MBK", "ID", "సంఘం", "తేదీ", "వివరములు", "ఆర్ధిక"].forEach(key => {
      if (cleanText.includes(key.toUpperCase())) score += 100;
    });
  } else {
    // Doc2: NO single dominant keyword — use many weighted signals so correct
    // orientation accumulates a clearly higher total than any wrong angle.
    // Top row of Doc2 (only readable right-side up):
    if (/సంఘం\s*ఫ్లాయి/.test(cleanText))            score += 800; // "సంఘం ఫ్లాయిలో జరిగిన"
    if (/ఫ్లాయి/.test(cleanText))                     score += 600;
    if (/జరిగిన\s*ఆర్థిక/.test(cleanText))           score += 600;
    if (/గత\s*నెల/.test(cleanText))                   score += 500; // right column header
    if (/బ్యాంక్\s*నిల్వ/.test(cleanText))            score += 500;
    if (/సంఘానికి\s*వచ్చిన/.test(cleanText))          score += 400; // left column rows
    if (/సంఘం\s*చెల్లించిన/.test(cleanText))          score += 400;
    if (/రివాల్వింగ్/.test(cleanText))                score += 300;
    if (/మొత్తం\s*రూ/.test(cleanText))               score += 200;
    if (/సభ్యుల\s*సంతకాలు/.test(cleanText))          score += 200;
    // Medium signals — each one adds up
    ["సంఘం", "లావాదేవీలు", "నగదు", "డిపాజిట్",
     "ఆదాయ", "VOA", "SHG", "మొత్తం", "బ్యాంకు",
     "చెల్లింపు", "వాటాధనం", "పాదుపు"].forEach(key => {
      if (cleanText.includes(key.toUpperCase())) score += 80;
    });
  }
  return score;
};

const DOC_TYPES = {
  DOC1: {
    id: 'DOC1', label: 'Document 1',
    sublabel: 'సభ్యుల ఆర్థిక లావాదేవీలు (Annexure - II)',
    description: 'Member Ledger with SHG MBK ID & loan details',
    color: '#1a73e8', lightColor: '#e8f0fe', icon: '📋',
    keywords: ['MBK ID', 'Annexure-II', 'అప్పు రికవరీ', 'సభ్యుల స్థాయిలో', 'అనుభందం'],
  },
  DOC2: {
    id: 'DOC2', label: 'Document 2',
    sublabel: 'సంఘం ఆర్థిక లావాదేవీలు (Financial Summary)',
    description: 'Group Financial Summary with income/expense & bank balance',
    color: '#188038', lightColor: '#e6f4ea', icon: '📊',
    keywords: ['VOA సంతకం', 'SHG స్టాంప్', 'రివాల్వింగ్ ఫండ్', 'గత నెల', 'బ్యాంక్ నిల్వలు'],
  },
};

const UploadPanel = ({ docType }) => {
  const [state, setState] = useState('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [images, setImages] = useState({ original: null, corrected: null });
  const cfg = DOC_TYPES[docType];

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const originalURL = URL.createObjectURL(file);
    setImages({ original: originalURL, corrected: null });
    setState('classifying');
    setStatusMsg('Reading document...');

    const img = new Image();
    img.src = originalURL;
    await new Promise(r => { img.onload = r; });

    const worker = await window.Tesseract.createWorker(['eng', 'tel']);

    try {
      // ── STEP 1: Classification — scan all 4 rotations ────────────────────
      const scanW = 1000;
      const sc = scanW / img.naturalWidth;
      const scanH = img.naturalHeight * sc;
      let totalS1 = 0, totalS2 = 0;

      for (let angle of [0, 90, 180, 270]) {
        setStatusMsg(`Classifying... ${angle}°`);
        const cv = document.createElement('canvas');
        const cx = cv.getContext('2d');
        if (angle === 90 || angle === 270) { cv.width = scanH; cv.height = scanW; }
        else { cv.width = scanW; cv.height = scanH; }
        cx.translate(cv.width / 2, cv.height / 2);
        cx.rotate((angle * Math.PI) / 180);
        cx.drawImage(img, -scanW / 2, -scanH / 2, scanW, scanH);

        const { data: { text } } = await worker.recognize(cv);
        const { s1, s2 } = scoreText(text);
        console.log(`[Classify ${angle}°] s1=${s1} s2=${s2}`);
        totalS1 = Math.max(totalS1, s1);
        totalS2 = Math.max(totalS2, s2);
        if (totalS1 >= 20 || totalS2 >= 20) break;
      }

      console.log(`[Classification] DOC1=${totalS1}  DOC2=${totalS2}`);
      const bothZero = totalS1 === 0 && totalS2 === 0;
      const detectedType = bothZero ? null : (totalS1 >= totalS2 ? 'DOC1' : 'DOC2');

      if (!detectedType) {
        setState('rejected');
        setStatusMsg('❌ Could not recognize this as a valid SHG document. Please upload a clearer image.');
        await worker.terminate(); return;
      }
      if (detectedType !== docType) {
        const w = DOC_TYPES[detectedType];
        setState('rejected');
        setStatusMsg(`❌ This looks like ${w.label} (${w.sublabel}). Please upload it in the ${w.label} slot.`);
        await worker.terminate(); return;
      }

      // ── STEP 2: Rotation — identical pipeline for both docs ───────────────
      setState('rotating');
      const results = [];
      const analysisWidth = 1600;
      const scale = analysisWidth / img.naturalWidth;

      for (let angle of [0, 90, 180, 270]) {
        setStatusMsg(`Analyzing ${angle}° orientation...`);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const w = analysisWidth;
        const h = img.naturalHeight * scale;

        if (angle === 90 || angle === 270) { canvas.width = h; canvas.height = w; }
        else { canvas.width = w; canvas.height = h; }

        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((angle * Math.PI) / 180);
        ctx.drawImage(img, -w / 2, -h / 2, w, h);

        // Binary threshold — Doc1: top 40% (header at top), Doc2: full height (header position varies)
        const cropH = docType === 'DOC1'
          ? Math.floor(canvas.height * 0.40)
          : canvas.height;
        const imageData = ctx.getImageData(0, 0, canvas.width, cropH);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const gray = 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
          const binary = gray > 140 ? 255 : 0;
          data[i] = data[i + 1] = data[i + 2] = binary;
        }
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = canvas.width;
        cropCanvas.height = cropH;
        cropCanvas.getContext('2d').putImageData(imageData, 0, 0);

        const { data: { text } } = await worker.recognize(cropCanvas);
        const cleanText = text.toUpperCase();

        // Doc-specific scoring + geometry bonus (same as reference code)
        let score = rotationScore(cleanText, docType);
        if (canvas.width > canvas.height) score += 50;

        console.log(`[Rotate ${docType} ${angle}°] score=${score}`);
        results.push({ score, angle });
      }

      const winner = results.sort((a, b) => b.score - a.score)[0];
      setStatusMsg('Finalizing High Quality Image...');

      // Output — exact same as original reference code
      const outCanvas = document.createElement('canvas');
      const outCtx = outCanvas.getContext('2d');
      if (winner.angle === 90 || winner.angle === 270) {
        outCanvas.width = img.naturalHeight;
        outCanvas.height = img.naturalWidth;
      } else {
        outCanvas.width = img.naturalWidth;
        outCanvas.height = img.naturalHeight;
      }
      outCtx.translate(outCanvas.width / 2, outCanvas.height / 2);
      outCtx.rotate((winner.angle * Math.PI) / 180);
      outCtx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

      const correctedURL = outCanvas.toDataURL('image/png');
      setImages({ original: originalURL, corrected: correctedURL });
      setState('done');
      setStatusMsg(`✅ Corrected at ${winner.angle}°`);

    } catch (err) {
      console.error(err);
      setState('rejected');
      setStatusMsg('⚠️ Processing failed. Try a clearer image.');
    } finally {
      await worker.terminate();
    }
  };

  const reset = () => { setState('idle'); setStatusMsg(''); setImages({ original: null, corrected: null }); };
  const busy = state === 'classifying' || state === 'rotating';

  return (
    <div style={{
      flex: 1, minWidth: 320,
      border: `2px solid ${state === 'rejected' ? '#d93025' : state === 'done' ? cfg.color : '#dadce0'}`,
      borderRadius: 16, overflow: 'hidden', background: '#fff',
      boxShadow: '0 2px 12px rgba(0,0,0,0.08)', transition: 'border-color 0.3s',
    }}>
      <div style={{ background: cfg.lightColor, borderBottom: `2px solid ${cfg.color}`, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 28 }}>{cfg.icon}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: cfg.color }}>{cfg.label}</div>
          <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{cfg.sublabel}</div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{cfg.description}</div>
        </div>
      </div>

      {state === 'idle' && (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <input type="file" id={`up-${docType}`} style={{ display: 'none' }} onChange={handleFile} accept="image/*" />
          <label htmlFor={`up-${docType}`} style={{ display: 'inline-block', background: cfg.color, color: '#fff', padding: '12px 28px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
            Upload {cfg.label}
          </label>
          <div style={{ marginTop: 16, padding: '12px 16px', background: cfg.lightColor, borderRadius: 8, fontSize: 12, color: '#444', textAlign: 'left' }}>
            <strong>✔ Detected by keywords:</strong>
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {cfg.keywords.map(k => (
                <span key={k} style={{ background: cfg.color, color: '#fff', padding: '2px 8px', borderRadius: 12, fontSize: 11 }}>{k}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {busy && (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, border: `4px solid ${cfg.lightColor}`, borderTop: `4px solid ${cfg.color}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ color: cfg.color, fontWeight: 600, fontSize: 14 }}>{statusMsg}</div>
          <div style={{ color: '#aaa', fontSize: 12, marginTop: 6 }}>
            {state === 'classifying' ? 'Verifying document type across all orientations...' : 'Running orientation correction...'}
          </div>
        </div>
      )}

      {state === 'rejected' && (
        <div style={{ padding: 24, textAlign: 'center' }}>
          {images.original && <img src={images.original} style={{ width: '100%', maxHeight: 180, objectFit: 'contain', opacity: 0.4, borderRadius: 8, marginBottom: 12 }} />}
          <div style={{ background: '#fce8e6', border: '1px solid #d93025', borderRadius: 8, padding: '12px 16px', color: '#c5221f', fontSize: 13, fontWeight: 500, marginBottom: 16 }}>
            {statusMsg}
          </div>
          <button onClick={reset} style={{ background: '#d93025', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            Try Again
          </button>
        </div>
      )}

      {state === 'done' && (
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 6, fontWeight: 600 }}>Original</div>
              <img src={images.original} style={{ width: '100%', borderRadius: 6, border: '1px solid #dadce0' }} />
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: cfg.color, marginBottom: 6, fontWeight: 600 }}>Corrected ✓</div>
              <img src={images.corrected} style={{ width: '100%', borderRadius: 6, border: `2px solid ${cfg.color}` }} />
            </div>
          </div>
          <div style={{ marginTop: 12, background: cfg.lightColor, borderRadius: 8, padding: '8px 12px', fontSize: 12, color: cfg.color, fontWeight: 600, textAlign: 'center' }}>
            {statusMsg}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <a href={images.corrected} download={`corrected_${docType}.png`} style={{ flex: 1, background: cfg.color, color: '#fff', padding: '9px 0', borderRadius: 8, textAlign: 'center', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>
              ⬇ Download
            </a>
            <button onClick={reset} style={{ flex: 1, background: '#f1f3f4', color: '#444', border: 'none', padding: '9px 0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              Upload New
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const SHGMBKFinal = () => (
  <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #f8f9fa 0%, #e8eaf6 100%)', fontFamily: 'Google Sans, Arial, sans-serif', padding: '24px 16px' }}>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    <div style={{ textAlign: 'center', marginBottom: 32 }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>🏦</div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1a1a2e' }}>SHG MBK Document Auto-Correction</h1>
      <p style={{ color: '#666', fontSize: 14, marginTop: 8 }}>Upload each document in its designated slot — wrong documents are automatically rejected</p>
      <div style={{ display: 'inline-flex', gap: 16, marginTop: 12, background: '#fff', padding: '10px 20px', borderRadius: 24, boxShadow: '0 1px 6px rgba(0,0,0,0.1)', fontSize: 12 }}>
        <span style={{ color: '#1a73e8', fontWeight: 600 }}>📋 Doc 1 = Member Ledger (Annexure II)</span>
        <span style={{ color: '#666' }}>|</span>
        <span style={{ color: '#188038', fontWeight: 600 }}>📊 Doc 2 = Financial Summary Sheet</span>
      </div>
    </div>
    <div style={{ display: 'flex', gap: 20, maxWidth: 1100, margin: '0 auto', flexWrap: 'wrap' }}>
      <UploadPanel docType="DOC1" />
      <UploadPanel docType="DOC2" />
    </div>
    <div style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: '#aaa' }}>
      All processing happens locally in your browser — no data is uploaded to any server
    </div>
  </div>
);

export default SHGMBKFinal;