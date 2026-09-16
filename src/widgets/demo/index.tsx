// Dev-only demo widgets (SPEC §2) that exercise every path of the widget contract.
import { useState } from "react";
import claudeWorking from "../../assets/claude/claude-fu-transparent.gif";
import { Icon } from "../../shell/Icon";
import { Card, CardLabel } from "../../shell/ui";
import type { WidgetDefinition } from "../../shell/widget-contract";

function DemoCard() {
  const [count, setCount] = useState(0);
  return (
    <Card>
      <CardLabel aside="demo">Card thường</CardLabel>
      <div>Card trong cột xếp chồng.</div>
      <button type="button" onClick={() => setCount((c) => c + 1)} style={{ alignSelf: "flex-start" }}>
        Đã bấm {count} lần
      </button>
    </Card>
  );
}

function DemoPill() {
  return (
    <>
      <Icon name="sparks" size={18} />
      <span>Demo widget</span>
    </>
  );
}

function DemoTall() {
  return (
    <Card grow>
      <CardLabel aside="tall">Card cao</CardLabel>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i}>Dòng {i + 1}</div>
      ))}
    </Card>
  );
}

function DemoClaude() {
  return (
    <Card>
      <CardLabel>Claude demo</CardLabel>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <img src={claudeWorking} alt="" width={28} height={28} />
        <span>Cooking</span>
      </div>
    </Card>
  );
}

function DemoBroken(): never {
  throw new Error("demo widget failure");
}

export const demoWidgets: WidgetDefinition[] = [
  { id: "demo-card", tab: "core", title: "Demo card", description: "Card thường", Card: DemoCard, Pill: DemoPill },
  { id: "demo-broken", tab: "core", title: "Demo lỗi", description: "Luôn lỗi khi render", Card: DemoBroken },
  { id: "demo-tall", tab: "core", title: "Demo tall", description: "Chiếm một cột", Card: DemoTall, layout: { tall: true } },
  { id: "demo-claude", tab: "claude", title: "Demo Claude", description: "Widget ở tab Claude", Card: DemoClaude },
];
