// Extract the one-time code without navigating to or fetching pasted URLs.
export function emailLinkCode(value:string):string {
 try {
  let url=new URL(value);
  for(let depth=0;depth<3;depth++){
   if(!['https:','http:'].includes(url.protocol))return '';
   if(url.searchParams.get('mode')==='signIn')return url.searchParams.get('oobCode')||'';
   const nested=url.searchParams.get('link');
   if(!nested)return '';
   url=new URL(nested);
  }
 } catch { /* Show a local validation message for malformed links. */ }
 return '';
}
