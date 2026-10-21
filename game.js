/* PSM GUNFIGHT 5.2.13 — independently runnable reconstruction from chat requirements.
   NOT a byte-for-byte export of the original inline ChatGPT AppBlock. */
(()=>{'use strict';
const $=id=>document.getElementById(id),cv=$('game'),ctx=cv.getContext('2d');
const UI={overlay:$('overlay'),heading:$('heading'),message:$('message'),config:$('configuration'),start:$('start'),restart:$('restart'),menu:$('mainmenu'),pause:$('pause'),difficulty:$('difficulty'),loadout:$('loadout'),state:$('state'),slip:$('slip'),ammo:$('ammo')};
const PI=Math.PI,TWO=2*PI,W=800,H=500,RAD=PI/180;
const SPEED_MAX=1200,STALL=300,PSM_MAX=500,PSM_TIME=2,PSM_TURN=TWO,PSM_CD=.05,BOOST_TIME=2.5,SAFE=1.6;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v)),angle=a=>Math.atan2(Math.sin(a),Math.cos(a)),spd=o=>Math.hypot(o.vx,o.vy),kmh=o=>spd(o)*3.6,ms=k=>k/3.6;
const WEAPONS={msl:{count:2,cone:75*RAD,turn:40*RAD,reload:5,damage:25,initial:ms(600),accel:ms(500),max:ms(3900),ignition:0,life:10},'6aam':{count:6,cone:60*RAD,turn:55*RAD,reload:14,damage:50,accel:ms(1200),max:ms(4800),ignition:.18,life:10},'6aamx':{count:6,cone:108*RAD,turn:99*RAD,reload:14,damage:50,accel:ms(1200),max:ms(4800),ignition:.18,life:10},'hpaa':{count:2,cone:117*RAD,turn:81*RAD,reload:10,damage:100,initial:ms(400),accel:ms(1200),max:ms(1800),ignition:0,life:9},'hcaa':{count:2,cone:126*RAD,turn:99*RAD,reload:3.5,damage:50,initial:ms(750),accel:ms(1200),max:ms(5500),ignition:0,life:9},'qaam':{count:2,cone:216*RAD,lockAngle:90*RAD,launchAngle:90*RAD,turn:117*RAD,reload:10,damage:50,initial:ms(600),accel:ms(900),max:ms(4800),ignition:0,life:7.5}};
let game='menu',level='easy',weapon='msl',gunEnabled=true,distance='far',unit=1,planeScale=1,hitScale=1,maxHP=100,psmMode='ac7',player,enemy,bullets=[],missiles=[],fx=[],texts=[],cam={x:0,y:0,z:1},time=0,last=0;
let lastCombo=false,lastPSM=false,psmPulse=false,keys=new Set(),touches={},bindings={up:['ArrowDown'],down:['ArrowUp'],throttle:['KeyW'],brake:['KeyS'],psm:['KeyX'],fire:['ShiftLeft','Mouse0','ShiftRight'],missile:['Space','Mouse2']},mouseAmount=0,oldMouseY=null,rebinding=null;
let pointerLockPending=false;
let aiSpeedBias=0,aiSpeedTarget=0,aiSpeedClock=0,aiSpeedResponse=0,aiAim=PI,aiThink=0,aiGunCD=0,aiMissileCD=0,aiMode='pursuit',aiDecision=0,aiCommit=0,aiPsmRemain=0,aiPsmWait=0,aiBurst=0,aiRest=0;
const controls={up:false,down:false,throttle:false,brake:false,psm:false,fire:false,missile:false};
const plane=(x,y,a,color)=>{const v=ms(600);return{x,y,a,vx:v*Math.cos(a),vy:v*Math.sin(a),color,hp:maxHP,stall:false,psm:false,stage:'normal',psmDir:0,pt:0,pa:0,pcd:0,latch:false,boost:0,boostAngle:0,recover:0,recoverFrom:0,glideVector:a,boostVector:a,gunCD:0,slots:Array(WEAPONS[weapon].count).fill(0),nextSlot:0,mlatch:false,hit:0,shots:0,hits:0,trail:[]}};
function release(){keys.clear();touches={};lastCombo=false;lastPSM=false;mouseAmount=0;oldMouseY=null;Object.keys(controls).forEach(k=>controls[k]=false);document.querySelectorAll('.held').forEach(x=>x.classList.remove('held'))}
function input(){for(const a in controls)controls[a]=!!touches[a]||bindings[a].some(k=>k&&keys.has(k));const rawThrottle=controls.throttle,rawBrake=controls.brake,combo=rawThrottle&&rawBrake,psm=controls.psm;psmPulse=(combo&&!lastCombo)||(psm&&!lastPSM);lastCombo=combo;lastPSM=psm;controls.psm=psm||combo;controls.throttle=rawThrottle&&!rawBrake;controls.brake=rawBrake&&!rawThrottle;if(document.getElementById('mousepitch').checked){if(mouseAmount<-.45)controls.up=true;if(mouseAmount>.45)controls.down=true}}
function updateStall(o){o.stall=o.stage==='normal'&&o.boost<=0&&kmh(o)<STALL}
function smooth(t){t=clamp(t,0,1);return t*t*(3-2*t)}
function recover(o){o.recover=.8;o.recoverFrom=Math.max(slipCap(kmh(o)),Math.abs(angle(Math.atan2(o.vy,o.vx)-o.a)))}
function enterPSM(o,dir){if(!psmReady(o)||o.pcd>0||o.latch)return false;o.psm=true;if(psmMode==='ac7')o.latch=true;o.stage=psmMode==='ac7'?'glide':'easy';o.psmDir=dir;o.pt=0;o.pa=0;o.boost=0;o.boostAngle=0;o.recover=0;o.glideVector=Math.atan2(o.vy,o.vx);o.boostVector=o.glideVector;updateStall(o);return true}
function quitPSM(o,forced,boost){if(o.stage==='normal')return;o.stage='normal';o.psm=false;o.pt=0;o.pa=0;o.pcd=PSM_CD;if(forced)o.latch=true;if(boost){o.boost=2.5;o.boostAngle=0;o.recover=0}else{o.boost=0;recover(o)}updateStall(o)}
/* v5.2.4: Pointer Lock uses movementY independent of cursor position or viewport size. */
function mouseLocked(){return document.pointerLockElement===cv}
function mouseStatus(){
 const locked=mouseLocked(), enabled=$('mousepitch').checked, status=$('mouse-status');
 status.textContent=locked?'鼠标已锁定':!enabled?'鼠标操控未开启':game==='play'?'点击画面锁定鼠标':'鼠标未锁定';
 status.classList.toggle('active',locked);
 $('lockmouse').textContent=locked?'解除锁定':'锁定鼠标';
 $('lockmouse').disabled=game!=='play'&&!locked;
}
function unlockMouse(){if(mouseLocked()&&document.exitPointerLock)document.exitPointerLock();pointerLockPending=false;mouseAmount=0;oldMouseY=null;mouseStatus()}
function lockMouse(){
 if(game!=='play')return;
 $('mousepitch').checked=true;
 if(mouseLocked()||pointerLockPending){mouseStatus();return}
 if(typeof cv.requestPointerLock!=='function'){$('mouse-status').textContent='浏览器不支持锁定鼠标';return}
 pointerLockPending=true;
 try{const request=cv.requestPointerLock();if(request&&typeof request.catch==='function')request.catch(()=>{pointerLockPending=false;$('mouse-status').textContent='无法锁定，请点击游戏画面重试'})}
 catch(err){pointerLockPending=false;$('mouse-status').textContent='无法锁定，请点击游戏画面重试'}
}
function pointerLockChanged(){pointerLockPending=false;mouseAmount=0;oldMouseY=null;mouseStatus()}
function moveMouse(ev){
 if(game!=='play'||!$('mousepitch').checked)return;
 if(mouseLocked()){
   let dy=ev.movementY||0;if($('invert').checked)dy=-dy;
   mouseAmount=clamp(mouseAmount+dy*.3,-12,12);
 }else if(ev.target===cv){
   /* Fallback only until pointer lock is acquired. */
   if(oldMouseY!==null){let dy=ev.clientY-oldMouseY;if($('invert').checked)dy=-dy;mouseAmount=clamp(mouseAmount+dy*.3,-12,12)}
   oldMouseY=ev.clientY;
 }
}
function reset(){level=UI.difficulty.value;weapon=UI.loadout.value.replace(/-nogun$/,'');gunEnabled=!UI.loadout.value.endsWith('-nogun');document.querySelector('[data-k="fire"]').classList.toggle('disabled',!gunEnabled);distance=$('distance').value;psmMode=$('psmmode').value;maxHP=Number($('hp').value);unit=distance==='far'?1.43:1;planeScale=distance==='far'?.58:1;hitScale=distance==='far'?.56:1;let dx=distance==='far'?420:305,dy=distance==='far'?220:185;player=plane(-dx,dy,-.18,'#66dfff');enemy=plane(dx,-dy,PI+.18,'#ff7890');bullets=[];missiles=[];fx=[];texts=[];cam={x:0,y:0,z:distance==='far'?.77:1};time=0;aiAim=PI;aiThink=0;aiGunCD=.3;aiMissileCD=2;aiMode='pursuit';aiDecision=0;aiCommit=0;aiPsmRemain=0;aiPsmWait=1.4;aiBurst=0;aiRest=0;aiSpeedBias=0;aiSpeedTarget=0;aiSpeedClock=0;aiSpeedResponse=0;game='play';UI.overlay.hidden=true;UI.pause.textContent='暂停 Esc';release();cv.focus({preventScroll:true});mouseStatus();if($('mousepitch').checked)lockMouse()}
function psmReady(o){return !o.stall&&o.stage==='normal'&&kmh(o)>=STALL&&kmh(o)<PSM_MAX&&o.pcd<=0}
function endPSM(o,forced){quitPSM(o,forced,true)}
function turnRate(k){if(k<STALL)return .12;const d=(k-700)/285;return .91+.50*Math.exp(-d*d)}
function slipCap(k){return (60-44*smooth((k-STALL)/(SPEED_MAX-STALL)))*RAD*.5}
function intercept(shooter,target){const dx=target.x-shooter.x,dy=target.y-shooter.y,vx=target.vx-shooter.vx,vy=target.vy-shooter.vy;const A=vx*vx+vy*vy-355*355,B=2*(dx*vx+dy*vy),C=dx*dx+dy*dy;let t=NaN;if(Math.abs(A)<1e-7){if(Math.abs(B)>1e-7)t=-C/B}else{const D=B*B-4*A*C;if(D>=0){const z=Math.sqrt(D),valid=[(-B-z)/(2*A),(-B+z)/(2*A)].filter(a=>a>0);if(valid.length)t=Math.min(...valid)}}return clamp(t>0?t:Math.hypot(dx,dy)/355,0,2.8)}
function ai(dt){const o=enemy,t=player,dx=t.x-o.x,dy=t.y-o.y,d=Math.hypot(dx,dy),easy=level==='easy',hard=level==='hard',raw=angle(Math.atan2(dy,dx)-o.a),absRaw=Math.abs(raw),v=kmh(o);
 aiThink-=dt;if(aiThink<=0){let ax,ay,jitter,interval;if(hard){const lead=intercept(o,t);ax=t.x+(t.vx-o.vx)*lead;ay=t.y+(t.vy-o.vy)*lead;if(Math.random()<.6){jitter=.035}else{const distance=Math.max(120,Math.hypot(ax-o.x,ay-o.y)),offset=(Math.random()<.5?-1:1)*(.10+Math.random()*.16)*distance,side=Math.atan2(ay-o.y,ax-o.x)+PI/2;ax+=Math.cos(side)*offset;ay+=Math.sin(side)*offset;jitter=.13}interval=.045+Math.random()*.045}else{const lead=Math.min(easy?.27:.43,d/(easy?1000:700));ax=t.x+t.vx*lead;ay=t.y+t.vy*lead;jitter=easy?.10:.014;interval=easy?.13+Math.random()*.11:.045+Math.random()*.045}aiAim=angle(Math.atan2(ay-o.y,ax-o.x)+(Math.random()-.5)*jitter);aiThink=interval}
 const err=angle(aiAim-o.a),abs=Math.abs(err);aiPsmWait=Math.max(0,aiPsmWait-dt);aiCommit=Math.max(0,aiCommit-dt);aiDecision-=dt;
 const closing=(dx*(o.vx-t.vx)+dy*(o.vy-t.vy))/(d||1),tail=absRaw<.65&&d<950,cross=d<280&&absRaw>.65;
 if(aiDecision<=0){aiDecision=easy?.19:.10;if(aiMode==='psm'){if(!o.psm||abs<.10||o.stall){aiMode='pursuit';aiPsmWait=easy?2.7:1.25}}else if(aiMode==='setup'){if(o.stall||(tail&&aiCommit<=0)||(d>1000&&aiCommit<=0)){aiMode='pursuit';aiPsmWait=easy?2:1}else if(psmReady(o)&&o.pcd<=0&&!o.latch){aiMode='psm';aiPsmRemain=easy?.7:.9}else if(aiCommit<=0){aiMode='pursuit';aiPsmWait=easy?2.7:1.3}}else{const geometry=easy?((absRaw>1.48&&d<430)||(cross&&absRaw>1.2&&d<220)):((absRaw>1&&d<690)||(cross&&closing>20));if(aiPsmWait<=0&&geometry&&!tail&&!o.stall&&v>340){aiMode='setup';aiCommit=easy?1.15:1.75}}}
 if(o.psm&&aiMode==='setup')aiMode='psm';if(aiMode==='psm'&&!o.psm&&o.latch){aiMode='pursuit';aiPsmWait=easy?2.7:1.3}if(o.stall&&aiMode!=='pursuit'){aiMode='pursuit';aiPsmWait=easy?2.7:1.3}
 let use=aiMode==='psm'&&aiPsmRemain>0&&!o.latch;if(o.psm&&aiMode==='psm')aiPsmRemain-=dt;if(aiMode==='psm'&&aiPsmRemain<=0&&o.psm){aiMode='pursuit';aiPsmWait=easy?2.7:1.3;use=false}
 // AI speed control: gradual pilot inputs, small evolving target-speed variation, no velocity teleport.
 // Higher difficulty reacts more promptly; variation is deliberately subtle.
 const responsiveness=easy?1.25:hard?2.6:1.85;
 aiSpeedClock-=dt;
 if(aiSpeedClock<=0){aiSpeedClock=(easy?.85:hard?.46:.64)*(0.8+Math.random()*.4);aiSpeedTarget=(Math.random()*2-1)*(easy?42:hard?26:34)}
 aiSpeedBias+=(aiSpeedTarget-aiSpeedBias)*Math.min(1,dt*responsiveness);
 let throttle=false,brake=false;
 if(o.stall)throttle=true;
 else if(aiMode==='setup'){
   // Existing PSM preparation band remains 335–455; above 600 the AI brakes into it naturally.
   const low=335,high=455;
   brake=v>high;throttle=v<low;
 }else if(!use&&!o.psm){
   const desired=(tail&&d<240?620:700)+aiSpeedBias;
   // Smooth decision response instead of instantaneous speed targeting.
   const delta=v<desired-20?1:v>desired+35?-1:0;
   aiSpeedResponse+=(delta-aiSpeedResponse)*Math.min(1,dt*responsiveness*2.3);
   throttle=aiSpeedResponse>.4;brake=aiSpeedResponse<-.4;
   if(d<175&&absRaw<.25&&closing>120)brake=true;
 }
 aiGunCD-=dt;aiMissileCD-=dt;const shootingOpportunity=time>=SAFE&&d<(easy?620:800)&&abs<(easy?.19:hard?.23:.26);let fire=false,missile=false;
 // HARD: on-target continuous firing opportunity accumulates for 0.8 s, then 0.6 s enforced rest.
 // Rest can never be bypassed by the ordinary gun cadence.
 if(hard){if(aiRest>0){aiRest=Math.max(0,aiRest-dt);aiBurst=0}else if(shootingOpportunity){aiBurst+=dt;if(aiBurst>=.8){aiBurst=0;aiRest=.6}}else aiBurst=0}
 if(gunEnabled&&shootingOpportunity&&(!hard||aiRest<=0)&&aiGunCD<=0){fire=true;aiGunCD=easy?.25+Math.random()*.2:hard?.095:.09+Math.random()*.045}
 if(time>=SAFE&&d>180&&d<950&&abs<(WEAPONS[weapon].lockAngle??.27)&&aiMissileCD<=0&&o.slots.some(x=>x<=0)){missile=true;aiMissileCD=easy?4.5+Math.random()*2:2.5+Math.random()}
 return{up:err<-.055,down:err>.055,throttle,brake,psm:use,fire,missile};}
