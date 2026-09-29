import PreviewClient from "@/app/home-preview/preview-client";
import "@/app/home-preview/preview.css";

export const metadata={title:"Goldie visual review"};

export default function GoldieVisualReview(){
  return <main className="goldie-home-page"><PreviewClient firstName="Brittany" visualReview/></main>;
}
