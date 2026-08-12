import { findSupportArticle, SUPPORT_ARTICLES } from "./support-knowledge";

export type SupportTurn = { role: "user" | "support"; text: string; articleId?: string };
export type SupportResponse = { text: string; articleId?: string; suggestions?: string[] };

const STAGES = ["Connecting Printify", "Loading the template", "Adding designs", "Creating drafts", "Opening drafts in Printify"];

function lastArticle(turns: SupportTurn[]) {
  const id = [...turns].reverse().find((turn) => turn.role === "support" && turn.articleId)?.articleId;
  return id ? SUPPORT_ARTICLES.find((article) => article.id === id) : undefined;
}

function userContext(turns: SupportTurn[], query: string) {
  return [...turns.filter((turn) => turn.role === "user").slice(-6).map((turn) => turn.text), query].join(" \n ");
}

export function supportResponse(query: string, turns: SupportTurn[]): SupportResponse {
  const clean = query.trim();
  const lower = clean.toLowerCase();
  const context = userContext(turns, clean);
  const previousArticle = lastArticle(turns);

  if (/^(that|this|it) (still )?(didn'?t|doesn'?t|did not|does not) work|same (thing|error)|still (failing|broken|not working)/i.test(lower)) {
    if (!previousArticle) return { text: "Tell me the exact message showing now, or choose the part that is still not working.", suggestions: STAGES };
    const followUps: Record<string, SupportResponse> = {
      "image-8253": { text: "After you clicked Retry failed designs, did it return the same 8253 message, a different error, or is the retry still running?", suggestions: ["Same 8253 error", "A different error", "It is still running"] },
      "token-connect": { text: "What exact message appears directly under Connect Printify after you paste the new all-scopes token? Paste that text here.", suggestions: [] },
      "template-not-found": { text: "Does the template open normally inside the same Printify account you connected to Goldie, or does Printify itself say product not found?", suggestions: ["It opens normally in Printify", "Printify says product not found"] },
      "template-print-area": { text: "After saving the fresh template copy, what exact red error does Goldie show when you load or run it now? Paste that text here.", suggestions: [] },
      "cloud-file": { text: "After downloading the file locally, does it open normally when you double-click it on your computer?", suggestions: ["Yes, it opens normally", "No, it will not open"] },
      "image-size": { text: "Did the same design fail again with error 8201/file size, or is Printify showing a different code now?", suggestions: ["Same size error", "A different error"] },
      "network": { text: "Is the batch still moving through other designs, or has the progress stopped changing completely?", suggestions: ["Other designs are still processing", "Progress stopped completely"] },
      "rate-limit": { text: "Is Goldie still processing the batch, or did the batch finish with specific designs marked Failed?", suggestions: ["Still processing", "Finished with failed designs"] },
      "editor-login": { text: "After signing in, is Printify using the same account whose token you connected to Goldie? Check the account email in Printify before answering.", suggestions: ["Yes, same Printify account", "No, different account"] },
      "popups": { text: "When you click Open all now, does the browser show a blocked pop-up icon in the address bar, or does nothing appear at all?", suggestions: ["I see the blocked pop-up icon", "Nothing appears"] },
    };
    return followUps[previousArticle.id] ?? { text: `You already tried the ${previousArticle.title.toLowerCase()} fix. Paste the exact message showing now so I can tell whether the error changed rather than repeating the same step.` };
  }

  if (/same 8253 error/i.test(lower)) return { text: "The automatic wait and the manual retry both exhausted Printify’s image-processing window. Do not restart the successful drafts. Use Contact Support and attach one screenshot of that 8253 result so the team can inspect this specific account-level failure.", articleId: "image-8253" };
  if (/different error/i.test(lower)) return { text: "Paste the new error exactly as it appears. The changed wording matters because it means the original problem cleared and a different step is failing." };
  if (/still running|other designs are still processing/i.test(lower)) return { text: "Leave the page open and let the batch finish. No action is needed while the count is still moving. If anything is marked Failed at the end, send me the exact message under that file." };
  if (/progress stopped completely/i.test(lower)) return { text: "Check whether the browser tab shows a network error or whether one filename is still marked as the active design. Tell me the active filename and any message visible under it; do not refresh yet, because refreshing would clear the selected local files." };
  if (/finished with failed designs/i.test(lower)) return { text: "Read me the exact error shown under one failed design. If the failed files show different errors, paste each different error once; you do not need to list every filename." };
  if (/same size error/i.test(lower)) return { text: "That one design is still above Printify’s accepted processed size after Goldie prepared it. Export only that file again as a transparent PNG if transparency is needed, otherwise as a high-quality JPG, then run it in a new one-file batch. Leave the successful drafts alone.", articleId: "image-size" };
  if (/it opens normally in printify/i.test(lower)) return { text: "Then the product exists, but Goldie’s saved token is connected to a different Printify account or shop. In Goldie, disconnect Printify, reconnect using an all-scopes token created inside the account where that template opens, and load the same template link again.", articleId: "template-not-found" };
  if (/printify says product not found/i.test(lower)) return { text: "That template itself is no longer available. In Printify → My Products, create or duplicate a fresh unpublished product, save its provider, variants and placement, then paste the fresh product editor link into Goldie.", articleId: "template-not-found" };
  if (/yes,? same printify account/i.test(lower)) return { text: "Click the individual Edit in Printify button one more time now that the correct account is active. If that exact draft still says product not found, use Contact Support and include the draft name plus an optional screenshot—the team needs to inspect the generated editor link.", articleId: "editor-login" };
  if (/no,? different account/i.test(lower)) return { text: "Sign out of Printify in that browser, sign into the account connected to Goldie, then return to the Listing Factory and click Edit in Printify again. The draft lives in the account attached to the token.", articleId: "editor-login" };
  if (/blocked pop-up icon/i.test(lower)) return { text: "Click that icon in the browser address bar, choose Always allow pop-ups and redirects from the Goldie Listing Factory, then click Done and use Open all in Printify again.", articleId: "popups" };
  if (/nothing appears/i.test(lower) && /open all|pop-up|tabs/i.test(context)) return { text: "Use the individual Edit in Printify buttons for now. If those work but Open all does nothing, allow pop-ups for the Listing Factory in the browser’s site settings, then reload only after your current batch is finished.", articleId: "popups" };

  const exactArticle = findSupportArticle(clean);
  const hasSpecificSignal = /\b(8253|8150|8201|429|401|403|500|502|503|504)\b|provided images do not exist|validation failed|failed to fetch|could not be decoded|product not found|unauthorized|file\.size\.limit/i.test(clean);
  if (exactArticle && hasSpecificSignal) return { text: exactArticle.answer, articleId: exactArticle.id };

  if (/connect(ing)? printify/i.test(lower)) return { text: "What exact message appears under the Connect Printify box after the connection fails? Paste it here. If no message appears, tell me whether the button changes to Connecting… first.", suggestions: ["It says unauthorized", "The button does nothing", "I have an error code"] };
  if (/load(ing)? (the )?template/i.test(lower)) return { text: "What happens after you click Load template: does Goldie say the product was not found, show a different red message, or keep loading without finishing?", suggestions: ["Product was not found", "A different red message", "It keeps loading"] };
  if (/adding designs/i.test(lower)) return { text: "Which describes it: the files never appear after you choose them, Goldie rejects the batch immediately, or the files load but fail later during draft creation?", suggestions: ["Files never appear", "Batch is rejected immediately", "They fail during draft creation"] };
  if (/creating drafts/i.test(lower)) return { text: "Is the batch still actively counting through designs, or has it finished with one or more files marked Failed? If it finished, paste the exact error under one failed file.", suggestions: ["It is still counting", "It finished with failed files", "The progress stopped"] };
  if (/opening drafts in printify/i.test(lower)) return { text: "What happens when you click Edit in Printify: a login screen, product not found, the wrong account, or no new tab at all?", suggestions: ["Printify login screen", "Product not found", "Wrong Printify account", "No tab opens"] };

  if (/design(s)? failed|draft(s)? failed|not working|won'?t work|doesn'?t work|problem|error/i.test(lower) && !hasSpecificSignal) return { text: "I can diagnose it, but I need the point where it failed. Choose the part you were on, or paste the exact error shown on the page.", suggestions: STAGES };

  if (/product was not found/i.test(lower)) return { text: "Does that same product open normally when you paste the link directly into a browser where you are signed into Printify?", suggestions: ["Yes, it opens normally in Printify", "No, Printify says product not found"] };
  if (/unauthorized/i.test(lower)) return { text: SUPPORT_ARTICLES.find((article)=>article.id==="token-connect")!.answer, articleId:"token-connect" };
  if (/button does nothing/i.test(lower)) return { text: "Tell me which button it is—Connect Printify, Load template, Create drafts, Retry failed designs, Edit in Printify, or Open all—because each one has a different cause.", suggestions: ["Connect Printify", "Load template", "Create drafts", "Retry failed designs", "Edit in Printify", "Open all"] };
  if (/files never appear/i.test(lower)) return { text: "Are the designs stored only in iCloud, OneDrive or Google Drive, or are they fully downloaded into a normal folder on the computer?", suggestions: ["They are in cloud storage", "They are downloaded locally"] };
  if (/cloud storage/i.test(lower)) return { text: SUPPORT_ARTICLES.find((article)=>article.id==="cloud-file")!.answer, articleId:"cloud-file" };
  if (/downloaded locally/i.test(lower)) return { text: "Do the files open normally when you double-click them, and are they PNG, JPG/JPEG or WebP? You can answer for the batch generally; you do not need to list every file.", suggestions: ["They open and are PNG/JPG/WebP", "One or more will not open", "They are another format"] };
  if (/batch is rejected immediately/i.test(lower)) return { text: "Copy the message shown under the upload area. I need that exact sentence to tell whether it is the 20-design limit, 500 MB batch limit, or unsupported files." };
  if (/fail during draft creation|finished with failed files/i.test(lower)) return { text: "Paste the exact error shown under one failed design. If several files show the same error, one copy is enough." };
  if (/it is still counting/i.test(lower)) return { text: "The batch is still working. Keep the page open and let it reach Batch finished. If a file is marked Failed at the end, paste the error shown under that file." };
  if (/progress stopped/i.test(lower)) return { text: "Tell me the number shown in both progress indicators and the active filename. Also tell me whether the browser shows any connection message. Do not refresh yet." };
  if (/printify login screen/i.test(lower)) return { text: "Sign into the same Printify account whose token is connected to Goldie, then return and click that draft’s Edit in Printify button again. If it then says product not found, tell me that and we’ll check the account match.", articleId:"editor-login" };
  if (/wrong printify account/i.test(lower)) return { text: "Sign out of Printify in that browser and sign into the account connected to Goldie. Then return to Goldie and click Edit in Printify again; the draft was created inside the token owner’s account.", articleId:"editor-login" };
  if (/no tab opens/i.test(lower)) return { text: "Your browser is blocking the new tab. Look for a blocked pop-up icon at the right side of the address bar. If you see it, click it and allow pop-ups for the Listing Factory.", articleId:"popups", suggestions:["I see the blocked pop-up icon","Nothing appears"] };

  if (exactArticle) return { text: exactArticle.answer, articleId: exactArticle.id };
  return { text: "Tell me what you were trying to do and exactly what happened on the page. If there is an error message, paste it word for word. I’ll narrow it down from there." };
}
