"use client";

import { useState, useEffect, useContext } from "react";
import { Button } from "~/components/ui/button";
import { DataContext } from "~/store/GlobalState";
import { Timer, X } from "lucide-react";

const GeneralTimeout = ({ handleLeave }: { handleLeave: any }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const { state } = useContext(DataContext);
  const { buzzData: currentBuzz } = state;

  // Constants
  const CALL_DURATION_MS = 60 * 60 * 1000; // 1 hour
  const WARNING_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

  const handleTerminateMeeting = async () => {
    try {
      if (handleLeave) await handleLeave();
    } catch (err) {
      // handleLeave && handleLeave();
      // window.location.href = `/${orgSlug}/buzz`;
    }
  };

  useEffect(() => {
    // We use the buzz creation time from your global state or API
    const createdAt = currentBuzz?.created_at;
    if (!createdAt) return;

    const timer = setInterval(() => {
      const startTime = new Date(createdAt).getTime();
      const now = new Date().getTime();
      const elapsed = now - startTime;
      const remaining = CALL_DURATION_MS - elapsed;

      if (remaining <= 0) {
        clearInterval(timer);
        handleTerminateMeeting();
        return;
      }

      setTimeLeft(Math.floor(remaining / 1000));

      // Show modal only when 5 minutes or less remain
      if (remaining <= WARNING_THRESHOLD_MS) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [currentBuzz]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (!isVisible || timeLeft === null) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] animate-in slide-in-from-bottom-5 duration-300">
      <div className="bg-white text-white rounded-lg shadow-2xl p-4 w-[360px] border border-white/10 flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/20 rounded-full">
              <Timer className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="text-[16px] font-medium text-black">
                Call ending soon
              </h3>
              <p className="text-[13px] text-gray-400">
                This call will end for everyone in {formatTime(timeLeft)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsVisible(false)}
            aria-label="Dismiss"
            title="Dismiss"
            className="text-gray-400 hover:text-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => setIsVisible(false)}
            className="text-sm font-medium text-blue-400 hover:bg-blue-400/10 hover:text-blue-300 px-3 h-9"
          >
            Dismiss
          </Button>
          <Button
            onClick={handleTerminateMeeting}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 h-9 rounded-md"
          >
            Leave now
          </Button>
        </div>

        {/* Progress bar background */}
        <div className="absolute bottom-0 left-0 h-1 bg-white/10 w-full rounded-b-lg overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-1000 ease-linear"
            style={{
              width: `${(timeLeft / (WARNING_THRESHOLD_MS / 1000)) * 100}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default GeneralTimeout;
