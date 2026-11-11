'use client';
import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
export function Player({id,name}:{id:string;name:string}) {
 const ref=useRef<HTMLVideoElement>(null),[error,setError]=useState('');
 useEffect(()=>{
  const video=ref.current;if(!video)return;
  const src=`/api/streams/${id}/index.m3u8`;
  let hls:Hls|undefined;
  const failed=()=>setError('Stream tidak tersedia atau akses berakhir. Muat ulang untuk mencoba kembali.');
  video.addEventListener('error',failed);
  if(Hls.isSupported()) {
   hls=new Hls({maxBufferLength:8,backBufferLength:0,maxMaxBufferLength:16,enableWorker:true});
   hls.loadSource(src);hls.attachMedia(video);
   hls.on(Hls.Events.ERROR,(_e,data)=>{if(data.fatal){failed();hls?.destroy();}});
  } else if(video.canPlayType('application/vnd.apple.mpegurl')) video.src=src;
  else setError('Browser ini tidak mendukung HLS.');
  return ()=>{hls?.destroy();video.removeEventListener('error',failed);video.removeAttribute('src');video.load();};
 },[id]);
 return <div className="video-wrap"><video ref={ref} aria-label={`Siaran ${name}`} autoPlay muted controls playsInline/>{error&&<div role="alert" className="video-error">{error}</div>}</div>;
}
