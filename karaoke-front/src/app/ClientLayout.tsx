"use client";

import { usePathname } from "next/navigation";
import { PlayerProvider, usePlayer } from "@/context/PlayerContext";
import GlobalHeader from "@/components/GlobalHeader/GlobalHeader";
import GlobalPlayer from "@/components/GlobalPlayer/GlobalPlayer";
import styles from "./ClientLayout.module.css";

function InnerLayout({ children }: { children: React.ReactNode }) {
  const pathname  = usePathname();
  const { track } = usePlayer();

  const isHome    = pathname === "/";
  const isSong    = pathname.startsWith("/song/");
  const hasPlayer = !!track && !isSong;

  return (
    <>
      {!isHome && <GlobalHeader />}
      <div className={[
        !isHome   ? styles.headerPad : "",
        hasPlayer ? styles.playerPad : "",
      ].filter(Boolean).join(" ") || undefined}>
        {children}
      </div>
      <GlobalPlayer />
    </>
  );
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlayerProvider>
      <InnerLayout>{children}</InnerLayout>
    </PlayerProvider>
  );
}
