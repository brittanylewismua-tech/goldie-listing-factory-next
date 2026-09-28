"use client";

import PreviewClient from "../home-preview/preview-client";

/*
  Home now uses the approved image-first workspace composition directly.
  Keeping one implementation prevents the preview and production Home from
  drifting apart while the redesign is being validated.
*/
export default function HomeView(){
  return <PreviewClient/>;
}
