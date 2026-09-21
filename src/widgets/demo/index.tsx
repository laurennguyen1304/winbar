// Dev-only demo widgets (SPEC §2) that exercise every path of the widget contract.
import { useState } from "react";
import claudeWorking from "../../assets/claude/claude-fu-transparent.gif";
import { Icon } from "../../shell/Icon";
import { Card, CardLabel } from "../../shell/ui";
import { useShell } from "../../shell/shell-context";
import type { SearchProvider, WidgetDefinition } from "../../shell/widget-contract";

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

const twoLines = (title: string, sub: string) => (
  <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
    <b style={{ fontSize: 13, whiteSpace: "nowrap" }}>{title}</b>
    <span style={{ fontSize: 12, color: "var(--text-faint)", fontFamily: "var(--mono)", whiteSpace: "nowrap" }}>
      {sub}
    </span>
  </span>
);

function DemoMidPill() {
  return (
    <>
      <Icon name="sparks" size={28} />
      {twoLines("Demo widget", "pill lớn · nửa trái")}
    </>
  );
}

function DemoClaudeMidPill() {
  return (
    <>
      <img src={claudeWorking} alt="" width={38} height={38} />
      {twoLines("Cooking", "3m 12s · 5h 62%")}
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

/** Alert content with its own action buttons; both answers dismiss the alert. */
function makeApprovalAlert(dismiss: () => void, onAnswer: (answer: string) => void) {
  return function DemoApproval() {
    const answer = (value: string) => {
      onAnswer(value);
      dismiss();
    };
    return (
      <>
        <img src={claudeWorking} alt="" width={22} height={22} />
        <b style={{ whiteSpace: "nowrap" }}>wait for you</b>
        <span style={{ color: "var(--text-faint)", fontFamily: "var(--mono)", fontSize: 12, whiteSpace: "nowrap" }}>
          Bash · git push
        </span>
        <span style={{ flexGrow: 1 }} />
        <button type="button" onClick={() => answer("deny")}>
          Từ chối
        </button>
        <button type="button" onClick={() => answer("allow")}>
          Cho phép
        </button>
      </>
    );
  };
}

function Copied() {
  return (
    <>
      <span style={{ color: "var(--ok)" }}>✓</span>
      <span>Đã copy</span>
    </>
  );
}

// Module-level so the answer survives the card unmounting when the panel collapses.
let lastAnswer = "—";

function DemoAlerts() {
  const shell = useShell();
  const push = (id: string, source: string, priority: number) => {
    shell.alerts.push({
      id,
      source,
      priority,
      Content: makeApprovalAlert(
        () => shell.alerts.dismiss(id),
        (a) => (lastAnswer = `${id}: ${a}`),
      ),
    });
    shell.collapse();
  };
  return (
    <Card>
      <CardLabel aside={`trả lời gần nhất: ${lastAnswer}`}>Cảnh báo</CardLabel>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" onClick={() => push("demo-approval", "demo-claude", 5)}>
          Đẩy cảnh báo Claude (ưu tiên 5)
        </button>
        <button type="button" onClick={() => push("demo-low", "demo-alerts", 1)}>
          Đẩy cảnh báo thường (ưu tiên 1)
        </button>
        <button
          type="button"
          onClick={() => {
            shell.collapse();
            shell.flashPill(Copied);
          }}
        >
          Flash "Đã copy"
        </button>
      </div>
    </Card>
  );
}

const DEMO_ITEMS = [
  { id: "one", title: "Demo một" },
  { id: "two", title: "Demo hai" },
  { id: "three", title: "Demo ba" },
];

/** Command bar source for manual checks: each run is recorded on window.__winbarDemoRuns. */
export const demoSearch: SearchProvider = {
  id: "demo",
  title: "Demo",
  prefix: "demo",
  search: (query) => {
    const record = (entry: string) => {
      const w = window as unknown as { __winbarDemoRuns?: string[] };
      (w.__winbarDemoRuns ??= []).push(entry);
    };
    const q = query.toLowerCase();
    return Promise.resolve(
      DEMO_ITEMS.filter((item) => item.title.toLowerCase().includes(q)).map((item) => ({
        id: item.id,
        title: item.title,
        subtitle: "Nguồn thử của widget demo",
        icon: "sparks",
        verb: "Chạy",
        run: () => record(item.id),
        runAlt: () => record(`${item.id} (Ctrl)`),
      })),
    );
  },
};

function DemoBroken(): never {
  throw new Error("demo widget failure");
}

export const demoWidgets: WidgetDefinition[] = [
  {
    id: "demo-card",
    tab: "core",
    title: "Demo card",
    description: "Card thường",
    Card: DemoCard,
    Pill: DemoPill,
    MidPill: DemoMidPill,
    searchProvider: demoSearch,
  },
  {
    id: "demo-alerts",
    tab: "core",
    title: "Demo cảnh báo",
    description: "Đẩy cảnh báo và flash pill",
    Card: DemoAlerts,
  },
  { id: "demo-broken", tab: "core", title: "Demo lỗi", description: "Luôn lỗi khi render", Card: DemoBroken },
  {
    id: "demo-tall",
    tab: "core",
    title: "Demo tall",
    description: "Chiếm một cột",
    Card: DemoTall,
    layout: { size: "medium" },
  },
  {
    id: "demo-claude",
    tab: "claude",
    title: "Demo Claude",
    description: "Widget ở tab Claude",
    Card: DemoClaude,
    MidPill: DemoClaudeMidPill,
  },
];
