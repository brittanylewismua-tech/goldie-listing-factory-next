type Decision = "include" | "exclude";

/** Keep approval keys attached to the design identity actually saved in a
 * member. Excluded files are never cloned, uploaded, or kept in its snapshot. */
export function bundleMemberDesigns<T extends {id:string}>(
  files: T[], recipeId: string, decisions: Record<string,Decision>, clone: (file:T)=>T,
): {designs:T[]; decisions:Record<string,Decision>} {
  const designs:T[]=[], mapped:Record<string,Decision>={};
  for(const file of files){
    if(decisions[`${recipeId}:${file.id}`]==="exclude")continue;
    const design=clone(file);
    designs.push(design);
    const suffix=`:${file.id}`;
    for(const [key,decision] of Object.entries(decisions)){
      if(key.endsWith(suffix))mapped[`${key.slice(0,-suffix.length)}:${design.id}`]=decision;
    }
  }
  return {designs,decisions:mapped};
}
