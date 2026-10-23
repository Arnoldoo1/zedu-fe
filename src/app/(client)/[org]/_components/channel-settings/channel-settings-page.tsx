"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useContext, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { DataContext } from "~/store/GlobalState";
import { cn } from "~/lib/utils";
import { useRBAC } from "~/hooks/useRBAC";
import ChannelWebhookPanel from "~/app/(client)/[org]/_components/webhooks/channel-webhook-panel";
import ChannelManagement from "./channel-management";
import SystemMessage from "./system-message";

const CHANNEL_SETTINGS_TABS = [
  { id: "management", label: "Channel management" },
  { id: "system-message", label: "System message" },
  { id: "webhooks", label: "Webhooks" },
] as const;

type ChannelSettingsTab = (typeof CHANNEL_SETTINGS_TABS)[number]["id"];

export default function ChannelSettingsPage() {
  const params = useParams();
  const channelId = params.id as string;
  const { state } = useContext(DataContext);
  const { hasPermission } = useRBAC();
  const canManageWebhooks = hasPermission("create:webhooks");
  const { orgSlug, channelDetails } = state;
  const [tab, setTab] = useState<ChannelSettingsTab>("management");

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested === "management" || requested === "system-message") {
      setTab(requested);
      return;
    }
    if (requested === "webhooks" && canManageWebhooks) {
      setTab("webhooks");
    }
  }, [canManageWebhooks]);

  const tabs = CHANNEL_SETTINGS_TABS.filter(
    (item) => item.id !== "webhooks" || canManageWebhooks
  );

  const channelName =
    String(channelDetails?.channels_id || "") === String(channelId)
      ? channelDetails?.name
      : "";

  return (
    <div className="h-[calc(100dvh-70px)] overflow-y-auto bg-[#F8F9FB] dark:bg-[#1A1D21]">
      <div className="w-full px-4 py-6 lg:px-8 lg:py-8">
        <Link
          href={`/${orgSlug}/home/channels/${channelId}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#5757CD] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {channelName ? `#${channelName}` : "channel"}
        </Link>

        <div className="mt-4 mb-6">
          <h1 className="text-xl font-bold text-[#101828] dark:text-zinc-100">
            Channel settings
          </h1>
          <p className="text-sm text-[#667085] dark:text-zinc-400 mt-1">
            Manage this channel. More settings can be added as tabs.
          </p>
        </div>

        <div className="border-b border-[#E6EAEF] dark:border-white/10 mb-6 overflow-x-auto overflow-y-hidden">
          <div className="flex gap-6 min-w-max" role="tablist">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
                className={cn(
                  "pb-3 text-sm font-semibold border-b-2 -mb-px",
                  tab === item.id
                    ? "border-[#5757CD] text-[#5757CD]"
                    : "border-transparent text-[#667085] dark:text-zinc-400"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {tab === "management" && <ChannelManagement channelId={channelId} />}
        {tab === "system-message" && <SystemMessage channelId={channelId} />}
        {tab === "webhooks" && canManageWebhooks && (
          <ChannelWebhookPanel
            channelId={channelId}
            channelName={channelName || "channel"}
          />
        )}
      </div>
    </div>
  );
}
