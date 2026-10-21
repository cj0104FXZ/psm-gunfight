/* PSM GUNFIGHT 5.4.1 — v5.3.2 gameplay with 6AAM launch modes and tactical HARD AI.
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
 let hardStyle='aggressive',aiPlanClock=0,aiPlan=null,aiPlanAge=0,aiThreatSeen=0,aiThreatKey='',aiTurnSample=0,aiPrevPlayerA=0,aiPlayerTurnRate=0;
 const aiDebug={plan:'LEGACY',score:0,threatTTC:Infinity,window:0,planMs:0,candidates:0,psmUseful:0};
 const combatStats={aiPsm:0,playerPsm:0,aiMissiles:0,playerMissiles:0,aiMissileHits:0,playerMissileHits:0,gunWindow:0,plans:{}};
let pad=null,touchDirectionControl=null,mouseDirectionControl=null;
const controls={up:false,down:false,throttle:false,brake:false,psm:false,fire:false,missile:false};
const plane=(x,y,a,color)=>{const v=ms(600);return{x,y,a,vx:v*Math.cos(a),vy:v*Math.sin(a),color,hp:maxHP,stall:false,psm:false,stage:'normal',psmDir:0,pt:0,pa:0,pcd:0,latch:false,boost:0,boostAngle:0,recover:0,recoverFrom:0,glideVector:a,boostVector:a,gunCD:0,slots:Array(WEAPONS[weapon].count).fill(0),nextSlot:0,mlatch:false,hit:0,shots:0,hits:0,trail:[]}};
function release(){if(pad)pad.suspend();if(touchDirectionControl)touchDirectionControl.reset();if(mouseDirectionControl)mouseDirectionControl.reset();keys.clear();touches={};lastCombo=false;lastPSM=false;mouseAmount=0;oldMouseY=null;Object.keys(controls).forEach(k=>controls[k]=false);document.querySelectorAll('.held').forEach(x=>x.classList.remove('held'))}
function input(){for(const a in controls)controls[a]=!!touches[a]?.size||bindings[a].some(k=>k&&keys.has(k))||!!pad?.state[a];const rawThrottle=controls.throttle,rawBrake=controls.brake,combo=rawThrottle&&rawBrake,psm=controls.psm;psmPulse=(combo&&!lastCombo)||(psm&&!lastPSM);lastCombo=combo;lastPSM=psm;controls.psm=psm||combo;controls.throttle=rawThrottle&&!rawBrake;controls.brake=rawBrake&&!rawThrottle;if(document.getElementById('mousepitch').checked&&$('mouse-steering').value==='pitch'){if(mouseAmount<-.45)controls.up=true;if(mouseAmount>.45)controls.down=true}if(mouseDirection.active)mouseDirectionControl?.update(false);let directional=null;for(const source of [mouseDirection,touchDirection,pad?.direction])if(source?.active&&(!directional||(source.updated||0)>=(directional.updated||0)))directional=source;if(directional&&player){const err=angle(directional.angle-player.a);if(Math.abs(err)>.035){controls.up=err<0;controls.down=err>0}else{controls.up=false;controls.down=false}}}
function updateStall(o){o.stall=o.stage==='normal'&&o.boost<=0&&kmh(o)<STALL}
function smooth(t){t=clamp(t,0,1);return t*t*(3-2*t)}
function recover(o){o.recover=.8;o.recoverFrom=Math.max(slipCap(kmh(o)),Math.abs(angle(Math.atan2(o.vy,o.vx)-o.a)))}
function enterPSM(o,dir){if(!psmReady(o)||o.pcd>0||o.latch)return false;o.psm=true;if(o===enemy)combatStats.aiPsm++;else if(o===player)combatStats.playerPsm++;if(psmMode==='ac7')o.latch=true;o.stage=psmMode==='ac7'?'glide':'easy';o.psmDir=dir;o.pt=0;o.pa=0;o.boost=0;o.boostAngle=0;o.recover=0;o.glideVector=Math.atan2(o.vy,o.vx);o.boostVector=o.glideVector;updateStall(o);return true}
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
 if(mouseLocked()){mouseStatus();mouseDirectionControl?.ahead();return}if(pointerLockPending){mouseStatus();return}
 if(typeof cv.requestPointerLock!=='function'){$('mouse-status').textContent='浏览器不支持锁定鼠标';return}
 pointerLockPending=true;
 try{const request=cv.requestPointerLock();if(request&&typeof request.catch==='function')request.catch(()=>{pointerLockPending=false;$('mouse-status').textContent='无法锁定，请点击游戏画面重试'})}
 catch(err){pointerLockPending=false;$('mouse-status').textContent='无法锁定，请点击游戏画面重试'}
}
function pointerLockChanged(){pointerLockPending=false;mouseAmount=0;oldMouseY=null;mouseStatus()}
function moveMouse(ev){
 if(mouseDirectionControl?.move(ev))return;
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
function reset(){resetMissileWarnings();level=UI.difficulty.value;hardProfile=migrateHardProfile($('hard-style')?.value);hardStyle=HARD_PROFILES[hardProfile].style;weapon=UI.loadout.value.replace(/-nogun$/,'');gunEnabled=!UI.loadout.value.endsWith('-nogun');document.querySelector('[data-k="fire"]').classList.toggle('disabled',!gunEnabled);distance=$('distance').value;psmMode=$('psmmode').value;maxHP=Number($('hp').value);unit=distance==='far'?1.43:1;planeScale=distance==='far'?.58:1;hitScale=distance==='far'?.56:1;let dx=distance==='far'?420:305,dy=distance==='far'?220:185;player=plane(-dx,dy,-.18,'#66dfff');enemy=plane(dx,-dy,PI+.18,'#ff7890');bullets=[];missiles=[];fx=[];texts=[];cam={x:0,y:0,z:distance==='far'?.77:1};time=0;aiAim=PI;aiThink=0;aiGunCD=.3;aiMissileCD=2;aiMode='pursuit';aiDecision=0;aiCommit=0;aiPsmRemain=0;aiPsmWait=1.4;aiBurst=0;aiRest=0;aiSpeedBias=0;aiSpeedTarget=0;aiSpeedClock=0;aiSpeedResponse=0;aiPlanClock=0;aiPlan=null;aiPlanAge=0;aiThreatSeen=0;aiThreatKey='';aiPrevPlayerA=player.a;aiPlayerTurnRate=0;Object.assign(aiDebug,{plan:'LEGACY',score:0,threatTTC:Infinity,window:0,planMs:0,candidates:0,psmUseful:0});Object.assign(combatStats,{aiPsm:0,playerPsm:0,aiMissiles:0,playerMissiles:0,aiMissileHits:0,playerMissileHits:0,gunWindow:0,plans:{}});initializeSelectedAI();game='play';UI.overlay.hidden=true;UI.pause.textContent='暂停 Esc';release();cv.focus({preventScroll:true});mouseStatus();if($('mousepitch').checked)lockMouse()}
function psmReady(o){return !o.stall&&o.stage==='normal'&&kmh(o)>=STALL&&kmh(o)<PSM_MAX&&o.pcd<=0}
function endPSM(o,forced){quitPSM(o,forced,true)}
function turnRate(k){if(k<STALL)return .12;const d=(k-700)/285;return .91+.50*Math.exp(-d*d)}
function slipCap(k){return (60-44*smooth((k-STALL)/(SPEED_MAX-STALL)))*RAD*.5}
function intercept(shooter,target){const dx=target.x-shooter.x,dy=target.y-shooter.y,vx=target.vx-shooter.vx,vy=target.vy-shooter.vy;const A=vx*vx+vy*vy-355*355,B=2*(dx*vx+dy*vy),C=dx*dx+dy*dy;let t=NaN;if(Math.abs(A)<1e-7){if(Math.abs(B)>1e-7)t=-C/B}else{const D=B*B-4*A*C;if(D>=0){const z=Math.sqrt(D),valid=[(-B-z)/(2*A),(-B+z)/(2*A)].filter(a=>a>0);if(valid.length)t=Math.min(...valid)}}return clamp(t>0?t:Math.hypot(dx,dy)/355,0,2.8)}
function legacyAI(dt){const o=enemy,t=player,dx=t.x-o.x,dy=t.y-o.y,d=Math.hypot(dx,dy),easy=level==='easy',hard=level==='hard',raw=angle(Math.atan2(dy,dx)-o.a),absRaw=Math.abs(raw),v=kmh(o);
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

/* v5.4 shared prediction and finite-candidate tactical planner. Prediction advances a
   detached plane through the same movePlane() function and suppresses weapon effects. */
function cloneFlightState(o){const q={...o,slots:o.slots.slice(),trail:[]};return q}
function advanceFlightState(state,control,dt){movePlane(state,{up:false,down:false,throttle:false,brake:false,psm:false,...control,fire:false,missile:false},dt);state.trail.length=0;return state}
function solveIntercept(shooter,target,life=2,muzzle=24*planeScale){const rx=(target.x-shooter.x)/unit,ry=(target.y-shooter.y)/unit,ux=target.vx-shooter.vx,uy=target.vy-shooter.vy,s=355,A=ux*ux+uy*uy-s*s;let tau=-1,mx=0,my=0;for(let n=0;n<3;n++){const x=rx-mx,y=ry-my,B=2*(x*ux+y*uy),C=x*x+y*y;if(Math.abs(A)<1e-7){tau=Math.abs(B)>1e-7?-C/B:-1}else{const D=B*B-4*A*C;if(D<0)return null;const q=Math.sqrt(D),a=(-B-q)/(2*A),b=(-B+q)/(2*A);tau=a>0&&b>0?Math.min(a,b):Math.max(a,b)}if(!(tau>0&&tau<=life))return null;const aim=Math.atan2(y+uy*tau,x+ux*tau);mx=Math.cos(aim)*muzzle/unit;my=Math.sin(aim)*muzzle/unit}return{time:tau,angle:Math.atan2(ry-my+uy*tau,rx-mx+ux*tau),x:target.x+target.vx*tau*unit,y:target.y+target.vy*tau*unit}}
let threatSerial=0;
const HARD_WEIGHTS={aggressive:{window:.20,hit:.35,position:.20,future:.10,energy:.15},pressure:{window:.35,hit:.15,position:.20,future:.20,energy:.10}};
const PLAN_NAMES=['NORMAL_TRACK','INTERCEPT','FLANK','PSM_SETUP','SNAP_PSM','HOLD_DRIFT','DRIFT_TO_BOOST','EXIT_PSM','RECOVER','EVADE_RECOVER'];
function targetHypothesis(base,dt,turnRate){const q={...base};q.a=angle(q.a+turnRate*dt);const speed=spd(q),va=Math.atan2(q.vy,q.vx)+turnRate*dt*.55;q.vx=Math.cos(va)*speed;q.vy=Math.sin(va)*speed;q.x+=q.vx*dt*unit;q.y+=q.vy*dt*unit;return q}
function gun(o){const spread=o===enemy?(level==='hard'?.045:level==='easy'?.065:.009):.025,a=o.a+(Math.random()-.5)*spread,ca=Math.cos(a),sa=Math.sin(a);bullets.push({x:o.x+ca*24*planeScale,y:o.y+sa*24*planeScale,vx:o.vx+ca*355,vy:o.vy+sa*355,life:2,owner:o});o.shots++}
function sixAAMLaunchMode(o){const s=spd(o);if(s<1)return'DIRECT';return Math.abs(angle(o.a-Math.atan2(o.vy,o.vx)))<=SIX_AAM_DRIFT_THRESHOLD+1e-10?'DIRECT':'DRIFT'}
function launch(o){const w=WEAPONS[weapon],t=o===player?enemy:player,dx=t.x-o.x,dy=t.y-o.y;if(Math.hypot(dx,dy)>1500*unit||Math.abs(angle(Math.atan2(dy,dx)-o.a))>(w.launchAngle??w.cone))return false;let slot=-1;for(let i=0;i<o.slots.length;i++){const n=(o.nextSlot+i)%o.slots.length;if(o.slots[n]<=0){slot=n;break}}if(slot<0)return false;const ca=Math.cos(o.a),sa=Math.sin(o.a);let x=o.x+ca*30*planeScale,y=o.y+sa*30*planeScale,vx,vy,launchMode=null;if(w.initial!==undefined){vx=ca*w.initial;vy=sa*w.initial}else{const s=spd(o),extra=distance==='far'?0:ms(50);vx=o.vx+(s>1?o.vx/s*extra:ca*extra);vy=o.vy+(s>1?o.vy/s*extra:sa*extra);launchMode=sixAAMLaunchMode(o);if(launchMode==='DIRECT'){const initialSpeed=Math.hypot(vx,vy);vx=ca*initialSpeed;vy=sa*initialSpeed}let side=slot%2===0?-1:1;x-=sa*side*11*planeScale;y+=ca*side*11*planeScale}missiles.push({x,y,a:o.a,vx,vy,age:0,owner:o,target:t,type:weapon,launchMode,trail:[],miss:false,missTime:0});if(o===enemy)combatStats.aiMissiles++;else if(o===player)combatStats.playerMissiles++;o.slots[slot]=w.reload;o.nextSlot=(slot+1)%o.slots.length;return true}
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
/* Original missile flight arithmetic, shared by real simulation and detached
   forecasts. Returns 0=MISS/coast, 1=expired coast, 2=active/collidable.
   No damage, effects, UI, global missile arrays or target-state mutations. */
function advanceGuidedMissile(m,dt){
 const w=WEAPONS[m.type];
 if(m.miss){m.x+=m.vx*dt*unit;m.y+=m.vy*dt*unit;m.missTime+=dt;return m.missTime>=1?1:0}
 m.age+=dt;
 if(m.age>=w.life){m.miss=true;m.missTime=0;m.x+=m.vx*dt*unit;m.y+=m.vy*dt*unit;m.missTime+=dt;return 0}
 if(m.age>=w.ignition){const desired=Math.atan2(m.target.y-m.y,m.target.x-m.x),err=angle(desired-m.a);if(Math.abs(err)>w.cone){m.miss=true;m.missTime=0}else m.a=angle(m.a+clamp(err,-w.turn*dt,w.turn*dt))}
 if(m.miss){m.x+=m.vx*dt*unit;m.y+=m.vy*dt*unit;m.missTime+=dt;return 0}
 if(m.age>=w.ignition){if(w.initial!==undefined){const v=Math.min(w.max,spd(m)+w.accel*dt);m.vx=Math.cos(m.a)*v;m.vy=Math.sin(m.a)*v}else{m.vx+=Math.cos(m.a)*w.accel*dt;m.vy+=Math.sin(m.a)*w.accel*dt;let v=spd(m);if(v>w.max){m.vx*=w.max/v;m.vy*=w.max/v;v=w.max}if(v>1){const duration=m.launchMode==='DRIFT'?5.5:0,t=duration?clamp(m.age/duration,0,1):1,cap=duration?Math.PI*Math.pow(1-t*t,2):0,va=Math.atan2(m.vy,m.vx),dir=duration?m.a+clamp(angle(va-m.a),-cap,cap):m.a;m.vx=Math.cos(dir)*v;m.vy=Math.sin(dir)*v}}}
 m.x+=m.vx*dt*unit;m.y+=m.vy*dt*unit;return 2;
}
function moveMissile(m,dt){
 const w=WEAPONS[m.type],x=m.x,y=m.y,wasMiss=m.miss,status=advanceGuidedMissile(m,dt);
 if(!wasMiss&&m.miss)texts.push({x,y,life:.7,label:'MISS'});
 if(wasMiss||status===2){m.trail.push({x:m.x,y:m.y});if(m.trail.length>30)m.trail.shift()}
 if(status===2&&lineHit(x,y,m.x,m.y,m.target,21*hitScale)){recordDefenseMissileHit(m);if(m.owner===enemy)combatStats.aiMissileHits++;else if(m.owner===player)combatStats.playerMissileHits++;damage(m.target,w.damage,m.x,m.y);return true}
 return status===1;
}

