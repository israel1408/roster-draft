import { useEffect, useRef, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, BadgeCheck, Check, ChevronRight, Crown, Download, Flame, ImagePlus, LockKeyhole, MessageCircle, Plus, Share2, ShieldAlert, Sparkles, Star, Trash2, Upload, X } from 'lucide-react'
import { toPng } from 'html-to-image'

const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY
const MODEL_URL = 'https://openrouter.ai/api/v1/chat/completions'
const STORAGE_COUNT = 'profilescore_scan_count_v2'
const STORAGE_PAID = 'profilescore_is_paid'
const emptyReport = { overall_rating: 0, tier_label: 'Awaiting your scouting report', stats: { phto: 0, bio: 0, vibe: 0, delu: 0 }, traits: [], roast_quote: '', unlocked_report: { photo_fixes: [], rewritten_bios: [], opener_lines: [] } }
const fallbackReport = {
  overall_rating: 74,
  tier_label: 'Benchwarmer',
  stats: { phto: 65, bio: 40, vibe: 70, delu: 85 },
  traits: ['Solid First Impression', 'Bio Needs A Hook', 'Potential Starter'],
  roast_quote: 'Your photos made the roster, but your bio is giving the coach absolutely nothing to work with.',
  unlocked_report: {
    photo_fixes: ['Lead with a bright, face-forward photo where your eyes are visible.', 'Move your clearest full-body shot into the first three photos.', 'Replace dim indoor shots with natural window light.'],
    rewritten_bios: [
      'Part-time pasta critic, full-time plan maker. Pick a neighborhood and I will find us the good spot.',
      'Currently collecting passport stamps and oddly specific playlists. Looking for someone with a strong dessert opinion.',
      'I make a mean weekend breakfast and an aggressively detailed day trip itinerary. Your move: coffee or a bookstore date?',
    ],
    opener_lines: [
      'Your profile says you know the best coffee spot. What are you ordering for me?',
      'Important scouting question: ideal low-key Sunday, go.',
      'I need a ruling: is your favorite travel story actually your favorite, or just the best photo?',
      'You get the aux for the whole drive. What is the opening track?',
      'Settle a debate for me: dinner reservation or spontaneous food crawl?',
    ],
  },
}

function normalizeReport(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Report must be a JSON object.')
  const score = (value, fallback) => Number.isFinite(value) ? Math.max(0, Math.min(99, Math.round(value))) : fallback
  const stringList = (value, fallback) => Array.isArray(value) ? value.filter((item) => typeof item === 'string') : fallback
  const stats = data.stats && typeof data.stats === 'object' ? data.stats : {}
  const unlocked = data.unlocked_report && typeof data.unlocked_report === 'object' ? data.unlocked_report : {}
  return {
    overall_rating: score(data.overall_rating, fallbackReport.overall_rating),
    tier_label: typeof data.tier_label === 'string' ? data.tier_label : fallbackReport.tier_label,
    stats: {
      phto: score(stats.phto, fallbackReport.stats.phto),
      bio: score(stats.bio, fallbackReport.stats.bio),
      vibe: score(stats.vibe, fallbackReport.stats.vibe),
      delu: score(stats.delu, fallbackReport.stats.delu),
    },
    traits: stringList(data.traits, fallbackReport.traits),
    roast_quote: typeof data.roast_quote === 'string' ? data.roast_quote : fallbackReport.roast_quote,
    unlocked_report: {
      photo_fixes: stringList(unlocked.photo_fixes, fallbackReport.unlocked_report.photo_fixes),
      rewritten_bios: stringList(unlocked.rewritten_bios, fallbackReport.unlocked_report.rewritten_bios),
      opener_lines: stringList(unlocked.opener_lines, fallbackReport.unlocked_report.opener_lines),
    },
  }
}

const statInfo = [
  { key: 'phto', name: 'PHTO', label: 'Photo / visual quality' },
  { key: 'bio', name: 'BIO', label: 'Effort / hook strength' },
  { key: 'vibe', name: 'VIBE', label: 'Charm / interest' },
  { key: 'delu', name: 'DELU', label: 'Red flag risk', inverse: true },
]

