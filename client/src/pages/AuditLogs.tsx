import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Loader2, Activity, Link as LinkIcon } from "lucide-react";
import { Link } from "wouter";

export default function AuditLogs() {
    const { user, isAuthenticated } = useAuth();
    const { data: logs, isLoading } = trpc.chessAI.getAuditLogs.useQuery(undefined, {
        enabled: isAuthenticated && user?.role === "admin",
    });

    if (!isAuthenticated || user?.role !== "admin") {
        return (
            <div className="min-h-screen flex items-center justify-center p-6 relative">
                <div className="glow-bloom" />
                <div className="glass-panel p-10 max-w-md w-full text-center relative z-10 border-[var(--c-magenta)]">
                    <h1 className="hero-text text-[var(--c-magenta)] text-shadow-glow-magenta">ACCESS DENIED</h1>
                    <div className="divider" />
                    <p className="data-text data-magenta mb-4">RESTRICTED: SYS_ADMIN_ONLY</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-8 relative">
            <div className="glow-bloom" />
            <div className="max-w-6xl mx-auto space-y-8 relative z-10">
                <div className="glass-panel p-6 flex justify-between items-center">
                    <div>
                        <h1 className="hero-text text-4xl mb-2 flex items-center gap-3">
                            <span className="decorator"></span>AUDIT LOGS <Activity className="data-cyan" size={32} />
                        </h1>
                        <p className="data-text font-mono text-[var(--c-cyan-dim)] text-sm tracking-widest uppercase">
                            SYSTEM-WIDE TELEMETRY AND METRICS
                        </p>
                    </div>
                    <Link href="/admin/keys">
                        <a className="data-text text-[var(--c-cyan)] border border-[var(--c-cyan)] px-4 py-2 hover:bg-[var(--c-cyan)] hover:text-black transition-colors duration-300 uppercase tracking-widest text-xs flex items-center gap-2">
                            <LinkIcon size={14} /> SYSTEM DASHBOARD
                        </a>
                    </Link>
                </div>

                <div className="glass-panel p-6">
                    <h2 className="data-text data-cyan mb-4 tracking-widest uppercase border-b border-[var(--c-border)] pb-2 flex justify-between items-center">
                        <span><span className="decorator"></span>CHRONOLOGICAL ACTIVITY TRACE</span>
                    </h2>

                    {isLoading ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="animate-spin text-[var(--c-cyan)] w-8 h-8" />
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {logs?.map((log) => (
                                <div key={log.id} className="grid grid-cols-12 gap-4 border-b border-[#111] py-3 data-text text-sm hover:bg-[#050810] transition-colors duration-200">
                                    <div className="col-span-3 text-[var(--c-cyan-dim)]">
                                        {new Date(log.createdAt).toLocaleString()}
                                    </div>
                                    <div className="col-span-3 text-[var(--c-magenta)] uppercase tracking-widest font-bold text-xs">
                                        [{log.eventType}]
                                    </div>
                                    <div className="col-span-2 text-[var(--c-orange)] uppercase">
                                        {log.provider || "-"}
                                    </div>
                                    <div className="col-span-4 font-mono truncate text-[var(--c-text)]">
                                        {log.details ? log.details : "-"}
                                    </div>
                                </div>
                            ))}
                            {logs?.length === 0 && (
                                <div className="py-8 text-center data-text text-[var(--c-cyan-dim)]">
                                    NO TELEMETRY RECORDED YET.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
