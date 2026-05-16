import { useState, useEffect, useRef } from "react";

// ── Theme ──────────────────────────────────────────────────────────────────
const C = {
  bg: "#0d0f1a",
  card: "rgba(255,255,255,0.04)",
  cardSolid: "#13162a",
  border: "rgba(255,255,255,0.08)",
  accent1: "#f97316",
  accent2: "#fb923c",
  accent3: "#fcd34d",
  muted: "rgba(255,255,255,0.4)",
  text: "#f1f0eb",
  green: "#4ade80",
};

const CATEGORIES = ["Top Stories", "Tech", "World", "Business", "Science"];
const VIBES = ["Motivated", "Calm", "Focused", "Inspired", "Resilient"];
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
const MINS = ["00", "15", "30", "45"];

const NVIDIA_API_KEY = import.meta.env.VITE_NVIDIA_API_KEY;
const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_MODEL = "nvidia/nemotron-super-49b-v1";

// ── Storage helpers ────────────────────────────────────────────────────────
const store = {
  get: (key) => { try { const v = localStorage.getItem(key); return v ? { value: v } : null; } catch { return null; } },
  set: (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} },
};

// ── Notification helper ────────────────────────────────────────────────────
const Notifs = {
  async request() {
    if (!("Notification" in window)) return "unsupported";
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    return await Notification.requestPermission();
  },
  permission() {
    if (!("Notification" in window)) return "unsupported";
    return Notification.permission;
  },
  schedule(title, body, atHour, atMin, ampm) {
    let h = parseInt(atHour);
    if (ampm === "PM" && h !== 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    const fire = new Date();
    fire.setHours(h, parseInt(atMin), 0, 0);
    if (fire <= new Date()) fire.setDate(fire.getDate() + 1);
    return setTimeout(() => {
      if (Notification.permission === "granted") {
        new Notification(title, { body, icon: "https://em-content.zobj.net/source/apple/391/sunrise_1f305.png" });
      }
    }, fire - new Date());
  },
};

// ── Weather helpers ────────────────────────────────────────────────────────
function decodeWeather(code) {
  if (code === 0)  return { icon: "☀️",  label: "Clear sky" };
  if (code <= 2)   return { icon: "🌤️", label: "Partly cloudy" };
  if (code === 3)  return { icon: "☁️",  label: "Overcast" };
  if (code <= 49)  return { icon: "🌫️", label: "Foggy" };
  if (code <= 57)  return { icon: "🌧️", label: "Drizzle" };
  if (code <= 67)  return { icon: "🌧️", label: "Rain" };
  if (code <= 77)  return { icon: "❄️",  label: "Snow" };
  if (code <= 82)  return { icon: "🌦️", label: "Rain showers" };
  if (code <= 86)  return { icon: "🌨️", label: "Snow showers" };
  if (code <= 99)  return { icon: "⛈️",  label: "Thunderstorm" };
  return { icon: "🌡️", label: "Unknown" };
}
function toF(c) { return Math.round(c * 9 / 5 + 32); }
function mph(ms) { return Math.round(ms * 2.237); }

async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode,windspeed_10m,apparent_temperature&daily=temperature_2m_max,temperature_2m_min&temperature_unit=celsius&windspeed_unit=ms&forecast_days=1&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Weather fetch failed");
  return res.json();
}

async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, { headers: { "Accept-Language": "en" } });
    const data = await res.json();
    return data.address?.city || data.address?.town || data.address?.village || "Your City";
  } catch { return "Your City"; }
}

