"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";

import { cn } from "~/lib/utils";
import type { OfficeFloor } from "~/types/office";
import type { TowerOffice } from "./engine/tower-scene";

/**
 * The overlay around the tower view. The tower itself is 3D, rendered by the
 * engine; this is the rail, the people search and the lift indicator that sit
 * on top of it. The tower is a mode of the same route, not a second page.
 */
export function TowerView({
  floors,
  offices,
  currentFloor,
  liftTarget,
  hovered,
  onSelectFloor,
  onClose,
  onPickPerson,
}: {
  floors: OfficeFloor[];
  offices: TowerOffice[];
  currentFloor: number;
  liftTarget: number | null;
  hovered: TowerOffice | null;
  onSelectFloor: (floorIndex: number) => void;
  onClose: () => void;
  onPickPerson: (office: TowerOffice) => void;
}) {
  const [query, setQuery] = useState("");

  const people = useMemo(
    () => offices.filter((office) => office.occupantName),
    [offices]
  );

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return people
      .filter((office) =>
        (office.occupantName ?? "").toLowerCase().includes(needle)
      )
      .slice(0, 6);
  }, [people, query]);

  const ordered = useMemo(
    () => [...floors].sort((a, b) => a.index - b.index),
    [floors]
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex flex-col justify-between p-4">
      <div className="pointer-events-auto flex items-start justify-between gap-3">
        <div className="w-64 rounded-2xl border border-white/10 bg-[#0b0f1c]/90 p-3 backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
              The tower
            </p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-white/60 transition hover:bg-white/10 hover:text-white"
              aria-label="Leave the tower view"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <label className="flex items-center gap-2 rounded-xl bg-white/5 px-2 py-1.5">
            <Search className="h-3.5 w-3.5 text-white/40" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a person"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
            />
          </label>

          {results.length > 0 && (
            <ul className="mt-2 space-y-1">
              {results.map((office) => (
                <li key={office.roomId}>
                  <button
                    type="button"
                    onClick={() => onPickPerson(office)}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm text-white/85 transition hover:bg-white/10"
                  >
                    <span className="truncate">{office.occupantName}</span>
                    <span className="text-[11px] text-white/45">
                      Floor {office.floorIndex}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {query.trim() && results.length === 0 && (
            <p className="mt-2 px-1 text-xs text-white/45">
              Nobody by that name.
            </p>
          )}
        </div>

        <p className="rounded-full border border-white/10 bg-[#0b0f1c]/90 px-3 py-1.5 text-xs text-white/70 backdrop-blur">
          {people.length} in the tower
        </p>
      </div>

      {hovered && (
        <div className="pointer-events-none mx-auto rounded-xl border border-white/10 bg-[#0b0f1c]/90 px-3 py-2 text-center text-xs text-white/80 backdrop-blur">
          <span className="font-medium text-white">{hovered.name}</span>
          <span className="text-white/50"> · Floor {hovered.floorIndex}</span>
          {hovered.occupantName && (
            <span className="ml-2 inline-flex items-center gap-1">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  hovered.status === "dnd"
                    ? "bg-rose-400"
                    : hovered.status === "call"
                      ? "bg-sky-400"
                      : hovered.status === "idle"
                        ? "bg-amber-400"
                        : hovered.status === "away"
                          ? "bg-slate-400"
                          : "bg-emerald-400"
                )}
              />
              in their office
            </span>
          )}
        </div>
      )}

      <div className="pointer-events-auto mx-auto flex items-center gap-2 rounded-2xl border border-white/10 bg-[#0b0f1c]/90 p-2 backdrop-blur">
        <button
          type="button"
          onClick={() => onSelectFloor(0)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition",
            currentFloor === 0
              ? "bg-violet-500 text-white"
              : "text-white/70 hover:bg-white/10"
          )}
        >
          General
        </button>
        <ChevronDown className="h-3 w-3 rotate-[-90deg] text-white/25" />
        {ordered
          .filter((floor) => floor.kind === "member")
          .map((floor) => (
            <button
              key={floor.index}
              type="button"
              onClick={() => onSelectFloor(floor.index)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                currentFloor === floor.index
                  ? "bg-violet-500 text-white"
                  : "text-white/70 hover:bg-white/10"
              )}
              title={`${floor.members}/${floor.capacity} people`}
            >
              {floor.name}
            </button>
          ))}
      </div>

      {liftTarget !== null && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-2xl border border-violet-400/30 bg-[#0b0f1c]/95 px-6 py-4 text-center backdrop-blur">
            <p className="text-xs uppercase tracking-widest text-violet-300/70">
              Lift
            </p>
            <p className="mt-1 text-lg font-semibold text-white">
              {liftTarget === 0 ? "General floor" : `Floor ${liftTarget}`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
