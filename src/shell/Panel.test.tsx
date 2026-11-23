import { fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
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

  it("tells the bento how many tall and small tiles it holds, so two tall ones alone take the whole row", () => {
    const tall = (id: string): WidgetDefinition => ({
      id,
      tab: "core",
      title: id,
      description: id,
      layout: { size: "large" },
      Card: () => <span>{id}</span>,
    });
    const { container } = render(<Harness widgets={[tall("a"), tall("b")]} />);
    const bento = container.querySelector("[data-large]");
    expect(bento).toHaveAttribute("data-large", "2");
    expect(bento).toHaveAttribute("data-small", "0");
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

  it("shows a widget's own view in place of the bento, with a way back", () => {
    const onCloseDetail = vi.fn();
    const detail: WidgetDefinition = {
      id: "with-detail",
      tab: "claude",
      title: "Hạn mức",
      description: "",
      Card: () => <p>tile</p>,
      Detail: () => <p>full view</p>,
    };
    render(<Panel widgets={[detail]} onCollapse={() => {}} detail={detail} onCloseDetail={onCloseDetail} />);
    expect(screen.getByText("full view")).toBeInTheDocument();
    expect(screen.queryByText("tile")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Hạn mức/ }));
    expect(onCloseDetail).toHaveBeenCalledOnce();
  });

  describe("zooming one widget", () => {
    const card = (id: string, extra?: () => ReactNode): WidgetDefinition => ({
      id,
      tab: "core",
      title: id,
      description: id,
      Card: () => (
        <div>
          <p>{id} body</p>
          <button type="button">{id} action</button>
          {extra?.()}
        </div>
      ),
    });
    const widgets = [card("alpha"), card("beta"), card("gamma")];

    it("blows a clicked tile up to the whole panel and hides the others", () => {
      const { container } = render(<Harness widgets={widgets} />);
      fireEvent.click(screen.getByText("beta body"));
      expect(screen.getByText("beta body")).toBeInTheDocument();
      expect(screen.queryByText("alpha body")).not.toBeInTheDocument();
      expect(screen.queryByText("gamma body")).not.toBeInTheDocument();
      expect(container.querySelector("[data-focused]")).toHaveAttribute("data-focused", "beta");
    });

    it("does not zoom when the click is on one of the widget's controls", () => {
      render(<Harness widgets={widgets} />);
      fireEvent.click(screen.getByRole("button", { name: "beta action" }));
      expect(screen.getByText("alpha body")).toBeInTheDocument();
    });

    it("does not zoom for something the card marked as its own click", () => {
      const own = card("own", () => <div data-own-click>meters</div>);
      render(<Harness widgets={[own, card("other")]} />);
      fireEvent.click(screen.getByText("meters"));
      expect(screen.getByText("other body")).toBeInTheDocument();
    });

    it("keeps the zoomed tile's state: it is the same card, not a new one", () => {
      const counter: WidgetDefinition = {
        id: "counter",
        tab: "core",
        title: "counter",
        description: "",
        Card: function Counter() {
          const [n, setN] = useState(0);
          return (
            <div>
              <p>counter body</p>
              <button type="button" onClick={() => setN(n + 1)}>{`n=${n}`}</button>
            </div>
          );
        },
      };
      render(<Harness widgets={[counter, card("other")]} />);
      fireEvent.click(screen.getByRole("button", { name: "n=0" }));
      fireEvent.click(screen.getByText("counter body"));
      expect(screen.queryByText("other body")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "n=1" })).toBeInTheDocument();
    });

    it("stays zoomed for clicks inside the zoomed tile", () => {
      render(<Harness widgets={widgets} />);
      fireEvent.click(screen.getByText("beta body"));
      fireEvent.click(screen.getByText("beta body"));
      fireEvent.click(screen.getByRole("button", { name: "beta action" }));
      expect(screen.queryByText("alpha body")).not.toBeInTheDocument();
    });

    it("brings every widget back on a click on bare panel", () => {
      const { container } = render(<Harness widgets={widgets} />);
      fireEvent.click(screen.getByText("beta body"));
      fireEvent.click(container.querySelector("[data-focused]") as Element);
      expect(screen.getByText("alpha body")).toBeInTheDocument();
      expect(screen.getByText("gamma body")).toBeInTheDocument();
      expect(container.querySelector("[data-focused]")).toBeNull();
    });

    it("brings every widget back on a click on the empty header", () => {
      const { container } = render(<Harness widgets={widgets} />);
      fireEvent.click(screen.getByText("beta body"));
      fireEvent.click(container.firstElementChild as Element);
      expect(screen.getByText("alpha body")).toBeInTheDocument();
    });

    it("starts with every widget again once the panel has collapsed and reopened", () => {
      const { unmount } = render(<Harness widgets={widgets} />);
      fireEvent.click(screen.getByText("beta body"));
      unmount();
      render(<Harness widgets={widgets} />);
      expect(screen.getByText("alpha body")).toBeInTheDocument();
    });

    it("falls back to the bento when the zoomed widget goes away", () => {
      const { rerender } = render(<Harness widgets={widgets} />);
      fireEvent.click(screen.getByText("beta body"));
      rerender(<Harness widgets={[widgets[0], widgets[2]]} />);
      expect(screen.getByText("alpha body")).toBeInTheDocument();
      expect(screen.getByText("gamma body")).toBeInTheDocument();
    });
  });
});