// ── NVIDIA API helpers ─────────────────────────────────────────────────────
async function callNvidia(prompt, maxTokens = 1000) {
  const res = await fetch(NVIDIA_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${NVIDIA_API_KEY}`,
    },
    body: JSON.stringify({
      model: NVIDIA_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

async function fetchHeadlines(category) {
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const prompt = category === "Top Stories"
    ? `Today is ${today}. Give me the 3 most important global news headlines from today based on your knowledge. Return ONLY a JSON array, no markdown, no explanation. Format: [{"category":"World","headline":"..."},{"category":"Tech","headline":"..."},{"category":"Business","headline":"..."}]`
    : `Today is ${today}. Give me the 3 most important ${category} news headlines from today based on your knowledge. Return ONLY a JSON array, no markdown, no explanation. Format: [{"category":"${category}","headline":"..."},{"category":"${category}","headline":"..."},{"category":"${category}","headline":"..."}]`;
  const text = await callNvidia(prompt);
  const match = text.replace(/```json|```/gi, "").trim().match(/\[[\s\S]*\]/);
  if (!match) throw new Error("No JSON in response");
  return JSON.parse(match[0]);
}

async function fetchPersonalizedQuote(name, vibe) {
  const prompt = `Give me one short, powerful motivational quote perfectly suited for someone named ${name} who wants to feel ${vibe} today. Make it feel personal and genuine, not generic. Return ONLY valid JSON, no markdown, no explanation: {"quote":"...","author":"..."}`;
  const text = await callNvidia(prompt, 200);
  const match = text.replace(/```json|```/gi, "").trim().match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON");
  return JSON.parse(match[0]);
}

// ── Styles ─────────────────────────────────────────────────────────────────
const S = {
  onboardRoot: { minHeight: "100vh", background: `radial-gradient(ellipse at 30% 60%, rgba(249,115,22,0.15) 0%, transparent 60%), radial-gradient(ellipse at 80% 10%, rgba(252,211,77,0.08) 0%, transparent 50%), #0d0f1a`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", fontFamily: "'Georgia', 'Times New Roman', serif", color: C.text },
  onboardCard: { width: "100%", maxWidth: 400, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 24, padding: "36px 28px" },
  onboardStep: { fontSize: 10, letterSpacing: "0.3em", color: C.accent1, textTransform: "uppercase", fontFamily: "'Courier New', monospace", marginBottom: 8 },
  onboardTitle: { fontSize: 28, fontWeight: "normal", lineHeight: 1.2, color: C.text, margin: "0 0 8px" },
  onboardSub: { fontSize: 14, color: C.muted, marginBottom: 28, lineHeight: 1.5 },
  input: { width: "100%", background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", fontSize: 16, color: C.text, fontFamily: "'Georgia', serif", outline: "none", boxSizing: "border-box", marginBottom: 16 },
  vibeGrid: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 },
  vibeBtn: { padding: "8px 16px", borderRadius: 20, border: `1px solid ${C.border}`, background: "none", color: C.muted, fontSize: 13, cursor: "pointer", fontFamily: "'Georgia', serif", transition: "all 0.2s" },
  vibeBtnActive: { background: C.accent1, borderColor: C.accent1, color: "#0d0f1a", fontWeight: "bold" },
  nextBtn: { width: "100%", padding: "16px 0", background: `linear-gradient(135deg, ${C.accent1}, ${C.accent3})`, border: "none", borderRadius: 14, color: "#0d0f1a", fontSize: 14, fontFamily: "'Courier New', monospace", letterSpacing: "0.2em", textTransform: "uppercase", cursor: "pointer", fontWeight: "bold", marginTop: 8 },
  nextBtnDisabled: { opacity: 0.35, cursor: "not-allowed" },
  progressDots: { display: "flex", gap: 6, justifyContent: "center", marginTop: 24 },
  dot: { width: 6, height: 6, borderRadius: "50%", background: C.border },
  dotActive: { background: C.accent1 },
  root: { minHeight: "100vh", background: `radial-gradient(ellipse at 20% 50%, rgba(249,115,22,0.12) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(251,146,60,0.08) 0%, transparent 50%), ${C.bg}`, fontFamily: "'Georgia', 'Times New Roman', serif", color: C.text, display: "flex", flexDirection: "column", alignItems: "center", padding: "0 16px 40px", overflowX: "hidden" },
  topBar: { width: "100%", maxWidth: 420, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 0 8px" },
  timeSmall: { fontSize: 13, color: C.muted, letterSpacing: "0.1em", fontFamily: "'Courier New', monospace" },
  settingsBtn: { background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 20, padding: 4 },
  greeting: { width: "100%", maxWidth: 420, marginTop: 8, marginBottom: 28 },
  greetingLabel: { fontSize: 12, letterSpacing: "0.25em", color: C.accent1, textTransform: "uppercase", marginBottom: 6, fontFamily: "'Courier New', monospace" },
  greetingName: { fontSize: 36, fontWeight: "normal", lineHeight: 1.15, color: C.text, margin: 0 },
  greetingDate: { fontSize: 14, color: C.muted, marginTop: 6, fontFamily: "'Courier New', monospace" },
  card: { width: "100%", maxWidth: 420, background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: "20px 22px", marginBottom: 14, backdropFilter: "blur(12px)", position: "relative", overflow: "hidden" },
  cardAccentLine: { position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${C.accent1}, ${C.accent3}, transparent)`, borderRadius: "20px 20px 0 0" },
  cardLabel: { fontSize: 10, letterSpacing: "0.3em", color: C.accent2, textTransform: "uppercase", marginBottom: 12, fontFamily: "'Courier New', monospace" },
  cardLabelRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  cardLabelBtn: { fontSize: 10, color: C.accent1, background: "none", border: "none", cursor: "pointer", fontFamily: "'Courier New', monospace", letterSpacing: "0.1em" },
  weatherRow: { display: "flex", alignItems: "center", gap: 16 },
  weatherIcon: { fontSize: 52, lineHeight: 1 },
  weatherInfo: { flex: 1 },
  weatherTemp: { fontSize: 44, fontWeight: "normal", lineHeight: 1, color: C.text },
  weatherFeels: { fontSize: 12, color: C.muted, marginTop: 2, fontFamily: "'Courier New', monospace" },
  weatherDesc: { fontSize: 15, color: C.muted, marginTop: 4 },
  weatherCity: { fontSize: 12, color: C.accent2, marginTop: 4, fontFamily: "'Courier New', monospace", letterSpacing: "0.1em" },
  weatherExtras: { display: "flex", gap: 16, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` },
  weatherExtra: { flex: 1, textAlign: "center" },
  weatherExtraVal: { fontSize: 16, color: C.text },
  weatherExtraLabel: { fontSize: 10, color: C.muted, marginTop: 2, letterSpacing: "0.1em", fontFamily: "'Courier New', monospace", textTransform: "uppercase" },
  skeleton: { height: 16, borderRadius: 6, marginBottom: 8, background: "rgba(255,255,255,0.07)", animation: "pulse 1.5s ease-in-out infinite" },
  errorText: { fontSize: 13, color: C.muted, fontFamily: "'Courier New', monospace", lineHeight: 1.6 },
  retryBtn: { marginTop: 10, padding: "8px 16px", background: "none", border: `1px solid ${C.accent1}`, borderRadius: 8, color: C.accent1, cursor: "pointer", fontSize: 12, fontFamily: "'Courier New', monospace", letterSpacing: "0.1em" },
  taskItem: { display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 },
  taskCheck: { width: 24, height: 24, borderRadius: "50%", border: `1px solid ${C.border}`, background: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, fontSize: 12, color: C.accent3, marginTop: 2 },
  taskCheckDone: { background: C.accent1, borderColor: C.accent1, color: "#0d0f1a" },
  taskInput: { flex: 1, background: "transparent", border: "none", borderBottom: `1px solid ${C.border}`, color: C.text, fontSize: 15, fontFamily: "'Georgia', serif", padding: "2px 0", outline: "none", lineHeight: 1.4 },
  taskDoneText: { opacity: 0.35, textDecoration: "line-through" },
  quoteText: { fontSize: 17, lineHeight: 1.65, color: C.text, fontStyle: "italic", marginBottom: 10 },
  quoteAuthor: { fontSize: 12, color: C.accent2, letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "'Courier New', monospace" },
  quoteVibe: { fontSize: 9, color: C.muted, fontFamily: "'Courier New', monospace", marginTop: 10, letterSpacing: "0.1em" },
  tabRow: { display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" },
  tab: { padding: "5px 11px", borderRadius: 20, border: `1px solid ${C.border}`, background: "none", color: C.muted, fontSize: 11, fontFamily: "'Courier New', monospace", cursor: "pointer", letterSpacing: "0.08em", transition: "all 0.2s" },
  tabActive: { background: C.accent1, borderColor: C.accent1, color: "#0d0f1a", fontWeight: "bold" },
  headlineItem: { paddingBottom: 12, marginBottom: 12, borderBottom: `1px solid ${C.border}` },
  headlineCat: { fontSize: 9, letterSpacing: "0.25em", color: C.accent1, textTransform: "uppercase", fontFamily: "'Courier New', monospace", marginBottom: 5 },
  headlineText: { fontSize: 14, lineHeight: 1.55, color: C.text },
  aiTag: { fontSize: 9, color: C.muted, fontFamily: "'Courier New', monospace", marginTop: 14, textAlign: "right", letterSpacing: "0.1em" },
  readyBtn: { width: "100%", maxWidth: 420, marginTop: 10, padding: "18px 0", background: `linear-gradient(135deg, ${C.accent1}, ${C.accent3})`, border: "none", borderRadius: 16, color: "#0d0f1a", fontSize: 15, fontFamily: "'Courier New', monospace", letterSpacing: "0.2em", textTransform: "uppercase", cursor: "pointer", fontWeight: "bold" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" },
  sheet: { width: "100%", maxWidth: 480, background: "#0f1120", borderRadius: "24px 24px 0 0", padding: "28px 24px 40px", border: `1px solid ${C.border}` },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, background: C.border, margin: "0 auto 24px" },
  sheetTitle: { fontSize: 18, fontWeight: "normal", color: C.text, marginBottom: 4 },
  sheetSub: { fontSize: 12, color: C.muted, fontFamily: "'Courier New', monospace", marginBottom: 24 },
  settingRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: `1px solid ${C.border}` },
  settingLabel: { fontSize: 14, color: C.text },
  settingHint: { fontSize: 11, color: C.muted, marginTop: 2, fontFamily: "'Courier New', monospace" },
  toggle: { width: 44, height: 24, borderRadius: 12, cursor: "pointer", border: "none", transition: "background 0.2s", position: "relative", flexShrink: 0 },
  toggleKnob: { position: "absolute", top: 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s" },
  timeRow: { display: "flex", gap: 8, alignItems: "center", marginTop: 16 },
  timeSelect: { background: "rgba(255,255,255,0.07)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", color: C.text, fontSize: 16, fontFamily: "'Courier New', monospace", outline: "none", cursor: "pointer" },
  permBadge: { display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 20, fontSize: 11, fontFamily: "'Courier New', monospace", marginTop: 12 },
  saveBtn: { width: "100%", marginTop: 24, padding: "15px 0", background: `linear-gradient(135deg, ${C.accent1}, ${C.accent3})`, border: "none", borderRadius: 14, color: "#0d0f1a", fontSize: 14, fontFamily: "'Courier New', monospace", letterSpacing: "0.2em", textTransform: "uppercase", cursor: "pointer", fontWeight: "bold" },
  dangerBtn: { width: "100%", marginTop: 10, padding: "13px 0", background: "none", border: `1px solid rgba(255,100,100,0.3)`, borderRadius: 14, color: "rgba(255,100,100,0.7)", fontSize: 13, fontFamily: "'Courier New', monospace", letterSpacing: "0.15em", cursor: "pointer" },
};

// ── Hooks ──────────────────────────────────────────────────────────────────
function useTime() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return now;
}

function useWeather() {
  const [state, setState] = useState({ status: "idle", data: null, error: null });
  async function load() {
    setState({ status: "loading", data: null, error: null });
    try {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000 }));
      const { latitude: lat, longitude: lon } = pos.coords;
      const [wx, city] = await Promise.all([fetchWeather(lat, lon), reverseGeocode(lat, lon)]);
      const cur = wx.current; const daily = wx.daily;
      const { icon, label } = decodeWeather(cur.weathercode);
      setState({ status: "ok", data: { city, icon, temp: `${toF(cur.temperature_2m)}°`, feels: `Feels like ${toF(cur.apparent_temperature)}°`, desc: label, high: `${toF(daily.temperature_2m_max[0])}°`, low: `${toF(daily.temperature_2m_min[0])}°`, wind: `${mph(cur.windspeed_10m)} mph` }, error: null });
    } catch (err) {
      setState({ status: "error", data: null, error: err.code !== undefined ? "Location access denied." : "Couldn't load weather." });
    }
  }
  useEffect(() => { load(); }, []);
  return { ...state, retry: load };
}

