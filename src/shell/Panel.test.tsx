import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoWidgets } from "../widgets/demo";
import { Panel } from "./Panel";
import type { WidgetDefinition } from "./widget-contract";

function Harness({ widgets, onCollapse = () => {} }: { widgets: WidgetDefinition[]; onCollapse?: () => void }) {
  return <Panel widgets={widgets} onCollapse={onCollapse} />;
}

const byId = (...ids: string[]) => ids.map((id) => demoWidgets.find((w) => w.id === id) as WidgetDefinition);
const tileOf = (text: string) => screen.getByText(text).closest("[data-tile]");

describe("Panel", () => {
  // The broken demo widget logs through React and the boundary; keep test output readable.
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("shows every widget at once, with no tabs to hide half of them", () => {
    render(<Harness widgets={demoWidgets} />);
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    // A Core widget and a Claude one, side by side rather than one click apart.
    expect(screen.getByText("Card thường")).toBeInTheDocument();
    expect(screen.getByText("Cooking")).toBeInTheDocument();
  });

  it("gives each widget the tile its size asked for", () => {
    render(<Harness widgets={byId("demo-card", "demo-tall")} />);
    // demo-tall is the medium one, so it gets its own full-width row; the plain card is a small cell.
    expect(tileOf("Card cao")).toHaveAttribute("data-tile", "medium");
    expect(tileOf("Card thường")).toHaveAttribute("data-tile", "small");
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

  it("shows an empty message when nothing is enabled", () => {
    render(<Harness widgets={[]} />);
    expect(screen.getByText("Chưa bật widget nào.")).toBeInTheDocument();
  });

  it("collapses from the header button", () => {
    const onCollapse = vi.fn();
    render(<Harness widgets={[]} onCollapse={onCollapse} />);
    fireEvent.click(screen.getByRole("button", { name: "Thu gọn" }));
    expect(onCollapse).toHaveBeenCalledOnce();
  });
});