function update(dt){time+=dt;input();movePlane(player,{...controls,psmPulse},dt);let aiC=selectedAI(dt);movePlane(enemy,aiC,dt);if(level==='hard')observeSelectedTactics(aiC,dt);
 for(let i=bullets.length-1;i>=0;i--){const b=bullets[i],x=b.x,y=b.y;b.x+=b.vx*dt*unit;b.y+=b.vy*dt*unit;b.life-=dt;const t=b.owner===player?enemy:player;if(lineHit(x,y,b.x,b.y,t,17*hitScale)){b.owner.hits++;bullets.splice(i,1);damage(t,5,b.x,b.y);if(game!=='play')break}else if(b.life<=0)bullets.splice(i,1)}
 if(game==='play')for(let i=missiles.length-1;i>=0;i--){if(moveMissile(missiles[i],dt))missiles.splice(i,1);if(game!=='play')break}
 observeSelectedDefense(dt);
 for(let i=fx.length-1;i>=0;i--){let q=fx[i];q.x+=q.vx*dt*unit;q.y+=q.vy*dt*unit;q.life-=dt;if(q.life<=0)fx.splice(i,1)}for(let i=texts.length-1;i>=0;i--){texts[i].life-=dt;if(texts[i].life<=0)texts.splice(i,1)}
 const d=Math.hypot(player.x-enemy.x,player.y-enemy.y),z=clamp(580/(d+160),distance==='far'?.24:.33,distance==='far'?.86:1.15),rate=Math.min(1,dt*3);cam.z+=(z-cam.z)*Math.min(1,dt*2.5);cam.x+=((player.x+enemy.x)/2-cam.x)*rate;cam.y+=((player.y+enemy.y)/2-cam.y)*rate;
 UI.state.textContent=player.stall?'STALL':player.stage==='glide'?'GLIDE':player.stage==='acboost'?'AC BOOST':player.stage==='easy'?'PSM':player.boost>0?'BOOST '+player.boost.toFixed(1):player.recover>0?'RECOVER':'NORMAL';UI.slip.textContent=Math.round(Math.abs(angle(Math.atan2(player.vy,player.vx)-player.a))/RAD)+'°';UI.ammo.textContent=player.slots.map(x=>x<=0?'●':Math.ceil(x)+'s').join(' ');if($('psmstatus'))$('psmstatus').textContent=player.stall?'STALL':player.stage!=='normal'?player.pt.toFixed(1)+'s':player.latch?'RELEASE':psmReady(player)?'READY':'LOCK';selectedAIDebug();mouseAmount*=Math.pow(.12,dt*8)}
function drawPlane(o){ctx.save();ctx.translate(o.x,o.y);ctx.rotate(o.a);ctx.scale(planeScale,planeScale);ctx.shadowColor=o.color;ctx.shadowBlur=8;ctx.fillStyle=o.hit?'#fff':o.color;ctx.beginPath();ctx.moveTo(26,0);ctx.lineTo(7,-5);ctx.lineTo(-9,-5);ctx.lineTo(-18,-12);ctx.lineTo(-24,-12);ctx.lineTo(-21,-3);ctx.lineTo(-30,-3);ctx.lineTo(-30,4);ctx.lineTo(7,5);ctx.closePath();ctx.fill();ctx.fillStyle='#17394d';ctx.fillRect(0,-5,10,4);if(o.stage!=='normal'||o.boost>0){ctx.strokeStyle=o.stage!=='normal'?'#ffe28c':'#9df7a9';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,32,-.7,.7);ctx.stroke()}ctx.restore();if(o.stall){ctx.fillStyle='#ffba6b';ctx.font='bold 13px sans-serif';ctx.textAlign='center';ctx.fillText('STALL',o.x,o.y-34)}}
/* Visual assistance: lead is the real ballistic intercept of a 355-unit/s cannon shot.
   A bullet inherits the player's velocity; each projectile and plane is scaled by `unit` per frame. */
function gunLeadPoint(){
 if(!player||!enemy||!gunEnabled)return null;const hit=solveIntercept(player,enemy,2);return hit?{x:hit.x,y:hit.y}:null;
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
/* Screen-space HUD only. No writes to aircraft, missile or AI state. */
const missileWarningHUD={ids:new WeakMap(),nextId:0,groups:[],camera:null};
function resetMissileWarnings(){missileWarningHUD.groups=[];missileWarningHUD.camera=null}
function warningScreenEntry(x,y,vx,vy){
 let enter=0,exit=1.25;
 for(const [p,v,size] of [[x,vx,W],[y,vy,H]]){
   if(Math.abs(v)<1e-7){if(p<0||p>size)return null;continue}
   let a=-p/v,b=(size-p)/v;if(a>b)[a,b]=[b,a];enter=Math.max(enter,a);exit=Math.min(exit,b);if(enter>exit)return null;
 }
 return enter>0&&enter<=1.25?enter:null;
}
function warningEligible(m){
 const w=WEAPONS[m.type];
 return !!(w&&m.owner===enemy&&m.target===player&&!m.miss&&m.age>=w.ignition&&m.age<w.life&&
   Number.isFinite(m.x)&&Number.isFinite(m.y)&&Number.isFinite(m.vx)&&Number.isFinite(m.vy)&&
   Math.abs(angle(Math.atan2(player.y-m.y,player.x-m.x)-m.a))<=w.cone);
}
function warningRisk(m,sx,sy,cameraVelocity){
 // Tangent prediction is only a short-lived warning cue: live guidance/camera
 // changes are re-evaluated every frame; it does not promise a future entry.
 const vx=m.vx*unit*cam.z-cameraVelocity.x*cam.z+(m.x-cam.x)*cameraVelocity.z,
       vy=m.vy*unit*cam.z-cameraVelocity.y*cam.z+(m.y-cam.y)*cameraVelocity.z,
       entry=warningScreenEntry(sx,sy,vx,vy);
 const reentry=entry===null?0:entry<=1?.85+.15*(1-entry):.85*(1.25-entry)/.25;
 const rx=m.x-player.x,ry=m.y-player.y,rvx=(m.vx-player.vx)*unit,rvy=(m.vy-player.vy)*unit,
       d=Math.hypot(rx,ry),vv=rvx*rvx+rvy*rvy,closing=-(rx*rvx+ry*rvy)/(d||1),
       t=vv>1?-(rx*rvx+ry*rvy)/vv:-1,
       cpa=t>0?Math.hypot(rx+rvx*t,ry+rvy*t):Infinity;
 const threat=t>0&&t<1.6&&closing>0?clamp(1-cpa/(140*hitScale+30),0,1)*clamp((1.6-t)/.8,0,1)*clamp(closing/(200*unit),0,1):0;
 return{urgency:clamp(Math.max(reentry,threat),0,1),entry};
}
function collectMissileWarnings(dt){
 const hud=missileWarningHUD,previousCamera=hud.camera;
 hud.camera={x:cam.x,y:cam.y,z:cam.z};
 if(game!=='play'||!$('missile-warning').checked){hud.groups=[];return hud.groups}
 // Ignore camera teleports (restart/test setup), not ordinary camera motion.
 const valid=previousCamera&&dt>0&&Math.hypot(cam.x-previousCamera.x,cam.y-previousCamera.y)<800&&Math.abs(cam.z-previousCamera.z)<.15;
 const cameraVelocity=valid?{x:(cam.x-previousCamera.x)/dt,y:(cam.y-previousCamera.y)/dt,z:(cam.z-previousCamera.z)/dt}:{x:0,y:0,z:0};
 const points=[];
 for(const m of missiles){
   if(!warningEligible(m))continue;
   const sx=W/2+(m.x-cam.x)*cam.z,sy=H/2+(m.y-cam.y)*cam.z;
   if(sx>=0&&sx<=W&&sy>=0&&sy<=H)continue;
   let id=hud.ids.get(m);if(id===undefined){id=++hud.nextId;hud.ids.set(m,id)}
   const a=(Math.atan2(sy-H/2,sx-W/2)+TWO)%TWO,risk=warningRisk(m,sx,sy,cameraVelocity);
   points.push({id,a,urgency:risk.urgency,entry:risk.entry});
 }
 points.sort((a,b)=>a.a-b.a);
 const clusters=[],gap=.12;
 for(const p of points){const tail=clusters[clusters.length-1];if(tail&&p.a-tail[0].a<=gap)tail.push(p);else clusters.push([p])}
 if(clusters.length>1&&clusters[0].at(-1).a+TWO-clusters[clusters.length-1][0].a<=gap){clusters[0]=clusters.pop().concat(clusters[0])}
 const used=new Set(),mix=1-Math.exp(-Math.max(0,dt)*7),next=[];
 for(const cluster of clusters){
   const ids=cluster.map(p=>p.id),desired=Math.atan2(cluster.reduce((s,p)=>s+Math.sin(p.a),0),cluster.reduce((s,p)=>s+Math.cos(p.a),0));
   let old=null,best=0;
   for(const group of hud.groups){if(used.has(group))continue;const common=group.ids.filter(id=>ids.includes(id)).length;if(common>best){best=common;old=group}}
   if(!old)old=hud.groups.find(g=>!used.has(g)&&Math.abs(angle(g.a-desired))<gap)||null;
   if(old)used.add(old);
   const target=Math.max(...cluster.map(p=>p.urgency)),delta=old?angle(desired-old.a):0,
     a=old&&Math.abs(delta)<.22?angle(old.a+delta*(1-Math.exp(-dt*16))):desired,
     urgency=old?old.urgency+(target-old.urgency)*mix:0,
     phase=((old?.phase||0)+Math.max(0,dt)*TWO*(1+2*urgency))%TWO,
     pulse=.5+.5*Math.sin(phase),count=cluster.length,
     alpha=clamp(.32+.13*urgency+(.24+.12*urgency)*pulse+Math.min(count-1,3)*.025,.32,.9),
     width=2.2+.65*urgency+Math.min(count-1,3)*.18;
   next.push({ids,a,urgency,phase,count,alpha,width,frequency:1+2*urgency,entry:Math.min(...cluster.map(p=>p.entry??Infinity))});
 }
 // Only live offscreen members survive: no fading ghosts after MISS/removal/entry.
 hud.groups=next;return next;
}
function warningEdgePoint(a){
 const inset=6,radius=24,ax=W/2-inset,ay=H/2-inset,dx=Math.cos(a),dy=Math.sin(a);
 let t=Math.min(ax/Math.max(Math.abs(dx),1e-9),ay/Math.max(Math.abs(dy),1e-9));
 if(Math.abs(dx*t)>ax-radius&&Math.abs(dy*t)>ay-radius){
   const cx=Math.sign(dx)*(ax-radius),cy=Math.sign(dy)*(ay-radius),b=dx*cx+dy*cy,D=b*b-cx*cx-cy*cy+radius*radius;
   if(D>=0)t=b+Math.sqrt(D);
 }
 return{x:W/2+dx*t,y:H/2+dy*t};
}
function drawOffscreenMissileWarnings(dt){
 const groups=collectMissileWarnings(dt);if(!groups.length)return;
 ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#ff7185';ctx.shadowColor='#ff7185';
 for(const group of groups){
   const middle=warningEdgePoint(group.a),radius=Math.hypot(middle.x-W/2,middle.y-H/2),half=(12+Math.min(group.count-1,3)*2)/radius;
   ctx.globalAlpha=group.alpha;ctx.lineWidth=group.width;ctx.shadowBlur=5+group.urgency*3;ctx.beginPath();
   for(let i=0;i<=12;i++){const p=warningEdgePoint(group.a-half+half*2*i/12);if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y)}ctx.stroke();
 }
 ctx.restore();
}

function draw(dt=0){const bg=ctx.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#08182d');bg.addColorStop(1,'#24536b');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
 ctx.save();ctx.translate(W/2,H/2);ctx.scale(cam.z,cam.z);ctx.translate(-cam.x,-cam.y);const l=cam.x-W/(2*cam.z),r=cam.x+W/(2*cam.z),top=cam.y-H/(2*cam.z),bottom=cam.y+H/(2*cam.z);
 ctx.strokeStyle='#c7eaff16';ctx.lineWidth=1/cam.z;ctx.beginPath();for(let x=Math.floor(l/200)*200;x<r;x+=200){ctx.moveTo(x,top);ctx.lineTo(x,bottom)}for(let y=Math.floor(top/200)*200;y<bottom;y+=200){ctx.moveTo(l,y);ctx.lineTo(r,y)}ctx.stroke();
 ctx.save();ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=2/cam.z;ctx.setLineDash([18/cam.z,12/cam.z]);ctx.strokeRect(-12000,-4800,24000,9600);ctx.restore();
 drawVisualAids(l,r,top,bottom);
 for(const o of [player,enemy]){ctx.beginPath();o.trail.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.strokeStyle=o.color+'70';ctx.lineWidth=2/cam.z;ctx.stroke();drawPlane(o)}
 for(const b of bullets){ctx.strokeStyle=b.owner===player?'#ffe6a2':'#ff9a9e';ctx.lineWidth=2.5/cam.z;ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-b.vx*.028*unit,b.y-b.vy*.028*unit);ctx.stroke()}
 for(const m of missiles){ctx.save();ctx.globalAlpha=m.miss?clamp(1-m.missTime,0,1):1;ctx.strokeStyle=m.owner===player?'#ffd981':'#ff8497';ctx.lineWidth=3/cam.z;ctx.beginPath();m.trail.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.stroke();ctx.translate(m.x,m.y);ctx.rotate(m.a);ctx.fillStyle=m.type==='msl'?'#fff1bb':m.type==='6aamx'?'#e3a9ff':m.type==='hpaa'?'#ffcf85':m.type==='hcaa'?'#b7ffb6':m.type==='qaam'?'#d9b5ff':'#a8f7ff';ctx.beginPath();ctx.moveTo(12,0);ctx.lineTo(-8,-4);ctx.lineTo(-8,4);ctx.closePath();ctx.fill();ctx.restore()}
 for(const q of fx){ctx.fillStyle='#fff0a0';ctx.fillRect(q.x,q.y,3/cam.z,3/cam.z)}ctx.fillStyle='#ffda81';ctx.textAlign='center';ctx.font='bold 15px sans-serif';for(const q of texts)ctx.fillText(q.label,q.x,q.y);ctx.restore();drawMouseDirectionCursor();drawOffscreenMissileWarnings(dt);
 ctx.fillStyle='#061423bb';ctx.fillRect(10,10,238,43);ctx.fillRect(552,10,238,43);ctx.fillStyle='#e5f4ff';ctx.font='bold 13px sans-serif';ctx.textAlign='left';ctx.fillText('PLAYER '+Math.ceil(player.hp)+'/'+maxHP,18,25);ctx.textAlign='right';ctx.fillText('AI '+Math.ceil(enemy.hp)+'/'+maxHP,782,25);ctx.fillStyle='#243b4b';ctx.fillRect(18,34,221,9);ctx.fillRect(561,34,221,9);ctx.fillStyle='#66dbf6';ctx.fillRect(18,34,221*player.hp/maxHP,9);ctx.fillStyle='#ff7185';ctx.fillRect(561,34,221*enemy.hp/maxHP,9);
 ctx.fillStyle='#061727df';ctx.beginPath();ctx.roundRect(12,65,204,108,13);ctx.fill();ctx.textAlign='left';ctx.fillStyle='#b3d6e8';ctx.font='bold 14px sans-serif';ctx.fillText('AIRSPEED',25,86);ctx.fillStyle=kmh(player)<STALL?'#ffb56f':kmh(player)<PSM_MAX?'#ffdf86':'#e7fbff';ctx.font='bold 43px sans-serif';ctx.fillText(String(Math.round(kmh(player))),23,131);ctx.font='bold 12px sans-serif';ctx.fillStyle='#c3dfed';ctx.fillText('km/h',150,125);ctx.fillStyle='#345367';ctx.fillRect(25,148,177,7);ctx.fillStyle='#69d8ff';ctx.fillRect(25,148,177*clamp(kmh(player)/SPEED_MAX,0,1),7);for(const k of [300,500,700,1200]){const x=25+177*k/SPEED_MAX;ctx.fillStyle=k===700?'#f8e48b':'#c4d9e8';ctx.fillRect(x-1,144,2,15);ctx.font='9px sans-serif';ctx.textAlign='center';ctx.fillText(String(k),x,166)}
 ctx.font='bold 16px sans-serif';ctx.textAlign='center';if(game==='play'&&time<SAFE){ctx.fillStyle='#ffdf86';ctx.fillText('WEAPONS SAFE '+(SAFE-time).toFixed(1)+'s',400,82)}if(game==='play'&&player.stall){ctx.fillStyle='#ffb76a';ctx.fillText('STALL — ACCELERATE TO 300 km/h',400,105)}if(game==='play'&&player.boost>0&&!player.stall){ctx.fillStyle='#a2fac1';ctx.fillText('POST-PSM BOOST '+player.boost.toFixed(1)+'s',400,108)}ctx.fillStyle='#d7e9f8';ctx.font='12px monospace';ctx.textAlign='right';ctx.fillText((gunEnabled?'GUN + ':'')+weapon.toUpperCase()+' | '+distance.toUpperCase()+' | '+time.toFixed(1)+'s',783,H-23)}
