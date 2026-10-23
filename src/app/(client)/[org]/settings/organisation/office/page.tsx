"use client";

import SettingsLabel from "../../components/settings-label";
import OfficeSetting from "./components/office-setting";

const OfficeSettingsPage = () => {
  return (
    <div className="">
      <SettingsLabel />
      <div className="p-4 lg:px-8">
        <div className="mb-4">
          <h1 className="text-base font-semibold">The Office</h1>
          <p className="text-sm text-[#344054]">
            Decide whether your organisation gets a 3D office, and turn it on or
            off whenever you like.
          </p>
        </div>

        <OfficeSetting />
      </div>
    </div>
  );
};

export default OfficeSettingsPage;
