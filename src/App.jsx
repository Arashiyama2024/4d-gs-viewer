import { useState, useEffect, useRef, useMemo, useCallback } from "react";

/* ═══════════════════════════════════════════════
   PLY パーサー（3D Gaussian Splatting 出力形式）
   バイナリ little-endian PLY を読み取り、
   各ガウシアンの位置・色・不透明度・サイズを抽出
   ═══════════════════════════════════════════════ */
async function parsePLY(buffer) {
  const decoder = new TextDecoder();
  const bytes = new Uint8Array(buffer);

  // ヘッダー終端を検索
  let headerEnd = 0;
  for (let i = 0; i < Math.min(bytes.length, 4096); i++) {
    if (bytes[i]===0x65 && bytes[i+1]===0x6e && bytes[i+2]===0x64 && bytes[i+3]===0x5f &&
        bytes[i+4]===0x68 && bytes[i+5]===0x65 && bytes[i+6]===0x61 && bytes[i+7]===0x64 &&
        bytes[i+8]===0x65 && bytes[i+9]===0x72) { // "end_header"
      // 改行の後がデータ開始
      headerEnd = i + 10;
      while (headerEnd < bytes.length && bytes[headerEnd] !== 0x0a) headerEnd++;
      headerEnd++;
      break;
    }
  }
  if (headerEnd === 0) throw new Error("PLYヘッダーが見つかりません");

  const headerText = decoder.decode(bytes.slice(0, headerEnd));
  const lines = headerText.split("\n").map(l => l.trim());

  // 頂点数
  let vertexCount = 0;
  const properties = [];
  let inVertex = false;

  for (const line of lines) {
    if (line.startsWith("element vertex")) {
      vertexCount = parseInt(line.split(/\s+/)[2]);
      inVertex = true;
    } else if (line.startsWith("element") && inVertex) {
      inVertex = false;
    } else if (line.startsWith("property") && inVertex) {
      const parts = line.split(/\s+/);
      const type = parts[1];
      const name = parts[2];
      let byteSize = 4;
      if (type === "double") byteSize = 8;
      else if (type === "uchar" || type === "uint8") byteSize = 1;
      else if (type === "short" || type === "int16") byteSize = 2;
      properties.push({ name, type, byteSize });
    }
  }

  if (vertexCount === 0) throw new Error("頂点数が0です");

  // プロパティ名→インデックスのマップ
  const propMap = {};
  let stride = 0;
  properties.forEach((p, i) => { propMap[p.name] = { index: i, offset: stride, type: p.type, byteSize: p.byteSize }; stride += p.byteSize; });

  const readFloat = (view, offset, prop) => {
    if (prop.type === "float" || prop.type === "float32") return view.getFloat32(offset + prop.offset, true);
    if (prop.type === "double" || prop.type === "float64") return view.getFloat64(offset + prop.offset, true);
    if (prop.type === "uchar" || prop.type === "uint8") return view.getUint8(offset + prop.offset) / 255;
    if (prop.type === "short" || prop.type === "int16") return view.getInt16(offset + prop.offset, true);
    return view.getFloat32(offset + prop.offset, true);
  };

  const dataView = new DataView(buffer, headerEnd);
  const splats = [];

  // SH係数の0次（f_dc_0, f_dc_1, f_dc_2）からRGBを計算
  const sh2rgb = (sh) => 0.5 + 0.28209479177387814 * sh;

  for (let i = 0; i < vertexCount; i++) {
    const base = i * stride;
    if (base + stride > buffer.byteLength - headerEnd) break;

    const x = propMap.x ? readFloat(dataView, base, propMap.x) : 0;
    const y = propMap.y ? readFloat(dataView, base, propMap.y) : 0;
    const z = propMap.z ? readFloat(dataView, base, propMap.z) : 0;

    // 色: SH dc成分 or red/green/blue
    let r = 0.5, g = 0.5, b = 0.5;
    if (propMap.f_dc_0) {
      r = Math.max(0, Math.min(1, sh2rgb(readFloat(dataView, base, propMap.f_dc_0))));
      g = Math.max(0, Math.min(1, sh2rgb(readFloat(dataView, base, propMap.f_dc_1))));
      b = Math.max(0, Math.min(1, sh2rgb(readFloat(dataView, base, propMap.f_dc_2))));
    } else if (propMap.red) {
      r = readFloat(dataView, base, propMap.red);
      g = readFloat(dataView, base, propMap.green);
      b = readFloat(dataView, base, propMap.blue);
      if (propMap.red.type === "uchar" || propMap.red.type === "uint8") { /* already /255 */ }
    }

    // 不透明度: sigmoid(opacity)
    let opacity = 0.8;
    if (propMap.opacity) {
      const raw = readFloat(dataView, base, propMap.opacity);
      opacity = 1 / (1 + Math.exp(-raw)); // sigmoid
    }

    // サイズ: scale_0〜2 の指数→平均
    let size = 0.01;
    if (propMap.scale_0) {
      const s0 = Math.exp(readFloat(dataView, base, propMap.scale_0));
      const s1 = Math.exp(readFloat(dataView, base, propMap.scale_1));
      const s2 = Math.exp(readFloat(dataView, base, propMap.scale_2));
      size = (s0 + s1 + s2) / 3;
    }

    if (opacity > 0.02 && isFinite(x) && isFinite(y) && isFinite(z)) {
      splats.push({ x, y, z, r, g, b, opacity, size: Math.min(size, 0.1), part: "loaded" });
    }
  }
  return splats;
}

/* ═══════════════════════════════════════════════
   .splat パーサー（antimatter15 形式）
   32バイト/スプラット: pos(12) + scale(12) + rgba(4) + rot(4)... 
   実際は可変。antimatter15形式: 各スプラットが 32 bytes
   x,y,z (float32 ×3), scale0,1,2 (float32 ×3), r,g,b,a (uint8 ×4), rot0-3 (uint8 ×4) -- 但しこれは圧縮版
   ═══════════════════════════════════════════════ */
async function parseSplat(buffer) {
  const SPLAT_SIZE = 32; // antimatter15の.splat: 32 bytes per splat
  const count = Math.floor(buffer.byteLength / SPLAT_SIZE);
  if (count === 0) throw new Error(".splatファイルが空です");

  const f32 = new Float32Array(buffer);
  const u8 = new Uint8Array(buffer);
  const splats = [];

  for (let i = 0; i < count; i++) {
    const fi = i * 8; // 32 bytes = 8 float32s
    const bi = i * 32;

    const x = f32[fi + 0];
    const y = f32[fi + 1];
    const z = f32[fi + 2];

    // scale は float32 として格納されている場合
    const s0 = f32[fi + 3];
    const s1 = f32[fi + 4];
    const s2 = f32[fi + 5];
    const size = (Math.abs(s0) + Math.abs(s1) + Math.abs(s2)) / 3;

    // RGBA は byte 24-27
    const r = u8[bi + 24] / 255;
    const g = u8[bi + 25] / 255;
    const b = u8[bi + 26] / 255;
    const opacity = u8[bi + 27] / 255;

    if (opacity > 0.02 && isFinite(x) && isFinite(y) && isFinite(z)) {
      splats.push({ x, y, z, r, g, b, opacity, size: Math.min(Math.max(size, 0.001), 0.1), part: "loaded" });
    }
  }
  return splats;
}

