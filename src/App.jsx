import { useState, useEffect, useRef, useCallback } from "react";

// ── Theme ──────────────────────────────────────────────────────────────────
const C = {
  bg: "#090c18",
  card: "rgba(255,255,255,0.045)",
  border: "rgba(255,255,255,0.09)",
  accent1: "#f97316",
  accent2: "#fb923c",
  accent3: "#fcd34d",
  muted: "rgba(255,255,255,0.38)",
  text: "#f0ede6",
  green: "#4ade80",
  red: "#f87171",
  serif: "'Playfair Display', Georgia, serif",
  sans: "'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', 'Courier New', monospace",
};

// Dynamic background based on time of day
function getBgGradient(hour) {
  if (hour >= 5 && hour < 8) return `radial-gradient(ellipse at 20% 80%, rgba(251,146,60,0.35) 0%, rgba(249,115,22,0.2) 30%, transparent 65%), radial-gradient(ellipse at 80% 20%, rgba(252,211,77,0.15) 0%, transparent 50%), #0d0810`;
  if (hour >= 8 && hour < 12) return `radial-gradient(ellipse at 15% 40%, rgba(249,115,22,0.18) 0%, transparent 55%), radial-gradient(ellipse at 85% 15%, rgba(251,146,60,0.12) 0%, transparent 50%), #090c18`;
  if (hour >= 12 && hour < 17) return `radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.1) 0%, transparent 60%), radial-gradient(ellipse at 20% 60%, rgba(249,115,22,0.08) 0%, transparent 50%), #090c18`;
  if (hour >= 17 && hour < 20) return `radial-gradient(ellipse at 30% 70%, rgba(239,68,68,0.15) 0%, rgba(249,115,22,0.18) 40%, transparent 65%), radial-gradient(ellipse at 80% 20%, rgba(252,211,77,0.1) 0%, transparent 50%), #0a0810`;
  return `radial-gradient(ellipse at 50% 100%, rgba(99,102,241,0.12) 0%, transparent 60%), radial-gradient(ellipse at 20% 20%, rgba(249,115,22,0.06) 0%, transparent 40%), #06081a`;
}

const NEWS_CATS = ["Top Stories", "Tech", "World", "Business", "Science"];
const VIBES = ["Motivated", "Calm", "Focused", "Inspired", "Resilient"];
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
const MINS = ["00", "15", "30", "45"];
const MAIN_TABS = ["📰 News", "📈 Markets", "🗓 History", "🌍 Word", "🏋️ Wellness", "☕ Routine"];
const MOODS = ["😴", "😐", "🙂", "😊", "🚀"];
const MOOD_LABELS = ["Tired", "Okay", "Good", "Great", "Pumped"];

const NVIDIA_API_KEY = import.meta.env.VITE_NVIDIA_API_KEY;
const NVIDIA_BASE_URL = "/nvidia-api/v1/chat/completions";
const NVIDIA_MODEL = "meta/llama-3.1-8b-instruct";

// ── Storage ────────────────────────────────────────────────────────────────
const store = {
  get: (key) => { try { const v = localStorage.getItem(key); return v ? { value: v } : null; } catch { return null; } },
  set: (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} },
  getRaw: (key) => { try { return localStorage.getItem(key); } catch { return null; } },
  setRaw: (key, val) => { try { localStorage.setItem(key, val); } catch {} },
};

// ── Streak helpers ─────────────────────────────────────────────────────────
function getStreak() {
  try {
    const data = JSON.parse(store.getRaw("mb_streak") || "{}");
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (data.lastDate === today) return data.count || 1;
    if (data.lastDate === yesterday) return data.count || 1;
    return 0;
  } catch { return 0; }
}

function updateStreak() {
  try {
    const data = JSON.parse(store.getRaw("mb_streak") || "{}");
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    let count = 1;
    if (data.lastDate === today) return data.count;
    if (data.lastDate === yesterday) count = (data.count || 0) + 1;
    store.setRaw("mb_streak", JSON.stringify({ count, lastDate: today }));
    return count;
  } catch { return 1; }
}

// ── Mood helpers ───────────────────────────────────────────────────────────
function getMoodLog() {
  try { return JSON.parse(store.getRaw("mb_mood_log") || "[]"); } catch { return []; }
}
function logMood(moodIdx) {
  const log = getMoodLog();
  const today = new Date().toDateString();
  const filtered = log.filter(m => m.date !== today);
  filtered.push({ date: today, mood: moodIdx });
  store.setRaw("mb_mood_log", JSON.stringify(filtered.slice(-30)));
}
function getTodayMood() {
  const log = getMoodLog();
  const today = new Date().toDateString();
  const entry = log.find(m => m.date === today);
  return entry ? entry.mood : null;
}

// ── Notifications ──────────────────────────────────────────────────────────
const Notifs = {
  async request() {
    if (!("Notification" in window)) return "unsupported";
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    return await Notification.requestPermission();
  },
  permission() { if (!("Notification" in window)) return "unsupported"; return Notification.permission; },
  schedule(title, body, atHour, atMin, ampm) {
    let h = parseInt(atHour);
    if (ampm === "PM" && h !== 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    const fire = new Date(); fire.setHours(h, parseInt(atMin), 0, 0);
    if (fire <= new Date()) fire.setDate(fire.getDate() + 1);
    return setTimeout(() => { if (Notification.permission === "granted") new Notification(title, { body }); }, fire - new Date());
  },
};

// ── Confetti ───────────────────────────────────────────────────────────────
function launchConfetti() {
  const colors = ["#f97316","#fcd34d","#4ade80","#60a5fa","#f472b6","#a78bfa"];
  const container = document.createElement("div");
  container.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden";
  document.body.appendChild(container);
  for (let i = 0; i < 80; i++) {
    const el = document.createElement("div");
    const color = colors[Math.floor(Math.random() * colors.length)];
    const x = Math.random() * 100;
    const delay = Math.random() * 0.8;
    const duration = 1.5 + Math.random() * 1.5;
    const size = 6 + Math.random() * 8;
    const rotate = Math.random() * 360;
    el.style.cssText = `position:absolute;left:${x}%;top:-20px;width:${size}px;height:${size}px;background:${color};border-radius:${Math.random() > 0.5 ? "50%" : "2px"};animation:confettiFall ${duration}s ${delay}s ease-in forwards;transform:rotate(${rotate}deg)`;
    container.appendChild(el);
  }
  setTimeout(() => document.body.removeChild(container), 4000);
}

// ── Sound ──────────────────────────────────────────────────────────────────
function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.start(t); osc.stop(t + 0.6);
    });
  } catch {}
}

// ── Weather ────────────────────────────────────────────────────────────────
function decodeWeather(code) {
  if (code === 0)  return { icon: "☀️", label: "Clear sky" };
  if (code <= 2)   return { icon: "🌤️", label: "Partly cloudy" };
  if (code === 3)  return { icon: "☁️", label: "Overcast" };
  if (code <= 49)  return { icon: "🌫️", label: "Foggy" };
  if (code <= 57)  return { icon: "🌧️", label: "Drizzle" };
  if (code <= 67)  return { icon: "🌧️", label: "Rain" };
  if (code <= 77)  return { icon: "❄️", label: "Snow" };
  if (code <= 82)  return { icon: "🌦️", label: "Rain showers" };
  if (code <= 86)  return { icon: "🌨️", label: "Snow showers" };
  if (code <= 99)  return { icon: "⛈️", label: "Thunderstorm" };
  return { icon: "🌡️", label: "Unknown" };
}
function toC(c) { return Math.round(c); }
function toKmh(ms) { return Math.round(ms * 3.6); }

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

