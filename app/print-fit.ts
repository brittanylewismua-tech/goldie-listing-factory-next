export function printFit(width:number,height:number,inches:number,ppi:number){
 if(![width,height,inches,ppi].every(v=>Number.isFinite(v)&&v>0))return null;
 return {heightInches:inches*height/width,effectivePpi:width/inches,maxWidth:width/ppi,maxHeight:height/ppi,meets:width/inches>=ppi};
}
