import { ordersAhead } from "../../kitchenQueue";
import { PREP_MINUTES, isOpenNow } from "../../shopFacts";

// How busy the counter is, for the line under the Order button.
//
// Three shapes of answer, and the difference between the last two is the whole
// point of the endpoint:
//
//   { known: false }              we cannot say. The component renders nothing.
//   { known: true, ahead: 0 }     nothing waiting. A real, checked zero.
//   { known: true, ahead: 6 }     six online orders on the counter.
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

  return Response.json(
    { known: true, ahead, prepMinutes: PREP_MINUTES },
    {
      // Ten seconds. Long enough that a rush of people opening the sheet does
      // not become a query per visitor, short enough that the number is about
      // now. It is a busyness reading, not a booking.
      headers: { "Cache-Control": "public, max-age=10" },
    },
  );
}