function loop(t){let dt=Math.min((t-last)/1000||0,.035);last=t;pad.poll(t);if(game==='play')update(dt);draw(dt);requestAnimationFrame(loop)}
function settingsView(open){if(game!=='menu')return;cv.parentElement.classList.toggle('settings-open',open);UI.config.hidden=open;$('visual-settings').hidden=!open;$('open-settings').hidden=open;UI.start.hidden=open;UI.heading.textContent=open?'设置':'PSM GUNFIGHT v5.4.1';UI.message.textContent=open?'战场距离、视觉辅助与手柄配置':'2D AIR COMBAT — PLAYER VS AI'}
$('open-settings').onclick=()=>settingsView(true);$('settings-back').onclick=()=>settingsView(false);
/* Profile selection only: do not change either generation's algorithms. */
const HARD_PROFILES=Object.freeze({
 assault:{label:'强袭 ASSAULT',generation:'historical',style:'aggressive'},
 hunter:{label:'猎杀 HUNTER',generation:'historical',style:'pressure'},
 skirmisher:{label:'游击 SKIRMISHER',generation:'current',style:'aggressive'},
 tactician:{label:'战术 TACTICIAN',generation:'current',style:'pressure'}
});
let hardProfile='assault',historicalHardController=null;
function migrateHardProfile(value){return value==='aggressive'?'skirmisher':value==='pressure'?'tactician':Object.hasOwn(HARD_PROFILES,value)?value:'assault'}
function historicalHardSelected(){return level==='hard'&&HARD_PROFILES[hardProfile].generation==='historical'}
function initializeSelectedAI(){
 historicalHardController=null;missileDefense=null;tactics=null;
 if(historicalHardSelected())historicalHardController=createHistoricalHardAI(hardStyle);
 else{resetMissileDefense();resetTactics()}
}
function selectedAI(dt){return historicalHardSelected()?historicalHardController.step(dt):ai(dt)}
function observeSelectedTactics(c,dt){if(historicalHardSelected())historicalHardController.observe(c,dt);else observeTactics(c,dt)}
function observeSelectedDefense(dt){if(!historicalHardSelected())observeMissileDefense(dt)}
function selectedAIDebug(){
 if(historicalHardSelected())historicalHardController.renderDebug();else updateAIDebug();
 const panel=$('ai-debug-panel');if(panel&&!panel.hidden)panel.textContent=(level==='hard'?HARD_PROFILES[hardProfile].label:level.toUpperCase())+panel.textContent.replace(/^[^|]*\|/,' |');
}

const visualStorage='psm-gunfight.visual.v1';
try{const s=JSON.parse(localStorage.getItem(visualStorage));if(s){if(['near','far'].includes(s.distance))$('distance').value=s.distance;for(const id of ['aimline','leadmarker','ai-debug'])$(id).checked=s[id]===true;$('missile-warning').checked=s['missile-warning']!==false;$('hard-style').value=migrateHardProfile(s.hardProfile??s.hardStyle);}}catch(e){}
function saveVisualSettings(){try{localStorage.setItem(visualStorage,JSON.stringify({distance:$('distance').value,aimline:$('aimline').checked,leadmarker:$('leadmarker').checked,'ai-debug':$('ai-debug').checked,'missile-warning':$('missile-warning').checked,hardProfile:$('hard-style').value}));}catch(e){}}
for(const id of ['distance','aimline','leadmarker','ai-debug','hard-style','missile-warning'])$(id).addEventListener('change',saveVisualSettings);
function hardStyleVisibility(){$('hard-style-row').hidden=UI.difficulty.value!=='hard'}UI.difficulty.addEventListener('change',hardStyleVisibility);hardStyleVisibility();
function resume(){game='play';UI.overlay.hidden=true;UI.pause.textContent='暂停 Esc';release();cv.focus({preventScroll:true});mouseStatus();if($('mousepitch').checked)lockMouse()}
function openMenu(){cv.parentElement.classList.remove('settings-open');game='menu';$('visual-settings').hidden=true;$('open-settings').hidden=false;UI.start.hidden=false;UI.heading.textContent='PSM GUNFIGHT v5.4.1';UI.message.textContent='2D AIR COMBAT — PLAYER VS AI';UI.config.hidden=false;UI.start.textContent='开始战斗';UI.restart.hidden=true;UI.menu.hidden=true;UI.overlay.hidden=false;UI.pause.textContent='暂停 Esc';release();unlockMouse()}
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
document.querySelectorAll('[data-k]').forEach(el=>{const k=el.dataset.k;el.addEventListener('pointerdown',ev=>{ev.preventDefault();el.setPointerCapture(ev.pointerId);if(!touches[k])touches[k]=new Set();touches[k].add(ev.pointerId);el.classList.add('held')});const stop=ev=>{touches[k]?.delete(ev.pointerId);if(!touches[k]?.size)el.classList.remove('held')};el.addEventListener('pointerup',stop);el.addEventListener('pointercancel',stop);el.addEventListener('lostpointercapture',stop)});
/* v5.3.2: mouse direction steering uses a virtual reticle under Pointer Lock. */
const mouseDirection={active:false,armed:false,angle:0,strength:1,updated:0,x:W/2,y:H/2};
function createMouseDirectionControl(){
 const mode=$('mouse-steering'),storage='psm-gunfight.mouse-steering.v1';
 try{const saved=localStorage.getItem(storage);if(saved==='direction'||saved==='pitch')mode.value=saved;}catch(e){}
 function enabled(){return game==='play'&&$('mousepitch').checked&&mode.value==='direction';}
 function playerScreen(){return{x:W/2+(player.x-cam.x)*cam.z,y:H/2+(player.y-cam.y)*cam.z};}
 function update(mark=true){if(!player)return;const p=playerScreen(),dx=mouseDirection.x-p.x,dy=mouseDirection.y-p.y;if(Math.hypot(dx,dy)<8){mouseDirection.active=false;return;}mouseDirection.angle=Math.atan2(dy,dx);mouseDirection.strength=1;mouseDirection.active=enabled()&&mouseDirection.armed;if(mark)mouseDirection.updated=performance.now();}
 function ahead(){if(!player)return;const p=playerScreen(),distance=Math.min(W,H)*.28;mouseDirection.x=clamp(p.x+Math.cos(player.a)*distance,14,W-14);mouseDirection.y=clamp(p.y+Math.sin(player.a)*distance,14,H-14);mouseDirection.armed=false;update();}
 function move(ev){if(!enabled())return false;if(mouseLocked()){mouseDirection.x=clamp(mouseDirection.x+(ev.movementX||0)*1.25,14,W-14);mouseDirection.y=clamp(mouseDirection.y+(ev.movementY||0)*1.25,14,H-14);}else if(ev.target===cv){const r=cv.getBoundingClientRect();mouseDirection.x=clamp((ev.clientX-r.left)*W/r.width,14,W-14);mouseDirection.y=clamp((ev.clientY-r.top)*H/r.height,14,H-14);}mouseDirection.armed=true;update();return true;}
 function reset(){mouseDirection.active=false;mouseDirection.armed=false;mouseDirection.strength=0;}
 mode.addEventListener('change',()=>{try{localStorage.setItem(storage,mode.value);}catch(e){}if(mode.value==='direction'&&game==='play')ahead();else reset();$('invert').closest('label').classList.toggle('disabled',mode.value==='direction');});
 document.addEventListener('pointerlockchange',()=>{if(mouseLocked()&&enabled())ahead();else if(!mouseLocked())reset();});
 $('mousepitch').addEventListener('change',()=>{if($('mousepitch').checked&&mode.value==='direction'&&game==='play')ahead();else if(!$('mousepitch').checked)reset();});
 $('invert').closest('label').classList.toggle('disabled',mode.value==='direction');
 return{move,reset,ahead,update};
}
function drawMouseDirectionCursor(){
 if(!mouseDirection.active||!mouseLocked()||$('mouse-steering').value!=='direction'||game!=='play')return;
 ctx.save();ctx.strokeStyle='rgba(142,231,255,.92)';ctx.fillStyle='rgba(142,231,255,.12)';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(mouseDirection.x,mouseDirection.y,11,0,TWO);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(mouseDirection.x-17,mouseDirection.y);ctx.lineTo(mouseDirection.x-6,mouseDirection.y);ctx.moveTo(mouseDirection.x+6,mouseDirection.y);ctx.lineTo(mouseDirection.x+17,mouseDirection.y);ctx.moveTo(mouseDirection.x,mouseDirection.y-17);ctx.lineTo(mouseDirection.x,mouseDirection.y-6);ctx.moveTo(mouseDirection.x,mouseDirection.y+6);ctx.lineTo(mouseDirection.x,mouseDirection.y+17);ctx.stroke();ctx.restore();
}

/* v5.3.1 mobile direction stick: target heading is converted to original digital pitch actions. */
const touchDirection={active:false,angle:0,strength:0,pointer:null,updated:0};
function createTouchDirectionControl(){
 const wrap=$('direction-controls'),stick=$('touch-stick'),knob=$('touch-stick-knob'),mode=$('mobile-steering'),storage='psm-gunfight.touch-steering.v1';
 try{const value=localStorage.getItem(storage);if(value==='direction'||value==='pitch')mode.value=value;}catch(e){}
 function apply(){document.body.classList.toggle('touch-direction-mode',mode.value==='direction');wrap.setAttribute('aria-hidden',mode.value!=='direction');touchDirection.active=false;touchDirection.strength=0;touchDirection.pointer=null;knob.style.transform='translate(0,0)';try{localStorage.setItem(storage,mode.value);}catch(e){}}
 function move(ev){if(touchDirection.pointer!==ev.pointerId)return;const r=stick.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=ev.clientX-cx,dy=ev.clientY-cy,max=r.width*.36,m=Math.hypot(dx,dy),scale=m>max?max/m:1,x=dx*scale,y=dy*scale;knob.style.transform=`translate(${x}px,${y}px)`;touchDirection.strength=Math.min(1,m/max);touchDirection.active=touchDirection.strength>.15;touchDirection.angle=Math.atan2(dy,dx);touchDirection.updated=performance.now();}
 function stop(ev){if(touchDirection.pointer!==ev.pointerId)return;touchDirection.pointer=null;touchDirection.active=false;touchDirection.strength=0;knob.style.transform='translate(0,0)';}
 stick.addEventListener('pointerdown',ev=>{if(mode.value!=='direction')return;ev.preventDefault();touchDirection.pointer=ev.pointerId;stick.setPointerCapture(ev.pointerId);move(ev);});stick.addEventListener('pointermove',move);stick.addEventListener('pointerup',stop);stick.addEventListener('pointercancel',stop);stick.addEventListener('lostpointercapture',stop);mode.addEventListener('change',apply);apply();
 return {reset(){touchDirection.pointer=null;touchDirection.active=false;touchDirection.strength=0;knob.style.transform='translate(0,0)';}};
}