/* ═══════════════════════════════════════════════
   ファイル読み込みハンドラ
   ═══════════════════════════════════════════════ */
async function loadSplatFile(file) {
  const buffer = await file.arrayBuffer();
  const name = file.name.toLowerCase();
  if (name.endsWith(".ply")) return await parsePLY(buffer);
  if (name.endsWith(".splat")) return await parseSplat(buffer);
  throw new Error(`未対応形式: ${file.name}`);
}

async function loadSplatURL(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`取得失敗: ${resp.status}`);
  const buffer = await resp.arrayBuffer();
  const name = url.toLowerCase();
  if (name.includes(".ply")) return await parsePLY(buffer);
  return await parseSplat(buffer);
}

/* ═══════════════════════════════════════════════
   自動センタリング・スケーリング
   読み込んだスプラットを原点中心、適切なサイズに調整
   ═══════════════════════════════════════════════ */
function normalizeSplats(rawSplats) {
  if (rawSplats.length === 0) return rawSplats;
  let cx=0, cy=0, cz=0;
  for (const s of rawSplats) { cx+=s.x; cy+=s.y; cz+=s.z; }
  cx/=rawSplats.length; cy/=rawSplats.length; cz/=rawSplats.length;

  // 中心からの最大距離で正規化
  let maxDist = 0;
  for (const s of rawSplats) {
    const d = Math.sqrt((s.x-cx)**2 + (s.y-cy)**2 + (s.z-cz)**2);
    if (d > maxDist) maxDist = d;
  }
  const scale = maxDist > 0 ? 1.5 / maxDist : 1;

  return rawSplats.map(s => ({
    ...s,
    x: (s.x - cx) * scale,
    y: (s.y - cy) * scale + 1.0, // Yオフセットでカメラのターゲット付近に
    z: (s.z - cz) * scale,
    size: s.size * scale,
  }));
}

/* ═══════════════════════════════════════════════
   デモ人型モデル生成
   ═══════════════════════════════════════════════ */
function generateHumanSplats() {
  const s = [];
  const add = (cx,cy,cz,rx,ry,rz,n,r,g,b,part) => {
    for (let i=0;i<n;i++) {
      s.push({
        x:cx+(Math.random()*2-1)*rx, y:cy+(Math.random()*2-1)*ry, z:cz+(Math.random()*2-1)*rz,
        size:.006+Math.random()*.015, opacity:.5+Math.random()*.5,
        r:Math.max(0,Math.min(1,r+(Math.random()-.5)*.12)),
        g:Math.max(0,Math.min(1,g+(Math.random()-.5)*.12)),
        b:Math.max(0,Math.min(1,b+(Math.random()-.5)*.12)), part,
      });
    }
  };
  add(0,1.65,0,.10,.12,.10,550,.92,.78,.68,"head");
  add(0,1.78,-.02,.11,.06,.11,250,.15,.10,.08,"hair");
  add(0,1.15,0,.18,.25,.10,800,.30,.48,.75,"torso");
  add(-.25,1.30,0,.05,.15,.05,250,.30,.48,.75,"Lup");
  add(-.28,1.05,0,.05,.12,.05,200,.30,.48,.75,"Llo");
  add(-.30,.88,0,.04,.06,.04,120,.90,.76,.66,"Lhd");
  add(.25,1.30,0,.05,.15,.05,250,.30,.48,.75,"Rup");
  add(.28,1.05,0,.05,.12,.05,200,.30,.48,.75,"Rlo");
  add(.30,.88,0,.04,.06,.04,120,.90,.76,.66,"Rhd");
  add(-.10,.65,0,.07,.18,.07,350,.20,.20,.26,"Lth");
  add(-.10,.35,0,.06,.14,.06,280,.20,.20,.26,"Lsh");
  add(-.10,.18,.04,.05,.03,.09,120,.16,.14,.12,"Lft");
  add(.10,.65,0,.07,.18,.07,350,.20,.20,.26,"Rth");
  add(.10,.35,0,.06,.14,.06,280,.20,.20,.26,"Rsh");
  add(.10,.18,.04,.05,.03,.09,120,.16,.14,.12,"Rft");
  return s;
}

/* ═══════════════════════════════════════════════
   ダンスアニメーション（デモモデル専用）
   ═══════════════════════════════════════════════ */
function danceOffset(part, t) {
  if (part === "loaded") return { dx:0, dy:0, dz:0 }; // 外部データはアニメーションなし
  const beat = t * 4;
  const b1 = Math.sin(beat * Math.PI);
  let dx=0, dy=Math.abs(b1)*.04, dz=0;
  if(part==="torso"){dx+=Math.sin(beat*Math.PI)*.03;dz+=Math.cos(beat*Math.PI)*.02;}
  if(part==="head"||part==="hair"){dx+=Math.sin(beat*Math.PI*.5)*.02;dy+=Math.abs(b1)*.04+Math.sin(beat*Math.PI)*.01;}
  if(part==="Lup"){dx+=-.08+Math.sin(beat*Math.PI)*.12;dy+=Math.abs(Math.sin(beat*Math.PI))*.15;}
  if(part==="Llo"){dx+=-.05+Math.sin(beat*Math.PI)*.10;dy+=Math.abs(Math.sin(beat*Math.PI))*.20;}
  if(part==="Lhd"){dx+=-.03+Math.sin(beat*Math.PI)*.08;dy+=Math.abs(Math.sin(beat*Math.PI))*.25;}
  if(part==="Rup"){dx+=.08+Math.sin(beat*Math.PI+Math.PI)*.12;dy+=Math.abs(Math.sin(beat*Math.PI+Math.PI))*.15;}
  if(part==="Rlo"){dx+=.05+Math.sin(beat*Math.PI+Math.PI)*.10;dy+=Math.abs(Math.sin(beat*Math.PI+Math.PI))*.20;}
  if(part==="Rhd"){dx+=.03+Math.sin(beat*Math.PI+Math.PI)*.08;dy+=Math.abs(Math.sin(beat*Math.PI+Math.PI))*.25;}
  if(part==="Lth"){dx+=Math.sin(beat*Math.PI)*.05;dz+=Math.sin(beat*Math.PI)*.04;dy+=Math.max(0,Math.sin(beat*Math.PI))*.03;}
  if(part==="Lsh"){dx+=Math.sin(beat*Math.PI)*.06;dz+=Math.sin(beat*Math.PI)*.06;dy+=Math.max(0,Math.sin(beat*Math.PI))*.05;}
  if(part==="Lft"){dx+=Math.sin(beat*Math.PI)*.06;dz+=Math.sin(beat*Math.PI)*.06;dy+=Math.max(0,Math.sin(beat*Math.PI))*.06;}
  if(part==="Rth"){dx+=Math.sin(beat*Math.PI+Math.PI)*.05;dz+=Math.sin(beat*Math.PI+Math.PI)*.04;dy+=Math.max(0,Math.sin(beat*Math.PI+Math.PI))*.03;}
  if(part==="Rsh"){dx+=Math.sin(beat*Math.PI+Math.PI)*.06;dz+=Math.sin(beat*Math.PI+Math.PI)*.06;dy+=Math.max(0,Math.sin(beat*Math.PI+Math.PI))*.05;}
  if(part==="Rft"){dx+=Math.sin(beat*Math.PI+Math.PI)*.06;dz+=Math.sin(beat*Math.PI+Math.PI)*.06;dy+=Math.max(0,Math.sin(beat*Math.PI+Math.PI))*.06;}
  return {dx,dy,dz};
}