// ── NVIDIA API ─────────────────────────────────────────────────────────────
async function callNvidia(prompt, maxTokens = 1000) {
  const res = await fetch(NVIDIA_BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${NVIDIA_API_KEY}` },
    body: JSON.stringify({ model: NVIDIA_MODEL, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

async function fetchHeadlines(category) {
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const prompt = category === "Top Stories"
    ? `Today is ${today}. Give me the 3 most important global news headlines. Return ONLY a JSON array, no markdown: [{"category":"World","headline":"..."},{"category":"Tech","headline":"..."},{"category":"Business","headline":"..."}]`
    : `Today is ${today}. Give me the 3 most important ${category} news headlines. Return ONLY a JSON array, no markdown: [{"category":"${category}","headline":"..."},{"category":"${category}","headline":"..."},{"category":"${category}","headline":"..."}]`;
  const text = await callNvidia(prompt);
  const match = text.replace(/```json|```/gi, "").trim().match(/\[[\s\S]*\]/);
  if (!match) throw new Error("No JSON in response");
  return JSON.parse(match[0]);
}

async function fetchPersonalizedQuote(name, vibe) {
  const prompt = `Give me one short, powerful motivational quote for someone named ${name} who wants to feel ${vibe} today. Genuine, not generic. Return ONLY JSON: {"quote":"...","author":"..."}`;
  const text = await callNvidia(prompt, 200);
  const match = text.replace(/```json|```/gi, "").trim().match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON");
  return JSON.parse(match[0]);
}

async function fetchMorningInsight(name, weather, tasks, vibe) {
  const taskList = tasks.map(t => t.text).filter(Boolean).join(", ");
  const prompt = `Write a warm, personalized 2-sentence morning insight for ${name}. They are feeling ${vibe}, the weather is ${weather}, and their main tasks today are: ${taskList}. Make it feel like a wise friend is talking to them. Be specific, not generic. Return ONLY JSON: {"insight":"..."}`;
  const text = await callNvidia(prompt, 200);
  const match = text.replace(/```json|```/gi, "").trim().match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON");
  return JSON.parse(match[0]);
}

async function fetchMarkets() {
  const [forexRes, cryptoRes] = await Promise.allSettled([
    fetch("https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY"),
    fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true"),
  ]);
  const markets = [];
  if (forexRes.status === "fulfilled" && forexRes.value.ok) {
    const fx = await forexRes.value.json();
    markets.push(
      { name: "EUR/USD", value: (1 / fx.rates.EUR).toFixed(4), change: null, type: "forex" },
      { name: "GBP/USD", value: (1 / fx.rates.GBP).toFixed(4), change: null, type: "forex" },
      { name: "USD/JPY", value: fx.rates.JPY.toFixed(2), change: null, type: "forex" },
    );
  }
  if (cryptoRes.status === "fulfilled" && cryptoRes.value.ok) {
    const crypto = await cryptoRes.value.json();
    const fmt = (n) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`;
    if (crypto.bitcoin) markets.push({ name: "BTC", value: fmt(crypto.bitcoin.usd), change: crypto.bitcoin.usd_24h_change?.toFixed(2), type: "crypto" });
    if (crypto.ethereum) markets.push({ name: "ETH", value: fmt(crypto.ethereum.usd), change: crypto.ethereum.usd_24h_change?.toFixed(2), type: "crypto" });
    if (crypto.solana) markets.push({ name: "SOL", value: fmt(crypto.solana.usd), change: crypto.solana.usd_24h_change?.toFixed(2), type: "crypto" });
  }
  if (markets.length === 0) throw new Error("No market data available");
  return markets;
}

async function fetchHistory() {
  const today = new Date();
  const month = today.toLocaleString("en-US", { month: "long" });
  const day = today.getDate();
  const prompt = `Give me 3 fascinating and surprising historical events that happened on ${month} ${day} in different years. Genuinely interesting, different eras. Return ONLY JSON array, no markdown: [{"year":"...","event":"..."},{"year":"...","event":"..."},{"year":"...","event":"..."}]`;
  const text = await callNvidia(prompt);
  const match = text.replace(/```json|```/gi, "").trim().match(/\[[\s\S]*\]/);
  if (!match) throw new Error("No JSON");
  return JSON.parse(match[0]);
}

async function fetchWordOfDay() {
  const prompt = `Give me an interesting, uncommon English word of the day. Return ONLY JSON, no markdown: {"word":"...","pronunciation":"...","partOfSpeech":"...","definition":"...","example":"...","origin":"..."}`;
  const text = await callNvidia(prompt, 300);
  const match = text.replace(/```json|```/gi, "").trim().match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON");
  return JSON.parse(match[0]);
}

async function fetchWellness(name) {
  const prompt = `Generate a short wellness check-in for ${name}'s morning. Return ONLY JSON, no markdown: {"stretch":"A specific 60-second stretch","breathwork":"A breathing exercise with counts","affirmation":"A short powerful affirmation","hydration":"A creative hydration reminder"}`;
  const text = await callNvidia(prompt, 400);
  const match = text.replace(/```json|```/gi, "").trim().match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON");
  return JSON.parse(match[0]);
}