/* v5.3.1: visible remapping, per-device profiles and optional direction steering. */
function createGamepadAdapter() {
 const actions=['down','up','throttle','brake','psm','fire','missile','pause'];
 const names={down:'压头',up:'抬头',throttle:'加速',brake:'减速',psm:'PSM',fire:'机炮',missile:'导弹',pause:'暂停 / 继续'};
 const storageKey='psm-gunfight.gamepad.v2',legacyKey='psm-gunfight.gamepad.v1',templateKey='__standard_template__';
 const defaults=()=>({deadzone:.2,sensitivity:1,invert:false,threshold:.35,steering:'pitch',directionX:{kind:'axis',index:0,dir:1},directionY:{kind:'axis',index:1,dir:1},bindings:{down:{kind:'axis',index:1,dir:-1},up:{kind:'axis',index:1,dir:1},throttle:{kind:'button',index:7},brake:{kind:'button',index:6},psm:{kind:'button',index:5},fire:{kind:'button',index:0},missile:{kind:'button',index:1},pause:{kind:'button',index:9}}});
 let saved={profiles:{[templateKey]:defaults()},active:'all'},devices=[],editing=templateKey,capture=null,blocked=false,wasPause=false,navHeld='',navNext=0,uiKey='',storageError=false;
 const state=Object.fromEntries(actions.map(a=>[a,false])),direction={active:false,angle:0,strength:0,updated:0};
 const template={index:-1,id:'通用标准手柄模板',mapping:'standard',connected:false,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({value:0,pressed:false})),synthetic:true};
 const key=p=>p.synthetic?templateKey:`${p.id}|${p.mapping}|${p.axes.length}|${p.buttons.length}`,clone=o=>JSON.parse(JSON.stringify(o));
 function validBinding(b){return b&&['button','axis','trigger'].includes(b.kind)&&Number.isInteger(b.index)&&b.index>=0&&b.index<256&&(b.kind==='button'||b.dir===1||b.dir===-1)&&(b.kind!=='trigger'||Number.isFinite(b.rest));}
 function clean(p){const d=defaults();if(!p||typeof p!=='object')return d;for(const a of actions){if(p.bindings&&p.bindings[a]===null)d.bindings[a]=null;else if(p.bindings&&validBinding(p.bindings[a]))d.bindings[a]={...p.bindings[a]};}for(const n of ['directionX','directionY'])if(validBinding(p[n])&&p[n].kind==='axis')d[n]={...p[n]};for(const [n,lo,hi] of [['deadzone',.05,.5],['sensitivity',.5,2],['threshold',.1,.95]])if(Number.isFinite(p[n]))d[n]=Math.min(hi,Math.max(lo,p[n]));d.invert=p.invert===true;d.steering=p.steering==='direction'?'direction':'pitch';return d;}
 try{const raw=localStorage.getItem(storageKey),old=!raw&&localStorage.getItem(legacyKey),s=JSON.parse(raw||old);if(s&&s.profiles){saved.active=typeof s.active==='string'?s.active:'all';for(const k of Object.keys(s.profiles))saved.profiles[k]=clean(s.profiles[k]);if(!saved.profiles[templateKey])saved.profiles[templateKey]=defaults();}}catch(e){storageError=true;}
 function profile(p){return saved.profiles[key(p)]||saved.profiles[templateKey]||defaults();}
 function editProfile(p){const k=key(p);if(!saved.profiles[k])saved.profiles[k]=clone(saved.profiles[templateKey]||defaults());return saved.profiles[k];}
 function save(){try{localStorage.setItem(storageKey,JSON.stringify(saved));storageError=false;}catch(e){storageError=true;}}
 function clear(){for(const a of actions)state[a]=false;direction.active=false;direction.strength=0;}
 function suspend(){clear();blocked=true;navHeld='';}
 function button(p,i){const b=p.buttons[i];return b?(Number.isFinite(b.value)?b.value:b.pressed?1:0):0;}
 function value(p,b,c){if(!b)return 0;if(b.kind==='button')return button(p,b.index);let v=p.axes[b.index];if(!Number.isFinite(v))return 0;if(b.kind==='trigger')return Math.max(0,(v-b.rest)*b.dir/Math.max(.001,1-b.rest*b.dir));return Math.min(1,Math.max(0,(v*b.dir-c.deadzone)/(1-c.deadzone))*c.sensitivity);}
 function axisRaw(p,b){const v=p.axes[b?.index];return Number.isFinite(v)?v*(b.dir||1):0;}
 function isPS(p){return /playstation|dualshock|dualsense|sony|054c/i.test(p?.id||'');}
 function buttonName(i,p){const n=isPS(p)?['×','○','□','△','L1','R1','L2','R2','Share','Options','L3','R3','十字键↑','十字键↓','十字键←','十字键→','PS']:['A','B','X','Y','LB','RB','LT','RT','Back','Start','LS','RS','十字键↑','十字键↓','十字键←','十字键→','Home'];return p?.mapping==='standard'?(n[i]||`按钮 ${i}`):`按钮 ${i}`;}
 function label(b,p){if(!b)return '未绑定';if(b.kind==='button')return buttonName(b.index,p);if(b.kind==='axis')return `轴 ${b.index} ${b.dir>0?'+':'−'}`;return `扳机轴 ${b.index} ${b.dir>0?'+':'−'}（静止 ${b.rest.toFixed(2)}）`;}
 function encode(b){return b?JSON.stringify(b):'';}
 function decode(s){try{const b=JSON.parse(s);return validBinding(b)?b:null;}catch(e){return null;}}
 function options(select,p,current,axesOnly=false){select.replaceChildren();if(!axesOnly)select.add(new Option('未绑定',''));const buttons=p.synthetic?17:p.buttons.length,axes=p.synthetic?4:p.axes.length;if(!axesOnly)for(let i=0;i<buttons;i++)select.add(new Option(buttonName(i,p),encode({kind:'button',index:i})));for(let i=0;i<axes;i++)for(const dir of [-1,1])select.add(new Option(`轴 ${i} ${dir>0?'+':'−'}`,encode({kind:'axis',index:i,dir})));const wanted=encode(current);if(wanted&&!Array.from(select.options).some(o=>o.value===wanted))select.add(new Option(label(current,p),wanted));select.value=wanted;}
 const host=$('gamepad-settings');
 host.innerHTML='<h3>手柄与指向操控</h3><p id="gp-status" aria-live="polite"></p><label>参与控制的设备<select id="gp-active"></select></label><label>正在编辑的配置<select id="gp-device"></select></label><p id="gp-mapping"></p><label>摇杆操控方式<select id="gp-steering"><option value="pitch">传统俯仰：上推压头、下拉抬头</option><option value="direction">指向飞行：飞机朝摇杆方向转向</option></select></label><div id="gp-direction"><div class="gp-row"><span>方向水平轴</span><select id="gp-direction-x"></select><button id="gp-listen-x" type="button">监听</button></div><div class="gp-row"><span>方向垂直轴</span><select id="gp-direction-y"></select><button id="gp-listen-y" type="button">监听</button></div></div><h4>动作绑定</h4><div id="gp-bindings"></div><label>监听输入类型<select id="gp-kind"><option value="auto">自动识别</option><option value="axis">摇杆轴</option><option value="trigger">扳机轴（先完全松开）</option></select></label><p id="gp-capture" aria-live="polite"></p><button id="gp-cancel" type="button" hidden>取消监听</button><label>摇杆死区 <output id="gp-deadzone-value"></output><input id="gp-deadzone" type="range" min="0.05" max="0.5" step="0.01"></label><label>摇杆灵敏度 <output id="gp-sensitivity-value"></output><input id="gp-sensitivity" type="range" min="0.5" max="2" step="0.05"></label><label><input id="gp-invert" type="checkbox"> 反转传统俯仰的轴 1</label><label>扳机 / 按钮阈值 <output id="gp-threshold-value"></output><input id="gp-threshold" type="range" min="0.1" max="0.95" step="0.05"></label><button id="gp-reset" type="button">恢复当前配置默认值</button><p class="gp-help">无需先连接手柄：可直接编辑“通用标准手柄模板”的下拉选项。连接后选择具体设备，可按“监听”再按下按钮、摇杆或扳机。指向飞行只改变输入解释，仍使用原有转向率；键盘俯仰始终可用。标准手柄菜单：十字键/左摇杆导航，A 确认，B 返回。</p>';
 function selected(){if(editing===templateKey)return template;return devices.find(p=>key(p)===editing)||template;}
 function cancel(message=''){capture=null;$('gp-cancel').hidden=true;$('gp-capture').textContent=message;renderBindings();suspend();}
 function begin(target){const p=selected();if(p.synthetic){$('gp-capture').textContent='通用模板请直接使用下拉框选择；连接实体手柄后可使用监听。';return;}capture={target,index:p.index,key:key(p),kind:$('gp-kind').value,axes:Array.from(p.axes),buttons:p.buttons.map((_,i)=>button(p,i)),start:performance.now(),prevAxes:Array.from(p.axes)};$('gp-capture').textContent=`等待“${target==='directionX'?'方向水平轴':target==='directionY'?'方向垂直轴':names[target]}”输入：请释放其他输入后再操作（Esc 取消，15 秒超时）。`;$('gp-cancel').hidden=false;renderBindings();clear();}
 function setBinding(target,b){const p=selected(),c=editProfile(p);if(target==='directionX'||target==='directionY'){if(b?.kind!=='axis')return;c[target]=b;}else{for(const other of actions){const old=c.bindings[other];if(old&&b&&old.kind===b.kind&&old.index===b.index&&(b.kind==='button'||old.dir===b.dir))c.bindings[other]=null;}c.bindings[target]=b;}save();sync();suspend();}
 function renderBindings(){const box=$('gp-bindings'),p=selected(),c=profile(p);box.replaceChildren();for(const a of actions){const row=document.createElement('div');row.className='gp-row';const title=document.createElement('span');title.textContent=names[a];const select=document.createElement('select');options(select,p,c.bindings[a]);select.onchange=()=>setBinding(a,decode(select.value));const listen=document.createElement('button');listen.type='button';listen.textContent=capture?.target===a?'等待…':'监听';listen.disabled=p.synthetic;listen.onclick=()=>begin(a);row.append(title,select,listen);box.append(row);}}
 function sync(){const p=selected(),c=profile(p);$('gp-steering').value=c.steering;$('gp-direction').hidden=c.steering!=='direction';options($('gp-direction-x'),p,c.directionX,true);options($('gp-direction-y'),p,c.directionY,true);$('gp-listen-x').disabled=p.synthetic;$('gp-listen-y').disabled=p.synthetic;for(const n of ['deadzone','sensitivity','threshold']){$('gp-'+n).value=c[n];$('gp-'+n+'-value').textContent=c[n].toFixed(2);}$('gp-invert').checked=c.invert;$('gp-mapping').textContent=p.synthetic?'通用标准布局：不连接手柄也能完整设置。连接后可另存设备专属配置。':p.mapping==='standard'?'标准映射；可使用下拉框或监听输入。':'非标准映射；建议逐项使用监听输入，扳机可能需要选择“扳机轴”。';renderBindings();}
 function refreshUI(force=false){const signature=devices.map(p=>`${p.index}:${key(p)}`).join(';')+'|'+saved.active+'|'+storageError;if(!force&&signature===uiKey)return;uiKey=signature;const active=$('gp-active'),editor=$('gp-device');active.replaceChildren(new Option('全部已连接手柄','all'));editor.replaceChildren(new Option('通用标准手柄模板',templateKey));for(const p of devices){active.add(new Option(`#${p.index+1} ${p.id}`,key(p)));editor.add(new Option(`#${p.index+1} ${p.id}`,key(p)));}active.value=saved.active;if(active.selectedIndex<0){active.add(new Option('已选择设备暂未连接',saved.active));active.value=saved.active;}if(editing!==templateKey&&!devices.some(p=>key(p)===editing))editing=templateKey;editor.value=editing;$('gp-status').textContent=(typeof navigator.getGamepads!=='function'?'此浏览器不支持 Gamepad API；仍可编辑通用模板。':devices.length?`已连接 ${devices.length} 个手柄。`:'当前未检测到手柄；通用模板仍可编辑并会用于新设备。')+(storageError?' 本地存储不可用，本次会话配置仍有效。':'');sync();}
 function finishBinding(b){if(!capture)return;const target=capture.target,p=selected();setBinding(target,b);capture=null;$('gp-cancel').hidden=true;$('gp-capture').textContent=`已绑定“${target==='directionX'?'方向水平轴':target==='directionY'?'方向垂直轴':names[target]}”：${label(b,p)}`;renderBindings();}
 function detectCapture(now){const p=devices.find(p=>p.index===capture.index&&key(p)===capture.key);if(!p||now-capture.start>15000){cancel(p?'监听超时，请重试。':'设备已断开，监听已取消。');return;}const axesOnly=capture.target==='directionX'||capture.target==='directionY';if(!axesOnly)for(let i=0;i<p.buttons.length;i++){const v=button(p,i);if(v>.65&&capture.buttons[i]<=.65){finishBinding({kind:'button',index:i});return;}capture.buttons[i]=v;}for(let i=0;i<p.axes.length;i++){const v=p.axes[i],rest=capture.axes[i]??0,previous=capture.prevAxes[i]??rest,trigger=!axesOnly&&(capture.kind==='trigger'||(capture.kind==='auto'&&p.mapping!=='standard'&&Math.abs(rest)>.9));if(trigger){const delta=v-rest;if(Math.abs(delta)>.65&&Math.abs(previous-rest)<=.65){finishBinding({kind:'trigger',index:i,rest,dir:Math.sign(delta)});return;}}else if(Math.abs(v)>.65&&Math.abs(previous)<=.65){finishBinding({kind:'axis',index:i,dir:Math.sign(v)});return;}capture.prevAxes[i]=v;}}
 function menu(p,now){if(!p||game==='play')return;const b=i=>button(p,i)>.5,axis=p.axes[1]||0,nav=b(12)||axis<-.6?'up':b(13)||axis>.6?'down':b(14)?'left':b(15)?'right':b(0)?'ok':b(1)?'back':'';if(!nav){navHeld='';return;}if(nav===navHeld&&(now<navNext||nav==='ok'||nav==='back'))return;navNext=now+(nav===navHeld?170:400);navHeld=nav;const visible=el=>el.getClientRects().length&&!el.disabled,items=Array.from(UI.overlay.querySelectorAll('button,select,input')).filter(visible),current=document.activeElement;if(nav==='back'){if(!$('visual-settings').hidden)settingsView(false);else if(game==='paused')resume();return;}if(nav==='ok'){if(current&&items.includes(current)){if(current.tagName==='SELECT'){current.selectedIndex=(current.selectedIndex+1)%current.options.length;current.dispatchEvent(new Event('change'));}else current.click();}else items[0]?.focus();return;}if((nav==='left'||nav==='right')&&current&&items.includes(current)){const d=nav==='left'?-1:1;if(current.tagName==='SELECT'){current.selectedIndex=(current.selectedIndex+d+current.options.length)%current.options.length;current.dispatchEvent(new Event('change'));}else if(current.type==='range'){current.value=Number(current.value)+d*Number(current.step||1);current.dispatchEvent(new Event('input'));}return;}if(items.length){let n=items.indexOf(current);n=(n+(nav==='up'?-1:1)+items.length)%items.length;items[n].focus();items[n].scrollIntoView({block:'nearest'});}}
 function poll(now){let next=[];try{next=typeof navigator.getGamepads==='function'?Array.from(navigator.getGamepads()).filter(p=>p&&p.connected):[];}catch(e){clear();$('gp-status').textContent='浏览器禁止访问手柄；请检查权限。通用模板仍可编辑。';return;}devices=next;refreshUI();clear();if(document.hidden||!document.hasFocus()){blocked=true;return;}if(capture){detectCapture(now);wasPause=true;return;}const active=devices.filter(p=>saved.active==='all'||key(p)===saved.active);for(const p of active){const c=profile(p);for(const a of actions){if(c.steering==='direction'&&(a==='up'||a==='down'))continue;let v=value(p,c.bindings[a],c);if(c.invert&&c.bindings[a]?.kind==='axis'&&c.bindings[a].index===1)v=value({...p,axes:p.axes.map((x,i)=>i===1?-x:x)},c.bindings[a],c);if(v>=(c.bindings[a]?.kind==='axis'?.45:c.threshold))state[a]=true;}if(c.steering==='direction'){let x=axisRaw(p,c.directionX),y=axisRaw(p,c.directionY),m=Math.hypot(x,y);if(m>c.deadzone&&m>direction.strength){m=Math.min(1,(m-c.deadzone)/(1-c.deadzone)*c.sensitivity);direction.active=true;direction.strength=m;direction.angle=Math.atan2(y,x);direction.updated=now;}}}if(blocked){const held=actions.some(a=>state[a])||direction.active;clear();wasPause=false;if(!held){blocked=false;navHeld='';}return;}if(state.pause&&!wasPause&&(game==='play'||game==='paused'))pauseGame();wasPause=state.pause;if(game!=='play')menu(active[0],now);}
 $('gp-active').onchange=()=>{saved.active=$('gp-active').value;save();cancel();};$('gp-device').onchange=()=>{editing=$('gp-device').value;cancel();sync();};$('gp-steering').onchange=()=>{editProfile(selected()).steering=$('gp-steering').value;save();sync();suspend();};$('gp-direction-x').onchange=()=>setBinding('directionX',decode($('gp-direction-x').value));$('gp-direction-y').onchange=()=>setBinding('directionY',decode($('gp-direction-y').value));$('gp-listen-x').onclick=()=>begin('directionX');$('gp-listen-y').onclick=()=>begin('directionY');$('gp-cancel').onclick=()=>cancel();
 for(const n of ['deadzone','sensitivity','threshold'])$('gp-'+n).oninput=()=>{editProfile(selected())[n]=Number($('gp-'+n).value);$('gp-'+n+'-value').textContent=editProfile(selected())[n].toFixed(2);save();suspend();};$('gp-invert').onchange=()=>{editProfile(selected()).invert=$('gp-invert').checked;save();suspend();};$('gp-reset').onclick=()=>{saved.profiles[key(selected())]=defaults();save();cancel('已恢复当前配置的默认值。');sync();};
 window.addEventListener('keydown',e=>{if(capture&&e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();cancel('监听已取消。');}},true);window.addEventListener('gamepaddisconnected',e=>{devices=devices.filter(p=>p.index!==e.gamepad.index);clear();if(capture?.index===e.gamepad.index)cancel('设备已断开，监听已取消。');refreshUI(true);});window.addEventListener('gamepadconnected',()=>{uiKey='';});document.addEventListener('visibilitychange',()=>{if(document.hidden){release();if(game==='play')pauseGame();}});
 refreshUI(true);return {state,direction,poll,suspend};
}

