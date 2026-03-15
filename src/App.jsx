import { useState, useEffect, useRef, useMemo, useCallback } from "react";

/* ═══════════════════════════════════════════════
   人型モデル生成
   ═══════════════════════════════════════════════ */
function generateHumanSplats() {
  const s = [];
  const add = (cx,cy,cz, rx,ry,rz, n, r,g,b, part) => {
    for (let i = 0; i < n; i++) {
      s.push({
        x: cx+(Math.random()*2-1)*rx, y: cy+(Math.random()*2-1)*ry, z: cz+(Math.random()*2-1)*rz,
        size: .006+Math.random()*.015, opacity: .5+Math.random()*.5,
        r: Math.max(0,Math.min(1,r+(Math.random()-.5)*.12)),
        g: Math.max(0,Math.min(1,g+(Math.random()-.5)*.12)),
        b: Math.max(0,Math.min(1,b+(Math.random()-.5)*.12)), part,
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
   ダンスアニメーション
   ═══════════════════════════════════════════════ */
function danceOffset(part, t) {
  const beat = t * 4;
  const b1 = Math.sin(beat * Math.PI);
  let dx = 0, dy = Math.abs(b1) * .04, dz = 0;
  if (part==="torso") { dx+=Math.sin(beat*Math.PI)*.03; dz+=Math.cos(beat*Math.PI)*.02; }
  if (part==="head"||part==="hair") { dx+=Math.sin(beat*Math.PI*.5)*.02; dy+=Math.abs(b1)*.04+Math.sin(beat*Math.PI)*.01; }
  if (part==="Lup") { dx+=-.08+Math.sin(beat*Math.PI)*.12; dy+=Math.abs(Math.sin(beat*Math.PI))*.15; }
  if (part==="Llo") { dx+=-.05+Math.sin(beat*Math.PI)*.10; dy+=Math.abs(Math.sin(beat*Math.PI))*.20; }
  if (part==="Lhd") { dx+=-.03+Math.sin(beat*Math.PI)*.08; dy+=Math.abs(Math.sin(beat*Math.PI))*.25; }
  if (part==="Rup") { dx+=.08+Math.sin(beat*Math.PI+Math.PI)*.12; dy+=Math.abs(Math.sin(beat*Math.PI+Math.PI))*.15; }
  if (part==="Rlo") { dx+=.05+Math.sin(beat*Math.PI+Math.PI)*.10; dy+=Math.abs(Math.sin(beat*Math.PI+Math.PI))*.20; }
  if (part==="Rhd") { dx+=.03+Math.sin(beat*Math.PI+Math.PI)*.08; dy+=Math.abs(Math.sin(beat*Math.PI+Math.PI))*.25; }
  if (part==="Lth") { dx+=Math.sin(beat*Math.PI)*.05; dz+=Math.sin(beat*Math.PI)*.04; dy+=Math.max(0,Math.sin(beat*Math.PI))*.03; }
  if (part==="Lsh") { dx+=Math.sin(beat*Math.PI)*.06; dz+=Math.sin(beat*Math.PI)*.06; dy+=Math.max(0,Math.sin(beat*Math.PI))*.05; }
  if (part==="Lft") { dx+=Math.sin(beat*Math.PI)*.06; dz+=Math.sin(beat*Math.PI)*.06; dy+=Math.max(0,Math.sin(beat*Math.PI))*.06; }
  if (part==="Rth") { dx+=Math.sin(beat*Math.PI+Math.PI)*.05; dz+=Math.sin(beat*Math.PI+Math.PI)*.04; dy+=Math.max(0,Math.sin(beat*Math.PI+Math.PI))*.03; }
  if (part==="Rsh") { dx+=Math.sin(beat*Math.PI+Math.PI)*.06; dz+=Math.sin(beat*Math.PI+Math.PI)*.06; dy+=Math.max(0,Math.sin(beat*Math.PI+Math.PI))*.05; }
  if (part==="Rft") { dx+=Math.sin(beat*Math.PI+Math.PI)*.06; dz+=Math.sin(beat*Math.PI+Math.PI)*.06; dy+=Math.max(0,Math.sin(beat*Math.PI+Math.PI))*.06; }
  return { dx, dy, dz };
}

/* ═══════════════════════════════════════════════
   シーンプリセット
   ═══════════════════════════════════════════════ */
const SCENE_PRESETS = [
  {
    id: "default",
    name: "デフォルトスタジオ",
    icon: "🎬",
    desc: "暗いスタジオ環境、パース床グリッド付き",
    bgColor: "#0b0b12",
    gridColor: "rgba(93,202,165,.04)",
    gridEnabled: true,
    trackingMarkers: false,
    hudColor: "rgba(255,255,255,.25)",
  },
  {
    id: "tracking",
    name: "3Dトラッキングスタジオ",
    icon: "📐",
    desc: "グリーンバック + トラッキングポイント（被写体外周に配置）",
    bgColor: "#00b140",
    gridColor: "rgba(0,0,0,.08)",
    gridEnabled: true,
    trackingMarkers: true,
    hudColor: "rgba(0,0,0,.3)",
  },
  {
    id: "chromakey",
    name: "クロマキー（配信用）",
    icon: "🟢",
    desc: "完全プレーンなグリーン背景。OBSクロマキーフィルタで即合成可能",
    bgColor: "#00b140",
    gridColor: "transparent",
    gridEnabled: false,
    trackingMarkers: false,
    hudColor: "rgba(0,0,0,.25)",
  },
];

// トラッキングマーカー座標（被写体中心 x:±0.3, y:0〜1.8 を避けて外周に配置）
const TRACKING_MARKERS_3D = [
  // 床面（y=0）外周
  {x:-1.5,y:0,z:-1.5},{x:-.75,y:0,z:-1.5},{x:.75,y:0,z:-1.5},{x:1.5,y:0,z:-1.5},
  {x:-1.5,y:0,z:-.75},{x:1.5,y:0,z:-.75},
  {x:-1.5,y:0,z:.75},{x:1.5,y:0,z:.75},
  {x:-1.5,y:0,z:1.5},{x:-.75,y:0,z:1.5},{x:.75,y:0,z:1.5},{x:1.5,y:0,z:1.5},
  // 背面壁（z=-2）
  {x:-1.8,y:.5,z:-2},{x:-1.2,y:.5,z:-2},{x:-.6,y:.5,z:-2},{x:.6,y:.5,z:-2},{x:1.2,y:.5,z:-2},{x:1.8,y:.5,z:-2},
  {x:-1.8,y:1.2,z:-2},{x:-1.0,y:1.2,z:-2},{x:1.0,y:1.2,z:-2},{x:1.8,y:1.2,z:-2},
  {x:-1.8,y:2.0,z:-2},{x:-1.0,y:2.0,z:-2},{x:0,y:2.2,z:-2},{x:1.0,y:2.0,z:-2},{x:1.8,y:2.0,z:-2},
  {x:-1.8,y:2.8,z:-2},{x:-.8,y:2.8,z:-2},{x:.8,y:2.8,z:-2},{x:1.8,y:2.8,z:-2},
  // 左壁（x=-2）
  {x:-2,y:.5,z:-1.2},{x:-2,y:.5,z:0},{x:-2,y:.5,z:1.2},
  {x:-2,y:1.4,z:-1.2},{x:-2,y:1.4,z:0},{x:-2,y:1.4,z:1.2},
  {x:-2,y:2.3,z:-1.2},{x:-2,y:2.3,z:0},{x:-2,y:2.3,z:1.2},
  // 右壁（x=2）
  {x:2,y:.5,z:-1.2},{x:2,y:.5,z:0},{x:2,y:.5,z:1.2},
  {x:2,y:1.4,z:-1.2},{x:2,y:1.4,z:0},{x:2,y:1.4,z:1.2},
  {x:2,y:2.3,z:-1.2},{x:2,y:2.3,z:0},{x:2,y:2.3,z:1.2},
  // 天井付近（y=3.2）
  {x:-1.5,y:3.2,z:-1.5},{x:0,y:3.2,z:-1.5},{x:1.5,y:3.2,z:-1.5},
  {x:-1.5,y:3.2,z:0},{x:1.5,y:3.2,z:0},
  {x:-1.5,y:3.2,z:1.5},{x:0,y:3.2,z:1.5},{x:1.5,y:3.2,z:1.5},
];

/* ═══════════════════════════════════════════════
   カメラプリセット
   ═══════════════════════════════════════════════ */
const DEFAULT_PRESETS = [
  { id:1, name:"正面 (マスター)", icon:"🎬", theta:0, phi:.15, dist:3.0, fov:55, desc:"講師正面・全身" },
  { id:2, name:"バストショット",  icon:"👤", theta:0, phi:.25, dist:1.6, fov:40, desc:"上半身アップ" },
  { id:3, name:"右斜め45°",      icon:"↗", theta:-.78, phi:.2, dist:2.8, fov:50, desc:"表情が見える角度" },
  { id:4, name:"左斜め45°",      icon:"↖", theta:.78, phi:.2, dist:2.8, fov:50, desc:"反対側からの視点" },
  { id:5, name:"俯瞰ショット",   icon:"🔭", theta:0, phi:1.25, dist:3.5, fov:65, desc:"真上から見下ろす" },
  { id:6, name:"ローアングル",   icon:"⬆", theta:.3, phi:-.35, dist:2.5, fov:50, desc:"地面下から見上げる" },
];

const BROADCAST_PRESETS = [
  { name:"OBS / YouTube", w:1920,h:1080,fps:30, label:"1080p" },
  { name:"Zoom / Teams", w:1280,h:720,fps:24, label:"720p" },
  { name:"YouTube 4K", w:3840,h:2160,fps:30, label:"4K" },
  { name:"Twitch", w:1920,h:1080,fps:60, label:"1080p60" },
];

const TIPS = {
  preset:{icon:"🎬",title:"カメラプリセットとは",body:"カメラ位置・角度の組み合わせ。キー1〜6で即切替。被写体は常にセンター。"},
  transition:{icon:"🔄",title:"トランジション",body:"「カット」は即切替、「スムーズ」は滑らかに補間。"},
  director:{icon:"🎛",title:"ディレクターパネル",body:"配信・撮影中にリアルタイムでカメラを操作する専用パネル。"},
  mouse:{icon:"🖱",title:"マウス操作",body:"左ドラッグ: 回転\nホイール: ズーム\n右ドラッグ: 仰角\nダブルクリック: 正面に戻る"},
  freeze:{icon:"⏸",title:"フリーズ = VFX撮影",body:"再生停止で被写体ポーズが完全固定。カメラだけ自由に動かせるのでVFX合成素材の撮影に最適。"},
  scene:{icon:"🎨",title:"シーン設定",body:"背景環境を切り替えます。\n・デフォルト: 暗いスタジオ\n・3Dトラッキング: グリーンバック+マーカー（After Effects等の3Dトラッカー用）\n・クロマキー: 完全グリーン（OBSクロマキーフィルタ用）"},
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
const TARGET = [0, 1.0, 0];

function lookAtProject(wx,wy,wz, eye, fovS, W, H) {
  const fx=TARGET[0]-eye[0], fy=TARGET[1]-eye[1], fz=TARGET[2]-eye[2];
  const fl=Math.sqrt(fx*fx+fy*fy+fz*fz)||1;
  const fwd=[fx/fl,fy/fl,fz/fl];
  let rrx=fwd[1]*0-fwd[2]*1, rry=fwd[2]*0-fwd[0]*0, rrz=fwd[0]*1-fwd[1]*0;
  // up = (0,1,0)
  rrx=fwd[1]*0-fwd[2]*1; // this was wrong, redo cross product properly
  // right = fwd × up where up=(0,1,0)
  rrx = fwd[1]*0 - fwd[2]*1;  // fy*0 - fz*1 = -fz
  rry = fwd[2]*0 - fwd[0]*0;  // fz*0 - fx*0 = 0  -- wrong
  // Let me just do it cleanly:
  // right = forward × (0,1,0)
  rrx = fwd[2];   // fy*0 - fz*1 → wait: cross(fwd, up) where up=(0,1,0)
  // cross(a,b) = (ay*bz - az*by, az*bx - ax*bz, ax*by - ay*bx)
  // cross(fwd, (0,1,0)) = (fwd.y*0 - fwd.z*1, fwd.z*0 - fwd.x*0, fwd.x*1 - fwd.y*0)
  //                      = (-fwd.z, 0, fwd.x)  ← WRONG for look-at, should be cross(up, fwd) for right-hand
  // Actually let's use: right = (0,1,0) × forward for a right-handed system
  // cross((0,1,0), fwd) = (1*fz - 0*fy, 0*fx - 0*fz, 0*fy - 1*fx) = (fz, 0, -fx)  -- still not right
  // Let me just hardcode it correctly:
  rrx = fwd[2]; rry = 0; rrz = -fwd[0]; // This is cross(up, fwd) simplified since up.y=1
  // Actually: cross((0,1,0), (fx,fy,fz)) = (1*fz-0*fy, 0*fx-0*fz, 0*fy-1*fx) = (fz, 0, -fx)
  // Hmm wait that gives right = (fz, 0, -fx)/|...| which is correct for camera right
  rrx = fwd[2]; rry = 0; rrz = -fwd[0];
  const rl=Math.sqrt(rrx*rrx+rrz*rrz)||1;
  rrx/=rl; rrz/=rl;
  // true up = right × forward
  const ux=rry*fwd[2]-rrz*fwd[1]; // 0*fz - (-fx/|r|)*fy
  const uy=rrz*fwd[0]-rrx*fwd[2]; // (-fx/|r|)*fx - (fz/|r|)*fz
  const uz=rrx*fwd[1]-rry*fwd[0]; // (fz/|r|)*fy - 0*fx
  // Ok this is getting messy from the inline edits. Let me rewrite cleanly:
  return lookAtClean(wx,wy,wz,eye,fovS,W,H);
}

function lookAtClean(wx,wy,wz, eye, fovS, W, H) {
  // forward (eye → target)
  let fx=TARGET[0]-eye[0], fy=TARGET[1]-eye[1], fz=TARGET[2]-eye[2];
  const fl=Math.sqrt(fx*fx+fy*fy+fz*fz)||1;
  fx/=fl; fy/=fl; fz/=fl;
  // right = normalize(cross(forward, worldUp(0,1,0)))
  let rx=fy*0-fz*1, ry=fz*0-fx*0, rz=fx*1-fy*0;
  // Simplified: cross((fx,fy,fz),(0,1,0)) = (fy*0-fz*1, fz*0-fx*0, fx*1-fy*0) = (-fz, 0, fx)
  rx=-fz; ry=0; rz=fx;
  const rl=Math.sqrt(rx*rx+rz*rz)||.001;
  rx/=rl; rz/=rl;
  // up = normalize(cross(right, forward))
  const ux=ry*fz-rz*fy, uy=rz*fx-rx*fz, uz=rx*fy-ry*fx;
  // view-space coords
  const dx=wx-eye[0], dy=wy-eye[1], dz=wz-eye[2];
  const vx=rx*dx+ry*dy+rz*dz;
  const vy=ux*dx+uy*dy+uz*dz;
  const vz=fx*dx+fy*dy+fz*dz;
  if(vz<.1) return null;
  return { sx: W/2+(vx/vz)*fovS*W*.5, sy: H/2-(vy/vz)*fovS*H*.5, d:vz };
}

function SplatCanvas({splats, camera, time4D, resolution, isLive, playing, scene, onCameraChange}) {
  const ref=useRef(null), raf=useRef(null);
  const drag=useRef({active:false,btn:0,lx:0,ly:0});
  const PHI_MIN=-.8, PHI_MAX=1.5;

  const getEye=useCallback((cam)=>{
    const th=cam.theta||0, ph=cam.phi||.15, d=cam.dist||3;
    return [TARGET[0]+Math.sin(th)*Math.cos(ph)*d, TARGET[1]+Math.sin(ph)*d, TARGET[2]+Math.cos(th)*Math.cos(ph)*d];
  },[]);

  const onMouseDown=useCallback(e=>{e.preventDefault();drag.current={active:true,btn:e.button,lx:e.clientX,ly:e.clientY};},[]);
  const onMouseMove=useCallback(e=>{
    if(!drag.current.active) return;
    const dx=e.clientX-drag.current.lx, dy=e.clientY-drag.current.ly;
    drag.current.lx=e.clientX; drag.current.ly=e.clientY;
    if(drag.current.btn===0) onCameraChange(prev=>({...prev,theta:prev.theta-dx*.005,phi:Math.max(PHI_MIN,Math.min(PHI_MAX,prev.phi+dy*.005))}));
    else if(drag.current.btn===2) onCameraChange(prev=>({...prev,phi:Math.max(PHI_MIN,Math.min(PHI_MAX,prev.phi+dy*.005))}));
  },[onCameraChange]);
  const onMouseUp=useCallback(()=>{drag.current.active=false;},[]);
  const onWheel=useCallback(e=>{e.preventDefault();onCameraChange(prev=>({...prev,dist:Math.max(.5,Math.min(10,prev.dist+e.deltaY*.003))}));},[onCameraChange]);
  const onDblClick=useCallback(()=>onCameraChange(prev=>({...prev,theta:0,phi:.15})),[onCameraChange]);
  const onCtx=useCallback(e=>e.preventDefault(),[]);

  useEffect(()=>{
    const c=ref.current; if(!c) return;
    const ctx=c.getContext("2d"); if(!ctx) return;
    const render=()=>{
      const W=c.width, H=c.height;
      // 背景
      ctx.fillStyle=scene.bgColor;
      ctx.fillRect(0,0,W,H);

      const t=time4D;
      const eye=getEye(camera);
      const fovS=1/Math.tan(((camera.fov||55)*Math.PI/180)/2);

      // 床グリッド
      if(scene.gridEnabled){
        ctx.strokeStyle=scene.gridColor; ctx.lineWidth=.5;
        for(let gi=-8;gi<=8;gi++){
          for(let dir=0;dir<2;dir++){
            const pts=[];
            for(let gj=-8;gj<=8;gj+=2){
              const gx=dir===0?gi*.25:gj*.25, gz=dir===0?gj*.25:gi*.25;
              const p=lookAtClean(gx,0,gz,eye,fovS,W,H);
              if(p&&p.d<20) pts.push(p);
            }
            if(pts.length>1){ctx.beginPath();ctx.moveTo(pts[0].sx,pts[0].sy);for(let k=1;k<pts.length;k++)ctx.lineTo(pts[k].sx,pts[k].sy);ctx.stroke();}
          }
        }
      }

      // トラッキングスタジオ: 壁・天井の面を描画
      if(scene.id==="tracking"){
        // 背面壁 (z=-2)
        const wallPts=[[-2.5,0,-2],[-2.5,3.5,-2],[2.5,3.5,-2],[2.5,0,-2]].map(([x,y,z])=>lookAtClean(x,y,z,eye,fovS,W,H)).filter(Boolean);
        if(wallPts.length>=3){ctx.fillStyle="rgba(0,177,64,.3)";ctx.beginPath();ctx.moveTo(wallPts[0].sx,wallPts[0].sy);wallPts.forEach(p=>ctx.lineTo(p.sx,p.sy));ctx.closePath();ctx.fill();}
        // 左壁
        const lwPts=[[-2.5,0,-2],[-2.5,3.5,-2],[-2.5,3.5,2],[-2.5,0,2]].map(([x,y,z])=>lookAtClean(x,y,z,eye,fovS,W,H)).filter(Boolean);
        if(lwPts.length>=3){ctx.fillStyle="rgba(0,177,64,.2)";ctx.beginPath();ctx.moveTo(lwPts[0].sx,lwPts[0].sy);lwPts.forEach(p=>ctx.lineTo(p.sx,p.sy));ctx.closePath();ctx.fill();}
        // 右壁
        const rwPts=[[2.5,0,-2],[2.5,3.5,-2],[2.5,3.5,2],[2.5,0,2]].map(([x,y,z])=>lookAtClean(x,y,z,eye,fovS,W,H)).filter(Boolean);
        if(rwPts.length>=3){ctx.fillStyle="rgba(0,177,64,.2)";ctx.beginPath();ctx.moveTo(rwPts[0].sx,rwPts[0].sy);rwPts.forEach(p=>ctx.lineTo(p.sx,p.sy));ctx.closePath();ctx.fill();}
      }

      // トラッキングマーカー描画
      if(scene.trackingMarkers){
        for(const m of TRACKING_MARKERS_3D){
          const p=lookAtClean(m.x,m.y,m.z,eye,fovS,W,H);
          if(!p||p.d>15) continue;
          const sz=Math.max(2, 8/p.d);
          // 十字マーカー
          ctx.strokeStyle="rgba(0,0,0,.5)";
          ctx.lineWidth=Math.max(1, 2/p.d);
          ctx.beginPath(); ctx.moveTo(p.sx-sz,p.sy); ctx.lineTo(p.sx+sz,p.sy); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(p.sx,p.sy-sz); ctx.lineTo(p.sx,p.sy+sz); ctx.stroke();
          // 中心点
          ctx.fillStyle="rgba(0,0,0,.6)";
          ctx.beginPath(); ctx.arc(p.sx,p.sy,Math.max(1,1.5/p.d),0,Math.PI*2); ctx.fill();
        }
      }

      // スプラット
      const proj=splats.map(s=>{
        const off=danceOffset(s.part,t);
        const p=lookAtClean(s.x+off.dx,s.y+off.dy,s.z+off.dz,eye,fovS,W,H);
        if(!p) return null;
        return {...p,ss:Math.max(1,s.size*fovS/p.d*W*.4),r:s.r,g:s.g,b:s.b,op:s.opacity};
      }).filter(Boolean);
      proj.sort((a,b)=>b.d-a.d);
      for(const p of proj){
        ctx.globalAlpha=p.op*Math.min(1,1.8/p.d)*.85;
        ctx.fillStyle=`rgb(${Math.round(p.r*255)},${Math.round(p.g*255)},${Math.round(p.b*255)})`;
        ctx.beginPath(); ctx.arc(p.sx,p.sy,p.ss,0,Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha=1;

      // HUD
      ctx.fillStyle=scene.hudColor; ctx.font="10px monospace";
      const status=playing?"▶":"⏸ FREEZE";
      ctx.fillText(`${splats.length.toLocaleString()} splats | t=${t.toFixed(2)}s | ${status} | ${scene.name}`,10,H-10);
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
export default function App() {
  const splats=useMemo(()=>generateHumanSplats(),[]);
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
  const [tab,setTab]=useState("director");
  const [showHelp,setShowHelp]=useState(true);
  const [showUI,setShowUI]=useState(true);
  const [isFullscreen,setIsFullscreen]=useState(false);
  const [log,setLog]=useState([]);
  const appRef=useRef(null);

  const toggleFullscreen=useCallback(()=>{
    // ネイティブ Fullscreen API を試行、失敗時は CSS fallback
    if(!document.fullscreenElement){
      const el=appRef.current||document.documentElement;
      const req=el.requestFullscreen||el.webkitRequestFullscreen||el.msRequestFullscreen;
      if(req){req.call(el).catch(()=>setIsFullscreen(p=>!p));}
      else{setIsFullscreen(true);}
    }else{
      const ex=document.exitFullscreen||document.webkitExitFullscreen||document.msExitFullscreen;
      if(ex){ex.call(document).catch(()=>setIsFullscreen(p=>!p));}
      else{setIsFullscreen(false);}
    }
  },[]);

  // Fullscreen API の状態を同期
  useEffect(()=>{
    const handler=()=>setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange",handler);
    document.addEventListener("webkitfullscreenchange",handler);
    return ()=>{document.removeEventListener("fullscreenchange",handler);document.removeEventListener("webkitfullscreenchange",handler);};
  },[]);

  const addLog=useCallback(msg=>{
    const ts=new Date().toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
    setLog(prev=>[{ts,msg},...prev].slice(0,30));
  },[]);

  useEffect(()=>{
    if(!playing) return;
    let last=performance.now(),id;
    const tick=now=>{const dt=(now-last)/1000;last=now;setTime4D(p=>{const n=p+dt*speed;return n>=duration?0:n;});id=requestAnimationFrame(tick);};
    id=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(id);
  },[playing,speed,duration]);

  useEffect(()=>{
    if(transProgress>=1) return;
    let id;
    const tick=()=>{
      setTransProgress(p=>{
        const next=Math.min(1,p+.025);
        if(transFrom.current&&transTo.current){
          const ease=next<.5?2*next*next:-1+(4-2*next)*next;
          const lerp=(a,b)=>a+(b-a)*ease;
          const f=transFrom.current,t2=transTo.current;
          setCamera({theta:lerp(f.theta,t2.theta),phi:lerp(f.phi,t2.phi),dist:lerp(f.dist,t2.dist),fov:lerp(f.fov,t2.fov)});
        }
        return next;
      });
      id=requestAnimationFrame(tick);
    };
    id=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(id);
  },[transProgress]);

  const switchPreset=useCallback(preset=>{
    setActivePreset(preset.id); addLog(`カメラ → ${preset.name}`);
    const target={theta:preset.theta,phi:preset.phi,dist:preset.dist,fov:preset.fov};
    if(transition==="cut") setCamera(target);
    else{transFrom.current={...camera};transTo.current=target;setTransProgress(0);}
  },[transition,camera,addLog]);

  useEffect(()=>{
    const handler=e=>{
      if(e.target.tagName==="INPUT") return;
      const n=parseInt(e.key);
      if(n>=1&&n<=presets.length){e.preventDefault();switchPreset(presets[n-1]);}
      if(e.key===" "){e.preventDefault();setPlaying(p=>!p);}
      if(e.key==="f"||e.key==="F"){e.preventDefault();toggleFullscreen();}
      if(e.key==="h"||e.key==="H"){e.preventDefault();setShowUI(p=>!p);}
    };
    window.addEventListener("keydown",handler);
    return ()=>window.removeEventListener("keydown",handler);
  },[presets,switchPreset]);

  const applyBroadcast=i=>{setBroadcastIdx(i);const p=BROADCAST_PRESETS[i];setResolution({w:p.w,h:p.h,fps:p.fps});addLog(`解像度 → ${p.label}`);};
  const saveCurrentToPreset=()=>{setPresets(prev=>prev.map(p=>p.id===activePreset?{...p,theta:camera.theta,phi:camera.phi,dist:camera.dist,fov:camera.fov}:p));addLog(`プリセット ${activePreset} を上書き保存`);};

  const A="#5DCAA5",Ad="rgba(93,202,165,.15)",P="#14141c",P2="#1b1b26",B="rgba(255,255,255,.07)",T="#e8e6df",Ts="rgba(255,255,255,.4)",LC="#E24B4A";

  const slider=(key,label,min,max,step)=>(
    <div style={{display:"flex",alignItems:"center",gap:6}} key={key}>
      <span style={{fontSize:10,color:Ts,minWidth:54}}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={camera[key]||0} onChange={e=>setCamera(p=>({...p,[key]:parseFloat(e.target.value)}))} style={{flex:1}}/>
      <span style={{fontSize:10,fontFamily:"monospace",color:Ts,minWidth:34,textAlign:"right"}}>{(camera[key]||0).toFixed(step<1?1+(step<.01?1:0):0)}</span>
    </div>
  );

  const tabBtn=(id,label)=><button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"10px 0",fontSize:11,fontWeight:600,color:tab===id?A:Ts,background:"transparent",border:"none",borderBottom:tab===id?`2px solid ${A}`:"2px solid transparent",cursor:"pointer",transition:"all .12s"}}>{label}</button>;

  return (
    <div ref={appRef} style={{position:isFullscreen?"fixed":"relative",inset:isFullscreen?0:"auto",zIndex:isFullscreen?9999:"auto",display:"flex",flexDirection:"column",height:"100vh",fontFamily:"'Noto Sans JP','Hiragino Sans',system-ui,sans-serif",background:"#0f0f15",color:T,overflow:"hidden"}}>

      {showUI&&<header style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 16px",background:P,borderBottom:`1px solid ${B}`,flexShrink:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,borderRadius:8,background:`linear-gradient(135deg,${A},#378ADD)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:"#fff"}}>4D</div>
          <div>
            <div style={{fontSize:14,fontWeight:700}}>4D Gaussian Splat ビューアー</div>
            <div style={{fontSize:9,color:Ts}}>撮影講座・セミナー配信モード</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          {isLive&&<div style={{display:"flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:10,background:"rgba(226,75,74,.15)",fontSize:10,color:LC,fontWeight:700}}><div style={{width:6,height:6,borderRadius:"50%",background:LC,animation:"pulse 1s infinite"}}/>配信中</div>}
          {!playing&&<div style={{padding:"3px 10px",borderRadius:10,background:"rgba(93,202,165,.12)",fontSize:10,color:A,fontWeight:700}}>⏸ フリーズ</div>}
          <button onClick={()=>{setIsLive(!isLive);addLog(isLive?"配信停止":"配信開始");}} style={{padding:"4px 12px",borderRadius:6,border:`1px solid ${isLive?LC:B}`,background:isLive?"rgba(226,75,74,.12)":"transparent",color:isLive?LC:Ts,cursor:"pointer",fontSize:10,fontWeight:600}}>{isLive?"配信停止":"配信開始"}</button>
          <span style={{fontSize:10,fontFamily:"monospace",color:Ts,padding:"3px 8px",borderRadius:5,background:P2}}>{resolution.w}×{resolution.h}</span>
          <button onClick={toggleFullscreen} style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${B}`,background:isFullscreen?Ad:"transparent",color:isFullscreen?A:Ts,cursor:"pointer",fontSize:10,fontWeight:600}}>{isFullscreen?"全画面解除":"全画面"}</button>
          <button onClick={()=>setShowHelp(!showHelp)} style={{padding:"3px 10px",borderRadius:5,border:`1px solid ${B}`,background:showHelp?Ad:"transparent",color:showHelp?A:Ts,cursor:"pointer",fontSize:10,fontWeight:600}}>{showHelp?"解説ON":"解説OFF"}</button>
        </div>
      </header>}

      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        <div style={{flex:1,display:"flex",flexDirection:"column",position:"relative"}}>
          <div style={{flex:1,position:"relative"}}>
            <SplatCanvas splats={splats} camera={camera} time4D={time4D} resolution={resolution} isLive={isLive} playing={playing} scene={scene} onCameraChange={setCamera}/>
            <div style={{position:"absolute",top:10,right:10,display:"flex",gap:4,zIndex:10}}>
              <button onClick={()=>setShowUI(p=>!p)} style={{padding:"5px 12px",borderRadius:8,background:"rgba(0,0,0,.55)",backdropFilter:"blur(8px)",border:`1px solid ${B}`,color:"rgba(255,255,255,.6)",cursor:"pointer",fontSize:10,fontWeight:600}}>{showUI?"UI非表示 (H)":"UI表示 (H)"}</button>
              {!showUI&&<button onClick={toggleFullscreen} style={{padding:"5px 12px",borderRadius:8,background:"rgba(0,0,0,.55)",backdropFilter:"blur(8px)",border:`1px solid ${B}`,color:"rgba(255,255,255,.5)",cursor:"pointer",fontSize:10}}>{isFullscreen?"全画面解除":"全画面"}</button>}
            </div>
            {showUI&&<div style={{position:"absolute",top:10,left:10,padding:"5px 12px",borderRadius:8,background:"rgba(0,0,0,.55)",backdropFilter:"blur(8px)",fontSize:11,color:"rgba(255,255,255,.7)",display:"flex",alignItems:"center",gap:6,zIndex:10}}>
              <span>{presets.find(p=>p.id===activePreset)?.icon}</span>
              <span style={{fontWeight:600}}>{presets.find(p=>p.id===activePreset)?.name}</span>
              <span style={{fontSize:9,color:"rgba(255,255,255,.3)"}}>| {scene.name}</span>
            </div>}
            {showUI&&showHelp&&<div style={{position:"absolute",bottom:8,left:10,padding:"6px 12px",borderRadius:8,background:"rgba(0,0,0,.5)",backdropFilter:"blur(8px)",fontSize:9,color:"rgba(255,255,255,.4)",display:"flex",gap:10,zIndex:10,flexWrap:"wrap"}}>
              <span>🖱左ドラッグ:回転</span><span>⚙ホイール:ズーム</span><span>🖱右ドラッグ:仰角</span><span>Space:再生/フリーズ</span>
            </div>}
          </div>

          {showUI&&<div style={{padding:"8px 16px 12px",background:P,borderTop:`1px solid ${B}`,flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <button onClick={()=>{setPlaying(!playing);addLog(playing?"⏸ フリーズ":"▶ 再生再開");}} style={{width:34,height:34,borderRadius:"50%",background:playing?A:LC,border:"none",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,transition:"background .2s"}}>{playing?"⏸":"▶"}</button>
              <div style={{flex:1}}>
                <input type="range" min={0} max={duration} step={.01} value={time4D} onChange={e=>{setTime4D(parseFloat(e.target.value));if(playing)setPlaying(false);}} style={{width:"100%"}}/>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:Ts,marginTop:2}}>
                  <span>⏱ t={time4D.toFixed(2)}s {!playing&&<span style={{color:LC,fontWeight:600}}>| フリーズ</span>}</span><span>全長 {duration}s</span>
                </div>
              </div>
              <div style={{display:"flex",gap:3}}>
                {[.5,1,2].map(s=><button key={s} onClick={()=>setSpeed(s)} style={{padding:"2px 8px",borderRadius:4,fontSize:9,fontWeight:600,border:speed===s?`1px solid ${A}`:`1px solid ${B}`,background:speed===s?Ad:"transparent",color:speed===s?A:Ts,cursor:"pointer"}}>{s}x</button>)}
              </div>
              {showHelp&&<Tip id="freeze"/>}
            </div>
          </div>}
        </div>

        {showUI&&<div style={{width:340,flexShrink:0,background:P,borderLeft:`1px solid ${B}`,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{display:"flex",borderBottom:`1px solid ${B}`,flexShrink:0}}>
            {tabBtn("data","データ")}
            {tabBtn("director","ディレクター")}
            {tabBtn("scene","シーン")}
            {tabBtn("presets","プリセット")}
            {tabBtn("broadcast","配信")}
          </div>
          <div style={{flex:1,overflow:"auto",padding:14}}>

            {/* ═══ データ読み込み ═══ */}
            {tab==="data"&&<div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div>
                <span style={{fontSize:10,fontWeight:700,color:Ts,textTransform:"uppercase",letterSpacing:".08em",display:"block",marginBottom:8}}>現在のモデル</span>
                <div style={{padding:"12px 14px",borderRadius:10,background:P2,border:`1px solid ${B}`}}>
                  <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>👤 デモ: ダンス人型モデル</div>
                  <div style={{fontSize:11,color:Ts,lineHeight:1.6}}>
                    {splats.length.toLocaleString()}個のガウシアンスプラット<br/>
                    頭部・胴体・四肢を個別パーツで構成<br/>
                    4D時間軸でダンスアニメーション再生中
                  </div>
                </div>
              </div>

              <div>
                <span style={{fontSize:10,fontWeight:700,color:Ts,textTransform:"uppercase",letterSpacing:".08em",display:"block",marginBottom:8}}>ファイルから読み込み</span>
                <div style={{padding:"20px 16px",borderRadius:10,border:"1px dashed rgba(255,255,255,.12)",textAlign:"center",cursor:"pointer",transition:"border-color .2s"}}
                  onClick={()=>document.getElementById("file-in")?.click()}
                  onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor="rgba(93,202,165,.5)";}}
                  onDragLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,.12)";}}
                  onDrop={e=>{e.preventDefault();e.currentTarget.style.borderColor="rgba(255,255,255,.12)";const f=e.dataTransfer.files[0];if(f){addLog(`ファイル選択: ${f.name} (※レンダラー実装後に表示)`);}}} >
                  <div style={{fontSize:20,marginBottom:6,opacity:.4}}>📂</div>
                  <div style={{fontSize:12,color:Ts}}>
                    .splat / .ply / .splatv ファイルを<br/>ドラッグ&ドロップ または クリック
                  </div>
                  <div style={{fontSize:9,color:"#EF9F27",marginTop:6}}>※ ファイル選択のみ対応（レンダリングは次期バージョン）</div>
                  <input id="file-in" type="file" accept=".splat,.ply,.splatv" style={{display:"none"}}
                    onChange={e=>{const f=e.target.files?.[0];if(f) addLog(`ファイル選択: ${f.name} (※レンダラー実装後に表示)`);}}/>
                </div>
              </div>

              <div>
                <span style={{fontSize:10,fontWeight:700,color:Ts,textTransform:"uppercase",letterSpacing:".08em",display:"block",marginBottom:8}}>URLから読み込み</span>
                <div style={{display:"flex",gap:6}}>
                  <input id="url-input" type="text" placeholder="https://...splat または .ply のURL"
                    style={{flex:1,padding:"7px 10px",fontSize:11,borderRadius:6,border:`1px solid ${B}`,background:P2,color:T}}/>
                  <button onClick={()=>{const v=document.getElementById("url-input")?.value;if(v)addLog(`URL登録: ${v} (※レンダラー実装後に読込)`);}}
                    style={{padding:"7px 14px",borderRadius:6,border:`1px solid ${B}`,background:P2,color:T,cursor:"pointer",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>登録</button>
                </div>
                <div style={{fontSize:9,color:Ts,marginTop:4}}>※ URL登録のみ対応。WebGLレンダラー統合後にフェッチ&表示が有効になります</div>
              </div>

              <div>
                <span style={{fontSize:10,fontWeight:700,color:Ts,textTransform:"uppercase",letterSpacing:".08em",display:"block",marginBottom:8}}>サンプルデータ（Hugging Face）</span>
                <div style={{padding:"8px 10px",borderRadius:6,background:"rgba(239,159,39,.08)",border:"1px solid rgba(239,159,39,.2)",fontSize:10,color:"#EF9F27",lineHeight:1.6,marginBottom:8}}>
                  ⚠ 外部 .splat データの読み込み・レンダリングは次期バージョンで実装予定です。<br/>
                  現在はデモの人型モデルが表示されます。
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {[
                    {name:"Bonsai",url:"https://huggingface.co/datasets/dylanebert/3dgs/resolve/main/bonsai/bonsai-7k.splat",size:"~3.5 MB"},
                    {name:"Bicycle",url:"https://huggingface.co/datasets/dylanebert/3dgs/resolve/main/bicycle/bicycle-7k.splat",size:"~3.5 MB"},
                    {name:"Garden",url:"https://huggingface.co/datasets/dylanebert/3dgs/resolve/main/garden/garden-7k.splat",size:"~3.5 MB"},
                    {name:"Stump",url:"https://huggingface.co/datasets/dylanebert/3dgs/resolve/main/stump/stump-7k.splat",size:"~3.5 MB"},
                    {name:"Kitchen",url:"https://huggingface.co/datasets/dylanebert/3dgs/resolve/main/kitchen/kitchen-7k.splat",size:"~3.5 MB"},
                  ].map(d=>(
                    <div key={d.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",borderRadius:6,border:`1px solid ${B}`,background:P2,fontSize:11}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontWeight:600,color:T}}>{d.name}</span>
                        <span style={{fontSize:8,padding:"1px 6px",borderRadius:3,background:"rgba(255,255,255,.06)",color:Ts}}>実装予定</span>
                      </div>
                      <span style={{fontSize:9,color:Ts}}>{d.size}</span>
                    </div>
                  ))}
                </div>
                <div style={{marginTop:8,padding:"8px 10px",borderRadius:6,background:P2,fontSize:9,color:Ts,lineHeight:1.6}}>
                  <b style={{color:T}}>実装に必要なもの:</b> gsplat.js または antimatter15/splat の<br/>
                  WebGLレンダラーを統合し、.splat バイナリをパース→GPUに送信する処理を追加
                </div>
              </div>

              <div>
                <span style={{fontSize:10,fontWeight:700,color:Ts,textTransform:"uppercase",letterSpacing:".08em",display:"block",marginBottom:8}}>対応形式</span>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {[
                    {ext:".splat",desc:"圧縮スプラット形式（antimatter15互換）"},
                    {ext:".ply",desc:"PLY点群 → 自動変換（INRIA / 3DGS標準出力）"},
                    {ext:".splatv",desc:"SpaceTime 4Dガウシアン（時間軸付き）"},
                  ].map(f=>(
                    <div key={f.ext} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:6,background:P2}}>
                      <code style={{fontSize:12,color:A,fontWeight:600,fontFamily:"monospace"}}>{f.ext}</code>
                      <span style={{fontSize:10,color:Ts}}>{f.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <span style={{fontSize:10,fontWeight:700,color:Ts,textTransform:"uppercase",letterSpacing:".08em",display:"block",marginBottom:8}}>参考リポジトリ</span>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {[
                    {name:"hustvl/4DGaussians",desc:"CVPR 2024 — 元祖4D-GS",url:"https://github.com/hustvl/4DGaussians"},
                    {name:"fudan-zvg/4d-gaussian-splatting",desc:"ICLR 2024 — 4Dプリミティブ",url:"https://github.com/fudan-zvg/4d-gaussian-splatting"},
                    {name:"antimatter15/splat",desc:"WebGL 3Dスプラットビューアー",url:"https://github.com/antimatter15/splat"},
                    {name:"huggingface/gsplat.js",desc:"JS向けGSライブラリ",url:"https://github.com/huggingface/gsplat.js"},
                    {name:"SpacetimeGaussians",desc:"時空間ガウシアン特徴",url:"https://github.com/oppo-us-research/SpacetimeGaussians"},
                  ].map(r=>(
                    <a key={r.name} href={r.url} target="_blank" rel="noopener" style={{display:"block",padding:"8px 10px",borderRadius:6,border:`1px solid ${B}`,textDecoration:"none",color:T}}>
                      <div style={{fontSize:11,fontWeight:600,color:A}}>{r.name}</div>
                      <div style={{fontSize:9,color:Ts,marginTop:1}}>{r.desc}</div>
                    </a>
                  ))}
                </div>
              </div>
            </div>}

            {/* ═══ ディレクター ═══ */}
            {tab==="director"&&<div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:8}}><span style={{fontSize:10,fontWeight:700,color:Ts,textTransform:"uppercase",letterSpacing:".08em"}}>カメラ切替</span>{showHelp&&<Tip id="director"/>}</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
                  {presets.map((p,i)=>(
                    <button key={p.id} onClick={()=>switchPreset(p)} style={{padding:"10px 10px 8px",borderRadius:8,textAlign:"left",border:activePreset===p.id?`2px solid ${A}`:`1px solid ${B}`,background:activePreset===p.id?Ad:"transparent",cursor:"pointer",transition:"all .12s",color:T,position:"relative"}}>
                      <div style={{position:"absolute",top:4,right:6,fontSize:9,fontFamily:"monospace",color:Ts,opacity:.5}}>{i+1}</div>
                      <div style={{fontSize:16,marginBottom:2}}>{p.icon}</div>
                      <div style={{fontSize:11,fontWeight:600}}>{p.name}</div>
                      <div style={{fontSize:9,color:Ts,marginTop:1}}>{p.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:8}}><span style={{fontSize:10,fontWeight:700,color:Ts,textTransform:"uppercase",letterSpacing:".08em"}}>トランジション</span>{showHelp&&<Tip id="transition"/>}</div>
                <div style={{display:"flex",gap:4}}>
                  {[{id:"cut",label:"カット"},{id:"smooth",label:"スムーズ"}].map(tt=>(<button key={tt.id} onClick={()=>{setTransition(tt.id);addLog(`トランジション → ${tt.label}`);}} style={{flex:1,padding:"8px",borderRadius:6,fontSize:11,fontWeight:600,border:transition===tt.id?`1.5px solid ${A}`:`1px solid ${B}`,background:transition===tt.id?Ad:"transparent",color:transition===tt.id?A:Ts,cursor:"pointer"}}>{tt.label}</button>))}
                </div>
              </div>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:8}}><span style={{fontSize:10,fontWeight:700,color:Ts,textTransform:"uppercase",letterSpacing:".08em"}}>微調整</span>{showHelp&&<Tip id="mouse"/>}</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {slider("theta","水平角度",-3.14,3.14,.01)}
                  {slider("phi","仰角",-.8,1.5,.01)}
                  {slider("dist","距離",.5,10,.1)}
                  {slider("fov","画角",20,120,1)}
                </div>
                <button onClick={saveCurrentToPreset} style={{marginTop:8,width:"100%",padding:"7px",borderRadius:6,border:`1px solid ${B}`,background:P2,color:T,cursor:"pointer",fontSize:11,fontWeight:600}}>プリセット {activePreset} に保存</button>
              </div>
              <div>
                <span style={{fontSize:10,fontWeight:700,color:Ts,textTransform:"uppercase",letterSpacing:".08em",display:"block",marginBottom:6}}>操作ログ</span>
                <div style={{maxHeight:90,overflow:"auto",borderRadius:6,background:P2,border:`1px solid ${B}`,padding:"6px 8px"}}>
                  {log.length===0?<div style={{fontSize:10,color:Ts,textAlign:"center",padding:8}}>操作が記録されます</div>:log.map((l,i)=><div key={i} style={{fontSize:10,color:i===0?A:Ts,padding:"2px 0",borderBottom:`1px solid ${B}`,display:"flex",gap:6}}><span style={{fontFamily:"monospace",color:Ts,flexShrink:0}}>{l.ts}</span><span>{l.msg}</span></div>)}
                </div>
              </div>
            </div>}

            {/* ═══ シーン設定 ═══ */}
            {tab==="scene"&&<div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:4}}>
                <span style={{fontSize:10,fontWeight:700,color:Ts,textTransform:"uppercase",letterSpacing:".08em"}}>シーン環境</span>
                {showHelp&&<Tip id="scene"/>}
              </div>
              {SCENE_PRESETS.map(sp=>(
                <button key={sp.id} onClick={()=>{setScene(sp);addLog(`シーン → ${sp.name}`);}} style={{
                  display:"flex",gap:12,alignItems:"flex-start",padding:"14px",borderRadius:10,textAlign:"left",
                  border:scene.id===sp.id?`2px solid ${A}`:`1px solid ${B}`,
                  background:scene.id===sp.id?Ad:"transparent",cursor:"pointer",color:T,transition:"all .15s"
                }}>
                  <div style={{width:48,height:48,borderRadius:8,background:sp.bgColor,border:"1px solid rgba(0,0,0,.2)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,position:"relative",overflow:"hidden"}}>
                    {sp.trackingMarkers&&<>
                      <div style={{position:"absolute",top:4,left:4,width:4,height:4,border:"1px solid rgba(0,0,0,.4)",borderRadius:0}}/>
                      <div style={{position:"absolute",top:4,right:4,width:4,height:4,border:"1px solid rgba(0,0,0,.4)"}}/>
                      <div style={{position:"absolute",bottom:4,left:4,width:4,height:4,border:"1px solid rgba(0,0,0,.4)"}}/>
                      <div style={{position:"absolute",bottom:4,right:4,width:4,height:4,border:"1px solid rgba(0,0,0,.4)"}}/>
                      <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:3,height:3,background:"rgba(0,0,0,.5)",borderRadius:"50%"}}/>
                    </>}
                    {!sp.trackingMarkers&&<span>{sp.icon}</span>}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700,marginBottom:2}}>{sp.icon} {sp.name}</div>
                    <div style={{fontSize:10,color:Ts,lineHeight:1.5}}>{sp.desc}</div>
                    {sp.id==="tracking"&&<div style={{marginTop:6,fontSize:9,color:Ts,padding:"4px 8px",borderRadius:4,background:"rgba(0,0,0,.15)",border:`1px solid ${B}`,lineHeight:1.5}}>
                      壁面・床面・天井に{TRACKING_MARKERS_3D.length}個のトラッキングポイント配置<br/>
                      被写体周辺(中心±0.5m)にはマーカー無し<br/>
                      After Effects / Nuke 等の3Dトラッカーで使用
                    </div>}
                    {sp.id==="chromakey"&&<div style={{marginTop:6,fontSize:9,color:Ts,padding:"4px 8px",borderRadius:4,background:"rgba(0,0,0,.15)",border:`1px solid ${B}`,lineHeight:1.5}}>
                      背景色: #00B140 (標準グリーン)<br/>
                      グリッド・マーカー無し（純色のみ）<br/>
                      OBS → フィルタ → クロマキー で即合成
                    </div>}
                  </div>
                </button>
              ))}

              <div style={{padding:"12px",borderRadius:8,background:P2,border:`1px solid ${B}`,fontSize:10,color:Ts,lineHeight:1.7}}>
                <div style={{fontWeight:700,color:T,marginBottom:4}}>💡 使い分けガイド</div>
                <b style={{color:T}}>デフォルト:</b> 通常の講座・セミナー配信に<br/>
                <b style={{color:T}}>3Dトラッキング:</b> After Effects/Nukeでカメラトラッキング→ 3DCG合成用の素材撮影に。フリーズと組み合わせて各フレームの3D情報を取得<br/>
                <b style={{color:T}}>クロマキー:</b> OBS/Zoom配信で背景をリアルタイム合成。背景は純粋なグリーン一色なので高品質なキーイングが可能
              </div>
            </div>}

            {/* ═══ プリセット ═══ */}
            {tab==="presets"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:4}}><span style={{fontSize:10,fontWeight:700,color:Ts,textTransform:"uppercase",letterSpacing:".08em"}}>カメラプリセット</span>{showHelp&&<Tip id="preset"/>}</div>
              {presets.map((p,i)=>(
                <div key={p.id} style={{padding:"12px",borderRadius:10,background:activePreset===p.id?Ad:P2,border:activePreset===p.id?`1.5px solid ${A}`:`1px solid ${B}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:18}}>{p.icon}</span><div><div style={{fontSize:12,fontWeight:700}}>{p.name}</div><div style={{fontSize:9,color:Ts}}>{p.desc}</div></div></div>
                    <div style={{display:"flex",gap:4}}><span style={{fontSize:9,fontFamily:"monospace",color:Ts,padding:"2px 6px",borderRadius:4,background:"rgba(255,255,255,.05)"}}>キー:{i+1}</span><button onClick={()=>switchPreset(p)} style={{padding:"3px 10px",borderRadius:5,border:`1px solid ${A}`,background:Ad,color:A,cursor:"pointer",fontSize:10,fontWeight:600}}>適用</button></div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:3,fontSize:9,color:Ts}}><span>水平:{p.theta.toFixed(2)}</span><span>仰角:{p.phi.toFixed(2)}</span><span>距離:{p.dist.toFixed(1)}</span><span>画角:{p.fov}</span></div>
                </div>
              ))}
              <div style={{padding:"12px",borderRadius:8,background:P2,border:`1px dashed rgba(255,255,255,.1)`,textAlign:"center",fontSize:11,color:Ts,cursor:"pointer"}} onClick={()=>{const newId=Math.max(...presets.map(p=>p.id))+1;setPresets(prev=>[...prev,{id:newId,name:`カスタム ${newId}`,icon:"📷",theta:camera.theta,phi:camera.phi,dist:camera.dist,fov:camera.fov,desc:"現在位置から作成"}]);addLog(`プリセット ${newId} を追加`);}}>+ 新規プリセット追加</div>
            </div>}

            {/* ═══ 配信 ═══ */}
            {tab==="broadcast"&&<div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div>
                <span style={{fontSize:10,fontWeight:700,color:Ts,textTransform:"uppercase",letterSpacing:".08em",display:"block",marginBottom:8}}>配信先</span>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {BROADCAST_PRESETS.map((p,i)=>(<button key={p.name} onClick={()=>applyBroadcast(i)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",borderRadius:8,textAlign:"left",border:broadcastIdx===i?`1.5px solid ${A}`:`1px solid ${B}`,background:broadcastIdx===i?Ad:"transparent",cursor:"pointer",color:T}}><div><div style={{fontSize:12,fontWeight:600}}>{p.name}</div><div style={{fontSize:9,color:Ts,marginTop:1}}>{p.w}×{p.h}/{p.fps}fps</div></div><span style={{fontSize:9,padding:"2px 8px",borderRadius:4,background:P2,color:Ts}}>{p.label}</span></button>))}
                </div>
              </div>
              <div style={{padding:"12px",borderRadius:8,background:P2,border:`1px solid ${B}`,fontSize:10,color:Ts,lineHeight:1.8}}>
                <b style={{color:T}}>OBS:</b> ソース追加→ブラウザ→URL入力→幅{resolution.w}/高さ{resolution.h}<br/>
                <b style={{color:T}}>Zoom:</b> 画面共有→このウィンドウ<br/>
                <b style={{color:T}}>YouTube:</b> OBS経由ストリームキー設定
              </div>
              <button onClick={()=>{navigator.clipboard?.writeText(JSON.stringify({type:"browser_source",url:window.location.href,width:resolution.w,height:resolution.h,fps:resolution.fps},null,2));addLog("OBS設定コピー");}} style={{padding:"10px",borderRadius:8,border:`1px solid ${B}`,background:P2,color:T,cursor:"pointer",fontSize:11,fontWeight:600,textAlign:"center"}}>📋 OBS設定JSONコピー</button>
              <div>
                <span style={{fontSize:10,fontWeight:700,color:Ts,textTransform:"uppercase",letterSpacing:".08em",display:"block",marginBottom:8}}>カスタム解像度</span>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                  {[{k:"w",l:"幅"},{k:"h",l:"高さ"},{k:"fps",l:"FPS"}].map(f=>(<div key={f.k}><label style={{fontSize:9,color:Ts,display:"block",marginBottom:3}}>{f.l}</label><input type="number" value={resolution[f.k]} onChange={e=>setResolution(p=>({...p,[f.k]:parseInt(e.target.value)||0}))} style={{width:"100%",padding:"5px 7px",fontSize:11,fontFamily:"monospace",borderRadius:5,border:`1px solid ${B}`,background:P2,color:T}}/></div>))}
                </div>
              </div>
            </div>}
          </div>
        </div>}
      </div>

      <style>{`
        *{box-sizing:border-box;margin:0}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.06);border-radius:2px}
        input[type="range"]{accent-color:#5DCAA5}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
      `}</style>
    </div>
  );
}