function gun(o){const spread=o===enemy?(level==='hard'?.045:level==='easy'?.065:.009):.025,a=o.a+(Math.random()-.5)*spread,ca=Math.cos(a),sa=Math.sin(a);bullets.push({x:o.x+ca*24*planeScale,y:o.y+sa*24*planeScale,vx:o.vx+ca*355,vy:o.vy+sa*355,life:2,owner:o});o.shots++}
function launch(o){const w=WEAPONS[weapon],t=o===player?enemy:player,dx=t.x-o.x,dy=t.y-o.y;if(Math.hypot(dx,dy)>1500*unit||Math.abs(angle(Math.atan2(dy,dx)-o.a))>(w.launchAngle??w.cone))return false;let slot=-1;for(let i=0;i<o.slots.length;i++){const n=(o.nextSlot+i)%o.slots.length;if(o.slots[n]<=0){slot=n;break}}if(slot<0)return false;const ca=Math.cos(o.a),sa=Math.sin(o.a);let x=o.x+ca*30*planeScale,y=o.y+sa*30*planeScale,vx,vy;if(w.initial!==undefined){vx=ca*w.initial;vy=sa*w.initial}else{const s=spd(o),extra=distance==='far'?0:ms(50);vx=o.vx+(s>1?o.vx/s*extra:ca*extra);vy=o.vy+(s>1?o.vy/s*extra:sa*extra);let side=slot%2===0?-1:1;x-=sa*side*11*planeScale;y+=ca*side*11*planeScale}missiles.push({x,y,a:o.a,vx,vy,age:0,owner:o,target:t,type:weapon,trail:[],miss:false,missTime:0});o.slots[slot]=w.reload;o.nextSlot=(slot+1)%o.slots.length;return true}
function movePlane(o,c,dt){o.pcd=Math.max(0,o.pcd-dt);updateStall(o);if(!c.psm)o.latch=false;
 if(psmMode==='easy'){if(c.psm&&o.stage==='normal'&&!o.latch&&psmReady(o))enterPSM(o,0)}else if(c.psm&&o.stage==='normal'&&!o.latch&&c.up!==c.down&&psmReady(o))enterPSM(o,c.up?-1:1);
 if(o.stage==='easy'){o.pt+=dt;if(!c.psm||o.pt>=PSM_TIME)quitPSM(o,!!c.psm,true)}
 else if(o.stage==='glide'||o.stage==='acboost'){const opp=o.psmDir===-1?c.down:c.up;if(opp)quitPSM(o,true,false);else{o.pt+=dt;if(o.stage==='glide'&&o.pt>=1){o.stage='acboost';o.pt-=1;o.boostVector=Math.atan2(o.vy,o.vx)}else if(o.stage==='acboost'&&o.pt>=2)quitPSM(o,true,false)}}
 const pitch=(c.down?1:0)-(c.up?1:0),rate=o.stall?.12:o.stage==='normal'?turnRate(kmh(o)):3.45;let da=pitch*rate*dt;
 if(o.stage!=='normal'){const remain=Math.max(0,PSM_TURN-o.pa);if(pitch&&Math.abs(da)>=remain){da=Math.sign(da)*remain;o.a=angle(o.a+da);quitPSM(o,true,false)}else{o.pa+=Math.abs(da);o.a=angle(o.a+da)}}else o.a=angle(o.a+da);
 if(o.stage==='normal'&&o.boost>0){o.boost-=dt;o.boostAngle+=Math.abs(da);if(o.boost<=0||o.boostAngle>=TWO){o.boost=0;o.boostAngle=0;recover(o)}}
 const psm=o.stage!=='normal',enhanced=psm||o.boost>0,scale=distance==='far'?.82:1;
 const thrust=c.throttle?125*scale*(enhanced?.65:1):c.brake?-110*scale:psm?-35*scale:18*scale;
 let thrustA=o.a;if(o.stage==='glide')thrustA=o.glideVector;else if(o.stage==='acboost')thrustA=angle(o.boostVector+angle(o.a-o.boostVector)*smooth(o.pt/2));
 o.vx+=Math.cos(thrustA)*thrust*dt;o.vy+=Math.sin(thrustA)*thrust*dt;let s=spd(o);
 if(o.stage==='glide'&&s>1){o.vx=Math.cos(o.glideVector)*s;o.vy=Math.sin(o.glideVector)*s}
 if(o.stage==='acboost'&&s>1){const va=Math.atan2(o.vy,o.vx),dir=va+angle(o.a-va)*clamp(dt*1.55,0,.14);o.vx=Math.cos(dir)*s;o.vy=Math.sin(dir)*s}
 else if(o.stage==='normal'&&s>1){const va=Math.atan2(o.vy,o.vx),blend=clamp(dt*(o.stall?.09:.27+s*.006),0,o.stall?.013:.07);let dir=va+angle(o.a-va)*blend;if(!o.stall&&o.boost<=0){let lim=slipCap(kmh(o));if(o.recover>0){o.recover=Math.max(0,o.recover-dt);lim=lim+(o.recoverFrom-lim)*(1-smooth(1-o.recover/.8));lim=Math.max(lim,Math.abs(angle(dir-o.a))-1.05*dt)}dir=o.a+clamp(angle(dir-o.a),-lim,lim)}o.vx=Math.cos(dir)*s;o.vy=Math.sin(dir)*s}
 const drag=Math.max(0,1-(psm?.23:.1)*dt);o.vx*=drag;o.vy*=drag;s=spd(o);if(s>ms(SPEED_MAX)){o.vx*=ms(SPEED_MAX)/s;o.vy*=ms(SPEED_MAX)/s}
 o.x=clamp(o.x+o.vx*dt*unit,-12000,12000);o.y=clamp(o.y+o.vy*dt*unit,-4800,4800);updateStall(o);
 o.gunCD=Math.max(0,o.gunCD-dt);o.slots=o.slots.map(x=>Math.max(0,x-dt));o.hit=Math.max(0,o.hit-dt);
 if(gunEnabled&&c.fire&&time>=SAFE&&o.gunCD<=0){gun(o);o.gunCD=o===enemy?(level==='easy'?.23:.095):.105}
 if(!c.missile)o.mlatch=false;if(c.missile&&!o.mlatch){o.mlatch=true;if(time>=SAFE)launch(o)}
 o.trail.push({x:o.x,y:o.y});if(o.trail.length>55)o.trail.shift()}
