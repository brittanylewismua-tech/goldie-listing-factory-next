import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { auditMemberPrintify, resolveMastermindMember } from "@/app/api/mastermind/member-diagnostic/route";
import MemberBatchRepair from "./member-batch-repair";

export default async function MemberAuditPage({ searchParams }: { searchParams: Promise<{ email?: string; query?: string }> }) {
  const owner = await getChatGPTUser();
  if (!owner || !isOwner(owner)) return <main><h1>Not authorized</h1></main>;
  const params = await searchParams;
  let email = params.email?.trim().toLowerCase() ?? "";
  const query = params.query?.trim() ?? "";
  const matches = !email && query ? await resolveMastermindMember(query) : [];
  if (!email && matches.length === 1) email = matches[0].email.toLowerCase();
  const audit = email ? await auditMemberPrintify(email) : { error: matches.length ? "More than one member matched." : "No mastermind member matched that name or email.", matches: matches.map(({email, displayName}) => ({email, displayName})) };
  const repairable="recentBatches" in audit?(audit.recentBatches as Array<{id:string;complete?:boolean;completionReady?:boolean}>).filter(batch=>batch.completionReady&&!batch.complete):[];
  return <main className="access-shell"><section className="diagnostics-card"><p className="mini-label">MEMBER ACCOUNT AUDIT</p><h1>{email || query || "Member"}</h1>{repairable.map(batch=><MemberBatchRepair key={batch.id} email={email} batchId={batch.id}/>)}<pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",fontSize:"14px",lineHeight:1.6}}>{JSON.stringify(audit, null, 2)}</pre></section></main>;
}