function useNews(category) {
  const [cache, setCache] = useState({});
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  useEffect(() => {
    if (cache[category]) return;
    setStatus("loading"); setError(null);
    fetchHeadlines(category)
      .then(items => { setCache(prev => ({ ...prev, [category]: items })); setStatus("ok"); })
      .catch(e => { setError(e.message); setStatus("error"); });
  }, [category]);
  return { status: cache[category] ? "ok" : status, headlines: cache[category] || [], error, retry: () => { setCache(prev => { const n = { ...prev }; delete n[category]; return n; }); setStatus("idle"); } };
}

function useQuote(name, vibe) {
  const [state, setState] = useState({ status: "idle", data: null });
  useEffect(() => {
    if (!name || !vibe) return;
    setState({ status: "loading", data: null });
    fetchPersonalizedQuote(name, vibe)
      .then(data => setState({ status: "ok", data }))
      .catch(() => setState({ status: "error", data: null }));
  }, [name, vibe]);
  return state;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function formatTime(d) { return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }); }
function formatDate(d) { return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }); }
function getGreeting(d) { const h = d.getHours(); if (h < 12) return "Good morning"; if (h < 17) return "Good afternoon"; return "Good evening"; }

function FadeIn({ delay = 0, children }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), delay); return () => clearTimeout(t); }, [delay]);
  return <div style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(16px)", transition: "opacity 0.5s ease, transform 0.5s ease" }}>{children}</div>;
}