/* ═══════════════════════════════════════════════
   シーン・カメラ・配信プリセット
   ═══════════════════════════════════════════════ */
const SCENE_PRESETS = [
  { id:"default",name:"デフォルトスタジオ",icon:"🎬",desc:"暗いスタジオ環境",bgColor:"#0b0b12",gridColor:"rgba(93,202,165,.04)",gridEnabled:true,trackingMarkers:false,hudColor:"rgba(255,255,255,.25)" },
  { id:"tracking",name:"3Dトラッキングスタジオ",icon:"📐",desc:"グリーンバック+トラッキングポイント",bgColor:"#00b140",gridColor:"rgba(0,0,0,.08)",gridEnabled:true,trackingMarkers:true,hudColor:"rgba(0,0,0,.3)" },
  { id:"chromakey",name:"クロマキー（配信用）",icon:"🟢",desc:"完全グリーン背景、OBSクロマキー用",bgColor:"#00b140",gridColor:"transparent",gridEnabled:false,trackingMarkers:false,hudColor:"rgba(0,0,0,.25)" },
];

const TRACKING_MARKERS_3D = [
  {x:-1.5,y:0,z:-1.5},{x:-.75,y:0,z:-1.5},{x:.75,y:0,z:-1.5},{x:1.5,y:0,z:-1.5},
  {x:-1.5,y:0,z:-.75},{x:1.5,y:0,z:-.75},{x:-1.5,y:0,z:.75},{x:1.5,y:0,z:.75},
  {x:-1.5,y:0,z:1.5},{x:-.75,y:0,z:1.5},{x:.75,y:0,z:1.5},{x:1.5,y:0,z:1.5},
  {x:-1.8,y:.5,z:-2},{x:-1.2,y:.5,z:-2},{x:-.6,y:.5,z:-2},{x:.6,y:.5,z:-2},{x:1.2,y:.5,z:-2},{x:1.8,y:.5,z:-2},
  {x:-1.8,y:1.2,z:-2},{x:-1.0,y:1.2,z:-2},{x:1.0,y:1.2,z:-2},{x:1.8,y:1.2,z:-2},
  {x:-1.8,y:2.0,z:-2},{x:-1.0,y:2.0,z:-2},{x:0,y:2.2,z:-2},{x:1.0,y:2.0,z:-2},{x:1.8,y:2.0,z:-2},
  {x:-2,y:.5,z:-1.2},{x:-2,y:.5,z:0},{x:-2,y:.5,z:1.2},{x:-2,y:1.4,z:-1.2},{x:-2,y:1.4,z:0},{x:-2,y:1.4,z:1.2},
  {x:2,y:.5,z:-1.2},{x:2,y:.5,z:0},{x:2,y:.5,z:1.2},{x:2,y:1.4,z:-1.2},{x:2,y:1.4,z:0},{x:2,y:1.4,z:1.2},
  {x:-1.5,y:3.2,z:-1.5},{x:0,y:3.2,z:-1.5},{x:1.5,y:3.2,z:-1.5},{x:-1.5,y:3.2,z:0},{x:1.5,y:3.2,z:0},
];

const DEFAULT_PRESETS = [
  {id:1,name:"正面",icon:"🎬",theta:0,phi:.15,dist:3.0,fov:55,desc:"正面・全身"},
  {id:2,name:"バスト",icon:"👤",theta:0,phi:.25,dist:1.6,fov:40,desc:"上半身アップ"},
  {id:3,name:"右斜め",icon:"↗",theta:-.78,phi:.2,dist:2.8,fov:50,desc:"右斜め45°"},
  {id:4,name:"左斜め",icon:"↖",theta:.78,phi:.2,dist:2.8,fov:50,desc:"左斜め45°"},
  {id:5,name:"俯瞰",icon:"🔭",theta:0,phi:1.25,dist:3.5,fov:65,desc:"真上から見下ろす"},
  {id:6,name:"ロー",icon:"⬆",theta:.3,phi:-.35,dist:2.5,fov:50,desc:"地面下から見上げ"},
];

const BROADCAST_PRESETS = [
  {name:"OBS/YouTube",w:1920,h:1080,fps:30,label:"1080p"},
  {name:"Zoom/Teams",w:1280,h:720,fps:24,label:"720p"},
  {name:"YouTube 4K",w:3840,h:2160,fps:30,label:"4K"},
  {name:"Twitch",w:1920,h:1080,fps:60,label:"1080p60"},
];

const TIPS = {
  director:{icon:"🎛",title:"ディレクターパネル",body:"配信中にリアルタイムでカメラ操作。ボタンで即切替、スライダーで微調整。"},
  mouse:{icon:"🖱",title:"マウス操作",body:"左ドラッグ: 回転\nホイール: ズーム\n右ドラッグ: 仰角\nダブルクリック: 正面に戻る"},
  freeze:{icon:"⏸",title:"フリーズ",body:"停止で被写体ポーズ固定。カメラだけ自由に操作可能（VFX合成用）。"},
  scene:{icon:"🎨",title:"シーン設定",body:"デフォルト / 3Dトラッキング / クロマキーの3種。"},
  data:{icon:"📂",title:"データ読込",body:".ply（3DGS学習出力）と .splat（antimatter15形式）に対応。ファイルを選択またはドラッグ&ドロップで読み込みます。"},
};

function Tip({id}){
  const [open,setOpen]=useState(false);
  const t=TIPS[id]; if(!t) return null;
  return <span style={{position:"relative",display:"inline-block"}}>
    <button onClick={()=>setOpen(!open)} style={{width:18,height:18,borderRadius:"50%",border:"1px solid rgba(93,202,165,.4)",background:open?"#5DCAA5":"transparent",color:open?"#fff":"#5DCAA5",fontSize:10,fontWeight:700,cursor:"pointer",display:"inline-flex",alignItems:"center",justifyContent:"center",transition:"all .15s"}}>?</button>
    {open&&<div style={{position:"absolute",left:24,top:-6,width:280,padding:"12px 14px",background:"#1a1a24",border:"1px solid rgba(255,255,255,.1)",borderRadius:10,zIndex:200,boxShadow:"0 8px 28px rgba(0,0,0,.4)"}}>
      <div style={{fontSize:12,fontWeight:700,marginBottom:4,display:"flex",alignItems:"center",gap:5,color:"#e8e6df"}}><span>{t.icon}</span>{t.title}</div>
      <div style={{fontSize:11,lineHeight:1.7,color:"rgba(255,255,255,.5)",whiteSpace:"pre-line"}}>{t.body}</div>
      <button onClick={e=>{e.stopPropagation();setOpen(false)}} style={{position:"absolute",top:6,right:8,background:"none",border:"none",color:"rgba(255,255,255,.25)",cursor:"pointer",fontSize:13}}>×</button>
    </div>}
  </span>;
}

