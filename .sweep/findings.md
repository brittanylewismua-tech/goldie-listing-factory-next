# Click-through findings (holding for ONE deploy)

1. RAIL LOSES TICKS WHEN YOU GO BACK. `done = position < stagePosition` — a stage
   reads done only if you have walked past it. On step 1, IMAGES and LISTING show
   as not done on a batch whose images and listing details are finished. Measured:
   step 3 rail = PRODUCT✓ IMAGES✓ LISTING*, step 1 rail = PRODUCT* IMAGES LISTING.
