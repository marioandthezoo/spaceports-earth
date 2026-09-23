/* spaceports.earth — site script. Plain ES5-style JS, no build step.
   Loaded from index.html with <script defer>; kept out of the page so the
   Content-Security-Policy can forbid inline scripts. */
(function(){
"use strict";
/* tell the boot snippet in index.html the script arrived; re-assert the "js"
   class in case a slow load already tripped its 4-second failsafe */
window.SPX=1; document.documentElement.classList.add("js");
var $=function(s,c){return (c||document).querySelector(s)};
var $$=function(s,c){return Array.prototype.slice.call((c||document).querySelectorAll(s))};
var esc=function(s){return String(s==null?"":s).replace(/[&<>"']/g,function(m){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]})};
/* third-party feeds only get to put absolute http(s) URLs into href/src */
function safeUrl(u){
  if(!u) return "";
  try{var x=new URL(String(u));return (x.protocol==="https:"||x.protocol==="http:")?x.href:"";}
  catch(e){return "";}
}
var REDUCED=!!(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches);
var TAU=Math.PI*2;
function clamp(x,a,b){return x<a?a:x>b?b:x;}
function sstep(a,b,x){x=clamp((x-a)/(b-a),0,1);return x*x*(3-2*x);}
/* 0 before a, eases up to 1 at b, back down to 0 at c */
function bump(a,b,c,x){return x<=a||x>=c?0:x<b?sstep(a,b,x):1-sstep(b,c,x);}
function lerp(a,b,k){return a+(b-a)*k;}
function lerpAng(a,b,k){return a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*k;}
function pad2(v){return String(v).padStart(2,"0");}

/* cached fetch: shields the live feeds from per-visitor API rate limits.
   Fresh responses are stored in localStorage; repeat loads within the TTL
   are served from cache, and if the network or the API's limiter fails,
   the last good data is shown instead of an error. */
function cachedFetch(u,opts){
  var ttl = u.indexOf("thespacedevs")>-1?600000
          : u.indexOf("spaceflightnews")>-1?300000
          : u.indexOf("images-api.nasa")>-1?1800000 : 0;
  /* how old a copy may be when the network fails (launch times go stale fast) */
  var maxStale = u.indexOf("thespacedevs")>-1?21600000
          : u.indexOf("spaceflightnews")>-1?86400000 : 604800000;
  if(!ttl) return fetch(u,opts);
  var key="sfc:"+u, now=Date.now(), hit=null;
  try{hit=JSON.parse(localStorage.getItem(key)||"null");}catch(e){}
  if(hit&&!(now-hit.t<maxStale)) hit=null;
  function wrap(d,t){return {ok:true,stale:t||0,json:function(){return Promise.resolve(d)}};}
  if(hit&&(now-hit.t)<ttl) return Promise.resolve(wrap(hit.d));
  return fetch(u,opts).then(function(r){
    if(!r.ok) throw 0;
    return r.json().then(function(d){
      try{localStorage.setItem(key,JSON.stringify({t:now,d:d}));}catch(e){}
      return wrap(d);
    });
  }).catch(function(e){ if(hit) return wrap(hit.d,hit.t); throw e; });
}

/* ---- scroll reveal ---- */
(function(){
  var els=$$(".rv");
  if(!("IntersectionObserver" in window)){els.forEach(function(e){e.classList.add("in")});return;}
  var io=new IntersectionObserver(function(en){
    en.forEach(function(x){if(x.isIntersecting){x.target.classList.add("in");io.unobserve(x.target);}});
  },{threshold:.12});
  els.forEach(function(e){io.observe(e)});
})();

/* ---- UTC clock ---- */
(function(){
  var a=$("#utc"), b=$("#utc2");
  function tick(){
    var d=new Date();
    var t=[d.getUTCHours(),d.getUTCMinutes(),d.getUTCSeconds()].map(pad2).join(":");
    if(a)a.textContent=t; if(b)b.textContent="UTC "+t;
  }
  tick(); setInterval(tick,1000);
})();

/* ---- departures board + countdown ---- */
var LAUNCHES=[], FILTER="all";

function fmtWindow(iso){
  var d=new Date(iso);
  if(isNaN(d)) return "TBD";
  var M=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][d.getUTCMonth()];
  return M+" "+pad2(d.getUTCDate())+" · "+pad2(d.getUTCHours())+":"+pad2(d.getUTCMinutes())+" UTC";
}
function splitName(l){
  var parts=(l.name||"").split("|");
  return {vehicle:(parts[0]||"").trim(), mission:(l.mission||parts[1]||parts[0]||"Mission").toString().trim()};
}
function statusLabel(ab){
  ab=String(ab||"").trim();
  return /^partial/i.test(ab)?"Partial":ab||"—";
}
function statusClass(ab){
  ab=(ab||"").toLowerCase();
  if(ab==="go") return "go";
  if(ab==="tbc"||ab==="tbd") return "tbd";
  return "";
}
function renderBoard(){
  var board=$("#board"); if(!board) return;
  $$(".brow.r",board).forEach(function(r){r.remove()});
  var msg=$("#board-msg");
  /* a launch that left more than 2 h ago is no longer a departure */
  var cut=Date.now()-7200000;
  var rows=LAUNCHES.filter(function(l){
    return new Date(l.net).getTime()>cut &&
      (FILTER==="all" || ((l.lsp_name||"").toLowerCase().indexOf("spacex")>-1));
  }).slice(0,9);
  if(!rows.length){ if(msg){msg.style.display="block"; msg.innerHTML="NO DEPARTURES IN THIS FILTER — <a href='#' data-f-reset>show all traffic</a>";} return; }
  if(msg) msg.style.display="none";
  rows.forEach(function(l,i){
    var nm=splitName(l), spx=(l.lsp_name||"").toLowerCase().indexOf("spacex")>-1, img=safeUrl(l.image);
    var row=document.createElement("div");
    row.className="brow r";
    row.innerHTML=
      (img?'<img class="bimg" src="'+esc(img)+'" alt="" loading="lazy">':'<span class="bimg" aria-hidden="true"></span>')+
      '<div class="bmission">'+esc(nm.mission)+'<small>'+(spx?'<span class="spx-tag">SPACEX</span> · ':'')+esc(nm.vehicle)+"</small></div>"+
      '<div class="bcell c-hide2"><b>'+esc(nm.vehicle)+"</b>"+esc(l.lsp_name||"")+"</div>"+
      '<div class="bcell c-pad"><b>'+esc(l.pad||"Pad TBD")+"</b>"+esc(l.location||"")+"</div>"+
      '<div class="bcell c-hide"><b>'+fmtWindow(l.net)+"</b>T-0 may shift</div>"+
      '<span class="bstatus '+statusClass(l.status&&l.status.abbrev)+'" title="'+esc((l.status&&l.status.name)||"")+'">'+esc(statusLabel(l.status&&l.status.abbrev))+"</span>";
    board.appendChild(row);
    setTimeout(function(){row.classList.add("in")},60*i+40);
  });
}
/* The "upcoming" feed keeps a launch listed for a while after T-0 (and for
   scrubs), so count down to the first one still in the future rather than
   blindly to the first row — otherwise the hero is stuck on LIFTOFF. */
function startCountdown(){
  var el=$("#cd"), sub=$("#cd-sub"); if(!el) return;
  var idx=-1;
  function pick(){
    var now=Date.now(); idx=-1;
    for(var i=0;i<LAUNCHES.length;i++){ if(new Date(LAUNCHES[i].net).getTime()>now-60000){idx=i;break;} }
    if(sub){
      if(idx<0) sub.textContent="No departures on the board";
      else { var l=LAUNCHES[idx], nm=splitName(l); sub.textContent=nm.mission+" — "+(l.location||l.pad||""); }
    }
  }
  function tick(){
    if(idx<0){el.textContent="STANDBY";return;}
    var ms=new Date(LAUNCHES[idx].net).getTime()-Date.now();
    if(ms<=-60000){pick(); if(idx<0){el.textContent="STANDBY";return;} ms=new Date(LAUNCHES[idx].net).getTime()-Date.now();}
    if(ms<=0){el.innerHTML="<em>LIFTOFF</em>"; return;}
    var s=Math.floor(ms/1000);
    var d=Math.floor(s/86400), h=Math.floor(s%86400/3600), m=Math.floor(s%3600/60), sc=s%60;
    el.innerHTML="T-<em>"+pad2(d)+"</em>:"+pad2(h)+":"+pad2(m)+":"+pad2(sc);
  }
  pick(); tick(); setInterval(tick,1000);
}
cachedFetch("https://ll.thespacedevs.com/2.2.0/launch/upcoming/?mode=list&limit=14")
  .then(function(r){
    if(!r.ok)throw 0;
    var age=$("#board-age");
    if(age&&r.stale){var d=new Date(r.stale);age.textContent=" Feed busy — showing the board as of "+pad2(d.getUTCHours())+":"+pad2(d.getUTCMinutes())+" UTC.";}
    return r.json();
  })
  .then(function(j){
    LAUNCHES=(j.results||[]).filter(function(l){return l&&l.net});
    renderBoard(); startCountdown();
  })
  .catch(function(){
    var msg=$("#board-msg");
    if(msg) msg.innerHTML='TRAFFIC CONTROL BUSY — launch feed rate-limited; it resets within the hour. Check <a href="https://www.spacex.com/launches" rel="noopener">spacex.com/launches</a> or refresh in a minute.';
    var el=$("#cd"), sub=$("#cd-sub");
    if(el) el.textContent="NO SIGNAL";
    if(sub) sub.textContent="Live feed unavailable";
  });

$$(".board-tools .fbtn").forEach(function(b){
  b.addEventListener("click",function(){
    $$(".board-tools .fbtn").forEach(function(x){x.classList.remove("on")});
    b.classList.add("on"); FILTER=b.getAttribute("data-f"); renderBoard();
  });
});
document.addEventListener("click",function(e){
  if(e.target&&e.target.hasAttribute&&e.target.hasAttribute("data-f-reset")){
    e.preventDefault(); FILTER="all";
    $$(".board-tools .fbtn").forEach(function(x){x.classList.toggle("on",x.getAttribute("data-f")==="all")});
    renderBoard();
  }
});

/* ---- earth-to-earth route highlight ---- */
$$(".rrow[data-r]").forEach(function(row){
  var arc=document.getElementById("arc-"+row.getAttribute("data-r"));
  var rid=row.getAttribute("data-r");
  var onAt=0;
  function on(){onAt=Date.now(); row.classList.add("hot"); if(arc)arc.classList.add("hot"); if(window.__routeHot)window.__routeHot(rid,true);}
  function off(){row.classList.remove("hot"); if(arc)arc.classList.remove("hot"); if(window.__routeHot)window.__routeHot(rid,false);}
  row.addEventListener("mouseenter",on); row.addEventListener("mouseleave",off);
  row.addEventListener("focus",on); row.addEventListener("blur",off);
  row.addEventListener("click",function(){ if(Date.now()-onAt<500) return; row.classList.contains("hot")?off():on(); });
});

/* ---- NASA public-domain gallery ---- */
var galSeq=0;
function loadGal(q){
  var gal=$("#gal"); if(!gal) return;
  var seq=++galSeq;
  gal.innerHTML='<div class="gal-msg">TUNING RECEIVER — LOADING IMAGERY…</div>';
  cachedFetch("https://images-api.nasa.gov/search?media_type=image&page_size=24&q="+encodeURIComponent(q))
    .then(function(r){if(!r.ok)throw 0;return r.json()})
    .then(function(j){
      if(seq!==galSeq) return;
      var items=((j.collection||{}).items||[]).filter(function(it){
        return it.links&&it.links[0]&&safeUrl(it.links[0].href)&&it.data&&it.data[0];
      }).slice(0,8);
      if(!items.length){gal.innerHTML='<div class="gal-msg">NOTHING ON THIS FREQUENCY — try another band.</div>';return;}
      gal.innerHTML=items.map(function(it){
        var href=safeUrl(it.links[0].href.replace(/^http:/,"https:"));
        var title=it.data[0].title||"NASA archive";
        return '<figure class="gitem"><img src="'+esc(href)+'" alt="'+esc(title)+'" loading="lazy"><figcaption>'+esc(title)+"</figcaption></figure>";
      }).join("");
    })
    .catch(function(){
      if(seq!==galSeq) return;
      gal.innerHTML='<div class="gal-msg">SIGNAL LOST — imagery feed unavailable. Browse directly at <a href="https://images.nasa.gov" rel="noopener" style="color:var(--plume)">images.nasa.gov</a>.</div>';
    });
}
/* scoped to #archive: The Wire's filter row also carries .gal-tools for layout */
$$("#archive .gal-tools .fbtn").forEach(function(b,i,all){
  b.addEventListener("click",function(){
    all.forEach(function(x){x.classList.remove("on")});
    b.classList.add("on"); loadGal(b.getAttribute("data-q"));
  });
});
loadGal("spacex starship");

/* ---- starship flight log ---- */
(function(){
  var strip=$("#flstrip"); if(!strip) return;
  function fnum(nm){var m=/flight\s+(\d+)/i.exec(nm||"");if(m)return m[1];var s=/SN\s?(\d+)/i.exec(nm||"");if(s)return "SN"+s[1];return "FT";}
  function pill(ab,up){if(up)return ["up","UPCOMING"];ab=(ab||"").toLowerCase();
    if(ab.indexOf("partial")>-1)return ["part","PARTIAL"];
    if(ab.indexOf("success")>-1)return ["ok","SUCCESS"];
    if(ab.indexOf("fail")>-1)return ["bad","FAILURE"];
    return ["",(ab||"—").toUpperCase()];}
  function fdate(iso){var d=new Date(iso);if(isNaN(d))return "TBD";var M=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][d.getUTCMonth()];return M+" "+pad2(d.getUTCDate())+" "+d.getUTCFullYear();}
  function card(l,up){
    var nm=splitName(l),st=pill(l.status&&l.status.abbrev,up);
    return '<article class="flcard'+(up?" next":"")+'"><div class="flnum">'+esc(fnum(l.name))+'</div>'+
      '<div class="flmiss">'+esc(nm.mission)+'</div>'+
      '<div class="fldate">'+fdate(l.net)+'</div>'+
      '<div class="flpad">'+esc(l.pad||"")+'</div>'+
      '<span class="flpill '+st[0]+'">'+esc(st[1])+'</span></article>';
  }
  Promise.all([
    cachedFetch("https://ll.thespacedevs.com/2.2.0/launch/previous/?mode=list&limit=40&search=starship").then(function(r){if(!r.ok)throw 0;return r.json()}),
    cachedFetch("https://ll.thespacedevs.com/2.2.0/launch/upcoming/?mode=list&limit=5&search=starship").then(function(r){return r.ok?r.json():{results:[]}}).catch(function(){return {results:[]}})
  ]).then(function(res){
    var past=(res[0].results||[]).filter(function(l){return l&&l.net&&(l.lsp_name||"")==="SpaceX"});
    var flown={}; past.forEach(function(l){if(l.id)flown[l.id]=1;});
    var soon=Date.now()-60000;
    var next=((res[1].results||[]).filter(function(l){return l&&l.net&&(l.lsp_name||"")==="SpaceX"&&!flown[l.id]&&new Date(l.net).getTime()>soon}))[0];
    past.sort(function(a,b){return new Date(b.net)-new Date(a.net)});
    var c=$("#fl-count"); if(c)c.textContent=String(past.length);
    if(past[0]){var st=pill(past[0].status&&past[0].status.abbrev,false);
      $("#fl-last").textContent=st[1];
      $("#fl-lastsub").textContent=splitName(past[0]).mission+" · "+fdate(past[0].net);}
    if(next){$("#fl-next").textContent=fdate(next.net);$("#fl-nextsub").textContent=splitName(next).mission+" — "+(next.pad||"");}
    else{$("#fl-next").textContent="TBD";$("#fl-nextsub").textContent="No date on the board yet";}
    var cards=[]; if(next)cards.push(card(next,true));
    past.forEach(function(l){cards.push(card(l,false))});
    strip.innerHTML=cards.length?cards.join(""):'<div class="wire-msg">NO RECORDS FOUND.</div>';
  }).catch(function(){strip.innerHTML='<div class="wire-msg">TRAFFIC CONTROL BUSY — flight records rate-limited. The window resets within the hour; cached records show when available.</div>';});
})();

/* ---- the wire (live news) ---- */
(function(){
  var box=$("#wirebox"); if(!box) return;
  function ago(iso){var s=(Date.now()-new Date(iso))/1000;if(!isFinite(s)||s<0)return "";var m=Math.floor(s/60),h=Math.floor(m/60),d=Math.floor(h/24);return d>0?d+"D AGO":h>0?h+"H AGO":m+"M AGO";}
  var seqN=0;
  function load(q){
    var seq=++seqN;
    box.innerHTML='<div class="wire-msg">SCANNING FREQUENCIES…</div>';
    var u="https://api.spaceflightnewsapi.net/v4/articles/?limit=8"+(q?"&search="+encodeURIComponent(q):"");
    cachedFetch(u).then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(j){
      if(seq!==seqN) return;
      var arts=(j.results||[]).filter(function(a){return a&&safeUrl(a.url)}).slice(0,8);
      if(!arts.length){box.innerHTML='<div class="wire-msg">NOTHING ON THIS BAND.</div>';return;}
      box.innerHTML=arts.map(function(a){
        var img=safeUrl(a.image_url);
        return '<a class="wrow" href="'+esc(safeUrl(a.url))+'" target="_blank" rel="noopener">'+
          (img?'<img class="wimg" src="'+esc(img)+'" alt="" loading="lazy">':'<span class="wimg" aria-hidden="true"></span>')+
          '<span><span class="whead">'+esc(a.title)+'</span>'+
          '<span class="wmeta"><b>'+esc(a.news_site||"")+'</b>'+(a.published_at?' · '+ago(a.published_at):'')+'</span>'+
          '<span class="wsum">'+esc((a.summary||"").trim())+'</span></span>'+
          '<span class="wgo">↗</span></a>';
      }).join("");
    }).catch(function(){if(seq!==seqN)return;box.innerHTML='<div class="wire-msg">SIGNAL LOST — news feed unavailable. Read direct at <a href="https://spacenews.com" rel="noopener">SpaceNews</a>.</div>';});
  }
  $$(".wire-tools .fbtn").forEach(function(b,i,all){
    b.addEventListener("click",function(){
      all.forEach(function(x){x.classList.remove("on")});
      b.classList.add("on"); load(b.getAttribute("data-w"));
    });
  });
  load("spacex");
})();

/* ---- manifest signup ----
   No sign-up backend is connected yet. SIGNUP.provider picks one once it
   exists (see README "Manifest sign-ups"); until then the form validates
   and says the list opens soon, and nothing a visitor types leaves the page.
   Whatever provider is added, also add its origin to the CSP meta tag
   (connect-src for fetch-based APIs, form-action for form posts). */
(function(){
  var SIGNUP={ provider:"" };
  var f=$("#manform"); if(!f) return;
  var btn=$("#man-btn"), st=$("#man-status"), em=$("#man-email"), nm=$("#man-name");
  function say(cls,msg){st.className="man-status"+(cls?" "+cls:"");st.textContent=msg;}
  btn.disabled=false;
  f.addEventListener("submit",function(e){
    e.preventDefault();
    if(f.querySelector('[name="_honey"]').value) return;
    var v=(em.value||"").trim().toLowerCase();
    if(v.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)){say("err","THAT ADDRESS DOESN'T PARSE — CHECK IT AND RETRY.");em.focus();return;}
    var entry={
      email:v,
      name:(nm&&nm.value||"").trim().slice(0,60),
      interests:$$('input[name="interest"]:checked',f).map(function(x){return x.value}),
      source:"spaceports.earth/manifest"
    };
    var send=ADAPTERS[SIGNUP.provider];
    if(!send){say("","THE MANIFEST OPENS SOON — NOTHING WAS SENT YET. CHECK BACK SHORTLY.");return;}
    btn.disabled=true; say("","TRANSMITTING…");
    send(SIGNUP,entry)
      .then(function(){say("ok","CONFIRMED — YOU'RE ON THE MANIFEST.");f.reset();})
      .catch(function(){say("err","TRANSMISSION FAILED — TRY AGAIN IN A MINUTE.");})
      .then(function(){btn.disabled=false;});
  });
  /* provider adapters: each takes (config, entry) and returns a Promise */
  var ADAPTERS={};
})();

/* ---- ports: radar echo map ---- */
(function(){
  var svg=document.getElementById("pmsvg"), zoom=document.getElementById("pmzoom"),
      box=document.getElementById("portmap"), hudP=document.getElementById("pm-ping");
  if(!svg||!zoom||!box) return;
  var W=1024,H=512,NS="http://www.w3.org/2000/svg";
  function XY(lat,lon){return [(lon+180)/360*W,(90-lat)/180*H];}
  function el(n,at){var e=document.createElementNS(NS,n);for(var k in at)e.setAttribute(k,at[k]);svg.appendChild(e);return e;}
  var PORTS=[[25.99,-97.16],[28.56,-80.58],[34.63,-120.61]];
  var FUT=[[40.4,-73.3],[34.9,140.1]];
  var CITIES=[["LOS ANGELES",34.05,-118.24],["TORONTO",43.65,-79.38],["NEW YORK",40.71,-74.01],["LONDON",51.51,-0.13],["PARIS",48.86,2.35],["DUBAI",25.2,55.27],["DELHI",28.61,77.21],["BANGKOK",13.76,100.5],["SINGAPORE",1.35,103.82],["SHANGHAI",31.23,121.47],["TOKYO",35.68,139.69],["SEOUL",37.57,126.98],["SYDNEY",-33.87,151.21],["HONOLULU",21.31,-157.86],["MEXICO CITY",19.43,-99.13],["SÃO PAULO",-23.55,-46.63],["ANCHORAGE",61.22,-149.9],["CAPE TOWN",-33.92,18.42]];
  var rings=[];
  PORTS.forEach(function(p,i){
    var xy=XY(p[0],p[1]);
    el("circle",{cx:xy[0],cy:xy[1],r:3.2,"class":"pm-port"});
    [-W,0,W].forEach(function(sh){
      rings.push({x:xy[0]+sh,y:xy[1],
        c1:el("circle",{cx:xy[0]+sh,cy:xy[1],r:0,"class":"pm-ring"}),
        c2:el("circle",{cx:xy[0]+sh,cy:xy[1],r:0,"class":"pm-ring"}),
        off:i*2600});
    });
  });
  FUT.forEach(function(p){var xy=XY(p[0],p[1]);el("circle",{cx:xy[0],cy:xy[1],r:4,"class":"pm-fut"});});
  var cities=CITIES.map(function(c){
    var xy=XY(c[1],c[2]);
    var dot=el("circle",{cx:xy[0],cy:xy[1],r:2.1,"class":"pm-city"});
    var lbl=el("text",{x:xy[0]+5,y:xy[1]-4,"class":"pm-lbl"});
    lbl.textContent=c[0];
    return {x:xy[0],y:xy[1],dot:dot,lbl:lbl,lit:-9999};
  });
  var T=9000, RMAX=620, BAND=16;
  var visible=false, started=false;
  function start(){ if(!started){started=true; requestAnimationFrame(function(){zoom.classList.add("out");}); } }
  if("IntersectionObserver" in window){
    new IntersectionObserver(function(en){en.forEach(function(x){visible=x.isIntersecting; if(x.isIntersecting)start();})},{threshold:.15}).observe(box);
  } else { visible=true; start(); }
  if(REDUCED){
    zoom.classList.add("out");
    cities.forEach(function(c){c.dot.classList.add("lit");});
    rings.forEach(function(r){r.c1.setAttribute("opacity","0");r.c2.setAttribute("opacity","0");});
    if(hudP)hudP.textContent=cities.length+" CITIES MAPPED";
    return;
  }
  function frame(now){
    requestAnimationFrame(frame);
    if(!visible) return;
    var count=0;
    rings.forEach(function(rg){
      [[rg.c1,0],[rg.c2,T/2]].forEach(function(pair){
        var q=((now+rg.off+pair[1])%T)/T, r=q*RMAX;
        pair[0].setAttribute("r",String(r));
        pair[0].setAttribute("opacity",String(.8*(1-q)));
        cities.forEach(function(ct){
          var d=Math.hypot(ct.x-rg.x,ct.y-rg.y);
          if(Math.abs(d-r)<BAND) ct.lit=now;
        });
      });
    });
    cities.forEach(function(ct){
      var on=now-ct.lit<900;
      ct.dot.classList[on?"add":"remove"]("lit");
      ct.lbl.classList[on?"add":"remove"]("lit");
      if(on)count++;
    });
    if(hudP)hudP.textContent=count?count+" CITIES IN RANGE":"SWEEPING…";
  }
  requestAnimationFrame(frame);
})();

/* =====================================================================
   STARSHIP RENDERER — one hand-drawn ship shared by the globe and the
   Beyond scenes. Local units: nose toward +x, heat-shield belly toward +y,
   hull 100 long × 18 wide (the real ship is 50 m × 9 m). The hull is
   rasterised once into a sprite; plume, re-entry plasma and sun glint are
   drawn live on top so they can flicker and scale with the flight phase.
   ===================================================================== */
var Ship=(function(){
  var K=5, X0=-62, Y0=-22, UW=118, UH=44, lit=null, dark=null;
  function hull(c){
    c.beginPath();
    c.moveTo(-50,-9); c.lineTo(20,-9);
    c.bezierCurveTo(34,-9,46,-5.8,50.6,0);
    c.bezierCurveTo(46,5.8,34,9,20,9);
    c.lineTo(-50,9); c.quadraticCurveTo(-51.8,9,-51.8,7.2);
    c.lineTo(-51.8,-7.2); c.quadraticCurveTo(-51.8,-9,-50,-9); c.closePath();
  }
  function shieldEdge(c){ c.moveTo(-51.8,1.2); c.lineTo(28,1.2); c.quadraticCurveTo(43,1,51,-.4); }
  function build(){
    var cv=document.createElement("canvas"); cv.width=UW*K; cv.height=UH*K;
    var c=cv.getContext("2d"); c.scale(K,K); c.translate(-X0,-Y0);
    /* flaps: big aft pair, small forward pair; dark tiles with a steel edge */
    var gf=c.createLinearGradient(0,-19,0,19);
    gf.addColorStop(0,"#5b6574"); gf.addColorStop(.45,"#2c323c"); gf.addColorStop(.55,"#2c323c"); gf.addColorStop(1,"#15181e");
    c.beginPath();
    c.moveTo(-49.5,-8.4); c.lineTo(-29,-8.4); c.lineTo(-34.2,-18.6); c.quadraticCurveTo(-35,-19.4,-36.2,-19.4); c.lineTo(-46.4,-19.4); c.quadraticCurveTo(-47.6,-19.4,-47.8,-18.2); c.closePath();
    c.moveTo(-49.5,8.4); c.lineTo(-29,8.4); c.lineTo(-34.2,18.6); c.quadraticCurveTo(-35,19.4,-36.2,19.4); c.lineTo(-46.4,19.4); c.quadraticCurveTo(-47.6,19.4,-47.8,18.2); c.closePath();
    c.moveTo(14,-8.2); c.lineTo(29,-8.2); c.lineTo(25,-14.2); c.quadraticCurveTo(24.4,-15,23.4,-15); c.lineTo(19.2,-15); c.quadraticCurveTo(18.2,-15,17.8,-14.2); c.closePath();
    c.moveTo(14,8.2); c.lineTo(29,8.2); c.lineTo(25,14.2); c.quadraticCurveTo(24.4,15,23.4,15); c.lineTo(19.2,15); c.quadraticCurveTo(18.2,15,17.8,14.2); c.closePath();
    c.fillStyle=gf; c.fill();
    c.lineWidth=.45; c.strokeStyle="rgba(196,205,218,.6)"; c.stroke();
    /* Raptor bells: two vacuum bells and the centre sea-level engine */
    var ge=c.createLinearGradient(-50,0,-59,0);
    ge.addColorStop(0,"#79818d"); ge.addColorStop(.5,"#3a3f48"); ge.addColorStop(1,"#15181d");
    c.fillStyle=ge; c.strokeStyle="rgba(160,170,184,.55)"; c.lineWidth=.35;
    c.beginPath(); c.moveTo(-51,-1.5); c.lineTo(-51,1.5); c.lineTo(-55.4,2.8); c.lineTo(-55.4,-2.8); c.closePath(); c.fill(); c.stroke();
    c.beginPath();
    c.moveTo(-51,-6.2); c.lineTo(-51,-2.4); c.quadraticCurveTo(-55,-1.8,-58.4,-.6); c.quadraticCurveTo(-59,-4.4,-58.4,-8.3); c.quadraticCurveTo(-55,-7,-51,-6.2); c.closePath();
    c.moveTo(-51,6.2); c.lineTo(-51,2.4); c.quadraticCurveTo(-55,1.8,-58.4,.6); c.quadraticCurveTo(-59,4.4,-58.4,8.3); c.quadraticCurveTo(-55,7,-51,6.2); c.closePath();
    c.fill(); c.stroke();
    /* stainless hull with a specular band */
    hull(c);
    var gs=c.createLinearGradient(0,-9,0,9);
    gs.addColorStop(0,"#66707d"); gs.addColorStop(.1,"#9da6b2"); gs.addColorStop(.22,"#eef2f6");
    gs.addColorStop(.3,"#cdd3db"); gs.addColorStop(.46,"#98a1ad"); gs.addColorStop(.56,"#7d8794"); gs.addColorStop(1,"#5c6672");
    c.fillStyle=gs; c.fill();
    c.save(); hull(c); c.clip();
    /* weld rings */
    c.strokeStyle="rgba(62,72,86,.42)"; c.lineWidth=.32;
    [-41,-32,-23,-14,-5,4,13].forEach(function(x){c.beginPath();c.moveTo(x,-9);c.lineTo(x,1.2);c.stroke();});
    /* faint vertical streaking on the steel */
    c.globalAlpha=.07; c.fillStyle="#1d2430";
    for(var sx=-48;sx<22;sx+=2.3){c.fillRect(sx,-9,.5,10);}
    c.globalAlpha=1;
    /* heat shield: black hexagonal tiles over the windward half, wrapping the nose */
    var gh=c.createLinearGradient(0,1,0,9);
    gh.addColorStop(0,"#343a44"); gh.addColorStop(.3,"#1c2027"); gh.addColorStop(1,"#0b0d11");
    c.beginPath(); shieldEdge(c); c.lineTo(52,12); c.lineTo(-53,12); c.closePath(); c.fillStyle=gh; c.fill();
    c.strokeStyle="rgba(255,255,255,.05)"; c.lineWidth=.16;
    for(var ty=2.6;ty<9;ty+=1.5){ c.beginPath(); for(var tx=-51+(ty*2%3);tx<44;tx+=1.7){ c.moveTo(tx,ty); c.lineTo(tx+.85,ty+.75); } c.stroke(); }
    c.strokeStyle="rgba(170,180,194,.4)"; c.lineWidth=.3; c.beginPath(); shieldEdge(c); c.stroke();
    /* aft skirt */
    var gk=c.createLinearGradient(-52,0,-47,0); gk.addColorStop(0,"rgba(20,24,30,.55)"); gk.addColorStop(1,"rgba(20,24,30,0)");
    c.fillStyle=gk; c.fillRect(-52,-9,5,18);
    c.restore();
    hull(c); c.lineWidth=.5; c.strokeStyle="rgba(8,11,18,.6)"; c.stroke();
    lit=cv;
    /* silhouette used to dim the ship in a planet's shadow */
    var dv=document.createElement("canvas"); dv.width=cv.width; dv.height=cv.height;
    var d=dv.getContext("2d"); d.drawImage(cv,0,0); d.globalCompositeOperation="source-in"; d.fillStyle="#05070c"; d.fillRect(0,0,dv.width,dv.height);
    dark=dv;
  }
  function ell(c,x,y,rx,ry,stops){
    if(rx<=.01||ry<=.01) return;
    c.save(); c.translate(x,y); c.scale(rx,ry);
    var g=c.createRadialGradient(0,0,0,0,0,1);
    for(var i=0;i<stops.length;i+=2) g.addColorStop(stops[i],stops[i+1]);
    c.fillStyle=g; c.beginPath(); c.arc(0,0,1,0,TAU); c.fill(); c.restore();
  }
  /* engine plume: "atmo" = tight, hot, with shock diamonds; "vac" = wide pale bloom */
  function plume(c,p,mode,t){
    var f=.9+.07*Math.sin(t*.043)+.05*Math.sin(t*.117+1.3);
    c.save(); c.globalCompositeOperation="lighter";
    if(mode==="atmo"){
      var L=62*p*f;
      ell(c,-58-L*.5,0,L*.62,9*p+1.5,[0,"rgba(255,184,104,.6)",.5,"rgba(255,122,47,.3)",1,"rgba(255,90,30,0)"]);
      ell(c,-58-L*.26,0,L*.32,4.4*p+.8,[0,"rgba(255,253,244,.98)",.45,"rgba(255,214,150,.72)",1,"rgba(255,150,60,0)"]);
      for(var k=1;k<=3;k++) ell(c,-58-L*.14*k,0,2.4*p,1.6*p,[0,"rgba(255,255,255,"+(.55/k)+")",1,"rgba(255,255,255,0)"]);
    } else {
      var V=78*p*f;
      ell(c,-58-V*.42,0,V*.58,15*p+2,[0,"rgba(214,226,255,.62)",.45,"rgba(150,172,255,.26)",1,"rgba(120,140,255,0)"]);
      ell(c,-58-V*.22,0,V*.3,6.5*p+1.5,[0,"rgba(255,252,244,1)",.45,"rgba(255,196,132,.72)",1,"rgba(255,150,90,0)"]);
    }
    ell(c,-57.6,0,3.4,8.2,[0,"rgba(255,232,196,"+(.75*p)+")",1,"rgba(255,160,90,0)"]);
    c.restore();
  }
  /* re-entry plasma sheathing the belly and nose */
  function plasma(c,p,t){
    var f=.9+.1*Math.sin(t*.071)+.05*Math.sin(t*.19);
    c.save(); c.globalCompositeOperation="lighter";
    ell(c,-6,16,86*p*f,17*p+3,[0,"rgba(255,150,110,.5)",.5,"rgba(255,80,140,.22)",1,"rgba(255,60,120,0)"]);
    ell(c,2,12,62*p*f,8*p+2,[0,"rgba(255,244,228,.95)",.3,"rgba(255,170,100,.7)",.7,"rgba(255,80,130,.28)",1,"rgba(255,60,120,0)"]);
    ell(c,-40,18,46*p,9*p,[0,"rgba(255,110,150,.4)",1,"rgba(255,80,140,0)"]);
    ell(c,45,7,15*p,13*p,[0,"rgba(255,230,200,.85)",1,"rgba(255,120,80,0)"]);
    c.restore();
  }
  function glint(c,a){
    c.save(); c.globalCompositeOperation="lighter";
    ell(c,6,-5.2,11,2.2,[0,"rgba(255,255,255,"+(.85*a)+")",1,"rgba(255,255,255,0)"]);
    ell(c,6,-5.2,2.4,2.4,[0,"rgba(255,255,255,"+a+")",1,"rgba(255,255,255,0)"]);
    c.restore();
  }
  /* o: {x,y,ang,len(px),mirror,squash,plume,mode,plasma,glint,shade(1=lit),alpha,t} */
  function draw(c,o){
    if(!lit) build();
    var s=o.len/100, a=o.alpha==null?1:o.alpha;
    if(a<=.01) return;
    c.save(); c.translate(o.x,o.y); c.rotate(o.ang);
    c.scale(s*(o.squash==null?1:o.squash), s*(o.mirror?-1:1));
    c.globalAlpha=a; c.imageSmoothingEnabled=true; c.imageSmoothingQuality="high";
    if(o.plume>.01) plume(c,o.plume,o.mode||"vac",o.t||0);
    c.shadowColor="rgba(0,0,0,.6)"; c.shadowBlur=o.len>20?4:2;
    c.drawImage(lit,X0,Y0,UW,UH);
    c.shadowBlur=0; c.shadowColor="transparent";
    if(o.shade!=null&&o.shade<1){ c.globalAlpha=a*(1-o.shade)*.82; c.drawImage(dark,X0,Y0,UW,UH); c.globalAlpha=a; }
    if(o.plasma>.01) plasma(c,o.plasma,o.t||0);
    if(o.glint>.01) glint(c,o.glint);
    c.restore();
  }
  /* fading exhaust / plasma trail; pts oldest→newest, pts[i].h = hidden */
  function trail(c,pts,rgb,w,a0){
    if(pts.length<2) return;
    c.save(); c.globalCompositeOperation="lighter"; c.lineCap="round";
    for(var i=1;i<pts.length;i++){
      if(pts[i].h||pts[i-1].h) continue;
      var k=i/(pts.length-1);
      c.strokeStyle="rgba("+rgb+","+(k*k*a0).toFixed(3)+")"; c.lineWidth=w*(.3+.7*k);
      c.beginPath(); c.moveTo(pts[i-1].x,pts[i-1].y); c.lineTo(pts[i].x,pts[i].y); c.stroke();
    }
    c.restore();
  }
  /* flip the sprite when the heat shield would face "up" (ux,uy = away from the planet) */
  function mirrorFor(ang,ux,uy){ return (-Math.sin(ang)*ux+Math.cos(ang)*uy)>0; }
  return {draw:draw,trail:trail,ell:ell,mirrorFor:mirrorFor};
})();

/* ---- e2e: live 3D globe, real-time terminator, Starship flights ---- */
(function(){
  var wrap=document.getElementById("globewrap"); if(!wrap) return;
  var canvas=document.getElementById("globe"), fx=document.getElementById("globe-fx"),
      flat=document.getElementById("flatmap"), hud=document.getElementById("sunspot"), board=document.getElementById("globe-board");
  var hotHook=null, started=false;
  window.__routeHot=function(id,on){ if(hotHook) hotHook(id,on); };
  function fail(){ wrap.style.display="none"; if(flat) flat.classList.remove("flat-hidden"); }
  function subsolar(){
    var d=new Date(), N=(Date.now()-Date.UTC(d.getUTCFullYear(),0,0))/86400000;
    var decl=23.44*Math.sin((2*Math.PI/365)*(284+N));
    var B=2*Math.PI*(N-81)/364;
    var eot=9.87*Math.sin(2*B)-7.53*Math.cos(B)-1.5*Math.sin(B);
    var hrs=d.getUTCHours()+d.getUTCMinutes()/60+d.getUTCSeconds()/3600;
    var lon=180-15*(hrs+eot/60);
    while(lon>180)lon-=360; while(lon<-180)lon+=360;
    return {lat:decl,lon:lon};
  }
  function boot(){
    if(started)return; started=true;
    var s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
    s.integrity="sha384-CI3ELBVUz9XQO+97x6nwMDPosPR5XvsxW2ua7N1Xeygeh1IxtgqtCkGfQY9WWdHu";
    s.crossOrigin="anonymous"; s.referrerPolicy="no-referrer";
    s.onload=init; s.onerror=fail;
    document.head.appendChild(s);
  }
  if("IntersectionObserver" in window){
    var io=new IntersectionObserver(function(en){en.forEach(function(x){if(x.isIntersecting){io.disconnect();boot();}})},{rootMargin:"600px"});
    io.observe(wrap);
  } else boot();

  var CITY={NYC:[40.71,-74.01,"NEW YORK"],SHA:[31.23,121.47,"SHANGHAI"],LON:[51.51,-.13,"LONDON"],
    LAX:[34.05,-118.24,"LOS ANGELES"],YYZ:[43.65,-79.38,"TORONTO"],SYD:[-33.87,151.21,"SYDNEY"],
    SIN:[1.35,103.82,"SINGAPORE"],BKK:[13.76,100.5,"BANGKOK"],DXB:[25.2,55.27,"DUBAI"]};
  /* id, from, to, concept minutes (2017 study) */
  var ROUTES=[["r1","NYC","SHA",39],["r2","LON","NYC",29],["r3","LAX","YYZ",24],["r4","SYD","SIN",31],["r5","BKK","DXB",27]];

  function init(){
    try{
      var dpr=Math.min(window.devicePixelRatio||1,2), W=1, H=1, needs=true;
      var renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true,alpha:true});
      renderer.setPixelRatio(dpr);
      var scene=new THREE.Scene();
      var CAMZ=3.75, camera=new THREE.PerspectiveCamera(36,1,.1,100); camera.position.z=CAMZ;
      var group=new THREE.Group(); scene.add(group);
      var fc=fx.getContext("2d");
      function size(){
        W=wrap.clientWidth; H=wrap.clientHeight;
        renderer.setSize(W,H,false); camera.aspect=W/H;
        /* keep the whole globe in frame on tall (phone) boxes too */
        camera.position.z=W/H<1.15?CAMZ*Math.max(1,1.14/(W/H)):CAMZ;
        camera.updateProjectionMatrix();
        fx.width=Math.round(W*dpr); fx.height=Math.round(H*dpr); fx.style.width=W+"px"; fx.style.height=H+"px";
        needs=true;
      }
      size(); window.addEventListener("resize",size);
      function llv(lat,lon,r){
        var phi=(90-lat)*Math.PI/180, th=(lon+180)*Math.PI/180;
        return new THREE.Vector3(-r*Math.sin(phi)*Math.cos(th), r*Math.cos(phi), r*Math.sin(phi)*Math.sin(th));
      }
      var sunLocal=new THREE.Vector3(1,0,0);
      var sunU={value:sunLocal}, sunW={value:new THREE.Vector3(1,0,0)}, camL={value:new THREE.Vector3(0,0,3)};
      var loader=new THREE.TextureLoader();
      var texN=0;
      function texDone(){ texN++; needs=true; }
      var dayT=loader.load("img/earth-day.jpg",texDone,undefined,fail);
      var nightT=loader.load("img/earth-night.jpg",texDone,undefined,fail);
      dayT.anisotropy=nightT.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
      var earthMat=new THREE.ShaderMaterial({
        uniforms:{dayT:{value:dayT},nightT:{value:nightT},sunDir:sunU,camL:camL},
        vertexShader:[
          "varying vec2 vUv; varying vec3 vN; varying vec3 vP;",
          "void main(){ vUv=uv; vN=normalize(normal); vP=position;",
          "gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }"
        ].join("\n"),
        fragmentShader:[
          "uniform sampler2D dayT; uniform sampler2D nightT; uniform vec3 sunDir; uniform vec3 camL;",
          "varying vec2 vUv; varying vec3 vN; varying vec3 vP;",
          "void main(){",
          " vec3 N=normalize(vN); vec3 L=normalize(sunDir);",
          " float c=dot(N,L);",
          " float m=smoothstep(-0.10,0.20,c);",
          " vec3 day=texture2D(dayT,vUv).rgb;",
          " vec3 nt=texture2D(nightT,vUv).rgb; float lum=dot(nt,vec3(0.3,0.59,0.11));",
          " vec3 night=nt*0.36+vec3(1.0,0.78,0.5)*smoothstep(0.28,0.75,lum)*1.25+vec3(0.012,0.022,0.05);",
          " vec3 col=mix(night,day*(0.35+0.75*max(c,0.0)),m);",
          " vec3 db=texture2D(dayT,vUv,3.0).rgb;",
          " float ocean=smoothstep(0.0,0.12,db.b-max(db.r,db.g));",
          " vec3 V=normalize(camL-vP);",
          " float spec=pow(max(dot(reflect(-L,N),V),0.0),26.0)*ocean*m;",
          " col+=vec3(1.0,0.93,0.82)*spec*0.4;",
          " float band=smoothstep(0.16,0.0,abs(c-0.02));",
          " col+=vec3(1.0,0.45,0.18)*band*0.16;",
          " gl_FragColor=vec4(col,1.0); }"
        ].join("\n")
      });
      group.add(new THREE.Mesh(new THREE.SphereGeometry(1,72,72),earthMat));
      var atmoMat=new THREE.ShaderMaterial({
        uniforms:{sunW:sunW},transparent:true,side:THREE.BackSide,depthWrite:false,blending:THREE.AdditiveBlending,
        vertexShader:[
          "varying vec3 vN; varying vec3 vP;",
          "void main(){ vN=normalize(mat3(modelMatrix)*normal); vP=(modelMatrix*vec4(position,1.0)).xyz;",
          "gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }"
        ].join("\n"),
        fragmentShader:[
          "uniform vec3 sunW; varying vec3 vN; varying vec3 vP;",
          "void main(){ float f=pow(1.0-abs(dot(normalize(vN),normalize(cameraPosition-vP))),3.0);",
          " float lit=0.3+0.7*smoothstep(-0.35,0.45,dot(normalize(vP),normalize(sunW)));",
          " gl_FragColor=vec4(0.30,0.55,1.0,1.0)*f*lit; }"
        ].join("\n")
      });
      group.add(new THREE.Mesh(new THREE.SphereGeometry(1.04,56,56),atmoMat));

      /* starfield behind the globe, drifting slower than the planet for depth */
      var SN=1100, sp=new Float32Array(SN*3), sc=new Float32Array(SN*3);
      for(var i=0;i<SN;i++){
        var u=Math.random()*2-1, th=Math.random()*TAU, rr=Math.sqrt(1-u*u), b=.25+.75*Math.pow(Math.random(),3);
        sp[i*3]=30*rr*Math.cos(th); sp[i*3+1]=30*u; sp[i*3+2]=30*rr*Math.sin(th);
        sc[i*3]=b*.86; sc[i*3+1]=b*.9; sc[i*3+2]=b;
      }
      var sg=new THREE.BufferGeometry();
      sg.setAttribute("position",new THREE.BufferAttribute(sp,3)); sg.setAttribute("color",new THREE.BufferAttribute(sc,3));
      var stars=new THREE.Points(sg,new THREE.PointsMaterial({size:1.5,sizeAttenuation:false,vertexColors:true,depthWrite:false}));
      scene.add(stars);

      var dotG=new THREE.SphereGeometry(.011,10,10), dotM=new THREE.MeshBasicMaterial({color:0xE4E9F0});
      var cities={};
      Object.keys(CITY).forEach(function(k){
        var c=CITY[k], p=llv(c[0],c[1],1.003), m=new THREE.Mesh(dotG,dotM);
        m.position.copy(p); group.add(m);
        cities[k]={code:k,name:c[2],p:p,n:p.clone().normalize()};
      });

      /* routes: great-circle ground track, lofted by an altitude profile that
         leaves the pad vertically and comes down vertically (sin^0.62) */
      var routes=ROUTES.map(function(r,i){
        var A=cities[r[1]], B=cities[r[2]];
        var a=A.n.clone(), b=B.n.clone(), om=Math.acos(clamp(a.dot(b),-1,1));
        var R={id:r[0],A:A,B:B,a:a,b:b,om:om,so:Math.sin(om),h:Math.min(.045+om*.07,.1),mins:r[3],
               dur:7200+om*3600,fl:null,next:0,dir:1,ring:null,idx:i};
        var pts=[]; for(var k=0;k<=96;k++) pts.push(routePt(R,k/96,new THREE.Vector3()));
        R.mat=new THREE.MeshBasicMaterial({color:0x4A5C7E,transparent:true,opacity:.5,depthWrite:false});
        group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),160,.0028,6,false),R.mat));
        return R;
      });
      function routePt(R,s,out){
        var k1=Math.sin((1-s)*R.om)/R.so, k2=Math.sin(s*R.om)/R.so;
        out.set(R.a.x*k1+R.b.x*k2, R.a.y*k1+R.b.y*k2, R.a.z*k1+R.b.z*k2);
        return out.multiplyScalar(1.005+R.h*Math.pow(Math.max(0,Math.sin(Math.PI*s)),.62));
      }

      function faceRot(v){ var m=v.clone().normalize(), rz=Math.sqrt(m.x*m.x+m.z*m.z);
        return {y:Math.atan2(-m.x,m.z), x:clamp(Math.atan2(m.y,rz),-.6,.6)}; }
      var home=faceRot(llv(34,-38,1)); group.rotation.y=home.y; group.rotation.x=home.x;
      var dragging=false,lx=0,ly=0,lastDrag=0,target=null,hotId=null;
      canvas.addEventListener("pointerdown",function(e){dragging=true;target=null;lx=e.clientX;ly=e.clientY;});
      window.addEventListener("pointermove",function(e){
        if(!dragging)return;
        group.rotation.y+=(e.clientX-lx)*.005;
        group.rotation.x=clamp(group.rotation.x+(e.clientY-ly)*.003,-.6,.6);
        lx=e.clientX;ly=e.clientY;lastDrag=performance.now();needs=true;
      });
      function endDrag(){dragging=false;lastDrag=performance.now();}
      window.addEventListener("pointerup",endDrag); window.addEventListener("pointercancel",endDrag);

      hotHook=function(id,on){
        routes.forEach(function(R){
          var h=on&&R.id===id;
          R.mat.color.setHex(h?0xFF7A2F:0x4A5C7E); R.mat.opacity=h?.95:.5;
          if(h){
            /* launch it now if the ship is on the pad, and turn the globe to face the route */
            if(!R.fl) R.next=0;
            var fr=faceRot(routePt(R,.5,new THREE.Vector3()));
            target={x:fr.x,y:group.rotation.y+Math.atan2(Math.sin(fr.y-group.rotation.y),Math.cos(fr.y-group.rotation.y))};
          }
        });
        hotId=on?id:null; if(!on) target=null; needs=true;
      };

      function sun(){
        var s=subsolar();
        sunLocal.copy(llv(s.lat,s.lon,1)).normalize();
        if(hud)hud.innerHTML="SUBSOLAR <b>"+Math.abs(s.lat).toFixed(1)+"°"+(s.lat>=0?"N":"S")+" · "+Math.abs(s.lon).toFixed(1)+"°"+(s.lon>=0?"E":"W")+"</b> — LIVE";
        needs=true;
      }
      sun(); setInterval(sun,60000);

      /* ---------- 2D overlay: ships, trails, rings, labels ---------- */
      var V1=new THREE.Vector3(), V2=new THREE.Vector3(), V3=new THREE.Vector3(), CP=camera.position;
      function proj(pl,o){ /* local point → screen {x,y}, hidden if behind the globe */
        V1.copy(pl).applyMatrix4(group.matrixWorld);
        var wx=V1.x,wy=V1.y,wz=V1.z;
        V1.project(camera);
        o=o||{}; o.x=(V1.x+1)/2*W; o.y=(1-V1.y)/2*H; o.h=occluded(wx,wy,wz); o.wx=wx;o.wy=wy;o.wz=wz;
        return o;
      }
      function occluded(x,y,z){
        var dx=x-CP.x,dy=y-CP.y,dz=z-CP.z,L=Math.sqrt(dx*dx+dy*dy+dz*dz); dx/=L;dy/=L;dz/=L;
        var b=CP.x*dx+CP.y*dy+CP.z*dz, c=CP.x*CP.x+CP.y*CP.y+CP.z*CP.z-1, disc=b*b-c;
        if(disc<=0) return false;
        var t=-b-Math.sqrt(disc); return t>0&&t<L-.002;
      }
      function ring(pl,rad,alpha,rgb){
        var n=pl.clone().normalize(), t1=new THREE.Vector3(0,1,0).cross(n);
        if(t1.lengthSq()<1e-6) t1.set(1,0,0); t1.normalize(); var t2=n.clone().cross(t1);
        var c0=proj(pl); if(c0.h) return;
        fc.beginPath();
        for(var k=0;k<=28;k++){
          var a=k/28*TAU;
          V3.copy(pl).addScaledVector(t1,Math.cos(a)*rad).addScaledVector(t2,Math.sin(a)*rad);
          var q=proj(V3); if(k) fc.lineTo(q.x,q.y); else fc.moveTo(q.x,q.y);
        }
        fc.strokeStyle="rgba("+rgb+","+alpha.toFixed(3)+")"; fc.lineWidth=1.3; fc.stroke();
      }
      function phaseOf(f){ return f<.2?"boost":f<.56?"coast":f<.8?"entry":"landing"; }
      function fmtT(mins){ var s=Math.max(0,Math.round(mins*60)); return "T+"+pad2(Math.floor(s/60))+":"+pad2(s%60); }
      var tmp=new THREE.Vector3(), tmp2=new THREE.Vector3(), up=new THREE.Vector3(), boardAt=0, boardBox=null;
      var FROZEN=[.36,.5,.3,.68,.44];

      function drawFx(now){
        fc.setTransform(dpr,0,0,dpr,0,0); fc.clearRect(0,0,W,H);
        fc.font="500 10px 'IBM Plex Mono', monospace"; fc.textBaseline="middle";
        /* city labels on the visible hemisphere; a label that would collide
           with one already placed flips to the left of its dot, else is skipped */
        var boxes=[];
        function free(x,y,w){
          if(x<2||x+w>W-2||y<8||y>H-8) return false;
          if(boardBox&&x<boardBox[2]+4&&x+w+4>boardBox[0]&&y+6>boardBox[1]&&y-6<boardBox[3]) return false;
          for(var i=0;i<boxes.length;i++){var b=boxes[i]; if(x<b[0]+b[2]+4&&x+w+4>b[0]&&Math.abs(y-b[1])<12) return false;}
          return true;
        }
        Object.keys(cities).forEach(function(k){
          var C=cities[k]; tmp.copy(C.p).applyMatrix4(group.matrixWorld);
          var facing=tmp.clone().normalize().dot(tmp2.copy(CP).normalize());
          if(facing<.2) return;
          var q=proj(C.p), w=fc.measureText(C.name).width, x=q.x+7, y=q.y-7;
          if(!free(x,y,w)){ x=q.x-7-w; if(!free(x,y,w)) return; }
          boxes.push([x,y,w]);
          fc.fillStyle="rgba(203,210,220,"+(.8*sstep(.2,.45,facing)).toFixed(3)+")";
          fc.fillText(C.name,x,y);
        });
        var rows=[];
        routes.forEach(function(R,ri){
          var st="on pad", clock="--", f=-1;
          if(REDUCED){ f=FROZEN[ri]; }
          else {
            if(!R.fl&&now>=R.next){ R.fl={t0:now,dir:R.dir}; R.dir*=-1; }
            if(R.fl){ f=(now-R.fl.t0)/R.dur;
              if(f>=1){ R.ring={t0:now,city:R.fl.dir>0?R.B:R.A}; R.fl=null; R.next=now+2400+Math.random()*2600; f=-1; st="landed"; } }
          }
          var hot=hotId===R.id, dir=REDUCED?1:(R.fl?R.fl.dir:1);
          var from=dir>0?R.A:R.B, to=dir>0?R.B:R.A;
          if(R.ring){ var ra=(now-R.ring.t0)/1600; if(ra>=1) R.ring=null; else { ring(R.ring.city.p,.012+.05*ra,.85*(1-ra),"255,150,90"); if(ra<.5) st="landed"; } }
          if(f>=0){
            st=phaseOf(f); clock=fmtT(f*R.mins);
            var s=f-Math.sin(TAU*f)/TAU, sr=dir>0?s:1-s, ds=dir>0?.004:-.004;
            var P=routePt(R,sr,new THREE.Vector3()), pS=proj(P,{});
            var Pn=routePt(R,clamp(sr+ds,0,1),new THREE.Vector3()), nS=proj(Pn,{});
            if(Math.abs(nS.x-pS.x)+Math.abs(nS.y-pS.y)<.001){ var Pb=routePt(R,clamp(sr-ds,0,1),new THREE.Vector3()); var bS=proj(Pb,{}); nS={x:2*pS.x-bS.x,y:2*pS.y-bS.y}; }
            up.copy(P).multiplyScalar(1.08); var uS=proj(up,{});
            var ux=uS.x-pS.x, uy=uS.y-pS.y, ul=Math.hypot(ux,uy)||1; ux/=ul; uy/=ul;
            var thv=Math.atan2(nS.y-pS.y,nS.x-pS.x), thu=Math.atan2(uy,ux);
            /* attitude: along the velocity on ascent/coast, belly-first (~65° AoA)
               through entry, then the flip to tail-first for the landing burn */
            var ang=thv, d=Math.atan2(Math.sin(thu-thv),Math.cos(thu-thv));
            var aoa=thv+(d>=0?1:-1)*Math.min(Math.abs(d),1.13);
            ang=lerpAng(ang,aoa,sstep(.56,.63,f));
            ang=lerpAng(ang,thu,sstep(.8,.87,f));
            /* keep the heat shield on the Earth side */
            var aS=proj(from.p,{}), bS2=proj(to.p,{}), hx=bS2.x-aS.x, hy=bS2.y-aS.y;
            var mirror=(hx*uy-hy*ux)>0;
            /* perspective: size by depth, squash when flying toward/away from us */
            var dist=Math.hypot(pS.wx-CP.x,pS.wy-CP.y,pS.wz-CP.z);
            tmp.set(nS.wx!=null?nS.wx-pS.wx:0,nS.wy!=null?nS.wy-pS.wy:0,nS.wz!=null?nS.wz-pS.wz:0).normalize();
            tmp2.set(pS.wx-CP.x,pS.wy-CP.y,pS.wz-CP.z).normalize();
            var vert=1-sstep(.03,.16,f)+sstep(.8,.87,f);
            var sqV=Math.sqrt(Math.max(.1,1-Math.pow(tmp.dot(tmp2),2)));
            var nrm=tmp.set(pS.wx,pS.wy,pS.wz).normalize(), sqU=Math.sqrt(Math.max(.1,1-Math.pow(nrm.dot(tmp2),2)));
            var squash=clamp(lerp(sqV,sqU,clamp(vert,0,1)),.32,1);
            var len=clamp(W*.036,24,44)*(CAMZ/dist)*(hot?1.2:1);
            var sunDot=P.clone().normalize().dot(sunLocal), shade=.58+.42*sstep(-.12,.12,sunDot);
            var plumeP=Math.max(sstep(0,.015,f)*(1-sstep(.15,.21,f)), sstep(.83,.86,f)*(1-sstep(.985,1,f))*.85);
            var mode=(f<.1||f>.8)?"atmo":"vac";
            /* trail: last stretch of the flown track */
            var pts=[], back=f<.56?.22:.3;
            for(var k=0;k<=30;k++){
              var ff=Math.max(0,f-back*(1-k/30)), ss=ff-Math.sin(TAU*ff)/TAU;
              pts.push(proj(routePt(R,dir>0?ss:1-ss,tmp),{}));
            }
            var trailA=hot?.95:.7;
            Ship.trail(fc,pts,"255,150,80",hot?3:2.2,trailA*(1-sstep(.9,1,f)));
            if(f>.56&&f<.84){ Ship.trail(fc,pts.slice(-12),"255,120,160",4,.6*bump(.58,.7,.82,f)); }
            /* launch flash + pad ring */
            if(f<.12) ring(from.p,.01+.06*(f/.12),.9*(1-f/.12),"255,160,90");
            if(!pS.h){
              Ship.draw(fc,{x:pS.x,y:pS.y,ang:ang,len:len,mirror:mirror,squash:squash,plume:plumeP,mode:mode,
                plasma:bump(.58,.7,.82,f),glint:.7*bump(.22,.36,.54,f)*sstep(.05,.3,sunDot),shade:shade,t:now});
              if(hot||(W>560&&f>.24&&f<.54)){
                var ft=from.code+"→"+to.code+"  "+clock, fw=fc.measureText(ft).width, off=len*.4+10;
                var lx=pS.x+ux*off+8, ly=pS.y+uy*off;
                if(!free(lx,ly,fw)){ lx=pS.x-ux*off-8-fw; ly=pS.y-uy*off; }
                if(free(lx,ly,fw)){
                  boxes.push([lx,ly,fw]);
                  fc.fillStyle=hot?"rgba(255,122,47,.95)":"rgba(203,210,220,.55)";
                  fc.fillText(ft,lx,ly);
                }
              }
            }
          }
          rows.push({id:R.id,label:from.code+"→"+to.code,st:st,clock:clock,hot:hot});
        });
        if(board&&(now-boardAt>200||REDUCED)){
          boardAt=now;
          boardBox=board.offsetWidth?[board.offsetLeft,board.offsetTop,board.offsetLeft+board.offsetWidth,board.offsetTop+board.offsetHeight]:null;
          board.innerHTML='<div class="gb-h">E2E traffic · concept</div>'+rows.map(function(r){
            return '<div class="gb-r'+(r.hot?" hot":"")+'"><b>'+esc(r.label)+'</b><span class="s-'+r.st.replace(" ","-")+'">'+esc(r.st)+'</span><span>'+esc(r.clock)+'</span></div>';
          }).join("");
        }
      }

      var visible=true, last=performance.now();
      if("IntersectionObserver" in window){
        new IntersectionObserver(function(en){en.forEach(function(x){visible=x.isIntersecting;})},{threshold:.02}).observe(wrap);
      }
      routes.forEach(function(R,i){R.next=performance.now()+300+i*1700;});
      function loop(now){
        requestAnimationFrame(loop);
        if(!visible){last=now;return;}
        var dt=Math.min(64,now-last); last=now;
        if(REDUCED&&!needs) return;
        if(target&&!dragging){
          var ease=REDUCED?1:Math.min(1,dt*.004);
          group.rotation.y+=(target.y-group.rotation.y)*ease;
          group.rotation.x+=(target.x-group.rotation.x)*ease;
        } else if(!REDUCED&&!dragging&&now-lastDrag>2500){ group.rotation.y+=.00009*dt; }
        stars.rotation.y=group.rotation.y*.12; stars.rotation.x=group.rotation.x*.12;
        group.updateMatrixWorld(true);
        sunW.value.copy(sunLocal).applyQuaternion(group.quaternion);
        camL.value.copy(CP); group.worldToLocal(camL.value);
        renderer.render(scene,camera);
        drawFx(now);
        needs=false;
      }
      requestAnimationFrame(loop);
    }catch(e){ fail(); }
  }
})();