function lineHit(x0,y0,x1,y1,t,r){const dx=x1-x0,dy=y1-y0,u=clamp(((t.x-x0)*dx+(t.y-y0)*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(x0+dx*u-t.x,y0+dy*u-t.y)<r}
function finish(win){game='end';UI.heading.textContent=win?'MISSION ACCOMPLISHED':'MISSION FAILED';UI.message.textContent=(win?'敌机已被击落':'你已被击落')+' · '+time.toFixed(1)+' s · 命中 '+player.hits+'/'+player.shots;UI.config.hidden=true;UI.start.textContent='再战一次';UI.restart.hidden=true;UI.menu.hidden=false;UI.overlay.hidden=false;release();unlockMouse()}
function damage(o,amount,x,y){o.hp=Math.max(0,o.hp-amount);o.hit=.18;for(let j=0;j<12;j++)fx.push({x,y,vx:(Math.random()-.5)*190,vy:(Math.random()-.5)*190,life:.35});if(o.hp<=0)finish(o===enemy)}
function makeMiss(m){if(!m.miss){m.miss=true;m.missTime=0;texts.push({x:m.x,y:m.y,life:.7,label:'MISS'})}}
function moveMissile(m,dt){const w=WEAPONS[m.type],x=m.x,y=m.y;
 if(m.miss){m.x+=m.vx*dt*unit;m.y+=m.vy*dt*unit;m.missTime+=dt;m.trail.push({x:m.x,y:m.y});if(m.trail.length>30)m.trail.shift();return m.missTime>=1}
 m.age+=dt;if(m.age>=w.life){makeMiss(m);m.x+=m.vx*dt*unit;m.y+=m.vy*dt*unit;m.missTime+=dt;return false}
 if(m.age>=w.ignition){const desired=Math.atan2(m.target.y-m.y,m.target.x-m.x),err=angle(desired-m.a);if(Math.abs(err)>w.cone)makeMiss(m);else m.a=angle(m.a+clamp(err,-w.turn*dt,w.turn*dt))}
 if(m.miss){m.x+=m.vx*dt*unit;m.y+=m.vy*dt*unit;m.missTime+=dt;return false}
 if(m.age>=w.ignition){if(w.initial!==undefined){const v=Math.min(w.max,spd(m)+w.accel*dt);m.vx=Math.cos(m.a)*v;m.vy=Math.sin(m.a)*v}else{m.vx+=Math.cos(m.a)*w.accel*dt;m.vy+=Math.sin(m.a)*w.accel*dt;let v=spd(m);if(v>w.max){m.vx*=w.max/v;m.vy*=w.max/v;v=w.max}if(v>1){const t=clamp(m.age/4,0,1),cap=Math.PI*Math.pow(1-t*t,2),va=Math.atan2(m.vy,m.vx),dir=m.a+clamp(angle(va-m.a),-cap,cap);m.vx=Math.cos(dir)*v;m.vy=Math.sin(dir)*v}}}
 m.x+=m.vx*dt*unit;m.y+=m.vy*dt*unit;m.trail.push({x:m.x,y:m.y});if(m.trail.length>30)m.trail.shift();if(lineHit(x,y,m.x,m.y,m.target,21*hitScale)){damage(m.target,w.damage,m.x,m.y);return true}return false}
function update(dt){time+=dt;input();movePlane(player,{...controls,psmPulse},dt);let aiC=ai(dt);aiC.psmPulse=psmMode==='ac7'&&aiC.psm&&!enemy.psm&&enemy.stage==='normal';if(aiC.psmPulse){if(aiC.up===aiC.down)aiC.up=true}movePlane(enemy,aiC,dt);
 for(let i=bullets.length-1;i>=0;i--){const b=bullets[i],x=b.x,y=b.y;b.x+=b.vx*dt*unit;b.y+=b.vy*dt*unit;b.life-=dt;const t=b.owner===player?enemy:player;if(lineHit(x,y,b.x,b.y,t,17*hitScale)){b.owner.hits++;bullets.splice(i,1);damage(t,5,b.x,b.y);if(game!=='play')break}else if(b.life<=0)bullets.splice(i,1)}
 if(game==='play')for(let i=missiles.length-1;i>=0;i--){if(moveMissile(missiles[i],dt))missiles.splice(i,1);if(game!=='play')break}
 for(let i=fx.length-1;i>=0;i--){let q=fx[i];q.x+=q.vx*dt*unit;q.y+=q.vy*dt*unit;q.life-=dt;if(q.life<=0)fx.splice(i,1)}for(let i=texts.length-1;i>=0;i--){texts[i].life-=dt;if(texts[i].life<=0)texts.splice(i,1)}
 const d=Math.hypot(player.x-enemy.x,player.y-enemy.y),z=clamp(580/(d+160),distance==='far'?.24:.33,distance==='far'?.86:1.15),rate=Math.min(1,dt*3);cam.z+=(z-cam.z)*Math.min(1,dt*2.5);cam.x+=((player.x+enemy.x)/2-cam.x)*rate;cam.y+=((player.y+enemy.y)/2-cam.y)*rate;
 UI.state.textContent=player.stall?'STALL':player.stage==='glide'?'GLIDE':player.stage==='acboost'?'AC BOOST':player.stage==='easy'?'PSM':player.boost>0?'BOOST '+player.boost.toFixed(1):player.recover>0?'RECOVER':'NORMAL';UI.slip.textContent=Math.round(Math.abs(angle(Math.atan2(player.vy,player.vx)-player.a))/RAD)+'°';UI.ammo.textContent=player.slots.map(x=>x<=0?'●':Math.ceil(x)+'s').join(' ');if($('psmstatus'))$('psmstatus').textContent=player.stall?'STALL':player.stage!=='normal'?player.pt.toFixed(1)+'s':player.latch?'RELEASE':psmReady(player)?'READY':'LOCK';mouseAmount*=Math.pow(.12,dt*8)}
function drawPlane(o){ctx.save();ctx.translate(o.x,o.y);ctx.rotate(o.a);ctx.scale(planeScale,planeScale);ctx.shadowColor=o.color;ctx.shadowBlur=8;ctx.fillStyle=o.hit?'#fff':o.color;ctx.beginPath();ctx.moveTo(26,0);ctx.lineTo(7,-5);ctx.lineTo(-9,-5);ctx.lineTo(-18,-12);ctx.lineTo(-24,-12);ctx.lineTo(-21,-3);ctx.lineTo(-30,-3);ctx.lineTo(-30,4);ctx.lineTo(7,5);ctx.closePath();ctx.fill();ctx.fillStyle='#17394d';ctx.fillRect(0,-5,10,4);if(o.stage!=='normal'||o.boost>0){ctx.strokeStyle=o.stage!=='normal'?'#ffe28c':'#9df7a9';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,32,-.7,.7);ctx.stroke()}ctx.restore();if(o.stall){ctx.fillStyle='#ffba6b';ctx.font='bold 13px sans-serif';ctx.textAlign='center';ctx.fillText('STALL',o.x,o.y-34)}}
/* Visual assistance: lead is the real ballistic intercept of a 355-unit/s cannon shot.
   A bullet inherits the player's velocity; each projectile and plane is scaled by `unit` per frame. */
function gunLeadPoint(){
 if(!player||!enemy||!gunEnabled)return null;
 const speed=355,rx=(enemy.x-player.x)/unit,ry=(enemy.y-player.y)/unit,
   vx=enemy.vx-player.vx,vy=enemy.vy-player.vy;
 const A=vx*vx+vy*vy-speed*speed,B=2*(rx*vx+ry*vy),C=rx*rx+ry*ry;
 let tau=-1;
 if(Math.abs(A)<1e-7){if(Math.abs(B)>1e-7)tau=-C/B;}
 else{const D=B*B-4*A*C;if(D>=0){const q=Math.sqrt(D),t1=(-B-q)/(2*A),t2=(-B+q)/(2*A);tau=t1>0&&t2>0?Math.min(t1,t2):Math.max(t1,t2);}}
 if(!(tau>0&&tau<=2))return null;
 // Apply the gun's forward muzzle offset and solve again, accounting for projectile start point.
 for(let i=0;i<3;i++){
   const px=rx+vx*tau,py=ry+vy*tau,dir=Math.atan2(py,px),
     mx=Math.cos(dir)*24*planeScale/unit,my=Math.sin(dir)*24*planeScale/unit,
     dx=rx-mx,dy=ry-my;
   const b=2*(dx*vx+dy*vy),cc=dx*dx+dy*dy,d=b*b-4*A*cc;
   if(Math.abs(A)<1e-7){if(Math.abs(b)<1e-7)break;tau=-cc/b;}
   else if(d>=0){const q=Math.sqrt(d),t1=(-b-q)/(2*A),t2=(-b+q)/(2*A);tau=t1>0&&t2>0?Math.min(t1,t2):Math.max(t1,t2);}
   else break;
   if(!(tau>0&&tau<=2))return null;
 }
 return{x:enemy.x+enemy.vx*tau*unit,y:enemy.y+enemy.vy*tau*unit};
}
function drawVisualAids(l,r,top,bottom){
 if(game!=='play'||!player)return;
 if($('aimline').checked){
   const dx=Math.cos(player.a),dy=Math.sin(player.a),
     x=player.x+dx*26*planeScale,y=player.y+dy*26*planeScale,
     ts=[dx>1e-7?(r-x)/dx:dx< -1e-7?(l-x)/dx:Infinity,
         dy>1e-7?(bottom-y)/dy:dy< -1e-7?(top-y)/dy:Infinity].filter(t=>t>0),
     len=Math.min(...ts);
   if(Number.isFinite(len)){
     ctx.strokeStyle='rgba(255,255,255,.64)';ctx.lineWidth=2/cam.z;
     ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+dx*len,y+dy*len);ctx.stroke();
   }
 }
 if($('leadmarker').checked&&gunEnabled){const p=gunLeadPoint();if(p){
   ctx.strokeStyle='rgba(255,255,255,.95)';ctx.lineWidth=1.7/cam.z;
   ctx.beginPath();ctx.arc(p.x,p.y,7/cam.z,0,TWO);ctx.stroke();
 }}
}
function draw(){const bg=ctx.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#08182d');bg.addColorStop(1,'#24536b');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
 ctx.save();ctx.translate(W/2,H/2);ctx.scale(cam.z,cam.z);ctx.translate(-cam.x,-cam.y);const l=cam.x-W/(2*cam.z),r=cam.x+W/(2*cam.z),top=cam.y-H/(2*cam.z),bottom=cam.y+H/(2*cam.z);
 ctx.strokeStyle='#c7eaff16';ctx.lineWidth=1/cam.z;ctx.beginPath();for(let x=Math.floor(l/200)*200;x<r;x+=200){ctx.moveTo(x,top);ctx.lineTo(x,bottom)}for(let y=Math.floor(top/200)*200;y<bottom;y+=200){ctx.moveTo(l,y);ctx.lineTo(r,y)}ctx.stroke();
 ctx.save();ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=2/cam.z;ctx.setLineDash([18/cam.z,12/cam.z]);ctx.strokeRect(-12000,-4800,24000,9600);ctx.restore();
 drawVisualAids(l,r,top,bottom);
 for(const o of [player,enemy]){ctx.beginPath();o.trail.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.strokeStyle=o.color+'70';ctx.lineWidth=2/cam.z;ctx.stroke();drawPlane(o)}
 for(const b of bullets){ctx.strokeStyle=b.owner===player?'#ffe6a2':'#ff9a9e';ctx.lineWidth=2.5/cam.z;ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-b.vx*.028*unit,b.y-b.vy*.028*unit);ctx.stroke()}
 for(const m of missiles){ctx.save();ctx.globalAlpha=m.miss?clamp(1-m.missTime,0,1):1;ctx.strokeStyle=m.owner===player?'#ffd981':'#ff8497';ctx.lineWidth=3/cam.z;ctx.beginPath();m.trail.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.stroke();ctx.translate(m.x,m.y);ctx.rotate(m.a);ctx.fillStyle=m.type==='msl'?'#fff1bb':m.type==='6aamx'?'#e3a9ff':m.type==='hpaa'?'#ffcf85':m.type==='hcaa'?'#b7ffb6':m.type==='qaam'?'#d9b5ff':'#a8f7ff';ctx.beginPath();ctx.moveTo(12,0);ctx.lineTo(-8,-4);ctx.lineTo(-8,4);ctx.closePath();ctx.fill();ctx.restore()}
 for(const q of fx){ctx.fillStyle='#fff0a0';ctx.fillRect(q.x,q.y,3/cam.z,3/cam.z)}ctx.fillStyle='#ffda81';ctx.textAlign='center';ctx.font='bold 15px sans-serif';for(const q of texts)ctx.fillText(q.label,q.x,q.y);ctx.restore();
 ctx.fillStyle='#061423bb';ctx.fillRect(10,10,238,43);ctx.fillRect(552,10,238,43);ctx.fillStyle='#e5f4ff';ctx.font='bold 13px sans-serif';ctx.textAlign='left';ctx.fillText('PLAYER '+Math.ceil(player.hp)+'/'+maxHP,18,25);ctx.textAlign='right';ctx.fillText('AI '+Math.ceil(enemy.hp)+'/'+maxHP,782,25);ctx.fillStyle='#243b4b';ctx.fillRect(18,34,221,9);ctx.fillRect(561,34,221,9);ctx.fillStyle='#66dbf6';ctx.fillRect(18,34,221*player.hp/maxHP,9);ctx.fillStyle='#ff7185';ctx.fillRect(561,34,221*enemy.hp/maxHP,9);
 ctx.fillStyle='#061727df';ctx.beginPath();ctx.roundRect(12,65,204,108,13);ctx.fill();ctx.textAlign='left';ctx.fillStyle='#b3d6e8';ctx.font='bold 14px sans-serif';ctx.fillText('AIRSPEED',25,86);ctx.fillStyle=kmh(player)<STALL?'#ffb56f':kmh(player)<PSM_MAX?'#ffdf86':'#e7fbff';ctx.font='bold 43px sans-serif';ctx.fillText(String(Math.round(kmh(player))),23,131);ctx.font='bold 12px sans-serif';ctx.fillStyle='#c3dfed';ctx.fillText('km/h',150,125);ctx.fillStyle='#345367';ctx.fillRect(25,148,177,7);ctx.fillStyle='#69d8ff';ctx.fillRect(25,148,177*clamp(kmh(player)/SPEED_MAX,0,1),7);for(const k of [300,500,700,1200]){const x=25+177*k/SPEED_MAX;ctx.fillStyle=k===700?'#f8e48b':'#c4d9e8';ctx.fillRect(x-1,144,2,15);ctx.font='9px sans-serif';ctx.textAlign='center';ctx.fillText(String(k),x,166)}
 ctx.font='bold 16px sans-serif';ctx.textAlign='center';if(game==='play'&&time<SAFE){ctx.fillStyle='#ffdf86';ctx.fillText('WEAPONS SAFE '+(SAFE-time).toFixed(1)+'s',400,82)}if(game==='play'&&player.stall){ctx.fillStyle='#ffb76a';ctx.fillText('STALL — ACCELERATE TO 300 km/h',400,105)}if(game==='play'&&player.boost>0&&!player.stall){ctx.fillStyle='#a2fac1';ctx.fillText('POST-PSM BOOST '+player.boost.toFixed(1)+'s',400,108)}ctx.fillStyle='#d7e9f8';ctx.font='12px monospace';ctx.textAlign='right';ctx.fillText((gunEnabled?'GUN + ':'')+weapon.toUpperCase()+' | '+distance.toUpperCase()+' | '+time.toFixed(1)+'s',783,H-23)}
