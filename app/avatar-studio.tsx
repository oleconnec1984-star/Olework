"use client";

import { useMemo, useState } from "react";
import {
  normalizePresetAvatar,
  presetAvatars,
  type AvatarConfig,
  type AvatarV3,
} from "../lib/avatar";
import "./preset-avatar.css";

function presetName(presetId: string) {
  return presetAvatars.find((preset) => preset.id === presetId)?.name ?? "ตัวละครพิกเซล";
}

export function PixelEmployeeAvatar({
  config,
  size = "large",
  mode = "full",
  label,
  onReady,
}: {
  config: AvatarConfig;
  size?: "small" | "large";
  mode?: "full" | "portrait";
  label?: string;
  onReady?: () => void;
  retry?: boolean;
}) {
  const avatar = normalizePresetAvatar(config);
  const name = presetName(avatar.presetId);
  return (
    <span
      className={`preset-avatar preset-avatar-${size} preset-avatar-${mode}`}
      data-avatar={JSON.stringify(avatar)}
      data-ready="true"
      role="img"
      aria-label={label ? `${label} — ${name}` : name}
    >
      <span
        className="preset-avatar-strip"
        style={{ backgroundImage: `url(/avatars/presets/${avatar.presetId}-strip.png)` }}
        onAnimationStart={onReady}
      />
    </span>
  );
}

function PresetThumbnail({ presetId }: { presetId: string }) {
  const number = Number(presetId.slice(-2)) - 1;
  const column = number % 10;
  const row = Math.floor(number / 10);
  return (
    <span
      className="preset-thumbnail"
      style={{ backgroundPosition: `${-column * 82}px ${-row * 92}px` }}
      aria-hidden="true"
    />
  );
}

export function AvatarStudio({
  close,
  onSave,
  initial,
  name,
  busy,
  error = "",
  savedMessage = "",
  onReload,
}: {
  close: () => void;
  onSave: (value: AvatarV3) => void;
  initial: AvatarConfig;
  name: string;
  busy: boolean;
  error?: string;
  savedMessage?: string;
  onReload?: () => void;
}) {
  const saved = normalizePresetAvatar(initial);
  const [selectedId, setSelectedId] = useState(saved.presetId);
  const selected = useMemo(
    () => presetAvatars.find((preset) => preset.id === selectedId) ?? presetAvatars[0],
    [selectedId],
  );
  const value: AvatarV3 = { version: 3, presetId: selected.id };
  const dirty = selected.id !== saved.presetId;

  function randomize() {
    const alternatives = presetAvatars.filter((preset) => preset.id !== selected.id);
    setSelectedId(alternatives[Math.floor(Math.random() * alternatives.length)].id);
  }

  return (
    <section className="preset-picker" aria-label="เลือกตัวละครสำเร็จรูป">
      <header className="preset-picker-intro">
        <div>
          <span>OLE WORK / CHARACTER LIBRARY</span>
          <h3>เลือกตัวละครของ {name}</h3>
          <p>50 ตัวละครพิกเซลพร้อมใช้ กดเลือกแล้วบันทึกได้ทันที</p>
        </div>
        <button type="button" className="preset-random" onClick={randomize} disabled={busy}>
          🎲 สุ่มตัวละคร
        </button>
      </header>

      <div className="preset-picker-body">
        <aside className="preset-selected-card">
          <span className="preset-selected-label">ตัวที่เลือก</span>
          <PixelEmployeeAvatar config={value} label={`ตัวละครของ ${name}`} />
          <strong>{selected.name}</strong>
          <small>{dirty ? "ยังไม่ได้บันทึก" : "กำลังใช้งาน"}</small>
        </aside>

        <div className="preset-grid" role="radiogroup" aria-label="ตัวละครสำเร็จรูป 50 แบบ">
          {presetAvatars.map((preset) => {
            const checked = preset.id === selected.id;
            return (
              <button
                type="button"
                role="radio"
                aria-checked={checked}
                className={checked ? "preset-option selected" : "preset-option"}
                key={preset.id}
                onClick={() => setSelectedId(preset.id)}
                disabled={busy}
              >
                <PresetThumbnail presetId={preset.id} />
                <span>{preset.name}</span>
                {checked && <b aria-hidden="true">✓</b>}
              </button>
            );
          })}
        </div>
      </div>

      <footer className="preset-picker-footer">
        <div className="preset-status" aria-live="polite">
          {error && <p className="preset-error">{error}</p>}
          {savedMessage && <p className="preset-success">{savedMessage}</p>}
          {error && onReload && (
            <button type="button" onClick={onReload}>โหลดข้อมูลล่าสุด</button>
          )}
        </div>
        <div className="preset-actions">
          <button type="button" onClick={close} disabled={busy}>ยกเลิก</button>
          <button
            type="button"
            className="preset-save"
            onClick={() => onSave(value)}
            disabled={busy || !dirty}
          >
            {busy ? "กำลังบันทึก…" : dirty ? "บันทึกตัวละครนี้" : "บันทึกแล้ว"}
          </button>
        </div>
      </footer>
    </section>
  );
}
