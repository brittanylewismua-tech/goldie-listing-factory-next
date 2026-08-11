import { chatGPTSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner, runtime } from "@/app/mastermind/access";
import AdminControl from "./admin-control";

export default async function MastermindAdminPage() {
  const user = await getChatGPTUser();
  if (!user) return <div className="access-shell"><div className="access-card"><a className="access-link" href={chatGPTSignInPath("/mastermind-admin")}>Owner sign in</a></div></div>;
  if (!isOwner(user)) return <div className="access-shell"><div className="access-card"><h1>Not authorized</h1></div></div>;
  const db = runtime().DB;
  const [setting, count] = db ? await Promise.all([db.prepare("SELECT active FROM mastermind_settings WHERE id = 1").first<{ active: number }>(), db.prepare("SELECT COUNT(*) AS count FROM mastermind_access").first<{ count: number }>]) : [null, null];
  return <AdminControl initialActive={setting?.active === 1} memberCount={count?.count ?? 0} />;
}