// v5.4.1: finite-horizon scoring and legal, interruptible PSM tactical phases.
const SIX_AAM_DRIFT_THRESHOLD=30*RAD;
const MPC_STEPS=15,MPC_GAMMA=.95,MPC_DISCOUNT_SUM=(1-Math.pow(MPC_GAMMA,MPC_STEPS))/(1-MPC_GAMMA);
let tactics;
function resetTactics(){tactics={stage:'NORMAL',age:0,progressClock:0,progressWindow:0,stagnant:0,lastDistance:0,previousStage:'normal',lastExit:-99,holdRun:0,maxHoldRun:0,stats:{setupStarts:0,setupCompleted:0,glideEntries:0,acboostEntries:0,holdSeconds:0,earlyExits:0,continuousPsm:0,emergencyInterrupts:0},events:[],reason:'initial',best:'',bestScore:0};aiTurnSample=0}
function tacticalEvent(reason){tactics.reason=reason;tactics.events.push({time:Number(time.toFixed(2)),speed:Number(kmh(enemy).toFixed(1)),stage:tactics.stage,reason});if(tactics.events.length>32)tactics.events.shift()}
function setTacticalStage(stage,reason){if(stage===tactics.stage)return;tactics.stage=stage;tactics.age=0;tacticalEvent(reason)}
function psmBlockReason(o){if(o.stage!=='normal')return o.stage;if(o.latch)return'INPUT_LATCH';if(o.pcd>0)return'COOLDOWN';if(o.stall)return'STALL';if(kmh(o)<STALL)return'SPEED_LOW';if(kmh(o)>=PSM_MAX)return'SPEED_HIGH';return'READY'}
function effectiveAim(o,t){const lead=gunEnabled?solveIntercept(o,t,2):null;return lead?lead.angle:Math.atan2(t.y-o.y,t.x-o.x)}
function stableTailThreat(){const d=Math.hypot(player.x-enemy.x,player.y-enemy.y),ownError=Math.abs(angle(Math.atan2(player.y-enemy.y,player.x-enemy.x)-enemy.a)),theirError=Math.abs(angle(effectiveAim(player,enemy)-player.a));return d<850&&ownError>2.2&&theirError<.18}
function attackQuality(o,t){const d=Math.hypot(t.x-o.x,t.y-o.y),err=Math.abs(angle(effectiveAim(o,t)-o.a)),w=WEAPONS[weapon],gun=gunEnabled&&o.gunCD<=.105&&d<800?clamp(1-err/.14,0,1):0,lock=Math.abs(angle(Math.atan2(t.y-o.y,t.x-o.x)-o.a)),ready=o.slots.some(s=>s<=0),missile=ready&&d>150&&d<1100&&lock<=(w.launchAngle??w.cone)?clamp(1-lock/(w.launchAngle??w.cone),0,1)*clamp(1-Math.abs(d-550)/850,0,1):0;return{window:gunEnabled?Math.max(gun,missile*.45):missile,hit:gunEnabled?gun*.75+missile*.25:missile,gun,missile}}
function candidateControl(name,o,t,step,threat,turnSign=1){
 if(name==='EVADE_RECOVER'&&threat)return defenseControl(threat.controlSpec||{sign:turnSign,variant:'TURN'},o,threat);
 let desired=effectiveAim(o,t),throttle=false,brake=false,psm=false;const v=kmh(o),los=Math.atan2(t.y-o.y,t.x-o.x),d=Math.hypot(t.x-o.x,t.y-o.y);
 if(name==='NORMAL_TRACK')desired=los;
 if(name==='FLANK')desired=angle(los+turnSign*.65*clamp(d/600,.25,1));
 if(name==='PSM_SETUP'){brake=v>430;throttle=v<350;if(o.stage!=='normal')name='HOLD_DRIFT';else if(v<PSM_MAX&&psmReady(o)&&!o.latch)name='SNAP_PSM'}
 if(name==='SNAP_PSM'){
   if(o.stage==='normal'){psm=psmReady(o)&&!o.latch;brake=v>=PSM_MAX;throttle=v<350}
   else {name='HOLD_DRIFT';psm=true}
 }
 if(name==='HOLD_DRIFT'||name==='DRIFT_TO_BOOST'){
   psm=o.stage!=='normal';throttle=v<420||o.stage==='acboost';
   // Opposite pitch is a manual exit, so hold instead of oscillating around aim.
   let e=angle(desired-o.a);if(Math.abs(e)<(hardStyle==='pressure'?7:5)*RAD||o.stage!=='normal'&&Math.sign(e)!==o.psmDir)desired=o.a;
 }
 if(name==='RECOVER'){psm=false;throttle=v<660;desired=angle(los+turnSign*.25)}
 if(name==='EXIT_PSM'&&o.stage!=='normal'){
   if(psmMode==='ac7')return{up:o.psmDir===1,down:o.psmDir===-1,throttle:true,brake:false,psm:false,fire:false,missile:false};
   return{up:false,down:false,throttle:true,brake:false,psm:false,fire:false,missile:false};
 }
 if(name==='EVADE_RECOVER'&&threat){desired=angle(Math.atan2(threat.m.vy,threat.m.vx)+turnSign*PI/2);throttle=true;psm=false;if(o.stage!=='normal'&&psmMode==='ac7')return{up:o.psmDir===1,down:o.psmDir===-1,throttle:true,brake:false,psm:false,fire:false,missile:false}}
 const err=angle(desired-o.a),dead=3*RAD;let up=err< -dead,down=err>dead;
 if(name==='SNAP_PSM'&&psm&&up===down){up=turnSign<0;down=!up}
 if(!['PSM_SETUP','SNAP_PSM','HOLD_DRIFT','DRIFT_TO_BOOST','EVADE_RECOVER','RECOVER'].includes(name)){throttle=v<600;brake=v>780;const closing=((t.x-o.x)*(o.vx-t.vx)+(t.y-o.y)*(o.vy-t.vy))/(d||1);if(d<220&&closing>70)brake=true}
 return{up,down,throttle:throttle&&!brake,brake,psm,fire:false,missile:false}
}
function candidateSpecs(threat){
 if(threat)return[{name:'EVADE_RECOVER',sign:1},{name:'EVADE_RECOVER',sign:-1}];
 if(stableTailThreat()&&enemy.stage!=='normal')return[{name:'EXIT_PSM',sign:1}];
 if(enemy.stage!=='normal')return[{name:'HOLD_DRIFT',sign:1},{name:'DRIFT_TO_BOOST',sign:1},{name:'EXIT_PSM',sign:1}];
 const specs=[{name:'NORMAL_TRACK',sign:1},{name:'INTERCEPT',sign:1},{name:'FLANK',sign:1},{name:'FLANK',sign:-1}];
 if(enemy.boost>0||enemy.recover>0||enemy.latch)specs.push({name:'RECOVER',sign:1});
 else if(psmReady(enemy)&&!stableTailThreat())specs.push({name:'SNAP_PSM',sign:Math.sign(angle(effectiveAim(enemy,player)-enemy.a))||1});
 else if(kmh(enemy)>=PSM_MAX&&setupGeometry())specs.push({name:'PSM_SETUP',sign:1});
 // Digital controls can make different headings produce the exact same horizon.
 // Compete once per actual trajectory rather than once per cosmetic plan name.
 const seen=new Set();return specs.filter(spec=>{const o=cloneFlightState(enemy);for(let k=0;k<15;k++)advanceFlightState(o,candidateControl(spec.name,o,player,k,null,spec.sign),.1);const key=[o.x.toFixed(1),o.y.toFixed(1),o.a.toFixed(3),o.stage,o.latch].join('|');if(seen.has(key))return false;seen.add(key);return true});
}
function setupGeometry(){const d=Math.hypot(player.x-enemy.x,player.y-enemy.y),e=Math.abs(angle(effectiveAim(enemy,player)-enemy.a)),playerAim=Math.abs(angle(Math.atan2(enemy.y-player.y,enemy.x-player.x)-player.a)),quality=attackQuality(enemy,player);return d<1100&&d>100&&e>.14&&e<2.7&&quality.window<.65&&!(playerAim<.18&&e>2.2)}
function scoreCandidate(spec,threat){
 if(threat)return defenseRollout(enemy,spec,threat.records||[threat.record||{m:threat.m,id:0}],2.4).score;
 const weights=HARD_WEIGHTS[hardStyle],scores=[];
 for(const turn of [0,aiPlayerTurnRate]){
   const o=cloneFlightState(enemy);let t={...player},win=0,hit=0,pos=0,future=0,energy=0,risk=0,discount=1;
   for(let k=0;k<MPC_STEPS;k++){
     const c=candidateControl(spec.name,o,t,k,threat,spec.sign);advanceFlightState(o,c,.1);t=targetHypothesis(t,.1,turn);
     const q=attackQuality(o,t),d=Math.hypot(t.x-o.x,t.y-o.y),los=Math.atan2(t.y-o.y,t.x-o.x),facing=Math.cos(angle(los-o.a)),opponent=Math.cos(angle(los+PI-t.a));
     win+=discount*q.window;hit+=discount*q.hit;pos+=discount*clamp((facing-opponent+2)/4,0,1);future+=discount*(psmReady(o)?.8:o.stage!=='normal'?.65:.35);energy+=discount*clamp((kmh(o)-300)/500,0,1);
     risk+=discount*(d<65*hitScale?2:opponent>.97&&d<600?.25:0);
     discount*=MPC_GAMMA;
   }
   scores.push((weights.window*win+weights.hit*hit+weights.position*pos+weights.future*future+weights.energy*energy-risk)/MPC_DISCOUNT_SUM);
 }
 let score=.7*(scores[0]+scores[1])/2+.3*Math.min(...scores);
 // Only this candidate uses a coarse, longer horizon to value completing real preparation.
 if(spec.name==='PSM_SETUP'){
   const o=cloneFlightState(enemy);let t={...player},value=0,baseline=0;
   const normal=cloneFlightState(enemy);
   for(let k=0;k<30;k++){advanceFlightState(o,candidateControl('PSM_SETUP',o,t,k,null,1),.1);advanceFlightState(normal,candidateControl('INTERCEPT',normal,t,k,null,1),.1);t=targetHypothesis(t,.1,aiPlayerTurnRate);if(k>=15){value+=attackQuality(o,t).window;baseline+=attackQuality(normal,t).window}}
   const angleGain=Math.abs(angle(effectiveAim(normal,t)-normal.a))-Math.abs(angle(effectiveAim(o,t)-o.a));
   score+=clamp((value-baseline)/15*.30+angleGain/PI*.25,-.2,.3);
 }
 if(tactics.stagnant>2.5&&spec.name!=='NORMAL_TRACK'&&spec.name!=='INTERCEPT')score+=.035;
 return Number.isFinite(score)?score:-1e6;
}
function choosePlan(best,current,currentScore,age,emergency){if(emergency)return true;if(!current)return true;if(age<.3)return false;return best.score>currentScore+Math.max(.012,Math.abs(currentScore)*.12)}
function planHard(threat){
 const start=performance.now(),specs=candidateSpecs(threat),ranked=specs.map(s=>({...s,score:scoreCandidate(s,threat)})).sort((a,b)=>b.score-a.score),best=ranked[0]||{name:'INTERCEPT',sign:1,score:0};
 const currentLegal=aiPlan&&specs.some(s=>s.name===aiPlan.name&&s.sign===aiPlan.sign),currentScore=currentLegal?scoreCandidate(aiPlan,threat):-Infinity;
 tactics.best=best.name;tactics.bestScore=best.score;let next=best,reason='score hysteresis';
 if(tactics.stage==='SETUP'&&!threat&&setupGeometry()&&kmh(enemy)>=PSM_MAX&&tactics.age<2.3&&aiPlan?.name==='PSM_SETUP'){next={...aiPlan,score:currentScore};reason='bounded setup commitment'}
 else if(tactics.stage==='SETUP'&&!threat&&psmReady(enemy)&&!enemy.latch){next={name:'SNAP_PSM',sign:Math.sign(angle(effectiveAim(enemy,player)-enemy.a))||1,score:scoreCandidate({name:'SNAP_PSM',sign:1},null)};reason='setup completed';tactics.stats.setupCompleted++}
 else if(enemy.stage==='glide'&&!threat&&!stableTailThreat()&&Math.abs(angle(effectiveAim(enemy,player)-enemy.a))<25*RAD){next={name:'HOLD_DRIFT',sign:1,score:scoreCandidate({name:'HOLD_DRIFT',sign:1},null)};reason='aligned glide hold'}
 else if(enemy.stage==='acboost'&&!threat&&!stableTailThreat()){next={name:'DRIFT_TO_BOOST',sign:1,score:scoreCandidate({name:'DRIFT_TO_BOOST',sign:1},null)};reason='actual AC BOOST recovery';if(Math.abs(angle(effectiveAim(enemy,player)-enemy.a))>1.8&&enemy.pt>.35){next={name:'EXIT_PSM',sign:1,score:best.score};reason='lost attack geometry; legal early exit'}}
 else if(currentLegal&&!choosePlan(best,aiPlan,currentScore,aiPlanAge,!!threat)){next={...aiPlan,score:currentScore};reason=aiPlanAge<.3?'minimum execution time':'current plan re-scored; improvement too small'}
 const changed=!aiPlan||next.name!==aiPlan.name||next.sign!==aiPlan.sign;
 if(changed&&tactics.stage==='SETUP'&&!['PSM_SETUP','SNAP_PSM'].includes(next.name))reason=threat?'setup cancelled: missile threat':attackQuality(enemy,player).window>=.65?'setup cancelled: normal attack window restored':tactics.age>=2.3?'setup cancelled: commitment timeout':'setup cancelled: geometry or predicted value changed';
 if(changed){if(threat&&aiPlan?.name!=='EVADE_RECOVER'){tactics.stats.emergencyInterrupts++;if(tactics.stage==='SETUP')tacticalEvent('setup interrupted: missile threat')}
   if(next.name==='PSM_SETUP'){tactics.stats.setupStarts++;setTacticalStage('SETUP','predicted post-brake PSM advantage')}
   else if(next.name==='SNAP_PSM')setTacticalStage('SNAP',reason);
   else if(next.name==='HOLD_DRIFT')setTacticalStage('HOLD',reason);
   else if(next.name==='DRIFT_TO_BOOST')setTacticalStage('BOOST',reason);
   else if(next.name==='EVADE_RECOVER')setTacticalStage('EVADE',reason);
   else if(next.name==='RECOVER'||next.name==='EXIT_PSM')setTacticalStage('RECOVER',reason);
   else setTacticalStage('NORMAL',reason);
   aiPlanAge=0;combatStats.plans[next.name]=(combatStats.plans[next.name]||0)+1;
 }else tactics.reason=reason;
 aiPlan=next;Object.assign(aiDebug,{plan:next.name,score:next.score,candidates:specs.length,planMs:performance.now()-start});
}
function observeTactics(c,dt){
 const stage=enemy.stage;
 if(stage==='glide'&&tactics.previousStage!=='glide'){tactics.stats.glideEntries++;if(tactics.stage==='SETUP'){tactics.stats.setupCompleted++;setTacticalStage('SNAP','setup completed: real GLIDE entry')}if(time-tactics.lastExit<4)tactics.stats.continuousPsm++}
 if(stage==='acboost'&&tactics.previousStage!=='acboost')tactics.stats.acboostEntries++;
 if(stage==='normal'&&tactics.previousStage!=='normal'){tactics.lastExit=time;const manual=psmMode==='ac7'?(enemy.psmDir===-1?c.down:c.up):!c.psm;if(manual){tactics.stats.earlyExits++;tacticalEvent('manual PSM exit to normal recovery')}else tacticalEvent('PSM time/rotation limit reached')}
 if(stage==='glide'&&!c.up&&!c.down){tactics.stats.holdSeconds+=dt;tactics.holdRun++;tactics.maxHoldRun=Math.max(tactics.maxHoldRun,tactics.holdRun)}else tactics.holdRun=0;
 tactics.previousStage=stage;
}
function hardAI(dt,threat){
 if(!tactics)resetTactics();tactics.age+=dt;aiPlanClock-=dt;aiPlanAge+=dt;
 const d=Math.hypot(player.x-enemy.x,player.y-enemy.y),q=attackQuality(enemy,player);
 if(!tactics.lastDistance)tactics.lastDistance=d;tactics.progressClock+=dt;tactics.progressWindow+=q.window*dt;
 if(tactics.progressClock>=2.5){tactics.stagnant=!threat&&tactics.lastDistance-d<65&&tactics.progressWindow<.3?tactics.stagnant+2.5:0;tactics.lastDistance=d;tactics.progressClock=0;tactics.progressWindow=0}
 if(aiPlanClock<=0||!aiPlan||threat&&aiPlan.name!=='EVADE_RECOVER'){aiPlanClock=.125;try{planHard(threat)}catch(e){aiPlan={name:threat?'EVADE_RECOVER':'INTERCEPT',sign:1,score:0};tacticalEvent('safe planner fallback: '+e.message)}}
 const c=candidateControl(aiPlan.name,enemy,player,Math.floor(aiPlanAge/.1),threat,aiPlan.sign);
 aiGunCD-=dt;aiMissileCD-=dt;aiRest=Math.max(0,aiRest-dt);const gunWindow=gunEnabled&&time>=SAFE&&q.gun>.45;
 aiDebug.window=gunWindow?1:0;if(gunWindow)combatStats.gunWindow+=dt;if(gunWindow&&aiRest<=0){aiBurst+=dt;if(aiBurst>=.8){aiBurst=0;aiRest=.6}}else aiBurst=0;
 c.fire=gunWindow&&aiRest<=0&&aiGunCD<=0;if(c.fire)aiGunCD=.095;
 const w=WEAPONS[weapon],err=Math.abs(angle(Math.atan2(player.y-enemy.y,player.x-enemy.x)-enemy.a));c.missile=time>=SAFE&&d>180&&d<1050&&err<=(w.launchAngle??w.cone)&&enemy.slots.some(s=>s<=0)&&aiMissileCD<=0&&q.missile>.15;if(c.missile)aiMissileCD=2;
 return c;
}

/* Guided-missile defensive planning. All rollouts operate on detached clones. */
const DEFENSE_STEP=.04,DEFENSE_MAX_THREATS=8;
let missileDefense;
function resetMissileDefense(){missileDefense={records:new Map(),serial:0,scanClock:0,planClock:0,active:false,plan:null,age:0,lastControl:null,lastAttack:null,ready:[],threat:null,before:null,after:null,trade:null,lastTradeTime:-Infinity,reason:'no confirmed threat',stats:{detections:0,reactions:0,directionSwitches:0,successes:0,failures:0,riskReduced:0,tradeDraws:0,tradesAccepted:0,tradeHits:0},events:[],scanMs:0,planMs:0};}
function defenseEvent(reason){const d=missileDefense;d.reason=reason;d.events.push({time:Number(time.toFixed(3)),reason,variant:d.plan?.variant,sign:d.plan?.sign});if(d.events.length>40)d.events.shift()}
function defenseDelay(){return level==='easy'?.80:level==='normal'?.45:.22}
function defenseValid(m,o){const w=WEAPONS[m.type];return !!(w&&m.target===o&&m.owner!==o&&!m.miss&&m.age<w.life&&Number.isFinite(m.vx)&&Number.isFinite(m.vy)&&
 (m.age<w.ignition||Math.abs(angle(Math.atan2(o.y-m.y,o.x-m.x)-m.a))<=w.cone));}