/* ═══════════════════════════════════════════════
   ルックアットカメラ + Canvas
   ═══════════════════════════════════════════════ */
const TARGET=[0,1.0,0];

function lookAtClean(wx,wy,wz,eye,fovS,W,H){
  let fx=TARGET[0]-eye[0],fy=TARGET[1]-eye[1],fz=TARGET[2]-eye[2];
  const fl=Math.sqrt(fx*fx+fy*fy+fz*fz)||1;
  fx/=fl;fy/=fl;fz/=fl;
  let rx=-fz,ry=0,rz=fx;
  const rl=Math.sqrt(rx*rx+rz*rz)||.001;
  rx/=rl;rz/=rl;
  const ux=ry*fz-rz*fy,uy=rz*fx-rx*fz,uz=rx*fy-ry*fx;
  const dx=wx-eye[0],dy=wy-eye[1],dz=wz-eye[2];
  const vx=rx*dx+ry*dy+rz*dz,vy=ux*dx+uy*dy+uz*dz,vz=fx*dx+fy*dy+fz*dz;
  if(vz<.1) return null;
  return {sx:W/2+(vx/vz)*fovS*W*.5, sy:H/2-(vy/vz)*fovS*H*.5, d:vz};
}

function SplatCanvas({splats,camera,time4D,resolution,isLive,playing,scene,onCameraChange}){
  const ref=useRef(null),raf=useRef(null);
  const drag=useRef({active:false,btn:0,lx:0,ly:0});
  const PHI_MIN=-.8,PHI_MAX=1.5;
  const getEye=useCallback(cam=>{
    const th=cam.theta||0,ph=cam.phi||.15,d=cam.dist||3;
    return [TARGET[0]+Math.sin(th)*Math.cos(ph)*d, TARGET[1]+Math.sin(ph)*d, TARGET[2]+Math.cos(th)*Math.cos(ph)*d];
  },[]);

  const onMouseDown=useCallback(e=>{e.preventDefault();drag.current={active:true,btn:e.button,lx:e.clientX,ly:e.clientY};},[]);
  const onMouseMove=useCallback(e=>{
    if(!drag.current.active)return;
    const dx=e.clientX-drag.current.lx,dy=e.clientY-drag.current.ly;
    drag.current.lx=e.clientX;drag.current.ly=e.clientY;
    if(drag.current.btn===0)onCameraChange(prev=>({...prev,theta:prev.theta-dx*.005,phi:Math.max(PHI_MIN,Math.min(PHI_MAX,prev.phi+dy*.005))}));
    else if(drag.current.btn===2)onCameraChange(prev=>({...prev,phi:Math.max(PHI_MIN,Math.min(PHI_MAX,prev.phi+dy*.005))}));
  },[onCameraChange]);
  const onMouseUp=useCallback(()=>{drag.current.active=false;},[]);
  const onWheel=useCallback(e=>{e.preventDefault();onCameraChange(prev=>({...prev,dist:Math.max(.5,Math.min(10,prev.dist+e.deltaY*.003))}));},[onCameraChange]);
  const onDblClick=useCallback(()=>onCameraChange(prev=>({...prev,theta:0,phi:.15})),[onCameraChange]);
  const onCtx=useCallback(e=>e.preventDefault(),[]);

  useEffect(()=>{
    const c=ref.current;if(!c)return;
    const ctx=c.getContext("2d");if(!ctx)return;
    const render=()=>{
      const W=c.width,H=c.height;
      ctx.fillStyle=scene.bgColor;ctx.fillRect(0,0,W,H);
      const t=time4D;
      const eye=getEye(camera);
      const fovS=1/Math.tan(((camera.fov||55)*Math.PI/180)/2);

      if(scene.gridEnabled){
        ctx.strokeStyle=scene.gridColor;ctx.lineWidth=.5;
        for(let gi=-8;gi<=8;gi++){for(let dir=0;dir<2;dir++){const pts=[];for(let gj=-8;gj<=8;gj+=2){const gx=dir===0?gi*.25:gj*.25,gz=dir===0?gj*.25:gi*.25;const p=lookAtClean(gx,0,gz,eye,fovS,W,H);if(p&&p.d<20)pts.push(p);}if(pts.length>1){ctx.beginPath();ctx.moveTo(pts[0].sx,pts[0].sy);for(let k=1;k<pts.length;k++)ctx.lineTo(pts[k].sx,pts[k].sy);ctx.stroke();}}}
      }
      if(scene.id==="tracking"){
        const wallPts=[[-2.5,0,-2],[-2.5,3.5,-2],[2.5,3.5,-2],[2.5,0,-2]].map(([x,y,z])=>lookAtClean(x,y,z,eye,fovS,W,H)).filter(Boolean);
        if(wallPts.length>=3){ctx.fillStyle="rgba(0,177,64,.3)";ctx.beginPath();ctx.moveTo(wallPts[0].sx,wallPts[0].sy);wallPts.forEach(p=>ctx.lineTo(p.sx,p.sy));ctx.closePath();ctx.fill();}
        for(const m of TRACKING_MARKERS_3D){const p=lookAtClean(m.x,m.y,m.z,eye,fovS,W,H);if(!p||p.d>15)continue;const sz=Math.max(2,8/p.d);ctx.strokeStyle="rgba(0,0,0,.5)";ctx.lineWidth=Math.max(1,2/p.d);ctx.beginPath();ctx.moveTo(p.sx-sz,p.sy);ctx.lineTo(p.sx+sz,p.sy);ctx.stroke();ctx.beginPath();ctx.moveTo(p.sx,p.sy-sz);ctx.lineTo(p.sx,p.sy+sz);ctx.stroke();}
      }

      const proj=splats.map(s=>{
        const off=danceOffset(s.part,t);
        const p=lookAtClean(s.x+off.dx,s.y+off.dy,s.z+off.dz,eye,fovS,W,H);
        if(!p)return null;
        return {...p,ss:Math.max(1,s.size*fovS/p.d*W*.4),r:s.r,g:s.g,b:s.b,op:s.opacity};
      }).filter(Boolean);
      proj.sort((a,b)=>b.d-a.d);
      for(const p of proj){ctx.globalAlpha=p.op*Math.min(1,1.8/p.d)*.85;ctx.fillStyle=`rgb(${Math.round(p.r*255)},${Math.round(p.g*255)},${Math.round(p.b*255)})`;ctx.beginPath();ctx.arc(p.sx,p.sy,p.ss,0,Math.PI*2);ctx.fill();}
      ctx.globalAlpha=1;

      ctx.fillStyle=scene.hudColor;ctx.font="10px monospace";
      ctx.fillText(`${splats.length.toLocaleString()} splats | t=${t.toFixed(2)}s | ${playing?"▶":"⏸"} | ${W}×${H}`,10,H-10);
      if(isLive){ctx.fillStyle="#E24B4A";ctx.fillRect(W-52,10,42,18);ctx.fillStyle="#fff";ctx.font="bold 10px sans-serif";ctx.fillText("LIVE",W-44,23);}
      if(!playing){ctx.fillStyle=scene.hudColor;ctx.font="bold 13px sans-serif";ctx.fillText("⏸ FREEZE",W-100,H-10);}
      raf.current=requestAnimationFrame(render);
    };
    render();
    return ()=>{if(raf.current)cancelAnimationFrame(raf.current);};
  },[splats,camera,time4D,resolution,isLive,playing,scene,getEye]);

  useEffect(()=>{const c=ref.current;if(c){c.width=resolution.w;c.height=resolution.h;}},[resolution.w,resolution.h]);
  useEffect(()=>{const up=()=>{drag.current.active=false;};window.addEventListener("mouseup",up);return()=>window.removeEventListener("mouseup",up);},[]);

  return <canvas ref={ref} width={resolution.w} height={resolution.h}
    onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
    onWheel={onWheel} onDoubleClick={onDblClick} onContextMenu={onCtx}
    style={{width:"100%",height:"100%",display:"block",background:scene.bgColor,cursor:"grab"}}/>;
}