/* =====================================================================
   BEYOND — three animated destination scenes on <canvas>:
   orbit (a lap of low Earth orbit), moon (parking orbit → TLI burn →
   coast → LOI burn → lunar orbit) and mars (TMI burn → cruise with a live
   Hohmann-transfer inset → belly-first entry → flip → landing burn).
   Earth is a real sphere-mapped, rotating NASA Blue Marble / Black Marble
   texture; the Moon and Mars are NASA disc photos with live shading.
   ===================================================================== */
(function(){
  var els=$$(".orbit-scene[data-scene]"); if(!els.length) return;
  var DPR=Math.min(window.devicePixelRatio||1,2);
  var IMG={};
  function img(src){ if(!IMG[src]){ var i=new Image(); i.decoding="async"; i.src=src; IMG[src]=i; } return IMG[src]; }
  function ready(i){ return i&&i.complete&&i.naturalWidth>0; }
  var TEX={};
  function tex(src){
    if(TEX[src]) return TEX[src].d?TEX[src]:null;
    var i=img(src); if(!ready(i)) return null;
    try{
      var c=document.createElement("canvas"); c.width=i.naturalWidth; c.height=i.naturalHeight;
      var x=c.getContext("2d"); x.drawImage(i,0,0);
      TEX[src]={w:c.width,h:c.height,d:x.getImageData(0,0,c.width,c.height).data};
    }catch(e){ TEX[src]={}; return null; }
    return TEX[src];
  }
  var DAY="img/earth-day-sm.jpg", NIGHT="img/earth-night-sm.jpg", MOON="img/moon.jpg", MARS="img/mars.jpg";

  /* a rotating textured sphere rendered per-pixel into its own small canvas */
  function Globe(rCss,sun,tilt){
    var r=this.r=Math.max(4,Math.round(rCss*DPR)), n=2*r;
    this.rc=rCss; this.cv=document.createElement("canvas"); this.cv.width=this.cv.height=n;
    this.cx=this.cv.getContext("2d"); this.im=this.cx.createImageData(n,n);
    var sl=Math.hypot(sun[0],sun[1],sun[2]), sx=sun[0]/sl, sy=sun[1]/sl, sz=sun[2]/sl;
    var ct=Math.cos(tilt), st=Math.sin(tilt), idx=[], U=[], Vv=[], Lt=[], A=[];
    for(var j=0;j<n;j++) for(var i=0;i<n;i++){
      var x=(i+.5-r)/r, y=(j+.5-r)/r, d2=x*x+y*y;
      if(d2>1+2/r) continue;
      var dd=Math.sqrt(d2), z=Math.sqrt(Math.max(0,1-d2));
      var tx=x*ct-y*st, ty=x*st+y*ct;
      var lat=Math.asin(clamp(-ty,-1,1)), lon=Math.atan2(tx,z);
      idx.push(j*n+i); U.push(lon/TAU+.5); Vv.push(.5-lat/Math.PI);
      Lt.push(x*sx+y*sy+z*sz); A.push(clamp((1-dd)*r+.5,0,1));
    }
    this.idx=new Int32Array(idx); this.U=new Float32Array(U); this.V=new Float32Array(Vv); this.L=new Float32Array(Lt); this.A=new Float32Array(A); this.rot=-1;
  }
  Globe.prototype.paint=function(rot){
    var day=tex(DAY), night=tex(NIGHT); if(!day) return null;
    if(Math.abs(rot-this.rot)<.0004&&!!night===this.hadNight) return this.cv;
    this.rot=rot; this.hadNight=!!night;
    var o=this.im.data, dw=day.w, dh=day.h, dd=day.d, nd=night&&night.w===dw?night.d:null;
    for(var q=0;q<this.idx.length;q++){
      var k=this.idx[q], u=this.U[q]-rot; u-=Math.floor(u);
      var py=(this.V[q]*dh)|0; if(py>=dh) py=dh-1;
      var s=(py*dw+((u*dw)|0))*4, l=this.L[q];
      var m=clamp((l+.1)/.32,0,1); m=m*m*(3-2*m);
      var dif=(.3+.8*Math.max(l,0))*m, R=dd[s]*dif, G=dd[s+1]*dif, B=dd[s+2]*dif;
      if(nd){ var nk=1-m, lum=nd[s]*.3+nd[s+1]*.59+nd[s+2]*.11, city=lum>70?(lum-70)*2.4:0;
        R+=(nd[s]*.16+city)*nk; G+=(nd[s+1]*.16+city*.78)*nk; B+=(nd[s+2]*.2+city*.5)*nk; }
      var band=l<.06&&l>-.12?(1-Math.abs(l+.03)/.09)*16:0; if(band>0){ R+=band; G+=band*.45; B+=band*.2; }
      var p=k*4; o[p]=R>255?255:R; o[p+1]=G>255?255:G; o[p+2]=B>255?255:B; o[p+3]=255*this.A[q];
    }
    this.cx.putImageData(this.im,0,0);
    return this.cv;
  };
  function drawGlobe(c,g,x,y,rot){
    var cv=g.paint(rot);
    if(cv) c.drawImage(cv,x-g.rc,y-g.rc,2*g.rc,2*g.rc);
    else { c.fillStyle="#12233f"; c.beginPath(); c.arc(x,y,g.rc,0,TAU); c.fill(); }
  }
  /* photo disc (Moon / Mars) with a terminator lit from (lx,ly) */
  function disc(c,src,x,y,r,lx,ly,dark){
    var im=img(src);
    c.save(); c.beginPath(); c.arc(x,y,r,0,TAU); c.clip();
    if(ready(im)) c.drawImage(im,x-r,y-r,2*r,2*r); else { c.fillStyle="#2a2a2e"; c.fill(); }
    var g=c.createRadialGradient(x+lx*r*.62,y+ly*r*.62,r*.15,x+lx*r*.3,y+ly*r*.3,r*1.5);
    g.addColorStop(0,"rgba(4,6,10,0)"); g.addColorStop(.5,"rgba(4,6,10,"+(dark*.3)+")"); g.addColorStop(1,"rgba(4,6,10,"+dark+")");
    c.fillStyle=g; c.fillRect(x-r,y-r,2*r,2*r);
    c.restore();
  }
  /* atmosphere rim: a ring only — a radial gradient would otherwise paint
     its first stop over the whole disc inside the inner circle */
  function halo(c,x,y,r,rgb,a,w){
    var g=c.createRadialGradient(x,y,r*.9,x,y,r*(1+w));
    g.addColorStop(0,"rgba("+rgb+",0)"); g.addColorStop(.35,"rgba("+rgb+","+a+")"); g.addColorStop(1,"rgba("+rgb+",0)");
    c.save(); c.globalCompositeOperation="lighter"; c.fillStyle=g;
    c.beginPath(); c.arc(x,y,r*(1+w),0,TAU); c.arc(x,y,r*.9,0,TAU,true); c.fill("evenodd"); c.restore();
  }
  function sunGlow(c,x,y,r){
    Ship.ell(c,x,y,r,r,[0,"rgba(255,244,220,.9)",.08,"rgba(255,214,160,.55)",.3,"rgba(255,160,90,.14)",1,"rgba(255,140,80,0)"]);
  }
  function rng(seed){ return function(){ seed|=0; seed=seed+0x6D2B79F5|0; var t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
  function starfield(seed){ var r=rng(seed), a=[]; for(var i=0;i<110;i++) a.push([r(),r(),.25+.75*Math.pow(r(),2.6),r()*TAU,.5+r()*1.5]); return a; }
  function drawStars(c,S,W,H,t){
    c.fillStyle="#DDE6F5";
    for(var i=0;i<S.length;i++){ var s=S[i], tw=.6+.4*Math.sin(t*.0011*s[4]+s[3]);
      c.globalAlpha=s[2]*tw; var z=s[2]>.8?1.7:1.1; c.fillRect(s[0]*W,s[1]*H,z,z); }
    c.globalAlpha=1;
  }
  /* point on a tilted ellipse around (cx,cy); front = nearer the viewer */
  function ellPt(cx,cy,rx,ry,tilt,ph){
    var ex=rx*Math.cos(ph), ey=ry*Math.sin(ph), ct=Math.cos(tilt), st=Math.sin(tilt);
    return {x:cx+ex*ct-ey*st, y:cy+ex*st+ey*ct, front:Math.sin(ph)>0};
  }
  function ellTrack(c,cx,cy,rx,ry,tilt,front,a){
    c.save(); c.setLineDash([2,5]); c.strokeStyle="rgba(170,185,210,"+a+")"; c.lineWidth=1;
    c.beginPath(); var first=true;
    for(var k=0;k<=64;k++){ var ph=(front?0:Math.PI)+k/64*Math.PI, p=ellPt(cx,cy,rx,ry,tilt,ph);
      if(first){c.moveTo(p.x,p.y);first=false;} else c.lineTo(p.x,p.y); }
    c.stroke(); c.restore();
  }
  function bez(p0,p1,p2,p3,t){ var u=1-t; return {x:u*u*u*p0.x+3*u*u*t*p1.x+3*u*t*t*p2.x+t*t*t*p3.x, y:u*u*u*p0.y+3*u*u*t*p1.y+3*u*t*t*p2.y+t*t*t*p3.y}; }
  function hist(S,x,y,h,t){ S.tr.push({x:x,y:y,h:h,t:t}); while(S.tr.length&&t-S.tr[0].t>1500) S.tr.shift(); }
  function setHud(S,phase,clock){
    if(S.hp!==phase){ S.hp=phase; if(S.hA) S.hA.innerHTML="<b>"+esc(phase)+"</b>"; }
    if(S.hc!==clock){ S.hc=clock; if(S.hB) S.hB.textContent=clock; }
  }
  function tplus(h){ var d=Math.floor(h/24), hh=Math.floor(h%24); return "T+ "+d+"D "+pad2(hh)+"H"; }

  var SCENES={
    /* ---------- DEST 01: a lap of low Earth orbit ---------- */
    orbit:function(S,c,W,H,t){
      var R=Math.min(H*.33,W*.2), E={x:W*.5,y:H*.6}, SUN=[-.74,-.42,.52];
      sunGlow(c,W*.08,H*.16,H*.62);
      if(!S.g||S.g.rc!==R) S.g=new Globe(R,SUN,.41);
      var LAP=10000, ph=t/LAP*TAU+2.4, lap=Math.floor((ph-2.4)/TAU)+1;
      var rx=R*2.05, ry=R*.5, tilt=-.14;
      var p=ellPt(E.x,E.y,rx,ry,tilt,ph), p2=ellPt(E.x,E.y,rx,ry,tilt,ph+.01);
      /* Starlink train on a steeper shell */
      var train=[]; for(var k=0;k<8;k++) train.push(ellPt(E.x,E.y,R*1.62,R*.24,.32,t/15000*TAU+k*.05));
      function dots(front){ c.fillStyle="rgba(220,230,245,.75)"; train.forEach(function(q){ if(q.front===front && !(!front&&Math.hypot(q.x-E.x,q.y-E.y)<R)) c.fillRect(q.x-.7,q.y-.7,1.4,1.4); }); }
      var hidden=!p.front&&Math.hypot(p.x-E.x,p.y-E.y)<R*1.02;
      hist(S,p.x,p.y,hidden,t);
      var dx=p2.x-p.x, dy=p2.y-p.y, ang=Math.atan2(dy,dx);
      var squash=clamp(Math.hypot(dx,dy)/(rx*.01),.3,1), depth=1+.14*Math.sin(ph);
      var ux=(p.x-E.x), uy=(p.y-E.y), ul=Math.hypot(ux,uy)||1; ux/=ul; uy/=ul;
      var side=(ux*-.87+uy*-.5), shadow=p.front?0:sstep(.05,-.5,side);
      var ship={x:p.x,y:p.y,ang:ang,len:R*.66*depth,squash:squash,mirror:Ship.mirrorFor(ang,ux,uy),
        shade:1-.78*shadow,glint:p.front?.8*sstep(-.2,.6,side)*(.6+.4*Math.sin(t*.004)):0,t:t};
      ellTrack(c,E.x,E.y,rx,ry,tilt,false,.18); dots(false);
      if(!p.front){ Ship.trail(c,S.tr,"190,205,230",1.4,.4); if(!hidden) Ship.draw(c,ship); }
      drawGlobe(c,S.g,E.x,E.y,t/1000*.011);
      halo(c,E.x,E.y,R,"110,165,255",.55,.08);
      ellTrack(c,E.x,E.y,rx,ry,tilt,true,.34); dots(true);
      if(p.front){ Ship.trail(c,S.tr,"190,205,230",1.4,.4); Ship.draw(c,ship); }
      var mins=(ph-2.4)/TAU*92;
      setHud(S,"LEO · lap "+lap,"T+"+pad2(Math.floor(mins/60))+":"+pad2(Math.floor(mins%60))+" · 7.7 KM/S");
    },

    /* ---------- DEST 02: Earth → Moon ---------- */
    moon:function(S,c,W,H,t){
      var T=17000, u=t%T;
      if(u<S.lastU){ S.tr=[]; S.cm=null; } S.lastU=u;
      var Re=Math.min(H*.2,W*.11), Rm=Math.min(H*.13,W*.075);
      var E={x:Math.max(W*.15,Re*1.62+8),y:H*.64}, M={x:Math.min(W*.84,W-Rm*2.1-8),y:H*.32}, SUN=[-.85,-.25,.45];
      if(!S.g||S.g.rc!==Re) S.g=new Globe(Re,SUN,.41);
      var pk={rx:Re*1.62,ry:Re*.55,t:-.3}, lo={rx:Rm*2.1,ry:Rm*.72,t:.22};
      /* TLI departs where the parking-orbit velocity points best at the Moon */
      if(!S.tli||S.W!==W||S.H!==H){
        S.W=W; S.H=H; var best=-9, bph=0, mx=M.x-E.x, my=M.y-E.y, ml=Math.hypot(mx,my);
        for(var k=0;k<180;k++){ var ph=k/180*TAU, a=ellPt(E.x,E.y,pk.rx,pk.ry,pk.t,ph), b=ellPt(E.x,E.y,pk.rx,pk.ry,pk.t,ph-.01);
          if(!a.front) continue; var vx=b.x-a.x, vy=b.y-a.y, vl=Math.hypot(vx,vy); var sc=(vx*mx+vy*my)/(vl*ml); if(sc>best){best=sc;bph=ph;} }
        S.tli=bph;
        var P0=ellPt(E.x,E.y,pk.rx,pk.ry,pk.t,bph), P0b=ellPt(E.x,E.y,pk.rx,pk.ry,pk.t,bph-.01);
        var P3=ellPt(M.x,M.y,lo.rx,lo.ry,lo.t,Math.PI), P3b=ellPt(M.x,M.y,lo.rx,lo.ry,lo.t,Math.PI-.01);
        var t0x=P0b.x-P0.x, t0y=P0b.y-P0.y, t0l=Math.hypot(t0x,t0y), t3x=P3b.x-P3.x, t3y=P3b.y-P3.y, t3l=Math.hypot(t3x,t3y);
        var D=Math.hypot(P3.x-P0.x,P3.y-P0.y);
        for(var sc2=1;sc2>.2;sc2-=.05){
          var k1=D*.5*sc2, k2=D*.42*sc2;
          S.bz=[P0,{x:P0.x+t0x/t0l*k1,y:P0.y+t0y/t0l*k1},{x:P3.x-t3x/t3l*k2,y:P3.y-t3y/t3l*k2},P3];
          var top=1e9; for(var sk=0;sk<=24;sk++) top=Math.min(top,bez(S.bz[0],S.bz[1],S.bz[2],S.bz[3],sk/24).y);
          if(top>=14) break;
        }
      }
      var PARK=2800, BURN=1000, COAST=6600, LOI=1100, LUNAR=4200;
      var p, v, phase, hrs, burn=0, retro=0, near=E, hidden=false, len;
      if(u<PARK){
        var ph=S.tli+TAU-(u/PARK)*TAU; p=ellPt(E.x,E.y,pk.rx,pk.ry,pk.t,ph); v=ellPt(E.x,E.y,pk.rx,pk.ry,pk.t,ph-.01);
        hidden=!p.front&&Math.hypot(p.x-E.x,p.y-E.y)<Re*1.02; phase="Parking orbit"; hrs=u/PARK*2.6; len=Re*.62*(1+.12*Math.sin(ph));
      } else if(u<PARK+BURN+COAST){
        var q=(u-PARK)/(BURN+COAST), sq=q*q*(1.6-.6*q);
        p=bez(S.bz[0],S.bz[1],S.bz[2],S.bz[3],sq); v=bez(S.bz[0],S.bz[1],S.bz[2],S.bz[3],Math.min(1,sq+.004));
        if(sq>.996){ var pb=bez(S.bz[0],S.bz[1],S.bz[2],S.bz[3],sq-.004); v={x:2*p.x-pb.x,y:2*p.y-pb.y}; }
        burn=bump(0,.02,.14,q); phase=q<.13?"TLI burn":"Trans-lunar coast"; hrs=2.6+q*(72-2.6);
        len=Re*(.66+.42*Math.sin(Math.PI*Math.min(1,q*1.1))); near=q<.5?E:M;
      } else if(u<PARK+BURN+COAST+LOI+LUNAR){
        var w=u-PARK-BURN-COAST, ph2=Math.PI-(w/(LOI+LUNAR))*TAU*1.25;
        p=ellPt(M.x,M.y,lo.rx,lo.ry,lo.t,ph2); v=ellPt(M.x,M.y,lo.rx,lo.ry,lo.t,ph2-.01);
        retro=bump(0,LOI*.3,LOI*1.3,w); burn=bump(LOI*.3,LOI*.5,LOI,w);
        hidden=!p.front&&Math.hypot(p.x-M.x,p.y-M.y)<Rm*1.02;
        phase=w<LOI?"LOI burn":"Lunar orbit"; hrs=72+w/(LOI+LUNAR)*6; near=M; len=Rm*1.05*(1+.12*Math.sin(ph2));
      } else {
        var ph3=Math.PI-TAU*1.25-((u-PARK-BURN-COAST-LOI-LUNAR)/(LOI+LUNAR))*TAU*1.25;
        p=ellPt(M.x,M.y,lo.rx,lo.ry,lo.t,ph3); v=ellPt(M.x,M.y,lo.rx,lo.ry,lo.t,ph3-.01);
        hidden=!p.front&&Math.hypot(p.x-M.x,p.y-M.y)<Rm*1.02; phase="Lunar orbit"; hrs=78; near=M; len=Rm*1.05;
      }
      var fade=1-sstep(T-700,T-50,u);
      var ang=Math.atan2(v.y-p.y,v.x-p.x), nx=near.x-p.x, ny=near.y-p.y, nl=Math.hypot(nx,ny)||1;
      /* LOI: yaw the ship round to retrograde (squash through edge-on) and burn */
      var sq=Math.cos(Math.PI*retro); if(Math.abs(sq)<.14) sq=sq<0?-.14:.14;
      var mir=Ship.mirrorFor(ang,-nx/nl,-ny/nl), inCoast=u>=PARK&&u<PARK+BURN+COAST;
      if(inCoast){ if(S.cm==null) S.cm=mir; mir=S.cm; }
      else if(u>=PARK+BURN+COAST&&u<PARK+BURN+COAST+LOI*.8&&retro<.5&&S.cm!=null){ mir=S.cm; }
      var ship={x:p.x,y:p.y,ang:ang,len:len,squash:sq,mirror:mir,
        plume:burn,mode:"vac",glint:.5*(1-burn),alpha:fade,t:t};
      hist(S,p.x,p.y,hidden,t);
      /* the planned track, faint */
      c.save(); c.setLineDash([2,6]); c.strokeStyle="rgba(170,185,210,.2)"; c.lineWidth=1; c.beginPath();
      c.moveTo(S.bz[0].x,S.bz[0].y); c.bezierCurveTo(S.bz[1].x,S.bz[1].y,S.bz[2].x,S.bz[2].y,S.bz[3].x,S.bz[3].y); c.stroke(); c.restore();
      ellTrack(c,E.x,E.y,pk.rx,pk.ry,pk.t,false,.16); ellTrack(c,M.x,M.y,lo.rx,lo.ry,lo.t,false,.16);
      var behind=hidden||(!p.front&&(near===E?u<PARK:u>=PARK+BURN+COAST));
      if(behind){ Ship.trail(c,S.tr,"255,170,110",1.4,.55*fade); if(!hidden) Ship.draw(c,ship); }
      drawGlobe(c,S.g,E.x,E.y,t/1000*.015); halo(c,E.x,E.y,Re,"110,165,255",.5,.1);
      disc(c,MOON,M.x,M.y,Rm,-.85,-.25,.82); halo(c,M.x,M.y,Rm,"200,210,230",.14,.08);
      ellTrack(c,E.x,E.y,pk.rx,pk.ry,pk.t,true,.28); ellTrack(c,M.x,M.y,lo.rx,lo.ry,lo.t,true,.28);
      if(!behind){ Ship.trail(c,S.tr,"255,170,110",1.4,.55*fade); Ship.draw(c,ship); }
      setHud(S,phase,tplus(hrs));
    },

    /* ---------- DEST 03: Earth → Mars ---------- */
    mars:function(S,c,W,H,t){
      var T=16000, u=t%T;
      if(u<S.lastU) S.tr=[]; S.lastU=u;
      var TMI=900, CRUISE=7200, ENTRY=2700, LAND=1900;
      var k=sstep(0,TMI+CRUISE,u);
      var R=H*(.36+.26*k), Mc={x:W-R*.42,y:H*.56};
      sunGlow(c,-W*.05,H*.3,H*.7);
      /* Phobos, skimming low */
      var fp=ellPt(Mc.x,Mc.y,R*1.3,R*.16,-.08,t/6000*TAU);
      function phobos(front){ if(fp.front!==front) return; if(!front&&Math.hypot(fp.x-Mc.x,fp.y-Mc.y)<R) return; c.fillStyle="rgba(190,180,170,.85)"; c.beginPath(); c.arc(fp.x,fp.y,1.6,0,TAU); c.fill(); }
      phobos(false);
      disc(c,MARS,Mc.x,Mc.y,R,-.92,-.3,.9); halo(c,Mc.x,Mc.y,R,"255,150,110",.32,.05);
      phobos(true);
      /* entry skims the upper-left limb belly-first; the ship flips and lands
         standing on Mars' left horizon, seen in profile */
      var RF=H*.62, McF={x:W-RF*.42,y:H*.56}, a1=Math.PI+.1, a2=Math.PI+.62, LEN=34;
      function limb(ang0,rr){ return {x:Mc.x+Math.cos(ang0)*rr,y:Mc.y+Math.sin(ang0)*rr}; }
      var A={x:W*.04,y:H*.84}, B={x:McF.x+Math.cos(a1)*RF*1.3,y:McF.y+Math.sin(a1)*RF*1.3};
      function cruise(q){ var qe=q*(2-q)*.5+q*.5; return {x:lerp(A.x,B.x,qe),y:lerp(A.y,B.y,qe)+Math.sin(q*Math.PI)*H*.05}; }
      var p, phase, day, len=LEN, ang, plumeP=0, mode="vac", plasma=0, glint=0, upx, upy, shake=0;
      if(u<TMI+CRUISE){
        var q=u/(TMI+CRUISE), pa=cruise(Math.max(0,q-.004)), pb=cruise(Math.min(1,q+.004));
        p=cruise(q); ang=Math.atan2(pb.y-pa.y,pb.x-pa.x); S.cruiseAng=ang;
        upx=p.x-Mc.x; upy=p.y-Mc.y;
        plumeP=Math.max(bump(0,TMI*.25,TMI,u),.45*bump(TMI+CRUISE*.5,TMI+CRUISE*.53,TMI+CRUISE*.58,u));
        glint=.7*(1-plumeP); len=lerp(22,LEN,sstep(0,1,q));
        phase=u<TMI?"Trans-Mars injection":plumeP>.1?"Mid-course burn":"Cruise";
        day=u<TMI?0:(u-TMI)/CRUISE*259;
      } else if(u<TMI+CRUISE+ENTRY){
        var w=(u-TMI-CRUISE)/ENTRY, we=w*(2-w);
        var an=lerp(a1,a2-.12,we), rr=R*lerp(1.3,1.05,we*we*(3-2*we));
        var wn=Math.min(1,w+.01), wne=wn*(2-wn), rn=R*lerp(1.3,1.05,wne*wne*(3-2*wne));
        p=limb(an,rr); var pn=limb(lerp(a1,a2-.12,wne),rn);
        var thv=w<.99?Math.atan2(pn.y-p.y,pn.x-p.x):(S.lastThv||0); S.lastThv=thv;
        upx=Math.cos(an); upy=Math.sin(an);
        var thu=an, d=Math.atan2(Math.sin(thu-thv),Math.cos(thu-thv));
        ang=lerpAng(thv,thv+(d>=0?1:-1)*Math.min(Math.abs(d),1.13),sstep(0,.3,w));
        if(S.cruiseAng!=null) ang=lerpAng(S.cruiseAng,ang,sstep(0,.22,w));
        plasma=bump(.08,.5,1.02,w); shake=plasma*.6;
        phase="Entry · belly-first"; day=259;
      } else if(u<TMI+CRUISE+ENTRY+LAND){
        var z=(u-TMI-CRUISE-ENTRY)/LAND, z2=z*z*(3-2*z);
        var anl=lerp(a2-.12,a2,z2);
        p=limb(anl,lerp(R*1.05,R+LEN*.56,z2)); upx=Math.cos(anl); upy=Math.sin(anl);
        ang=lerpAng(S.lastAng==null?anl:S.lastAng,anl,sstep(0,.32,z));
        plasma=.3*(1-sstep(0,.25,z)); plumeP=sstep(.28,.36,z)*(1-sstep(.95,1,z))*.95; mode="atmo";
        phase=z<.3?"Flip":"Landing burn"; day=259;
      } else {
        p=limb(a2,R+LEN*.56); upx=Math.cos(a2); upy=Math.sin(a2);
        ang=a2; phase="Touchdown · Mars"; day=259;
      }
      if(u<TMI+CRUISE+ENTRY+LAND) S.lastAng=ang;
      var fade=1-sstep(T-900,T-100,u), fin=sstep(0,500,u), a=fade*fin;
      var mirror=Ship.mirrorFor(ang,upx,upy);
      /* nose-radial during the flip/landing leaves the belly edge-on to "up";
         latch the side at entry so the sprite can't flicker */
      if(u>=TMI+CRUISE){ if(S.mm==null) S.mm=mirror; mirror=S.mm; } else S.mm=null;
      var jx=shake?(Math.sin(t*.9)*shake):0, jy=shake?(Math.cos(t*1.3)*shake):0;
      hist(S,p.x,p.y,false,t);
      Ship.trail(c,S.tr,plasma>.2?"255,120,150":"255,170,110",plasma>.2?4:1.4,(plasma>.2?.85:.45)*a);
      Ship.draw(c,{x:p.x+jx,y:p.y+jy,ang:ang,len:len,mirror:mirror,plume:plumeP,mode:mode,plasma:plasma,glint:glint,alpha:a,t:t});
      /* touchdown dust, spreading along the horizon */
      var td=u-(TMI+CRUISE+ENTRY+LAND);
      if(td>-250&&td<1700){ var r=clamp((td+250)/1950,0,1), ft=limb(a2,R);
        c.save(); c.globalCompositeOperation="lighter"; c.translate(ft.x,ft.y); c.rotate(a2+Math.PI/2);
        Ship.ell(c,0,0,5+24*r,2+7*r,[0,"rgba(255,214,176,"+(.75*(1-r)*a).toFixed(3)+")",1,"rgba(255,140,90,0)"]); c.restore(); }
      /* Hohmann transfer inset: the real phasing — Mars leads Earth by ~44° at departure */
      if(W<330){ setHud(S,phase,"DAY "+Math.round(day)+" OF ~259"); return; }
      var bx=10, by=10, bs=Math.min(74,H*.38), cx=bx+bs/2, cy=by+bs/2-4, rE=bs*.22, rM=rE*1.524;
      c.save(); c.globalAlpha=fin*fade;
      c.fillStyle="rgba(7,11,19,.72)"; c.strokeStyle="rgba(35,49,73,.9)"; c.lineWidth=1; c.fillRect(bx,by,bs,bs+10); c.strokeRect(bx+.5,by+.5,bs-1,bs+9);
      Ship.ell(c,cx,cy,5,5,[0,"rgba(255,236,200,1)",.4,"rgba(255,190,120,.6)",1,"rgba(255,160,90,0)"]);
      c.setLineDash([1.5,2.5]); c.strokeStyle="rgba(170,185,210,.35)";
      c.beginPath(); c.arc(cx,cy,rE,0,TAU); c.stroke(); c.beginPath(); c.arc(cx,cy,rM,0,TAU); c.stroke(); c.setLineDash([]);
      var th0=2.4, aT=(rE+rM)/2, e=(rM-rE)/(rM+rE);
      function tr(dd){ var Mn=Math.PI*Math.min(dd,259)/259, E0=Mn; for(var i=0;i<6;i++) E0=E0-(E0-e*Math.sin(E0)-Mn)/(1-e*Math.cos(E0));
        var nu=2*Math.atan2(Math.sqrt(1+e)*Math.sin(E0/2),Math.sqrt(1-e)*Math.cos(E0/2)), rr=aT*(1-e*Math.cos(E0));
        return {x:cx+rr*Math.cos(th0-nu),y:cy+rr*Math.sin(th0-nu)}; }
      c.strokeStyle="rgba(255,150,80,.9)"; c.lineWidth=1.2; c.beginPath();
      for(var dd=0;dd<=day;dd+=4){ var q2=tr(dd); if(dd) c.lineTo(q2.x,q2.y); else c.moveTo(q2.x,q2.y); } c.stroke();
      var aE=th0-TAU*day/365, aM=th0-Math.PI+TAU*259/687-TAU*day/687, sh=tr(day);
      c.fillStyle="#6FA8FF"; c.beginPath(); c.arc(cx+rE*Math.cos(aE),cy+rE*Math.sin(aE),2.2,0,TAU); c.fill();
      c.fillStyle="#E0764A"; c.beginPath(); c.arc(cx+rM*Math.cos(aM),cy+rM*Math.sin(aM),2.2,0,TAU); c.fill();
      c.fillStyle="#fff"; c.beginPath(); c.arc(sh.x,sh.y,1.4,0,TAU); c.fill();
      c.font="500 8px 'IBM Plex Mono', monospace"; c.fillStyle="rgba(138,148,166,.95)"; c.textBaseline="alphabetic";
      c.fillText("DAY "+Math.round(day),bx+6,by+bs+6);
      c.restore();
      setHud(S,phase,"DAY "+Math.round(day)+" OF ~259");
    }
  };

  var scenes=els.map(function(el,i){
    var cv=el.querySelector("canvas");
    return {el:el,cv:cv,c:cv.getContext("2d"),kind:el.getAttribute("data-scene"),
      hA:el.querySelector('[data-hud="phase"]'),hB:el.querySelector('[data-hud="clock"]'),
      stars:starfield(9+i*31),tr:[],vis:false,W:0,H:0,t0:performance.now(),lastU:0};
  });
  function fit(S){
    var w=S.el.clientWidth, h=S.el.clientHeight;
    if(w===S.cw&&h===S.ch) return;
    S.cw=w; S.ch=h; S.cv.width=Math.round(w*DPR); S.cv.height=Math.round(h*DPR); S.tli=null; S.tr=[];
  }
  var STILL={orbit:7600,moon:6400,mars:9500};
  function render(S,now){
    fit(S);
    var c=S.c, W=S.cw, H=S.ch, t=REDUCED?STILL[S.kind]:now-S.t0;
    c.setTransform(DPR,0,0,DPR,0,0); c.clearRect(0,0,W,H);
    drawStars(c,S.stars,W,H,t);
    if(REDUCED) S.tr=[];
    SCENES[S.kind](S,c,W,H,t);
  }
  [DAY,NIGHT,MOON,MARS].forEach(img);
  if("IntersectionObserver" in window){
    var io=new IntersectionObserver(function(en){en.forEach(function(x){
      scenes.forEach(function(S){ if(S.el===x.target) S.vis=x.isIntersecting; });
    });},{rootMargin:"80px"});
    scenes.forEach(function(S){io.observe(S.el);});
  } else scenes.forEach(function(S){S.vis=true;});
  var lastStill=0;
  function loop(now){
    requestAnimationFrame(loop);
    if(REDUCED){ if(now-lastStill<500) return; lastStill=now; }
    scenes.forEach(function(S){ if(S.vis) render(S,now); });
  }
  requestAnimationFrame(loop);
})();

/* ---- holdings: market signals feed ---- */
(function(){
  var box=document.getElementById("sigbox"); if(!box) return;
  Promise.all([
    cachedFetch("https://api.spaceflightnewsapi.net/v4/articles/?limit=6&search=spacex%20valuation").then(function(r){return r.json()}).catch(function(){return {results:[]}}),
    new Promise(function(res){setTimeout(res,900)}).then(function(){
      return cachedFetch("https://api.spaceflightnewsapi.net/v4/articles/?limit=6&search=xai").then(function(r){return r.json()}).catch(function(){return {results:[]}});
    })
  ]).then(function(rs){
    var seen={},all=[];
    rs.forEach(function(j){(j.results||[]).forEach(function(a){if(a&&a.id&&!seen[a.id]&&safeUrl(a.url)){seen[a.id]=1;all.push(a);}})});
    all.sort(function(a,b){return new Date(b.published_at)-new Date(a.published_at)});
    all=all.slice(0,5);
    if(!all.length){box.innerHTML='<div class="wire-msg">NO SIGNALS ON THIS BAND RIGHT NOW.</div>';return;}
    box.innerHTML=all.map(function(a){
      return '<a class="sig" href="'+esc(safeUrl(a.url))+'" target="_blank" rel="noopener"><span class="st">'+esc(a.title)+'</span><span class="sm">'+esc(a.news_site||"")+'</span></a>';
    }).join("");
  }).catch(function(){box.innerHTML='<div class="wire-msg">SIGNAL LOST.</div>';});
})();

})();
