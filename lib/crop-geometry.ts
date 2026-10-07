export type CropView={zoom:number;x:number;y:number};
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
export function cropRect(width:number,height:number,view:CropView){const side=Math.min(width,height)/view.zoom;return {left:(width-side)*view.x/100,top:(height-side)*view.y/100,side};}
export function moveCrop(view:CropView,width:number,height:number,viewport:number,dx:number,dy:number,factor=1):CropView{
 if(!width||!height||!viewport)return view;
 const old=cropRect(width,height,view);const zoom=clamp(view.zoom*factor,1,5);const side=Math.min(width,height)/zoom;
 const left=old.left+(old.side-side)/2-dx*old.side/viewport;const top=old.top+(old.side-side)/2-dy*old.side/viewport;
 return {zoom,x:width===side?50:clamp(left/(width-side)*100,0,100),y:height===side?50:clamp(top/(height-side)*100,0,100)};
}
