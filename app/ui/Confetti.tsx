"use client";

import { useEffect, useRef } from "react";

// One burst, on a canvas, when an order goes in.
//
// A canvas rather than a few hundred absolutely-positioned divs: the browser
// animates one element instead of laying out and compositing 140 of them, and
// when it's finished there is nothing left in the DOM to clean up. On the
// phones this app is actually used on, the div version drops frames at
// exactly the moment the app is trying to feel good.
//
// The colours are the shop's, not the reference's rainbow. Confetti in
// somebody else's palette reads as a component someone dropped in; in ours it
// reads as the same app doing something nice.
const COLOURS = ["--cb-olive", "--cb-sage", "--cb-red", "--cb-sun", "--cb-sky"];

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  // Half-width and half-height of the rectangle, in device pixels.
  w: number;
  h: number;
  rotation: number;
  spin: number;
  colour: string;
};

const GRAVITY = 0.0011;
const DRAG = 0.995;
const LIFETIME = 2600;

export default function Confetti({ pieces = 130 }: { pieces?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    // Nothing at all under reduced motion. Not a slower version, not a fade:
    // somebody who has asked their phone to stop moving things has asked for
    // this specifically, and a gentler burst is still a burst. The tick and
    // the wording carry the whole message without it.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Bound to locals after the guards rather than used through the refs: the
    // draw function below is hoisted, so TypeScript can't carry the narrowing
    // into it and every line would need a non-null assertion to say something
    // the two lines above already proved.
    const surface = canvas;
    const paint = surface.getContext("2d");
    if (!paint) return;
    const context = paint;

    // Capped at 2. A 3x phone would have us pushing three times the pixels for
    // a difference nobody can see on confetti that is gone in two seconds.
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const parent = surface.parentElement;
    const width = parent?.clientWidth ?? window.innerWidth;
    const height = parent?.clientHeight ?? window.innerHeight;
    surface.width = width * scale;
    surface.height = height * scale;

    // Resolved once, here, rather than being handed to the canvas as-is:
    // ctx.fillStyle does not understand var(--cb-olive), it just silently
    // keeps the previous colour. Reading them off the element turns them into
    // the rgb() the canvas can use, and it picks up dark mode for free.
    const styles = getComputedStyle(surface);
    const palette = COLOURS.map(
      (token) => styles.getPropertyValue(token).trim() || "#3e4a30",
    );

    // Two launchers, up and inward from the bottom corners of the card, which
    // is where a party popper would be. A single centre burst reads as a
    // firework and covers the text on the way down.
    const items: Piece[] = Array.from({ length: pieces }, (_, index) => {
      const left = index % 2 === 0;
      const spread = (Math.random() - 0.5) * 0.9;
      const speed = (0.9 + Math.random() * 0.75) * scale;
      const angle = (left ? -Math.PI / 3 : -(Math.PI * 2) / 3) + spread;
      return {
        x: (left ? width * 0.12 : width * 0.88) * scale,
        y: height * 0.72 * scale,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: (3 + Math.random() * 4) * scale,
        h: (5 + Math.random() * 6) * scale,
        rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.22,
        colour: palette[index % palette.length],
      };
    });

    let frame = 0;
    let start: number | null = null;
    let last = 0;

    const draw = (now: number) => {
      if (start === null) {
        start = now;
        last = now;
      }
      const elapsed = now - start;
      // A real per-frame delta, so the fall looks the same on a 60Hz screen
      // and a 120Hz one instead of running at double speed on ProMotion.
      // Clamped at ~2 frames so a tab that was backgrounded doesn't resume by
      // teleporting everything off the bottom in a single enormous step.
      const step = Math.min(now - last, 34);
      last = now;

      context.clearRect(0, 0, surface.width, surface.height);
      // Fades out over the last third rather than vanishing mid-air.
      context.globalAlpha = Math.max(0, Math.min(1, (LIFETIME - elapsed) / (LIFETIME / 3)));

      for (const piece of items) {
        piece.vy += GRAVITY * step * scale;
        piece.vx *= DRAG;
        piece.x += piece.vx * step;
        piece.y += piece.vy * step;
        piece.rotation += piece.spin;

        context.save();
        context.translate(piece.x, piece.y);
        context.rotate(piece.rotation);
        context.fillStyle = piece.colour;
        // Scaled on one axis by the spin so each piece reads as a flat scrap
        // turning over, rather than a rectangle sliding around.
        context.scale(1, Math.abs(Math.cos(piece.rotation)) * 0.7 + 0.3);
        context.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
        context.restore();
      }

      if (elapsed < LIFETIME) frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [pieces]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
