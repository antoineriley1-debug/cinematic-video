'use client';

import React, { useState, useRef, useEffect } from "react";
import {
  Upload, Film, Sparkles, Download, Share2, Instagram,
  Facebook, Play, Lock, Check, Loader2, Wand2, Crop,
  Clapperboard, Sun, Camera, Layers, Aperture
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import axios from "axios";

// ---- Look catalog: each maps to a real FFmpeg filter ----
const LOOKS = [
  { id: "clean", name: "Clean HD", cat: "base", minLevel: 1, ffmpeg: "eq=contrast=1.06:saturation=1.05:brightness=0.02" },
  { id: "social", name: "Social Premium", cat: "base", minLevel: 2, ffmpeg: "eq=contrast=1.08:saturation=1.16:brightness=0.03" },
  { id: "teal", name: "Teal / Orange", cat: "cine", minLevel: 3, ffmpeg: "colorbalance=rs=0.1:bs=-0.1:rm=-0.1:bm=0.1,eq=saturation=1.2:contrast=1.1" },
  { id: "kodak", name: "Kodak Warm", cat: "cine", minLevel: 3, ffmpeg: "eq=saturation=1.10:contrast=1.10:brightness=0.02,colorbalance=rs=0.08:bs=-0.05" },
  { id: "fuji", name: "Fuji Soft", cat: "cine", minLevel: 3, ffmpeg: "eq=contrast=0.96:saturation=0.95:brightness=0.05" },
  { id: "moody", name: "Netflix Moody", cat: "cine", minLevel: 3, ffmpeg: "eq=contrast=1.18:saturation=0.80:brightness=-0.08" },
  { id: "commerc", name: "Clean Commercial", cat: "cine", minLevel: 3, ffmpeg: "eq=contrast=1.05:saturation=1.08:brightness=0.06" },
  { id: "urban", name: "Urban", cat: "cine", minLevel: 3, ffmpeg: "eq=contrast=1.16:saturation=0.90:brightness=-0.03" },
  { id: "mv", name: "Music Video", cat: "cine", minLevel: 3, ffmpeg: "eq=contrast=1.22:saturation=1.30:brightness=0.02" },
  { id: "lux", name: "Luxury Brand", cat: "cine", minLevel: 3, ffmpeg: "eq=contrast=1.08:saturation=0.92:brightness=0.02" },
  { id: "doc", name: "Warm Doc", cat: "cine", minLevel: 3, ffmpeg: "eq=saturation=1.06:brightness=0.03,colorbalance=rs=0.06:bs=-0.02" },
  { id: "bw", name: "B&W Film", cat: "cine", minLevel: 3, ffmpeg: "format=gray,eq=contrast=1.22" },
];

const LEVELS = [
  { n: 1, name: "Clean HD", desc: "Sharpen · denoise · stabilize · contrast", icon: Sun },
  { n: 2, name: "Social Premium", desc: "Auto color · vibrance · reel-ready", icon: Camera },
  { n: 3, name: "Cinematic", desc: "Film contrast · LUTs · grain · bars", icon: Clapperboard },
  { n: 4, name: "Movie Theater", desc: "AI upscale · HDR · premium master", icon: Aperture, pro: true },
];

const FORMATS = [
  { id: "reel", label: "Reel 9:16", ratio: "9:16" },
  { id: "story", label: "Story 9:16", ratio: "9:16" },
  { id: "tiktok", label: "TikTok 9:16", ratio: "9:16" },
  { id: "shorts", label: "Shorts 9:16", ratio: "9:16" },
  { id: "feed", label: "Feed 1:1", ratio: "1:1" },
  { id: "yt", label: "YouTube 16:9", ratio: "16:9" },
  { id: "master", label: "4K Master", ratio: "16:9", pro: true },
];

const C = {
  bg: "#0a0908", panel: "#13110f", panel2: "#1b1815",
  line: "#2a2622", amber: "#e8a04b", amberDim: "#a8743220",
  text: "#f4efe9", sub: "#9a8f82", faint: "#6b6258",
};

export function CineStudio() {
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [level, setLevel] = useState(2);
  const [look, setLook] = useState("social");
  const [grain, setGrain] = useState(20);
  const [bars, setBars] = useState(false);
  const [stabilize, setStabilize] = useState(true);
  const [slider, setSlider] = useState(55);
  const [formats, setFormats] = useState(["reel"]);
  const [rendering, setRendering] = useState(false);
  const [renderProg, setRenderProg] = useState<Record<string, number>>({});
  const [done, setDone] = useState<string[]>([]);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const vBefore = useRef<HTMLVideoElement>(null);
  const vAfter = useRef<HTMLVideoElement>(null);
  const dragRef = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user);
    });
  }, []);

  const activeLook = LOOKS.find(l => l.id === look) || LOOKS[0];

  function loadFile(file: File | undefined) {
    if (!file || !file.type.startsWith("video")) return;
    setVideoUrl(URL.createObjectURL(file));
    setFileName(file.name);
    setDone([]);
    setRenderProg({});
    setVideoId(null);
  }

  // Keep preview videos in sync
  useEffect(() => {
    const a = vAfter.current, b = vBefore.current;
    if (!a || !b) return;
    const sync = () => {
      if (Math.abs(a.currentTime - b.currentTime) > 0.15) b.currentTime = a.currentTime;
    };
    a.addEventListener("timeupdate", sync);
    return () => a.removeEventListener("timeupdate", sync);
  }, [videoUrl]);

  function onSlide(e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = (e instanceof TouchEvent ? e.touches[0].clientX : (e as React.MouseEvent).clientX) - r.left;
    setSlider(Math.max(0, Math.min(100, (x / r.width) * 100)));
  }

  function toggleFormat(id: string) {
    setFormats(f => f.includes(id) ? f.filter(x => x !== id) : [...f, id]);
  }

  async function uploadVideo() {
    if (!fileRef.current?.files?.[0] || !user) return;
    const file = fileRef.current.files[0];

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('userId', user.id);

      const response = await axios.post('/api/upload', formData);
      setVideoId(response.data.videoId);
      alert('✅ Video uploaded!');
    } catch (error: any) {
      alert(`Upload failed: ${error.message}`);
    }
  }

  async function runRender() {
    if (!videoId || formats.length === 0 || rendering) return;

    setRendering(true);
    setDone([]);
    setRenderProg({});

    try {
      // Call the backend to process with the selected look
      const response = await axios.post('/api/process', {
        videoId,
        gradePreset: look,
      });

      // Simulate progress bars (in real app, these would come from job tracking)
      formats.forEach((id, i) => {
        let p = 0;
        const tick = setInterval(() => {
          p += Math.random() * 9 + 4;
          setRenderProg(prev => ({ ...prev, [id]: Math.min(100, p) }));
          if (p >= 100) {
            clearInterval(tick);
            setDone(d => [...d, id]);
            if (i === formats.length - 1) {
              setTimeout(() => setRendering(false), 400);
              alert('✅ Processing complete!');
            }
          }
        }, 220 + i * 90);
      });
    } catch (error: any) {
      alert(`Processing failed: ${error.message}`);
      setRendering(false);
    }
  }

  const availableLooks = LOOKS.filter(l => l.minLevel <= level);
  useEffect(() => {
    if (!availableLooks.find(l => l.id === look)) setLook(availableLooks[0].id);
  }, [level]);

  return (
    <div style={{ background: C.bg, color: "#f4efe9", minHeight: "100vh", fontFamily: "'Hanken Grotesk', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,500;9..144,600&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');
        .grain-tex { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E"); }
        .fade-up { animation: fadeUp .5s cubic-bezier(.2,.7,.3,1) both; }
        @keyframes fadeUp { from { opacity:0; transform: translateY(10px);} to {opacity:1; transform:none;} }
        .ph::placeholder { color:#6b6258; }
        input[type=range]{ -webkit-appearance:none; height:3px; border-radius:3px; background:#2a2622; }
        input[type=range]::-webkit-slider-thumb{ -webkit-appearance:none; width:15px;height:15px;border-radius:50%;background:#e8a04b; cursor:pointer; box-shadow:0 0 0 4px #e8a04b22; }
      `}</style>

      {/* grain overlay */}
      <div className="grain-tex" style={{ position: "fixed", inset: 0, opacity: 0.04, pointerEvents: "none", mixBlendMode: "overlay", zIndex: 50 }} />

      {/* top bar */}
      <header style={{ borderBottom: `1px solid ${C.line}`, position: "sticky", top: 0, zIndex: 40, background: "rgba(10,9,8,0.85)", backdropFilter: "blur(10px)" }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div className="flex items-center gap-3">
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(140deg,#e8a04b,#b5651d)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Film size={18} color="#0a0908" strokeWidth={2.4} />
            </div>
            <div>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 21, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1 }}>CineStudio</div>
              <div style={{ fontSize: 10.5, color: C.faint, letterSpacing: "0.18em", textTransform: "uppercase" }}>AI Cinematic Suite</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span style={{ fontSize: 12.5, color: C.sub, border: `1px solid ${C.line}`, borderRadius: 999, padding: "6px 13px" }}>
              <span style={{ color: C.amber, fontWeight: 600 }}>∞</span> credits
            </span>
            <button onClick={() => fileRef.current?.click()} style={{ background: C.amber, color: "#0a0908", fontWeight: 600, fontSize: 13, borderRadius: 9, padding: "9px 16px", border: "none", cursor: "pointer" }}>
              New Video
            </button>
          </div>
        </div>
      </header>

      <input ref={fileRef} type="file" accept="video/*" hidden onChange={e => {
        loadFile(e.target.files?.[0]);
        setTimeout(() => uploadVideo(), 100);
      }} />

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "28px 24px 80px" }} className="grid gap-7">
        <div className="grid gap-7" style={{ gridTemplateColumns: "minmax(0,1.55fr) minmax(0,1fr)" }}>

          {/* ============ PREVIEW ============ */}
          <section className="fade-up">
            <div style={{ borderRadius: 18, overflow: "hidden", border: `1px solid ${C.line}`, background: "#000", position: "relative", aspectRatio: "16/9" }}>
              {!videoUrl || videoUrl.length === 0 ? (
                <div
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={e => { e.preventDefault(); setDragging(false); loadFile(e.dataTransfer.files?.[0]); }}
                  onClick={() => fileRef.current?.click()}
                  style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, cursor: "pointer", background: dragging ? C.amberDim : "radial-gradient(circle at 50% 40%, #1b1815, #0a0908)", transition: "background .2s" }}>
                  <div style={{ width: 60, height: 60, borderRadius: 16, border: `1.5px dashed ${dragging ? C.amber : C.line}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Upload size={26} color={dragging ? C.amber : C.sub} />
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "'Fraunces',serif", fontSize: 19, fontWeight: 500 }}>Drop a video to begin</div>
                    <div style={{ fontSize: 13, color: C.sub, marginTop: 4 }}>Drag & drop, or tap to upload from your phone</div>
                  </div>
                  <div style={{ fontSize: 11, color: C.faint, letterSpacing: "0.08em" }}>MP4 · MOV · ProRes · Apple Log · up to 4K</div>
                </div>
              ) : (
                <div
                  style={{ position: "absolute", inset: 0, cursor: "ew-resize", userSelect: "none" }}
                  onMouseDown={() => (dragRef.current = true)}
                  onMouseUp={() => (dragRef.current = false)}
                  onMouseLeave={() => (dragRef.current = false)}
                  onMouseMove={onSlide as any}
                  onTouchStart={() => (dragRef.current = true)}
                  onTouchEnd={() => (dragRef.current = false)}
                  onTouchMove={onSlide as any}
                >
                  {/* BEFORE (original) */}
                  <video ref={vBefore} src={videoUrl} muted loop autoPlay playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                  {/* AFTER (graded) clipped from left to slider */}
                  <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${100 - slider}% 0 0)` }}>
                    <video ref={vAfter} src={videoUrl} muted loop autoPlay playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: `${activeLook.ffmpeg}${level === 4 ? " contrast(1.04)" : ""}` }} />
                    {grain > 0 && <div className="grain-tex" style={{ position: "absolute", inset: 0, opacity: grain / 330, mixBlendMode: "overlay" }} />}
                    {bars && <>
                      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "12%", background: "#000" }} />
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "12%", background: "#000" }} />
                    </>}
                  </div>
                  {/* handle */}
                  <div style={{ position: "absolute", top: 0, bottom: 0, left: `${slider}%`, width: 2, background: C.amber, transform: "translateX(-1px)" }}>
                    <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 34, height: 34, borderRadius: 999, background: C.amber, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 14px rgba(0,0,0,.5)" }}>
                      <span style={{ color: "#0a0908", fontSize: 12, fontWeight: 700 }}>⇄</span>
                    </div>
                  </div>
                  {/* labels */}
                  <span style={{ position: "absolute", top: 12, left: 12, fontSize: 10.5, letterSpacing: "0.12em", color: "#fff", background: "rgba(0,0,0,.55)", padding: "4px 9px", borderRadius: 6 }}>AFTER · {activeLook.name.toUpperCase()}</span>
                  <span style={{ position: "absolute", top: 12, right: 12, fontSize: 10.5, letterSpacing: "0.12em", color: "#fff", background: "rgba(0,0,0,.55)", padding: "4px 9px", borderRadius: 6 }}>BEFORE</span>
                </div>
              )}
            </div>
            {videoUrl && (
              <div className="flex items-center justify-between" style={{ marginTop: 12 }}>
                <span style={{ fontSize: 12.5, color: C.sub, display: "flex", alignItems: "center", gap: 7 }}>
                  <Film size={14} color={C.faint} /> {fileName}
                </span>
                <span style={{ fontSize: 11.5, color: C.faint }}>Drag the divider — looks render live on your footage</span>
              </div>
            )}
          </section>

          {/* ============ CONTROL RAIL ============ */}
          <section className="fade-up flex flex-col gap-5" style={{ animationDelay: ".06s" }}>

            {/* levels */}
            <Panel title="Quality Level" icon={Layers}>
              <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
                {LEVELS.map(l => {
                  const Ico = l.icon;
                  const on = level === l.n;
                  return (
                    <button key={l.n} onClick={() => setLevel(l.n)} style={{ textAlign: "left", borderRadius: 12, padding: "11px 12px", border: `1px solid ${on ? C.amber : C.line}`, background: on ? C.amberDim : C.panel2, cursor: "pointer", position: "relative" }}>
                      {l.pro && <span style={{ position: "absolute", top: 9, right: 9, fontSize: 8.5, letterSpacing: "0.1em", color: C.amber, border: `1px solid ${C.amber}`, borderRadius: 5, padding: "1px 5px" }}>PRO</span>}
                      <Ico size={16} color={on ? C.amber : C.sub} />
                      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 7, color: on ? "#fff" : "#e8e1d8" }}>Lv {l.n} · {l.name}</div>
                      <div style={{ fontSize: 10.5, color: C.faint, marginTop: 2, lineHeight: 1.35 }}>{l.desc}</div>
                    </button>
                  );
                })}
              </div>
            </Panel>

            {/* looks */}
            <Panel title="Film Look" icon={Wand2}>
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
                {availableLooks.map(l => {
                  const on = look === l.id;
                  return (
                    <button key={l.id} onClick={() => setLook(l.id)} style={{ borderRadius: 10, overflow: "hidden", border: `1.5px solid ${on ? C.amber : C.line}`, background: C.panel2, cursor: "pointer", padding: 0 }}>
                      <div style={{ height: 34, background: "linear-gradient(120deg,#3a5a6a,#c98a4a,#e8c89a)" }} />
                      <div style={{ fontSize: 10, fontWeight: 600, padding: "6px 4px", color: on ? "#fff" : C.sub, textAlign: "center" }}>{l.name}</div>
                    </button>
                  );
                })}
              </div>
              {level < 3 && <p style={{ fontSize: 11, color: C.faint, marginTop: 10 }}>Cinematic LUTs unlock at Level 3.</p>}
            </Panel>

            {/* fine controls */}
            <Panel title="Grade Controls" icon={Sparkles}>
              <Row label="Film grain">
                <input type="range" min={0} max={60} value={grain} onChange={e => setGrain(+e.target.value)} style={{ width: 130 }} />
              </Row>
              <Toggle label="Cinematic bars (2.39:1)" on={bars} set={setBars} />
              <Toggle label="Stabilization" on={stabilize} set={setStabilize} />
            </Panel>
          </section>
        </div>

        {/* ============ EXPORT ============ */}
        <section className="fade-up grid gap-7" style={{ gridTemplateColumns: "minmax(0,1.55fr) minmax(0,1fr)", animationDelay: ".12s" }}>
          <Panel title="Export Formats" icon={Crop}>
            <div className="flex flex-wrap gap-2">
              {FORMATS.map(f => {
                const on = formats.includes(f.id);
                return (
                  <button key={f.id} onClick={() => toggleFormat(f.id)} style={{ fontSize: 12.5, fontWeight: 500, borderRadius: 9, padding: "8px 13px", border: `1px solid ${on ? C.amber : C.line}`, background: on ? C.amberDim : C.panel2, color: on ? "#fff" : C.sub, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                    {on && <Check size={13} color={C.amber} />} {f.label} {f.pro && <span style={{ fontSize: 8, color: C.amber }}>PRO</span>}
                  </button>
                );
              })}
            </div>

            <button onClick={runRender} disabled={!videoUrl || formats.length === 0 || rendering}
              style={{ marginTop: 16, width: "100%", background: (!videoUrl || rendering) ? C.panel2 : C.amber, color: (!videoUrl || rendering) ? C.faint : "#0a0908", fontWeight: 600, fontSize: 14, borderRadius: 11, padding: "13px", border: "none", cursor: videoUrl && !rendering ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {rendering ? <><Loader2 size={16} className="animate-spin" /> Rendering…</> : <><Play size={15} /> Render {formats.length || ""} format{formats.length !== 1 ? "s" : ""}</>}
            </button>

            {(rendering || done.length > 0) && (
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                {formats.map(id => {
                  const f = FORMATS.find(x => x.id === id);
                  const prog = renderProg[id] || 0;
                  const fin = done.includes(id);
                  return (
                    <div key={id} className="flex items-center gap-3">
                      <span style={{ fontSize: 12, color: C.sub, width: 92 }}>{f?.label}</span>
                      <div style={{ flex: 1, height: 5, borderRadius: 5, background: C.line, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${prog}%`, background: C.amber, transition: "width .2s" }} />
                      </div>
                      {fin
                        ? <span style={{ fontSize: 11.5, color: C.amber, display: "flex", alignItems: "center", gap: 4 }}><Download size={13} /> Ready</span>
                        : <span style={{ fontSize: 11.5, color: C.faint, width: 34, textAlign: "right" }}>{Math.round(prog)}%</span>}
                    </div>
                  );
                })}
              </div>
            )}

            {done.length > 0 && !rendering && (
              <div className="flex gap-2" style={{ marginTop: 14 }}>
                <a href={videoUrl} download style={{ flex: 1, textAlign: "center", fontSize: 12.5, fontWeight: 600, color: "#fff", border: `1px solid ${C.line}`, borderRadius: 9, padding: "10px", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Download size={14} /> Save to phone</a>
                <button style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: "#0a0908", background: C.amber, border: "none", borderRadius: 9, padding: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Share2 size={14} /> Share</button>
              </div>
            )}
          </Panel>

          {/* publish (phase 2 / locked) */}
          <Panel title="Publish" icon={Share2} badge="Phase 2 · Meta review">
            <div style={{ opacity: 0.6 }}>
              <textarea placeholder="AI-generated caption will appear here…" className="ph" rows={3} style={{ width: "100%", background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 10, padding: 10, color: "#e8e1d8", fontSize: 12.5, resize: "none", fontFamily: "inherit" }} />
              <div className="flex gap-2" style={{ marginTop: 10 }}>
                <LockBtn icon={Instagram} label="Instagram" />
                <LockBtn icon={Facebook} label="Facebook" />
              </div>
            </div>
            <p style={{ fontSize: 11, color: C.faint, marginTop: 10, lineHeight: 1.45 }}>
              <Lock size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "-1px" }} />
              One-click posting activates after Meta app review (Business account, 2–4 wks). Caption & hashtag generation work in Phase 1.5.
            </p>
          </Panel>
        </section>
      </main>
    </div>
  );
}

