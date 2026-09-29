"use client";

import PreviewClient from "../home-preview/preview-client";

export default function HomeView({firstName}:{firstName?:string}){
  return <PreviewClient firstName={firstName} />;
}
