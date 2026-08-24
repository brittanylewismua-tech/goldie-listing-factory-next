import { accountSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner, runtime } from "@/app/mastermind/access";
import AdminControl, { type Diagnostic, type LoggedFailure } from "./admin-control";

export default async function MastermindAdminPage() {
  const user = await getChatGPTUser();
  if (!user) return <div className="access-shell"><div className="access-card"><a className="access-link" href={accountSignInPath("/mastermind-admin")}>Owner sign in</a></div></div>;
  if (!isOwner(user)) return <div className="access-shell"><div className="access-card"><h1>Not authorized</h1></div></div>;
  const db = runtime().DB;
  /* D441 - the error log is created on first write, so a fresh database has no
     table yet. A missing table must show an empty list, not an admin page that
     will not load. */
  const errors = db ? await db.prepare(
    `SELECT id, created_at AS createdAt, area, severity, user_email AS userEmail, user_name AS userName,
            message, error_code AS errorCode, http_status AS httpStatus, url, context
     FROM error_log ORDER BY created_at DESC LIMIT 100`).all().catch(() => ({ results: [] })) : { results: [] };
  const [setting, count, diagnostics] = db ? await Promise.all([
    db.prepare("SELECT active FROM mastermind_settings WHERE id = 1").first<{ active: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM mastermind_access").first<{ count: number }>(),
    db.prepare("SELECT reference, user_email AS userEmail, file_name AS fileName, stage, outcome, retry_count AS retryCount, error_code AS errorCode, http_status AS httpStatus, message, updated_at AS updatedAt FROM printify_diagnostics WHERE outcome = 'failed' ORDER BY updated_at DESC LIMIT 50").all(),
  ]) : [null, null, { results: [] }];
  return <AdminControl initialActive={setting?.active === 1} memberCount={count?.count ?? 0} initialDiagnostics={(diagnostics?.results ?? []) as Diagnostic[]} initialErrors={(errors?.results ?? []) as LoggedFailure[]} />;
}
