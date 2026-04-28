import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";

export default function Home() {
  const { data: statusData, isLoading } = trpc.chessAI.getStatus.useQuery();

  return (
    <div className="min-h-screen flex flex-col relative items-center justify-center p-6">
      <div className="glow-bloom" />
      <main className="glass-panel p-10 max-w-2xl w-full text-center relative z-10">
        <h1 className="hero-text mb-4 text-6xl">SOFTCURSE SYSTEMS</h1>
        <div className="divider" />
        <h2 className="text-xl font-mono text-[var(--c-cyan-dim)] mb-8 tracking-widest uppercase text-shadow-glow-cyan">
          CREDENTIAL HUNTER VAULT
        </h2>

        <div className="flex flex-col gap-6 text-left mb-10 px-4">
          <div className="flex justify-between border-b border-[var(--c-border)] pb-2 items-center">
            <span className="data-text opacity-50 text-sm tracking-widest uppercase">Network Status</span>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin data-cyan" /> : (
              <span className={`data-text font-bold data-cyan`}>
                OPERATIONAL
              </span>
            )}
          </div>
          <div className="flex justify-between border-b border-[var(--c-border)] pb-2 items-center">
            <span className="data-text opacity-50 text-sm tracking-widest uppercase">Active Node</span>
            <span className="data-text font-bold data-orange" style={{ animation: "pulse-orange 3s infinite" }}>
              {statusData?.currentProvider || 'OFFLINE'}
            </span>
          </div>
        </div>

        <Link href="/admin/keys">
          <button className="bg-[var(--c-surface)] border border-[var(--c-border)] hover:border-[var(--c-cyan)] hover:text-[var(--c-cyan)] text-[var(--c-text)] font-mono tracking-widest px-8 py-3 uppercase transition-all duration-300 w-full shadow-[0_0_10px_rgba(0,255,255,0.0)] hover:shadow-[0_0_15px_rgba(0,255,255,0.3)] cursor-pointer">
            ACCESS ADMIN CORE
          </button>
        </Link>
      </main>
    </div>
  );
}
