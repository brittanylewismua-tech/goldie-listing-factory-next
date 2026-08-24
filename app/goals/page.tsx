"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import ManagementNav from "../management-nav";
import { periodHistory, publishedThisPeriod, type ListingGoal, type PublishedBatch } from "../listing-goal";

/* D343 · The goals page. Its job is to show a seller their own history — "I did
   40 last week, 30 this week" — and nothing else. No badges, no streak, no
   comparison to anyone. It reads the same batch data the sidebar and receipt
   read, so all three agree. */
export default function GoalsPage() {
  const [goal, setGoal] = useState<ListingGoal | null>(null);
  const [batches, setBatches] = useState<PublishedBatch[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void Promise.all([
      fetch("/api/seller-preferences").then((r) => r.json()).catch(() => ({})),
      fetch("/api/batches").then((r) => r.json()).catch(() => ({})),
    ]).then(([prefs, list]: [{ listingGoal?: ListingGoal }, { batches?: PublishedBatch[] }]) => {
      setGoal(prefs.listingGoal || null);
      setBatches(list.batches || []);
      setLoaded(true);
    });
  }, []);

  const period = goal?.period || "week";
  const rows = periodHistory(batches, period);
  const thisPeriod = goal ? publishedThisPeriod(batches, goal) : 0;
  const best = rows.reduce((most, row) => Math.max(most, row.published), 0);

  return (
    <main className="management-page goals-page">
      <ManagementNav />
      <header>
        <p className="mini-label">LISTING GOAL</p>
        <h1>Your listing history</h1>
        <p>Every listing you have published with Goldie, by {period}.</p>
      </header>

      {!loaded && <p className="goals-empty">Loading your history…</p>}

      {loaded && !goal?.enabled && (
        <section className="goals-off">
          <h2>You have not set a goal yet</h2>
          <p>Turn one on in Usage + Plan and Goldie will show your progress here, in the sidebar, and on your publish receipt.</p>
          <Link className="goals-cta" href="/usage">Set a listing goal</Link>
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
              <p className="goals-empty">Publish your first batch and it will show up here.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
