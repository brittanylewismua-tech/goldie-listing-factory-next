"use client";

import type { ReactNode } from "react";

/* D726 · The prototype's .goldie-page-head (source: goldie-ux-preview-site
   @ aad9208, peach-glass). Measured from its computed styles:

     .goldie-page-head   flex, space-between, align-items:flex-end,
                         gap 20, margin-bottom 25
     h1                  700 29px/32.48, letter-spacing -1.015px
     p                   14px/21.7, #6e606a
     .goldie-summary     #fff7fa, 1px #dfcbd6, radius 8, 12px, padding 8/11
     .goldie-help-trigger 25px circle, 850 12px, #5d3151

   The prototype's head carries the step's name, one line of copy, and a chip
   stating where the step stands. The eyebrow ("STEP 1 OF 4") left with the old
   head - the rail beneath it and the step-count line under the title both said
   the same thing, three times on one screen. The step-count line itself stays:
   see stepCount below. */

export default function PageHead({
  title,
  copy,
  help,
  stepCount,
  summary,
  children,
}: {
  title: ReactNode;
  copy?: ReactNode;
  help?: ReactNode;
  /* D416/D459 · The prototype's head carries no step number. Production's does,
     and it is a decided behaviour, not decoration: it is what stops the Connect
     screen from reading as step one. The capability wins; the head makes room
     for it, directly under the title where D459 put it. */
  stepCount?: ReactNode;
  summary?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="factory-page-head">
      <div>
        <div className="factory-heading-with-help">
          <h1>{title}</h1>
          {help}
        </div>
        {stepCount}
        {copy ? <p>{copy}</p> : null}
        {children}
      </div>
      {summary ? <span className="factory-summary">{summary}</span> : null}
    </div>
  );
}
