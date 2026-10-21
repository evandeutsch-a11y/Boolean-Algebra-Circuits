(() => {
  const svg = document.querySelector('#canvas'), wrap = document.querySelector('#canvasWrap');
  const wiresEl = document.querySelector('#wires'), nodesEl = document.querySelector('#nodes'), ghostsEl = document.querySelector('#ghosts');
  const ns = 'http://www.w3.org/2000/svg';
  const state = { nodes: [], wires: [], selected: null, selectedWire:null, quickDelete:false, circuitId:null, projectName:'Untitled circuit', zoom: 1, pan: {x:0,y:0}, grid: true, connectFrom: null, draggingWire: false, suppressPortClick: false, suppressWireClick:false, space: false, panning: false, history: [], future: [], values: {}, intentionalEmpty: false, showAllGates:false, truthInputs:null, truthOutputs:null, gateCounters:{} };
  const dims = {w:0,h:0}; let toastTimer;
  const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid = () => 'n'+Math.random().toString(36).slice(2,9);
  function getSavedCircuits(){try{const list=JSON.parse(localStorage.getItem('logiclab-circuits')||'[]');return Array.isArray(list)?list:[];}catch{return[];}}
  function updateCircuitList(){const select=document.querySelector('#circuitSelect');if(!select)return;const circuits=getSavedCircuits();select.innerHTML='';for(const c of circuits){const option=document.createElement('option');option.value=c.circuitId;option.textContent=c.projectName||'Untitled circuit';select.append(option);}if(state.circuitId&&circuits.some(c=>c.circuitId===state.circuitId))select.value=state.circuitId;}
  function save(){const circuit={circuitId:state.circuitId||uid(),nodes:state.nodes,wires:state.wires,projectName:state.projectName,quickDelete:state.quickDelete,intentionalEmpty:state.intentionalEmpty,gateCounters:state.gateCounters,savedAt:Date.now()};state.circuitId=circuit.circuitId;localStorage.setItem('logiclab-circuit',JSON.stringify(circuit));const circuits=getSavedCircuits(),index=circuits.findIndex(c=>c.circuitId===circuit.circuitId);if(index>=0)circuits[index]=circuit;else circuits.unshift(circuit);localStorage.setItem('logiclab-circuits',JSON.stringify(circuits));updateCircuitList();document.querySelector('.saved').textContent='Saved locally';}
  function createCircuit(){save();const circuits=getSavedCircuits();state.circuitId=uid();state.projectName=`Circuit ${circuits.length+1}`;state.nodes=[];state.wires=[];state.values={};state.gateCounters={};state.selected=null;state.selectedWire=null;state.connectFrom=null;state.history=[];state.future=[];state.pan={x:0,y:0};state.zoom=1;state.intentionalEmpty=true;render();notify('New circuit created');}
  function openCircuit(id){if(id===state.circuitId)return;save();const circuit=getSavedCircuits().find(c=>c.circuitId===id);if(!circuit)return;state.circuitId=circuit.circuitId;state.history=[];state.future=[];state.values={};state.gateCounters={};restore(JSON.stringify(circuit));notify(`Opened ${circuit.projectName||'circuit'}`);}
  function checkpoint(){state.history.push(JSON.stringify({nodes:state.nodes,wires:state.wires}));if(state.history.length>40)state.history.shift();state.future=[];}
  function historyChange(beforeRaw,afterRaw){
    try{
      const before=JSON.parse(beforeRaw),after=JSON.parse(afterRaw),beforeNodes=new Map((before.nodes||[]).map(n=>[n.id,n])),afterNodes=new Map((after.nodes||[]).map(n=>[n.id,n]));
      for(const [id,n] of beforeNodes)if(!afterNodes.has(id))return{kind:'delete',subject:n.name||n.type};
      for(const [id,n] of afterNodes)if(!beforeNodes.has(id))return{kind:'add',subject:n.name||n.type};
      for(const [id,a] of beforeNodes){const b=afterNodes.get(id);if(!b)continue;const name=a.name||a.type;
        if(a.type!==b.type)return{kind:'change gate',subject:name};
        if(a.name!==b.name)return{kind:'rename',subject:b.name||a.name};
        if(a.inputs!==b.inputs)return{kind:'change input count',subject:name};
        if(a.pattern!==b.pattern)return{kind:'edit input sequence',subject:name};
        if(a.x!==b.x||a.y!==b.y)return{kind:'move',subject:name};
      }
      const wireKey=w=>`${w.from}|${w.to}|${w.input}`,oldWires=new Set((before.wires||[]).map(wireKey)),newWires=new Set((after.wires||[]).map(wireKey));
      const removed=[...oldWires].filter(w=>!newWires.has(w)).length,added=[...newWires].filter(w=>!oldWires.has(w)).length;
      if(removed&&added)return{kind:'change connection',subject:''};
      if(removed)return{kind:'delete connection',subject:''};
      if(added)return{kind:'add connection',subject:''};
    }catch{}
    return{kind:'change',subject:'circuit'};
  }
  function historyNotice(direction,change){
    const subject=change.subject?` ${change.subject}`:'';
    if(change.kind==='delete')return direction==='undo'?`Undo delete: restored${subject}.`:`Redo delete: removed${subject}.`;
    if(change.kind==='add')return direction==='undo'?`Undo add: removed${subject}.`:`Redo add: restored${subject}.`;
    return `${direction==='undo'?'Undo':'Redo'} ${change.kind}${subject}.`;
  }
  function canonicalPattern(index,count){const rows=2**Math.min(count,8),span=2**Math.max(0,Math.min(count,8)-index-1);return Array.from({length:rows},(_,row)=>Math.floor(row/span)%2).join('');}
  function repeatPattern(pattern,minLength){const bits=String(pattern||'0').replace(/[^01]/g,'')||'0';return bits.length>=minLength?bits:bits.repeat(Math.ceil(minLength/bits.length)).slice(0,minLength);}
  function uniqueInputName(name,exceptId=null){const used=new Set(state.nodes.filter(n=>n.type==='INPUT'&&n.id!==exceptId).map(n=>n.name.trim().toLowerCase()));let base=name||'A',candidate=base,suffix=2;while(used.has(candidate.trim().toLowerCase()))candidate=`${base}${suffix++}`;return candidate;}
  function reserveGateName(n){const match=String(n.name||'').match(new RegExp('^'+n.type+'(\\d+)$','i'));if(match)state.gateCounters[n.type]=Math.max(state.gateCounters[n.type]||0,+match[1]);}
  function nextGateName(type){let index=(state.gateCounters[type]||0)+1,used=new Set(state.nodes.filter(n=>['AND','OR','NOT','XOR','NAND','NOR','XNOR'].includes(n.type)).map(n=>n.name.trim().toLowerCase()));while(used.has((type+index).toLowerCase()))index++;state.gateCounters[type]=index;return type+index;}
  function restore(raw){try{const d=JSON.parse(raw);if(d.gateCounters)state.gateCounters={...state.gateCounters,...d.gateCounters};state.nodes=d.nodes||[];state.wires=d.wires||[];state.projectName=String(d.projectName||state.projectName||'Untitled circuit').slice(0,24);state.quickDelete=!!d.quickDelete;state.intentionalEmpty=!!d.intentionalEmpty;const gateNames=new Set();state.nodes.filter(n=>['AND','OR','NOT','XOR','NAND','NOR','XNOR'].includes(n.type)).forEach(n=>{n.name=String(n.name||'').slice(0,16);const key=n.name.trim().toLowerCase();if(!key||(key===n.type.toLowerCase()&&n.autoName!==false)||gateNames.has(key)){n.name=nextGateName(n.type);n.autoName=true;}gateNames.add(String(n.name).trim().toLowerCase());reserveGateName(n);});const ins=state.nodes.filter(n=>n.type==='INPUT');ins.forEach((n,i)=>{n.name=String(n.name||String.fromCharCode(65+i)).slice(0,16);if(n.patternCustom===undefined)n.patternCustom=false;n.pattern=n.patternCustom?repeatPattern(n.pattern,2**Math.min(ins.length,8)):canonicalPattern(i,ins.length);});if(!state.nodes.length&&!state.intentionalEmpty){seedCircuit();return;}state.selected=null;state.selectedWire=null;render();}catch{notify('That circuit file could not be opened.')}}
  function node(type,x,y,name){const same=state.nodes.filter(n=>n.type===type).length;const inIndex=state.nodes.filter(n=>n.type==='INPUT').length,totalInputs=inIndex+1,isGate=['AND','OR','NOT','XOR','NAND','NOR','XNOR'].includes(type);const defaultName=type==='INPUT'?uniqueInputName(String.fromCharCode(65+inIndex)):type==='OUTPUT'?'Y'+(same||''):isGate?nextGateName(type):type;return{id:uid(),type,x,y,name:name||defaultName,autoName:isGate&&!name,value:false,inputs:2,pattern:type==='INPUT'?canonicalPattern(inIndex,totalInputs):undefined,patternCustom:false};}
  function addNode(type,x,y){checkpoint();const n=node(type,x,y);state.nodes.push(n);state.intentionalEmpty=false;if(type==='INPUT'){const ins=state.nodes.filter(x=>x.type==='INPUT'),minimum=2**Math.min(ins.length,8);ins.forEach((item,i)=>{item.pattern=item.patternCustom?repeatPattern(item.pattern,minimum):canonicalPattern(i,ins.length);});}state.selected=n.id;render();notify(type+' added');}
  function seedCircuit(){const a=node('INPUT',105,135,'A'),b=node('INPUT',105,250,'B'),g=node('AND',330,177),o=node('OUTPUT',560,185,'Y');a.pattern='0011';b.pattern='0101';state.nodes=[a,b,g,o];state.wires=[{from:a.id,to:g.id,input:0},{from:b.id,to:g.id,input:1},{from:g.id,to:o.id,input:0}];state.values[a.id]=true;state.values[b.id]=true;state.intentionalEmpty=false;render();}
  function S(tag,attrs={},content=''){const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(content)e.textContent=content;return e;}
  function drawGate(g,n,d){
    const inverted=['NAND','NOR','XNOR','NOT'].includes(n.type),xor=['XOR','XNOR'].includes(n.type);let bodyEnd=88,bubbleX=93;if(n.type==='AND'||n.type==='NAND'){bodyEnd=75;bubbleX=80;}
    const label=S('text',{x:d.w/2,y:12,'text-anchor':'middle',class:'node-label'},n.name||n.type);g.append(label);
    for(let i=0;i<inputs(n);i++){const y=(i+1)*d.h/(inputs(n)+1),to=n.type==='NOT'?31:n.type==='AND'||n.type==='NAND'?28:xor?23:34;g.append(S('path',{d:`M0 ${y} H${to}`,class:'gate-lead'}));}
    if(n.type==='AND'||n.type==='NAND')g.append(S('path',{d:'M28 17 H53 A22 22 0 0 1 53 61 H28 Z',class:'gate-outline'}));
    else if(n.type==='OR'||n.type==='NOR'||xor)g.append(S('path',{d:'M30 17 C49 20 68 28 88 39 C68 50 49 58 30 61 C39 50 39 28 30 17 Z',class:'gate-outline'}));
    else if(n.type==='NOT') {bodyEnd=79;bubbleX=84;g.append(S('path',{d:'M31 18 L79 39 L31 60 Z',class:'gate-outline'}));}
    if(xor)g.append(S('path',{d:'M23 17 C32 28 32 50 23 61',class:'gate-extra'}));
    const tip=inverted?bubbleX-5:bodyEnd;
    if(inverted)g.append(S('circle',{cx:bubbleX,cy:39,r:5,class:'gate-bubble'}));
    g.append(S('path',{d:`M${inverted?bubbleX+5:tip} 39 H${d.w}`,class:'gate-lead'}));
  }
  function point(e){const r=svg.getBoundingClientRect();return{x:(e.clientX-r.left-state.pan.x)/state.zoom,y:(e.clientY-r.top-state.pan.y)/state.zoom};}
  function size(n){return n.type==='INPUT'||n.type==='OUTPUT'?{w:112,h:58}:{w:130,h:78};}
  function inputs(n){if(n.type==='INPUT')return 0;if(n.type==='NOT')return 1;if(n.type==='OUTPUT')return 1;return Math.max(2,n.inputs||2);}
  function anchor(n,kind,index=0){const d=size(n), count=inputs(n);if(kind==='out')return{x:n.x+d.w,y:n.y+d.h/2};return{x:n.x,y:n.y+(index+1)*d.h/(count+1)};}
  function render(){
    const w=wrap.clientWidth,h=wrap.clientHeight;dims.w=w;dims.h=h;svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
    const transform=`translate(${state.pan.x} ${state.pan.y}) scale(${state.zoom})`;wiresEl.setAttribute('transform',transform);nodesEl.setAttribute('transform',transform);ghostsEl.setAttribute('transform',transform);
    document.querySelector('#gridRect').style.display=state.grid?'':'none';document.querySelector('#emptyState').style.display=state.nodes.length?'none':'block';
    wiresEl.innerHTML='';nodesEl.innerHTML='';ghostsEl.innerHTML='';const results=simulate(state.values);
    for(const wire of state.wires){const a=state.nodes.find(n=>n.id===wire.from),b=state.nodes.find(n=>n.id===wire.to);if(!a||!b)continue;const p=anchor(a,'out'),q=anchor(b,'in',wire.input||0),dx=Math.max(32,Math.abs(q.x-p.x)*.48)*Math.sign(q.x-p.x||1),d=`M${p.x},${p.y} C${p.x+dx},${p.y} ${q.x-dx},${q.y} ${q.x},${q.y}`,hit=S('path',{d,class:'wire-hit', 'aria-label':state.quickDelete?'Click to delete connection':'Click to select; press Delete to remove'}),el=S('path',{d,class:`wire ${results[wire.to]?.inputs?.[wire.input||0]?'on':''} ${state.selectedWire===wire?'selected':''}`});hit.addEventListener('pointerdown',e=>beginWireLineDrag(e,wire,a,b,p,q));hit.addEventListener('click',e=>{e.stopPropagation();if(state.suppressWireClick){state.suppressWireClick=false;return;}if(state.quickDelete){checkpoint();state.wires=state.wires.filter(x=>x!==wire);state.selectedWire=null;render();notify('Connection removed');}else{state.selectedWire=wire;state.selected=null;render();notify('Connection selected. Press Delete to remove.');}});wiresEl.append(hit,el);}
    for(const n of state.nodes){const d=size(n),g=S('g',{transform:`translate(${n.x} ${n.y})`,class:`node-group ${n.type==='INPUT'?'node-input':n.type==='OUTPUT'?'node-output':''} ${state.selected===n.id?'selected':''}`,'data-id':n.id});
      g.append(S('rect',{x:0,y:0,width:d.w,height:d.h,rx:8,class:'node-shape'}));
      if(['AND','OR','NOT','XOR','NAND','NOR','XNOR'].includes(n.type))drawGate(g,n,d);
      if(n.type==='INPUT'){g.append(S('circle',{cx:21,cy:d.h/2,r:8,fill:state.values[n.id]?'#2cac70':'#cbd6ce'}));g.append(S('text',{x:42,y:d.h/2-2,class:'node-title'},n.name));g.append(S('text',{x:42,y:d.h/2+12,class:`node-value ${state.values[n.id]?'on':'off'}`},state.values[n.id]?'1':'0'));}
      else if(n.type==='OUTPUT'){const val=results[n.id]?.value;g.append(S('circle',{cx:d.w-20,cy:d.h/2,r:8,fill:val?'#2cac70':'#d7dfd9'}));g.append(S('text',{x:14,y:d.h/2-2,class:'node-title'},n.name));g.append(S('text',{x:14,y:d.h/2+12,class:`node-value ${val?'on':'off'}`},val?'1':'0'));}
      if(n.type!=='INPUT'){for(let i=0;i<inputs(n);i++){const port=S('circle',{cx:0,cy:(i+1)*d.h/(inputs(n)+1),r:4,class:'port','data-port':'in','data-index':i});port.addEventListener('pointerdown',e=>beginWireDrag(e,n,'in',i));g.append(port);}}
      if(n.type!=='OUTPUT'){const port=S('circle',{cx:d.w,cy:d.h/2,r:4,class:'port','data-port':'out'});port.addEventListener('pointerdown',e=>beginWireDrag(e,n,'out',0));g.append(port);}
      const del=S('text',{x:d.w-6,y:9,'text-anchor':'middle',class:'node-delete','font-size':12},'×');del.addEventListener('click',e=>{e.stopPropagation();removeNode(n.id)});g.append(del);
      g.addEventListener('pointerdown',e=>nodeDown(e,n));g.addEventListener('click',e=>{if(e.target.classList.contains('port')){e.stopPropagation();portClick(n,e.target.dataset.port,+e.target.dataset.index||0);}else if(state.quickDelete){removeNode(n.id);notify('Component removed');}else{state.selected=n.id;state.selectedWire=null;if(n.type==='INPUT')state.values[n.id]=!state.values[n.id];render();inspector();}});nodesEl.append(g);
    }
    const quickDeleteBtn=document.querySelector('#quickDeleteBtn');quickDeleteBtn.classList.toggle('active',state.quickDelete);quickDeleteBtn.setAttribute('aria-pressed',String(state.quickDelete));quickDeleteBtn.title=state.quickDelete?'Turn off click-to-delete':'Turn on click-to-delete';document.querySelector('#projectNameInput').value=state.projectName;document.querySelector('#nodeCount').textContent=`${state.nodes.length} component${state.nodes.length===1?'':'s'}`;document.querySelector('#zoomLabel').textContent=Math.round(state.zoom*100)+'%';document.querySelector('#zoomReadout').textContent=Math.round(state.zoom*100)+'%';updateSimulation(results);inspector();if(document.querySelector('#equationPanel').classList.contains('open'))renderEquationPanel();save();
  }
  function nodeDown(e,n){if(state.quickDelete){e.stopPropagation();return;}if(e.target.classList.contains('port')||e.target.classList.contains('node-delete'))return;e.stopPropagation();if(e.button!==0)return;state.selected=n.id;const p=point(e),origin={x:n.x,y:n.y};let moved=false,frame=0,last=e;const draw=()=>{frame=0;const q=point(last);n.x=origin.x+q.x-p.x;n.y=origin.y+q.y-p.y;render();};const move=ev=>{last=ev;if(!moved&&Math.hypot(ev.clientX-e.clientX,ev.clientY-e.clientY)<=10)return;if(!moved){checkpoint();moved=true;}if(!frame)frame=requestAnimationFrame(draw);};const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);if(frame){cancelAnimationFrame(frame);draw();}if(moved)save();};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true});}
  function connectWire(source,target,index){if(!source||!target||source.id===target.id)return;checkpoint();state.wires=state.wires.filter(w=>!(w.to===target.id&&w.input===index));state.wires.push({from:source.id,to:target.id,input:index});state.connectFrom=null;state.selected=target.id;state.selectedWire=null;render();notify('Signal connected');}
  function inputPortAt(clientX,clientY,sourceId){const rect=svg.getBoundingClientRect();let nearest=null,best=30;for(const target of state.nodes){if(target.id===sourceId||target.type==='INPUT')continue;for(let i=0;i<inputs(target);i++){const p=anchor(target,'in',i),x=rect.left+state.pan.x+p.x*state.zoom,y=rect.top+state.pan.y+p.y*state.zoom,d=Math.hypot(clientX-x,clientY-y);if(d<best){best=d;nearest={target,index:i};}}}if(nearest)return nearest;
    // Make gate-to-gate wiring forgiving: dropping anywhere on a gate/output body
    // routes the line to the closest input terminal instead of requiring a tiny hit target.
    const world=point({clientX,clientY});for(const target of state.nodes){if(target.id===sourceId||target.type==='INPUT')continue;const d=size(target);if(world.x<target.x-8||world.x>target.x+d.w+8||world.y<target.y-8||world.y>target.y+d.h+8)continue;let closest=null,distance=Infinity;for(let i=0;i<inputs(target);i++){const pin=anchor(target,'in',i),delta=Math.hypot(world.x-pin.x,world.y-pin.y);if(delta<distance){distance=delta;closest={target,index:i};}}if(closest)return closest;}return null;}
  function outputPortAt(clientX,clientY,targetId){const rect=svg.getBoundingClientRect();let nearest=null,best=25;for(const source of state.nodes){if(source.id===targetId||source.type==='OUTPUT')continue;const p=anchor(source,'out'),x=rect.left+state.pan.x+p.x*state.zoom,y=rect.top+state.pan.y+p.y*state.zoom,d=Math.hypot(clientX-x,clientY-y);if(d<best){best=d;nearest=source;}}return nearest;}
  function beginWireLineDrag(e,wire,source,target,sourcePoint,targetPoint){e.preventDefault();e.stopPropagation();const rect=svg.getBoundingClientRect(),startClient={x:e.clientX,y:e.clientY},moveTarget=Math.hypot(e.clientX-(rect.left+state.pan.x+targetPoint.x*state.zoom),e.clientY-(rect.top+state.pan.y+targetPoint.y*state.zoom))<Math.hypot(e.clientX-(rect.left+state.pan.x+sourcePoint.x*state.zoom),e.clientY-(rect.top+state.pan.y+sourcePoint.y*state.zoom)),fixed=moveTarget?sourcePoint:targetPoint,preview=S('path',{class:'wire wire-preview'});let moved=false,frame=0,last=e;ghostsEl.innerHTML='';ghostsEl.append(preview);const draw=()=>{frame=0;const end=point(last),dx=Math.max(38,Math.abs(end.x-fixed.x)*.48)*Math.sign(end.x-fixed.x||1);preview.setAttribute('d',`M${fixed.x},${fixed.y} C${fixed.x+dx},${fixed.y} ${end.x-dx},${end.y} ${end.x},${end.y}`);};const move=ev=>{last=ev;if(Math.hypot(ev.clientX-startClient.x,ev.clientY-startClient.y)>5)moved=true;if(!frame)frame=requestAnimationFrame(draw);};const finish=ev=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);if(frame)cancelAnimationFrame(frame);ghostsEl.innerHTML='';if(!moved)return;state.suppressWireClick=true;state.suppressPortClick=true;setTimeout(()=>{state.suppressWireClick=false;state.suppressPortClick=false;},350);if(moveTarget){const hit=inputPortAt(ev.clientX,ev.clientY,source.id);if(hit){const occupied=state.wires.some(w=>w!==wire&&w.to===hit.target.id&&(w.input||0)===hit.index);if(occupied){notify('That input already has a wire.');render();return;}checkpoint();wire.to=hit.target.id;wire.input=hit.index;notify('Wire rerouted');}else{checkpoint();state.wires=state.wires.filter(w=>w!==wire);notify('Wire disconnected');}}else{const hit=outputPortAt(ev.clientX,ev.clientY,target.id);if(hit){checkpoint();wire.from=hit.id;notify('Wire rerouted');}else{checkpoint();state.wires=state.wires.filter(w=>w!==wire);notify('Wire disconnected');}}render();};window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish,{once:true});}
  function beginWireRewire(e,target,index,wire){
    if(e.button!==0)return;
    e.preventDefault();e.stopPropagation();
    const start=anchor(target,'in',index),client={x:e.clientX,y:e.clientY},preview=S('path',{class:'wire wire-preview'});
    let moved=false,frame=0,last=e;
    ghostsEl.innerHTML='';ghostsEl.append(preview);
    const draw=()=>{frame=0;const end=point(last),dx=Math.max(38,Math.abs(end.x-start.x)*.48)*Math.sign(end.x-start.x||1);preview.setAttribute('d',`M${start.x},${start.y} C${start.x+dx},${start.y} ${end.x-dx},${end.y} ${end.x},${end.y}`);};
    const move=ev=>{last=ev;if(Math.hypot(ev.clientX-client.x,ev.clientY-client.y)>4)moved=true;if(!frame)frame=requestAnimationFrame(draw);};
    draw();
    const finish=ev=>{
      window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);if(frame)cancelAnimationFrame(frame);ghostsEl.innerHTML='';
      if(!moved)return;
      state.suppressPortClick=true;setTimeout(()=>state.suppressPortClick=false,300);
      const nextInput=inputPortAt(ev.clientX,ev.clientY,wire.from);
      const nextOutput=outputPortAt(ev.clientX,ev.clientY,target.id);
      if(nextInput){
        const occupied=state.wires.some(w=>w!==wire&&w.to===nextInput.target.id&&(w.input||0)===nextInput.index);
        if(occupied){notify('That input already has a wire.');render();return;}
        checkpoint();wire.to=nextInput.target.id;wire.input=nextInput.index;notify('Wire moved to the new gate input.');
      }else if(nextOutput){checkpoint();wire.from=nextOutput.id;notify('Wire source changed.');}
      else{checkpoint();state.wires=state.wires.filter(w=>w!==wire);notify('Wire disconnected.');}
      render();
    };
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish,{once:true});
  }
  function beginWireFromInput(e,n,index){if(e.button!==0)return;e.preventDefault();e.stopPropagation();const start=anchor(n,'in',index),startClient={x:e.clientX,y:e.clientY},preview=S('path',{class:'wire wire-preview'});let moved=false,frame=0,last=e;ghostsEl.innerHTML='';ghostsEl.append(preview);const draw=()=>{frame=0;const end=point(last),dx=Math.max(38,Math.abs(end.x-start.x)*.48)*Math.sign(end.x-start.x||1);preview.setAttribute('d',`M${start.x},${start.y} C${start.x+dx},${start.y} ${end.x-dx},${end.y} ${end.x},${end.y}`);};const move=ev=>{last=ev;if(Math.hypot(ev.clientX-startClient.x,ev.clientY-startClient.y)>4)moved=true;if(!frame)frame=requestAnimationFrame(draw);};draw();const finish=ev=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);if(frame)cancelAnimationFrame(frame);ghostsEl.innerHTML='';if(!moved)return;state.suppressPortClick=true;setTimeout(()=>state.suppressPortClick=false,300);const source=outputPortAt(ev.clientX,ev.clientY,n.id);if(source)connectWire(source,n,index);else render();};window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish,{once:true});}
  function beginWireDrag(e,n,kind,index){if(kind==='in'){const wire=state.wires.find(w=>w.to===n.id&&(w.input||0)===index);if(wire)beginWireRewire(e,n,index,wire);else beginWireFromInput(e,n,index);return;}if(kind!=='out'||e.button!==0)return;e.preventDefault();e.stopPropagation();state.draggingWire=true;const start=anchor(n,'out'),startClient={x:e.clientX,y:e.clientY},preview=S('path',{class:'wire wire-preview'});let moved=false,frame=0,last=e;ghostsEl.innerHTML='';ghostsEl.append(preview);const draw=()=>{frame=0;const end=point(last),dx=Math.max(38,Math.abs(end.x-start.x)*.48)*Math.sign(end.x-start.x||1);preview.setAttribute('d',`M${start.x},${start.y} C${start.x+dx},${start.y} ${end.x-dx},${end.y} ${end.x},${end.y}`);};const move=ev=>{last=ev;if(Math.hypot(ev.clientX-startClient.x,ev.clientY-startClient.y)>4)moved=true;if(!frame)frame=requestAnimationFrame(draw);};draw();const finish=ev=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);if(frame)cancelAnimationFrame(frame);ghostsEl.innerHTML='';state.draggingWire=false;if(!moved)return;state.suppressPortClick=true;setTimeout(()=>state.suppressPortClick=false,300);const hit=inputPortAt(ev.clientX,ev.clientY,n.id);if(hit)connectWire(n,hit.target,hit.index);else render();};window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish,{once:true});}
  function portClick(n,kind,index){if(state.suppressPortClick)return;if(kind==='out'){state.connectFrom=n.id;render();document.querySelectorAll(`[data-id="${n.id}"] .port[data-port="out"]`).forEach(p=>p.classList.add('active'));notify('Drag the output dot onto a gate or output input');return;}if(!state.connectFrom)return;const src=state.nodes.find(x=>x.id===state.connectFrom);if(src)connectWire(src,n,index);else{state.connectFrom=null;render();}}
  function removeNode(id){checkpoint();state.nodes=state.nodes.filter(n=>n.id!==id);state.wires=state.wires.filter(w=>w.from!==id&&w.to!==id);if(state.selected===id)state.selected=null;if(state.selectedWire&&(state.selectedWire.from===id||state.selectedWire.to===id))state.selectedWire=null;if(!state.nodes.length)state.intentionalEmpty=true;render();}
  function deleteSelection(){if(state.selectedWire){checkpoint();state.wires=state.wires.filter(w=>w!==state.selectedWire);state.selectedWire=null;render();notify('Connection removed');}else if(state.selected)removeNode(state.selected);else notify('Select a component or wire first.');}
  function simulate(overrides={}){const result={};for(const n of state.nodes){if(n.type==='INPUT')result[n.id]={value:!!(overrides[n.id]??n.value)};else result[n.id]={value:false,inputs:[]};}for(let pass=0;pass<state.nodes.length+1;pass++){let changed=false;for(const n of state.nodes){if(n.type==='INPUT')continue;const wires=Array.from({length:inputs(n)},(_,i)=>state.wires.find(w=>w.to===n.id&&(w.input||0)===i)),ins=wires.map(w=>w?!!result[w.from]?.value:false),connected=wires.filter(Boolean).map(w=>!!result[w.from]?.value);let v=false;switch(n.type){case'OUTPUT':case'BUF':v=connected[0]||false;break;case'NOT':v=connected.length?!connected[0]:false;break;case'AND':v=connected.length>0&&connected.every(Boolean);break;case'NAND':v=connected.length>0&&!connected.every(Boolean);break;case'OR':v=connected.some(Boolean);break;case'NOR':v=connected.length>0&&!connected.some(Boolean);break;case'XOR':v=connected.filter(Boolean).length%2===1;break;case'XNOR':v=connected.length>0&&connected.filter(Boolean).length%2===0;break;}if(n.invert)v=!v;if(result[n.id].value!==v)changed=true;result[n.id]={value:v,inputs:ins};}if(!changed)break;}return result;}
  function updateSimulation(result){const box=document.querySelector('#simOutputs'),outs=state.nodes.filter(n=>n.type==='OUTPUT');box.innerHTML=outs.length?outs.map(n=>`<div class="sim-row"><span>${esc(n.name)}</span><span class="sim-val ${result[n.id]?.value?'on':''}">${result[n.id]?.value?'1 · TRUE':'0 · FALSE'}</span></div>`).join(''):'<span class="no-output">Add an output node</span>';}
  function gateColumnLabel(n){if(n.type==='NOT'){const wire=state.wires.find(w=>w.to===n.id&&(w.input||0)===0),source=wire&&state.nodes.find(item=>item.id===wire.from);return '<span class="logic-overbar">'+esc(source?.name||source?.type||n.name||n.type)+'</span> <small class="gate-name-suffix">'+esc(n.name||n.type)+'</small>';}return esc(n.name||n.type);}
  function gateTruthMarkup(gate){
    const output=state.nodes.find(n=>n.type==='OUTPUT'&&n.name.trim().toLowerCase()==='y')||state.nodes.find(n=>n.type==='OUTPUT');
    return `<div class="gate-truth"><p class="property-note">${output?`Press Run to see ${esc(output.name)}'s truth table.`:'Add an output to run a truth table.'}</p></div>`;
  }
  function inspector(){
    const box=document.querySelector('#inspector'),n=state.nodes.find(x=>x.id===state.selected);
    if(!n){box.innerHTML='<div class="inspector-empty"><div class="inspect-glyph">◈</div><h3>Nothing selected</h3><p>Select a component on the canvas to view and edit its properties.</p></div>';return;}
    const isIn=n.type==='INPUT',isOut=n.type==='OUTPUT',gate=!isIn&&!isOut;
    box.innerHTML=`<div class="property-form"><div class="eyebrow">${esc(n.type)} COMPONENT</div><label class="prop-label">${isIn?'VARIABLE NAME':'LABEL'}</label><input class="prop-input" id="propName" maxlength="16" value="${esc(n.name)}"/>${isIn?`<label class="prop-label">INPUT BIT SEQUENCE</label><input class="prop-input" id="propPattern" maxlength="256" value="${esc(n.pattern||'0')}" placeholder="0011 or 0 0 1 1"/><p class="property-note">Enter 0s and 1s in row order. Shorter sequences repeat to match the longest input.</p>`:''}${gate?`<label class="prop-label">GATE TYPE</label><select class="prop-input" id="propType">${['AND','OR','NOT','XOR','NAND','NOR','XNOR'].map(type=>`<option value="${type}" ${n.type===type?'selected':''}>${type}</option>`).join('')}</select>`:''}<label class="prop-label">COMPONENT ID</label><input class="prop-input" value="${esc(n.id)}" readonly/>${isIn||isOut?`<div class="prop-toggle"><span>${isIn?'Live value': 'Invert output'}</span><button id="propToggle" class="toggle ${n.value?'on':''}"><i></i></button></div>`:''}${gate&&n.type!=='NOT'?`<label class="prop-label">INPUT PORTS</label><select class="prop-input" id="propInputs"><option value="2" ${inputs(n)===2?'selected':''}>2 inputs</option><option value="3" ${inputs(n)===3?'selected':''}>3 inputs</option><option value="4" ${inputs(n)===4?'selected':''}>4 inputs</option></select>`:''}${gate||isIn?gateTruthMarkup(n):''}${isOut?`<p class="property-note">Output reflects the connected signal.</p>`:''}</div>`;
    document.querySelector('#propName').addEventListener('change',e=>{const next=e.target.value.trim()||(isIn?'A':n.type),duplicate=state.nodes.some(other=>other.id!==n.id&&((isIn&&other.type==='INPUT')||(gate&&['AND','OR','NOT','XOR','NAND','NOR','XNOR'].includes(other.type)))&&other.name.trim().toLowerCase()===next.toLowerCase());if(duplicate){e.target.value=n.name;notify(isIn?'Input variable names must be unique.':'Logic gate names must be unique.');return;}checkpoint();n.name=next;if(gate){n.autoName=false;reserveGateName(n);}render();});
    const pattern=document.querySelector('#propPattern');if(pattern)pattern.addEventListener('change',e=>{const bits=(e.target.value.match(/[01]/g)||[]).slice(0,256).join('');if(!bits){e.target.value=n.pattern||'0';notify('Enter at least one 0 or 1.');return;}checkpoint();n.pattern=repeatPattern(bits,2**Math.min(state.nodes.filter(x=>x.type==='INPUT').length,8));n.patternCustom=true;e.target.value=n.pattern;render();notify('Input sequence updated');});
    const toggle=document.querySelector('#propToggle');if(toggle)toggle.addEventListener('click',()=>{if(isIn){state.values[n.id]=!state.values[n.id];}else{n.invert=!n.invert;}render();});
    const typeSelect=document.querySelector('#propType');if(typeSelect)typeSelect.addEventListener('change',e=>{const oldType=n.type,next=e.target.value,autoName=n.autoName;checkpoint();n.type=next;if(autoName){n.name=nextGateName(next);n.autoName=true;}if(next==='NOT')n.inputs=1;else if(oldType==='NOT')n.inputs=2;state.wires=state.wires.filter(w=>w.to!==n.id||w.input<inputs(n));render();notify(`Gate changed to ${next}`);});
    const sel=document.querySelector('#propInputs');if(sel)sel.addEventListener('change',e=>{checkpoint();n.inputs=+e.target.value;state.wires=state.wires.filter(w=>w.to!==n.id||w.input<inputs(n));render();});
  }
  function traceCircuit(targets){
    const inputsFound=new Map(),gates=[],visited=new Set(),active=new Set();
    function visit(n){if(active.has(n.id)||visited.has(n.id))return;active.add(n.id);if(n.type==='INPUT')inputsFound.set(n.id,n);else{for(let i=0;i<inputs(n);i++){const wire=state.wires.find(w=>w.to===n.id&&(w.input||0)===i),source=wire&&state.nodes.find(item=>item.id===wire.from);if(source)visit(source);}if(!['OUTPUT','INPUT'].includes(n.type))gates.push(n);}active.delete(n.id);visited.add(n.id);}
    targets.forEach(visit);return{inputs:[...inputsFound.values()],gates};
  }
  function traceOutput(target){return traceCircuit([target]);}
  function truth(ins=state.nodes.filter(n=>n.type==='INPUT'),outs=state.nodes.filter(n=>n.type==='OUTPUT')){
    const host=document.querySelector('#truthContent');state.truthInputs=ins;state.truthOutputs=outs;const expand=document.querySelector('#expandGatesBtn');if(expand){expand.textContent=state.showAllGates?'Show outputs only':'Expand to every logic gate';expand.setAttribute('aria-expanded',String(state.showAllGates));}
    if(!ins.length||!outs.length){host.innerHTML='<div class="empty-analysis">Connect at least one input to the output to generate a truth table.</div>';return null;}
    if(ins.length>8){host.innerHTML='<div class="empty-analysis">Truth tables support up to 8 inputs.</div>';return null;}
    const minimum=2**Math.min(ins.length,8),patterns=ins.map(n=>repeatPattern(n.pattern,minimum)),rows=Math.max(minimum,...patterns.map(p=>p.length));
    if(rows>256){host.innerHTML='<div class="empty-analysis">Input sequences can contain up to 256 rows.</div>';return null;}
    const gateNodes=state.showAllGates?traceCircuit(outs).gates:[],columns=[...gateNodes,...outs];
    const editors='<div class="sequence-editors"><strong>Input sequences</strong><span>Edit the 0/1 arrays, then press Enter or leave the field.</span>'+ins.map((n,i)=>`<label>${esc(n.name)}<input class="sequence-input" data-node="${esc(n.id)}" maxlength="256" value="${patterns[i]}" aria-label="${esc(n.name)} input sequence" /></label>`).join('')+'</div>';
    let html=editors+'<div class="truth-table-scroll"><table class="truth-table"><thead><tr>'+ins.map(n=>`<th>${esc(n.name)}</th>`).join('')+columns.map(n=>gateNodes.includes(n)?`<th><button type="button" class="gate-array-button" data-gate-id="${esc(n.id)}">${gateColumnLabel(n)}</button></th>`:`<th>${esc(n.name)}</th>`).join('')+'</tr></thead><tbody>';
    const sequences=Object.fromEntries(columns.map(n=>[n.id,[]]));
    for(let row=0;row<rows;row++){const vals={};ins.forEach((n,i)=>vals[n.id]=patterns[i][row%patterns[i].length]==='1');const result=simulate(vals);for(const col of columns)sequences[col.id].push(result[col.id]?.value?1:0);html+='<tr>'+ins.map(n=>`<td class="${vals[n.id]?'truth-one':'truth-zero'}">${vals[n.id]?1:0}</td>`).join('')+columns.map(n=>{const gate=gateNodes.includes(n),attrs=gate?`data-gate-id="${esc(n.id)}" tabindex="0" role="button" aria-label="Show ${esc(n.name)} inputs and Boolean equation"`:'';return `<td class="${result[n.id]?.value?'truth-one':'truth-zero'}${gate?' gate-array-value':''}" ${attrs}>${result[n.id]?.value?1:0}</td>`;}).join('')+'</tr>';}
    const detailPanel=gateNodes.length?'<div id="gateEquationDetails" class="gate-equation-details"><span>Click a gate name or one of its array values to view its inputs and Boolean equation.</span></div>':'';
    host.innerHTML=html+'</tbody></table></div>'+detailPanel+'<div class="property-note">Input sequences are evaluated row by row; shorter sequences repeat cyclically. Gate columns follow signal flow toward the outputs.</div>';
    host.querySelectorAll('.gate-array-button,.gate-array-value').forEach(item=>{item.addEventListener('click',()=>showGateArrayDetails(item.dataset.gateId,ins,patterns,rows));item.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showGateArrayDetails(item.dataset.gateId,ins,patterns,rows);}});});
    host.querySelectorAll('.sequence-input').forEach(field=>field.addEventListener('change',e=>{const n=ins.find(x=>x.id===e.target.dataset.node),bits=(e.target.value.match(/[01]/g)||[]).slice(0,256).join('');if(!n||!bits){e.target.value=n?.pattern||'0';notify('Enter at least one 0 or 1.');return;}checkpoint();n.pattern=repeatPattern(bits,2**Math.min(state.nodes.filter(x=>x.type==='INPUT').length,8));n.patternCustom=true;render();truth(ins,outs);}));
    return sequences;
  }
  function traceOutput(target){return traceCircuit([target]);}
  function equationFor(node,active=new Set()){
    if(!node)return '0';
    if(node.type==='INPUT')return esc(node.name||'A');
    if(active.has(node.id))return '<span class="equation-cycle">cycle</span>';
    const nextActive=new Set(active);nextActive.add(node.id);
    if(node.type==='OUTPUT'){
      const wire=state.wires.find(item=>item.to===node.id&&(item.input||0)===0),source=wire&&state.nodes.find(item=>item.id===wire.from);
      let expression=source?equationFor(source,nextActive):'0';
      if(node.invert)expression=`<span class="logic-overbar">${expression.length>30?'('+expression+')':expression}</span>`;
      return expression;
    }
    const sources=[];
    for(let i=0;i<inputs(node);i++){const wire=state.wires.find(item=>item.to===node.id&&(item.input||0)===i),source=wire&&state.nodes.find(item=>item.id===wire.from);if(source)sources.push(equationFor(source,nextActive));}
    if(!sources.length)return node.invert?'1':'0';
    let expression=sources.length===1?sources[0]:sources.join(node.type==='OR'||node.type==='NOR'?' + ':node.type==='XOR'||node.type==='XNOR'?' ⊕ ':' · ');
    let complemented=['NOT','NAND','NOR','XNOR'].includes(node.type);if(node.invert)complemented=!complemented;
    if(complemented)expression=`<span class="logic-overbar">${sources.length>1?'('+expression+')':expression}</span>`;
    return expression;
  }
  function simplifyNode(target){
    const key=e=>e.op==='var'?`v:${e.name}`:e.op==='const'?`c:${e.value}`:e.op==='not'?`!(${key(e.value)})`:`${e.op}(${e.terms.map(key).join(',')})`;
    const variable=name=>({op:'var',name:String(name||'A')}),constant=value=>({op:'const',value:!!value}),not=value=>({op:'not',value}),group=(op,terms)=>({op,terms});
    function build(node,active=new Set()){
      if(!node)return constant(false);if(node.type==='INPUT')return variable(node.name);
      if(active.has(node.id))return variable('cycle');const next=new Set(active);next.add(node.id);
      if(node.type==='OUTPUT'){const wire=state.wires.find(w=>w.to===node.id&&(w.input||0)===0),source=wire&&state.nodes.find(item=>item.id===wire.from);let value=source?build(source,next):constant(false);if(node.invert)value=not(value);return value;}
      const sources=[];for(let i=0;i<inputs(node);i++){const wire=state.wires.find(w=>w.to===node.id&&(w.input||0)===i),source=wire&&state.nodes.find(item=>item.id===wire.from);if(source)sources.push(build(source,next));}
      let value;if(node.type==='NOT')value=sources.length?not(sources[0]):constant(false);
      else if(node.type==='AND')value=sources.length?group('and',sources):constant(false);
      else if(node.type==='NAND')value=sources.length?not(group('and',sources)):constant(false);
      else if(node.type==='OR')value=sources.length?group('or',sources):constant(false);
      else if(node.type==='NOR')value=sources.length?not(group('or',sources)):constant(false);
      else if(node.type==='XOR')value=sources.length?group('xor',sources):constant(false);
      else if(node.type==='XNOR')value=sources.length?not(group('xor',sources)):constant(false);
      else value=sources[0]||constant(false);
      if(node.invert)value=not(value);return value;
    }
    const precedence={or:1,xor:2,and:3,not:4,var:5,const:5};
    function render(e,parent=0){if(e.op==='var')return esc(e.name);if(e.op==='const')return e.value?'1':'0';if(e.op==='not'){const inner=render(e.value,0),body=precedence[e.value.op]<4?`(${inner})`:inner;return `<span class="logic-overbar">${body}</span>`;}const p=precedence[e.op],symbol=e.op==='and'?' · ':e.op==='or'?' + ':' ⊕ ',body=e.terms.map(term=>render(term,p)).join(symbol);return p<parent?`(${body})`:body;}
    function rewrite(e){
      if(e.op==='not'){const r=rewrite(e.value);if(r.changed)return{expr:not(r.expr),changed:true,law:r.law};if(e.value.op==='const')return{expr:constant(!e.value.value),changed:true,law:'Complement law'};if(e.value.op==='not')return{expr:e.value.value,changed:true,law:'Involution law'};if(e.value.op==='and'||e.value.op==='or')return{expr:group(e.value.op==='and'?'or':'and',e.value.terms.map(not)),changed:true,law:"De Morgan's law"};return{expr:e,changed:false};}
      if(!e.terms)return{expr:e,changed:false};
      const terms=[...e.terms];for(let i=0;i<terms.length;i++){const r=rewrite(terms[i]);if(r.changed){terms[i]=r.expr;return{expr:group(e.op,terms),changed:true,law:r.law};}}
      for(let i=0;i<terms.length;i++)if(terms[i].op===e.op){terms.splice(i,1,...terms[i].terms);return{expr:group(e.op,terms),changed:true,law:'Associative law'};}
      const isAnd=e.op==='and',isOr=e.op==='or';
      if(isAnd||isOr){const annihilator=isAnd?false:true,neutral=isAnd?true:false;if(terms.some(t=>t.op==='const'&&t.value===annihilator))return{expr:constant(annihilator),changed:true,law:'Annulment law'};const kept=terms.filter(t=>!(t.op==='const'&&t.value===neutral));if(kept.length!==terms.length)return{expr:kept.length?group(e.op,kept):constant(neutral),changed:true,law:'Identity law'};
        for(let i=0;i<terms.length;i++)for(let j=i+1;j<terms.length;j++)if(key(terms[i])===key(terms[j])){terms.splice(j,1);return{expr:group(e.op,terms),changed:true,law:'Idempotent law'};}
        for(let i=0;i<terms.length;i++)for(let j=i+1;j<terms.length;j++)if(key(terms[i])===key(not(terms[j]))||key(terms[j])===key(not(terms[i])))return{expr:constant(isOr),changed:true,law:'Complement law'};
        for(let i=0;i<terms.length;i++)for(let j=0;j<terms.length;j++)if(i!==j&&terms[j].op===(isOr?'and':'or')&&terms[j].terms.some(t=>key(t)===key(terms[i]))){terms.splice(j,1);return{expr:group(e.op,terms),changed:true,law:'Absorption law'};}
        for(let i=0;i<terms.length;i++)for(let j=0;j<terms.length;j++)if(i!==j&&terms[j].op===(isOr?'and':'or')){const at=terms[j].terms.findIndex(t=>key(t)===key(not(terms[i])));if(at>=0){const replacement=terms[j].terms.filter((_,k)=>k!==at);terms.splice(j,1,replacement.length===0?terms[i]:replacement.length===1?replacement[0]:group(terms[j].op,replacement));return{expr:group(e.op,terms),changed:true,law:'Consensus law'};}}
        const factorOp=isOr?'and':'or';
        for(let i=0;i<terms.length;i++)for(let j=i+1;j<terms.length;j++)if(terms[i].op===factorOp&&terms[j].op===factorOp){const left=terms[i].terms,right=terms[j].terms;for(let a=0;a<left.length;a++)for(let b=0;b<right.length;b++)if(key(left[a])===key(not(right[b]))||key(right[b])===key(not(left[a]))){const remainder=[...left.filter((_,k)=>k!==a),...right.filter((_,k)=>k!==b)];for(let k=0;k<terms.length;k++)if(k!==i&&k!==j&&terms[k].op===factorOp){const candidate=[...terms[k].terms],same=candidate.length===remainder.length&&remainder.every(part=>{const at=candidate.findIndex(other=>key(other)===key(part));if(at<0)return false;candidate.splice(at,1);return true;});if(same){terms.splice(k,1);return{expr:group(e.op,terms),changed:true,law:'Consensus law'};}}}}
        for(let i=0;i<terms.length;i++)for(let j=i+1;j<terms.length;j++)if(terms[i].op===factorOp&&terms[j].op===factorOp){
          const left=[...terms[i].terms],right=[...terms[j].terms],common=[];
          for(const part of left){const at=right.findIndex(other=>key(other)===key(part));if(at>=0){common.push(part);right.splice(at,1);left.splice(left.indexOf(part),1);}}
          if(common.length){const restA=left.length===1?left[0]:group(factorOp,left),restB=right.length===1?right[0]:group(factorOp,right);const factored=group(factorOp,[...common,group(isOr?'or':'and',[restA,restB])]);terms.splice(j,1);terms.splice(i,1,factored);return{expr:group(e.op,terms),changed:true,law:'Distributive law (factoring)'};}
        }
        for(let i=0;i<terms.length;i++)for(let j=i+1;j<terms.length;j++)if(terms[i].op===factorOp&&terms[j].op===factorOp){
          const left=terms[i].terms,right=terms[j].terms;
          for(let a=0;a<left.length;a++)for(let b=0;b<right.length;b++)if(key(left[a])===key(not(right[b]))||key(right[b])===key(not(left[a]))){
            const remainder=[...left.filter((_,k)=>k!==a),...right.filter((_,k)=>k!==b)];
            for(let k=0;k<terms.length;k++)if(k!==i&&k!==j&&terms[k].op===factorOp){const candidate=[...terms[k].terms],same=candidate.length===remainder.length&&remainder.every(part=>{const at=candidate.findIndex(other=>key(other)===key(part));if(at<0)return false;candidate.splice(at,1);return true;});if(same){terms.splice(k,1);return{expr:group(e.op,terms),changed:true,law:'Consensus law'};}}
          }
        }
        for(let i=0;i<terms.length;i++)for(let j=i+1;j<terms.length;j++)if(terms[i].op===factorOp&&terms[j].op===factorOp){
          const left=[...terms[i].terms],right=[...terms[j].terms];let complementPair=null;
          for(let a=0;a<left.length&&!complementPair;a++)for(let b=0;b<right.length;b++)if(key(left[a])===key(not(right[b]))||key(right[b])===key(not(left[a]))){const remA=left.filter((_,k)=>k!==a),remB=right.filter((_,k)=>k!==b);if(remA.length===remB.length&&remA.every(x=>{const at=remB.findIndex(y=>key(x)===key(y));if(at<0)return false;remB.splice(at,1);return true;})){complementPair={rest:remA};break;}}
          if(complementPair){const rest=complementPair.rest.length===0?constant(isOr):complementPair.rest.length===1?complementPair.rest[0]:group(factorOp,complementPair.rest);terms.splice(j,1);terms.splice(i,1,rest);return{expr:group(e.op,terms),changed:true,law:'Complement law'};}
        }
      }
      if(e.op==='xor'){let parity=0;const kept=[];for(const term of terms){if(term.op==='const')parity^=term.value?1:0;else{const i=kept.findIndex(t=>key(t)===key(term));if(i<0)kept.push(term);else kept.splice(i,1);}}if(parity||kept.length!==terms.length)return{expr:parity?not(kept.length===1?kept[0]:group('xor',kept)):kept.length===1?kept[0]:kept.length?group('xor',kept):constant(false),changed:true,law:'XOR identity'};}
      return{expr:e,changed:false};
    }
    function expandAbsorption(e){
      if(e.op==='not'){const child=expandAbsorption(e.value);return child?{expr:not(child.expr),steps:child.steps.map(step=>({...step,expr:not(step.expr)}))}:null;}
      if(!e.terms)return null;
      for(let i=0;i<e.terms.length;i++){
        const child=expandAbsorption(e.terms[i]);if(!child)continue;
        const wrap=term=>{const terms=[...e.terms];terms[i]=term;return group(e.op,terms);};
        return{expr:wrap(child.expr),steps:child.steps.map(step=>({...step,expr:wrap(step.expr)}))};
      }
      if(e.op!=='and')return null;
      for(let i=0;i<e.terms.length;i++)if(e.terms[i].op==='or')for(let j=0;j<e.terms.length;j++)if(i!==j){
        const factor=e.terms[i],shared=e.terms[j],matching=factor.terms.some(term=>key(term)===key(shared));
        if(!matching)continue;
        const replacement=group('or',factor.terms.map(term=>group('and',[term,shared]))),expandedTerms=[...e.terms];expandedTerms[i]=replacement;expandedTerms.splice(j,1);if(j<i)expandedTerms.splice(i-1,1,replacement);
        const expanded=group('and',expandedTerms);
        const reducedFactor=group('or',replacement.terms.map(term=>{const unique=[];for(const part of term.terms)if(!unique.some(item=>key(item)===key(part)))unique.push(part);return unique.length===1?unique[0]:group('and',unique);}));
        const reducedTerms=[...e.terms];reducedTerms[i]=reducedFactor;reducedTerms.splice(j,1);if(j<i)reducedTerms.splice(i-1,1,reducedFactor);
        const afterIdempotence=group('and',reducedTerms),absorbedTerms=e.terms.filter((_,index)=>index!==i&&index!==j);absorbedTerms.splice(Math.min(i,j),0,shared);
        return{expr:group('and',absorbedTerms),steps:[{expr:expanded,law:'Distributive law'}, {expr:afterIdempotence,law:'Idempotent law'}, {expr:group('and',absorbedTerms),law:'Absorption law'}]};
      }
      return null;
    }
    function normalized(e){if(!e.terms)return key(e);let terms=[];e.terms.forEach(t=>{if(t.op===e.op)terms.push(...t.terms);else terms.push(t);});return e.op+'('+terms.map(normalized).sort().join(',')+')';}
    function cost(e){return e.terms?1+e.terms.reduce((sum,t)=>sum+cost(t),0):e.op==='not'?1+cost(e.value):1;}
    function cover(minterms,width){if(!minterms.length)return[];let current=new Set(minterms),primes=new Set();while(current.size){const terms=[...current],used=new Set(),next=new Set();for(let i=0;i<terms.length;i++)for(let j=i+1;j<terms.length;j++){let diff=-1,ok=true;for(let k=0;k<width;k++)if(terms[i][k]!==terms[j][k]){if(terms[i][k]==='-'||terms[j][k]==='-'||diff!==-1){ok=false;break;}diff=k;}if(ok&&diff>=0){used.add(terms[i]);used.add(terms[j]);next.add(terms[i].slice(0,diff)+'-'+terms[i].slice(diff+1));}}terms.forEach(t=>{if(!used.has(t))primes.add(t);});current=next;}
      const covers=p=>minterms.filter(m=>[...p].every((b,i)=>b==='-'||b===m[i])),selected=new Set(),done=new Set();for(const m of minterms){const matches=[...primes].filter(p=>covers(p).includes(m));if(matches.length===1)selected.add(matches[0]);}const add=p=>{selected.add(p);covers(p).forEach(m=>done.add(m));};selected.forEach(add);while(minterms.some(m=>!done.has(m))){const best=[...primes].filter(p=>!selected.has(p)).sort((a,b)=>covers(b).filter(m=>!done.has(m)).length-covers(a).filter(m=>!done.has(m)).length)[0];if(!best)break;add(best);}return[...selected];}
    function minimalCandidate(ins,base){if(!ins.length||ins.length>8)return base;const ones=[],zeros=[];for(let row=0;row<2**ins.length;row++){const bits=row.toString(2).padStart(ins.length,'0'),values={};ins.forEach((input,i)=>values[input.id]=bits[i]==='1');(simulate(values)[target.id]?.value?ones:zeros).push(bits);}
      const fromCubes=(cubes,op)=>{const terms=cubes.map(cube=>{const vars=[];[...cube].forEach((bit,i)=>{if(bit==='-')return;const v=variable(ins[i].name);vars.push(op==='sop'?(bit==='1'?v:not(v)):(bit==='0'?v:not(v)));});return vars.length===0?constant(op==='sop'):vars.length===1?vars[0]:group(op==='sop'?'and':'or',vars);});return terms.length===0?constant(op==='sop'?false:true):terms.length===1?terms[0]:group(op==='sop'?'or':'and',terms);};
      const sop=ones.length===0?constant(false):ones.length===2**ins.length?constant(true):fromCubes(cover(ones,ins.length),'sop');
      const pos=zeros.length===0?constant(true):zeros.length===2**ins.length?constant(false):fromCubes(cover(zeros,ins.length),'pos');
      const candidates=[sop,pos].map(candidate=>{let e=candidate;for(let i=0;i<24;i++){const r=rewrite(e);if(!r.changed)break;e=r.expr;}return e;});
      const best=candidates.sort((a,b)=>cost(a)-cost(b))[0];return cost(best)<cost(base)||cost(best)===cost(base)&&normalized(best)!==normalized(base)?best:base;
    }
    let expr=build(target),steps=[];for(let i=0;i<64;i++){const expanded=expandAbsorption(expr);if(expanded){for(const step of expanded.steps){const before=render(expr),after=render(step.expr);if(before!==after)steps.push({before,after,law:step.law});expr=step.expr;}continue;}const r=rewrite(expr);if(!r.changed)break;const before=render(expr),after=render(r.expr);if(before!==after)steps.push({before,after,law:r.law||'Boolean identity'});expr=r.expr;}
    const minimized=minimalCandidate(traceOutput(target).inputs,expr);if(normalized(minimized)!==normalized(expr)){steps.push({before:render(expr),after:render(minimized),law:'Truth-table minimization'});expr=minimized;}
    const work=steps.length?steps.map(step=>`<div class="simplify-step"><b>=</b><div class="simplify-step-content"><span class="simplify-equation">${step.after}</span><small class="simplify-law">${esc(step.law||'Boolean identity')}</small></div></div>`).join(''):'<div class="simplify-nochange">No Boolean reduction applies.</div>';
    return{equation:render(expr),work};
  }
  function showGateArrayDetails(id,ins,patterns,rows){
    const gate=state.nodes.find(n=>n.id===id),box=document.querySelector('#gateEquationDetails');if(!gate||!box)return;
    const inputRows=[];
    for(let port=0;port<inputs(gate);port++){
      const wire=state.wires.find(item=>item.to===gate.id&&(item.input||0)===port),source=wire&&state.nodes.find(item=>item.id===wire.from),bits=[];
      for(let row=0;row<rows;row++){const values={};ins.forEach((input,index)=>values[input.id]=patterns[index][row%patterns[index].length]==='1');const result=simulate(values);bits.push(source&&result[source.id]?.value?1:0);}
      inputRows.push(`<div class="gate-detail-input"><span>Input ${port+1} · ${source?esc(source.name||source.type):'unconnected'}</span><code>[${bits.join(', ')}]</code></div>`);
    }
    box.innerHTML=`<div class="gate-detail-heading"><strong>${esc(gate.name||gate.type)}</strong><span>INPUTS & BOOLEAN EQUATION</span></div><div class="gate-detail-inputs">${inputRows.join('')}</div><div class="gate-detail-equation"><span>BOOLEAN EQUATION</span><div>${esc(gate.name||gate.type)} = ${equationFor(gate)}</div></div>`;
  }
  function renderEquationPanel(){
    const host=document.querySelector('#equationContent'),outputs=state.nodes.filter(n=>n.type==='OUTPUT'),gates=traceCircuit(outputs).gates;
    if(!outputs.length){host.innerHTML='<div class="empty-analysis">Add an output to show its Boolean equation.</div>';return;}
    const rows=[...gates,...outputs].map(node=>{const name=esc(node.name||node.type),simple=simplifyNode(node);return `<section class="equation-item"><div class="equation-row ${node.type==='OUTPUT'?'equation-output':''}"><strong>${name} =</strong><span><div class="equation-original">${equationFor(node)}</div><div class="equation-simplified"><b>Simplified:</b> ${simple.equation}</div><details class="processed-work"><summary>Show processed work</summary>${simple.work}</details></span></div></section>`;}).join('');
    host.innerHTML='<div class="equation-explanation">Each row keeps the gate or output equation and shows its simplified form. Open its processed work to follow each Boolean rewrite. · = AND, + = OR, ⊕ = XOR; an overbar means NOT.</div>'+(rows||'<div class="empty-analysis">No gates are connected to outputs.</div>');
  }
  function parseEquation(source){
    const parts=source.trim().split('=');if(parts.length>2)throw Error('Enter one equation, such as Y = A & B.');
    const outputName=parts.length===2?parts[0].trim():'Y',body=parts.length===2?parts[1].trim():parts[0].trim();
    if(!/^[A-Za-z_][A-Za-z0-9_]{0,15}$/.test(outputName))throw Error('The output name must start with a letter or underscore and be 16 characters or fewer.');
    const tokens=body.match(/[A-Za-z_][A-Za-z0-9_]*|[01]|[&+~()·]/g)||[];
    if(!body||tokens.join('')!==body.replace(/\s+/g,''))throw Error('Use variable names, parentheses, &, +, and ~ only.');
    const whitespaceBefore=new Set();let scanPosition=0,tokenIndex=0;for(const match of body.matchAll(/[A-Za-z_][A-Za-z0-9_]*|[01]|[&+~()·]/g)){if(/\s/.test(body.slice(scanPosition,match.index)))whitespaceBefore.add(tokenIndex);scanPosition=match.index+match[0].length;tokenIndex++;}
    let parenDepth=0;for(const token of tokens){if(token==='(')parenDepth++;if(token===')'){parenDepth--;if(parenDepth<0)throw Error('There is a closing parenthesis without a matching opening parenthesis.');}}if(parenDepth>0)throw Error('Add a closing parenthesis.');
    let cursor=0;const peek=()=>tokens[cursor],take=()=>tokens[cursor++];
    function parsePrimary(){const token=peek();if(token==='~'){take();return{op:'not',value:parsePrimary()};}if(token==='('){take();const value=parseOr();if(peek()!==')')throw Error(`Unexpected token “${peek()}” inside parentheses. Add an operator between terms.`);take();return value;}if(token==='0'||token==='1')throw Error('Use named variables for now; constants 0 and 1 are not supported yet.');if(token&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)){take();return{op:'var',name:token};}throw Error('Expected a variable or a parenthesized expression.');}
    function parseAnd(){let terms=[parsePrimary()];while(peek()==='&'||peek()==='·'||(whitespaceBefore.has(cursor)&&(/^([A-Za-z_][A-Za-z0-9_]*|[01]|[~(])$/).test(peek()||''))){if(peek()==='&'||peek()==='·')take();terms.push(parsePrimary());}return terms.length===1?terms[0]:{op:'and',terms};}
    function parseOr(){let terms=[parseAnd()];while(peek()==='+'){take();terms.push(parseAnd());}return terms.length===1?terms[0]:{op:'or',terms};}
    const ast=parseOr();if(cursor!==tokens.length)throw Error(`Unexpected token “${peek()}”. Add an operator between variables.`);
    const variables=[],seen=new Set();(function collect(e){if(e.op==='var'){if(!seen.has(e.name)){seen.add(e.name);variables.push(e.name);}return;}if(e.value)collect(e.value);(e.terms||[]).forEach(collect);})(ast);
    const folded=new Set();for(const name of variables){if(name.length>16)throw Error(`Input variable “${name}” is longer than 16 characters.`);if(folded.has(name.toLowerCase()))throw Error('Input variable names must be unique, including letter case.');folded.add(name.toLowerCase());}
    return{ast,variables,outputName};
  }
  function buildCircuitFromEquation(source){
    const parsed=parseEquation(source),inputNodes=new Map(),gateSlots={};
    checkpoint();state.nodes=[];state.wires=[];state.values={};state.gateCounters={};state.selected=null;state.selectedWire=null;state.connectFrom=null;state.pan={x:0,y:0};state.zoom=1;state.intentionalEmpty=false;
    parsed.variables.forEach((name,index)=>{const input=node('INPUT',75,85+index*96,name);input.pattern=canonicalPattern(index,parsed.variables.length);input.patternCustom=false;state.nodes.push(input);inputNodes.set(name,{node:input,depth:0,y:input.y});});
    function emit(expr){if(expr.op==='var')return inputNodes.get(expr.name);let type,children;
      if(expr.op==='not'&&(expr.value.op==='and'||expr.value.op==='or')){type=expr.value.op==='and'?'NAND':'NOR';children=expr.value.terms;}
      else if(expr.op==='not'&&expr.value.op==='not')return emit(expr.value.value);
      else if(expr.op==='not'){type='NOT';children=[expr.value];}
      else{type=expr.op==='and'?'AND':'OR';children=expr.terms;}
      const sources=children.map(emit),depth=1+Math.max(0,...sources.map(item=>item.depth)),slot=gateSlots[depth]||0;gateSlots[depth]=slot+1;
      const gate=node(type,265+(depth-1)*175,85+slot*100);gate.inputs=type==='NOT'?1:Math.max(2,sources.length);state.nodes.push(gate);sources.forEach((source,index)=>state.wires.push({from:source.node.id,to:gate.id,input:index}));return{node:gate,depth,y:gate.y};
    }
    const root=emit(parsed.ast),output=node('OUTPUT',265+root.depth*175,root.y,parsed.outputName);state.nodes.push(output);state.wires.push({from:root.node.id,to:output.id,input:0});
    state.selected=output.id;render();document.querySelector('#truthPanel').classList.remove('open');document.querySelector('#equationPanel').classList.remove('open');document.querySelector('#equationImportModal').hidden=true;notify('Circuit built from equation');
  }
  function toggleEquation(){const panel=document.querySelector('#equationPanel'),open=!panel.classList.contains('open');panel.classList.toggle('open',open);if(open){document.querySelector('#truthPanel').classList.remove('open');renderEquationPanel();}}
  function runCircuit(){const outputs=state.nodes.filter(n=>n.type==='OUTPUT'),target=outputs.find(n=>n.name.trim().toLowerCase()==='y')||outputs[0],box=document.querySelector('#runResult');if(!target){box.textContent='Add an output node named Y, then connect a circuit to it.';return;}const trace=traceOutput(target);if(!trace.inputs.length){box.textContent=`Connect at least one input to ${target.name}.`;return;}const seqs=truth(trace.inputs,[target]);if(!seqs)return;box.innerHTML=`<strong>${esc(target.name)} truth table array</strong><div class="run-bits">[${seqs[target.id].join(', ')}]</div><small>${seqs[target.id].length} rows · Input order: ${trace.inputs.map(n=>esc(n.name)).join(', ')}</small>`;document.querySelector('#equationPanel').classList.remove('open');document.querySelector('#truthPanel').classList.add('open');}
  function toggleTruth(){const panel=document.querySelector('#truthPanel'),open=!panel.classList.contains('open');panel.classList.toggle('open',open);if(open){document.querySelector('#equationPanel').classList.remove('open');truth();}}
  function notify(msg){const t=document.querySelector('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),1900);}
  function fit(){if(!state.nodes.length)return;const x=Math.min(...state.nodes.map(n=>n.x)),y=Math.min(...state.nodes.map(n=>n.y)),right=Math.max(...state.nodes.map(n=>n.x+size(n).w)),bottom=Math.max(...state.nodes.map(n=>n.y+size(n).h));const z=Math.min(1,(dims.w-100)/(right-x),(dims.h-100)/(bottom-y));state.zoom=Math.max(.45,z);state.pan={x:(dims.w-(right-x)*state.zoom)/2-x*state.zoom,y:(dims.h-(bottom-y)*state.zoom)/2-y*state.zoom};render();}
  document.querySelectorAll('.component').forEach(btn=>{btn.addEventListener('dragstart',e=>e.dataTransfer.setData('type',btn.dataset.type));btn.addEventListener('click',()=>addNode(btn.dataset.type,45+Math.random()*90,50+Math.random()*80));});
  wrap.addEventListener('dragover',e=>e.preventDefault());wrap.addEventListener('drop',e=>{e.preventDefault();const type=e.dataTransfer.getData('type');if(type){const p=point(e);addNode(type,p.x,p.y);}});
  svg.addEventListener('pointerdown',e=>{if(e.target.closest('.node-group')||e.target.classList.contains('port'))return;state.selected=null;state.selectedWire=null;state.connectFrom=null;render();});
  svg.addEventListener('wheel',e=>{e.preventDefault();const dx=e.shiftKey?(e.deltaX||e.deltaY):e.deltaX,dy=e.shiftKey?0:e.deltaY;state.pan={x:state.pan.x-dx,y:state.pan.y-dy};render();},{passive:false});
  document.querySelector('#zoomIn').onclick=()=>{state.zoom=Math.min(2.2,state.zoom*1.15);render()};document.querySelector('#zoomOut').onclick=()=>{state.zoom=Math.max(.35,state.zoom/1.15);render()};document.querySelector('#fitBtn').onclick=fit;document.querySelector('#equationBtn').onclick=toggleEquation;document.querySelector('#closeEquation').onclick=()=>document.querySelector('#equationPanel').classList.remove('open');
  const equationModal=document.querySelector('#equationImportModal'),equationField=document.querySelector('#equationInput'),equationStatus=document.querySelector('#equationInputStatus');
  equationModal.addEventListener('keydown',e=>e.stopPropagation(),true);
  const closeEquationModal=()=>{equationModal.hidden=true;document.querySelector('#buildEquationBtn').focus();};
  document.querySelector('#buildEquationBtn').onclick=()=>{equationModal.hidden=false;equationStatus.classList.remove('error');equationStatus.textContent='One equation per build. Input variables are created once, even when used more than once.';equationField.focus();};
  document.querySelector('#equationImportClose').onclick=closeEquationModal;document.querySelector('#cancelEquationBuild').onclick=closeEquationModal;equationModal.addEventListener('click',e=>{if(e.target===equationModal)closeEquationModal();});
  document.querySelector('#createEquationCircuit').onclick=()=>{try{buildCircuitFromEquation(equationField.value);}catch(error){equationStatus.textContent=error.message;equationStatus.classList.add('error');}};
  equationField.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter')document.querySelector('#createEquationCircuit').click();if(e.key==='Escape')closeEquationModal();});
  document.querySelector('#gridBtn').onclick=e=>{state.grid=!state.grid;e.currentTarget.classList.toggle('active',state.grid);render()};document.querySelector('#truthBtn').onclick=toggleTruth;const expandGatesBtn=document.createElement('button');expandGatesBtn.type='button';expandGatesBtn.id='expandGatesBtn';expandGatesBtn.className='truth-expand-btn';expandGatesBtn.textContent='Expand to every logic gate';expandGatesBtn.setAttribute('aria-expanded','false');document.querySelector('.panel-head').insertBefore(expandGatesBtn,document.querySelector('#closeTruth'));expandGatesBtn.addEventListener('click',()=>{state.showAllGates=!state.showAllGates;expandGatesBtn.textContent=state.showAllGates?'Show outputs only':'Expand to every logic gate';expandGatesBtn.setAttribute('aria-expanded',String(state.showAllGates));truth(state.truthInputs||state.nodes.filter(n=>n.type==='INPUT'),state.truthOutputs||state.nodes.filter(n=>n.type==='OUTPUT'));});document.querySelector('#closeTruth').onclick=()=>document.querySelector('#truthPanel').classList.remove('open');document.querySelector('#deleteBtn').onclick=deleteSelection;document.querySelector('#quickDeleteBtn').onclick=()=>{state.quickDelete=!state.quickDelete;save();render();notify(state.quickDelete?'Quick delete on: click a component or wire to delete it.':'Quick delete off: click a wire to select it.');};document.querySelector('#clearBtn').onclick=()=>{if(state.nodes.length){checkpoint();state.nodes=[];state.wires=[];state.selected=null;state.selectedWire=null;state.intentionalEmpty=true;render();notify('Canvas cleared');}};
  const runResult=document.createElement('div');runResult.id='runResult';runResult.className='run-result';runResult.textContent='Press Run to calculate Y’s output sequence.';document.querySelector('#simOutputs').after(runResult);document.querySelector('#runBtn').onclick=runCircuit;
  document.querySelector('#projectNameInput').maxLength=24;document.querySelector('#projectNameInput').addEventListener('change',e=>{state.projectName=e.target.value.trim().slice(0,24)||'Untitled circuit';e.target.value=state.projectName;save();});
  document.querySelector('#newCircuitBtn').onclick=createCircuit;document.querySelector('#saveCircuitBtn').onclick=()=>{save();notify(`Saved ${state.projectName}`);};document.querySelector('#circuitSelect').addEventListener('change',e=>openCircuit(e.target.value));
  document.querySelector('#inspectorClose').onclick=e=>{const collapsed=document.querySelector('.right-panel').classList.toggle('collapsed');document.querySelector('.app-shell').classList.toggle('inspector-collapsed',collapsed);e.currentTarget.title=collapsed?'Expand inspector':'Collapse inspector';e.currentTarget.setAttribute('aria-label',e.currentTarget.title);};document.querySelector('#helpBtn').onclick=()=>notify('Drag an output port to connect; drag a wired input port onto another output to reroute it.');
  const termsModal=document.querySelector('#termsModal'),closeTerms=()=>{termsModal.hidden=true;document.querySelector('#termsBtn').focus();};document.querySelector('#termsBtn').onclick=()=>{termsModal.hidden=false;document.querySelector('#termsClose').focus();};document.querySelector('#termsClose').onclick=closeTerms;termsModal.addEventListener('click',e=>{if(e.target===termsModal)closeTerms();});termsModal.querySelector('.terms-modal').addEventListener('keydown',e=>{if(e.key==='Escape')closeTerms();});
  function exportFile(){const blob=new Blob([JSON.stringify({format:'logiclab',version:1,projectName:state.projectName,nodes:state.nodes,wires:state.wires,gateCounters:state.gateCounters},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='logiclab-circuit.json';a.click();URL.revokeObjectURL(a.href);notify('Circuit exported');}
  document.querySelector('#exportBtn').onclick=exportFile;document.querySelector('#modalExport').onclick=exportFile;document.querySelector('#shareBtn').onclick=()=>document.querySelector('#modal').hidden=false;document.querySelector('#modalClose').onclick=()=>document.querySelector('#modal').hidden=true;document.querySelector('#modal').addEventListener('click',e=>{if(e.target.id==='modal')e.currentTarget.hidden=true;});document.querySelector('#copyData').onclick=async()=>{await navigator.clipboard?.writeText(JSON.stringify({projectName:state.projectName,nodes:state.nodes,wires:state.wires,gateCounters:state.gateCounters}));notify('Circuit data copied');document.querySelector('#modal').hidden=true;};
  document.querySelector('#importBtn').onclick=()=>document.querySelector('#fileInput').click();document.querySelector('#fileInput').onchange=async e=>{const f=e.target.files[0];if(f){checkpoint();restore(await f.text());notify('Circuit imported');e.target.value='';}};
  document.querySelector('#search').addEventListener('input',e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('.component').forEach(c=>c.style.display=c.textContent.toLowerCase().includes(q)?'':'none');});
  document.addEventListener('keydown',e=>{if(!equationModal.hidden||!termsModal.hidden||e.target.matches('input,textarea,select,[contenteditable="true"]'))return;if(e.code==='Space'){state.space=true;e.preventDefault();}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();document.querySelector('#search').focus();}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();const list=e.shiftKey?state.future:state.history,other=e.shiftKey?state.history:state.future;if(list.length){other.push(JSON.stringify({nodes:state.nodes,wires:state.wires}));restore(list.pop());}}if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();deleteSelection();}if(e.key==='Escape'){state.connectFrom=null;render();}if(e.key.toLowerCase()==='t')toggleTruth();if(e.key.toLowerCase()==='a'){const n=state.nodes.find(x=>x.type==='INPUT');if(n){state.values[n.id]=!state.values[n.id];render();}}});document.addEventListener('keyup',e=>{if(e.code==='Space')state.space=false;});
  document.querySelector('#undoBtn').onclick=()=>{if(state.history.length){const current=JSON.stringify({nodes:state.nodes,wires:state.wires}),previous=state.history.pop(),change=historyChange(previous,current);state.future.push(current);restore(previous);notify(historyNotice('undo',change));}};document.querySelector('#redoBtn').onclick=()=>{if(state.future.length){const current=JSON.stringify({nodes:state.nodes,wires:state.wires}),next=state.future.pop(),change=historyChange(current,next);state.history.push(current);restore(next);notify(historyNotice('redo',change));}};
  const saved=localStorage.getItem('logiclab-circuit');if(saved){try{state.circuitId=JSON.parse(saved).circuitId||uid();}catch{state.circuitId=uid();}restore(saved);save();}else{const circuits=getSavedCircuits();if(circuits.length){state.circuitId=circuits[0].circuitId;restore(JSON.stringify(circuits[0]));}else{state.circuitId=uid();seedCircuit();}}window.addEventListener('resize',render);
})();