function missileClone(m,target){return{...m,target,trail:[]}}
function defenseControl(spec,o,threat){
 const v=kmh(o),sign=spec.sign||1,variant=spec.variant||'TURN';
 // A GLIDE nose rotation is not a velocity-vector dodge. Ordinary defensive
 // variants legally exit first; BOOST is separately scored through real physics.
 if(o.stage!=='normal'&&variant!=='BOOST'){
   if(psmMode==='ac7')return{up:o.psmDir===1,down:o.psmDir===-1,psm:false,throttle:variant!=='BRAKE',brake:variant==='BRAKE',fire:false,missile:false};
   return{up:false,down:false,psm:false,throttle:true,brake:false,fire:false,missile:false};
 }
 let pitch=sign,throttle=false,brake=false,psm=false;
 if(variant==='ACCEL'){
   const heading=spec.heading??Math.atan2(threat.m.vy,threat.m.vx),e=angle(heading+sign*PI/2-o.a);pitch=Math.abs(e)<.045?0:Math.sign(e);throttle=true;
 }else if(variant==='BRAKE'){brake=v>355;throttle=v<330}
 else if(variant==='BOOST'){
   const heading=spec.heading??Math.atan2(threat.m.vy,threat.m.vx),e=angle(heading+sign*PI/2-o.a);
   pitch=Math.abs(e)<.045?0:Math.sign(e);if(o.stage!=='normal'&&pitch!==o.psmDir)pitch=0;
   psm=o.stage!=='normal';throttle=true;
 }else throttle=v<600;
 return{up:pitch<0,down:pitch>0,throttle,brake,psm,fire:false,missile:false};
}
function defenseRollout(o,spec,records,horizon,assumption=0){
 const q=cloneFlightState(o),d=missileDefense,baseControl=d.lastAttack||d.lastControl||{up:false,down:false,throttle:false,brake:false,psm:false},
   tracks=records.map(r=>({record:r,m:missileClone(r.m,q),min:Math.hypot(r.m.x-q.x,r.m.y-q.y),ttc:0,hit:false,done:false})),
   startVector=Math.atan2(q.vy,q.vx),n=Math.ceil(horizon/DEFENSE_STEP),dt=horizon/n;
 let target={...player},attackValue=0,attackWindow=0,exposure=0;
 for(let k=0;k<n;k++){
   const ox=q.x,oy=q.y;
   let c;
   if(spec?.name==='EVADE_RECOVER')c=defenseControl(spec,q,{m:records[0].m});
   else if(spec)c=candidateControl(spec.name,q,target,k,null,spec.sign);
   else c=assumption===0?baseControl:{...baseControl,up:false,down:false};
   advanceFlightState(q,c,dt);target=targetHypothesis(target,dt,0);
   const opportunity=attackQuality(q,target),distance=Math.hypot(target.x-q.x,target.y-q.y),bearing=Math.atan2(target.y-q.y,target.x-q.x),position=(Math.cos(angle(bearing-q.a))+1)/2;
   attackWindow+=opportunity.window*dt/horizon;attackValue+=(.55*opportunity.window+.30*position+.15*clamp((kmh(q)-300)/600,0,1))*dt/horizon;
   const hostileLead=gunEnabled?solveIntercept(target,q,2):null;
   if(hostileLead&&distance<800)exposure+=clamp(1-Math.abs(angle(hostileLead.angle-target.a))/.15,0,1)*dt/horizon;
   for(const track of tracks){
     if(track.done)continue;const m=track.m,mx=m.x,my=m.y,rx=mx-ox,ry=my-oy,status=advanceGuidedMissile(m,dt);
     if(status!==2){track.done=true;continue}
     const ex=m.x-q.x,ey=m.y-q.y,dx=ex-rx,dy=ey-ry,u=clamp(-(rx*dx+ry*dy)/(dx*dx+dy*dy||1),0,1),near=Math.hypot(rx+dx*u,ry+dy*u);
     if(near<track.min){track.min=near;track.ttc=(k+u)*dt}
     if(lineHit(mx,my,m.x,m.y,q,21*hitScale)||near<21*hitScale){track.hit=true;track.done=true}
   }
 }
 const radius=21*hitScale,margin=150*hitScale+30,byThreat=tracks.map(t=>({id:t.record.id,type:t.m.type,cpa:t.min,ttc:t.ttc,hit:t.hit,tracking:!t.m.miss&&!t.done}));
 let risk=0,hits=0,cpa=Infinity,ttc=Infinity;
 for(const t of byThreat){if(t.hit)hits++;risk+=t.hit?100+(horizon-t.ttc)*10:Math.pow(clamp((margin-t.cpa)/margin,0,1),2)*8+(t.tracking?.08:0);if(t.cpa<cpa){cpa=t.cpa;ttc=t.ttc}}
 const turn=Math.abs(angle(Math.atan2(q.vy,q.vx)-startVector));
 return{risk,hits,cpa,ttc,byThreat,turn,speed:kmh(q),attackValue,attackWindow,exposure,score:-risk+.04*clamp((kmh(q)-300)/600,0,1)+.025*clamp(cpa/(radius*5),0,1)};
}
function missileThreat(o,horizon){
 const d=missileDefense;d.scanClock-=d.frameDt||0;const live=new Set(missiles),candidates=[];
 for(const m of missiles){
   if(!defenseValid(m,o))continue;const w=WEAPONS[m.type],h=Math.min(horizon,w.life-m.age),dist=Math.hypot(m.x-o.x,m.y-o.y),
    travel=(Math.min(w.max,spd(m)+w.accel*h/2)+spd(o))*unit*h+120;
   if(dist>travel)continue;
   let r=d.records.get(m);if(!r){r={m,id:++d.serial,confirmedAt:null,lastDanger:-Infinity,prediction:null,minActual:dist,prevRX:m.x-o.x,prevRY:m.y-o.y,engaged:false,hit:false,ended:false,final:false,shadow:null};d.records.set(m,r)}
   const rx=m.x-o.x,ry=m.y-o.y,rvx=(m.vx-o.vx)*unit,rvy=(m.vy-o.vy)*unit,vv=rvx*rvx+rvy*rvy;
   r.linearTTC=vv>1?clamp(-(rx*rvx+ry*rvy)/vv,0,h):h;r.linearCPA=Math.hypot(rx+rvx*r.linearTTC,ry+rvy*r.linearTTC);
   r.closing=-(rx*rvx+ry*rvy)/(dist||1);r.remainingTurn=w.turn*h;
   candidates.push(r);
 }
 candidates.sort((a,b)=>(a.linearTTC+a.linearCPA/(WEAPONS[a.m.type].max*unit))-(b.linearTTC+b.linearCPA/(WEAPONS[b.m.type].max*unit)));
 const selected=candidates.slice(0,DEFENSE_MAX_THREATS),needsScan=d.scanClock<=0||selected.some(r=>!r.prediction);
 if(needsScan){
   const start=performance.now();d.scanClock=.1;
   for(const r of selected){
     const a=defenseRollout(o,null,[r],horizon,0),b=defenseRollout(o,null,[r],horizon,1),p=a.risk>=b.risk?a:b;
     r.prediction=p;
     if(p.hits||p.cpa<150*hitScale+30){if(r.confirmedAt===null){r.confirmedAt=time;d.stats.detections++}r.lastDanger=time}
     else if(time-r.lastDanger>.35)r.confirmedAt=null;
   }
   d.scanMs=performance.now()-start;
 }
 const hazards=selected.filter(r=>r.confirmedAt!==null&&time-r.lastDanger<=.35);
 hazards.sort((a,b)=>b.prediction.risk-a.prediction.risk||a.prediction.ttc-b.prediction.ttc);
 d.ready=hazards.filter(r=>time-r.confirmedAt+1e-8>=defenseDelay());
 d.validCount=candidates.length;d.hazardCount=hazards.length;
 const primary=hazards[0];if(!primary){d.threat=null;return null}
 const readyPrimary=d.ready[0]||primary;
 d.threat={m:readyPrimary.m,key:String(readyPrimary.id),risk:readyPrimary.prediction.risk,ttc:readyPrimary.prediction.ttc,cpa:readyPrimary.prediction.cpa,record:readyPrimary,records:hazards};return d.threat;
}
function defenseSpecs(o,threat){const heading=Math.atan2(threat.m.vy,threat.m.vx),specs=[];for(const variant of ['TURN','ACCEL','BRAKE'])for(const sign of [-1,1])specs.push({name:'EVADE_RECOVER',variant,sign,heading,threatId:threat.record.id});if(o.stage!=='normal')for(const sign of [-1,1])specs.push({name:'EVADE_RECOVER',variant:'BOOST',sign,heading,threatId:threat.record.id});return specs}
function beginDefenseShadow(r){
 if(r.engaged)return;r.engaged=true;r.startX=enemy.x;r.startY=enemy.y;r.startVector=Math.atan2(enemy.vy,enemy.vx);r.maxVectorChange=0;r.maxDeviation=0;
 const q=cloneFlightState(enemy);r.shadow={plane:q,m:missileClone(r.m,q),control:{...(missileDefense.lastAttack||missileDefense.lastControl||{})},hit:false,done:false,elapsed:0};
}
function riskTradeEligibility(before,best,records,hp,healthLimit,now,lastTime){
 const damage=records.reduce((sum,r)=>sum+WEAPONS[r.m.type].damage,0),reserve=Math.max(25,healthLimit*.20),loss=before.attackValue-best.attackValue,
   positioningDanger=best.exposure>before.exposure+.30,
   unavoidable=before.hits>0&&best.hits>0,
   majorAdvantage=loss>=.18&&(before.attackWindow>=.45||loss>=.28);
 const eligible=unavoidable&&records.length===1&&hp-damage>=reserve&&damage<=hp*.6&&(majorAdvantage||positioningDanger)&&now-lastTime>=4;
 return{eligible,damage,reserve,advantageLoss:loss,positioningDanger,probability:clamp(.12+Math.max(0,loss)*.3,.12,.30),reason:!unavoidable?'safe dodge available':records.length!==1?'multiple incoming missiles':hp-damage<reserve||damage>hp*.6?'insufficient health reserve':!majorAdvantage&&!positioningDanger?'no major tactical loss':now-lastTime<4?'trade cooldown':'unavoidable hit; preserve major advantage'};
}
function considerRiskTrade(threat,best){
 const d=missileDefense,r=threat.record;
 if(r.tradeDecision!==undefined)return false;
 const before=defenseRollout(enemy,d.attackPlan,threat.records,level==='easy'?1.2:level==='normal'?1.8:2.4,0),gate=riskTradeEligibility(before,best,threat.records,enemy.hp,maxHP,time,d.lastTradeTime);
 d.tradeGate=gate;if(!gate.eligible)return false;
 d.stats.tradeDraws++;r.tradeDecision=Math.random()<gate.probability;
 if(!r.tradeDecision){defenseEvent('risk trade declined; continue best dodge');return false}
 d.stats.tradesAccepted++;d.lastTradeTime=time;r.intentionalTrade=true;d.trade={id:r.id,record:r,until:time+Math.min(1.5,Math.max(.4,before.ttc+.3)),entryHP:enemy.hp,gate,prediction:before};
 defenseEvent('limited health trade accepted: unavoidable hit plus major tactical advantage');return true;
}
function continueRiskTrade(dt,threat){
 const d=missileDefense,trade=d.trade;if(!trade)return null;
 const damage=threat.records.reduce((s,r)=>s+WEAPONS[r.m.type].damage,0);
 if(time>trade.until||trade.record.m.miss||trade.record.hit||threat.records.length!==1||threat.record.id!==trade.id||enemy.hp-damage<Math.max(25,maxHP*.2)){
   d.trade=null;d.planClock=0;defenseEvent('health trade aborted/ended; defensive re-evaluation');return null;
 }
 if(d.planClock<=0){
   const horizon=level==='easy'?1.2:level==='normal'?1.8:2.4,
    alternative=defenseSpecs(enemy,threat).map(s=>defenseRollout(enemy,s,threat.records,horizon)).sort((a,b)=>a.hits-b.hits||b.score-a.score)[0],
    continuing=defenseRollout(enemy,d.attackPlan,threat.records,horizon),gate=riskTradeEligibility(continuing,alternative,threat.records,enemy.hp,maxHP,time,-Infinity);
   if(!gate.eligible){d.trade=null;d.planClock=0;defenseEvent('health trade cancelled: '+gate.reason);return null}
   trade.prediction=continuing;d.planClock=.125;
 }
 // Preserve the normal attack planner and legal PSM controls in their own saved
 // plan slot. The defense state still observes every incoming missile each frame.
 const savedAge=aiPlanAge,savedClock=aiPlanClock;
 aiPlan=d.attackPlan;aiPlanAge=d.attackAge||0;aiPlanClock=d.attackClock||0;
 const c=level==='hard'?hardAI(dt,null):legacyAI(dt);
 d.attackPlan=aiPlan?{...aiPlan}:null;d.attackAge=aiPlanAge;d.attackClock=aiPlanClock;
 aiPlan={name:'RISK_TRADE',score:aiDebug.score,sign:0};aiPlanAge=savedAge;aiPlanClock=savedClock;
 aiDebug.plan='RISK_TRADE';d.after=trade.prediction;d.reason='RISK_TRADE active: preserve advantage with health reserve';d.lastControl={...c};return c;
}
function planMissileDefense(threat){
 const d=missileDefense,start=performance.now(),records=d.threat.records,
   specs=defenseSpecs(enemy,threat),ranked=specs.map(spec=>({...spec,prediction:defenseRollout(enemy,spec,records,level==='easy'?1.2:level==='normal'?1.8:2.4)})).sort((a,b)=>a.prediction.hits-b.prediction.hits||b.prediction.score-a.prediction.score);
 let best=ranked[0];const old=d.plan&&{...d.plan,prediction:defenseRollout(enemy,d.plan,records,level==='easy'?1.2:level==='normal'?1.8:2.4)};
 const urgent=old?.prediction.hits>0,newHigher=old&&threat.record.id!==old.threatId&&threat.record.prediction.hits>0;
 if(old&&(old.variant!=='BOOST'||enemy.stage!=='normal')){
   const improvement=best.prediction.score-old.prediction.score,
     strictlySafer=best.prediction.hits<old.prediction.hits,
     immediateEscape=urgent&&old.prediction.ttc<.4&&(best.prediction.ttc>old.prediction.ttc+.25||best.prediction.cpa>old.prediction.cpa+21*hitScale),
     newEmergency=newHigher&&improvement>Math.max(1,Math.abs(old.prediction.score)*.25);
   if(!strictlySafer&&!immediateEscape&&!newEmergency&&(d.age<.4||improvement<Math.max(.5,Math.abs(old.prediction.score)*.20)||urgent&&best.prediction.ttc<old.prediction.ttc+.2))best=old;
 }
 if(!d.plan||best.sign!==d.plan.sign||best.variant!==d.plan.variant){if(d.plan&&best.sign!==d.plan.sign)d.stats.directionSwitches++;d.age=0;defenseEvent(urgent?'current trajectory predicts collision; switch':newHigher?'new confirmed dangerous missile':'lowest combined guided-missile risk')}
 d.plan=best;d.after=best.prediction;d.planClock=.125;d.planMs=performance.now()-start;
 considerRiskTrade(threat,best.prediction);
 for(const r of records)if(time-r.confirmedAt>=defenseDelay())beginDefenseShadow(r);
 aiPlan={name:'EVADE_RECOVER',variant:best.variant,sign:best.sign,score:best.prediction.score};aiPlanAge=d.age;
 Object.assign(aiDebug,{plan:'EVADE_RECOVER',score:best.prediction.score,candidates:specs.length,planMs:d.planMs});
}
function executeMissileDefense(dt,threat){
 const d=missileDefense;
 if(!d.active){d.active=true;d.plan=null;d.trade=null;d.attackPlan=aiPlan?{...aiPlan}:null;d.attackAge=aiPlanAge;d.attackClock=aiPlanClock;d.age=0;d.stats.reactions++;d.before=defenseRollout(enemy,null,threat.records,level==='easy'?1.2:level==='normal'?1.8:2.4,0);tactics.stats.emergencyInterrupts++;setTacticalStage('EVADE',tactics.stage==='SETUP'?'setup interrupted: guided missile threat':'confirmed guided missile threat');defenseEvent('reaction delay satisfied; attack interrupted')}
 d.age+=dt;d.planClock-=dt;
 if(d.trade){const c=continueRiskTrade(dt,threat);if(c)return c}
 if(d.planClock<=0||!d.plan||d.plan.threatId!==threat.record.id&&threat.record.prediction.hits>0)planMissileDefense(threat);
 if(d.trade){const c=continueRiskTrade(dt,threat);if(c)return c}
 const c=candidateControl('EVADE_RECOVER',enemy,player,0,{...threat,controlSpec:d.plan},d.plan.sign);
 c.fire=false;c.missile=false;aiGunCD=Math.max(0,aiGunCD-dt);aiMissileCD=Math.max(0,aiMissileCD-dt);
 d.lastControl={...c};return c;
}
function ai(dt){
 if(!missileDefense)resetMissileDefense();const d=missileDefense;d.frameDt=dt;
 aiTurnSample+=dt;if(aiTurnSample>=.1){aiPlayerTurnRate=angle(player.a-aiPrevPlayerA)/aiTurnSample;aiPrevPlayerA=player.a;aiTurnSample=0}
 const horizon=level==='easy'?1.2:level==='normal'?1.8:2.4,threat=missileThreat(enemy,horizon);
 aiThreatKey=threat?.key||'';aiThreatSeen=threat?time-threat.record.confirmedAt:0;aiDebug.threatTTC=threat?.ttc??Infinity;
 if(d.ready.length){const primary=d.ready[0],readyThreat={...threat,m:primary.m,record:primary,key:String(primary.id)};return executeMissileDefense(dt,readyThreat)}
 if(d.active){d.active=false;d.plan=null;d.trade=null;aiPlan=null;aiPlanClock=0;defenseEvent('threat reduced or ended; re-evaluate attack')}
 const c=level==='hard'?hardAI(dt,null):legacyAI(dt);d.lastControl={...c};d.lastAttack={...c};return c;
}
function recordDefenseMissileHit(m){const r=missileDefense?.records.get(m);if(r)r.hit=true}
function observeMissileDefense(dt){
 const d=missileDefense;if(!d)return;const live=new Set(missiles),radius=21*hitScale;
 for(const [m,r]of d.records){
   if(r.final){if(!live.has(m))d.records.delete(m);continue}
   const rx=m.x-enemy.x,ry=m.y-enemy.y,dx=rx-r.prevRX,dy=ry-r.prevRY,u=clamp(-(r.prevRX*dx+r.prevRY*dy)/(dx*dx+dy*dy||1),0,1);
   if(!r.ended)r.minActual=Math.min(r.minActual,Math.hypot(r.prevRX+dx*u,r.prevRY+dy*u));r.prevRX=rx;r.prevRY=ry;
   if(!live.has(m)||m.miss||m.age>=WEAPONS[m.type].life)r.ended=true;
   if(r.engaged){
     const s=r.shadow;if(!s.done){const mx=s.m.x,my=s.m.y;advanceFlightState(s.plane,s.control,dt);const status=advanceGuidedMissile(s.m,dt);s.elapsed+=dt;if(status===2&&lineHit(mx,my,s.m.x,s.m.y,s.plane,radius)){s.hit=true;s.done=true}else if(s.m.miss||s.elapsed>=4)s.done=true}
     r.maxVectorChange=Math.max(r.maxVectorChange,Math.abs(angle(Math.atan2(enemy.vy,enemy.vx)-r.startVector)));
     r.maxDeviation=Math.max(r.maxDeviation,Math.hypot(enemy.x-s.plane.x,enemy.y-s.plane.y));
   }
   if(r.hit){d.stats.failures++;if(r.intentionalTrade)d.stats.tradeHits++;r.final=true;defenseEvent(r.intentionalTrade?'intentional health trade received missile hit':'player missile hit AI')}
   else if(r.ended&&(!r.engaged||r.shadow.done)){
     const effective=r.engaged&&(r.maxVectorChange>.08||r.maxDeviation>radius*2);
     if(!r.intentionalTrade&&effective&&r.minActual>radius&&r.shadow.hit){d.stats.successes++;defenseEvent('measured miss plus effective maneuver; counterfactual predicted hit')}
     else if(!r.intentionalTrade&&effective&&r.minActual>radius)d.stats.riskReduced++;
     r.final=true;
   }
   if(r.final&&!live.has(m))d.records.delete(m);
 }
}
function updateAIDebug(){const panel=$('ai-debug-panel');if(!panel)return;panel.hidden=!$('ai-debug')?.checked;if(panel.hidden)return;const t=tactics,d=missileDefense,p=d?.threat;
 panel.textContent=`${hardStyle==='pressure'?'HARD-P':'HARD-A'} | ${aiDebug.plan} ${aiDebug.score.toFixed(3)} | ${Math.round(kmh(enemy))} km/h\nPSM ${enemy.stage}/${psmBlockReason(enemy)} | ${t?.stage} ${(t?.age||0).toFixed(1)}s | ${t?.reason}\nsetup ${t?.stats.setupStarts}/${t?.stats.setupCompleted} GLIDE ${t?.stats.glideEntries} AC BOOST ${t?.stats.acboostEntries} hold ${(t?.stats.holdSeconds||0).toFixed(2)}s\nthreats ${d?.hazardCount||0}/${d?.validCount||0} type ${p?.m.type||'—'} delay ${aiThreatSeen.toFixed(2)}/${defenseDelay().toFixed(2)}s TTC ${Number.isFinite(p?.ttc)?p.ttc.toFixed(2):'—'}\nevade ${d?.trade?'HOLD_ATTACK':d?.plan?.variant||'—'} ${d?.trade?'—':d?.plan?.sign===-1?'LEFT':d?.plan?.sign===1?'RIGHT':'—'} | CPA ${d?.before?.cpa.toFixed(1)||'—'} → ${d?.after?.cpa.toFixed(1)||'—'}\n${d?.reason} | success ${d?.stats.successes||0} hit ${d?.stats.failures||0} reduced ${d?.stats.riskReduced||0}\nhealth trade ${d?.stats.tradesAccepted||0}/${d?.stats.tradeDraws||0} taken ${d?.stats.tradeHits||0} | ${d?.tradeGate?.reason||'not evaluated'}\nscan ${(d?.scanMs||0).toFixed(2)}ms plan ${(d?.planMs||aiDebug.planMs).toFixed(2)}ms`;
}

