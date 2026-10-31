import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";

function publicAddress(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [a=0,b=0,c=0] = address.split(".").map(Number);
  return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===88))||(a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113));
}
export async function downloadApprovedPhoto(raw: string, redirects=0): Promise<Buffer> {
  const url = new URL(raw);
  if(url.protocol!=="https:"||url.username||url.password||url.port||isIP(url.hostname)||!url.hostname.includes("."))throw new Error("Invalid photo URL");
  const addresses=await lookup(url.hostname,{family:4,all:true});
  if(!addresses.length||addresses.some(value=>!publicAddress(value.address)))throw new Error("Photo address is not public");
  return new Promise((resolve,reject)=>{
    const req=request(url,{family:4,...{autoSelectFamily:false},timeout:8000,headers:{"User-Agent":"WhyThoPhotoImport/1.0 (+https://whytho.us)",Accept:"image/jpeg,image/png,image/webp"},lookup:(_h,_o,callback)=>callback(null,addresses[0]!.address,4)},res=>{
      if([301,302,303,307,308].includes(res.statusCode??0)&&res.headers.location&&redirects<3){res.destroy();clearTimeout(timer);downloadApprovedPhoto(new URL(res.headers.location,url).href,redirects+1).then(resolve,reject);return;}
      if(res.statusCode!==200||!/^image\/(jpeg|png|webp)(?:;|$)/i.test(res.headers["content-type"]??"")){res.destroy();clearTimeout(timer);reject(new Error(`Photo download rejected (${res.statusCode})`));return;}
      let size=0;const chunks:Buffer[]=[];
      res.on("data",(chunk:Buffer)=>{size+=chunk.length;if(size>4*1024*1024){res.destroy();clearTimeout(timer);reject(new Error("Source photo exceeds 4 MB"));return;}chunks.push(chunk);});
      res.on("end",()=>{clearTimeout(timer);resolve(Buffer.concat(chunks));});res.on("error",error=>{clearTimeout(timer);reject(error);});
    });
    const timer=setTimeout(()=>{req.destroy();reject(new Error("Photo download timed out"));},10000);
    req.on("error",error=>{clearTimeout(timer);reject(error);});req.end();
  });
}
