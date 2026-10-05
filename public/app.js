const $=s=>document.querySelector(s);
let file=null;

function page(name){
  ["upload","result","history"].forEach(x=>$("#"+x+"Page").classList.toggle("hidden",x!==name));
  document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x.dataset.page===name));
  if(name==="history") loadHistory();
}
document.querySelectorAll(".tab").forEach(x=>x.onclick=()=>page(x.dataset.page));

const input=$("#slip");
input.onchange=()=>{
  const f=input.files[0]; if(!f)return;
  if(f.size>10*1024*1024){alert("ไฟล์ใหญ่เกิน 10 MB");input.value="";return}
  file=f; $("#preview").src=URL.createObjectURL(f);$("#filename").textContent=f.name;
  $("#previewBox").classList.remove("hidden");$("#dropzone").classList.add("hidden");$("#verify").disabled=false;
};
$("#remove").onclick=()=>{file=null;input.value="";$("#previewBox").classList.add("hidden");$("#dropzone").classList.remove("hidden");$("#verify").disabled=true};

$("#verify").onclick=async()=>{
  if(!file)return;
  $("#verify").disabled=true;$("#loading").classList.remove("hidden");
  const fd=new FormData();fd.append("slip",file);fd.append("expectedAmount",$("#amount").value||"0");
  try{
    const r=await fetch("/api/verify-slip",{method:"POST",body:fd});
    const d=await r.json(); showResult(d);
  }catch(e){showResult({ok:false,message:"เชื่อมต่อเซิร์ฟเวอร์ไม่ได้"})}
  finally{$("#verify").disabled=false;$("#loading").classList.add("hidden")}
};

function showResult(d){
  const ok=!!d.ok;
  $("#resultIcon").className="resultIcon"+(ok?"":" fail");
  $("#resultIcon").textContent=ok?"✓":"!";
  $("#resultTitle").textContent=ok?"ชำระเงินสำเร็จ":"ไม่ผ่านการตรวจสอบ";
  $("#resultMessage").textContent=d.message||"";
  $("#rAmount").textContent=d.amount!=null?Number(d.amount).toLocaleString("th-TH",{minimumFractionDigits:2})+" บาท":"-";
  $("#rDate").textContent=d.date||"-";
  $("#rSender").textContent=[d.senderBank,d.senderName].filter(Boolean).join(" • ")||"-";
  $("#rReceiver").textContent=[d.receiverBank,d.receiverName].filter(Boolean).join(" • ")||"-";
  $("#rRef").textContent=d.transRef||"-";
  page("result");
}
$("#again").onclick=()=>{file=null;input.value="";$("#previewBox").classList.add("hidden");$("#dropzone").classList.remove("hidden");$("#verify").disabled=true;page("upload")};

async function loadHistory(){
  const box=$("#history");box.innerHTML='<div class="empty">กำลังโหลด…</div>';
  try{
    const r=await fetch("/api/history");const d=await r.json();
    if(!d.items?.length){box.innerHTML='<div class="empty">ยังไม่มีประวัติ</div>';return}
    box.innerHTML=d.items.map(x=>{
      const ok=x.status==="success";
      return `<div class="historyItem"><div><b class="${ok?"ok":"bad"}">${ok?"✓ ตรวจสอบผ่าน":"! ไม่ผ่าน/ซ้ำ"}</b><small>${x.date||x.createdAt} • ${x.transRef}</small></div><b>${Number(x.amount).toLocaleString("th-TH",{minimumFractionDigits:2})} ฿</b></div>`;
    }).join("");
  }catch(e){box.innerHTML='<div class="empty">โหลดประวัติไม่ได้</div>'}
}
$("#refresh").onclick=loadHistory;

async function initLine(){
  const state=$("#lineState");
  const liffId=window.__LIFF_ID__;
  if(!liffId){state.textContent="LINE MINI App พร้อมตั้งค่า";return}
  try{
    await liff.init({liffId});
    state.textContent=liff.isLoggedIn()?"LINE เชื่อมต่อแล้ว":"เปิดผ่าน LINE";
  }catch(e){state.textContent="LINE ยังไม่ได้ตั้งค่า"}
}
initLine();