// ── Styles ─────────────────────────────────────────────────────────────────
const S = {
  onboardRoot: { minHeight: "100vh", background: `radial-gradient(ellipse at 25% 60%, rgba(249,115,22,0.18) 0%, transparent 55%), #090c18`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", fontFamily: C.sans, color: C.text },
  onboardCard: { width: "100%", maxWidth: 460, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 28, padding: "44px 40px" },
  onboardStep: { fontSize: 11, letterSpacing: "0.3em", color: C.accent1, textTransform: "uppercase", fontFamily: C.mono, marginBottom: 12 },
  onboardTitle: { fontSize: 34, fontWeight: 700, lineHeight: 1.2, color: C.text, margin: "0 0 10px", fontFamily: C.serif },
  onboardSub: { fontSize: 16, color: C.muted, marginBottom: 32, lineHeight: 1.6 },
  input: { width: "100%", background: "rgba(255,255,255,0.07)", border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", fontSize: 17, color: C.text, fontFamily: C.sans, outline: "none", boxSizing: "border-box", marginBottom: 16 },
  vibeGrid: { display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 28 },
  vibeBtn: { padding: "10px 20px", borderRadius: 24, border: `1px solid ${C.border}`, background: "none", color: C.muted, fontSize: 15, cursor: "pointer", fontFamily: C.sans, transition: "all 0.2s" },
  vibeBtnActive: { background: C.accent1, borderColor: C.accent1, color: "#090c18", fontWeight: 700 },
  nextBtn: { width: "100%", padding: "18px 0", background: `linear-gradient(135deg, ${C.accent1}, ${C.accent3})`, border: "none", borderRadius: 16, color: "#090c18", fontSize: 15, fontFamily: C.sans, cursor: "pointer", fontWeight: 700, marginTop: 8 },
  nextBtnDisabled: { opacity: 0.3, cursor: "not-allowed" },
  progressDots: { display: "flex", gap: 8, justifyContent: "center", marginTop: 28 },
  dot: { width: 7, height: 7, borderRadius: "50%", background: C.border, transition: "all 0.3s" },
  dotActive: { background: C.accent1, width: 20, borderRadius: 4 },
  root: { minHeight: "100vh", fontFamily: C.sans, color: C.text, display: "flex", flexDirection: "column", alignItems: "center", padding: "0 28px 56px", overflowX: "hidden", transition: "background 2s ease" },
  topBar: { width: "100%", maxWidth: 620, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "28px 0 12px" },
  timeSmall: { fontSize: 14, color: C.muted, letterSpacing: "0.08em", fontFamily: C.mono },
  settingsBtn: { background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 22, padding: 4 },
  greeting: { width: "100%", maxWidth: 620, marginTop: 16, marginBottom: 20 },
  greetingLabel: { fontSize: 11, letterSpacing: "0.35em", color: C.accent1, textTransform: "uppercase", marginBottom: 10, fontFamily: C.mono },
  greetingName: { fontSize: 52, fontWeight: 700, lineHeight: 1.1, color: C.text, margin: 0, fontFamily: C.serif },
  greetingDate: { fontSize: 16, color: C.muted, marginTop: 10, fontFamily: C.sans },
  notifBadge: { fontSize: 12, color: C.accent2, fontFamily: C.mono, marginTop: 8 },
  streakBadge: { display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, background: "rgba(249,115,22,0.12)", border: `1px solid rgba(249,115,22,0.25)`, borderRadius: 20, padding: "5px 14px", fontSize: 13, color: C.accent2, fontFamily: C.mono },
  card: { width: "100%", maxWidth: 620, background: C.card, border: `1px solid ${C.border}`, borderRadius: 24, padding: "32px 36px", marginBottom: 16, backdropFilter: "blur(16px)", position: "relative", overflow: "hidden" },
  cardAccentLine: { position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${C.accent1}, ${C.accent3}, transparent)`, borderRadius: "24px 24px 0 0" },
  cardLabel: { fontSize: 10, letterSpacing: "0.35em", color: C.accent2, textTransform: "uppercase", marginBottom: 16, fontFamily: C.mono },
  cardLabelRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  cardLabelBtn: { fontSize: 11, color: C.accent1, background: "none", border: "none", cursor: "pointer", fontFamily: C.mono, letterSpacing: "0.08em" },
  weatherRow: { display: "flex", alignItems: "center", gap: 20 },
  weatherIcon: { fontSize: 64, lineHeight: 1 },
  weatherInfo: { flex: 1 },
  weatherTemp: { fontSize: 56, fontWeight: 300, lineHeight: 1, color: C.text, fontFamily: C.serif },
  weatherFeels: { fontSize: 13, color: C.muted, marginTop: 4, fontFamily: C.mono },
  weatherDesc: { fontSize: 17, color: C.muted, marginTop: 6 },
  weatherCity: { fontSize: 13, color: C.accent2, marginTop: 6, fontFamily: C.mono },
  weatherExtras: { display: "flex", marginTop: 20, paddingTop: 20, borderTop: `1px solid ${C.border}` },
  weatherExtra: { flex: 1, textAlign: "center" },
  weatherExtraVal: { fontSize: 20, color: C.text, fontFamily: C.serif },
  weatherExtraLabel: { fontSize: 10, color: C.muted, marginTop: 4, letterSpacing: "0.15em", fontFamily: C.mono, textTransform: "uppercase" },
  skeleton: { height: 18, borderRadius: 6, marginBottom: 10, background: "rgba(255,255,255,0.07)", animation: "pulse 1.5s ease-in-out infinite" },
  errorText: { fontSize: 14, color: C.muted, fontFamily: C.mono, lineHeight: 1.6 },
  retryBtn: { marginTop: 12, padding: "9px 18px", background: "none", border: `1px solid ${C.accent1}`, borderRadius: 10, color: C.accent1, cursor: "pointer", fontSize: 13, fontFamily: C.mono },
  taskItem: { display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14 },
  taskCheck: { width: 26, height: 26, borderRadius: "50%", border: `1.5px solid ${C.border}`, background: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, fontSize: 13, color: C.accent3, marginTop: 1 },
  taskCheckDone: { background: C.accent1, borderColor: C.accent1, color: "#090c18" },
  taskInputStyle: { flex: 1, background: "transparent", border: "none", borderBottom: `1px solid ${C.border}`, color: C.text, fontSize: 17, fontFamily: C.sans, padding: "3px 0", outline: "none", lineHeight: 1.5 },
  taskDoneText: { opacity: 0.3, textDecoration: "line-through" },
  quoteText: { fontSize: 22, lineHeight: 1.7, color: C.text, fontStyle: "italic", marginBottom: 14, fontFamily: C.serif },
  quoteAuthor: { fontSize: 13, color: C.accent2, letterSpacing: "0.2em", textTransform: "uppercase", fontFamily: C.mono },
  quoteVibe: { fontSize: 10, color: C.muted, fontFamily: C.mono, marginTop: 12 },
  // Mood
  moodRow: { display: "flex", justifyContent: "space-between", gap: 8, marginTop: 4 },
  moodBtn: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "12px 8px", borderRadius: 16, border: `1px solid ${C.border}`, background: "none", cursor: "pointer", transition: "all 0.2s" },
  moodBtnActive: { background: "rgba(249,115,22,0.15)", borderColor: C.accent1 },
  moodEmoji: { fontSize: 26 },
  moodLabel: { fontSize: 10, color: C.muted, fontFamily: C.mono, letterSpacing: "0.05em" },
  // Insight
  insightText: { fontSize: 16, lineHeight: 1.75, color: C.text, fontFamily: C.serif, fontStyle: "italic" },
  insightTag: { fontSize: 10, color: C.muted, fontFamily: C.mono, marginTop: 12 },
  // Weekly review
  reviewGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 },
  reviewItem: { background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 16, padding: "18px 20px" },
  reviewVal: { fontSize: 32, fontFamily: C.serif, color: C.accent1, fontWeight: 700 },
  reviewLabel: { fontSize: 11, color: C.muted, fontFamily: C.mono, marginTop: 4, letterSpacing: "0.1em", textTransform: "uppercase" },
  moodBar: { display: "flex", gap: 4, marginTop: 12 },
  moodBarItem: { flex: 1, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 },
  // Countdown
  countdownItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: `1px solid ${C.border}` },
  countdownName: { fontSize: 16, color: C.text },
  countdownDays: { fontSize: 24, color: C.accent1, fontFamily: C.serif, fontWeight: 700 },
  countdownLabel: { fontSize: 10, color: C.muted, fontFamily: C.mono, textAlign: "right" },
  addCountdownBtn: { width: "100%", marginTop: 14, padding: "12px", background: "none", border: `1px dashed ${C.border}`, borderRadius: 12, color: C.muted, fontSize: 14, fontFamily: C.sans, cursor: "pointer" },
  // Tabs
  mainTabRow: { width: "100%", maxWidth: 620, display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, marginBottom: 4 },
  mainTab: { padding: "9px 4px", borderRadius: 24, border: `1px solid ${C.border}`, background: "none", color: C.muted, fontSize: 12, fontFamily: C.sans, cursor: "pointer", transition: "all 0.2s", textAlign: "center", width: "100%", overflow: "hidden", textOverflow: "ellipsis" },
  mainTabActive: { background: C.accent1, borderColor: C.accent1, color: "#090c18", fontWeight: 700 },
  tabRow: { display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" },
  tab: { padding: "7px 16px", borderRadius: 24, border: `1px solid ${C.border}`, background: "none", color: C.muted, fontSize: 12, fontFamily: C.mono, cursor: "pointer", transition: "all 0.2s" },
  tabActive: { background: "rgba(249,115,22,0.15)", borderColor: C.accent1, color: C.accent1, fontWeight: 600 },
  headlineItem: { paddingBottom: 16, marginBottom: 16, borderBottom: `1px solid ${C.border}` },
  headlineCat: { fontSize: 10, letterSpacing: "0.3em", color: C.accent1, textTransform: "uppercase", fontFamily: C.mono, marginBottom: 7 },
  headlineText: { fontSize: 16, lineHeight: 1.6, color: C.text },
  aiTag: { fontSize: 10, color: C.muted, fontFamily: C.mono, marginTop: 16, textAlign: "right" },
  marketGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 },
  marketItem: { background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 16, padding: "20px 16px", textAlign: "center" },
  marketName: { fontSize: 11, color: C.muted, fontFamily: C.mono, letterSpacing: "0.1em", marginBottom: 8 },
  marketVal: { fontSize: 18, color: C.text, fontFamily: C.serif },
  marketChange: { fontSize: 12, fontFamily: C.mono, marginTop: 6 },
  marketDivider: { fontSize: 10, color: C.muted, fontFamily: C.mono, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 12, marginTop: 4 },
  historyItem: { paddingBottom: 18, marginBottom: 18, borderBottom: `1px solid ${C.border}` },
  historyYear: { fontSize: 28, fontFamily: C.serif, color: C.accent1, fontWeight: 700, marginBottom: 6 },
  historyEvent: { fontSize: 16, lineHeight: 1.65, color: C.text },
  wordTitle: { fontSize: 42, fontFamily: C.serif, color: C.text, fontWeight: 700, marginBottom: 4 },
  wordPronunciation: { fontSize: 16, color: C.muted, fontFamily: C.mono, marginBottom: 4 },
  wordPos: { display: "inline-block", fontSize: 11, color: C.accent2, fontFamily: C.mono, letterSpacing: "0.2em", textTransform: "uppercase", background: "rgba(251,146,60,0.1)", padding: "3px 10px", borderRadius: 20, marginBottom: 16 },
  wordDef: { fontSize: 18, lineHeight: 1.7, color: C.text, marginBottom: 16, fontFamily: C.serif, fontStyle: "italic" },
  wordExample: { fontSize: 15, color: C.muted, lineHeight: 1.6, marginBottom: 12 },
  wordOrigin: { fontSize: 12, color: C.muted, fontFamily: C.mono },
  wellnessGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  wellnessItem: { background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 16, padding: "22px 20px" },
  wellnessIcon: { fontSize: 24, marginBottom: 8 },
  wellnessLabel: { fontSize: 10, color: C.accent2, fontFamily: C.mono, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 8 },
  wellnessText: { fontSize: 14, lineHeight: 1.6, color: C.text },
  routineItem: { display: "flex", alignItems: "center", gap: 16, padding: "14px 0", borderBottom: `1px solid ${C.border}` },
  routineIcon: { fontSize: 28, flexShrink: 0 },
  routineInfo: { flex: 1 },
  routineName: { fontSize: 16, color: C.text, fontWeight: 500 },
  routineDur: { fontSize: 12, color: C.muted, fontFamily: C.mono, marginTop: 3 },
  routineBtn: { padding: "8px 16px", borderRadius: 20, border: `1px solid ${C.border}`, background: "none", color: C.accent1, fontSize: 12, fontFamily: C.mono, cursor: "pointer" },
  routineBtnActive: { background: C.accent1, borderColor: C.accent1, color: "#090c18", fontWeight: 700 },
  timerDisplay: { fontSize: 48, fontFamily: C.serif, color: C.accent3, textAlign: "center", marginBottom: 8 },
  timerLabel: { fontSize: 13, color: C.muted, fontFamily: C.mono, textAlign: "center", marginBottom: 20 },
  readyBtn: { width: "100%", maxWidth: 620, marginTop: 12, padding: "20px 36px", background: `linear-gradient(135deg, ${C.accent1}, ${C.accent3})`, border: "none", borderRadius: 20, color: "#090c18", fontSize: 16, fontFamily: C.sans, cursor: "pointer", fontWeight: 700 },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" },
  sheet: { width: "100%", maxWidth: 580, background: "#0c0f1e", borderRadius: "28px 28px 0 0", padding: "36px 36px 52px", border: `1px solid ${C.border}` },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, background: C.border, margin: "0 auto 28px" },
  sheetTitle: { fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 4, fontFamily: C.serif },
  sheetSub: { fontSize: 13, color: C.muted, fontFamily: C.mono, marginBottom: 28 },
  settingRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderBottom: `1px solid ${C.border}` },
  settingLabel: { fontSize: 16, color: C.text },
  settingHint: { fontSize: 12, color: C.muted, marginTop: 3, fontFamily: C.mono },
  toggle: { width: 48, height: 26, borderRadius: 13, cursor: "pointer", border: "none", transition: "background 0.2s", position: "relative", flexShrink: 0 },
  toggleKnob: { position: "absolute", top: 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s" },
  timeRow: { display: "flex", gap: 10, alignItems: "center", marginTop: 18 },
  timeSelect: { background: "rgba(255,255,255,0.07)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", color: C.text, fontSize: 17, fontFamily: C.mono, outline: "none", cursor: "pointer" },
  permBadge: { display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 24, fontSize: 12, fontFamily: C.mono, marginTop: 12 },
  saveBtn: { width: "100%", marginTop: 28, padding: "17px 0", background: `linear-gradient(135deg, ${C.accent1}, ${C.accent3})`, border: "none", borderRadius: 16, color: "#090c18", fontSize: 15, fontFamily: C.sans, cursor: "pointer", fontWeight: 700 },
  dangerBtn: { width: "100%", marginTop: 12, padding: "15px 0", background: "none", border: `1px solid rgba(255,100,100,0.25)`, borderRadius: 16, color: "rgba(255,120,120,0.7)", fontSize: 14, fontFamily: C.sans, cursor: "pointer" },
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
      setState({ status: "ok", data: { city, icon, temp: `${toC(cur.temperature_2m)}°`, feels: `Feels like ${toC(cur.apparent_temperature)}°`, desc: label, high: `${toC(daily.temperature_2m_max[0])}°`, low: `${toC(daily.temperature_2m_min[0])}°`, wind: `${toKmh(cur.windspeed_10m)} km/h`, raw: label }, error: null });
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

function useAsyncData(fetchFn, deps = []) {
  const [state, setState] = useState({ status: "idle", data: null, error: null });
  async function load() {
    setState({ status: "loading", data: null, error: null });
    try { const data = await fetchFn(); setState({ status: "ok", data, error: null }); }
    catch (e) { setState({ status: "error", data: null, error: e.message }); }
  }
  useEffect(() => { load(); }, deps);
  return { ...state, retry: load };
}

// ── Helpers ────────────────────────────────────────────────────────────────
function formatTime(d) { return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }); }
function formatDate(d) { return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }); }
function getGreeting(d) { const h = d.getHours(); if (h < 12) return "Good morning"; if (h < 17) return "Good afternoon"; return "Good evening"; }
function isSunday() { return new Date().getDay() === 0; }
function Skeleton({ w = "100%", h = 18, mt = 0 }) { return <div style={{ ...S.skeleton, width: w, height: h, marginTop: mt }} />; }

function FadeIn({ delay = 0, children }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), delay); return () => clearTimeout(t); }, [delay]);
  return <div style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(20px)", transition: "opacity 0.6s ease, transform 0.6s ease" }}>{children}</div>;
}

// ── Onboarding ─────────────────────────────────────────────────────────────
function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [vibe, setVibe] = useState("");
  const [tasks, setTasks] = useState(["", "", ""]);

  const steps = [
    { title: "Welcome.", sub: "Let's set up your morning brief. What should we call you?", content: <input style={S.input} placeholder="Your first name" value={name} onChange={e => setName(e.target.value)} autoFocus />, canNext: name.trim().length > 0 },
    { title: `Hello, ${name || "there"}.`, sub: "How do you want to feel when you start your day?", content: <div style={S.vibeGrid}>{VIBES.map(v => <button key={v} style={{ ...S.vibeBtn, ...(vibe === v ? S.vibeBtnActive : {}) }} onClick={() => setVibe(v)}>{v}</button>)}</div>, canNext: vibe.length > 0 },
    { title: "Set your intentions.", sub: "What are the three most important things today?", content: <div>{tasks.map((t, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}><div style={{ width: 28, height: 28, borderRadius: "50%", border: `1.5px solid ${C.accent1}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: C.accent1, flexShrink: 0, fontFamily: C.mono }}>{i + 1}</div><input style={{ ...S.input, marginBottom: 0 }} placeholder={`Intention ${i + 1}…`} value={t} onChange={e => setTasks(prev => prev.map((x, j) => j === i ? e.target.value : x))} /></div>)}</div>, canNext: tasks.some(t => t.trim().length > 0) },
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
        <div style={S.onboardStep}>{step + 1} of {steps.length}</div>
        <h1 style={S.onboardTitle}>{cur.title}</h1>
        <p style={S.onboardSub}>{cur.sub}</p>
        {cur.content}
        <button style={{ ...S.nextBtn, ...(cur.canNext ? {} : S.nextBtnDisabled) }} onClick={cur.canNext ? handleNext : undefined}>
          {step < steps.length - 1 ? "Continue" : "Start my day →"}
        </button>
        <div style={S.progressDots}>{steps.map((_, i) => <div key={i} style={{ ...S.dot, ...(i === step ? S.dotActive : i < step ? { background: C.accent2 } : {}) }} />)}</div>
      </div>
    </div>
  );
}

