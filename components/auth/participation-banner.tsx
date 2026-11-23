"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useUser } from "@/lib/auth/use-user";
import { TERMS_VERSION } from "@/lib/auth/participation";
export function ParticipationBanner() {
 const { user } = useUser();
 const userId=user?.id, anonymous=user?.is_anonymous;
 const [needed,setNeeded]=useState(false),[adult,setAdult]=useState(false),[terms,setTerms]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{let active=true;setNeeded(false);if(userId&&!anonymous)void fetch('/api/participation',{cache:'no-store'}).then(r=>r.json()).then(d=>{if(active)setNeeded(d.accepted!==true);}).catch(()=>{if(active)setNeeded(true);});return()=>{active=false;};},[userId,anonymous]);
 if(!needed)return null;
 return <section aria-label="Participation confirmation" className="border-b bg-muted px-4 py-4 text-sm"><p>To ask, vote, chat or act for an office, confirm that you are an adult and accept the Terms. You can keep browsing without accepting.</p><label className="block"><input type="checkbox" checked={adult} onChange={e=>setAdult(e.target.checked)} /> I am 18 or older.</label><label className="block"><input type="checkbox" checked={terms} onChange={e=>setTerms(e.target.checked)} /> I agree to the <Link href="/terms" className="underline">Terms of Service</Link>.</label><button type="button" className="min-h-11 underline" disabled={!adult||!terms||busy} onClick={async()=>{setBusy(true);setError("");try{const r=await fetch('/api/participation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({adult:true,terms_version:TERMS_VERSION})});if(!r.ok)throw Error();window.location.reload();}catch{setError('Your confirmation was not saved. Please try again.');setBusy(false);}}}>Confirm and continue</button>{error&&<p role="alert">{error}</p>}</section>;
}
