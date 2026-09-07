import type { DesktopApi } from "./types";

declare global {
interface Window {
    tomatoDesktop?: DesktopApi;
  }
}

export {};
