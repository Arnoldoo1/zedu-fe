import type { Metadata } from "next";
import LiveOfficePage from "../_components/office/live-office-page";

export const metadata: Metadata = {
  title: "The Office · Zedu",
  description:
    "Walk through your organisation's 3D virtual office: channel rooms, private offices, live presence and Zoe.",
};

export default function OfficePage() {
  return <LiveOfficePage />;
}
