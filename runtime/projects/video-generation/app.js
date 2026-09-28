(() => {
  const $ = (s) => document.querySelector(s);
  const base = [["雨落进站台","傍晚的地铁站台，雨水沿着玻璃滑落。女孩撑着透明伞走向镜头，暖黄站灯映在积水上。","缓慢推进",5],["目光停留","承接上一镜头的女孩。她收起透明伞，隔着车厢玻璃看见熟悉的人，轻轻停下脚步。","跟随主体",5],["门开启的瞬间","保持同一站台与人物服装。列车门打开，女孩向前迈出一步，风吹起发梢。","横向摇镜",3]];
  const saved = (() => { try { return JSON.parse(localStorage.getItem("eido-short-drama-scenes")); } catch { return null; } })();
  const serviceConfig = (() => { try { return JSON.parse(localStorage.getItem("eido-video-service-config")); } catch { return null; } })();
  const S = { scenes: saved || base.map(([title,prompt,motion,duration],i) => ({id:crypto.randomUUID(),title,prompt,motion,duration,image:"",status:i === 0 ? "ready" : "draft"})), selected:0, playing:false, timer:0, service:serviceConfig || {name:"本地视频服务",url:"http://127.0.0.1:8091/v1/videos"} };
  const current = () => S.scenes[S.selected];
  const serviceFor = (scene) => scene.serviceUrl || S.service.url;
  const contentUrl = (scene) => scene.taskId ? `/api/project-runtime/videos?id=${encodeURIComponent(scene.taskId)}&service_url=${encodeURIComponent(serviceFor(scene))}&content=1` : "";
  const playableUrl = (scene) => scene.videoUrl || contentUrl(scene);
  const save = () => { try { localStorage.setItem("eido-short-drama-scenes",JSON.stringify(S.scenes)); } catch {} };
  const total = () => S.scenes.reduce((sum,scene) => sum + scene.duration, 0);
  const escape = (value) => { const el=document.createElement("span"); el.textContent=value; return el.innerHTML; };
  const status = (scene) => scene.status === "ready" ? "已生成" : scene.status === "making" ? "生成中" : "待生成";
  function renderList() {
    $("#scenes").replaceChildren(...S.scenes.map((scene,index) => {
      const item=document.createElement("li"), button=document.createElement("button");
      button.className=`scene ${index===S.selected?"active":""}`;
      button.innerHTML=`<span class="num">${String(index+1).padStart(2,"0")}</span><span><strong>${escape(scene.title||"未命名镜头")}</strong><span>${escape(scene.prompt||"尚未填写描述")}</span><em class="${scene.status==="ready"?"ready":""}">${status(scene)} · ${scene.duration} 秒</em></span>`;
      button.onclick=()=>{S.selected=index;render();}; item.append(button); return item;
    }));
    $("#count").textContent=`${S.scenes.length} 个镜头`;
  }
  function updateFrame(index, elapsed=0) {
    const scene=S.scenes[index], prior=S.scenes.slice(0,index).reduce((sum,item)=>sum+item.duration,0);
    $("#now").textContent=`镜头 ${String(index+1).padStart(2,"0")} · ${scene.title}`;
    $("#time").textContent=`0:${String(Math.floor(prior+elapsed)).padStart(2,"0")} / 0:${String(total()).padStart(2,"0")}`;
    $("#filmImage").hidden=!scene.image; $("#filmImage").src=scene.image||"";
    if(!S.playing&&typeof filmVideo!=="undefined"){const url=playableUrl(scene);if(url&&filmVideo.src!==new URL(url,location.href).href){$("#filmImage").hidden=true;filmVideo.src=url;filmVideo.load();}}
    document.querySelectorAll(".part").forEach((part,i)=>{part.classList.toggle("active",i===index);part.firstElementChild.style.width=i<index?"100%":i===index?`${elapsed/scene.duration*100}%`:"0%";});
  }
  function renderFilm() {
    $("#total").textContent=`${total()} 秒 · ${S.scenes.length} 个镜头`;
    $("#state").textContent=S.scenes.every(scene=>scene.status==="ready")?"全部已生成":"待生成";
    $("#timeline").replaceChildren(...S.scenes.map((scene,index)=>{const part=document.createElement("div");part.className=`part ${index===S.selected?"active":""}`;part.style.flex=String(scene.duration);part.innerHTML=`<span></span><label>${index+1}</label>`;part.onclick=()=>{S.selected=index;render();};return part;}));
    updateFrame(S.selected,0);
  }
  function render() {
    const scene=current(), previous=S.scenes[S.selected-1]; renderList();
    $("#number").textContent=`镜头 ${String(S.selected+1).padStart(2,"0")}`; $("#heading").textContent=scene.title||"未命名镜头";
    $("#title").value=scene.title; $("#prompt").value=scene.prompt; $("#duration").value=String(scene.duration); $("#words").textContent=String(scene.prompt.length);
    $("#preview").hidden=!scene.image; $("#preview").style.backgroundImage=scene.image?`url("${scene.image}")`:""; $("#remove").hidden=!scene.image;
    document.querySelectorAll("#motions button").forEach(button=>button.classList.toggle("active",button.textContent===scene.motion));
    $("#continuity").textContent=previous?`将承接“${previous.title}”的最终画面，让角色、光线与空间保持连续。`:"首个镜头将建立人物、场景与视觉基调。";
    $("#del").disabled=S.scenes.length===1; $("#up").disabled=S.selected===0; $("#down").disabled=S.selected===S.scenes.length-1; renderFilm(); save();
  }
  function change(fields) { Object.assign(current(),fields); render(); }
  async function generate(index) {
    const scene=S.scenes[index]; if(!scene.prompt.trim()){S.selected=index;render();$("#prompt").focus();return false;}
    scene.status="making"; scene.error=""; render();
    scene.serviceUrl=S.service.url; const body=new FormData(); body.set("prompt",scene.prompt); body.set("seconds",String(Math.max(4,scene.duration))); body.set("aspect_ratio","16:9"); body.set("service_url",scene.serviceUrl);
    if(scene.image){const blob=await fetch(scene.image).then(result=>result.blob());body.set("image_reference",blob,"scene-reference.png");}
    try {
      const response=await fetch("/api/project-runtime/videos",{method:"POST",body}); const task=await response.json();
      if(!response.ok) throw new Error(task.error||"视频服务未能创建任务。"); scene.taskId=task.id; await poll(scene);
      scene.status="ready"; scene.videoUrl=task.url||task.video_url||scene.videoUrl||"";
    } catch(error) { scene.status="draft"; scene.error=error instanceof Error?error.message:"生成失败"; alert(`镜头生成失败：${scene.error}`); }
    render(); return scene.status==="ready";
  }
  async function poll(scene) {
    for(let count=0;count<180;count+=1){await new Promise(resolve=>setTimeout(resolve,2000));const response=await fetch(`/api/project-runtime/videos?id=${encodeURIComponent(scene.taskId)}&service_url=${encodeURIComponent(serviceFor(scene))}`,{cache:"no-store"});const task=await response.json();if(!response.ok||task.status==="failed")throw new Error(task.error?.message||task.error||"视频生成失败。");if(task.status==="completed"||task.status==="succeeded"){scene.videoUrl=task.url||task.video_url||task.output_url||task.content_url||contentUrl(scene);return;}}
    throw new Error("视频生成超时，请稍后重试。");
  }
  const filmVideo=Object.assign(document.createElement("video"),{id:"filmVideo",preload:"metadata",playsInline:true,ariaLabel:"分镜成片预览"});
  Object.assign(filmVideo.style,{position:"absolute",zIndex:"2",inset:"0",width:"100%",height:"100%",objectFit:"cover",background:"#1d2725"});
  $("#visual").append(filmVideo);
  function stop(){S.playing=false;clearInterval(S.timer);filmVideo.pause();$("#player").classList.remove("playing");}
  function playScene(index, offset=0){const scene=S.scenes[index],url=playableUrl(scene);if(!url){stop();alert(`镜头 ${index+1} 尚未生成视频，请先重新生成该镜头。`);return;}S.selected=index;updateFrame(index,offset);$("#filmImage").hidden=true;filmVideo.src=url;filmVideo.onloadedmetadata=()=>{filmVideo.currentTime=Math.min(offset,Math.max(0,filmVideo.duration-.05));if(S.playing)filmVideo.play().catch(()=>stop());};filmVideo.ontimeupdate=()=>{const prior=S.scenes.slice(0,index).reduce((sum,item)=>sum+item.duration,0);updateFrame(index,filmVideo.currentTime);$("#time").textContent=`0:${String(Math.floor(prior+filmVideo.currentTime)).padStart(2,"0")} / 0:${String(total()).padStart(2,"0")}`;};filmVideo.onended=()=>{if(S.playing&&index<S.scenes.length-1)playScene(index+1);else{stop();updateFrame(0,0);}};}
  function play(){if(S.playing){stop();return;}S.playing=true;$("#player").classList.add("playing");playScene(S.selected,0);}
  $("#title").oninput=()=>change({title:$("#title").value});
  $("#prompt").oninput=()=>{current().prompt=$("#prompt").value;$("#words").textContent=String(current().prompt.length);renderList();save();};
  $("#duration").onchange=()=>change({duration:Number($("#duration").value)});
  document.querySelectorAll("#motions button").forEach(button=>button.onclick=()=>change({motion:button.textContent}));
  function attachImage(file){if(!file||!file.type.startsWith("image/"))return;const reader=new FileReader();reader.onload=()=>change({image:String(reader.result)});reader.readAsDataURL(file);}
  $("#image").onchange=()=>attachImage($("#image").files[0]); $("#remove").onclick=(event)=>{event.preventDefault();change({image:""});};
  $("#drop").ondragover=(event)=>event.preventDefault(); $("#drop").ondrop=(event)=>{event.preventDefault();attachImage(event.dataTransfer.files[0]);};
  $("#add").onclick=()=>{const before=current();S.scenes.splice(S.selected+1,0,{id:crypto.randomUUID(),title:"新的连续镜头",prompt:`承接“${before.title}”的最后画面。`,motion:"缓慢推进",duration:5,image:"",status:"draft"});S.selected+=1;render();$("#title").focus();};
  $("#del").onclick=()=>{if(S.scenes.length===1)return;S.scenes.splice(S.selected,1);S.selected=Math.min(S.selected,S.scenes.length-1);render();};
  $("#up").onclick=()=>{if(!S.selected)return;const i=S.selected;[S.scenes[i-1],S.scenes[i]]=[S.scenes[i],S.scenes[i-1]];S.selected-=1;render();};
  $("#down").onclick=()=>{const i=S.selected;if(i===S.scenes.length-1)return;[S.scenes[i+1],S.scenes[i]]=[S.scenes[i],S.scenes[i+1]];S.selected+=1;render();};
  $("#regen").onclick=()=>generate(S.selected); $("#renderAll").onclick=async()=>{for(let i=0;i<S.scenes.length;i+=1){const done=await generate(i);if(!done)break;}S.selected=0;render();};
  function mountServiceConfig(){const header=document.querySelector("header"),button=document.createElement("button"),panel=document.createElement("div");button.textContent="视频服务";button.className="service-button";panel.className="service-config";panel.hidden=true;panel.innerHTML='<strong>视频服务配置</strong><label>服务名称<input id="videoServiceName"></label><label>接口地址<input id="videoServiceUrl" placeholder="http://host:8091/v1/videos"></label><div><button id="saveVideoService">保存</button><button id="cancelVideoService">取消</button></div><small>服务地址需以 /v1/videos 结尾，配置仅保存在此浏览器。</small>';header.insertBefore(button,header.lastElementChild);header.after(panel);button.onclick=()=>{panel.hidden=!panel.hidden;$("#videoServiceName").value=S.service.name;$("#videoServiceUrl").value=S.service.url;};$("#cancelVideoService").onclick=()=>panel.hidden=true;$("#saveVideoService").onclick=()=>{const name=$("#videoServiceName").value.trim(),url=$("#videoServiceUrl").value.trim();try{const parsed=new URL(url);if(!name||!/^https?:$/.test(parsed.protocol)||!/\/v1\/videos\/?$/.test(parsed.pathname))throw Error();}catch{alert("请输入服务名称，以及以 /v1/videos 结尾的 HTTP(S) 地址。");return;}S.service={name,url};localStorage.setItem("eido-video-service-config",JSON.stringify(S.service));panel.hidden=true;};}
  $("#play").onclick=play; $("#fromStart").onclick=()=>{stop();S.selected=0;updateFrame(0,0);play();}; $("#focus").onclick=()=>updateFrame(S.selected,0); mountServiceConfig(); render();
})();
