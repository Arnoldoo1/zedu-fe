import type { Metadata } from "next";
import OfficeDemo from "./_components/OfficeDemo";
import "./office.css";

export const metadata: Metadata = {
  title: "The Office · Zedu",
  description:
    "Walk through a 3D virtual office with channel rooms, private offices, live presence, furniture and Zoe.",
};

export default function OfficePage() {
  return <OfficeDemo />;
}