function Panel({ title, icon: Icon, badge, children }: any) {
  return (
    <div style={{ background: "#13110f", border: "1px solid #2a2622", borderRadius: 16, padding: 18 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
        <div className="flex items-center gap-2">
          <Icon size={15} color="#e8a04b" />
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.02em" }}>{title}</span>
        </div>
        {badge && <span style={{ fontSize: 9.5, color: "#9a8f82", border: "1px solid #2a2622", borderRadius: 6, padding: "3px 7px", letterSpacing: "0.04em" }}>{badge}</span>}
      </div>
      {children}
    </div>
  );
}

function Row({ label, children }: any) {
  return <div className="flex items-center justify-between" style={{ padding: "7px 0" }}><span style={{ fontSize: 12.5, color: "#c9bfb3" }}>{label}</span>{children}</div>;
}

function Toggle({ label, on, set }: any) {
  return (
    <div className="flex items-center justify-between" style={{ padding: "7px 0" }}>
      <span style={{ fontSize: 12.5, color: "#c9bfb3" }}>{label}</span>
      <button onClick={() => set(!on)} style={{ width: 40, height: 22, borderRadius: 999, border: "none", cursor: "pointer", background: on ? "#e8a04b" : "#2a2622", position: "relative", transition: "background .2s" }}>
        <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 16, height: 16, borderRadius: 999, background: "#0a0908", transition: "left .2s" }} />
      </button>
    </div>
  );
}

function LockBtn({ icon: Icon, label }: any) {
  return (
    <button style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontSize: 12.5, color: "#9a8f82", background: "#1b1815", border: "1px solid #2a2622", borderRadius: 9, padding: "10px", cursor: "not-allowed" }}>
      <Icon size={14} /> {label} <Lock size={11} />
    </button>
  );
}
