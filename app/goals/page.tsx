"use client";
import { useEffect, useState } from "react";
import {readBatchHistory,preparedDaysFromHistory} from "../batch-history-read";
import Link from "next/link";
import FactoryShell from "../factory-shell";
import { periodHistoryFromDays, publishedDaysThisPeriod, type ListingGoal, type PublishedDay } from "../listing-goal";

/* D343 · The goals page. Its job is to show a seller their own history — "I did
   40 last week, 30 this week" — and nothing else. No badges, no streak, no
   comparison to anyone. It reads the same batch data the sidebar and receipt
   read, so all three agree. */
export default function GoalsPage() {
  const [goal, setGoal] = useState<ListingGoal | null>(null);
  /* D708 · Same defect as the sidebar bar, and worse here: this page looks
     back eight weeks over a history list that is capped at twenty rows. */
  const [days, setDays] = useState<PublishedDay[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error,setError]=useState("");

  async function loadHistory(){setLoaded(false);setError("");try{
    const [prefs,list]=await Promise.all([
      fetch("/api/seller-preferences",{signal:AbortSignal.timeout(25000)}).then(response=>{if(!response.ok)throw Error("Your goal settings could not be loaded. Try again.");return response.json() as Promise<{listingGoal?:ListingGoal}>}),
      readBatchHistory(),
    ]);
    setDays(preparedDaysFromHistory(list));setGoal(prefs.listingGoal||null);setLoaded(true);
  }catch(value){setError(value instanceof Error?value.message:"Your listing history could not be loaded. Try again.")}}
  useEffect(()=>{void loadHistory()},[]);

  const period = goal?.period || "week";
  const rows = periodHistoryFromDays(days, period);
  const thisPeriod = goal ? publishedDaysThisPeriod(days, goal) : 0;
  const best = rows.reduce((most, row) => Math.max(most, row.published), 0);

  return (
    <FactoryShell active="usage" title="Listing goal"><div className="management-page goals-page interior-page">
      
      <header>
        <p className="mini-label">LISTING GOAL</p>
        <h1>Your listing history</h1>
        <p>Every listing you have prepared as a Printify draft, by {period}.</p>
      </header>

      {error&&<div className="batch-restore-notice" role="alert"><p>{error}</p><button type="button" className="secondary-action" onClick={()=>void loadHistory()}>Reload listing history</button></div>}
      {!loaded && !error && <p className="goals-empty">Loading your history…</p>}

      {loaded && !goal?.enabled && (
        <section className="goals-off">
          <h2>Your listing goal is hidden</h2>
          <p>Turn one on in Usage + Plan and Goldie will show your progress here and in the sidebar.</p>
          <Link className="goals-cta" href="/usage#listing-goal">Show my listing goal</Link>
        </section>
      )}

      {loaded && goal?.enabled && (
        <>
          <section className="goals-current">
            <p className="mini-label">THIS {period.toUpperCase()}</p>
            <h2>{thisPeriod} of {goal.target}</h2>
            <span className="goals-track" aria-hidden="true">
              <i style={{ width: `${Math.min(100, Math.round((thisPeriod / Math.max(1, goal.target)) * 100))}%` }} />
            </span>
            <Link className="listing-goal-history-link" href="/usage#listing-goal">Adjust goal ↗</Link>
          </section>

          <section className="goals-history">
            <h2>Every {period} so far</h2>
            <ol>
              {rows.map((row) => (
                <li key={row.start.toISOString()}>
                  <b>{row.label}</b>
                  <span className="goals-bar" aria-hidden="true">
                    <i style={{ width: `${best ? Math.round((row.published / best) * 100) : 0}%` }} />
                  </span>
                  <em>{row.published}</em>
                </li>
              ))}
            </ol>
            {rows.length === 1 && rows[0].published === 0 && (
              <p className="goals-empty">Create your first Printify draft and it will show up here.</p>
            )}
          </section>
        </>
      )}
    </div></FactoryShell>
  );
}
