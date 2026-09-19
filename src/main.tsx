import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Konva from "konva";
import { Group, Image as KImage, Layer, Rect, Stage, Text } from "react-konva";
import { load, save } from "./store";
import type { SkyDocument, SkyNode } from "./types";
import "./style.css";

const clamp=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n));

function Raster({node}:{node:SkyNode}) {
  const [image,setImage]=useState<HTMLImageElement|null>(null);
  useEffect(()=>{
    if(!node.src)return;
    const img=new Image();
    img.onload=()=>setImage(img);
    img.src=node.src;
  },[node.src]);
  return image?<KImage image={image} x={node.x} y={node.y} width={node.width} height={node.height} opacity={node.opacity??1}/>:null;
}

function SceneNode({node}:{node:SkyNode}) {
  if(node.type==="image") return <Raster node={node}/>;
  if(node.type==="text") return <Text x={node.x} y={node.y} width={node.width} height={node.height} text={node.text} fill={node.fill} fontSize={node.fontSize} fontFamily={node.fontFamily} fontStyle={(node.fontWeight??400)>=600?"bold":"normal"} lineHeight={node.lineHeight} letterSpacing={node.letterSpacing} align={node.textAlign} opacity={node.opacity??1}/>;
  return <Group x={node.x} y={node.y} rotation={node.rotation??0} opacity={node.opacity??1}>
    <Rect width={node.width} height={node.height} fill={node.fill} cornerRadius={node.radius} stroke={node.stroke} strokeWidth={node.strokeWidth}/>
    {node.children?.map(child=><SceneNode key={child.id} node={{...child,x:child.x,y:child.y}}/>)}
  </Group>;
}

const bytesToBase64=(bytes:Uint8Array)=>{
  let s=""; const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk)s+=String.fromCharCode(...bytes.subarray(i,i+chunk));
  return btoa(s).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
};

async function encodeDocument(doc:SkyDocument){
  const input=new TextEncoder().encode(JSON.stringify(doc));
  if("CompressionStream" in window){
    const stream=new Blob([input]).stream().pipeThrough(new CompressionStream("gzip"));
    return "gz."+bytesToBase64(new Uint8Array(await new Response(stream).arrayBuffer()));
  }
  return "raw."+bytesToBase64(input);
}

function imageDimensions(src:string){return new Promise<{width:number;height:number}>(resolve=>{const i=new Image();i.onload=()=>resolve({width:i.naturalWidth,height:i.naturalHeight});i.src=src;});}

function App(){
  const [doc,setDoc]=useState<SkyDocument>(load);
  const [scale,setScale]=useState(1);
  const [position,setPosition]=useState({x:window.innerWidth/2-doc.width/2,y:window.innerHeight/2-doc.height/2});
  const [notice,setNotice]=useState("Paste a design anywhere");
  const stageRef=useRef<Konva.Stage|null>(null);
  const hasDesign=doc.nodes.length>0;

  useEffect(()=>save(doc),[doc]);
  useEffect(()=>{
    const paste=async(event:ClipboardEvent)=>{
      const items=[...(event.clipboardData?.items??[])];
      const imageItem=items.find(i=>i.type.startsWith("image/"));
      if(imageItem){
        event.preventDefault();
        const file=imageItem.getAsFile(); if(!file)return;
        const src=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(file);});
        const size=await imageDimensions(src);
        const next:SkyDocument={version:1,id:crypto.randomUUID(),name:"Pasted design",width:size.width,height:size.height,background:"#ffffff",nodes:[{id:crypto.randomUUID(),type:"image",name:"Pasted design",x:0,y:0,width:size.width,height:size.height,src,metadata:{mime:file.type,source:"clipboard"}}],metadata:{source:"clipboard",pastedAt:new Date().toISOString()}};
        setDoc(next);setPosition({x:window.innerWidth/2-size.width/2,y:window.innerHeight/2-size.height/2});setScale(Math.min(1,(window.innerWidth-80)/size.width,(window.innerHeight-80)/size.height));setNotice("Design captured");
        return;
      }
      const text=event.clipboardData?.getData("text/plain")?.trim();
      if(text?.startsWith("{")){
        try{
          const parsed=JSON.parse(text) as SkyDocument;
          if(parsed.nodes&&parsed.width&&parsed.height){event.preventDefault();setDoc({...parsed,id:crypto.randomUUID()});setNotice("Structured design captured");}
        }catch{}
      }
    };
    window.addEventListener("paste",paste);
    return()=>window.removeEventListener("paste",paste);
  },[]);

  const wheel=(e:Konva.KonvaEventObject<WheelEvent>)=>{
    e.evt.preventDefault();
    const stage=stageRef.current;if(!stage)return;
    const pointer=stage.getPointerPosition();if(!pointer)return;
    const old=scale;
    const mouse={x:(pointer.x-position.x)/old,y:(pointer.y-position.y)/old};
    const direction=e.evt.deltaY>0?-1:1;
    const next=clamp(old*Math.pow(1.12,direction),0.05,8);
    setScale(next);setPosition({x:pointer.x-mouse.x*next,y:pointer.y-mouse.y*next});
  };

  const copyLink=async()=>{
    if(!hasDesign){setNotice("Paste a design first");return;}
    setNotice("Packing design…");
    const payload=await encodeDocument(doc);
    const url=location.origin+location.pathname+"#design="+payload;
    await navigator.clipboard.writeText(url);
    setNotice("Design link copied");
  };

  const copyMcp=async()=>{
    const config={mcpServers:{skycanvas:{command:"npm",args:["run","mcp"],cwd:"/path/to/skycanvas"}}};
    await navigator.clipboard.writeText(JSON.stringify(config,null,2));
    setNotice("MCP config copied");
  };

  const zoomLabel=useMemo(()=>Math.round(scale*100)+"%",[scale]);

  return <main className="app">
    <Stage ref={stageRef} width={window.innerWidth} height={window.innerHeight} draggable x={position.x} y={position.y} scaleX={scale} scaleY={scale} onDragEnd={e=>setPosition({x:e.target.x(),y:e.target.y()})} onWheel={wheel}>
      <Layer>
        {hasDesign&&<Rect x={-1} y={-1} width={doc.width+2} height={doc.height+2} fill={doc.background} shadowColor="#000" shadowBlur={32/scale} shadowOpacity={.18}/>}
        {doc.nodes.map(node=><SceneNode key={node.id} node={node}/>)}
      </Layer>
    </Stage>
    {!hasDesign&&<div className="empty"><div className="mark">S</div><h1>Paste your design</h1><p>Copy a design, frame, screenshot or SkyCanvas scene and press <kbd>Ctrl</kbd> <span>+</span> <kbd>V</kbd></p><small>SkyCanvas keeps the canvas out of your way.</small></div>}
    <div className="brand">SKYCANVAS <span>α</span></div>
    <div className="controls">
      <button onClick={copyMcp} title="Copy MCP configuration"><i className="dot"/> MCP</button>
      <button onClick={copyLink} className="share" disabled={!hasDesign}>Copy design link</button>
    </div>
    <div className="status"><span>{notice}</span><b>{zoomLabel}</b></div>
  </main>;
}
createRoot(document.getElementById("root")!).render(<App/>);
