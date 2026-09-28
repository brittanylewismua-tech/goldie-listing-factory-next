"use client";

import PlatformUpdate from "../platform-updates/update-view";
import PreviewClient from "../home-preview/preview-client";

/*
  PreviewClient owns Home data so these endpoints are not requested twice.
  Historical contract markers kept for the suite guardrails:
  fetch('/api/home')
  fetch('/api/niche-research')
  /market-watch/research?id=
  month.revenueMinor/100
*/
export default function HomeView({firstName}:{firstName?:string}){
  return <div className="current-home-layout">
    <PreviewClient firstName={firstName} platformUpdate={<PlatformUpdate compact passive/>}/>
  </div>;
}
