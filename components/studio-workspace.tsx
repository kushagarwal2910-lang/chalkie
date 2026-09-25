"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { Group, Panel, Separator, useGroupRef, type Layout, type LayoutChangedMeta } from "react-resizable-panels";

export type WorkspacePanel = "sources" | "canvas" | "studio";

export interface StudioWorkspaceProps {
  sources: ReactNode;
  canvas: ReactNode;
  guide: ReactNode;
  activePanel: WorkspacePanel;
  sourcesOpen: boolean;
  guideOpen: boolean;
}

const DESKTOP_QUERY = "(min-width: 1100px)";
const INITIAL_LAYOUT: Layout = { sources: 0, canvas: 100, studio: 0 };

function subscribeToDesktop(onChange: () => void) {
  const media = window.matchMedia(DESKTOP_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getDesktopSnapshot() {
  return window.matchMedia(DESKTOP_QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

/** Keep the editor in the same React subtree while changing the visible panels. */
export function StudioWorkspace({ sources, canvas, guide, activePanel, sourcesOpen, guideOpen }: StudioWorkspaceProps) {
  const isDesktop = useSyncExternalStore(subscribeToDesktop, getDesktopSnapshot, getServerSnapshot);
  const groupRef = useGroupRef();
  const desktopSizes = useRef({ sources: 22, studio: 26 });
  const visibleSources = isDesktop ? sourcesOpen : activePanel === "sources";
  const visibleCanvas = isDesktop || activePanel === "canvas";
  const visibleGuide = isDesktop ? guideOpen : activePanel === "studio";

  // Mobile tab changes must not reset a desktop resize, and desktop toggle
  // changes must not reset the selected mobile tab.
  const layoutMode = isDesktop
    ? `desktop:${sourcesOpen}:${guideOpen}`
    : `mobile:${activePanel}`;

  useEffect(() => {
    // Panel constraints register after render. Apply the requested layout after
    // those constraints are current, without writing it back into user sizes.
    const frame = requestAnimationFrame(() => {
      const [, sourceOrTab, guideState] = layoutMode.split(":");
      if (layoutMode.startsWith("desktop:")) {
        const sourceSize = sourceOrTab === "true" ? desktopSizes.current.sources : 0;
        const guideSize = guideState === "true" ? desktopSizes.current.studio : 0;
        groupRef.current?.setLayout({ sources: sourceSize, canvas: 100 - sourceSize - guideSize, studio: guideSize });
      } else {
        groupRef.current?.setLayout({
          sources: sourceOrTab === "sources" ? 100 : 0,
          canvas: sourceOrTab === "canvas" ? 100 : 0,
          studio: sourceOrTab === "studio" ? 100 : 0,
        });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [groupRef, layoutMode]);

  const rememberDesktopSizes = useCallback((layout: Layout, meta: LayoutChangedMeta) => {
    if (!isDesktop || !meta.isUserInteraction) return;
    if (sourcesOpen && Number.isFinite(layout.sources) && layout.sources > 0) {
      desktopSizes.current.sources = layout.sources;
    }
    if (guideOpen && Number.isFinite(layout.studio) && layout.studio > 0) {
      desktopSizes.current.studio = layout.studio;
    }
  }, [guideOpen, isDesktop, sourcesOpen]);

  const separatorClass = "studio-workspace-separator relative flex shrink-0 items-center justify-center rounded-full outline-none transition-colors hover:bg-white/10 focus-visible:bg-[#c4b5fd]/20 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#c4b5fd]";

  return (
    <Group
      id="studio-workspace"
      groupRef={groupRef}
      defaultLayout={INITIAL_LAYOUT}
      orientation="horizontal"
      disabled={!isDesktop}
      onLayoutChanged={rememberDesktopSizes}
      resizeTargetMinimumSize={{ coarse: 24, fine: 12 }}
      className="studio-panel-group h-full min-h-0 w-full min-w-0"
      style={{ overflow: "hidden" }}
      data-workspace-mode={isDesktop ? "desktop" : "mobile"}
      data-active-panel={activePanel}
    >
      <Panel
        key="sources"
        id="sources"
        minSize={isDesktop && sourcesOpen ? 210 : 0}
        maxSize={visibleSources ? (isDesktop ? "35%" : "100%") : 0}
        className="h-full min-h-0 min-w-0"
        style={{ overflow: "hidden" }}
      >
        <div id="workspace-sources" className="h-full min-h-0 min-w-0" inert={!visibleSources} aria-hidden={!visibleSources} style={{ visibility: visibleSources ? "visible" : "hidden" }}>
          {sources}
        </div>
      </Panel>
      {/* Disabled, zero-width Separators still calculate ARIA resize ranges in
          the panel library. Do not register them for hidden/mobile panels. */}
      {isDesktop && sourcesOpen && <Separator
        key="sources-resizer"
        aria-label="Resize sources and canvas panels"
        className={separatorClass}
        style={{ width: 8 }}
      >
        <span aria-hidden="true" className="h-9 w-px rounded-full bg-white/15" />
      </Separator>}
      <Panel
        key="canvas"
        id="canvas"
        minSize={isDesktop ? 360 : 0}
        maxSize={visibleCanvas ? "100%" : 0}
        className="h-full min-h-0 min-w-0"
        style={{ overflow: "hidden" }}
      >
        <div id="workspace-canvas" className="h-full min-h-0 min-w-0" inert={!visibleCanvas} aria-hidden={!visibleCanvas} style={{ visibility: visibleCanvas ? "visible" : "hidden" }}>
          {canvas}
        </div>
      </Panel>
      {isDesktop && guideOpen && <Separator
        key="studio-resizer"
        aria-label="Resize canvas and studio panels"
        className={separatorClass}
        style={{ width: 8 }}
      >
        <span aria-hidden="true" className="h-9 w-px rounded-full bg-white/15" />
      </Separator>}
      <Panel
        key="studio"
        id="studio"
        minSize={isDesktop && guideOpen ? 260 : 0}
        maxSize={visibleGuide ? (isDesktop ? "40%" : "100%") : 0}
        className="h-full min-h-0 min-w-0"
        style={{ overflow: "hidden" }}
      >
        <div id="workspace-studio" className="h-full min-h-0 min-w-0" inert={!visibleGuide} aria-hidden={!visibleGuide} style={{ visibility: visibleGuide ? "visible" : "hidden" }}>
          {guide}
        </div>
      </Panel>
    </Group>
  );
}
