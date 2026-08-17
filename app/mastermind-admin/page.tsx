import { accountSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner, runtime } from "@/app/mastermind/access";
import AdminControl, { type Diagnostic } from "./admin-control";

export default async function MastermindAdminPage() {
  const user = await getChatGPTUser();
  if (!user) return <div className="access-shell"><div className="access-card"><a className="access-link" href={accountSignInPath("/mastermind-admin")}>Owner sign in</a></div></div>;
  if (!isOwner(user)) return <div className="access-shell"><div className="access-card"><h1>Not authorized</h1></div></div>;
  const db = runtime().DB;
  const [setting, count, diagnostics] = db ? await Promise.all([
    db.prepare("SELECT active FROM mastermind_settings WHERE id = 1").first<{ active: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM mastermind_access").first<{ count: number }>(),
    db.prepare("SELECT reference, user_email AS userEmail, file_name AS fileName, stage, outcome, retry_count AS retryCount, error_code AS errorCode, http_status AS httpStatus, message, updated_at AS updatedAt FROM printify_diagnostics WHERE outcome = 'failed' ORDER BY updated_at DESC LIMIT 50").all(),
  ]) : [null, null, { results: [] }];
  return <AdminControl initialActive={setting?.active === 1} memberCount={count?.count ?? 0} initialDiagnostics={(diagnostics?.results ?? []) as Diagnostic[]} />;
}