/* Historical v5.4.1 controller, copied verbatim from the verified pre-defense
   backup. Closure state is independent; actual flight/weapons remain shared. */
function createHistoricalHardAI(style){
let aiSpeedBias=0,aiSpeedTarget=0,aiSpeedClock=0,aiSpeedResponse=0,aiAim=PI,aiThink=0,aiGunCD=0,aiMissileCD=0,aiMode='pursuit',aiDecision=0,aiCommit=0,aiPsmRemain=0,aiPsmWait=0,aiBurst=0,aiRest=0;
let hardStyle='aggressive',aiPlanClock=0,aiPlan=null,aiPlanAge=0,aiThreatSeen=0,aiThreatKey='',aiTurnSample=0,aiPrevPlayerA=0,aiPlayerTurnRate=0;
const aiDebug={plan:'LEGACY',score:0,threatTTC:Infinity,window:0,planMs:0,candidates:0,psmUseful:0};
let threatSerial=0;
const HARD_WEIGHTS={aggressive:{window:.20,hit:.35,position:.20,future:.10,energy:.15},pressure:{window:.35,hit:.15,position:.20,future:.20,energy:.10}};
const PLAN_NAMES=['NORMAL_TRACK','INTERCEPT','FLANK','PSM_SETUP','SNAP_PSM','HOLD_DRIFT','DRIFT_TO_BOOST','EXIT_PSM','RECOVER','EVADE_RECOVER'];
const MPC_STEPS=15,MPC_GAMMA=.95,MPC_DISCOUNT_SUM=(1-Math.pow(MPC_GAMMA,MPC_STEPS))/(1-MPC_GAMMA);
let tactics;
function cloneFlightState(o){const q={...o,slots:o.slots.slice(),trail:[]};return q}
function advanceFlightState(state,control,dt){movePlane(state,{up:false,down:false,throttle:false,brake:false,psm:false,...control,fire:false,missile:false},dt);state.trail.length=0;return state}
function solveIntercept(shooter,target,life=2,muzzle=24*planeScale){const rx=(target.x-shooter.x)/unit,ry=(target.y-shooter.y)/unit,ux=target.vx-shooter.vx,uy=target.vy-shooter.vy,s=355,A=ux*ux+uy*uy-s*s;let tau=-1,mx=0,my=0;for(let n=0;n<3;n++){const x=rx-mx,y=ry-my,B=2*(x*ux+y*uy),C=x*x+y*y;if(Math.abs(A)<1e-7){tau=Math.abs(B)>1e-7?-C/B:-1}else{const D=B*B-4*A*C;if(D<0)return null;const q=Math.sqrt(D),a=(-B-q)/(2*A),b=(-B+q)/(2*A);tau=a>0&&b>0?Math.min(a,b):Math.max(a,b)}if(!(tau>0&&tau<=life))return null;const aim=Math.atan2(y+uy*tau,x+ux*tau);mx=Math.cos(aim)*muzzle/unit;my=Math.sin(aim)*muzzle/unit}return{time:tau,angle:Math.atan2(ry-my+uy*tau,rx-mx+ux*tau),x:target.x+target.vx*tau*unit,y:target.y+target.vy*tau*unit}}
function missileThreat(o,horizon){let best=null;for(const m of missiles){if(m.owner===o||m.target!==o||m.miss)continue;const rx=m.x-o.x,ry=m.y-o.y,rvx=(m.vx-o.vx)*unit,rvy=(m.vy-o.vy)*unit,rv2=rvx*rvx+rvy*rvy;if(rv2<1)continue;const t=clamp(-(rx*rvx+ry*rvy)/rv2,0,horizon),cx=rx+rvx*t,cy=ry+rvy*t,cpa=Math.hypot(cx,cy),heading=Math.abs(angle(Math.atan2(o.y-m.y,o.x-m.x)-m.a));if(t>0&&cpa<220*hitScale+80&&heading<(WEAPONS[m.type]?.cone||PI)){const risk=(1-t/horizon)*(1-cpa/(220*hitScale+80));if(!best||risk>best.risk){if(!m.threatId)m.threatId=++threatSerial;best={m,ttc:t,cpa,risk,key:String(m.threatId)}}}}return best}
function targetHypothesis(base,dt,turnRate){const q={...base};q.a=angle(q.a+turnRate*dt);const speed=spd(q),va=Math.atan2(q.vy,q.vx)+turnRate*dt*.55;q.vx=Math.cos(va)*speed;q.vy=Math.sin(va)*speed;q.x+=q.vx*dt*unit;q.y+=q.vy*dt*unit;return q}
function ai(dt){aiTurnSample+=dt;if(aiTurnSample>=.1){aiPlayerTurnRate=angle(player.a-aiPrevPlayerA)/aiTurnSample;aiPrevPlayerA=player.a;aiTurnSample=0}const horizon=level==='easy'?1.2:level==='normal'?1.8:2.4,threat=missileThreat(enemy,horizon);aiDebug.threatTTC=threat?.ttc??Infinity;if(threat){if(threat.key!==aiThreatKey){aiThreatKey=threat.key;aiThreatSeen=0}else aiThreatSeen+=dt}else{aiThreatKey='';aiThreatSeen=0}if(level==='hard')return hardAI(dt,threat&&aiThreatSeen>=.22?threat:null);const c=legacyAI(dt),delay=level==='easy'?.8:.45;if(threat&&aiThreatSeen>=delay){const incoming=Math.atan2(threat.m.vy,threat.m.vx),desired=angle(incoming+(Math.sin(enemy.x+enemy.y)>0?1:-1)*PI/2),err=angle(desired-enemy.a);c.up=err<-.055;c.down=err>.055;c.throttle=true;c.brake=false;c.fire=false;c.psm=psmReady(enemy)&&threat.ttc<.8}aiDebug.plan=threat&&aiThreatSeen>=delay?'EVADE_RECOVER':'LEGACY';return c}
function resetTactics(){tactics={stage:'NORMAL',age:0,progressClock:0,progressWindow:0,stagnant:0,lastDistance:0,previousStage:'normal',lastExit:-99,holdRun:0,maxHoldRun:0,stats:{setupStarts:0,setupCompleted:0,glideEntries:0,acboostEntries:0,holdSeconds:0,earlyExits:0,continuousPsm:0,emergencyInterrupts:0},events:[],reason:'initial',best:'',bestScore:0};aiTurnSample=0}
function tacticalEvent(reason){tactics.reason=reason;tactics.events.push({time:Number(time.toFixed(2)),speed:Number(kmh(enemy).toFixed(1)),stage:tactics.stage,reason});if(tactics.events.length>32)tactics.events.shift()}
function setTacticalStage(stage,reason){if(stage===tactics.stage)return;tactics.stage=stage;tactics.age=0;tacticalEvent(reason)}
function psmBlockReason(o){if(o.stage!=='normal')return o.stage;if(o.latch)return'INPUT_LATCH';if(o.pcd>0)return'COOLDOWN';if(o.stall)return'STALL';if(kmh(o)<STALL)return'SPEED_LOW';if(kmh(o)>=PSM_MAX)return'SPEED_HIGH';return'READY'}
function effectiveAim(o,t){const lead=gunEnabled?solveIntercept(o,t,2):null;return lead?lead.angle:Math.atan2(t.y-o.y,t.x-o.x)}
function stableTailThreat(){const d=Math.hypot(player.x-enemy.x,player.y-enemy.y),ownError=Math.abs(angle(Math.atan2(player.y-enemy.y,player.x-enemy.x)-enemy.a)),theirError=Math.abs(angle(effectiveAim(player,enemy)-player.a));return d<850&&ownError>2.2&&theirError<.18}
function attackQuality(o,t){const d=Math.hypot(t.x-o.x,t.y-o.y),err=Math.abs(angle(effectiveAim(o,t)-o.a)),w=WEAPONS[weapon],gun=gunEnabled&&o.gunCD<=.105&&d<800?clamp(1-err/.14,0,1):0,lock=Math.abs(angle(Math.atan2(t.y-o.y,t.x-o.x)-o.a)),ready=o.slots.some(s=>s<=0),missile=ready&&d>150&&d<1100&&lock<=(w.launchAngle??w.cone)?clamp(1-lock/(w.launchAngle??w.cone),0,1)*clamp(1-Math.abs(d-550)/850,0,1):0;return{window:gunEnabled?Math.max(gun,missile*.45):missile,hit:gunEnabled?gun*.75+missile*.25:missile,gun,missile}}
function candidateControl(name,o,t,step,threat,turnSign=1){
 let desired=effectiveAim(o,t),throttle=false,brake=false,psm=false;const v=kmh(o),los=Math.atan2(t.y-o.y,t.x-o.x),d=Math.hypot(t.x-o.x,t.y-o.y);
 if(name==='NORMAL_TRACK')desired=los;
 if(name==='FLANK')desired=angle(los+turnSign*.65*clamp(d/600,.25,1));
 if(name==='PSM_SETUP'){brake=v>430;throttle=v<350;if(o.stage!=='normal')name='HOLD_DRIFT';else if(v<PSM_MAX&&psmReady(o)&&!o.latch)name='SNAP_PSM'}
 if(name==='SNAP_PSM'){
   if(o.stage==='normal'){psm=psmReady(o)&&!o.latch;brake=v>=PSM_MAX;throttle=v<350}
   else {name='HOLD_DRIFT';psm=true}
 }
 if(name==='HOLD_DRIFT'||name==='DRIFT_TO_BOOST'){
   psm=o.stage!=='normal';throttle=v<420||o.stage==='acboost';
   // Opposite pitch is a manual exit, so hold instead of oscillating around aim.
   let e=angle(desired-o.a);if(Math.abs(e)<(hardStyle==='pressure'?7:5)*RAD||o.stage!=='normal'&&Math.sign(e)!==o.psmDir)desired=o.a;
 }
 if(name==='RECOVER'){psm=false;throttle=v<660;desired=angle(los+turnSign*.25)}
 if(name==='EXIT_PSM'&&o.stage!=='normal'){
   if(psmMode==='ac7')return{up:o.psmDir===1,down:o.psmDir===-1,throttle:true,brake:false,psm:false,fire:false,missile:false};
   return{up:false,down:false,throttle:true,brake:false,psm:false,fire:false,missile:false};
 }
 if(name==='EVADE_RECOVER'&&threat){desired=angle(Math.atan2(threat.m.vy,threat.m.vx)+turnSign*PI/2);throttle=true;psm=false;if(o.stage!=='normal'&&psmMode==='ac7')return{up:o.psmDir===1,down:o.psmDir===-1,throttle:true,brake:false,psm:false,fire:false,missile:false}}
 const err=angle(desired-o.a),dead=3*RAD;let up=err< -dead,down=err>dead;
 if(name==='SNAP_PSM'&&psm&&up===down){up=turnSign<0;down=!up}
 if(!['PSM_SETUP','SNAP_PSM','HOLD_DRIFT','DRIFT_TO_BOOST','EVADE_RECOVER','RECOVER'].includes(name)){throttle=v<600;brake=v>780;const closing=((t.x-o.x)*(o.vx-t.vx)+(t.y-o.y)*(o.vy-t.vy))/(d||1);if(d<220&&closing>70)brake=true}
 return{up,down,throttle:throttle&&!brake,brake,psm,fire:false,missile:false}
}
function candidateSpecs(threat){
 if(threat)return[{name:'EVADE_RECOVER',sign:1},{name:'EVADE_RECOVER',sign:-1}];
 if(stableTailThreat()&&enemy.stage!=='normal')return[{name:'EXIT_PSM',sign:1}];
 if(enemy.stage!=='normal')return[{name:'HOLD_DRIFT',sign:1},{name:'DRIFT_TO_BOOST',sign:1},{name:'EXIT_PSM',sign:1}];
 const specs=[{name:'NORMAL_TRACK',sign:1},{name:'INTERCEPT',sign:1},{name:'FLANK',sign:1},{name:'FLANK',sign:-1}];
 if(enemy.boost>0||enemy.recover>0||enemy.latch)specs.push({name:'RECOVER',sign:1});
 else if(psmReady(enemy)&&!stableTailThreat())specs.push({name:'SNAP_PSM',sign:Math.sign(angle(effectiveAim(enemy,player)-enemy.a))||1});
 else if(kmh(enemy)>=PSM_MAX&&setupGeometry())specs.push({name:'PSM_SETUP',sign:1});
 // Digital controls can make different headings produce the exact same horizon.
 // Compete once per actual trajectory rather than once per cosmetic plan name.
 const seen=new Set();return specs.filter(spec=>{const o=cloneFlightState(enemy);for(let k=0;k<15;k++)advanceFlightState(o,candidateControl(spec.name,o,player,k,null,spec.sign),.1);const key=[o.x.toFixed(1),o.y.toFixed(1),o.a.toFixed(3),o.stage,o.latch].join('|');if(seen.has(key))return false;seen.add(key);return true});
}
function setupGeometry(){const d=Math.hypot(player.x-enemy.x,player.y-enemy.y),e=Math.abs(angle(effectiveAim(enemy,player)-enemy.a)),playerAim=Math.abs(angle(Math.atan2(enemy.y-player.y,enemy.x-player.x)-player.a)),quality=attackQuality(enemy,player);return d<1100&&d>100&&e>.14&&e<2.7&&quality.window<.65&&!(playerAim<.18&&e>2.2)}
function scoreCandidate(spec,threat){
 const weights=HARD_WEIGHTS[hardStyle],scores=[];
 for(const turn of [0,aiPlayerTurnRate]){
   const o=cloneFlightState(enemy);let t={...player},win=0,hit=0,pos=0,future=0,energy=0,risk=0,discount=1;
   for(let k=0;k<MPC_STEPS;k++){
     const c=candidateControl(spec.name,o,t,k,threat,spec.sign);advanceFlightState(o,c,.1);t=targetHypothesis(t,.1,turn);
     const q=attackQuality(o,t),d=Math.hypot(t.x-o.x,t.y-o.y),los=Math.atan2(t.y-o.y,t.x-o.x),facing=Math.cos(angle(los-o.a)),opponent=Math.cos(angle(los+PI-t.a));
     win+=discount*q.window;hit+=discount*q.hit;pos+=discount*clamp((facing-opponent+2)/4,0,1);future+=discount*(psmReady(o)?.8:o.stage!=='normal'?.65:.35);energy+=discount*clamp((kmh(o)-300)/500,0,1);
     risk+=discount*(d<65*hitScale?2:opponent>.97&&d<600?.25:0);
     if(threat){const mx=threat.m.x+threat.m.vx*(k+1)*.1*unit,my=threat.m.y+threat.m.vy*(k+1)*.1*unit,near=Math.hypot(o.x-mx,o.y-my);risk+=discount*clamp(1-near/(160*hitScale),0,1)*4}
     discount*=MPC_GAMMA;
   }
   scores.push((weights.window*win+weights.hit*hit+weights.position*pos+weights.future*future+weights.energy*energy-risk)/MPC_DISCOUNT_SUM);
 }
 let score=.7*(scores[0]+scores[1])/2+.3*Math.min(...scores);
 // Only this candidate uses a coarse, longer horizon to value completing real preparation.
 if(spec.name==='PSM_SETUP'){
   const o=cloneFlightState(enemy);let t={...player},value=0,baseline=0;
   const normal=cloneFlightState(enemy);
   for(let k=0;k<30;k++){advanceFlightState(o,candidateControl('PSM_SETUP',o,t,k,null,1),.1);advanceFlightState(normal,candidateControl('INTERCEPT',normal,t,k,null,1),.1);t=targetHypothesis(t,.1,aiPlayerTurnRate);if(k>=15){value+=attackQuality(o,t).window;baseline+=attackQuality(normal,t).window}}
   const angleGain=Math.abs(angle(effectiveAim(normal,t)-normal.a))-Math.abs(angle(effectiveAim(o,t)-o.a));
   score+=clamp((value-baseline)/15*.30+angleGain/PI*.25,-.2,.3);
 }
 if(tactics.stagnant>2.5&&spec.name!=='NORMAL_TRACK'&&spec.name!=='INTERCEPT')score+=.035;
 return Number.isFinite(score)?score:-1e6;
}
function choosePlan(best,current,currentScore,age,emergency){if(emergency)return true;if(!current)return true;if(age<.3)return false;return best.score>currentScore+Math.max(.012,Math.abs(currentScore)*.12)}
function planHard(threat){
 const start=performance.now(),specs=candidateSpecs(threat),ranked=specs.map(s=>({...s,score:scoreCandidate(s,threat)})).sort((a,b)=>b.score-a.score),best=ranked[0]||{name:'INTERCEPT',sign:1,score:0};
 const currentLegal=aiPlan&&specs.some(s=>s.name===aiPlan.name&&s.sign===aiPlan.sign),currentScore=currentLegal?scoreCandidate(aiPlan,threat):-Infinity;
 tactics.best=best.name;tactics.bestScore=best.score;let next=best,reason='score hysteresis';
 if(tactics.stage==='SETUP'&&!threat&&setupGeometry()&&kmh(enemy)>=PSM_MAX&&tactics.age<2.3&&aiPlan?.name==='PSM_SETUP'){next={...aiPlan,score:currentScore};reason='bounded setup commitment'}
 else if(tactics.stage==='SETUP'&&!threat&&psmReady(enemy)&&!enemy.latch){next={name:'SNAP_PSM',sign:Math.sign(angle(effectiveAim(enemy,player)-enemy.a))||1,score:scoreCandidate({name:'SNAP_PSM',sign:1},null)};reason='setup completed';tactics.stats.setupCompleted++}
 else if(enemy.stage==='glide'&&!threat&&!stableTailThreat()&&Math.abs(angle(effectiveAim(enemy,player)-enemy.a))<25*RAD){next={name:'HOLD_DRIFT',sign:1,score:scoreCandidate({name:'HOLD_DRIFT',sign:1},null)};reason='aligned glide hold'}
 else if(enemy.stage==='acboost'&&!threat&&!stableTailThreat()){next={name:'DRIFT_TO_BOOST',sign:1,score:scoreCandidate({name:'DRIFT_TO_BOOST',sign:1},null)};reason='actual AC BOOST recovery';if(Math.abs(angle(effectiveAim(enemy,player)-enemy.a))>1.8&&enemy.pt>.35){next={name:'EXIT_PSM',sign:1,score:best.score};reason='lost attack geometry; legal early exit'}}
 else if(currentLegal&&!choosePlan(best,aiPlan,currentScore,aiPlanAge,!!threat)){next={...aiPlan,score:currentScore};reason=aiPlanAge<.3?'minimum execution time':'current plan re-scored; improvement too small'}
 const changed=!aiPlan||next.name!==aiPlan.name||next.sign!==aiPlan.sign;
 if(changed&&tactics.stage==='SETUP'&&!['PSM_SETUP','SNAP_PSM'].includes(next.name))reason=threat?'setup cancelled: missile threat':attackQuality(enemy,player).window>=.65?'setup cancelled: normal attack window restored':tactics.age>=2.3?'setup cancelled: commitment timeout':'setup cancelled: geometry or predicted value changed';
 if(changed){if(threat&&aiPlan?.name!=='EVADE_RECOVER'){tactics.stats.emergencyInterrupts++;if(tactics.stage==='SETUP')tacticalEvent('setup interrupted: missile threat')}
   if(next.name==='PSM_SETUP'){tactics.stats.setupStarts++;setTacticalStage('SETUP','predicted post-brake PSM advantage')}
   else if(next.name==='SNAP_PSM')setTacticalStage('SNAP',reason);
   else if(next.name==='HOLD_DRIFT')setTacticalStage('HOLD',reason);
   else if(next.name==='DRIFT_TO_BOOST')setTacticalStage('BOOST',reason);
   else if(next.name==='EVADE_RECOVER')setTacticalStage('EVADE',reason);
   else if(next.name==='RECOVER'||next.name==='EXIT_PSM')setTacticalStage('RECOVER',reason);
   else setTacticalStage('NORMAL',reason);
   aiPlanAge=0;combatStats.plans[next.name]=(combatStats.plans[next.name]||0)+1;
 }else tactics.reason=reason;
 aiPlan=next;Object.assign(aiDebug,{plan:next.name,score:next.score,candidates:specs.length,planMs:performance.now()-start});
}
function observeTactics(c,dt){
 const stage=enemy.stage;
 if(stage==='glide'&&tactics.previousStage!=='glide'){tactics.stats.glideEntries++;if(tactics.stage==='SETUP'){tactics.stats.setupCompleted++;setTacticalStage('SNAP','setup completed: real GLIDE entry')}if(time-tactics.lastExit<4)tactics.stats.continuousPsm++}
 if(stage==='acboost'&&tactics.previousStage!=='acboost')tactics.stats.acboostEntries++;
 if(stage==='normal'&&tactics.previousStage!=='normal'){tactics.lastExit=time;const manual=psmMode==='ac7'?(enemy.psmDir===-1?c.down:c.up):!c.psm;if(manual){tactics.stats.earlyExits++;tacticalEvent('manual PSM exit to normal recovery')}else tacticalEvent('PSM time/rotation limit reached')}
 if(stage==='glide'&&!c.up&&!c.down){tactics.stats.holdSeconds+=dt;tactics.holdRun++;tactics.maxHoldRun=Math.max(tactics.maxHoldRun,tactics.holdRun)}else tactics.holdRun=0;
 tactics.previousStage=stage;
}
function hardAI(dt,threat){
 if(!tactics)resetTactics();tactics.age+=dt;aiPlanClock-=dt;aiPlanAge+=dt;
 const d=Math.hypot(player.x-enemy.x,player.y-enemy.y),q=attackQuality(enemy,player);
 if(!tactics.lastDistance)tactics.lastDistance=d;tactics.progressClock+=dt;tactics.progressWindow+=q.window*dt;
 if(tactics.progressClock>=2.5){tactics.stagnant=!threat&&tactics.lastDistance-d<65&&tactics.progressWindow<.3?tactics.stagnant+2.5:0;tactics.lastDistance=d;tactics.progressClock=0;tactics.progressWindow=0}
 if(aiPlanClock<=0||!aiPlan||threat&&aiPlan.name!=='EVADE_RECOVER'){aiPlanClock=.125;try{planHard(threat)}catch(e){aiPlan={name:threat?'EVADE_RECOVER':'INTERCEPT',sign:1,score:0};tacticalEvent('safe planner fallback: '+e.message)}}
 const c=candidateControl(aiPlan.name,enemy,player,Math.floor(aiPlanAge/.1),threat,aiPlan.sign);
 aiGunCD-=dt;aiMissileCD-=dt;aiRest=Math.max(0,aiRest-dt);const gunWindow=gunEnabled&&time>=SAFE&&q.gun>.45;
 aiDebug.window=gunWindow?1:0;if(gunWindow)combatStats.gunWindow+=dt;if(gunWindow&&aiRest<=0){aiBurst+=dt;if(aiBurst>=.8){aiBurst=0;aiRest=.6}}else aiBurst=0;
 c.fire=gunWindow&&aiRest<=0&&aiGunCD<=0;if(c.fire)aiGunCD=.095;
 const w=WEAPONS[weapon],err=Math.abs(angle(Math.atan2(player.y-enemy.y,player.x-enemy.x)-enemy.a));c.missile=time>=SAFE&&d>180&&d<1050&&err<=(w.launchAngle??w.cone)&&enemy.slots.some(s=>s<=0)&&aiMissileCD<=0&&q.missile>.15;if(c.missile)aiMissileCD=2;
 return c;
}
function updateAIDebug(){const panel=$('ai-debug-panel');if(!panel)return;panel.hidden=!$('ai-debug')?.checked;if(panel.hidden)return;const t=tactics;panel.textContent=`${hardStyle==='pressure'?'HARD-P':'HARD-A'} | ${aiDebug.plan} ${aiDebug.score.toFixed(3)} | ${Math.round(kmh(enemy))} km/h\nPSM ${enemy.stage} / ${psmBlockReason(enemy)} | phase ${t?.stage} ${(t?.age||0).toFixed(1)}s\nbest ${t?.best} ${(t?.bestScore||0).toFixed(3)} | ${t?.reason}\nsetup ${t?.stats.setupStarts}/${t?.stats.setupCompleted} | GLIDE ${t?.stats.glideEntries} AC BOOST ${t?.stats.acboostEntries} | hold ${(t?.stats.holdSeconds||0).toFixed(2)}s (${t?.maxHoldRun} frames)\nre-entry ${t?.stats.continuousPsm} exits ${t?.stats.earlyExits} emergency ${t?.stats.emergencyInterrupts} | MPC ${aiDebug.planMs.toFixed(2)}ms`}
hardStyle=style;
aiAim=PI;aiThink=0;aiGunCD=.3;aiMissileCD=2;aiMode='pursuit';aiDecision=0;aiCommit=0;aiPsmRemain=0;aiPsmWait=1.4;aiBurst=0;aiRest=0;aiSpeedBias=0;aiSpeedTarget=0;aiSpeedClock=0;aiSpeedResponse=0;aiPlanClock=0;aiPlan=null;aiPlanAge=0;aiThreatSeen=0;aiThreatKey='';aiPrevPlayerA=player.a;aiPlayerTurnRate=0;Object.assign(aiDebug,{plan:'LEGACY',score:0,threatTTC:Infinity,window:0,planMs:0,candidates:0,psmUseful:0});
resetTactics();
return {step:ai,observe:observeTactics,renderDebug:updateAIDebug,
 snapshot:()=>({debug:{...aiDebug},plan:aiPlan,tactics,threatSeen:aiThreatSeen,threatKey:aiThreatKey,planClock:aiPlanClock,planAge:aiPlanAge,style:hardStyle})};
}

