import { requireChatGPTUser } from "@/app/chatgpt-auth";
import ShopMapClient from "./shop-map-client";
import "./shop-map.css";

/*
  Shop Map is read-only and phone-first. The member is usually standing in a
  queue or sitting on a sofa, not at a desk with a spreadsheet, so the page
  answers three questions in order: what did I make, where is the shop
  pointed, and what is it made of.
*/
export default async function ShopMapPage() {
  const user = await requireChatGPTUser("/shop-map");
  return <ShopMapClient signedInEmail={user.email} />;
}
