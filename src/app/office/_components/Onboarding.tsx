"use client";

import {
  ArrowLeft,
  ArrowRight,
  Compass,
  DoorOpen,
  Keyboard,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";

export function Onboarding({
  open,
  name,
  mode = "demo",
  onClose,
  onTour,
}: {
  open: boolean;
  /** The signed-in person, so the copy is about them and not a demo actor. */
  name?: string;
  mode?: "live" | "demo";
  onClose: () => void;
  onTour: () => void;
}) {
  if (!open) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-40 z-40 flex justify-center px-3 sm:bottom-24">
      <div className="office-glass-strong office-fade-up pointer-events-auto flex max-h-[58vh] w-full max-w-[44rem] flex-col overflow-hidden rounded-3xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/8 px-5 py-4">
          <div>
            <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.2em] text-[#a78bfa]">
              Welcome to The Office
            </p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-white">
              A building for the conversations you already have.
            </h2>
            <p className="mt-1 max-w-[34rem] text-[0.76rem] leading-relaxed text-[#8f98b2]">
              {mode === "live"
                ? `${name ? `You are signed in as ${name}. ` : ""}Channel rooms mirror your Zedu channels, private offices mirror DMs, and Zoe is at reception.`
                : "You are signed in as Ada. Channel rooms mirror your Zedu channels, private offices mirror DMs, and Zoe is at reception."}
            </p>
          </div>
          <button
            type="button"
            className="office-icon-button !h-8 !w-8 !rounded-lg"
            onClick={onClose}
            aria-label="Dismiss welcome"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-2 px-4 py-4 sm:grid-cols-3">
            <Tip
              icon={<Keyboard className="h-4 w-4" />}
              title="Move around"
              body="WASD or arrow keys. Shift to run. Click any floor tile to walk there."
            />
            <Tip
              icon={<DoorOpen className="h-4 w-4" />}
              title="Walk into rooms"
              body="Doors are real. Channel rooms open their existing messages as you enter."
            />
            <Tip
              icon={<Wrench className="h-4 w-4" />}
              title="Make it yours"
              body="In your private office, press B to open the catalogue, hover the floor and press P to place."
            />
          </div>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-white/8 bg-white/[0.02] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            className="text-left text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#7f89a4] transition-colors hover:text-white"
            onClick={onClose}
          >
            I'll explore on my own
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              className="office-button-secondary !h-10"
              onClick={onTour}
            >
              <Compass className="h-4 w-4" />
              Take the tour
            </button>
            <button
              type="button"
              className="office-button-primary !h-10"
              onClick={onClose}
            >
              Start exploring
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Tip({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#8b5cf6]/15 text-[#c4b5fd]">
        {icon}
      </span>
      <p className="mt-2 text-[0.76rem] font-extrabold text-white">{title}</p>
      <p className="mt-1 text-[0.66rem] leading-relaxed text-[#818aa3]">
        {body}
      </p>
    </div>
  );
}

export interface TourStep {
  title: string;
  body: string;
  icon?: "welcome" | "move" | "chat" | "furnish" | "zoe" | "avatar";
  accent?: string;
}

export function TourOverlay({
  step,
  total,
  data,
  onNext,
  onBack,
  onExit,
}: {
  step: number;
  total: number;
  data: TourStep;
  onNext: () => void;
  onBack: () => void;
  onExit: () => void;
}) {
  const last = step >= total - 1;
  const icons = {
    welcome: <Sparkles className="h-4 w-4" />,
    move: <Keyboard className="h-4 w-4" />,
    chat: <DoorOpen className="h-4 w-4" />,
    furnish: <Wrench className="h-4 w-4" />,
    zoe: <Sparkles className="h-4 w-4" />,
    avatar: <Compass className="h-4 w-4" />,
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-16 z-50 flex justify-center px-3 sm:bottom-24">
      <div className="office-glass-strong office-fade-up pointer-events-auto w-full max-w-[36rem] overflow-hidden rounded-3xl border-[#a78bfa]/25">
        <div className="flex items-center gap-2 border-b border-white/8 px-4 py-2.5">
          <span className="office-chip border-[#a78bfa]/25 bg-[#a78bfa]/10 text-[#d8cbff]">
            <Compass className="h-3 w-3" />
            Tour · {step + 1}/{total}
          </span>
          <div className="ml-2 flex flex-1 items-center gap-1.5">
            {Array.from({ length: total }).map((_, index) => (
              <span
                key={index}
                className="office-tour-dot"
                data-active={index <= step}
              />
            ))}
          </div>
          <button
            type="button"
            className="text-[#7f89a4] transition-colors hover:text-white"
            onClick={onExit}
            aria-label="Exit tour"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-start gap-3 px-4 py-4">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
            style={{
              backgroundColor: `${data.accent ?? "#a78bfa"}1f`,
              color: data.accent ?? "#c4b5fd",
            }}
          >
            {icons[data.icon ?? "welcome"]}
          </span>
          <div className="min-w-0">
            <h3 className="text-[1rem] font-black tracking-tight text-white">
              {data.title}
            </h3>
            <p className="mt-1 whitespace-pre-line text-[0.78rem] leading-relaxed text-[#a6aec4]">
              {data.body}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/8 bg-white/[0.02] px-4 py-3">
          <button
            type="button"
            onClick={onBack}
            disabled={step === 0}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.68rem] font-bold text-[#8f98b2] transition-colors hover:text-white disabled:opacity-30"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onExit}
              className="rounded-lg px-2.5 py-1.5 text-[0.68rem] font-bold text-[#7f89a4] transition-colors hover:text-white"
            >
              Exit
            </button>
            <button
              type="button"
              onClick={onNext}
              className="flex items-center gap-1.5 rounded-lg bg-[#8b5cf6] px-3.5 py-2 text-[0.72rem] font-extrabold text-white transition-colors hover:bg-[#7c4df0]"
            >
              {last ? "Finish" : "Next"}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
