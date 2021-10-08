/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PageEntity } from "@logseq/libs/dist/LSPlugin";
import React, { useState } from "react";
import isEqual from 'fast-deep-equal';
import {
  useHoverDirty,
  useMountedState
} from "react-use";
import { version } from "../package.json";
import { ITabInfo } from "./types";

export const useAppVisible = () => {
  const [visible, setVisible] = useState(logseq.isMainUIVisible);
  const isMounted = useMountedState();
  React.useEffect(() => {
    const eventName = "ui:visible:changed";
    const handler = async ({ visible }: { visible: boolean }) => {
      if (isMounted()) {
        setVisible(visible);
      }
    };
    logseq.on(eventName, handler);
    return () => {
      logseq.off(eventName, handler);
    };
  }, [isMounted]);
  return visible;
};

export const useSidebarVisible = () => {
  const [visible, setVisible] = useState(false);
  const isMounted = useMountedState();
  React.useEffect(() => {
    logseq.App.onSidebarVisibleChanged(({ visible }) => {
      if (isMounted()) {
        setVisible(visible);
      }
    });
  }, [isMounted]);
  return visible;
};

export const useThemeMode = () => {
  const isMounted = useMountedState();
  const [mode, setMode] = React.useState<"dark" | "light">("light");
  React.useEffect(() => {
    setMode(
      (top!.document
        .querySelector("html")
        ?.getAttribute("data-theme") as typeof mode) ??
      (matchMedia("prefers-color-scheme: dark").matches ? "dark" : "light")
    );
    return logseq.App.onThemeModeChanged((s) => {
      if (isMounted()) {
        setMode(s.mode);
      }
    });
  }, [isMounted]);

  return mode;
};

export async function getSourcePage(
  pageName?: string | null
): Promise<PageEntity | null> {
  if (!pageName) {
    return null;
  }
  const page = await logseq.Editor.getPage(pageName);

  // @ts-expect-error
  if (page && page.alias?.length > 0) {
    const pages = await logseq.DB.datascriptQuery(`
      [:find (pull ?p [*])
      :where
      [?a :block/name "${page?.name}"]
      [?p :block/alias ?a]]
    `);

    // @ts-expect-error
    const source = pages.flat().find((candidate) =>
      candidate.properties?.alias?.some(
        // @ts-expect-error
        (alias) => alias.toLowerCase() === page?.name
      )
    );
    if (source) {
      return await logseq.Editor.getPage(source.name);
    }
  }
  return page;
}

export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function getKeyId(graph: string) {
  return "logseq-plugin-tabs:" + version + "/" + graph;
}

const readFromLocalStorage = (graph: string): ITabInfo[] | null => {
  const str = localStorage.getItem(getKeyId(graph));
  if (str) {
    try {
      return JSON.parse(str);
    } catch {
      // no ops
    }
  }
  return null;
};

const persistToLocalStorage = (tabs: ITabInfo[], graph: string) => {
  localStorage.setItem(getKeyId(graph), JSON.stringify(tabs));
};

function useCurrentGraph() {
  const [graph, setGraph] = useState<string | null>(null);
  const reset = async () => {
    const g = await logseq.App.getCurrentGraph();
    setGraph(g?.path ?? null);
  };
  React.useEffect(() => {
    reset();
    return logseq.App.onCurrentGraphChanged(() => {
      reset();
    });
  }, []);
  return graph;
}

export function useStoreTabs() {
  const [tabs, setTabs] = React.useState<ITabInfo[]>([]);
  const currentGraph = useCurrentGraph();

  React.useEffect(() => {
    if (currentGraph) {
      const tabs = readFromLocalStorage(currentGraph);
      setTabs(tabs ?? []);
    }
  }, [currentGraph]);

  const userSetTabs = (newTabs: ITabInfo[]) => {
    if (currentGraph && !isEqual(tabs, newTabs)) {
      persistToLocalStorage(newTabs, currentGraph);
      return setTabs(newTabs);
    }
  };

  return [tabs, userSetTabs] as const;
}

export function useAdaptMainUIStyle(show: boolean, tabsWidth?: number | null) {
  const docRef = React.useRef(document.documentElement);
  const isHovering = useHoverDirty(docRef);
  React.useEffect(() => {
    logseq.showMainUI(); // always on
    const listener = () => {
      const leftHeader = top!.document.querySelector(
        "#left-container .cp__header"
      );
      if (leftHeader) {
        const {
          bottom: topOffset,
          width,
          left,
        } = leftHeader.getBoundingClientRect();
        const maxWidth = width - 10;
        logseq.setMainUIInlineStyle({
          zIndex: 9,
          userSelect: "none",
          position: "fixed",
          left: left + "px",
          top: `${topOffset + 2}px`,
          height: show ? "28px" : "0px",
          width: isHovering ? "100%" : tabsWidth + "px", // 10 is the width of the scrollbar
          maxWidth: maxWidth + "px",
        });
      }
    };
    listener();
    const ob = new ResizeObserver(listener);
    ob.observe(top!.document.querySelector("#left-container #main-content")!);
    return () => {
      ob.disconnect();
    };
  }, [show, tabsWidth, isHovering]);
}

export const isMac = () => {
  return navigator.userAgent.includes("Mac");
};

export function useEventCallback<T extends (...args: any[]) => any>(fn: T): T {
  const ref: any = React.useRef();

  // we copy a ref to the callback scoped to the current state/props on each render
  React.useLayoutEffect(() => {
    ref.current = fn;
  });

  return React.useCallback(
    (...args: any[]) => ref.current.apply(void 0, args),
    []
  ) as T;
}

export const useScrollWidth = <T extends HTMLElement>(
  ref: React.RefObject<T>
) => {
  const [scrollWidth, setScrollWidth] = React.useState<number>();
  React.useEffect(() => {
    const update = () => setScrollWidth(ref.current?.scrollWidth || 0);
    const mo = new MutationObserver(() => {
      // Run multiple times to take animation into account, hacky...
      update();
      setTimeout(update, 100);
      setTimeout(update, 200);
      setTimeout(update, 300);
    });
    if (ref.current) {
      setScrollWidth(ref.current.scrollWidth || 0);
      mo.observe(ref.current, {
        childList: true,
        subtree: true,
        attributes: true,
      });
    }
    return () => mo.disconnect();
  }, [ref]);
  return scrollWidth;
};

export const mainContainerScroll = (scrollOptions: ScrollToOptions) => {
  top?.document.querySelector("#main-container")?.scrollTo(scrollOptions);
};

export const isBlock = (t: ITabInfo) => {
  return Boolean(t.page);
};

export const usePreventFocus = () => {
  React.useEffect(() => {
    let timer = 0;
    const listener = () => {
      setTimeout(() => {
        if (window.document.hasFocus()) {
          (top as any).focus();
        }
      });
    };
    timer = setInterval(listener, 1000);
    window.addEventListener('focus', listener);
    return () => {
      window.removeEventListener('focus', listener);
      clearInterval(timer);
    };
  })
}

export function useDebounceFn<T extends (...args: any[]) => any>(fn: T, delay: number) {
  const [timer, setTimer] = React.useState<number | null>(null);
  const debounced = useEventCallback((...args: any[]) => {
    if (timer) {
      clearTimeout(timer);
    }
    setTimeout(() => {
      fn(...args);
      setTimer(null);
    }, delay);
  }) as (...args: Parameters<T>) => void;
  return debounced;
}
