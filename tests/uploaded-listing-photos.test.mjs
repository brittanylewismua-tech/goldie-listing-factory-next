import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("seller uploads are exact-listing photos that publish, reorder, download and remove",async()=>{
  const[app,uploader,images,order,finish,download,nav]=await Promise.all([
    read("app/listing-factory-app.tsx"),read("app/uploaded-listing-photos.tsx"),read("app/api/etsy/images/route.ts"),read("app/listing-photo-order.tsx"),read("app/api/etsy/finish.ts"),read("app/api/listing-photos/download/route.ts"),read("app/management-nav.tsx")]);
  assert.match(app,/<UploadedListingPhotos productId=\{draft\.id\}/);
  assert.match(app,/listing-photo-design-identity/);
  assert.match(app,/design\.previewUrl/);
  assert.match(app,/PHOTOS FOR THIS DESIGN/);
  assert.match(uploader,/form\.set\("productId",productId\)/);
  assert.match(uploader,/form\.set\("kind","upload"\)/);
  assert.match(uploader,/multiple type="file"/);
  assert.match(uploader,/Upload photos/);
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
