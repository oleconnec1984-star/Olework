"use client";

import { useState } from "react";
import { AvatarStudio, PixelEmployeeAvatar } from "../avatar-studio";
import { defaultPresetAvatar, presetAvatars, type AvatarV3 } from "../../lib/avatar";

export default function StudioLab({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState<AvatarV3>(defaultPresetAvatar);

  async function save(value: AvatarV3) {
    setBusy(true);
    setError("");
    setMessage("");
    await new Promise((resolve) => setTimeout(resolve, 350));
    if (fail) setError("ทดสอบ: ระบบข้อมูลไม่พร้อม ตัวละครนี้ยังไม่ได้บันทึก");
    else {
      setSaved(value);
      setMessage("ทดสอบการตอบกลับสำเร็จ — ไม่ใช่ข้อมูลพนักงานจริง");
    }
    setBusy(false);
  }

  return (
    <main className={compact ? "av-lab av-lab-compact" : "av-lab"}>
      <p className="av-lab-notice">ตัวละครตัวอย่างสำหรับทดสอบ · ไม่เชื่อมข้อมูลพนักงานจริง</p>
      {!compact && (
        <div className="av-lab-gallery">
          {presetAvatars.slice(0, 6).map((preset) => (
            <article className="av-lab-person" key={preset.id}>
              <PixelEmployeeAvatar config={{ version: 3, presetId: preset.id }} label={preset.name} />
              <h2>{preset.name}</h2>
            </article>
          ))}
        </div>
      )}
      <p>
        <button onClick={() => setOpen(true)}>เปิดคลังตัวละคร</button>{" "}
        <label><input type="checkbox" checked={fail} onChange={(event) => setFail(event.target.checked)} />จำลองบันทึกล้มเหลว</label>
      </p>
      {open && (
        <div className="av-lab-studio">
          <AvatarStudio
            initial={saved}
            name="ทีมตัวอย่าง"
            busy={busy}
            error={error}
            savedMessage={message}
            onSave={(value) => void save(value)}
            close={() => { setOpen(false); setError(""); setMessage(""); }}
          />
        </div>
      )}
    </main>
  );
}