/* ═══════════════════════════════════════════════
   メインApp
   ═══════════════════════════════════════════════ */
export default function App(){
  const demoSplats=useMemo(()=>generateHumanSplats(),[]);
  const [splats,setSplats]=useState(null); // null=デモ表示
  const [modelInfo,setModelInfo]=useState({name:"デモ: ダンス人型モデル",count:0,source:"built-in"});
  const [loadError,setLoadError]=useState(null);
  const [isLoading,setIsLoading]=useState(false);

  const activeSplats=splats||demoSplats;

  const [camera,setCamera]=useState({theta:0,phi:.15,dist:3.0,fov:55});
  const [presets,setPresets]=useState(DEFAULT_PRESETS);
  const [activePreset,setActivePreset]=useState(1);
  const [transition,setTransition]=useState("smooth");
  const [transProgress,setTransProgress]=useState(1);
  const transFrom=useRef(null),transTo=useRef(null);
  const [time4D,setTime4D]=useState(0);
  const [duration]=useState(6);
  const [playing,setPlaying]=useState(true);
  const [speed,setSpeed]=useState(1);
  const [resolution,setResolution]=useState({w:1280,h:720,fps:30});
  const [broadcastIdx,setBroadcastIdx]=useState(1);
  const [isLive,setIsLive]=useState(false);
  const [scene,setScene]=useState(SCENE_PRESETS[0]);
  const [tab,setTab]=useState("data");
  const [showHelp,setShowHelp]=useState(true);
  const [showUI,setShowUI]=useState(true);
  const [isFullscreen,setIsFullscreen]=useState(false);
  const [log,setLog]=useState([]);
  const appRef=useRef(null);

  const toggleFullscreen=useCallback(()=>{
    if(!document.fullscreenElement){
      const el=appRef.current||document.documentElement;
      const req=el.requestFullscreen||el.webkitRequestFullscreen||el.msRequestFullscreen;
      if(req){req.call(el).catch(()=>setIsFullscreen(p=>!p));}else{setIsFullscreen(true);}
    }else{
      const ex=document.exitFullscreen||document.webkitExitFullscreen||document.msExitFullscreen;
      if(ex){ex.call(document).catch(()=>setIsFullscreen(p=>!p));}else{setIsFullscreen(false);}
    }
  },[]);
  useEffect(()=>{const h=()=>setIsFullscreen(!!document.fullscreenElement);document.addEventListener("fullscreenchange",h);document.addEventListener("webkitfullscreenchange",h);return()=>{document.removeEventListener("fullscreenchange",h);document.removeEventListener("webkitfullscreenchange",h);};},[]);

  const addLog=useCallback(msg=>{
    const ts=new Date().toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
    setLog(prev=>[{ts,msg},...prev].slice(0,30));
  },[]);

  // ファイル読み込みハンドラ
  const handleFileLoad=useCallback(async(file)=>{
    setIsLoading(true);setLoadError(null);
    addLog(`読込開始: ${file.name} (${(file.size/1024/1024).toFixed(1)}MB)`);
    try{
      const raw=await loadSplatFile(file);
      const normalized=normalizeSplats(raw);
      setSplats(normalized);
      setModelInfo({name:file.name,count:normalized.length,source:"file"});
      addLog(`✅ 読込完了: ${normalized.length.toLocaleString()}スプラット`);
    }catch(e){
      setLoadError(e.message);
      addLog(`❌ 読込失敗: ${e.message}`);
    }
    setIsLoading(false);
  },[addLog]);

  const handleURLLoad=useCallback(async(url)=>{
    setIsLoading(true);setLoadError(null);
    addLog(`URL読込開始: ${url}`);
    try{
      const raw=await loadSplatURL(url);
      const normalized=normalizeSplats(raw);
      setSplats(normalized);
      setModelInfo({name:url.split("/").pop(),count:normalized.length,source:"url"});
      addLog(`✅ 読込完了: ${normalized.length.toLocaleString()}スプラット`);
    }catch(e){
      setLoadError(e.message);
      addLog(`❌ URL読込失敗: ${e.message}`);
    }
    setIsLoading(false);
  },[addLog]);

  const resetToDemo=useCallback(()=>{
    setSplats(null);setModelInfo({name:"デモ: ダンス人型モデル",count:demoSplats.length,source:"built-in"});setLoadError(null);
    addLog("デモモデルに戻しました");
  },[demoSplats,addLog]);

  useEffect(()=>{
    if(!playing)return;
    let last=performance.now(),id;
    const tick=now=>{const dt=(now-last)/1000;last=now;setTime4D(p=>{const n=p+dt*speed;return n>=duration?0:n;});id=requestAnimationFrame(tick);};
    id=requestAnimationFrame(tick); return ()=>cancelAnimationFrame(id);
  },[playing,speed,duration]);

  useEffect(()=>{
    if(transProgress>=1)return;let id;
    const tick=()=>{setTransProgress(p=>{const next=Math.min(1,p+.025);if(transFrom.current&&transTo.current){const ease=next<.5?2*next*next:-1+(4-2*next)*next;const lerp=(a,b)=>a+(b-a)*ease;const f=transFrom.current,t2=transTo.current;setCamera({theta:lerp(f.theta,t2.theta),phi:lerp(f.phi,t2.phi),dist:lerp(f.dist,t2.dist),fov:lerp(f.fov,t2.fov)});}return next;});id=requestAnimationFrame(tick);};
    id=requestAnimationFrame(tick);return()=>cancelAnimationFrame(id);
  },[transProgress]);

  const switchPreset=useCallback(preset=>{
    setActivePreset(preset.id);addLog(`カメラ → ${preset.name}`);
    const target={theta:preset.theta,phi:preset.phi,dist:preset.dist,fov:preset.fov};
    if(transition==="cut")setCamera(target);
    else{transFrom.current={...camera};transTo.current=target;setTransProgress(0);}
  },[transition,camera,addLog]);

  useEffect(()=>{
    const handler=e=>{if(e.target.tagName==="INPUT")return;const n=parseInt(e.key);if(n>=1&&n<=presets.length){e.preventDefault();switchPreset(presets[n-1]);}if(e.key===" "){e.preventDefault();setPlaying(p=>!p);}if(e.key==="f"||e.key==="F"){e.preventDefault();toggleFullscreen();}if(e.key==="h"||e.key==="H"){e.preventDefault();setShowUI(p=>!p);}};
    window.addEventListener("keydown",handler);return()=>window.removeEventListener("keydown",handler);
  },[presets,switchPreset,toggleFullscreen]);

  const applyBroadcast=i=>{setBroadcastIdx(i);const p=BROADCAST_PRESETS[i];setResolution({w:p.w,h:p.h,fps:p.fps});addLog(`解像度 → ${p.label}`);};
  const saveCurrentToPreset=()=>{setPresets(prev=>prev.map(p=>p.id===activePreset?{...p,theta:camera.theta,phi:camera.phi,dist:camera.dist,fov:camera.fov}:p));addLog(`プリセット${activePreset}保存`);};

  const A="#5DCAA5",Ad="rgba(93,202,165,.15)",P="#14141c",P2="#1b1b26",B="rgba(255,255,255,.07)",T="#e8e6df",Ts="rgba(255,255,255,.4)",LC="#E24B4A";

  const slider=(key,label,min,max,step)=>(<div style={{display:"flex",alignItems:"center",gap:6}} key={key}><span style={{fontSize:10,color:Ts,minWidth:54}}>{label}</span><input type="range" min={min} max={max} step={step} value={camera[key]||0} onChange={e=>setCamera(p=>({...p,[key]:parseFloat(e.target.value)}))} style={{flex:1}}/><span style={{fontSize:10,fontFamily:"monospace",color:Ts,minWidth:34,textAlign:"right"}}>{(camera[key]||0).toFixed(step<1?1+(step<.01?1:0):0)}</span></div>);
  const tabBtn=(id,label)=>(<button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"10px 0",fontSize:11,fontWeight:600,color:tab===id?A:Ts,background:"transparent",border:"none",borderBottom:tab===id?`2px solid ${A}`:"2px solid transparent",cursor:"pointer",transition:"all .12s"}}>{label}</button>);

  return (
    <div ref={appRef} style={{position:isFullscreen?"fixed":"relative",inset:isFullscreen?0:"auto",zIndex:isFullscreen?9999:"auto",display:"flex",flexDirection:"column",height:"100vh",fontFamily:"'Noto Sans JP','Hiragino Sans',system-ui,sans-serif",background:"#0f0f15",color:T,overflow:"hidden"}}>

      {showUI&&<header style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 16px",background:P,borderBottom:`1px solid ${B}`,flexShrink:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,borderRadius:8,background:`linear-gradient(135deg,${A},#378ADD)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:"#fff"}}>4D</div>
          <div><div style={{fontSize:14,fontWeight:700}}>4D Gaussian Splat ビューアー</div><div style={{fontSize:9,color:Ts}}>撮影講座・セミナー配信モード</div></div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          {isLive&&<div style={{display:"flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:10,background:"rgba(226,75,74,.15)",fontSize:10,color:LC,fontWeight:700}}><div style={{width:6,height:6,borderRadius:"50%",background:LC,animation:"pulse 1s infinite"}}/>配信中</div>}
          {!playing&&<div style={{padding:"3px 10px",borderRadius:10,background:"rgba(93,202,165,.12)",fontSize:10,color:A,fontWeight:700}}>⏸ フリーズ</div>}
          {isLoading&&<div style={{padding:"3px 10px",borderRadius:10,background:"rgba(55,138,221,.15)",fontSize:10,color:"#378ADD",fontWeight:700}}>読込中...</div>}
          <button onClick={()=>{setIsLive(!isLive);addLog(isLive?"配信停止":"配信開始");}} style={{padding:"4px 12px",borderRadius:6,border:`1px solid ${isLive?LC:B}`,background:isLive?"rgba(226,75,74,.12)":"transparent",color:isLive?LC:Ts,cursor:"pointer",fontSize:10,fontWeight:600}}>{isLive?"配信停止":"配信開始"}</button>
          <span style={{fontSize:10,fontFamily:"monospace",color:Ts,padding:"3px 8px",borderRadius:5,background:P2}}>{resolution.w}×{resolution.h}</span>
          <button onClick={toggleFullscreen} style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${B}`,background:isFullscreen?Ad:"transparent",color:isFullscreen?A:Ts,cursor:"pointer",fontSize:10,fontWeight:600}}>{isFullscreen?"全画面解除":"全画面"}</button>
          <button onClick={()=>setShowHelp(!showHelp)} style={{padding:"3px 10px",borderRadius:5,border:`1px solid ${B}`,background:showHelp?Ad:"transparent",color:showHelp?A:Ts,cursor:"pointer",fontSize:10,fontWeight:600}}>{showHelp?"解説ON":"解説OFF"}</button>
        </div>
      </header>}

      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        <div style={{flex:1,display:"flex",flexDirection:"column",position:"relative"}}>
          <div style={{flex:1,position:"relative"}}>
            <SplatCanvas splats={activeSplats} camera={camera} time4D={time4D} resolution={resolution} isLive={isLive} playing={playing} scene={scene} onCameraChange={setCamera}/>
            <div style={{position:"absolute",top:10,right:10,display:"flex",gap:4,zIndex:10}}>
              <button onClick={()=>setShowUI(p=>!p)} style={{padding:"5px 12px",borderRadius:8,background:"rgba(0,0,0,.55)",backdropFilter:"blur(8px)",border:`1px solid ${B}`,color:"rgba(255,255,255,.6)",cursor:"pointer",fontSize:10,fontWeight:600}}>{showUI?"UI非表示(H)":"UI表示(H)"}</button>
              {!showUI&&<button onClick={toggleFullscreen} style={{padding:"5px 12px",borderRadius:8,background:"rgba(0,0,0,.55)",backdropFilter:"blur(8px)",border:`1px solid ${B}`,color:"rgba(255,255,255,.5)",cursor:"pointer",fontSize:10}}>全画面(F)</button>}
            </div>
            {showUI&&<div style={{position:"absolute",top:10,left:10,padding:"5px 12px",borderRadius:8,background:"rgba(0,0,0,.55)",backdropFilter:"blur(8px)",fontSize:11,color:"rgba(255,255,255,.7)",display:"flex",alignItems:"center",gap:6,zIndex:10}}>
              <span style={{fontWeight:600}}>{modelInfo.name}</span>
              <span style={{fontSize:9,color:"rgba(255,255,255,.3)"}}>{activeSplats.length.toLocaleString()} splats</span>
            </div>}
            {showUI&&showHelp&&<div style={{position:"absolute",bottom:8,left:10,padding:"6px 12px",borderRadius:8,background:"rgba(0,0,0,.5)",backdropFilter:"blur(8px)",fontSize:9,color:"rgba(255,255,255,.4)",display:"flex",gap:10,zIndex:10,flexWrap:"wrap"}}>
              <span>🖱左ドラッグ:回転</span><span>⚙ホイール:ズーム</span><span>🖱右ドラッグ:仰角</span><span>Space:再生/フリーズ</span>
            </div>}
          </div>
          {showUI&&<div style={{padding:"8px 16px 12px",background:P,borderTop:`1px solid ${B}`,flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <button onClick={()=>{setPlaying(!playing);addLog(playing?"⏸ フリーズ":"▶ 再生");}} style={{width:34,height:34,borderRadius:"50%",background:playing?A:LC,border:"none",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700}}>{playing?"⏸":"▶"}</button>
              <div style={{flex:1}}>
                <input type="range" min={0} max={duration} step={.01} value={time4D} onChange={e=>{setTime4D(parseFloat(e.target.value));if(playing)setPlaying(false);}} style={{width:"100%"}}/>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:Ts,marginTop:2}}><span>⏱ t={time4D.toFixed(2)}s{!playing&&<span style={{color:LC}}> | フリーズ</span>}</span><span>全長{duration}s</span></div>
              </div>
              <div style={{display:"flex",gap:3}}>{[.5,1,2].map(s=><button key={s} onClick={()=>setSpeed(s)} style={{padding:"2px 8px",borderRadius:4,fontSize:9,fontWeight:600,border:speed===s?`1px solid ${A}`:`1px solid ${B}`,background:speed===s?Ad:"transparent",color:speed===s?A:Ts,cursor:"pointer"}}>{s}x</button>)}</div>
              {showHelp&&<Tip id="freeze"/>}
            </div>
          </div>}
        </div>

        {showUI&&<div style={{width:340,flexShrink:0,background:P,borderLeft:`1px solid ${B}`,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{display:"flex",borderBottom:`1px solid ${B}`,flexShrink:0}}>
            {tabBtn("data","データ")}{tabBtn("director","操作")}{tabBtn("scene","シーン")}{tabBtn("broadcast","配信")}
          </div>
          <div style={{flex:1,overflow:"auto",padding:14}}>

            {/* ═══ データ ═══ */}
            {tab==="data"&&<div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:8}}><span style={{fontSize:10,fontWeight:700,color:Ts,textTransform:"uppercase",letterSpacing:".08em"}}>現在のモデル</span>{showHelp&&<Tip id="data"/>}</div>
                <div style={{padding:"12px",borderRadius:10,background:P2,border:`1px solid ${B}`}}>
                  <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>{modelInfo.source==="built-in"?"👤":"📦"} {modelInfo.name}</div>
                  <div style={{fontSize:11,color:Ts}}>{activeSplats.length.toLocaleString()}個のスプラット {modelInfo.source==="built-in"&&"(ダンスアニメーション付き)"}</div>
                  {splats&&<button onClick={resetToDemo} style={{marginTop:8,padding:"5px 12px",borderRadius:6,border:`1px solid ${B}`,background:"transparent",color:Ts,cursor:"pointer",fontSize:10}}>デモモデルに戻す</button>}
                </div>
              </div>

              <div>
                <span style={{fontSize:10,fontWeight:700,color:Ts,textTransform:"uppercase",letterSpacing:".08em",display:"block",marginBottom:8}}>ファイルから読み込み</span>
                <div style={{padding:"20px 16px",borderRadius:10,border:isLoading?"1px solid #378ADD":"1px dashed rgba(255,255,255,.12)",textAlign:"center",cursor:isLoading?"wait":"pointer",transition:"border-color .2s",background:isLoading?"rgba(55,138,221,.05)":"transparent"}}
                  onClick={()=>!isLoading&&document.getElementById("file-in")?.click()}
                  onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor="#5DCAA5";}}
                  onDragLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,.12)";}}
                  onDrop={e=>{e.preventDefault();e.currentTarget.style.borderColor="rgba(255,255,255,.12)";const f=e.dataTransfer.files[0];if(f)handleFileLoad(f);}}>
                  <div style={{fontSize:20,marginBottom:6,opacity:.4}}>{isLoading?"⏳":"📂"}</div>
                  <div style={{fontSize:12,color:Ts}}>{isLoading?"読み込み中...":".ply / .splat ファイルをドラッグ&ドロップ"}</div>
                  <input id="file-in" type="file" accept=".splat,.ply" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)handleFileLoad(f);}}/>
                </div>
                {loadError&&<div style={{marginTop:6,padding:"6px 10px",borderRadius:6,background:"rgba(226,75,74,.1)",border:"1px solid rgba(226,75,74,.2)",fontSize:10,color:LC}}>❌ {loadError}</div>}
              </div>

              <div>
                <span style={{fontSize:10,fontWeight:700,color:Ts,textTransform:"uppercase",letterSpacing:".08em",display:"block",marginBottom:8}}>URLから読み込み</span>
                <div style={{display:"flex",gap:6}}>
                  <input id="url-input" type="text" placeholder="https://...splat または .ply のURL" style={{flex:1,padding:"7px 10px",fontSize:11,borderRadius:6,border:`1px solid ${B}`,background:P2,color:T}}/>
                  <button onClick={()=>{const v=document.getElementById("url-input")?.value;if(v)handleURLLoad(v);}} disabled={isLoading} style={{padding:"7px 14px",borderRadius:6,border:`1px solid ${B}`,background:P2,color:T,cursor:isLoading?"wait":"pointer",fontSize:11,fontWeight:600,whiteSpace:"nowrap",opacity:isLoading?.5:1}}>読込</button>
                </div>
              </div>

              <div>
                <span style={{fontSize:10,fontWeight:700,color:Ts,textTransform:"uppercase",letterSpacing:".08em",display:"block",marginBottom:8}}>サンプルデータ（Hugging Face）</span>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {[
                    {name:"Bonsai",url:"https://huggingface.co/datasets/dylanebert/3dgs/resolve/main/bonsai/bonsai-7k.splat"},
                    {name:"Bicycle",url:"https://huggingface.co/datasets/dylanebert/3dgs/resolve/main/bicycle/bicycle-7k.splat"},
                    {name:"Garden",url:"https://huggingface.co/datasets/dylanebert/3dgs/resolve/main/garden/garden-7k.splat"},
                    {name:"Kitchen",url:"https://huggingface.co/datasets/dylanebert/3dgs/resolve/main/kitchen/kitchen-7k.splat"},
                  ].map(d=>(
                    <button key={d.name} onClick={()=>handleURLLoad(d.url)} disabled={isLoading} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",borderRadius:6,border:`1px solid ${B}`,background:P2,cursor:isLoading?"wait":"pointer",color:T,fontSize:11,textAlign:"left",opacity:isLoading?.5:1}}>
                      <span style={{fontWeight:600}}>{d.name}</span>
                      <span style={{fontSize:9,color:A}}>読み込む →</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span style={{fontSize:10,fontWeight:700,color:Ts,textTransform:"uppercase",letterSpacing:".08em",display:"block",marginBottom:8}}>対応形式</span>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {[{ext:".ply",desc:"3DGS学習出力（バイナリPLY）"},{ext:".splat",desc:"antimatter15圧縮形式（32byte/splat）"}].map(f=>(
                    <div key={f.ext} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:6,background:P2}}>
                      <code style={{fontSize:12,color:A,fontWeight:600,fontFamily:"monospace"}}>{f.ext}</code>
                      <span style={{fontSize:10,color:Ts}}>{f.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>}

            {/* ═══ 操作 ═══ */}
            {tab==="director"&&<div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:8}}><span style={{fontSize:10,fontWeight:700,color:Ts,textTransform:"uppercase",letterSpacing:".08em"}}>カメラ切替</span>{showHelp&&<Tip id="director"/>}</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4}}>
                  {presets.map((p,i)=>(<button key={p.id} onClick={()=>switchPreset(p)} style={{padding:"8px 6px",borderRadius:8,textAlign:"center",border:activePreset===p.id?`2px solid ${A}`:`1px solid ${B}`,background:activePreset===p.id?Ad:"transparent",cursor:"pointer",color:T,position:"relative"}}>
                    <div style={{fontSize:14}}>{p.icon}</div><div style={{fontSize:10,fontWeight:600}}>{p.name}</div><div style={{position:"absolute",top:2,right:4,fontSize:8,color:Ts,opacity:.5}}>{i+1}</div>
                  </button>))}
                </div>
              </div>
              <div>
                <span style={{fontSize:10,fontWeight:700,color:Ts,textTransform:"uppercase",letterSpacing:".08em",display:"block",marginBottom:8}}>トランジション</span>
                <div style={{display:"flex",gap:4}}>{[{id:"cut",label:"カット"},{id:"smooth",label:"スムーズ"}].map(tt=>(<button key={tt.id} onClick={()=>{setTransition(tt.id);addLog(`トランジション→${tt.label}`);}} style={{flex:1,padding:"7px",borderRadius:6,fontSize:11,fontWeight:600,border:transition===tt.id?`1.5px solid ${A}`:`1px solid ${B}`,background:transition===tt.id?Ad:"transparent",color:transition===tt.id?A:Ts,cursor:"pointer"}}>{tt.label}</button>))}</div>
              </div>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:8}}><span style={{fontSize:10,fontWeight:700,color:Ts,textTransform:"uppercase",letterSpacing:".08em"}}>微調整</span>{showHelp&&<Tip id="mouse"/>}</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {slider("theta","水平角度",-3.14,3.14,.01)}{slider("phi","仰角",-.8,1.5,.01)}{slider("dist","距離",.5,10,.1)}{slider("fov","画角",20,120,1)}
                </div>
                <button onClick={saveCurrentToPreset} style={{marginTop:8,width:"100%",padding:"7px",borderRadius:6,border:`1px solid ${B}`,background:P2,color:T,cursor:"pointer",fontSize:11,fontWeight:600}}>プリセット{activePreset}に保存</button>
              </div>
              <div>
                <span style={{fontSize:10,fontWeight:700,color:Ts,textTransform:"uppercase",letterSpacing:".08em",display:"block",marginBottom:6}}>操作ログ</span>
                <div style={{maxHeight:90,overflow:"auto",borderRadius:6,background:P2,border:`1px solid ${B}`,padding:"6px 8px"}}>{log.length===0?<div style={{fontSize:10,color:Ts,textAlign:"center",padding:8}}>操作が記録されます</div>:log.map((l,i)=><div key={i} style={{fontSize:10,color:i===0?A:Ts,padding:"2px 0",borderBottom:`1px solid ${B}`,display:"flex",gap:6}}><span style={{fontFamily:"monospace",color:Ts,flexShrink:0}}>{l.ts}</span><span>{l.msg}</span></div>)}</div>
              </div>
            </div>}

            {/* ═══ シーン ═══ */}
            {tab==="scene"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:4}}><span style={{fontSize:10,fontWeight:700,color:Ts,textTransform:"uppercase",letterSpacing:".08em"}}>シーン環境</span>{showHelp&&<Tip id="scene"/>}</div>
              {SCENE_PRESETS.map(sp=>(<button key={sp.id} onClick={()=>{setScene(sp);addLog(`シーン→${sp.name}`);}} style={{display:"flex",gap:10,alignItems:"center",padding:"12px",borderRadius:10,textAlign:"left",border:scene.id===sp.id?`2px solid ${A}`:`1px solid ${B}`,background:scene.id===sp.id?Ad:"transparent",cursor:"pointer",color:T}}>
                <div style={{width:40,height:40,borderRadius:8,background:sp.bgColor,border:"1px solid rgba(0,0,0,.2)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{sp.icon}</div>
                <div><div style={{fontSize:12,fontWeight:700}}>{sp.name}</div><div style={{fontSize:9,color:Ts,marginTop:1}}>{sp.desc}</div></div>
              </button>))}
            </div>}

            {/* ═══ 配信 ═══ */}
            {tab==="broadcast"&&<div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div>
                <span style={{fontSize:10,fontWeight:700,color:Ts,textTransform:"uppercase",letterSpacing:".08em",display:"block",marginBottom:8}}>配信先</span>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>{BROADCAST_PRESETS.map((p,i)=>(<button key={p.name} onClick={()=>applyBroadcast(i)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",borderRadius:8,textAlign:"left",border:broadcastIdx===i?`1.5px solid ${A}`:`1px solid ${B}`,background:broadcastIdx===i?Ad:"transparent",cursor:"pointer",color:T}}><div><div style={{fontSize:12,fontWeight:600}}>{p.name}</div><div style={{fontSize:9,color:Ts,marginTop:1}}>{p.w}×{p.h}/{p.fps}fps</div></div><span style={{fontSize:9,padding:"2px 8px",borderRadius:4,background:P2,color:Ts}}>{p.label}</span></button>))}</div>
              </div>
              <div style={{padding:"12px",borderRadius:8,background:P2,border:`1px solid ${B}`,fontSize:10,color:Ts,lineHeight:1.8}}>
                <b style={{color:T}}>OBS:</b> ソース追加→ブラウザ→URL入力→{resolution.w}×{resolution.h}<br/>
                <b style={{color:T}}>Zoom:</b> 画面共有→このウィンドウ<br/>
                <b style={{color:T}}>YouTube:</b> OBS経由ストリームキー
              </div>
              <button onClick={()=>{navigator.clipboard?.writeText(JSON.stringify({type:"browser_source",url:window.location.href,width:resolution.w,height:resolution.h,fps:resolution.fps},null,2));addLog("OBS設定コピー");}} style={{padding:"10px",borderRadius:8,border:`1px solid ${B}`,background:P2,color:T,cursor:"pointer",fontSize:11,fontWeight:600,textAlign:"center"}}>📋 OBS設定JSONコピー</button>
            </div>}
          </div>
        </div>}
      </div>

      <style>{`*{box-sizing:border-box;margin:0}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.06);border-radius:2px}input[type="range"]{accent-color:#5DCAA5}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
    </div>
  );
}
