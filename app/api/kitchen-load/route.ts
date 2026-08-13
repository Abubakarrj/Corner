import { ordersAhead } from "../../kitchenQueue";
import { isOpenNow } from "../../shopFacts";

// How busy the counter is, for the line under the Order button.
//
// Three shapes of answer, and the difference between the last two is the whole
// point of the endpoint:
//
//   { known: false }              we cannot say. The component renders nothing.
//   { known: true, ahead: 0 }     nothing waiting. A real, checked zero.
//   { known: true, ahead: 6 }     six orders on the counter.
//
// The count is the whole queue rather than a slice: the shop takes no counter
// orders, so nothing reaches that counter without passing through here. See
// app/kitchenQueue.ts for the two things that would change that.
//
// A missing database, an unreachable one, or a shut shop all give the first.
// Rendering those as a confident "0 ahead — kitchen is clear" would be a
// number invented out of an error, on the screen somebody uses to decide
// whether to walk over.

export const dynamic = "force-dynamic";

export async function GET() {
  // A shut shop has no queue worth reporting. The count would be whatever was
  // left open when the kitchen closed, which is a number about yesterday.
  if (!isOpenNow()) {
    return Response.json({ known: false });
  }

  const ahead = await ordersAhead();
  if (ahead === null) return Response.json({ known: false });

  // The count and nothing else. A prep estimate rode along here for a while,
  // for a line under the button that read "about 12 minutes once you order" —
  // checkout already says what time the food is ready, and a field kept for a
  // caption that no longer prints it is the kind of thing somebody wires back
  // into a screen two years from now.
  return Response.json(
    { known: true, ahead },
    {
      // Ten seconds. Long enough that a rush of people opening the sheet does
      // not become a query per visitor, short enough that the number is about
      // now. It is a busyness reading, not a booking.
      headers: { "Cache-Control": "public, max-age=10" },
    },
  );
}