// ── Settings ───────────────────────────────────────────────────────────────
function SettingsPanel({ profile, notifSettings, onSave, onReset, onClose }) {
  const [enabled, setEnabled] = useState(notifSettings.enabled);
  const [hour, setHour] = useState(notifSettings.hour);
  const [min, setMin] = useState(notifSettings.min);
  const [ampm, setAmpm] = useState(notifSettings.ampm);
  const [permission, setPermission] = useState(Notifs.permission());
  const timerRef = useRef(null);

  async function handleToggle() {
    if (!enabled) { const r = await Notifs.request(); setPermission(r); if (r === "granted") setEnabled(true); }
    else setEnabled(false);
  }
  function handleSave() {
    if (timerRef.current) clearTimeout(timerRef.current);
    const s = { enabled, hour, min, ampm };
    if (enabled && permission === "granted") timerRef.current = Notifs.schedule(`🌅 Good morning, ${profile.name}!`, "Your Morning Brief is ready.", hour, min, ampm);
    onSave(s); onClose();
  }

  const permColor = permission === "granted" ? C.green : permission === "denied" ? "#f87171" : C.muted;
  const permLabel = permission === "granted" ? "✓ Allowed" : permission === "denied" ? "✗ Blocked" : "Not yet requested";

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.sheet}>
        <div style={S.sheetHandle} />
        <div style={S.sheetTitle}>Settings</div>
        <div style={S.sheetSub}>Notifications · Profile</div>
        <div style={S.settingRow}>
          <div>
            <div style={S.settingLabel}>Morning notification</div>
            <div style={S.settingHint}>Daily reminder to open your brief</div>
            <div style={{ ...S.permBadge, background: `${permColor}15`, color: permColor }}>{permLabel}</div>
          </div>
          <div style={{ ...S.toggle, background: enabled && permission === "granted" ? C.accent1 : "rgba(255,255,255,0.1)" }} onClick={handleToggle}>
            <div style={{ ...S.toggleKnob, left: enabled && permission === "granted" ? 25 : 3 }} />
          </div>
        </div>
        {enabled && permission === "granted" && (
          <div>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: C.mono, marginTop: 16, marginBottom: 8, letterSpacing: "0.15em" }}>NOTIFY ME AT</div>
            <div style={S.timeRow}>
              <select style={S.timeSelect} value={hour} onChange={e => setHour(e.target.value)}>{HOURS.map(h => <option key={h}>{h}</option>)}</select>
              <span style={{ color: C.muted, fontSize: 22 }}>:</span>
              <select style={S.timeSelect} value={min} onChange={e => setMin(e.target.value)}>{MINS.map(m => <option key={m}>{m}</option>)}</select>
              <select style={S.timeSelect} value={ampm} onChange={e => setAmpm(e.target.value)}><option>AM</option><option>PM</option></select>
            </div>
          </div>
        )}
        <button style={S.saveBtn} onClick={handleSave}>Save</button>
        <button style={S.dangerBtn} onClick={() => { onReset(); onClose(); }}>Reset & redo onboarding</button>
      </div>
    </div>
  );
}