// ── Onboarding ─────────────────────────────────────────────────────────────
function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [vibe, setVibe] = useState("");
  const [tasks, setTasks] = useState(["", "", ""]);

  const steps = [
    { title: "Welcome.", sub: "Let's personalize your morning brief. What's your name?", content: <input style={S.input} placeholder="Your first name" value={name} onChange={e => setName(e.target.value)} autoFocus />, canNext: name.trim().length > 0 },
    { title: `Nice to meet you, ${name || "you"}.`, sub: "How do you want to feel today?", content: <div style={S.vibeGrid}>{VIBES.map(v => <button key={v} style={{ ...S.vibeBtn, ...(vibe === v ? S.vibeBtnActive : {}) }} onClick={() => setVibe(v)}>{v}</button>)}</div>, canNext: vibe.length > 0 },
    { title: "Set your focus.", sub: "What are your top 3 things to get done today?", content: <div>{tasks.map((t, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}><div style={{ width: 24, height: 24, borderRadius: "50%", border: `1px solid ${C.accent1}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: C.accent1, flexShrink: 0, fontFamily: "'Courier New', monospace" }}>{i + 1}</div><input style={{ ...S.input, marginBottom: 0 }} placeholder={`Task ${i + 1}…`} value={t} onChange={e => setTasks(prev => prev.map((x, j) => j === i ? e.target.value : x))} /></div>)}</div>, canNext: tasks.some(t => t.trim().length > 0) },
  ];

  async function handleNext() {
    if (step < steps.length - 1) { setStep(s => s + 1); return; }
    const profile = { name: name.trim(), vibe, tasks: tasks.filter(t => t.trim()).map((text, i) => ({ id: i + 1, text, done: false })) };
    store.set("mb_profile", profile);
    onComplete(profile);
  }

  const cur = steps[step];
  return (
    <div style={S.onboardRoot}>
      <div style={S.onboardCard}>
        <div style={S.onboardStep}>Step {step + 1} of {steps.length}</div>
        <h1 style={S.onboardTitle}>{cur.title}</h1>
        <p style={S.onboardSub}>{cur.sub}</p>
        {cur.content}
        <button style={{ ...S.nextBtn, ...(cur.canNext ? {} : S.nextBtnDisabled) }} onClick={cur.canNext ? handleNext : undefined}>
          {step < steps.length - 1 ? "Continue →" : "Build My Brief →"}
        </button>
        <div style={S.progressDots}>{steps.map((_, i) => <div key={i} style={{ ...S.dot, ...(i === step ? S.dotActive : i < step ? { background: C.accent2 } : {}) }} />)}</div>
      </div>
    </div>
  );
}

// ── Settings Panel ─────────────────────────────────────────────────────────
function SettingsPanel({ profile, notifSettings, onSave, onReset, onClose }) {
  const [enabled, setEnabled] = useState(notifSettings.enabled);
  const [hour, setHour] = useState(notifSettings.hour);
  const [min, setMin] = useState(notifSettings.min);
  const [ampm, setAmpm] = useState(notifSettings.ampm);
  const [permission, setPermission] = useState(Notifs.permission());
  const timerRef = useRef(null);

  async function handleToggle() {
    if (!enabled) {
      const result = await Notifs.request();
      setPermission(result);
      if (result === "granted") setEnabled(true);
    } else { setEnabled(false); }
  }

  function handleSave() {
    if (timerRef.current) clearTimeout(timerRef.current);
    const settings = { enabled, hour, min, ampm };
    if (enabled && permission === "granted") {
      timerRef.current = Notifs.schedule(`🌅 Good morning, ${profile.name}!`, "Your Morning Brief is ready — tap to start your day.", hour, min, ampm);
    }
    onSave(settings);
    onClose();
  }

  const permColor = permission === "granted" ? C.green : permission === "denied" ? "#f87171" : C.muted;
  const permLabel = permission === "granted" ? "✓ Allowed" : permission === "denied" ? "✗ Blocked — allow in browser settings" : "Not yet requested";

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.sheet}>
        <div style={S.sheetHandle} />
        <div style={S.sheetTitle}>Settings</div>
        <div style={S.sheetSub}>Notifications · Profile</div>
        <div style={S.settingRow}>
          <div>
            <div style={S.settingLabel}>Morning Notification</div>
            <div style={S.settingHint}>Wake-up reminder to open your brief</div>
            <div style={{ ...S.permBadge, background: `${permColor}18`, color: permColor }}>{permLabel}</div>
          </div>
          <div style={{ ...S.toggle, background: enabled && permission === "granted" ? C.accent1 : "rgba(255,255,255,0.1)" }} onClick={handleToggle}>
            <div style={{ ...S.toggleKnob, left: enabled && permission === "granted" ? 22 : 2 }} />
          </div>
        </div>
        {enabled && permission === "granted" && (
          <div>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: "'Courier New', monospace", marginTop: 14, marginBottom: 6, letterSpacing: "0.1em" }}>NOTIFY ME AT</div>
            <div style={S.timeRow}>
              <select style={S.timeSelect} value={hour} onChange={e => setHour(e.target.value)}>{HOURS.map(h => <option key={h} value={h}>{h}</option>)}</select>
              <span style={{ color: C.muted, fontSize: 20 }}>:</span>
              <select style={S.timeSelect} value={min} onChange={e => setMin(e.target.value)}>{MINS.map(m => <option key={m} value={m}>{m}</option>)}</select>
              <select style={S.timeSelect} value={ampm} onChange={e => setAmpm(e.target.value)}><option>AM</option><option>PM</option></select>
            </div>
          </div>
        )}
        <button style={S.saveBtn} onClick={handleSave}>Save Settings</button>
        <button style={S.dangerBtn} onClick={() => { onReset(); onClose(); }}>Reset & Redo Onboarding</button>
      </div>
    </div>
  );
}

// ── Cards ──────────────────────────────────────────────────────────────────
function WeatherCard({ status, data, error, retry }) {
  return (
    <div style={S.card}>
      <div style={S.cardAccentLine} />
      <div style={S.cardLabel}>Weather</div>
      {status === "loading" || status === "idle" ? (
        <div><div style={{ ...S.skeleton, width: "60%", height: 44 }} /><div style={{ ...S.skeleton, width: "40%" }} /><div style={{ ...S.skeleton, width: "80%", marginTop: 14 }} /></div>
      ) : status === "error" ? (
        <div><div style={S.errorText}>⚠ {error}</div><button style={S.retryBtn} onClick={retry}>Retry</button></div>
      ) : (
        <>
          <div style={S.weatherRow}>
            <div style={S.weatherIcon}>{data.icon}</div>
            <div style={S.weatherInfo}>
              <div style={S.weatherTemp}>{data.temp}</div>
              <div style={S.weatherFeels}>{data.feels}</div>
              <div style={S.weatherDesc}>{data.desc}</div>
              <div style={S.weatherCity}>📍 {data.city}</div>
            </div>
          </div>
          <div style={S.weatherExtras}>
            {[["High", data.high], ["Low", data.low], ["Wind", data.wind]].map(([label, val]) => (
              <div key={label} style={S.weatherExtra}><div style={S.weatherExtraVal}>{val}</div><div style={S.weatherExtraLabel}>{label}</div></div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TasksCard({ tasks, setTasks }) {
  const [editing, setEditing] = useState(false);
  function toggleDone(id) { setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t)); }
  function updateText(id, text) { setTasks(prev => prev.map(t => t.id === id ? { ...t, text } : t)); }
  return (
    <div style={S.card}>
      <div style={S.cardAccentLine} />
      <div style={S.cardLabelRow}>
        <div style={S.cardLabel}>Today's Focus</div>
        <button style={S.cardLabelBtn} onClick={() => setEditing(e => !e)}>{editing ? "Done" : "Edit"}</button>
      </div>
      {tasks.map((task, i) => (
        <div key={task.id} style={S.taskItem}>
          <button style={{ ...S.taskCheck, ...(task.done ? S.taskCheckDone : {}) }} onClick={() => toggleDone(task.id)}>{task.done ? "✓" : ""}</button>
          {editing
            ? <input style={{ ...S.taskInput, ...(task.done ? S.taskDoneText : {}) }} value={task.text} onChange={e => updateText(task.id, e.target.value)} placeholder={`Task ${i + 1}…`} />
            : <div style={{ ...S.taskInput, border: "none", cursor: "default", ...(task.done ? S.taskDoneText : {}) }}>{task.text || <span style={{ color: C.muted }}>Empty</span>}</div>
          }
        </div>
      ))}
    </div>
  );
}

function QuoteCard({ name, vibe, onChangeVibe }) {
  const { status, data } = useQuote(name, vibe);
  const [showVibes, setShowVibes] = useState(false);
  return (
    <div style={S.card}>
      <div style={S.cardAccentLine} />
      <div style={S.cardLabelRow}>
        <div style={S.cardLabel}>Today's Thought</div>
        <button style={S.cardLabelBtn} onClick={() => setShowVibes(v => !v)}>{showVibes ? "Close" : `Vibe: ${vibe}`}</button>
      </div>
      {showVibes && <div style={{ ...S.vibeGrid, marginBottom: 16 }}>{VIBES.map(v => <button key={v} style={{ ...S.vibeBtn, fontSize: 11, padding: "5px 12px", ...(vibe === v ? S.vibeBtnActive : {}) }} onClick={() => { onChangeVibe(v); setShowVibes(false); }}>{v}</button>)}</div>}
      {status === "loading" || status === "idle"
        ? <div><div style={{ ...S.skeleton, width: "100%", height: 14 }} /><div style={{ ...S.skeleton, width: "85%", height: 14 }} /><div style={{ ...S.skeleton, width: "40%", height: 10, marginTop: 10 }} /></div>
        : status === "error" ? <div style={S.errorText}>⚠ Couldn't load quote</div>
        : <><div style={S.quoteText}>"{data.quote}"</div><div style={S.quoteAuthor}>— {data.author}</div><div style={S.quoteVibe}>✦ personalized for {name} · feeling {vibe}</div></>
      }
    </div>
  );
}

function NewsCard() {
  const [activeTab, setActiveTab] = useState("Top Stories");
  const { status, headlines, error, retry } = useNews(activeTab);
  return (
    <div style={S.card}>
      <div style={S.cardAccentLine} />
      <div style={S.cardLabel}>Headlines</div>
      <div style={S.tabRow}>{CATEGORIES.map(cat => <button key={cat} style={{ ...S.tab, ...(activeTab === cat ? S.tabActive : {}) }} onClick={() => setActiveTab(cat)}>{cat}</button>)}</div>
      {status === "loading" || status === "idle"
        ? <div>{[1, 2, 3].map(i => <div key={i} style={{ marginBottom: 16 }}><div style={{ ...S.skeleton, width: "25%", height: 10, marginBottom: 6 }} /><div style={{ ...S.skeleton, width: "100%" }} /><div style={{ ...S.skeleton, width: "75%" }} /></div>)}<div style={S.aiTag}>⚡ fetching headlines…</div></div>
        : status === "error" ? <div><div style={S.errorText}>⚠ {error}</div><button style={S.retryBtn} onClick={retry}>Retry</button></div>
        : <>{headlines.map((h, i) => <div key={i} style={{ ...S.headlineItem, ...(i === headlines.length - 1 ? { borderBottom: "none", marginBottom: 0, paddingBottom: 0 } : {}) }}><div style={S.headlineCat}>{h.category}</div><div style={S.headlineText}>{h.headline}</div></div>)}<div style={S.aiTag}>⚡ NVIDIA AI · live</div></>
      }
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────
const DEFAULT_NOTIF = { enabled: false, hour: "07", min: "00", ampm: "AM" };

export default function MorningBrief() {
  const now = useTime();
  const weather = useWeather();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [vibe, setVibe] = useState("");
  const [ready, setReady] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [notifSettings, setNotifSettings] = useState(DEFAULT_NOTIF);

  useEffect(() => {
    try {
      const pr = store.get("mb_profile");
      const ns = store.get("mb_notif");
      if (pr) { const p = JSON.parse(pr.value); setProfile(p); setTasks(p.tasks || []); setVibe(p.vibe || "Motivated"); }
      if (ns) { setNotifSettings(JSON.parse(ns.value)); }
    } catch {}
    setLoading(false);
  }, []);

  function handleOnboardComplete(p) { setProfile(p); setTasks(p.tasks); setVibe(p.vibe); }
  function handleVibeChange(v) { setVibe(v); store.set("mb_profile", { ...profile, vibe: v }); }
  function handleReset() { localStorage.removeItem("mb_profile"); localStorage.removeItem("mb_notif"); setProfile(null); setTasks([]); setVibe(""); setReady(false); }
  function handleSaveNotif(s) { setNotifSettings(s); store.set("mb_notif", s); }

  if (loading) return <div style={{ ...S.root, justifyContent: "center", alignItems: "center", minHeight: "100vh" }}><div style={{ color: C.muted, fontFamily: "'Courier New', monospace", fontSize: 13, letterSpacing: "0.2em" }}>Loading…</div></div>;
  if (!profile) return <Onboarding onComplete={handleOnboardComplete} />;

  return (
    <>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }
        * { box-sizing: border-box; }
        body { margin: 0; }
        input::placeholder { color: rgba(255,255,255,0.2); }
        input:focus { border-color: rgba(249,115,22,0.5) !important; }
        select option { background: #0f1120; color: #f1f0eb; }
      `}</style>
      <div style={S.root}>
        <div style={S.topBar}>
          <span style={S.timeSmall}>{formatTime(now)}</span>
          <button style={{ ...S.settingsBtn, color: notifSettings.enabled && Notifs.permission() === "granted" ? C.accent1 : C.muted }} onClick={() => setShowSettings(true)}>
            {notifSettings.enabled && Notifs.permission() === "granted" ? "🔔" : "⚙"}
          </button>
        </div>
        <FadeIn delay={100}>
          <div style={S.greeting}>
            <div style={S.greetingLabel}>Your Morning Brief</div>
            <h1 style={S.greetingName}>{getGreeting(now)},<br />{profile.name}.</h1>
            <div style={S.greetingDate}>{formatDate(now)}</div>
            {notifSettings.enabled && Notifs.permission() === "granted" && (
              <div style={{ fontSize: 11, color: C.accent2, fontFamily: "'Courier New', monospace", marginTop: 6, letterSpacing: "0.08em" }}>
                🔔 Reminder set for {notifSettings.hour}:{notifSettings.min} {notifSettings.ampm}
              </div>
            )}
          </div>
        </FadeIn>
        <FadeIn delay={200}><WeatherCard {...weather} /></FadeIn>
        <FadeIn delay={350}><TasksCard tasks={tasks} setTasks={setTasks} /></FadeIn>
        <FadeIn delay={500}><QuoteCard name={profile.name} vibe={vibe} onChangeVibe={handleVibeChange} /></FadeIn>
        <FadeIn delay={650}><NewsCard /></FadeIn>
        <FadeIn delay={800}>
          <button style={{ ...S.readyBtn, ...(ready ? { opacity: 0.6 } : {}) }} onClick={() => setReady(true)}>
            {ready ? `✓ Go get it, ${profile.name}!` : "I'm Ready for Today"}
          </button>
        </FadeIn>
      </div>
      {showSettings && <SettingsPanel profile={profile} notifSettings={notifSettings} onSave={handleSaveNotif} onReset={handleReset} onClose={() => setShowSettings(false)} />}
    </>
  );
}
