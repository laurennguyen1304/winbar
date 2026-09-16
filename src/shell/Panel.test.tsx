import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoWidgets } from "../widgets/demo";
import { Panel } from "./Panel";
import type { TabId, WidgetDefinition } from "./widget-contract";

function Harness({ widgets, onCollapse = () => {} }: { widgets: WidgetDefinition[]; onCollapse?: () => void }) {
  const [tab, setTab] = useState<TabId>("core");
  return <Panel widgets={widgets} tab={tab} onTabChange={setTab} onCollapse={onCollapse} />;
}

const byId = (...ids: string[]) => ids.map((id) => demoWidgets.find((w) => w.id === id) as WidgetDefinition);

describe("Panel", () => {
  // The broken demo widget logs through React and the boundary; keep test output readable.
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("shows Core and Claude tabs when both have widgets, Core first", () => {
    render(<Harness widgets={demoWidgets} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Core", "Claude"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
  });

  it("hides the Claude tab when no Claude widget is enabled", () => {
    render(<Harness widgets={byId("demo-card", "demo-tall")} />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Core"]);
  });

  it("switches tabs", () => {
    render(<Harness widgets={demoWidgets} />);
    fireEvent.click(screen.getByRole("tab", { name: "Claude" }));
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("Cooking")).toBeInTheDocument();
    expect(within(panel).queryByText("Card thường")).not.toBeInTheDocument();
  });

  it("keeps other widgets working when one widget crashes", () => {
    render(<Harness widgets={demoWidgets} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Widget lỗi");
    expect(screen.getByText("Card thường")).toBeInTheDocument();
    expect(screen.getByText("Card cao")).toBeInTheDocument();
  });

  it("stateful widgets still respond after a sibling crashed", () => {
    render(<Harness widgets={demoWidgets} />);
    fireEvent.click(screen.getByRole("button", { name: "Đã bấm 0 lần" }));
    expect(screen.getByRole("button", { name: "Đã bấm 1 lần" })).toBeInTheDocument();
  });

  it("shows an empty message when the tab has no widgets", () => {
    render(<Harness widgets={[]} />);
    expect(screen.getByText("Chưa bật widget nào trong tab này.")).toBeInTheDocument();
  });

  it("collapses from the header button", () => {
    const onCollapse = vi.fn();
    render(<Harness widgets={[]} onCollapse={onCollapse} />);
    fireEvent.click(screen.getByRole("button", { name: "Thu gọn" }));
    expect(onCollapse).toHaveBeenCalledOnce();
  });
});
