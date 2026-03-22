"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { PoliticianAvatar } from "./politician-avatar";

export type RainItem = {
  questionId: string;
  body: string;
  slug: string;
  fullName: string;
  photoUrl: string | null;
};

type Drop = {
  id: number;
  item: RainItem;
  laneIdx: number;
  duration: number;
  initialOffset: number;
};

const LANE_OFFSETS_PX = [0, 28, 56];
const MAX_DROPS = 5;

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

export function PoliticianRain({ items }: { items: RainItem[] }) {
  const [drops, setDrops] = useState<Drop[]>([]);
  const counterRef = useRef(0);
  const deckRef = useRef<RainItem[]>([]);
  const deckIdxRef = useRef(0);
  const activeRef = useRef(0);
  const mountedRef = useRef(false);

  const nextItem = useCallback((): RainItem => {
    if (deckIdxRef.current >= deckRef.current.length) {
      deckRef.current = shuffle(deckRef.current.length ? deckRef.current : items);
      deckIdxRef.current = 0;
    }
    return deckRef.current[deckIdxRef.current++]!;
  }, [items]);

  const spawnDrop = useCallback(
    (laneIdx: number, initialOffset = 0) => {
      if (!mountedRef.current || activeRef.current >= MAX_DROPS) return;
      const item = nextItem();
      const duration = 14 + Math.random() * 8;
      const id = counterRef.current++;
      activeRef.current++;
      setDrops((prev) => [...prev, { id, item, laneIdx, duration, initialOffset }]);

      // Remove after animation completes, then schedule next in this lane
      const runTime = (duration - initialOffset) * 1000;
      setTimeout(() => {
        if (!mountedRef.current) return;
        setDrops((prev) => prev.filter((d) => d.id !== id));
        activeRef.current--;
        const wait = 2500 + Math.random() * 3500;
        setTimeout(() => spawnDrop(laneIdx), wait);
      }, runTime);
    },
    [nextItem]
  );

  useEffect(() => {
    if (!items.length) return;
    deckRef.current = shuffle(items);
    mountedRef.current = true;

    // Stagger initial spawns across lanes, each starting partway into its animation
    LANE_OFFSETS_PX.forEach((_, i) => {
      const delay = i * 2200 + Math.random() * 1500;
      setTimeout(() => spawnDrop(i, 2 + i * 3), delay);
    });

    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!items.length) return null;

  return (
    <div
      className="fixed top-0 right-0 w-[280px] h-screen overflow-hidden pointer-events-none hidden [@media(min-width:1100px)]:block"
      style={{
        WebkitMaskImage: "linear-gradient(to left, transparent 0%, black 30%)",
        maskImage: "linear-gradient(to left, transparent 0%, black 30%)",
      }}
    >
      {/* Top fade */}
      <div
        className="absolute inset-x-0 top-0 h-28 z-10 pointer-events-none"
        style={{ background: "linear-gradient(to bottom, var(--background) 0%, transparent 100%)" }}
      />
      {/* Bottom fade */}
      <div
        className="absolute inset-x-0 bottom-0 h-28 z-10 pointer-events-none"
        style={{ background: "linear-gradient(to top, var(--background) 0%, transparent 100%)" }}
      />

      {drops.map((drop) => (
        <Link
          key={drop.id}
          href={`/${drop.item.slug}#question-${drop.item.questionId}`}
          className="absolute top-[-140px] flex items-start gap-2 bg-card border border-border rounded-xl p-2 w-[220px] pointer-events-auto no-underline hover:border-foreground/20 hover:bg-muted transition-colors"
          style={{
            left: LANE_OFFSETS_PX[drop.laneIdx] + "px",
            animationName: "politician-rain-fall",
            animationDuration: drop.duration + "s",
            animationTimingFunction: "linear",
            animationFillMode: "forwards",
            animationDelay: drop.initialOffset ? `-${drop.initialOffset}s` : "0s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.animationPlayState = "paused")}
          onMouseLeave={(e) => (e.currentTarget.style.animationPlayState = "running")}
        >
          <PoliticianAvatar
            photoUrl={drop.item.photoUrl}
            fullName={drop.item.fullName}
            size={28}
          />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-muted-foreground truncate mb-0.5">
              {drop.item.fullName}
            </p>
            <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
              {drop.item.body}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
