import { renderToStaticMarkup } from "react-dom/server";
import FinalListingReview from "./app/final-listing-review";

const art = (l: string) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#fbf7fa"/><text x="100" y="110" font-family="Georgia" font-size="18" fill="#b4464d" text-anchor="middle">${l}</text></svg>`)}`;

const drafts = [
  { clientId: "a", id: "p1", name: "dachshund-red.png", title: "Life Is Better With A Dachshund Sweatshirt, Dog Mom Gift, Comfort Colors 1566", status: "Created", previewUrl: art("Dachshund"), editorUrl: "https://printify.com/x", productName: "Unisex Garment-Dyed Sweatshirt" },
  { clientId: "b", id: "p2", name: "paws.png", title: "My Best Friend Has Paws Sweatshirt, Dog Lover Gift", status: "Created", previewUrl: art("Paws"), editorUrl: "https://printify.com/y", productName: "Unisex Garment-Dyed Sweatshirt" },
  { clientId: "c", id: "p3", name: "corgi.png", title: "Corgi Mom Crewneck", status: "Created", previewUrl: art("Corgi"), editorUrl: "https://printify.com/z", productName: "Unisex Garment-Dyed Sweatshirt" },
];
const files = [
  { id: "a", name: "dachshund-red.png", title: "Life Is Better With A Dachshund Sweatshirt, Dog Mom Gift, Comfort Colors 1566", tags: Array.from({ length: 13 }, (_, i) => `tag${i}`), previewUrl: art("Dachshund") },
  { id: "b", name: "paws.png", title: "My Best Friend Has Paws Sweatshirt, Dog Lover Gift", tags: Array.from({ length: 13 }, (_, i) => `tag${i}`), previewUrl: art("Paws") },
  { id: "c", name: "corgi.png", title: "Corgi Mom Crewneck", tags: Array.from({ length: 12 }, (_, i) => `tag${i}`), previewUrl: art("Corgi") },
];

process.stdout.write(renderToStaticMarkup(
  <FinalListingReview drafts={drafts} files={files} selections={{ p1: [0, 1], p2: [0, 1], p3: [0] }}
    defaultIndices={[0, 1]} preparedMockupCounts={{ p1: 6, p2: 6, p3: 5 }} batchSizeGuide="size-guide.png"
    productName="Unisex Garment-Dyed Sweatshirt" onEdit={() => {}} />
));
