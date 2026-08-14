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
  const connectionIssue = /(printify|token).{0,30}(won'?t|will not|doesn'?t|does not|can'?t|cannot|not|fail|failing|problem).{0,20}(connect|work|accept)|(token).{0,30}(fail|failing|not work|rejected)|(?:connect|connection).{0,30}(printify|token)|(?:printify|token).{0,20}(connect|connection)/i.test(lower);
  const templateIssue = /template.{0,30}(won'?t|will not|doesn'?t|does not|can'?t|cannot|not|fail|problem|load)|(?:load|loading).{0,20}(template|product)/i.test(lower);
  const uploadIssue = /(?:image|file|design).{0,30}(won'?t|will not|doesn'?t|does not|can'?t|cannot|not|fail|problem|upload|appear)|(?:upload|add|adding).{0,20}(image|file|design)/i.test(lower);
  const draftIssue = /(?:draft|listing).{0,30}(won'?t|will not|doesn'?t|does not|can'?t|cannot|not|fail|problem|create)|(?:create|creating).{0,20}(draft|listing)/i.test(lower);
  const editorIssue = /(?:edit|open|opening).{0,30}(printify|draft|listing)|(?:printify|draft).{0,30}(login|tab|editor|product not found)/i.test(lower);
  const openAllIssue = /open all.{0,30}(won'?t|will not|doesn'?t|does not|can'?t|cannot|not|nothing|fail|problem|work)/i.test(lower);

  if (/already (did|tried|made|created|used) (that|it)|i did that already/i.test(lower)) {
    if (/connect|token|printify/i.test(context)) return { text: "Okay, the token step is already done. What exact message appears when you click Connect Printify? If there is no message, tell me whether the button does nothing or stays on Connecting….", suggestions:["I see an error message","The button does nothing","It stays on Connecting"] };
    if (/template/i.test(context)) return { text: "Okay, that template step is already done. What exact message appears now when you load it or create the drafts?" };
    return { text: "Okay. Tell me what happened after that step, including any message now showing on the page, and I’ll continue from there." };
  }

  if (/^(that|this|it) (still )?(didn'?t|doesn'?t|did not|does not) work|same (thing|error)|still (failing|broken|not working)/i.test(lower)) {
    if (!previousArticle) return { text: "Let’s take another look. What message are you seeing now? You can also choose the part that’s still giving you trouble below.", suggestions: STAGES };
    const followUps: Record<string, SupportResponse> = {
      "image-8253": { text: "After you clicked Retry failed designs, did you see the same 8253 message, a different error, or is the retry still running?", suggestions: ["Same 8253 error", "A different error", "It is still running"] },
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
  if (/yes,? same printify account/i.test(lower)) return { text: "Click the individual Edit in Printify button one more time now that the correct account is active. If that exact draft still says product not found, use Contact Support and include the draft name plus an optional screenshot. The team needs to inspect the generated editor link.", articleId: "editor-login" };
  if (/no,? different account/i.test(lower)) return { text: "Sign out of Printify in that browser, sign into the account connected to Goldie, then return to the Listing Factory and click Edit in Printify again. The draft lives in the account attached to the token.", articleId: "editor-login" };
  if (/blocked pop-up icon/i.test(lower)) return { text: "Click that icon in the browser address bar, choose Always allow pop-ups and redirects from the Goldie Listing Factory, then click Done and use Open all in Printify again.", articleId: "popups" };
  if (/nothing appears/i.test(lower) && /open all|pop-up|tabs/i.test(context)) return { text: "Use the individual Edit in Printify buttons for now. If those work but Open all does nothing, allow pop-ups for the Listing Factory in the browser’s site settings, then reload only after your current batch is finished.", articleId: "popups" };
  if (/only \d+ (?:of|out of) \d+ (?:created|worked|finished)|\d+ (?:of|out of) \d+ (?:failed|created)|all (?:of )?(?:them|the designs|the files).{0,20}(failed|error)/i.test(lower)) return { text: "Check the results listed under Latest batch. What exact message appears under one of the failed designs? If they all show the same message, paste it once." };
  if (/returned an error|showing an error|got an error/i.test(lower) && !/\b\d{3,5}\b/.test(lower)) return { text: "Paste the complete error message exactly as it appears. The wording will tell me which step failed without making you repeat anything that already worked." };

  const exactArticle = findSupportArticle(clean);
  const hasSpecificSignal = /\b(8253|8150|8201|429|401|403|500|502|503|504)\b|provided images do not exist|validation failed|failed to fetch|could not be decoded|product not found|unauthorized|file\.size\.limit/i.test(clean);
  if (/product (?:was |is )?not found|template product was not found/i.test(lower)) return { text: "Let’s check whether this is the template itself or the connected Printify account. Does that product open normally when you paste its link into a browser where you’re signed into Printify?", suggestions: ["Yes, it opens normally in Printify", "No, Printify says product not found"] };
  if (/unauthorized|\b401\b|did not accept (?:that|the) token|rejected (?:the|my) (?:saved )?(?:connection|token)/i.test(lower)) return { text: "Printify is rejecting the token itself. Was this token newly created with all access scopes enabled and pasted in full, or are you using a token you already had?", suggestions: ["New token with all scopes", "I’m not sure about the scopes", "An older token"] };
  if (exactArticle && hasSpecificSignal) return { text: exactArticle.answer, articleId: exactArticle.id };

  if (/new token with all scopes/i.test(lower)) return { text: "Good, that rules out the usual scope issue. What exact message appears after you paste it and click Connect Printify? If there is no message, choose that below.", suggestions: ["It says unauthorized", "The button does nothing", "It keeps saying Connecting"] };
  if (/(?:already|just) (?:made|created|have|used).{0,35}(?:token).{0,35}(?:all|every) (?:access )?scopes|token.{0,35}(?:all|every) (?:access )?scopes.{0,25}(?:still|but).{0,20}(?:won'?t|will not|doesn'?t|does not|fail)/i.test(lower)) return { text: "That rules out missing token scopes. What happens after you paste that token and click Connect Printify: an error message, no visible response, or Connecting… without finishing?", suggestions: ["I see an error message", "There is no visible response", "It stays on Connecting"] };
  if (/not sure about the scopes/i.test(lower)) return { text: "Open Printify → Account → Connections and create a fresh personal access token with every scope enabled. Copy the complete token when Printify shows it, then return here and connect it. Printify only displays the token once.", articleId:"token-connect" };
  if (/an older token/i.test(lower)) return { text: "Create a fresh personal access token in Printify → Account → Connections with every scope enabled. Copy it when it appears, then disconnect the old Printify connection in Goldie and connect the fresh token.", articleId:"token-connect" };
  if (/keeps saying connecting/i.test(lower)) return { text: "How long has it stayed on Connecting…, and does a red message appear if you wait about 30 seconds?", suggestions:["It returns to the button with no message","A red message appears","It stays on Connecting"] };
  if (/no visible (?:response|change)|there is no visible response/i.test(lower) && /connect|printify|token/i.test(context)) return { text: "The connection request is not visibly starting. Reload the Listing Factory, paste the same token again, and click Connect Printify once. If the button still does not change, use Contact Support and include your browser and device; do not send the token or include it in a screenshot." };
  if (/nothing happens.{0,30}connect printify|connect printify.{0,30}(does nothing|nothing happens)|the button does nothing/i.test(lower) && /connect|printify|token/i.test(context)) return { text: "When you click Connect Printify, does the button change to Connecting… at all, or is there no visible change?", suggestions:["It changes to Connecting","There is no visible change"] };
  if (/files never appear/i.test(lower)) return { text: "Are the designs stored only in iCloud, OneDrive or Google Drive, or are they fully downloaded into a normal folder on the computer?", suggestions: ["They are in cloud storage", "They are downloaded locally"] };
  if (/batch is rejected immediately/i.test(lower)) return { text: "Copy the message shown under the upload area. I need that exact sentence to tell whether it is the 20-design limit, 500 MB batch limit, or unsupported files." };
  if (/fail during draft creation|finished with failed files/i.test(lower)) return { text: "Paste the exact error shown under one failed design. If several files show the same error, one copy is enough." };

  if (connectionIssue) return { text: "Let’s narrow down the connection issue first. Are you seeing an error message under Connect Printify, does the button do nothing, or does it stay on Connecting…?", suggestions: ["I see an error message", "The button does nothing", "It stays on Connecting"] };
  if (templateIssue) return { text: "Let’s narrow down what’s happening with the template. After you click Load template, does Goldie say the product wasn’t found, show a different red message, or keep loading without finishing?", suggestions: ["Product was not found", "A different red message", "It keeps loading"] };
  if (/all (?:of )?(?:my |the )?(?:images|designs|files).{0,20}(?:failed|error)/i.test(lower)) return { text: "Where do they fail: before the files appear on the page, immediately after you click Create Printify drafts, or at the end with an error listed under each design?", suggestions: ["They never appear on the page", "The batch is rejected immediately", "Errors appear under the designs"] };
  if (uploadIssue && !/design(s)? failed|draft creation/i.test(lower)) return { text: "Let’s find the point where the image upload stops. Do the files never appear after you choose them, does Goldie reject the batch immediately, or do they load successfully and fail later while creating drafts?", suggestions: ["Files never appear", "Batch is rejected immediately", "They fail during draft creation"] };
  if (draftIssue) return { text: "Let’s check the draft-creation step. Is the batch still counting through designs, has it finished with files marked Failed, or has the progress stopped changing?", suggestions: ["It is still counting", "It finished with failed files", "The progress stopped"] };
  if (openAllIssue) return { text: "When you click Open all in Printify, do you see a blocked pop-up icon in the browser’s address bar, or does nothing appear at all?", suggestions:["I see the blocked pop-up icon","Nothing appears"] };
  if (editorIssue) return { text: "Let’s check what happens when Goldie hands the draft to Printify. Do you see a login screen, product not found, the wrong account, or no new tab at all?", suggestions: ["Printify login screen", "Product not found", "Wrong Printify account", "No tab opens"] };
  if (/i see an error message|i have an error code|a different red message|a red message appears/i.test(lower)) return { text: "Paste the complete error message exactly as it appears. That will tell me which part failed without making you repeat steps that may already be correct." };

  if (/design(s)? failed|draft(s)? failed|not working|won'?t work|doesn'?t work|problem|error/i.test(lower) && !hasSpecificSignal) return { text: "Let’s narrow it down so I can give you the right fix. Which part were you on when the design failed?", suggestions: STAGES };

  if (/button does nothing/i.test(lower)) return { text: "Tell me which button it is: Connect Printify, Load template, Create drafts, Retry failed designs, Edit in Printify, or Open all. Each one has a different cause.", suggestions: ["Connect Printify", "Load template", "Create drafts", "Retry failed designs", "Edit in Printify", "Open all"] };
  if (/cloud storage/i.test(lower)) return { text: SUPPORT_ARTICLES.find((article)=>article.id==="cloud-file")!.answer, articleId:"cloud-file" };
  if (/downloaded locally/i.test(lower)) return { text: "Do the files open normally when you double-click them, and are they PNG, JPG/JPEG or WebP? You can answer for the batch generally; you do not need to list every file.", suggestions: ["They open and are PNG/JPG/WebP", "One or more will not open", "They are another format"] };
  if (/it is still counting/i.test(lower)) return { text: "The batch is still working. Keep the page open and let it reach Batch finished. If a file is marked Failed at the end, paste the error shown under that file." };
  if (/progress stopped/i.test(lower)) return { text: "Tell me the number shown in both progress indicators and the active filename. Also tell me whether the browser shows any connection message. Do not refresh yet." };
  if (/printify login screen/i.test(lower)) return { text: "Sign into the same Printify account whose token is connected to Goldie, then return and click that draft’s Edit in Printify button again. If it then says product not found, tell me that and we’ll check the account match.", articleId:"editor-login" };
  if (/wrong printify account/i.test(lower)) return { text: "Sign out of Printify in that browser and sign into the account connected to Goldie. Then return to Goldie and click Edit in Printify again; the draft was created inside the token owner’s account.", articleId:"editor-login" };
  if (/no tab opens/i.test(lower)) return { text: "Your browser is blocking the new tab. Look for a blocked pop-up icon at the right side of the address bar. If you see it, click it and allow pop-ups for the Listing Factory.", articleId:"popups", suggestions:["I see the blocked pop-up icon","Nothing appears"] };

  if (exactArticle) return { text: exactArticle.answer, articleId: exactArticle.id };
  return { text: "Let’s sort it out. What were you trying to do, and what happened on the page? If you can see an error message, paste it here too." };
}
