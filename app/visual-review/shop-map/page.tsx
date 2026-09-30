import VisualReviewClient from "./visual-review-client";
import "@/app/shop-map/shop-map.css";
export const metadata={title:"My Shop visual review"};
export default function MyShopVisualReview(){
  return <main id="suite-workspace"><VisualReviewClient/></main>;
}
