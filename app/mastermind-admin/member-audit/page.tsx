import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { auditMemberPrintify } from "@/app/api/mastermind/member-diagnostic/route";

export default async function MemberAuditPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const owner = await getChatGPTUser();
  if (!owner || !isOwner(owner)) return <main><h1>Not authorized</h1></main>;
  const email = (await searchParams).email?.trim().toLowerCase() ?? "";
  const audit = await auditMemberPrintify(email);
  return <main className="access-shell"><section className="diagnostics-card"><p className="mini-label">MEMBER ACCOUNT AUDIT</p><h1>{email || "Member"}</h1><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",fontSize:"14px",lineHeight:1.6}}>{JSON.stringify(audit, null, 2)}</pre></section></main>;
}