function loop(t){let dt=Math.min((t-last)/1000||0,.035);last=t;if(game==='play')update(dt);draw();requestAnimationFrame(loop)}
function settingsView(open){if(game!=='menu')return;UI.config.hidden=open;$('visual-settings').hidden=!open;$('open-settings').hidden=open;UI.start.hidden=open;UI.heading.textContent=open?'设置':'PSM GUNFIGHT v5.2.13';UI.message.textContent=open?'战场距离与视觉辅助':'2D AIR COMBAT — PLAYER VS AI'}
$('open-settings').onclick=()=>settingsView(true);$('settings-back').onclick=()=>settingsView(false);
function resume(){game='play';UI.overlay.hidden=true;UI.pause.textContent='暂停 Esc';release();cv.focus({preventScroll:true});mouseStatus();if($('mousepitch').checked)lockMouse()}
function openMenu(){game='menu';$('visual-settings').hidden=true;$('open-settings').hidden=false;UI.start.hidden=false;UI.heading.textContent='PSM GUNFIGHT v5.2.13';UI.message.textContent='2D AIR COMBAT — PLAYER VS AI';UI.config.hidden=false;UI.start.textContent='开始战斗';UI.restart.hidden=true;UI.menu.hidden=true;UI.overlay.hidden=false;UI.pause.textContent='暂停 Esc';release();unlockMouse()}
function pauseGame(){if(game==='play'){game='paused';UI.heading.textContent='PAUSED';UI.message.textContent='游戏已暂停';UI.config.hidden=true;UI.start.textContent='继续游戏';UI.restart.hidden=false;UI.menu.hidden=false;UI.overlay.hidden=false;UI.pause.textContent='继续 Esc';release();unlockMouse()}else if(game==='paused')resume()}
UI.start.onclick=()=>game==='paused'?resume():reset();UI.restart.onclick=reset;UI.menu.onclick=openMenu;UI.pause.onclick=pauseGame;
$('lockmouse').onclick=()=>mouseLocked()?unlockMouse():lockMouse();$('mousepitch').addEventListener('change',()=>{if(!$('mousepitch').checked)unlockMouse();else if(game==='play')lockMouse();else mouseStatus()});document.addEventListener('pointerlockchange',pointerLockChanged);document.addEventListener('pointerlockerror',()=>{pointerLockPending=false;$('mouse-status').textContent='鼠标锁定失败，请重试'});document.addEventListener('mousemove',moveMouse);
function fmt(code){if(!code)return '—';if(code.startsWith('Mouse'))return ['鼠标左键','鼠标中键','鼠标右键','鼠标侧键1','鼠标侧键2'][Number(code.slice(5))]||code;return {ArrowUp:'↑',ArrowDown:'↓',Space:'Space',ShiftLeft:'左Shift',ShiftRight:'右Shift'}[code]||code.replace('Key','')}
function bindingsUI(){const el=$('bindings');el.innerHTML='';for(const a of ['throttle','brake','up','down','psm','fire','missile']){const row=document.createElement('div');row.className='bindrow';const title=document.createElement('span');title.textContent={throttle:'加速',brake:'减速',up:'抬头',down:'压头',psm:'PSM',fire:'机炮',missile:'导弹'}[a];row.appendChild(title);for(let i=0;i<bindings[a].length;i++){const b=document.createElement('button');b.textContent=rebinding&&rebinding.a===a&&rebinding.i===i?'按键…':fmt(bindings[a][i]);b.onclick=()=>{rebinding={a,i};bindingsUI()};row.appendChild(b)}el.appendChild(row)}}
function bind(code){if(!rebinding)return;const {a,i}=rebinding;rebinding=null;for(const k in bindings)bindings[k]=bindings[k].map(v=>v===code?null:v);while(bindings[a].length<=i)bindings[a].push(null);bindings[a][i]=code;keys.clear();bindingsUI()}
$('settingstoggle').onclick=()=>{$('settings').hidden=!$('settings').hidden};$('resetbindings').onclick=()=>{bindings={up:['ArrowDown'],down:['ArrowUp'],throttle:['KeyW'],brake:['KeyS'],psm:['KeyX'],fire:['ShiftLeft','Mouse0','ShiftRight'],missile:['Space','Mouse2']};rebinding=null;bindingsUI()};bindingsUI();
function keydown(ev){if(rebinding){ev.preventDefault();if(ev.code==='Escape'){rebinding=null;bindingsUI()}else bind(ev.code);return}if(/INPUT|TEXTAREA|SELECT/.test(ev.target.tagName))return;if(ev.code==='Escape'){if(!ev.repeat&&(game==='play'||game==='paused')){ev.preventDefault();pauseGame()}return}if(game==='play'&&Object.values(bindings).some(a=>a.includes(ev.code))){ev.preventDefault();keys.add(ev.code)}}
function keyup(ev){keys.delete(ev.code);if(game==='play'&&Object.values(bindings).some(a=>a.includes(ev.code)))ev.preventDefault()}
window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',release);
cv.addEventListener('mousedown',ev=>{if(rebinding){ev.preventDefault();bind('Mouse'+ev.button)}else if(game==='play'){if($('mousepitch').checked&&!mouseLocked())lockMouse();const code='Mouse'+ev.button;if(Object.values(bindings).some(a=>a.includes(code))){ev.preventDefault();keys.add(code)}}});window.addEventListener('mouseup',ev=>keys.delete('Mouse'+ev.button));cv.addEventListener('contextmenu',ev=>ev.preventDefault());document.addEventListener('contextmenu',ev=>{if(mouseLocked())ev.preventDefault()});cv.addEventListener('mouseleave',()=>{if(!mouseLocked()){oldMouseY=null;mouseAmount=0}});
/* Prevent native press menus only on the gameplay surface and virtual keys; preserve footer links and settings. */
document.querySelectorAll('.controls, .screen, canvas, [data-k]').forEach(el=>{
  el.addEventListener('contextmenu',ev=>ev.preventDefault());
  el.addEventListener('selectstart',ev=>ev.preventDefault());
  el.addEventListener('dragstart',ev=>ev.preventDefault());
});
document.querySelectorAll('[data-k]').forEach(el=>{const k=el.dataset.k;el.addEventListener('pointerdown',ev=>{ev.preventDefault();el.setPointerCapture(ev.pointerId);touches[k]=true;el.classList.add('held')});const stop=()=>{touches[k]=false;el.classList.remove('held')};el.addEventListener('pointerup',stop);el.addEventListener('pointercancel',stop);el.addEventListener('lostpointercapture',stop)});
weapon='msl';player=plane(-305,185,-.18,'#66dfff');enemy=plane(305,-185,PI+.18,'#ff7890');requestAnimationFrame(loop);mouseStatus();
})();
