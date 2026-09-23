import { redirect } from "next/navigation";

/*
  D1798 · THE DESIGN SCANNER IS GONE.

  Two halves lived here. The listing check asked a member to pick one of their
  own listings from a dropdown - the same listings Shop Map already holds,
  already displays and already knows the sales of. A page whose job is to
  reproduce a list that exists two clicks away is a second copy of the list,
  not a second tool. It is on the listing now.

  The artwork scan is deleted rather than moved. It needed a cohort assembled
  from recorded buyer activity, which for any phrase nobody had been watching
  did not exist, so it refused almost everything; and when it did answer it
  returned soft statements about layout and contrast that nobody can act on.
  Reported as useless twice, and it was.

  The route stays and redirects, because bookmarks and the Hot List's own
  links point at it.
*/
export default function DesignScannerPage() {
  redirect("/shop-map");
}
