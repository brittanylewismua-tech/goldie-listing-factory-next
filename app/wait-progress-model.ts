export function waitProgress(now:number,started:number,lastConfirmed?:number){
 const seconds=Math.max(0,Math.floor((now-started)/1000));
 return {elapsed:seconds<60?`${seconds}s`:`${Math.floor(seconds/60)}m ${seconds%60}s`,long:seconds>=60,stale:lastConfirmed!=null&&now-lastConfirmed>=90000};
}
export function progressValue(done?:number,total?:number){return total&&total>0&&done!=null?Math.max(0,Math.min(total,done)):undefined}
