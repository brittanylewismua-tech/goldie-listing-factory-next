import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("seller uploads are exact-listing photos that publish, reorder, download and remove",async()=>{
  const[app,uploader,images,order,finish,download,nav]=await Promise.all([
    read("app/listing-factory-app.tsx"),read("app/uploaded-listing-photos.tsx"),read("app/api/etsy/images/route.ts"),read("app/listing-photo-order.tsx"),read("app/api/etsy/finish.ts"),read("app/api/listing-photos/download/route.ts"),read("app/factory-shell.tsx")]);
  assert.match(app,/<UploadedListingPhotos productId=\{draft\.id!\}/);
  assert.match(app,/className="listing-photo-workspace"/);
  /* D684 - the uploads panel showed the design artwork and the design's filename.
     It has to show the listing she is uploading photos to. */
  /* D709 · Uploading and ordering are one panel now, so the identity block
     heads both jobs and no longer says "adding". The rule it enforces is the
     one that matters and is unchanged: this names the LISTING being worked on,
     not the design's upload filename. */
  assert.match(app,/<ListingPhotoOrder productId=\{draft\.id!\}/);
  assert.doesNotMatch(app,/\{design\.name\|\|"Untitled design"\}<\/b>/);
  assert.doesNotMatch(app,/PHOTOS FOR THIS DESIGN/);
  assert.match(app,/<PrintifyImagePicker bare/);
  assert.match(uploader,/form\.set\("productId",productId\)/);
  assert.match(uploader,/form\.set\("kind","upload"\)/);
  assert.match(uploader,/multiple type="file"/);
  assert.match(uploader,/Upload photos/);
  assert.doesNotMatch(uploader,/<span>\{photo\.name\}<\/span>/);
  assert.match(uploader,/alt="Uploaded listing photo"/);
  assert.doesNotMatch(uploader,/No additional photos uploaded|keeps the files unchanged|uses them only for this listing/);
  assert.match(images,/if\(!await ownsDraft\(user\.userId,productId\)\)/);
  assert.match(images,/key\.startsWith\(ownedPrefix\)/);
  assert.match(images,/id!==`stored:\$\{key\}`/,"removal also clears the saved order");
  assert.match(order,/image\.kind==="mockup"\|\|image\.kind==="uploaded"/);
  assert.match(finish,/object\.key\.includes\("\/mockup\/"\)\|\|object\.key\.includes\("\/upload\/"\)/);
  assert.match(download,/object\.key\.includes\("\/mockup\/"\)\|\|object\.key\.includes\("\/upload\/"\)/);
  assert.doesNotMatch(app,/<IntegratedMockups|<MockupSetSelector|Adjust placement|Create lifestyle mockups/);
  assert.doesNotMatch(nav,/Mockup Library|href:"\/mockups"/);
});
