import { Component, type ReactNode } from "react";
import { Card, CardLabel } from "./ui";

interface Props {
  title: string;
  children: ReactNode;
  /** Shown instead of the default error card (e.g. inside the pill). */
  fallback?: ReactNode;
}

/** A widget that throws while rendering shows an error card; the rest of the notch keeps working (SPEC §6). */
export class WidgetBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`widget "${this.props.title}" crashed`, error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return (
      <Card>
        <CardLabel>{this.props.title}</CardLabel>
        <div role="alert" style={{ color: "var(--text-faint)" }}>
          Widget lỗi, các widget khác vẫn chạy.
        </div>
      </Card>
    );
  }
}
