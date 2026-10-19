import { Component, type ReactNode, type ErrorInfo } from "react";
import { withMd3 } from "@/components/md3/Md3Provider";
import type { AppLocale } from "@/config/locales";
import FilterDrawer from "./FilterDrawer";
import FilterTabHandle from "./FilterTabHandle";

interface FilterDrawerHostProps {
  locale: AppLocale;
  pathname: string;
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class FilterErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[FilterDrawerHost] Error rendering filter drawer:", error, info);
  }

  override render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function FilterDrawerHost({ locale, pathname }: FilterDrawerHostProps) {
  return (
    <FilterErrorBoundary>
      <FilterDrawer locale={locale} pathname={pathname} />
      <FilterTabHandle locale={locale} />
    </FilterErrorBoundary>
  );
}

export default withMd3(FilterDrawerHost);
