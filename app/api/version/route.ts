import { NextResponse } from "next/server";
import { BUILD_MARKER, BUILD_COMMIT } from "@/app/build-marker";

export async function GET(){
  return NextResponse.json({ok:true,build:BUILD_MARKER,commit:BUILD_COMMIT},{headers:{"cache-control":"no-store"}});
}