function App() {
  const [images, setImages] = useState([])
  const [report, setReport] = useState(null)
  const [scanCount, setScanCount] = useState(() => Number(localStorage.getItem(STORAGE_COUNT) || 0))
  const [isPaid, setIsPaid] = useState(() => localStorage.getItem(STORAGE_PAID) === 'true')
  const [busy, setBusy] = useState(false)
  const [paywallOpen, setPaywallOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const cardRef = useRef(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(STORAGE_COUNT) === null) localStorage.setItem(STORAGE_COUNT, '0')
    if (localStorage.getItem(STORAGE_PAID) === null) localStorage.setItem(STORAGE_PAID, 'false')
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('paid') === 'true') {
      localStorage.setItem(STORAGE_PAID, 'true')
      setIsPaid(true)
      params.delete('paid')
      const query = params.toString()
      window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
      setToast('Full access unlocked. Welcome to the starting lineup.')
    }
  }, [])

  useEffect(() => {
    if (!toast) return undefined
    const timeout = window.setTimeout(() => setToast(''), 4200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const addImages = (files) => {
    setError('')
    const chosen = Array.from(files || []).filter((file) => file.type.startsWith('image/'))
    if (chosen.length !== files.length) setError('Only image files are supported. Upload profile screenshots or chat screenshots.')
    setImages((current) => {
      const remaining = Math.max(0, 3 - current.length)
      if (chosen.length > remaining) setError('Your scouting report supports up to 3 screenshots.')
      const additions = chosen.slice(0, remaining).map((file) => ({ file, url: URL.createObjectURL(file), id: `${file.name}-${file.lastModified}-${Math.random()}` }))
      return [...current, ...additions]
    })
  }

  const removeImage = (id) => setImages((current) => {
    const target = current.find((image) => image.id === id)
    if (target) URL.revokeObjectURL(target.url)
    return current.filter((image) => image.id !== id)
  })

  const scanProfile = async () => {
    setError('')
    if (scanCount >= 1 && !isPaid) { setPaywallOpen(true); return }
    if (images.length === 0) { setError('Add at least one screenshot to start your scouting report.'); return }
    const showReport = (nextReport) => {
      const nextCount = scanCount + 1
      setReport(nextReport)
      setScanCount(nextCount)
      try {
        localStorage.setItem(STORAGE_COUNT, String(nextCount))
      } catch (storageError) {
        console.warn('Could not persist the scan count.', storageError)
      }
      window.requestAnimationFrame(() => document.getElementById('report')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }

    setBusy(true)
    try {
      if (!API_KEY) throw new Error('OpenRouter API key is missing.')
      const imageParts = await Promise.all(images.map(async ({ file }) => ({
        type: 'image_url',
        image_url: { url: await readAsDataUrl(file) },
      })))
      const instructions = `You are ProfileScore AI, a sharp but playful dating profile and chat scout. Analyze the provided profile screenshots and/or text-thread screenshots. Be direct, specific, funny, and never cruel about protected traits or appearance. Return strictly valid raw JSON only, without markdown or code fences, matching this structure exactly: {"overall_rating":54,"tier_label":"Benchwarmer","stats":{"phto":42,"bio":35,"vibe":50,"delu":88},"traits":["Dry Bio","Mugshot Lighting","Unclear Intent"],"roast_quote":"One short, punchy sentence.","unlocked_report":{"photo_fixes":["Specific step-by-step photo fix"],"rewritten_bios":["Option 1...","Option 2...","Option 3..."],"opener_lines":["Line 1...","Line 2...","Line 3...","Line 4...","Line 5..."]}}. Use integer scores from 0 to 99. DELU measures red-flag risk, so higher is riskier. Give actionable, customized recommendations.`
      const response = await fetch(MODEL_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
          'X-Title': 'ProfileScore AI',
        },
        body: JSON.stringify({
          model: 'openrouter/free',
          messages: [{ role: 'user', content: [{ type: 'text', text: instructions }, ...imageParts] }],
          response_format: { type: 'json_object' },
          temperature: 0.8,
        }),
      })
      if (!response.ok) {
        const details = await response.json().catch(() => ({}))
        throw new Error(details.error?.message || `OpenRouter request failed (${response.status}). Check your API key and try again.`)
      }
      const payload = await response.json()
      const text = payload.choices?.[0]?.message?.content
      if (!text) throw new Error('OpenRouter returned an empty report. Please try another screenshot.')
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('OpenRouter did not return a valid report object. Please try again.')
      let parsed
      try {
        parsed = JSON.parse(jsonMatch[0])
      } catch {
        throw new Error('OpenRouter returned malformed report JSON. Please try again.')
      }
      showReport(normalizeReport(parsed))
    } catch (scanError) {
      console.warn('Profile scouting failed; showing the demo Player Card instead.', scanError)
      showReport(fallbackReport)
    } finally { setBusy(false) }
  }

  const resetReport = () => {
    setReport(null)
    setImages((current) => { current.forEach((image) => URL.revokeObjectURL(image.url)); return [] })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const captureCard = () => toPng(cardRef.current, { cacheBust: true, pixelRatio: 2 })

  const downloadCard = async () => {
    if (!cardRef.current) return
    setExporting(true)
    try {
      const dataUrl = await captureCard()
      const link = document.createElement('a')
      link.download = 'my-profile-score.png'
      link.href = dataUrl
      document.body.appendChild(link)
      link.click()
      link.remove()
      setToast('Player Card downloaded.')
    } catch (exportError) {
      console.warn('Could not export the Player Card.', exportError)
      setToast('Could not export the Player Card. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const shareCard = async () => {
    if (!cardRef.current) return
    setExporting(true)
    try {
      const dataUrl = await captureCard()
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], 'my-profile-score.png', { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: 'My ProfileScore Player Card' })
        return
      }
      if (navigator.share) {
        await navigator.share({ title: 'My ProfileScore Player Card', text: 'Check out my ProfileScore Player Card.', url: window.location.href })
        return
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(window.location.href)
        setToast('Player Card link copied.')
      } else {
        setToast('Sharing is not supported in this browser.')
      }
    } catch (shareError) {
      if (shareError.name !== 'AbortError') {
        console.warn('Could not share the Player Card.', shareError)
        setToast('Could not share the Player Card. Please try again.')
      }
    } finally {
      setExporting(false)
    }
  }

  return <main className="min-h-screen">
    <header className="topbar">
      <a className="brand" href="#top" aria-label="ProfileScore AI home"><span className="brand-mark"><Star size={17} fill="currentColor" /></span><span>PROFILE<span className="brand-accent">SCORE</span><small>AI SCOUTING DEPT.</small></span></a>
      <div className="top-actions"><span className="season-tag"><span /> SEASON 01 · OPEN TRYOUTS</span>{isPaid ? <span className="pro-tag"><Crown size={13} /> ALL-ACCESS</span> : <button className="header-upgrade" onClick={() => setPaywallOpen(true)}>Get full report <ArrowUpRight size={15} /></button>}</div>
    </header>
    {!API_KEY && <div className="api-banner"><ShieldAlert size={16} /><span><strong>Demo mode active.</strong> Add <code>VITE_OPENROUTER_API_KEY</code> to your <code>.env</code> file for live profile analysis; scans will still return a sample report.</span></div>}

    <section className="hero" id="top">
      <div className="hero-copy"><div className="eyebrow"><span className="eyebrow-line" /> THE DATING MARKET IS A SPORT</div><h1>Your profile.<br /><span>Scouted.</span></h1><p className="hero-deck">Get the honest film review your group chat won’t give you. Upload your profile, get rated, and find out what’s costing you matches.</p><div className="hero-meta"><div className="avatar-stack"><i>J</i><i>M</i><i>A</i><i>+</i></div><span><b>12,400+</b> profiles scouted this season</span></div></div>
      <div className="hero-visual" aria-label="ProfileScore player card preview"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="preview-card"><div className="preview-top"><span>SCOUT REPORT · 001</span><span className="live-dot">LIVE</span></div><div className="preview-player"><div className="preview-avatar"><span>?</span><div className="avatar-spark"><Sparkles size={16} /></div></div><div className="preview-name">YOUR<br />PROFILE</div><div className="overall-mini"><strong>?</strong><span>OVR</span></div></div><div className="preview-divider" /><div className="preview-stats"><span>PHTO <b>--</b></span><span>BIO <b>--</b></span><span>VIBE <b>--</b></span><span>DELU <b>--</b></span></div><div className="preview-bottom"><span><span className="rank-star">✦</span> UNRANKED PROSPECT</span><ArrowDownRight size={15} /></div></div><div className="float-note note-rating"><span className="note-icon"><Flame size={15} /></span><span>NO FLUFF.<br /><b>JUST THE FILM.</b></span></div><div className="visual-cross cross-a">+</div><div className="visual-cross cross-b">+</div></div>
    </section>

    <section className="content-wrap" id="scout">
      <div className="section-heading"><div><span className="section-index">01 / THE SCOUTING ROOM</span><h2>Submit your tape<span>.</span></h2></div><span className="limit-note"><ImagePlus size={14} /> UP TO 3 SCREENSHOTS</span></div>
      <div className="upload-layout"><div className="upload-column">
        <input ref={inputRef} className="file-input" type="file" accept="image/*" multiple onChange={(event) => { addImages(event.target.files); event.target.value = '' }} />
        {images.length === 0 ? <button className="dropzone" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addImages(event.dataTransfer.files) }}><span className="upload-mark"><Upload size={22} /></span><span className="drop-title">Drop your screenshots here</span><span className="drop-subtitle">Hinge, Tinder, Bumble or the chat receipts</span><span className="browse-button">Browse files <ChevronRight size={14} /></span><span className="file-types">PNG, JPG OR WEBP · MAX 3 IMAGES</span></button> : <div className="image-grid">{images.map((image, index) => <div className="image-tile" key={image.id}><img src={image.url} alt={`Profile screenshot ${index + 1}`} /><span className="image-index">TAPE 0{index + 1}</span><button aria-label={`Remove screenshot ${index + 1}`} className="remove-image" onClick={() => removeImage(image.id)}><X size={14} /></button></div>)}{images.length < 3 && <button className="add-tile" onClick={() => inputRef.current?.click()}><Plus size={20} /><span>ADD SCREENSHOT</span></button>}</div>}
        {error && <div className="error-message"><ShieldAlert size={15} />{error}</div>}<div className="privacy-note"><LockKeyhole size={13} /><span>Your screenshots are analyzed securely and not stored.</span></div>
      </div><aside className="scan-aside"><div className="scan-aside-head"><span className="scan-step">YOUR FIRST SCOUTING REPORT</span><span className="free-stamp">FREE</span></div><h3>Let's see what<br />the tape says.</h3><p>Our AI breaks down your photos, bio, energy, and any red-flag tendencies. No swiping required.</p><button className="scan-button" onClick={scanProfile} disabled={busy}>{busy ? <><span className="spinner" /> SCOUTING YOUR PROFILE</> : <>SCOUT MY PROFILE <ArrowUpRight size={17} /></>}</button><div className="scan-foot"><span><Check size={13} /> One free scan</span><span><Check size={13} /> Results in seconds</span></div></aside></div>
    </section>

    {report && <section className="content-wrap report-section" id="report"><div className="section-heading report-heading"><div><span className="section-index">02 / THE FILM REVIEW</span><h2>Your scouting report<span>.</span></h2></div><button className="text-button" onClick={resetReport}><Trash2 size={14} /> NEW SCAN</button></div><div className="report-grid">
      <div className="card-column"><div ref={cardRef} className="player-card"><div className="card-grain" /><div className="player-card-head"><span>PROFILE SCORE <b>AI</b></span><span>SCOUTED · #00{scanCount}</span></div><div className="player-center"><div className="rating-shield"><span>OVR</span><strong>{report.overall_rating}</strong><i /></div><div className="tier-copy"><span>CLASS OF 2026</span><h3>{report.tier_label}</h3><div className="position-pills"><span>STRIKER</span><span>PROFILE</span></div></div></div><div className="stat-list">{statInfo.map((stat) => <div className="stat-row" key={stat.key}><span className="stat-name">{stat.name}</span><div className="stat-track"><i className={stat.inverse ? 'risk' : ''} style={{ width: `${Math.max(0, Math.min(99, report.stats?.[stat.key] || 0))}%` }} /></div><strong>{report.stats?.[stat.key] ?? 0}</strong></div>)}</div><div className="traits-area"><span className="micro-label">SCOUT'S NOTES</span><div className="trait-list">{(report.traits || []).map((trait) => <span key={trait}><Sparkles size={11} />{trait}</span>)}</div></div><div className="roast-box"><span className="roast-label"><Flame size={13} /> THE FILM ROOM</span><p>“{report.roast_quote}”</p></div><div className="card-bottom"><span>PROFILE SCORE · PLAYER EDITION</span><span>NOT FOR RECRUITMENT</span></div><div className="card-watermark">ProfileScore.ai</div></div><div className="card-actions"><button className="card-action download-card" onClick={downloadCard} disabled={exporting}><Download size={15} />{exporting ? 'PREPARING CARD' : 'DOWNLOAD CARD'}</button><button className="card-action share-card" onClick={shareCard} disabled={exporting}><Share2 size={15} />SHARE</button></div></div>
      <div className="report-details"><div className="report-detail-head"><div><span className="section-index">THE COACH'S NOTES</span><h3>How to level up</h3></div><BadgeCheck size={23} /></div><div className={`unlock-content ${isPaid ? 'is-unlocked' : ''}`}>
        <div className="detail-block"><div className="detail-title"><span className="detail-icon photo-icon"><ImagePlus size={16} /></span><div><span>01 · CAMERA ROLL</span><h4>Photo order & lighting</h4></div></div><ul>{report.unlocked_report.photo_fixes.map((item, index) => <li key={`${index}-${item}`}><span className="list-number">0{index + 1}</span>{item}</li>)}</ul></div>
        <div className="detail-block"><div className="detail-title"><span className="detail-icon bio-icon"><Sparkles size={16} /></span><div><span>02 · BIO LAB</span><h4>Three bio rebuilds</h4></div></div><div className="bio-options">{report.unlocked_report.rewritten_bios.map((item, index) => <p key={`${index}-${item}`}><b>0{index + 1}</b>{item}</p>)}</div></div>
        <div className="detail-block"><div className="detail-title"><span className="detail-icon opener-icon"><MessageCircle size={16} /></span><div><span>03 · OPENING PLAYBOOK</span><h4>Opener vault</h4></div></div><ol>{report.unlocked_report.opener_lines.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ol></div>
        {!isPaid && <div className="blur-overlay"><div className="lock-disc"><LockKeyhole size={19} /></div><h4>Unlock your full rebuild</h4><p>Personalized photo fixes, bio options & openers.</p><button onClick={() => setPaywallOpen(true)}>UNLOCK FULL REPORT <ArrowUpRight size={15} /></button></div>}
      </div><div className="report-bottom"><span><Star size={13} /> Your report is yours. Use it wisely.</span><button onClick={resetReport}>RUN ANOTHER SCAN <ChevronRight size={13} /></button></div></div>
    </div></section>}

    <footer className="footer"><a className="brand footer-brand" href="#top"><span className="brand-mark"><Star size={15} fill="currentColor" /></span><span>PROFILE<span className="brand-accent">SCORE</span><small>AI SCOUTING DEPT.</small></span></a><span>THE GAME IS YOURS TO PLAY.</span><span>© 2026 PROFILESCORE AI</span></footer>
    {toast && <div className="toast"><span className="toast-check"><Check size={14} /></span>{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={14} /></button></div>}
    {paywallOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPaywallOpen(false) }}><section className="paywall-modal" role="dialog" aria-modal="true" aria-labelledby="paywall-title"><button className="modal-close" aria-label="Close" onClick={() => setPaywallOpen(false)}><X size={18} /></button><div className="modal-kicker"><Crown size={14} /> THE ALL-ACCESS PASS</div><div className="modal-icon"><Flame size={25} /></div><h2 id="paywall-title">One scan down.<br /><em>Now build your game.</em></h2><p className="modal-copy">Your full profile rebuild is ready. Unlock the exact fixes, sharper bios, and openers made for your profile.</p><div className="modal-perks"><span><Check size={14} /> Photo order & lighting breakdown</span><span><Check size={14} /> 3 custom, high-converting bios</span><span><Check size={14} /> 5 profile-matched openers</span><span><Check size={14} /> Unlimited scouting reports</span></div><button className="modal-cta" onClick={() => window.open('YOUR_WHOP_LINK_HERE', '_blank', 'noopener,noreferrer')}>Unlock Full Profile Rebuild &amp; 10x Matches 🚀 <ArrowUpRight size={17} /></button><span className="modal-disclaimer"><LockKeyhole size={11} /> Secure checkout · One-time access</span></section></div>}
  </main>
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error(`Could not read ${file.name}. Please try another image.`))
    reader.readAsDataURL(file)
  })
}

export default App