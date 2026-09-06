import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(path,deps={}){let src=readFileSync(new URL(path,import.meta.url),'utf8').replace(/^import .*;\n/gm,'');const compiled=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const out={};new Function('exports',...Object.keys(deps),compiled)(out,...Object.values(deps));return out;}
const knowledge=load('../app/support-knowledge.ts');
const {supportResponse}=load('../app/support-engine.ts',knowledge);
const prompts=['A design failed','Printify won’t connect','My template won’t load','My image won’t upload'];
for(const prompt of prompts){
  test(`visible support buttons after ${prompt} do not fall back to the opening question`,()=>{
    const queue=[{query:prompt,turns:[],depth:0}];let checked=0;
    while(queue.length){const {query,turns,depth}=queue.shift();const reply=supportResponse(query,turns);assert.doesNotMatch(reply.text,/Let’s sort it out\. What were you trying to do/,query);checked++;
      if(depth<3)for(const next of reply.suggestions??[])queue.push({query:next,turns:[...turns,{role:'user',text:query},{role:'support',text:reply.text,articleId:reply.articleId}],depth:depth+1});
    }
    assert.ok(checked>1);
  });
}
test('template loading follow-up keeps existing work and offers escalation',()=>{
  const reply=supportResponse('It keeps loading',[{role:'user',text:'My template won’t load'}]);assert.match(reply.text,/Keep this batch open/);assert.match(reply.text,/Contact Support/);assert.match(reply.text,/Do not start another batch/);
});
test('sign-in support uses current login options and saved batch recovery',()=>{
  const article=knowledge.SUPPORT_ARTICLES.find(a=>a.id==='signin-required');assert.match(article.answer,/Continue with Google/);assert.match(article.answer,/Email me a sign-in link/);assert.match(article.answer,/Batch History/);
  for(const id of ['signin-required','mastermind-access'])assert.doesNotMatch(knowledge.SUPPORT_ARTICLES.find(a=>a.id===id).answer,/Sign in with ChatGPT/);
});