touchDirectionControl=createTouchDirectionControl();
mouseDirectionControl=createMouseDirectionControl();
pad=createGamepadAdapter();
window.__PSM54_TEST__={
 classify(deg,speed=600){const a=0,s=ms(speed),o={a,vx:Math.cos(deg*RAD)*s,vy:Math.sin(deg*RAD)*s};return sixAAMLaunchMode(o)},
 driftCap(age){const t=clamp(age/5.5,0,1);return Math.PI*Math.pow(1-t*t,2)/RAD},
 weapons(){return JSON.parse(JSON.stringify(WEAPONS))},
 predictionIsolation(){const before=JSON.stringify(enemy),q=cloneFlightState(enemy);advanceFlightState(q,{up:true,psm:true},.1);return{unchanged:before===JSON.stringify(enemy),finite:[q.x,q.y,q.vx,q.vy,q.a].every(Number.isFinite),stage:q.stage}},
 psmSequence(order,mode='ac7',dir='up'){const old=psmMode;psmMode=mode;const q=plane(0,0,0,'#fff'),v=ms(400);q.vx=v;q.vy=0;q.slots=Array(WEAPONS[weapon].count).fill(99);const pitch=dir==='up'?{up:true}:{down:true};if(order==='psm-first'){advanceFlightState(q,{psm:true},.016);advanceFlightState(q,{psm:true,...pitch},.016)}else{advanceFlightState(q,pitch,.016);advanceFlightState(q,{psm:true,...pitch},.016)}psmMode=old;return q.stage},
 missileProbe(deg,type='6aam'){const w=WEAPONS[type],s=ms(600),o={x:0,y:0,a:0,vx:Math.cos(deg*RAD)*s,vy:Math.sin(deg*RAD)*s},mode=sixAAMLaunchMode(o),extra=distance==='far'?0:ms(50),base=Math.hypot(o.vx+(s?o.vx/s*extra:extra),o.vy+(s?o.vy/s*extra:0)),m={x:0,y:0,a:0,vx:mode==='DIRECT'?base:o.vx+(s?o.vx/s*extra:extra),vy:mode==='DIRECT'?0:o.vy+(s?o.vy/s*extra:0),age:0,owner:{},target:{x:1e8,y:0,vx:0,vy:0,hp:1},type,launchMode:mode,trail:[],miss:false,missTime:0};const initial={speed:spd(m)*3.6,direction:Math.atan2(m.vy,m.vx)/RAD};let max=spd(m);for(let i=0;i<900&&!m.miss;i++){moveMissile(m,.01);max=Math.max(max,spd(m))}return{mode,initial,maxKmh:max*3.6,finalSlip:Math.abs(angle(Math.atan2(m.vy,m.vx)-m.a))/RAD,life:w.life}},
 injectThreat(){const d=500,s=ms(1800);missiles.push({x:enemy.x-d,y:enemy.y,a:0,vx:s,vy:0,age:1,owner:player,target:enemy,type:'msl',launchMode:null,trail:[],miss:false,missTime:0});return true},
 scenario(name){const set=(o,x,y,a,k=600)=>{const s=ms(k);Object.assign(o,{x,y,a,vx:Math.cos(a)*s,vy:Math.sin(a)*s,stage:'normal',psm:false,pt:0,pa:0,pcd:0,latch:false,boost:0,recover:0,stall:false,hp:maxHP,trail:[]})};missiles=[];bullets=[];if(name==='head-on'){set(player,-500,0,0,700);set(enemy,500,0,PI,700)}else if(name==='ai-tail'){set(player,0,0,0,650);set(enemy,-350,0,0,650)}else if(name==='player-tail'){set(player,-350,0,0,650);set(enemy,0,0,0,650)}else if(name==='cross'){set(player,-250,-220,.65,1000);set(enemy,250,220,PI+.65,1000)}else if(name==='turn'){set(player,0,0,PI/2,700);set(enemy,-500,0,0,700)}else if(name==='psm-band'){set(player,260,0,PI,430);set(enemy,-260,0,0,430)}else if(name==='threat'){set(player,-600,0,0,700);set(enemy,0,0,PI,600);this.injectThreat()}else if(name==='low-speed'){set(player,220,0,PI,360);set(enemy,-220,0,0,360)}else if(name==='close'){set(player,100,50,PI,420);set(enemy,-100,-50,0,420)}aiPlan=null;aiPlanClock=0;aiPlanAge=0;return this.state()},
 debug(){return{...(historicalHardSelected()?historicalHardController.snapshot().debug:aiDebug),style:hardStyle,profile:hardProfile,stage:enemy.stage,speed:kmh(enemy)}},
 stats(){return JSON.parse(JSON.stringify(combatStats))},
 state(){return{game,level,hardStyle,hardProfile,weapon,player:{hp:player.hp,stage:player.stage},enemy:{hp:enemy.hp,stage:enemy.stage},missiles:missiles.length,bullets:bullets.length}},
 plans:PLAN_NAMES.slice()
};
weapon='msl';player=plane(-305,185,-.18,'#66dfff');enemy=plane(305,-185,PI+.18,'#ff7890');requestAnimationFrame(loop);mouseStatus();
})();