// ── Mood Card ──────────────────────────────────────────────────────────────
function MoodCard() {
  const [selected, setSelected] = useState(getTodayMood());
  function handleMood(i) { setSelected(i); logMood(i); }
  return (
    <div style={S.card}>
      <div style={S.cardAccentLine} />
      <div style={S.cardLabel}>How are you feeling?</div>
      <div style={S.moodRow}>
        {MOODS.map((emoji, i) => (
          <button key={i} style={{ ...S.moodBtn, ...(selected === i ? S.moodBtnActive : {}) }} onClick={() => handleMood(i)}>
            <span style={S.moodEmoji}>{emoji}</span>
            <span style={{ ...S.moodLabel, color: selected === i ? C.accent2 : C.muted }}>{MOOD_LABELS[i]}</span>
          </button>
        ))}
      </div>
      {selected !== null && <div style={{ fontSize: 12, color: C.muted, fontFamily: C.mono, marginTop: 14, textAlign: "center" }}>Logged ✓ · come back tomorrow to track your trend</div>}
    </div>
  );
}

// ── Weekly Review (Sundays) ────────────────────────────────────────────────
function WeeklyReview({ streak, tasks }) {
  const moodLog = getMoodLog();
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000).toDateString();
    return moodLog.find(m => m.date === d) || null;
  });
  const doneTasks = tasks.filter(t => t.done).length;
  const avgMood = moodLog.slice(-7).filter(Boolean).reduce((s, m) => s + m.mood, 0) / (moodLog.slice(-7).filter(Boolean).length || 1);

  return (
    <div style={{ ...S.card, border: `1px solid rgba(249,115,22,0.3)`, background: "rgba(249,115,22,0.06)" }}>
      <div style={{ ...S.cardAccentLine, background: `linear-gradient(90deg, ${C.accent1}, ${C.accent3})` }} />
      <div style={S.cardLabel}>✨ Weekly Review</div>
      <div style={S.reviewGrid}>
        <div style={S.reviewItem}><div style={S.reviewVal}>{streak}</div><div style={S.reviewLabel}>Day streak</div></div>
        <div style={S.reviewItem}><div style={S.reviewVal}>{doneTasks}/{tasks.length}</div><div style={S.reviewLabel}>Tasks done</div></div>
        <div style={S.reviewItem}><div style={S.reviewVal}>{MOODS[Math.round(avgMood)] || "—"}</div><div style={S.reviewLabel}>Avg mood</div></div>
        <div style={S.reviewItem}><div style={S.reviewVal}>7</div><div style={S.reviewLabel}>Days tracked</div></div>
      </div>
      <div style={{ fontSize: 11, color: C.muted, fontFamily: C.mono, marginBottom: 8, letterSpacing: "0.1em" }}>MOOD THIS WEEK</div>
      <div style={S.moodBar}>
        {last7.map((m, i) => (
          <div key={i} style={{ ...S.moodBarItem, background: m ? "rgba(249,115,22,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${m ? "rgba(249,115,22,0.3)" : C.border}` }}>
            {m ? MOODS[m.mood] : "·"}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── AI Morning Insight ─────────────────────────────────────────────────────
function InsightCard({ name, weather, tasks, vibe }) {
  const weatherDesc = weather?.data?.desc || "unknown weather";
  const { status, data, error, retry } = useAsyncData(() => fetchMorningInsight(name, weatherDesc, tasks, vibe), [name, vibe]);
  return (
    <div style={{ ...S.card, background: "rgba(99,102,241,0.06)", border: `1px solid rgba(99,102,241,0.2)` }}>
      <div style={{ ...S.cardAccentLine, background: "linear-gradient(90deg, #818cf8, #a78bfa, transparent)" }} />
      <div style={{ ...S.cardLabel, color: "#a78bfa" }}>✦ Your Morning Insight</div>
      {status === "loading" || status === "idle"
        ? <div><Skeleton w="100%" h={18} /><Skeleton w="85%" h={18} mt={8} /></div>
        : status === "error" ? <div><div style={S.errorText}>⚠ {error}</div><button style={{ ...S.retryBtn, borderColor: "#818cf8", color: "#818cf8" }} onClick={retry}>Retry</button></div>
        : <><div style={S.insightText}>{data.insight}</div><div style={{ ...S.insightTag, color: "#a78bfa" }}>⚡ AI · personalized for you</div></>
      }
    </div>
  );
}

// ── Countdown Card ─────────────────────────────────────────────────────────
function CountdownCard() {
  const [events, setEvents] = useState(() => {
    try { return JSON.parse(store.getRaw("mb_countdowns") || "[]"); } catch { return []; }
  });
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDate, setNewDate] = useState("");

  function addEvent() {
    if (!newName || !newDate) return;
    const updated = [...events, { id: Date.now(), name: newName, date: newDate }];
    setEvents(updated);
    store.setRaw("mb_countdowns", JSON.stringify(updated));
    setNewName(""); setNewDate(""); setAdding(false);
  }
  function removeEvent(id) {
    const updated = events.filter(e => e.id !== id);
    setEvents(updated);
    store.setRaw("mb_countdowns", JSON.stringify(updated));
  }
  function daysUntil(dateStr) {
    const diff = new Date(dateStr) - new Date();
    return Math.max(0, Math.ceil(diff / 86400000));
  }

  return (
    <div style={S.card}>
      <div style={S.cardAccentLine} />
      <div style={S.cardLabel}>Countdowns</div>
      {events.length === 0 && !adding && <div style={{ color: C.muted, fontSize: 14, fontFamily: C.mono, marginBottom: 12 }}>No events yet — add something to look forward to.</div>}
      {events.map(ev => (
        <div key={ev.id} style={S.countdownItem}>
          <div>
            <div style={S.countdownName}>{ev.name}</div>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: C.mono, marginTop: 2 }}>{new Date(ev.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={S.countdownDays}>{daysUntil(ev.date)}</div>
            <div style={S.countdownLabel}>days away</div>
            <button onClick={() => removeEvent(ev.id)} style={{ fontSize: 10, color: C.muted, background: "none", border: "none", cursor: "pointer", fontFamily: C.mono, marginTop: 4 }}>remove</button>
          </div>
        </div>
      ))}
      {adding ? (
        <div style={{ marginTop: 14 }}>
          <input style={{ ...S.input, marginBottom: 10 }} placeholder="Event name…" value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
          <input style={{ ...S.input, marginBottom: 10 }} type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={addEvent} style={{ ...S.nextBtn, flex: 1, padding: "12px", marginTop: 0, fontSize: 14 }}>Add</button>
            <button onClick={() => setAdding(false)} style={{ ...S.dangerBtn, flex: 1, padding: "12px", marginTop: 0, fontSize: 14 }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button style={S.addCountdownBtn} onClick={() => setAdding(true)}>+ Add event</button>
      )}
    </div>
  );
}

// ── Tab Cards ──────────────────────────────────────────────────────────────
function NewsTab() {
  const [activeTab, setActiveTab] = useState("Top Stories");
  const { status, headlines, error, retry } = useNews(activeTab);
  return (
    <div style={S.card}>
      <div style={S.cardAccentLine} />
      <div style={S.cardLabel}>Headlines</div>
      <div style={S.tabRow}>{NEWS_CATS.map(cat => <button key={cat} style={{ ...S.tab, ...(activeTab === cat ? S.tabActive : {}) }} onClick={() => setActiveTab(cat)}>{cat}</button>)}</div>
      {status === "loading" || status === "idle"
        ? <div>{[1,2,3].map(i => <div key={i} style={{ marginBottom: 18 }}><Skeleton w="20%" h={10} /><Skeleton /><Skeleton w="70%" mt={6} /></div>)}<div style={S.aiTag}>⚡ fetching…</div></div>
        : status === "error" ? <div><div style={S.errorText}>⚠ {error}</div><button style={S.retryBtn} onClick={retry}>Retry</button></div>
        : <>{headlines.map((h, i) => <div key={i} style={{ ...S.headlineItem, ...(i === headlines.length - 1 ? { borderBottom: "none", marginBottom: 0, paddingBottom: 0 } : {}) }}><div style={S.headlineCat}>{h.category}</div><div style={S.headlineText}>{h.headline}</div></div>)}<div style={S.aiTag}>⚡ NVIDIA AI · live</div></>
      }
    </div>
  );
}

function MarketsTab() {
  const { status, data, error, retry } = useAsyncData(fetchMarkets, []);
  const forex = data?.filter(m => m.type === "forex") || [];
  const crypto = data?.filter(m => m.type === "crypto") || [];
  return (
    <div style={S.card}>
      <div style={S.cardAccentLine} />
      <div style={S.cardLabel}>Markets</div>
      {status === "loading" || status === "idle"
        ? <div><div style={S.marketGrid}>{[1,2,3].map(i => <div key={i} style={S.marketItem}><Skeleton w="60%" h={10} /><Skeleton w="80%" h={24} mt={8} /></div>)}</div></div>
        : status === "error" ? <div><div style={S.errorText}>⚠ {error}</div><button style={S.retryBtn} onClick={retry}>Retry</button></div>
        : <>
            {forex.length > 0 && <><div style={S.marketDivider}>Forex</div><div style={S.marketGrid}>{forex.map(m => <div key={m.name} style={S.marketItem}><div style={S.marketName}>{m.name}</div><div style={S.marketVal}>{m.value}</div></div>)}</div></>}
            {crypto.length > 0 && <><div style={{ ...S.marketDivider, marginTop: 16 }}>Crypto</div><div style={S.marketGrid}>{crypto.map(m => { const up = parseFloat(m.change) >= 0; return <div key={m.name} style={S.marketItem}><div style={S.marketName}>{m.name}</div><div style={S.marketVal}>{m.value}</div>{m.change && <div style={{ ...S.marketChange, color: up ? C.green : C.red }}>{up ? "▲" : "▼"} {Math.abs(m.change)}%</div>}</div>; })}</div></>}
            <div style={S.aiTag}>⚡ Frankfurter · CoinGecko · live</div>
          </>
      }
    </div>
  );
}

function HistoryTab() {
  const label = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const { status, data, error, retry } = useAsyncData(fetchHistory, []);
  return (
    <div style={S.card}>
      <div style={S.cardAccentLine} />
      <div style={S.cardLabel}>This Day in History · {label}</div>
      {status === "loading" || status === "idle"
        ? <div>{[1,2,3].map(i => <div key={i} style={{ marginBottom: 20 }}><Skeleton w="25%" h={28} /><Skeleton mt={8} /><Skeleton w="80%" mt={6} /></div>)}</div>
        : status === "error" ? <div><div style={S.errorText}>⚠ {error}</div><button style={S.retryBtn} onClick={retry}>Retry</button></div>
        : <>{data.map((item, i) => <div key={i} style={{ ...S.historyItem, ...(i === data.length - 1 ? { borderBottom: "none", marginBottom: 0, paddingBottom: 0 } : {}) }}><div style={S.historyYear}>{item.year}</div><div style={S.historyEvent}>{item.event}</div></div>)}<div style={S.aiTag}>⚡ NVIDIA AI</div></>
      }
    </div>
  );
}

function WordTab() {
  const { status, data, error, retry } = useAsyncData(fetchWordOfDay, []);
  return (
    <div style={S.card}>
      <div style={S.cardAccentLine} />
      <div style={S.cardLabel}>Word of the Day</div>
      {status === "loading" || status === "idle"
        ? <div><Skeleton w="50%" h={42} /><Skeleton w="35%" h={14} mt={10} /><Skeleton w="100%" h={18} mt={16} /><Skeleton w="85%" h={18} mt={8} /></div>
        : status === "error" ? <div><div style={S.errorText}>⚠ {error}</div><button style={S.retryBtn} onClick={retry}>Retry</button></div>
        : <><div style={S.wordTitle}>{data.word}</div><div style={S.wordPronunciation}>{data.pronunciation}</div><div style={S.wordPos}>{data.partOfSpeech}</div><div style={S.wordDef}>{data.definition}</div><div style={S.wordExample}>"{data.example}"</div><div style={S.wordOrigin}>Origin: {data.origin}</div><div style={S.aiTag}>⚡ NVIDIA AI</div></>
      }
    </div>
  );
}

function WellnessTab({ name }) {
  const { status, data, error, retry } = useAsyncData(() => fetchWellness(name), [name]);
  const items = data ? [{ icon: "🧘", label: "Stretch", text: data.stretch }, { icon: "💨", label: "Breathwork", text: data.breathwork }, { icon: "✨", label: "Affirmation", text: data.affirmation }, { icon: "💧", label: "Hydration", text: data.hydration }] : [];
  return (
    <div style={S.card}>
      <div style={S.cardAccentLine} />
      <div style={S.cardLabel}>Daily Wellness</div>
      {status === "loading" || status === "idle"
        ? <div style={S.wellnessGrid}>{[1,2,3,4].map(i => <div key={i} style={S.wellnessItem}><Skeleton w="30%" h={28} /><Skeleton w="60%" h={10} mt={8} /><Skeleton mt={8} /><Skeleton w="75%" mt={6} /></div>)}</div>
        : status === "error" ? <div><div style={S.errorText}>⚠ {error}</div><button style={S.retryBtn} onClick={retry}>Retry</button></div>
        : <><div style={S.wellnessGrid}>{items.map((item, i) => <div key={i} style={S.wellnessItem}><div style={S.wellnessIcon}>{item.icon}</div><div style={S.wellnessLabel}>{item.label}</div><div style={S.wellnessText}>{item.text}</div></div>)}</div><div style={S.aiTag}>⚡ NVIDIA AI · personalized</div></>
      }
    </div>
  );
}

const DEFAULT_ROUTINE = [
  { id: 1, icon: "🧘", name: "Meditation", minutes: 5 },
  { id: 2, icon: "📓", name: "Journaling", minutes: 10 },
  { id: 3, icon: "🏃", name: "Light exercise", minutes: 15 },
  { id: 4, icon: "☕", name: "Mindful coffee", minutes: 5 },
  { id: 5, icon: "📚", name: "Read", minutes: 10 },
];

function RoutineTab() {
  const [active, setActive] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const intervalRef = useRef(null);
  function startTimer(item) {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setActive(item.id); setRemaining(item.minutes * 60);
    intervalRef.current = setInterval(() => setRemaining(r => { if (r <= 1) { clearInterval(intervalRef.current); setActive(null); return 0; } return r - 1; }), 1000);
  }
  function stopTimer() { if (intervalRef.current) clearInterval(intervalRef.current); setActive(null); setRemaining(0); }
  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);
  const mins = String(Math.floor(remaining / 60)).padStart(2, "0");
  const secs = String(remaining % 60).padStart(2, "0");
  return (
    <div style={S.card}>
      <div style={S.cardAccentLine} />
      <div style={S.cardLabel}>Morning Routine</div>
      {active && <div style={{ marginBottom: 20, background: "rgba(249,115,22,0.08)", border: `1px solid rgba(249,115,22,0.2)`, borderRadius: 16, padding: 16 }}><div style={S.timerDisplay}>{mins}:{secs}</div><div style={S.timerLabel}>{DEFAULT_ROUTINE.find(r => r.id === active)?.name} in progress…</div><button style={{ ...S.routineBtn, ...S.routineBtnActive, width: "100%", padding: "10px 0" }} onClick={stopTimer}>Stop</button></div>}
      {DEFAULT_ROUTINE.map((item, i) => <div key={item.id} style={{ ...S.routineItem, ...(i === DEFAULT_ROUTINE.length - 1 ? { borderBottom: "none" } : {}) }}><div style={S.routineIcon}>{item.icon}</div><div style={S.routineInfo}><div style={S.routineName}>{item.name}</div><div style={S.routineDur}>{item.minutes} min</div></div><button style={{ ...S.routineBtn, ...(active === item.id ? S.routineBtnActive : {}) }} onClick={() => active === item.id ? stopTimer() : startTimer(item)}>{active === item.id ? "Stop" : "Start"}</button></div>)}
    </div>
  );
}

// ── Main Cards ─────────────────────────────────────────────────────────────
function WeatherCard({ status, data, error, retry }) {
  return (
    <div style={S.card}>
      <div style={S.cardAccentLine} />
      <div style={S.cardLabel}>Weather</div>
      {status === "loading" || status === "idle" ? <div><Skeleton w="55%" h={52} /><Skeleton w="35%" mt={8} /><Skeleton w="75%" mt={16} /></div>
        : status === "error" ? <div><div style={S.errorText}>⚠ {error}</div><button style={S.retryBtn} onClick={retry}>Retry</button></div>
        : <><div style={S.weatherRow}><div style={S.weatherIcon}>{data.icon}</div><div style={S.weatherInfo}><div style={S.weatherTemp}>{data.temp}</div><div style={S.weatherFeels}>{data.feels}</div><div style={S.weatherDesc}>{data.desc}</div><div style={S.weatherCity}>📍 {data.city}</div></div></div><div style={S.weatherExtras}>{[["High", data.high], ["Low", data.low], ["Wind", data.wind]].map(([label, val]) => <div key={label} style={S.weatherExtra}><div style={S.weatherExtraVal}>{val}</div><div style={S.weatherExtraLabel}>{label}</div></div>)}</div></>
      }
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
      <div style={S.cardLabelRow}><div style={S.cardLabel}>Today's intentions</div><button style={S.cardLabelBtn} onClick={() => setEditing(e => !e)}>{editing ? "Done" : "Edit"}</button></div>
      {tasks.map((task, i) => <div key={task.id} style={S.taskItem}><button style={{ ...S.taskCheck, ...(task.done ? S.taskCheckDone : {}) }} onClick={() => toggleDone(task.id)}>{task.done ? "✓" : ""}</button>{editing ? <input style={{ ...S.taskInputStyle, ...(task.done ? S.taskDoneText : {}) }} value={task.text} onChange={e => updateText(task.id, e.target.value)} placeholder={`Intention ${i + 1}…`} /> : <div style={{ ...S.taskInputStyle, border: "none", cursor: "default", ...(task.done ? S.taskDoneText : {}) }}>{task.text || <span style={{ color: C.muted }}>Empty</span>}</div>}</div>)}
    </div>
  );
}

function QuoteCard({ name, vibe, onChangeVibe }) {
  const { status, data } = useQuote(name, vibe);
  const [showVibes, setShowVibes] = useState(false);
  return (
    <div style={S.card}>
      <div style={S.cardAccentLine} />
      <div style={S.cardLabelRow}><div style={S.cardLabel}>Today's thought</div><button style={S.cardLabelBtn} onClick={() => setShowVibes(v => !v)}>{showVibes ? "Close" : `Feeling: ${vibe}`}</button></div>
      {showVibes && <div style={{ ...S.vibeGrid, marginBottom: 18 }}>{VIBES.map(v => <button key={v} style={{ ...S.vibeBtn, fontSize: 13, padding: "7px 16px", ...(vibe === v ? S.vibeBtnActive : {}) }} onClick={() => { onChangeVibe(v); setShowVibes(false); }}>{v}</button>)}</div>}
      {status === "loading" || status === "idle" ? <div><Skeleton w="100%" h={18} /><Skeleton w="90%" h={18} mt={8} /><Skeleton w="45%" h={12} mt={14} /></div>
        : status === "error" ? <div style={S.errorText}>⚠ Couldn't load quote</div>
        : <><div style={S.quoteText}>"{data.quote}"</div><div style={S.quoteAuthor}>— {data.author}</div><div style={S.quoteVibe}>✦ curated for {name} · {vibe.toLowerCase()}</div></>
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
  const [activeMainTab, setActiveMainTab] = useState("📰 News");
  const [streak, setStreak] = useState(0);
  const chimeRef = useRef(false);

  useEffect(() => {
    try {
      const pr = store.get("mb_profile");
      const ns = store.get("mb_notif");
      if (pr) { const p = JSON.parse(pr.value); setProfile(p); setTasks(p.tasks || []); setVibe(p.vibe || "Motivated"); }
      if (ns) setNotifSettings(JSON.parse(ns.value));
    } catch {}
    const s = updateStreak();
    setStreak(s);
    setLoading(false);
    // Play chime on first load
    if (!chimeRef.current) { chimeRef.current = true; setTimeout(playChime, 800); }
  }, []);

  function handleOnboardComplete(p) { setProfile(p); setTasks(p.tasks); setVibe(p.vibe); }
  function handleVibeChange(v) { setVibe(v); store.set("mb_profile", { ...profile, vibe: v }); }
  function handleReset() { localStorage.removeItem("mb_profile"); localStorage.removeItem("mb_notif"); setProfile(null); setTasks([]); setVibe(""); setReady(false); }
  function handleSaveNotif(s) { setNotifSettings(s); store.set("mb_notif", s); }
  function handleReady() { setReady(true); launchConfetti(); }

  const hour = now.getHours();
  const bgGradient = getBgGradient(hour);
  const streakEmoji = streak >= 30 ? "💎" : streak >= 14 ? "🔥" : streak >= 7 ? "⚡" : streak >= 3 ? "✨" : "🌱";

  if (loading) return <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ color: C.muted, fontFamily: C.mono, fontSize: 14, letterSpacing: "0.2em" }}>Loading…</div></div>;
  if (!profile) return <Onboarding onComplete={handleOnboardComplete} />;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Inter:wght@300;400;500;700&family=JetBrains+Mono:wght@400;500&display=swap');
        @keyframes pulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.7; } }
        @keyframes confettiFall { to { transform: translateY(110vh) rotate(720deg); opacity: 0; } }
        * { box-sizing: border-box; }
        body { margin: 0; background: ${C.bg}; }
        input::placeholder { color: rgba(255,255,255,0.2); }
        input:focus { border-color: rgba(249,115,22,0.6) !important; }
        input[type="date"] { color-scheme: dark; }
        select option { background: #0c0f1e; color: #f0ede6; }
      `}</style>

      <div style={{ ...S.root, background: bgGradient }}>
        <div style={S.topBar}>
          <span style={S.timeSmall}>{formatTime(now)}</span>
          <button style={{ ...S.settingsBtn, color: notifSettings.enabled && Notifs.permission() === "granted" ? C.accent1 : C.muted }} onClick={() => setShowSettings(true)}>
            {notifSettings.enabled && Notifs.permission() === "granted" ? "🔔" : "⚙"}
          </button>
        </div>

        <FadeIn delay={80}>
          <div style={S.greeting}>
            <div style={S.greetingLabel}>Morning Brief</div>
            <h1 style={S.greetingName}>{getGreeting(now)},<br />{profile.name}.</h1>
            <div style={S.greetingDate}>{formatDate(now)}</div>
            <div style={S.streakBadge}>{streakEmoji} {streak} day streak</div>
            {notifSettings.enabled && Notifs.permission() === "granted" && <div style={S.notifBadge}>🔔 {notifSettings.hour}:{notifSettings.min} {notifSettings.ampm}</div>}
          </div>
        </FadeIn>

        <FadeIn delay={150}><MoodCard /></FadeIn>
        {isSunday() && <FadeIn delay={220}><WeeklyReview streak={streak} tasks={tasks} /></FadeIn>}
        <FadeIn delay={220}><InsightCard name={profile.name} weather={weather} tasks={tasks} vibe={vibe} /></FadeIn>
        <FadeIn delay={300}><WeatherCard {...weather} /></FadeIn>
        <FadeIn delay={380}><TasksCard tasks={tasks} setTasks={setTasks} /></FadeIn>
        <FadeIn delay={440}><CountdownCard /></FadeIn>
        <FadeIn delay={500}><QuoteCard name={profile.name} vibe={vibe} onChangeVibe={handleVibeChange} /></FadeIn>

        <FadeIn delay={560}>
          <div style={S.mainTabRow}>
            {MAIN_TABS.map(tab => (
              <button key={tab} style={{ ...S.mainTab, ...(activeMainTab === tab ? S.mainTabActive : {}) }} onClick={() => setActiveMainTab(tab)}>{tab}</button>
            ))}
          </div>
        </FadeIn>

        <FadeIn delay={620}>
          {activeMainTab === "📰 News"     && <NewsTab />}
          {activeMainTab === "📈 Markets"  && <MarketsTab />}
          {activeMainTab === "🗓 History"  && <HistoryTab />}
          {activeMainTab === "🌍 Word"     && <WordTab />}
          {activeMainTab === "🏋️ Wellness" && <WellnessTab name={profile.name} />}
          {activeMainTab === "☕ Routine"  && <RoutineTab />}
        </FadeIn>

        <FadeIn delay={700}>
          <button style={{ ...S.readyBtn, ...(ready ? { opacity: 0.55 } : {}) }} onClick={handleReady}>
            {ready ? `✓ Go get it, ${profile.name}.` : "I'm ready for today"}
          </button>
        </FadeIn>
      </div>

      {showSettings && <SettingsPanel profile={profile} notifSettings={notifSettings} onSave={handleSaveNotif} onReset={handleReset} onClose={() => setShowSettings(false)} />}
    </>
  );
}