import { Button } from "@/components/ui/button";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  const handleGoHome = () => {
    setLocation("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative">
      <div className="glow-bloom" />
      <div className="glass-panel p-10 max-w-md w-full text-center relative z-10 border-[var(--c-magenta)] shadow-[0_0_30px_rgba(255,0,255,0.15)]">
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="absolute inset-0 bg-[var(--c-magenta)] rounded-full animate-pulse opacity-20" />
            <AlertCircle className="relative h-16 w-16 text-[var(--c-magenta)] drop-shadow-[0_0_10px_rgba(255,0,255,0.8)]" />
          </div>
        </div>

        <h1 className="hero-text text-6xl text-[var(--c-magenta)] mb-2 text-shadow-glow-magenta">404</h1>

        <h2 className="data-text text-xl font-bold text-[var(--c-text)] mb-4 tracking-widest uppercase">
          DEAD END DETECTED
        </h2>

        <p className="data-text text-[var(--c-cyan-dim)] mb-8 leading-relaxed uppercase space-y-2">
          <span className="block">CRITICAL NAVIGATION ERROR</span>
          <span className="block text-xs mt-2 border-t border-[var(--c-border)] pt-2 line-through opacity-70">The requested endpoint is missing from the grid structure.</span>
        </p>

        <div className="flex flex-col gap-3 justify-center">
          <Button
            onClick={handleGoHome}
            className="w-full bg-[var(--c-magenta)] text-white hover:bg-[#ff4dff] hover:shadow-[0_0_15px_rgba(255,0,255,0.4)] tracking-widest uppercase font-mono transition-all duration-300 border border-transparent"
          >
            <Home className="w-4 h-4 mr-2" />
            RETURN TO BASE
          </Button>
        </div>
      </div>
    </div>
  );
}
